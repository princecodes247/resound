use std::{
  collections::HashMap,
  sync::{LazyLock, Mutex},
};

use axum::extract::{
    ws::{Message as WsMessage, WebSocket, WebSocketUpgrade},
  };
use mdns_sd::ServiceDaemon;
use serde::Serialize;
use tokio::sync::RwLock;

use futures_util::sink::SinkExt;
use futures_util::stream::StreamExt;

pub(crate) const SERVICE_TYPE: &str = "_resound-audio._tcp.local.";
pub(crate) const WS_PATH: &str = "/ws";

mod commands;

#[derive(Debug, Clone, Serialize)]
pub(crate) struct DiscoveredHost {
  pub(crate) name: String,
  pub(crate) ip: String,
  pub(crate) port: u16,
  pub(crate) session_id: String,
}

#[derive(Debug, Clone)]
struct HostConn {
  _client_id: String,
  tx: tokio::sync::mpsc::UnboundedSender<WsMessage>,
}

#[derive(Debug, Clone)]
struct ReceiverConn {
  _client_id: String,
  tx: tokio::sync::mpsc::UnboundedSender<WsMessage>,
}

#[allow(dead_code)]
pub(crate) struct AudioStream(pub(crate) cpal::Stream);
// Safety: cpal::Stream is Send/Sync on most platforms.
unsafe impl Send for AudioStream {}
unsafe impl Sync for AudioStream {}

#[derive(Default)]
pub(crate) struct RoutingState {
  pub(crate) hosts: HashMap<String, HostConn>,
  pub(crate) receivers: HashMap<String, ReceiverConn>,
  pub(crate) audio_stream: Option<AudioStream>,
}

fn receiver_key(session_id: &str, receiver_id: &str) -> String {
  format!("{session_id}:{receiver_id}")
}


pub(crate) static SIGNALING_STATE: LazyLock<RwLock<RoutingState>> = LazyLock::new(|| RwLock::new(RoutingState::default()));
pub(crate) static STARTED_SESSION_ID: LazyLock<Mutex<Option<String>>> = LazyLock::new(|| Mutex::new(None));
pub(crate) static MDNS_DAEMON: LazyLock<Mutex<Option<ServiceDaemon>>> = LazyLock::new(|| Mutex::new(None));


pub async fn broadcast_audio_packet(packet: Vec<u8>) {
  let state = SIGNALING_STATE.read().await;
  for receiver in state.receivers.values() {
    let _ = receiver.tx.send(WsMessage::Binary(packet.clone()));
  }
}

pub fn start_native_audio_capture(device_name: Option<String>) -> Result<cpal::Stream, String> {
  use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
  let host = cpal::default_host();
  let device = if let Some(name) = device_name {
    host.input_devices()
      .map_err(|e| e.to_string())?
      .find(|d| d.name().ok().as_deref() == Some(&name))
      .ok_or_else(|| format!("Device not found: {name}"))?
  } else {
    host.default_input_device().ok_or("No default input device found")?
  };

  let config = device.default_input_config().map_err(|e| e.to_string())?;
  let _sample_rate = config.sample_rate().0;
  let channels = config.channels();

  let handle = tokio::runtime::Handle::current();

  let stream = device.build_input_stream(
    &config.into(),
    move |data: &[f32], _: &cpal::InputCallbackInfo| {
      // Send raw f32 samples as binary. 
      // To save bandwidth, we only send the first channel (mono).
      let mut pcm = Vec::with_capacity(data.len() / channels as usize * 4);
      for chunk in data.chunks(channels as usize) {
        let sample = chunk[0];
        pcm.extend_from_slice(&sample.to_le_bytes());
      }
      
      let packet = pcm;
      handle.spawn(async move {
        broadcast_audio_packet(packet).await;
      });
    },
    |err| log::error!("Audio stream error: {err}"),
    None,
  ).map_err(|e| e.to_string())?;



  stream.play().map_err(|e| e.to_string())?;
  Ok(stream)
}
async fn websocket_handler(ws: WebSocketUpgrade) -> impl axum::response::IntoResponse {
  ws.on_upgrade(move |socket| async move {
    handle_ws_socket(socket).await;
  })
}

async fn handle_ws_socket(socket: WebSocket) {
  let (mut sender, mut receiver) = socket.split();
  let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<WsMessage>();

  // writer task
  tokio::spawn(async move {
    while let Some(msg) = rx.recv().await {
      if sender.send(msg).await.is_err() {
        break;
      }
    }
  });

  let mut my_role: Option<String> = None;
  let mut my_session_id: Option<String> = None;
  let mut my_client_id: Option<String> = None;

  while let Some(Ok(msg)) = receiver.next().await {
    // Handle binary (audio) if any, though usually Rust sends binary to JS, 
    // and JS only sends Text for signaling.
    if let WsMessage::Binary(_bin) = msg {
      continue;
    }

    let WsMessage::Text(text) = msg else { continue };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) else { continue };

    let typ = value.get("type").and_then(|v| v.as_str()).unwrap_or_default();

    if typ == "register" {
      let session_id = value.get("sessionId").and_then(|v| v.as_str()).unwrap_or_default().to_string();
      let role = value.get("role").and_then(|v| v.as_str()).unwrap_or_default().to_string();
      let client_id = value.get("clientId").and_then(|v| v.as_str()).unwrap_or_default().to_string();

      my_role = Some(role.clone());
      my_session_id = Some(session_id.clone());
      my_client_id = Some(client_id.clone());

      let mut state = SIGNALING_STATE.write().await;
      if role == "host" {
        state.hosts.insert(session_id, HostConn { _client_id: client_id, tx: tx.clone() });
      } else if role == "receiver" {
        let key = receiver_key(&session_id, &client_id);
        state.receivers.insert(key, ReceiverConn { _client_id: client_id, tx: tx.clone() });
      }
      continue;
    }

    match typ {
      "offer" => {
        let session_id = value.get("sessionId").and_then(|v| v.as_str()).unwrap_or_default();
        let _receiver_id = value.get("from").and_then(|v| v.as_str()).unwrap_or_default();
        let state = SIGNALING_STATE.read().await;
        if let Some(host_conn) = state.hosts.get(session_id) {
          let _ = host_conn.tx.send(WsMessage::Text(text));
        }
      }
      "answer" => {
        let session_id = value.get("sessionId").and_then(|v| v.as_str()).unwrap_or_default();
        let receiver_id = value.get("to").and_then(|v| v.as_str()).unwrap_or_default();
        let state = SIGNALING_STATE.read().await;
        let key = receiver_key(session_id, receiver_id);
        if let Some(receiver_conn) = state.receivers.get(&key) {
          let _ = receiver_conn.tx.send(WsMessage::Text(text));
        }
      }
      "ice" => {
        let session_id = value.get("sessionId").and_then(|v| v.as_str()).unwrap_or_default();
        let maybe_to = value.get("to").and_then(|v| v.as_str()).unwrap_or_default().to_string();
        let maybe_from = value.get("from").and_then(|v| v.as_str()).unwrap_or_default().to_string();

        let state = SIGNALING_STATE.read().await;
        if !maybe_to.is_empty() {
          let key = receiver_key(session_id, &maybe_to);
          if let Some(receiver_conn) = state.receivers.get(&key) {
            let _ = receiver_conn.tx.send(WsMessage::Text(text));
          }
        } else if !maybe_from.is_empty() {
          if let Some(host_conn) = state.hosts.get(session_id) {
            let _ = host_conn.tx.send(WsMessage::Text(text));
          }
        }
      }
      _ => {}
    }
  }

  // Cleanup on disconnect
  if let (Some(role), Some(session_id), Some(client_id)) = (my_role, my_session_id, my_client_id) {
    let mut state = SIGNALING_STATE.write().await;
    if role == "host" {
      state.hosts.remove(&session_id);
    } else {
      let key = receiver_key(&session_id, &client_id);
      state.receivers.remove(&key);
    }
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      commands::start_host,
      commands::discover_hosts,
      commands::list_audio_devices
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}


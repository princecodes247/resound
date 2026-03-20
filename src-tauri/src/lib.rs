use std::{
  collections::{HashMap, HashSet},
  net::IpAddr,
  sync::{LazyLock, Mutex},
  time::{Duration, Instant},
};

use axum::{
  extract::{
    ws::{Message as WsMessage, WebSocket, WebSocketUpgrade},
    State,
  },
  routing::get,
  Router,
};
use mdns_sd::{ResolvedService, ServiceDaemon, ServiceEvent, ServiceInfo};
use serde::{Deserialize, Serialize};
use tauri::Manager;
use tokio::sync::RwLock;

use futures_util::sink::SinkExt;
use futures_util::stream::StreamExt;

const SERVICE_TYPE: &str = "_resound-audio._tcp.local.";
const WS_PATH: &str = "/ws";

mod commands;

#[derive(Debug, Clone, Serialize)]
struct DiscoveredHost {
  name: String,
  ip: String,
  port: u16,
  session_id: String,
}

#[derive(Debug, Clone)]
struct HostConn {
  client_id: String,
  tx: tokio::sync::mpsc::UnboundedSender<WsMessage>,
}

#[derive(Debug, Clone)]
struct ReceiverConn {
  client_id: String,
  tx: tokio::sync::mpsc::UnboundedSender<WsMessage>,
}

struct AudioStream(cpal::Stream);
// Safety: cpal::Stream is Send/Sync on most platforms.
unsafe impl Send for AudioStream {}
unsafe impl Sync for AudioStream {}

#[derive(Default)]
struct RoutingState {
  hosts: HashMap<String, HostConn>,
  receivers: HashMap<String, ReceiverConn>,
  audio_stream: Option<cpal::Stream>,
}

fn receiver_key(session_id: &str, receiver_id: &str) -> String {
  format!("{session_id}:{receiver_id}")
}

static SIGNALING_STATE: LazyLock<RwLock<RoutingState>> = LazyLock::new(|| RwLock::new(RoutingState::default()));
static STARTED_SESSION_ID: LazyLock<Mutex<Option<String>>> = LazyLock::new(|| Mutex::new(None));
static MDNS_DAEMON: LazyLock<Mutex<Option<ServiceDaemon>>> = LazyLock::new(|| Mutex::new(None));

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
  let sample_rate = config.sample_rate().0;
  let channels = config.channels();

  let config = device.default_input_config().map_err(|e| e.to_string())?;
  let channels = config.channels();

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
      tokio::spawn(async move {
        broadcast_audio_packet(packet).await;
      });
    },
    |err| log::error!("Audio stream error: {err}"),
    None,
  ).map_err(|e| e.to_string())?;


  stream.play().map_err(|e| e.to_string())?;
  Ok(stream)
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


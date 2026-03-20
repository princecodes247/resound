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

#[derive(Debug, Default)]
struct RoutingState {
  // session_id -> host connection
  hosts: HashMap<String, HostConn>,
  // (session_id:receiver_id) -> receiver connection
  receivers: HashMap<String, ReceiverConn>,
}

fn receiver_key(session_id: &str, receiver_id: &str) -> String {
  format!("{session_id}:{receiver_id}")
}

static SIGNALING_STATE: LazyLock<RwLock<RoutingState>> = LazyLock::new(|| RwLock::new(RoutingState::default()));
static STARTED_SESSION_ID: LazyLock<Mutex<Option<String>>> = LazyLock::new(|| Mutex::new(None));
static MDNS_DAEMON: LazyLock<Mutex<Option<ServiceDaemon>>> = LazyLock::new(|| Mutex::new(None));

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
        state.hosts.insert(session_id, HostConn { client_id, tx: tx.clone() });
      } else if role == "receiver" {
        let key = receiver_key(&value["sessionId"].as_str().unwrap_or_default(), &client_id);
        state.receivers.insert(key, ReceiverConn { client_id, tx: tx.clone() });
      }

      // No extra server reply for now.
      continue;
    }

    match typ {
      "offer" => {
        // receiver -> host
        let session_id = value.get("sessionId").and_then(|v| v.as_str()).unwrap_or_default();
        let receiver_id = value.get("from").and_then(|v| v.as_str()).unwrap_or_default();
        if session_id.is_empty() || receiver_id.is_empty() {
          continue;
        }

        let state = SIGNALING_STATE.read().await;
        let Some(host_conn) = state.hosts.get(session_id) else { continue };

        let outgoing = serde_json::json!({
          "type": "offer",
          "sessionId": session_id,
          "from": receiver_id,
          "offer": value.get("offer"),
        });
        let _ = host_conn.tx.send(WsMessage::Text(outgoing.to_string()));
      }
      "answer" => {
        // host -> receiver
        let session_id = value.get("sessionId").and_then(|v| v.as_str()).unwrap_or_default();
        let receiver_id = value.get("to").and_then(|v| v.as_str()).unwrap_or_default();
        if session_id.is_empty() || receiver_id.is_empty() {
          continue;
        }

        let state = SIGNALING_STATE.read().await;
        let key = receiver_key(session_id, receiver_id);
        let Some(receiver_conn) = state.receivers.get(&key) else { continue };

        let outgoing = serde_json::json!({
          "type": "answer",
          "sessionId": session_id,
          "to": receiver_id,
          "answer": value.get("answer"),
        });
        let _ = receiver_conn.tx.send(WsMessage::Text(outgoing.to_string()));
      }
      "ice" => {
        // ambiguous direction:
        // - receiver->host contains `from`
        // - host->receiver contains `to`
        let session_id = value.get("sessionId").and_then(|v| v.as_str()).unwrap_or_default();

        let maybe_to = value.get("to").and_then(|v| v.as_str()).unwrap_or_default().to_string();
        let maybe_from = value.get("from").and_then(|v| v.as_str()).unwrap_or_default().to_string();

        if !maybe_to.is_empty() {
          let receiver_id = maybe_to;
          let state = SIGNALING_STATE.read().await;
          let key = receiver_key(session_id, &receiver_id);
          let Some(receiver_conn) = state.receivers.get(&key) else { continue };

          let outgoing = serde_json::json!({
            "type": "ice",
            "sessionId": session_id,
            "to": receiver_id,
            "candidate": value.get("candidate"),
          });
          let _ = receiver_conn.tx.send(WsMessage::Text(outgoing.to_string()));
        } else if !maybe_from.is_empty() {
          let receiver_id = maybe_from;
          let state = SIGNALING_STATE.read().await;
          let Some(host_conn) = state.hosts.get(session_id) else { continue };

          let outgoing = serde_json::json!({
            "type": "ice",
            "sessionId": session_id,
            "from": receiver_id,
            "candidate": value.get("candidate"),
          });
          let _ = host_conn.tx.send(WsMessage::Text(outgoing.to_string()));
        }
      }
      _ => {}
    }
  }

  // Connection dropped; routing cleanup isn't strictly required for MVP.
  // A future improvement would be to remove entries from `SIGNALING_STATE`.
  let _ = (my_role, my_session_id, my_client_id);
  let _ = tx;
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![commands::start_host, commands::discover_hosts])
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

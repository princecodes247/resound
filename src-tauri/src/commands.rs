use std::{
  collections::HashMap,
  net::IpAddr,
  time::{Duration, Instant},
};

use axum::{routing::get, Router};
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use tokio::net::TcpListener;

use cpal::traits::{DeviceTrait, HostTrait};
use super::{AudioStream, DiscoveredHost, MDNS_DAEMON, SERVICE_TYPE, SIGNALING_STATE, STARTED_SESSION_ID, WS_PATH, websocket_handler};

const WS_SCHEME_PORT_FALLBACK: u16 = 0;

#[tauri::command]
pub fn list_audio_devices() -> Result<Vec<String>, String> {
  let host = cpal::default_host();
  let devices = host.input_devices().map_err(|e| e.to_string())?;
  let names = devices
    .into_iter()
    .filter_map(|d| d.name().ok())
    .collect();
  Ok(names)
}

#[tauri::command]
pub async fn start_host(session_id: String, device_name: Option<String>) -> Result<u16, String> {
  // Keep session id stable for this app instance.
  {
    let mut guard = STARTED_SESSION_ID.lock().unwrap();
    if let Some(existing) = guard.as_ref() {
      if existing != &session_id {
        return Err(format!("Host already started with different session_id: {existing}"));
      }
    }
    if guard.is_none() {
      *guard = Some(session_id.clone());
    }
  }

  // 1) Start native audio capture if a device is provided (or use default)
  let wrapped_stream = {
    let stream = super::start_native_audio_capture(device_name)?;
    AudioStream(stream)
  };
  SIGNALING_STATE.write().await.audio_stream = Some(wrapped_stream);


  // 2) Start websocket signaling server (random port) and return the chosen port.
  let listener = TcpListener::bind(("0.0.0.0", 0))
    .await
    .map_err(|e| format!("Failed to bind websocket port: {e}"))?;
  let signaling_port = listener.local_addr().map_err(|e| e.to_string())?.port();

  tokio::spawn(async move {
    let app = Router::new().route(WS_PATH, get(websocket_handler));
    if let Err(e) = axum::serve(listener, app).await {
      log::error!("WebSocket server error: {e}");
    }
  });

  // 3) Start mDNS responder advertising this session id.

  let ip = local_ip_address::local_ip().map_err(|e| format!("Failed to get local IP: {e}"))?;
  let ip_v4: Option<IpAddr> = match ip {
    IpAddr::V4(_) => Some(ip),
    IpAddr::V6(_) => None,
  };
  let ip = ip_v4.unwrap_or(IpAddr::from([127, 0, 0, 1]));

  let short_name = session_id
    .chars()
    .take(8)
    .collect::<String>()
    .replace('-', "");

  let host_name = format!("resound-host-{short_name}.local.");

  let mut properties: HashMap<String, String> = HashMap::new();
  properties.insert("sid".to_string(), session_id.clone());

  let service_info = ServiceInfo::new(
    SERVICE_TYPE,
    &short_name,
    &host_name,
    ip,
    signaling_port.max(WS_SCHEME_PORT_FALLBACK),
    properties,
  )
  .map_err(|e| format!("Failed to build mDNS service: {e}"))?;

  let daemon = ServiceDaemon::new().map_err(|e| format!("Failed to create mDNS daemon: {e}"))?;
  daemon
    .register(service_info)
    .map_err(|e| format!("Failed to register mDNS service: {e}"))?;

  // Keep daemon alive.
  *MDNS_DAEMON.lock().unwrap() = Some(daemon);

  Ok(signaling_port)
}

#[tauri::command]
pub async fn discover_hosts(duration_ms: u64) -> Result<Vec<DiscoveredHost>, String> {
  let daemon = ServiceDaemon::new().map_err(|e| format!("Failed to create mDNS daemon: {e}"))?;
  let receiver = daemon.browse(SERVICE_TYPE).map_err(|e| format!("Failed to browse mDNS: {e}"))?;

  let deadline = Instant::now() + Duration::from_millis(duration_ms);
  let mut by_session_id: HashMap<String, DiscoveredHost> = HashMap::new();

  // Event loop: keep polling until duration elapses.
  loop {
    if Instant::now() >= deadline {
      break;
    }

    let event = tokio::time::timeout(Duration::from_millis(250), receiver.recv_async())
      .await
      .map_err(|_| "mDNS timeout".to_string());

    let Ok(Ok(event)) = event else {
      continue;
    };

    match event {
      ServiceEvent::ServiceResolved(resolved) => {
        if let Some(sid) = resolved.txt_properties.get_property_val_str("sid") {
          let session_id = sid.to_string();

          // Choose first v4 address if available.
          let ip = resolved
            .get_addresses_v4()
            .into_iter()
            .next()
            .map(|ip| ip.to_string())
            .unwrap_or_default();

          if ip.is_empty() {
            continue;
          }

          let name = resolved
            .txt_properties
            .get_property_val_str("name")
            .unwrap_or(&resolved.host)
            .to_string();

          let host = DiscoveredHost {
            name,
            ip,
            port: resolved.port,
            session_id: session_id.clone(),
          };

          by_session_id.insert(session_id, host);
        }
      }
      _ => {}
    }
  }

  let mut out: Vec<DiscoveredHost> = by_session_id.into_values().collect();
  out.sort_by(|a, b| a.name.cmp(&b.name));
  Ok(out)
}


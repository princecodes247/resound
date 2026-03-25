use std::{
  collections::HashMap,
  net::IpAddr,
  time::{Duration, Instant},
};

use axum::{routing::get, Router};
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use tokio::net::TcpListener;

use serde::Serialize;
use cpal::traits::{DeviceTrait, HostTrait};
use super::{AudioStream, DiscoveredHost, MDNS_DAEMON, SERVICE_TYPE, SIGNALING_STATE, STARTED_SESSION_ID, SERVER_SHUTDOWN, WS_PATH, websocket_handler, info_handler};
use tauri::Manager;
use tower_http::cors::CorsLayer;
use axum::http::Method;

const WS_SCHEME_PORT_FALLBACK: u16 = 0;

#[derive(Serialize)]
pub struct AudioDevice {
  pub name: String,
  pub is_loopback: bool,
}

#[tauri::command]
pub fn list_audio_devices() -> Result<Vec<AudioDevice>, String> {
  let host = cpal::default_host();
  let devices = host.input_devices().map_err(|e| e.to_string())?;
  let list: Vec<AudioDevice> = devices
    .into_iter()
    .filter_map(|d| d.name().ok())
    .map(|name| {
      let is_loopback = name.to_lowercase().contains("blackhole") 
        || name.to_lowercase().contains("loopback") 
        || name.to_lowercase().contains("vb-audio");
      AudioDevice { name, is_loopback }
    })
    .collect();
  Ok(list)
}

#[tauri::command]
pub fn list_output_devices() -> Result<Vec<AudioDevice>, String> {
  let host = cpal::default_host();
  let devices = host.output_devices().map_err(|e| e.to_string())?;
  let list: Vec<AudioDevice> = devices
    .into_iter()
    .filter_map(|d| d.name().ok())
    .map(|name| {
      AudioDevice { name, is_loopback: false }
    })
    .collect();
  Ok(list)
}



#[tauri::command]
pub async fn start_host(
    app: tauri::AppHandle,
    session_id: String, 
    device_name: Option<String>,
    name: Option<String>,
    monitor: Option<bool>, 
    monitor_device: Option<String>,
    monitor_skip_channels: Option<u16>,
    monitor_gain: f32,
    broadcast_gain: f32
) -> Result<u16, String> {
  // If already started, stop it first.
  if STARTED_SESSION_ID.lock().unwrap().is_some() {
    let _ = stop_host().await;
  }
  
  // Set the fresh session ID.
  {
    let mut guard = STARTED_SESSION_ID.lock().unwrap();
    *guard = Some(session_id.clone());
  }

  let (wrapped_stream, sample_rate, host_channels) = {
    let (streams, sr, ch) = super::start_native_audio_capture(
        device_name.clone(), 
        monitor.unwrap_or(false), 
        monitor_device, 
        monitor_skip_channels.unwrap_or(0),
        monitor_gain,
        broadcast_gain
    ).await?;
    (AudioStream(streams), sr, ch)
  };
  SIGNALING_STATE.write().await.audio_stream = Some(wrapped_stream);


  // 2) Start websocket signaling server (random port) and return the chosen port.
  let listener = TcpListener::bind(("0.0.0.0", 0))
    .await
    .map_err(|e| format!("Failed to bind websocket port: {e}"))?;
  let signaling_port = listener.local_addr().map_err(|e| e.to_string())?.port();

  let (tx, rx) = tokio::sync::oneshot::channel::<()>();
  *SERVER_SHUTDOWN.lock().unwrap() = Some(tx);

  tokio::spawn(async move {
    // In Tauri v2, we should use the path resolver. 
    // For development, we might need to look in src-tauri/web_dist if launched from apps/desktop
    let mut web_dir = app.path().resource_dir().unwrap_or_default().join("web_dist");
    
    if !web_dir.exists() {
        // Fallback for development: check current_dir/src-tauri/web_dist
        if let Ok(cwd) = std::env::current_dir() {
            let dev_path = cwd.join("src-tauri").join("web_dist");
            if dev_path.exists() {
                web_dir = dev_path;
            } else {
                // Try direct web_dist in case it's there
                let direct_path = cwd.join("web_dist");
                if direct_path.exists() {
                    web_dir = direct_path;
                }
            }
        }
    }

    log::info!("Serving web_dist from: {:?}", web_dir);

    let app = Router::new()
        .route(WS_PATH, get(websocket_handler))
        .route("/info", get(info_handler))
        .fallback_service(
            tower_http::services::ServeDir::new(&web_dir)
                .not_found_service(tower_http::services::ServeFile::new(web_dir.join("index.html")))
        )
        .layer(CorsLayer::new()
            .allow_origin(tower_http::cors::Any)
            .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
            .allow_headers(tower_http::cors::Any));
    let server = axum::serve(listener, app);
    if let Err(e) = server.with_graceful_shutdown(async {
      rx.await.ok();
    }).await {
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
  properties.insert("sr".to_string(), sample_rate.to_string());
  properties.insert("ch".to_string(), host_channels.to_string());
  
  let final_name = name.unwrap_or_else(|| format!("Broadcast {}", short_name));
  properties.insert("name".to_string(), final_name);

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

          let sample_rate = resolved
            .txt_properties
            .get_property_val_str("sr")
            .and_then(|v| v.parse::<u32>().ok())
            .unwrap_or(44100);

          let host_channels = resolved
            .txt_properties
            .get_property_val_str("ch")
            .and_then(|v| v.parse::<u32>().ok())
            .unwrap_or(2);

          let host = DiscoveredHost {
            name,
            ip,
            port: resolved.port,
            session_id: session_id.clone(),
            sample_rate,
            channels: host_channels,
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

#[tauri::command]
pub async fn stop_host() -> Result<(), String> {
  // 1) Shutdown websocket server
  if let Some(tx) = SERVER_SHUTDOWN.lock().unwrap().take() {
    let _ = tx.send(());
  }

  // 2) Stop mDNS
  if let Some(daemon) = MDNS_DAEMON.lock().unwrap().take() {
    match daemon.shutdown() {
        Ok(rx) => {
            let _ = rx.recv_timeout(std::time::Duration::from_millis(500));
            log::info!("mDNS daemon shut down successfully.");
        }
        Err(e) => log::error!("Failed to shut down mDNS daemon: {e}"),
    }
  }

  // 3) Stop audio capture
  {
    let mut state = SIGNALING_STATE.write().await;
    state.audio_stream = None;
    state.broadcast_tx = None;
    state.hosts.clear();
    state.receivers.clear();
  }

  // 4) Reset session ID
  *STARTED_SESSION_ID.lock().unwrap() = None;

  log::info!("Host stopped and cleaned up.");
  Ok(())
}

#[tauri::command]
pub async fn start_receiver(
    host_ip: String,
    host_port: u16,
    session_id: String,
    sample_rate: u32,
    channels: u32,
    output_gain: f32,
) -> Result<(), String> {
    let wrapped_stream = super::start_native_receiver(host_ip, host_port, session_id, sample_rate, channels, output_gain).await?;
    let mut state = SIGNALING_STATE.write().await;
    state.receiver_stream = Some(wrapped_stream);
    Ok(())
}

#[tauri::command]
pub async fn stop_receiver() -> Result<(), String> {
    let mut state = SIGNALING_STATE.write().await;
    state.receiver_stream = None;
    log::info!("Receiver stopped.");
    Ok(())
}

#[tauri::command]
pub fn get_device_id() -> String {
    machine_uid::get().unwrap_or_else(|_| "unknown-device".to_string())
}

#[tauri::command]
pub fn get_default_audio_device(is_input: bool) -> Result<String, String> {
    crate::macos_audio::get_default_device(is_input)
}

#[tauri::command]
pub fn set_default_audio_device(is_input: bool, name: String) -> Result<(), String> {
    crate::macos_audio::set_default_device(is_input, &name)
}

#[tauri::command]
pub fn get_system_volume() -> Result<u32, String> {
    let output = std::process::Command::new("osascript")
        .args(&["-e", "output volume of (get volume settings)"])
        .output()
        .map_err(|e| e.to_string())?;
    
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    stdout.parse::<u32>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_system_volume(volume: u32) -> Result<(), String> {
    let script = format!("set volume output volume {}", volume);
    let status = std::process::Command::new("osascript")
        .args(&["-e", &script])
        .status()
        .map_err(|e| e.to_string())?;
    
    if status.success() {
        Ok(())
    } else {
        Err("Failed to set volume".to_string())
    }
}
#[tauri::command]
pub fn get_local_ip() -> Result<String, String> {
  local_ip_address::local_ip()
    .map(|ip| ip.to_string())
    .map_err(|e| e.to_string())
}

use std::{
  collections::{HashMap, VecDeque},
  sync::{Arc, LazyLock, Mutex},
};

use tauri::{
  menu::{Menu, MenuItem},
  tray::TrayIconBuilder,
  Manager,
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
pub(crate) const TARGET_DELAY_MS: u32 = 50;

mod commands;
mod macos_audio;

#[derive(Debug, Clone, Serialize)]
pub(crate) struct DiscoveredHost {
  pub(crate) name: String,
  pub(crate) ip: String,
  pub(crate) port: u16,
  pub(crate) session_id: String,
  pub(crate) sample_rate: u32,
  pub(crate) channels: u32,
}

#[derive(Debug, Clone)]
struct HostConn {
  #[allow(dead_code)]
  _client_id: String,
  tx: tokio::sync::mpsc::UnboundedSender<WsMessage>,
}

#[derive(Debug, Clone)]
struct ReceiverConn {
  #[allow(dead_code)]
  _client_id: String,
  tx: tokio::sync::mpsc::UnboundedSender<WsMessage>,
}

pub struct AudioStream(#[allow(dead_code)] pub(crate) Vec<cpal::Stream>);

impl Drop for AudioStream {
    fn drop(&mut self) {
        use cpal::traits::StreamTrait;
        log::info!("AudioStream being dropped, stopping {} streams", self.0.len());
        for stream in &self.0 {
            let _ = stream.pause();
        }
    }
}

// Safety: cpal::Stream is Send/Sync on most platforms.
unsafe impl Send for AudioStream {}
unsafe impl Sync for AudioStream {}

#[derive(Default)]
pub(crate) struct RoutingState {
  pub(crate) hosts: HashMap<String, HostConn>,
  pub(crate) receivers: HashMap<String, ReceiverConn>,
  pub(crate) audio_stream: Option<AudioStream>,
  pub(crate) receiver_stream: Option<AudioStream>,
  pub(crate) broadcast_tx: Option<tokio::sync::mpsc::UnboundedSender<Vec<u8>>>,
  pub(crate) sample_rate: u32,
  pub(crate) channels: u16,
}

fn receiver_key(session_id: &str, receiver_id: &str) -> String {
  format!("{session_id}:{receiver_id}")
}


pub(crate) static SIGNALING_STATE: LazyLock<RwLock<RoutingState>> = LazyLock::new(|| RwLock::new(RoutingState::default()));
pub(crate) static STARTED_SESSION_ID: LazyLock<Mutex<Option<String>>> = LazyLock::new(|| Mutex::new(None));
pub(crate) static MDNS_DAEMON: LazyLock<Mutex<Option<ServiceDaemon>>> = LazyLock::new(|| Mutex::new(None));
pub(crate) static SERVER_SHUTDOWN: LazyLock<Mutex<Option<tokio::sync::oneshot::Sender<()>>>> = LazyLock::new(|| Mutex::new(None));
pub(crate) static HOST_START_TIME: LazyLock<Mutex<Option<std::time::Instant>>> = LazyLock::new(|| Mutex::new(None));


pub async fn broadcast_audio_packet(packet: Vec<u8>) {
  let state = SIGNALING_STATE.read().await;
  for receiver in state.receivers.values() {
    let _ = receiver.tx.send(WsMessage::Binary(packet.clone()));
  }
}

pub async fn start_native_audio_capture(
    device_name: Option<String>, 
    monitor: bool,
    monitor_device_name: Option<String>,
    monitor_skip_channels: u16,
    monitor_gain: f32,
    broadcast_gain: f32,
) -> Result<(Vec<cpal::Stream>, u32, u16), String> {
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

  *HOST_START_TIME.lock().unwrap() = Some(std::time::Instant::now());

  let config = device.default_input_config().map_err(|e| e.to_string())?;
  let channels = config.channels();
  let sample_rate = config.sample_rate().0;

  let (tx_broadcast, mut rx_broadcast) = tokio::sync::mpsc::unbounded_channel::<Vec<u8>>();
  
  // Dedicated broadcasting task with aggregation
  tokio::spawn(async move {
      log::info!("Audio broadcasting task started.");
      let mut aggregate_buf = Vec::new();
      let mut first_timestamp = 0u64;
      let target_samples = (sample_rate as usize * 10) / 1000; // 10ms target

      while let Some(packet) = rx_broadcast.recv().await {
          if packet.len() < 8 { continue; }
          
          let timestamp = u64::from_le_bytes(packet[0..8].try_into().unwrap_or([0; 8]));
          let samples = &packet[8..];

          if aggregate_buf.is_empty() {
              first_timestamp = timestamp;
          }

          // aggregate_buf.extend_from_slice(samples);
let frame_size = 4 * channels as usize;

// Ensure we only append full frames
let aligned_len = samples.len() - (samples.len() % frame_size);
aggregate_buf.extend_from_slice(&samples[..aligned_len]);

          let frame_size = 4 * channels as usize;
while aggregate_buf.len() >= target_samples * frame_size {
    let chunk = aggregate_buf.drain(..target_samples * frame_size).collect::<Vec<_>>();

    let mut final_packet = Vec::with_capacity(8 + chunk.len());
    final_packet.extend_from_slice(&first_timestamp.to_le_bytes());
    final_packet.extend_from_slice(&chunk);

    broadcast_audio_packet(final_packet).await;
}
      }
      log::info!("Audio broadcasting task stopped.");
  });

  {
      let mut state = SIGNALING_STATE.write().await;
      state.broadcast_tx = Some(tx_broadcast.clone());
      state.sample_rate = sample_rate;
      state.channels = channels;
  }

  
  // For local monitoring
  let monitor_buffer = if monitor {
      Some(Arc::new(Mutex::new(VecDeque::<f32>::with_capacity(8192))))
  } else {
      None
  };

  let input_monitor_buffer = monitor_buffer.clone();
  let host_start = *HOST_START_TIME.lock().unwrap();
  
  let input_stream = device.build_input_stream(
    &config.into(),
    move |data: &[f32], _: &cpal::InputCallbackInfo| {
      // 1) Forward to receivers with timestamp
      let timestamp = if let Some(start) = host_start {
          start.elapsed().as_millis() as u64
      } else {
          0
      };

      let mut pcm = Vec::with_capacity(8 + data.len() * 4);
      // Prepend timestamp (8 bytes LE)
      pcm.extend_from_slice(&timestamp.to_le_bytes());

      // Apply digital gain and clamp to avoid clipping
      let mut peak = 0.0f32;
      for &s in data {
          let abs_s = s.abs();
          if abs_s > peak { peak = abs_s; }
          let boosted = (s * broadcast_gain).clamp(-1.0, 1.0);
          pcm.extend_from_slice(&boosted.to_le_bytes());
      }

      let packet = pcm;
      // Use channel to broadcast instead of spawning task for every packet.
      // 1024 capacity is more than enough for audio packets.
      let _ = tx_broadcast.send(packet);

      // 2) Forward to local monitor buffer if enabled
      if let Some(ref buf_arc) = input_monitor_buffer {
          if let Ok(mut buf) = buf_arc.lock() {
              // Only push first channel to simplify monitoring (mono)
              // Apply the monitor_gain
              for chunk in data.chunks(channels as usize) {
                  let boosted = (chunk[0] * monitor_gain).clamp(-1.0, 1.0);
                  buf.push_back(boosted);
              }
              // Prevent buffer from growing indefinitely (latency). 
              // 8192 samples at 48kHz is ~170ms. 
              // We need enough for TARGET_DELAY_MS (200ms) plus some headroom.
              // Let's allow up to 400ms (19200 samples at 48kHz).
              let max_buffered = (sample_rate as usize * 400) / 1000;
              if buf.len() > max_buffered {
                  let to_remove = buf.len() - (max_buffered / 2); 
                  buf.drain(0..to_remove);
              }
          }
      }
    },
    |err| log::error!("Audio input stream error: {err}"),
    None,
  ).map_err(|e| e.to_string())?;

  let mut streams = vec![input_stream];

  if monitor {
      let output_device = if let Some(name) = monitor_device_name {
          host.output_devices()
              .map_err(|e| e.to_string())?
              .find(|d| d.name().ok().as_deref() == Some(&name))
              .ok_or_else(|| format!("Monitor output device not found: {name}"))?
      } else {
          host.default_output_device().ok_or("No default output device found for monitoring")?
      };
      
      // Try to find a config that matches the input sample rate and is F32
      let output_config = output_device.supported_output_configs()
          .map_err(|e| e.to_string())?
          .filter(|c| c.sample_format() == cpal::SampleFormat::F32)
          .filter_map(|c| {
              if c.min_sample_rate().0 <= sample_rate && c.max_sample_rate().0 >= sample_rate {
                  Some(c.with_sample_rate(cpal::SampleRate(sample_rate)))
              } else {
                  None
              }
          })
          .next()
          .map(|c| Ok::<cpal::SupportedStreamConfig, String>(c.into()))
          .unwrap_or_else(|| {
              output_device.default_output_config()
                  .map_err(|e| e.to_string())
                  .map(|c| c.into())
          })?;

      log::info!("Starting host monitor on {:?} using config {:?}", output_device.name().ok(), output_config);

      let output_channels = output_config.channels();
      let output_monitor_buffer = monitor_buffer.unwrap();

      let output_stream = output_device.build_output_stream(
          &output_config.into(),
          move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
              if let Ok(mut buf) = output_monitor_buffer.lock() {
                  let delay_samples = (sample_rate as u32 * TARGET_DELAY_MS / 1000) as usize;

                  // Enforce Global Delay (200ms)
                  if buf.len() < delay_samples {
                      for s in data.iter_mut() {
                          *s = 0.0;
                      }
                      return;
                  }

                  // Catch-up: if buffer is too large (>300ms), drain back to 200ms
                  if buf.len() > delay_samples + (sample_rate as usize / 10) {
                      let to_remove = buf.len() - delay_samples;
                      buf.drain(0..to_remove);
                  }

                  for frame in data.chunks_mut(output_channels as usize) {
                      let sample = buf.pop_front().unwrap_or(0.0);
                      for (i, s) in frame.iter_mut().enumerate() {
                          if i >= monitor_skip_channels as usize {
                              *s = sample;
                          } else {
                              *s = 0.0;
                          }
                      }
                  }
              }
          },
          |err| log::error!("Audio output stream error: {err}"),
          None,
      ).map_err(|e| e.to_string())?;
      
      output_stream.play().map_err(|e| e.to_string())?;
      streams.push(output_stream);
  }

  streams[0].play().map_err(|e| e.to_string())?;
  Ok((streams, sample_rate, channels))
}


async fn websocket_handler(ws: WebSocketUpgrade) -> impl axum::response::IntoResponse {
  ws.on_upgrade(move |socket| async move {
    handle_ws_socket(socket).await;
  })
}

async fn info_handler() -> impl axum::response::IntoResponse {
    let sid = STARTED_SESSION_ID.lock().unwrap().clone().unwrap_or_default();
    let _state = SIGNALING_STATE.read().await;
    
    // We need the name, sample rate, etc. These are currently in mDNS properties but not in RoutingState.
    // Let's just return what we have or add them to RoutingState.
    // For now, let's return a simple JSON.
    
    let (sr, ch) = {
        let state = SIGNALING_STATE.read().await;
        (state.sample_rate, state.channels)
    };
    
    axum::Json(serde_json::json!({
        "session_id": sid,
        "name": "Resound Broadcast", 
        "sample_rate": sr,
        "channels": ch
    }))
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
      commands::stop_host,
      commands::discover_hosts,
      commands::list_audio_devices,
      commands::list_output_devices,
      commands::start_receiver,
      commands::stop_receiver,
      commands::get_device_id,
      commands::get_default_audio_device,
      commands::set_default_audio_device,
      commands::get_system_volume,
      commands::set_system_volume,
      commands::get_local_ip
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      crate::macos_audio::create_aggregate_device("Resound Audio");

      let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
      let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
      let hide_i = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&show_i, &hide_i, &quit_i])?;

      let tray_icon = app.default_window_icon().cloned().unwrap_or_else(|| {
          tauri::image::Image::new(&[0], 1, 1)
      });

      let _tray = TrayIconBuilder::new()
        .icon(tray_icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
          match event.id.as_ref() {
            "quit" => {
              app.exit(0);
            }
            "show" => {
              if let Some(window) = app.get_webview_window("main") {
                  let _ = window.show();
                  let _ = window.set_focus();
              }
            }
            "hide" => {
               if let Some(window) = app.get_webview_window("main") {
                  let _ = window.hide();
              }
            }
            _ => {}
          }
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                button_state: tauri::tray::MouseButtonState::Up,
                rect,
                ..
            } = event
            {
                 let app = tray.app_handle();
                 if let Some(window) = app.get_webview_window("tray") {
                     let is_visible = window.is_visible().unwrap_or(false);
                     if is_visible {
                         let _ = window.hide();
                     } else {
                         if let (tauri::Position::Physical(pos), tauri::Size::Physical(size)) = (rect.position, rect.size) {
                             let position = tauri::Position::Physical(tauri::PhysicalPosition {
                                 x: pos.x as i32 - 160 + (size.width as i32 / 2),
                                 y: pos.y as i32 + size.height as i32 + 5,
                             });
                             let _ = window.set_position(position);
                         }
                         let _ = window.show();
                         let _ = window.set_focus();
                     }
                 }
            }
        })
        .build(app)?;

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}


pub async fn start_native_receiver(
    host_ip: String,
    host_port: u16,
    session_id: String,
    _sample_rate: u32,
    host_channels: u32,
    output_gain: f32,
) -> Result<AudioStream, String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    use tokio_tungstenite::tungstenite::protocol::Message as TMessage;
    use futures_util::sink::SinkExt; // Added sink::SinkExt
    use futures_util::stream::StreamExt;
    let addr = format!("{host_ip}:{host_port}");
    let tcp_stream = tokio::net::TcpStream::connect(addr).await.map_err(|e| e.to_string())?;
    tcp_stream.set_nodelay(true).map_err(|e| e.to_string())?;

    let ws_url = format!("ws://{host_ip}:{host_port}{WS_PATH}");
    let (ws_stream, _) = tokio_tungstenite::client_async(ws_url, tcp_stream).await.map_err(|e| e.to_string())?;
    let (mut write, mut read) = ws_stream.split();

    // 1) Register as receiver
    let reg = serde_json::json!({
        "type": "register",
        "role": "receiver",
        "sessionId": session_id,
        "clientId": "native-rust-receiver",
    });
    write.send(TMessage::Text(reg.to_string())).await.map_err(|e| e.to_string())?;

    let host = cpal::default_host();
    let device = host.default_output_device().ok_or("No default output device found")?;
    let config = device.default_output_config().map_err(|e| e.to_string())?;
    let sample_rate = config.sample_rate().0;
    let channels = config.channels() as usize;

    log::info!("Native receiver started: {} ({}Hz, {}ch)", device.name().unwrap_or_default(), sample_rate, channels);
    
    let playback_buf = Arc::new(Mutex::new(VecDeque::<f32>::new()));
    let playback_buf_clone = playback_buf.clone();

    // High-performance playback task
    tokio::spawn(async move {
        let mut sync_offset: Option<f64> = None;
        let start_instant = std::time::Instant::now();
        let resample_ratio = sample_rate as f64 / _sample_rate as f64;
        let mut last_host_frame: Vec<f32> = Vec::new();
        let mut resample_phase: f64 = 0.0;
        let mut resampled_samples = Vec::with_capacity(2048);

        while let Some(msg) = read.next().await {
            let data = match msg {
                Ok(TMessage::Binary(d)) => d,
                _ => continue,
            };
            if data.len() < 8 { continue; }

            let host_time_ms = u64::from_le_bytes(data[0..8].try_into().unwrap_or([0; 8]));
            let host_time_sec = host_time_ms as f64 / 1000.0;
            let current_receiver_sec = start_instant.elapsed().as_secs_f64();

            // Sliding minimum sync: align to the fastest packet
            let current_offset = current_receiver_sec - host_time_sec;
            if sync_offset.is_none() || current_offset < sync_offset.unwrap() {
                sync_offset = Some(current_offset);
            }

            let samples_bytes = &data[8..];
            let float_samples: Vec<f32> = samples_bytes.chunks_exact(4)
                .map(|c| f32::from_le_bytes(c.try_into().unwrap()))
                .collect();

            let host_chan = host_channels as usize;
            resampled_samples.clear();

            for frame in float_samples.chunks_exact(host_chan) {
                if last_host_frame.is_empty() {
                    last_host_frame = frame.to_vec();
                    continue;
                }

                while resample_phase < 1.0 {
                    for c in 0..host_chan {
                        let prev = last_host_frame[c];
                        let curr = frame[c];
                        let interpolated = prev + (curr - prev) * resample_phase as f32;
                        resampled_samples.push(interpolated);
                    }
                    resample_phase += 1.0 / resample_ratio;
                }
                resample_phase -= 1.0;
                last_host_frame.copy_from_slice(frame);
            }

            {
                let mut buf = playback_buf.lock().unwrap();
                
                // Normalization per packet
                let max = resampled_samples.iter().fold(0.0f32, |a, &b| a.max(b.abs()));
                if max > 0.02 {
                    let norm = (1.0 / max).min(2.0); // Safety cap: max 2x boost from normalization
                    buf.extend(resampled_samples.iter().map(|s| s * norm));
                } else {
                    buf.extend(resampled_samples.iter().copied());
                }

                // Smooth jitter buffer: drain frame-by-frame
                let delay_samples = (sample_rate as f64 * channels as f64 * TARGET_DELAY_MS as f64 / 1000.0) as usize;
                let max_buffer = delay_samples + (sample_rate as usize * channels / 10); // +100ms
                if buf.len() > max_buffer {
                    let to_remove = buf.len() - delay_samples;
                    // Align to frame boundaries (multi-channel)
                    let aligned_remove = (to_remove / channels) * channels;
                    buf.drain(0..aligned_remove);
                }
            }
        }
        log::info!("Receiver WebSocket task stopped.");
    });

    let stream = device.build_output_stream(
        &config.into(),
        move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
            let mut buf = playback_buf_clone.lock().unwrap();
            let delay_samples = (sample_rate as f64 * channels as f64 * TARGET_DELAY_MS as f64 / 1000.0) as usize;

            if buf.len() < delay_samples {
                for x in data.iter_mut() { *x = 0.0; }
                return;
            }

            if host_channels as usize == channels {
                for x in data.iter_mut() {
                    let s = buf.pop_front().unwrap_or(0.0) * output_gain;
                    *x = s.clamp(-1.0, 1.0);
                }
            } else if host_channels == 1 && channels == 2 {
                // Mono to Stereo: duplicate samples
                for frame in data.chunks_exact_mut(2) {
                    let s = buf.pop_front().unwrap_or(0.0) * output_gain;
                    let s = s.clamp(-1.0, 1.0);
                    frame[0] = s;
                    frame[1] = s;
                }
            } else {
                // Fallback for other mismatches
                for x in data.iter_mut() {
                    let s = buf.pop_front().unwrap_or(0.0) * output_gain;
                    *x = s.clamp(-1.0, 1.0);
                }
            }
        },
        |err| log::error!("Playback error: {err}"),
        None,
    ).map_err(|e| e.to_string())?;

    stream.play().map_err(|e| e.to_string())?;
    Ok(AudioStream(vec![stream]))
}

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

#[cfg(target_os = "macos")]
use screencapturekit::{
  shareable_content::SCShareableContent,
    stream::{
        configuration::SCStreamConfiguration, content_filter::SCContentFilter,
        output_trait::SCStreamOutputTrait, output_type::SCStreamOutputType, SCStream,
    },
    CMSampleBuffer,
};
#[cfg(target_os = "macos")]
// use screencapturekit::prelude::*;
#[cfg(target_os = "macos")]
use coreaudio_sys::{
    AudioObjectAddPropertyListener, AudioObjectPropertyAddress,
    kAudioHardwarePropertyDefaultOutputDevice, kAudioObjectPropertyElementMain,
    kAudioObjectPropertyScopeGlobal, kAudioObjectSystemObject, OSStatus, AudioObjectID,
};
use mdns_sd::ServiceDaemon;
use serde::Serialize;
use tokio::sync::RwLock;

use futures_util::sink::SinkExt;
use futures_util::stream::StreamExt;

pub(crate) const SERVICE_TYPE: &str = "_resound-audio._tcp.local.";
pub(crate) const WS_PATH: &str = "/ws";
pub(crate) const TARGET_DELAY_MS: u32 = 50;
pub(crate) const PLAYOUT_DELAY_MS: u64 = 150;

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

pub enum AudioStream {
    Cpal(Vec<cpal::Stream>),
    #[cfg(target_os = "macos")]
    SCK(SCStream),
}

impl Drop for AudioStream {
    fn drop(&mut self) {
        match self {
            AudioStream::Cpal(streams) => {
                use cpal::traits::StreamTrait;
                log::info!("Cpal AudioStream being dropped, stopping {} streams", streams.len());
                for stream in streams {
                    let _ = stream.pause();
                }
            }
            #[cfg(target_os = "macos")]
            AudioStream::SCK(stream) => {
                log::info!("SCK AudioStream being dropped, stopping stream");
                let _ = stream.stop_capture();
            }
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
  pub(crate) name: String,
}

fn receiver_key(session_id: &str, receiver_id: &str) -> String {
  format!("{session_id}:{receiver_id}")
}


pub(crate) static SIGNALING_STATE: LazyLock<RwLock<RoutingState>> = LazyLock::new(|| RwLock::new(RoutingState::default()));
pub(crate) static STARTED_SESSION_ID: LazyLock<Mutex<Option<String>>> = LazyLock::new(|| Mutex::new(None));
pub(crate) static MDNS_DAEMON: LazyLock<Mutex<Option<ServiceDaemon>>> = LazyLock::new(|| Mutex::new(None));
pub(crate) static SERVER_SHUTDOWN: LazyLock<Mutex<Option<tokio::sync::oneshot::Sender<()>>>> = LazyLock::new(|| Mutex::new(None));
pub(crate) static HOST_START_TIME: LazyLock<Mutex<Option<std::time::Instant>>> = LazyLock::new(|| Mutex::new(None));
pub(crate) static BROADCAST_TX: LazyLock<RwLock<Option<tokio::sync::mpsc::UnboundedSender<Vec<u8>>>>> = LazyLock::new(|| RwLock::new(Option::default()));


pub async fn broadcast_audio_packet(packet: Vec<u8>) {
  let state = SIGNALING_STATE.read().await;
  for receiver in state.receivers.values() {
    let _ = receiver.tx.send(WsMessage::Binary(packet.clone()));
  }
}

#[cfg(target_os = "macos")]
struct SCKOutput {
    first_pts: Arc<Mutex<Option<u64>>>,
    monitor_buf: Option<Arc<Mutex<VecDeque<f32>>>>,
    monitor_gain: f32,
}

#[cfg(target_os = "macos")]
impl SCStreamOutputTrait for SCKOutput {
    fn did_output_sample_buffer(&self, sample_buffer: CMSampleBuffer, of_type: SCStreamOutputType) {
        if let SCStreamOutputType::Audio = of_type {
            // In 1.5.x, CMSampleBuffer has get_linear_pcm_data() or similar if re-exported.
            // If not, we might need more complex extraction. 
            // Let's assume the re-export has it for now.
            if let Some(audio_list) = sample_buffer.audio_buffer_list() {
                let mut all_data = Vec::new();
                let buffers: Vec<_> = audio_list.iter().collect();
                
                if buffers.len() > 1 {
                    // Planar - need to interleave
                    let buffer_len = buffers[0].data().len();
                    let num_samples = buffer_len / 4; // Assume f32 (4 bytes)
                    all_data.resize(buffer_len * buffers.len(), 0);
                    
                    let out_slice = all_data.as_mut_slice();
                    for i in 0..num_samples {
                        for (ch, buffer) in buffers.iter().enumerate() {
                            let src_start = i * 4;
                            let dst_start = (i * buffers.len() + ch) * 4;
                            if src_start + 4 <= buffer.data().len() {
                                out_slice[dst_start..dst_start+4].copy_from_slice(&buffer.data()[src_start..src_start+4]);
                            }
                        }
                    }
                } else if buffers.len() == 1 {
                    all_data.extend_from_slice(buffers[0].data());
                }
                
                // Use hardware-accurate PTS if available
                let pts = sample_buffer.presentation_timestamp();
                let current_pts_ms = (pts.value as f64 * 1000.0 / pts.timescale as f64) as u64;
                
                let mut first_pts_guard = self.first_pts.lock().unwrap();
                if first_pts_guard.is_none() {
                    *first_pts_guard = Some(current_pts_ms);
                }
                
                let pts_offset = current_pts_ms.saturating_sub(first_pts_guard.unwrap());
                
                // Final timestamp: session start relative offset using hardware clock
                let final_timestamp = pts_offset;
                
                let mut packet = Vec::with_capacity(all_data.len() + 8);
                packet.extend_from_slice(&final_timestamp.to_le_bytes());
                packet.extend_from_slice(&all_data);
                
                if let Ok(guard) = BROADCAST_TX.try_read() {
                    if let Some(ref tx) = *guard {
                        let _ = tx.send(packet);
                    }
                }

                if let Some(ref buf_arc) = self.monitor_buf {
                    if let Ok(mut buf) = buf_arc.lock() {
                        // all_data is Vec<u8> (interleaved f32). Convert back to f32 for monitor.
                        let float_samples: Vec<f32> = all_data.chunks_exact(4)
                            .map(|c| f32::from_le_bytes(c.try_into().unwrap()))
                            .collect();

                        for s in float_samples {
                            buf.push_back(s * self.monitor_gain);
                        }
                        
                        // Limit buffer to ~1 second
                        let current_len = buf.len();
                        if current_len > 48000 * 2 {
                            buf.drain(0..current_len - 48000);
                        }
                    }
                }
            }
        }
    }
}

#[cfg(target_os = "macos")]
pub fn setup_default_device_listener() {
    unsafe {
        let address = AudioObjectPropertyAddress {
            mSelector: kAudioHardwarePropertyDefaultOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain,
        };

        let status = AudioObjectAddPropertyListener(
            kAudioObjectSystemObject,
            &address,
            Some(default_device_callback),
            std::ptr::null_mut(),
        );

        if status != 0 {
            log::error!("Failed to add default device listener: {}", status);
        }
    }
}

#[cfg(target_os = "macos")]
extern "C" fn default_device_callback(
    _in_object: AudioObjectID,
    _in_number_addresses: u32,
    _in_addresses: *const AudioObjectPropertyAddress,
    _in_client_data: *mut std::ffi::c_void,
) -> OSStatus {
    log::info!("Default output device changed!");
    0
}

pub async fn start_native_audio_capture(
    device_name: Option<String>, 
    monitor: bool,
    monitor_device_name: Option<String>,
    monitor_skip_channels: u16,
    monitor_gain: f32,
    broadcast_gain: f32,
) -> Result<(AudioStream, u32, u16), String> {
  use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
  let host = cpal::default_host();

  let is_driverless = device_name.as_deref() == Some("System Audio (Driverless)");

  let (device, config, sample_rate, channels) = if is_driverless {
    (None, None, 48000, 2u16)
  } else {
    let dev = if let Some(name) = device_name {
      host.input_devices()
        .map_err(|e| e.to_string())?
        .find(|d| d.name().ok().as_deref() == Some(&name))
        .ok_or_else(|| format!("Device not found: {name}"))?
    } else {
      host.default_input_device().ok_or("No default input device found")?
    };
    let conf = dev.default_input_config().map_err(|e| e.to_string())?;
    let sr = conf.sample_rate().0;
    let ch = conf.channels();
    (Some(dev), Some(conf), sr, ch)
  };

  // For local monitoring (Initialize early so it can be used by both SCK and CPAL)
  let monitor_buffer = if monitor {
      Some(Arc::new(Mutex::new(VecDeque::<f32>::with_capacity(8192))))
  } else {
      None
  };

  let (tx_broadcast, mut rx_broadcast) = tokio::sync::mpsc::unbounded_channel::<Vec<u8>>();
  
  // Set global senders for broadcast
  {
      let mut guard = BROADCAST_TX.write().await;
      *guard = Some(tx_broadcast.clone());
  }
  {
      let mut state = SIGNALING_STATE.write().await;
      state.broadcast_tx = Some(tx_broadcast.clone());
      state.sample_rate = sample_rate;
      state.channels = channels;
  }

  // Dedicated broadcasting task with aggregation for both SCK and CPAL
  tokio::spawn(async move {
      log::info!("Audio broadcasting task started ({}Hz, {}ch).", sample_rate, channels);
      let mut aggregate_buf = Vec::new();
      let mut first_timestamp = 0u64;
      let target_samples = (sample_rate as usize * 10) / 1000; // 10ms target
      let frame_size = 4 * channels as usize;

      while let Some(packet) = rx_broadcast.recv().await {
          if packet.len() < 8 { continue; }
          
          let timestamp = u64::from_le_bytes(packet[0..8].try_into().unwrap_or([0; 8]));
          let samples = &packet[8..];

          if aggregate_buf.is_empty() {
              first_timestamp = timestamp;
          } else {
              // Jump detection: if the incoming timestamp is far from where we expected,
              // it means there was a gap or jitter. We should reset to avoid cumulative drift.
              let buffer_duration_ms = (aggregate_buf.len() / frame_size) as u64 * 1000 / sample_rate as u64;
              let expected_timestamp = first_timestamp + buffer_duration_ms;
              
              if timestamp > expected_timestamp + 100 || timestamp < expected_timestamp.saturating_sub(100) {
                  log::warn!("Audio jump detected ({}ms), resetting aggregation buffer.", timestamp as i64 - expected_timestamp as i64);
                  aggregate_buf.clear();
                  first_timestamp = timestamp;
              }
          }

          aggregate_buf.extend_from_slice(samples);

          while aggregate_buf.len() >= target_samples * frame_size {
              let chunk = aggregate_buf.drain(..target_samples * frame_size).collect::<Vec<_>>();

              let playout_timestamp = first_timestamp + PLAYOUT_DELAY_MS;
              let mut final_packet = Vec::with_capacity(8 + chunk.len());
              final_packet.extend_from_slice(&playout_timestamp.to_le_bytes());
              final_packet.extend_from_slice(&chunk);

              broadcast_audio_packet(final_packet).await;
              
              // Increment timestamp for next chunk based on target_samples
              first_timestamp += (target_samples as u64 * 1000) / sample_rate as u64;
          }
      }
      log::info!("Audio broadcasting task stopped.");
  });

  *HOST_START_TIME.lock().unwrap() = Some(std::time::Instant::now());

  if is_driverless {
    #[cfg(target_os = "macos")]
    {
      let content = SCShareableContent::get().map_err(|e| format!("Failed to get shareable content: {e}"))?;
      let displays = content.displays();
      let display = displays.first().ok_or("No displays found for ScreenCaptureKit")?;
      
      let filter = SCContentFilter::create()
          .with_display(display)
          .with_excluding_windows(&[])
          .build();
          
      let mut sck_config = SCStreamConfiguration::default();
      sck_config.set_captures_audio(true);
      sck_config.set_sample_rate(sample_rate as i32);
      sck_config.set_channel_count(channels as i32);
      
      let mut stream = SCStream::new(&filter, &sck_config);
      
      stream.add_output_handler(SCKOutput { 
          first_pts: Arc::new(Mutex::new(None)),
          monitor_buf: monitor_buffer.clone(),
          monitor_gain,
      }, SCStreamOutputType::Audio);
      stream.start_capture().map_err(|e| format!("Failed to start SCK stream: {e}"))?;
      
      return Ok((AudioStream::SCK(stream), sample_rate, channels));
    }
    #[cfg(not(target_os = "macos"))]
    return Err("Driverless capture only supported on macOS".to_string());
  }

  let device = device.unwrap();
  let config = config.unwrap();

  let input_monitor_buffer = monitor_buffer.clone();
  let host_start = *HOST_START_TIME.lock().unwrap();
  
  let tx_to_broadcast = tx_broadcast.clone();
  let input_stream = device.build_input_stream(
    &config.into(),
    move |data: &[f32], _: &cpal::InputCallbackInfo| {
      let timestamp = if let Some(start) = host_start {
          start.elapsed().as_millis() as u64
      } else {
          0
      };

      let mut pcm = Vec::with_capacity(8 + data.len() * 4);
      pcm.extend_from_slice(&timestamp.to_le_bytes());

      for &s in data {
          let boosted = (s * broadcast_gain).clamp(-1.0, 1.0);
          pcm.extend_from_slice(&boosted.to_le_bytes());
      }

      let _ = tx_to_broadcast.send(pcm);

      if let Some(ref buf_arc) = input_monitor_buffer {
          if let Ok(mut buf) = buf_arc.lock() {
              for chunk in data.chunks(channels as usize) {
                  let boosted = (chunk[0] * monitor_gain).clamp(-1.0, 1.0);
                  buf.push_back(boosted);
              }
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
                  let delay_samples = (sample_rate as u64 * PLAYOUT_DELAY_MS / 1000) as usize;

                  if buf.len() < delay_samples {
                      for s in data.iter_mut() {
                          *s = 0.0;
                      }
                      return;
                  }

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
  Ok((AudioStream::Cpal(streams), sample_rate, channels))
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
    
    let (sr, ch, name) = {
        let state = SIGNALING_STATE.read().await;
        (state.sample_rate, state.channels, state.name.clone())
    };
    
    axum::Json(serde_json::json!({
        "session_id": sid,
        "name": name, 
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
      "sync_request" => {
        let t0 = value.get("t0").and_then(|v| v.as_u64()).unwrap_or(0);
        let t1 = HOST_START_TIME.lock().unwrap()
            .as_ref()
            .map(|s| s.elapsed().as_millis() as u64)
            .unwrap_or(0);
        
        let response = serde_json::json!({
          "type": "sync_response",
          "t0": t0,
          "t1": t1,
          "t2": t1 // Assuming host processing is negligible
        });
        let _ = tx.send(WsMessage::Text(response.to_string()));
      }
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
      commands::get_default_audio_device,
      commands::set_default_audio_device,
      commands::get_device_id,
      commands::set_system_volume,
      commands::get_local_ip,
      commands::install_driver,
      commands::check_driver_installed
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      #[cfg(target_os = "macos")]
      crate::setup_default_device_listener();

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
    let (tx_ws, mut rx_ws) = tokio::sync::mpsc::unbounded_channel::<TMessage>();

    // WebSocket sender task
    tokio::spawn(async move {
        while let Some(msg) = rx_ws.recv().await {
            if write.send(msg).await.is_err() { break; }
        }
    });

    // 1) Register as receiver
    let reg = serde_json::json!({
        "type": "register",
        "role": "receiver",
        "sessionId": session_id,
        "clientId": "native-rust-receiver",
    });
    tx_ws.send(TMessage::Text(reg.to_string())).map_err(|e| e.to_string())?;

    let host = cpal::default_host();
    let device = host.default_output_device().ok_or("No default output device found")?;
    let config = device.default_output_config().map_err(|e| e.to_string())?;
    let sample_rate = config.sample_rate().0;
    let channels = config.channels() as usize;

    log::info!("Native receiver started: {} ({}Hz, {}ch)", device.name().unwrap_or_default(), sample_rate, channels);
    
    let playback_buf = Arc::new(Mutex::new(VecDeque::<(u64, Vec<f32>)>::new()));
    let playback_buf_clone = playback_buf.clone();
    let clock_offset = Arc::new(Mutex::new(0i64));
    let clock_offset_reader = clock_offset.clone();
    let clock_offset_writer = clock_offset.clone();
    let start_instant = std::time::Instant::now();
    let start_instant_clone = start_instant.clone();

    // Periodically sync clock with host
    let tx_ws_sync = tx_ws.clone();
    tokio::spawn(async move {
        loop {
            let req = serde_json::json!({
              "type": "sync_request",
              "t0": start_instant_clone.elapsed().as_millis() as u64
            });
            if tx_ws_sync.send(TMessage::Text(req.to_string())).is_err() { break; }
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }
    });

    // High-performance playback task
    tokio::spawn(async move {
        let mut sync_offset: Option<f64> = None;
        let start_instant = std::time::Instant::now();
        let resample_ratio = sample_rate as f64 / _sample_rate as f64;
        let mut last_host_frame: Vec<f32> = Vec::new();
        let mut resample_phase: f64 = 0.0;
        let mut resampled_samples = Vec::with_capacity(2048);
        let mut explicit_disconnect = false;

        while let Some(msg) = read.next().await {
            let data = match msg {
                Ok(TMessage::Binary(d)) => d,
                Ok(TMessage::Text(t)) => {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&t) {
                        if v["type"] == "sync_response" {
                            let t0 = v["t0"].as_u64().unwrap_or(0);
                            let t1 = v["t1"].as_u64().unwrap_or(0);
                            let t2 = v["t2"].as_u64().unwrap_or(0);
                            let now = start_instant.elapsed().as_millis() as u64;
                            let offset = (t1 as i64 - t0 as i64 + (t2 as i64 - now as i64)) / 2;
                            
                            let mut guard = clock_offset_writer.lock().unwrap();
                            if *guard == 0 {
                                *guard = offset;
                            } else {
                                // Smooth adjustment
                                *guard = (*guard * 8 + offset * 2) / 10;
                            }
                        } else if v["type"] == "host_disconnected" {
                            log::info!("Host disconnected explicitly.");
                            explicit_disconnect = true;
                            break;
                        }
                    }
                    continue;
                }
                _ => continue,
            };
            if data.len() < 8 { continue; }

            let host_time_ms = u64::from_le_bytes(data[0..8].try_into().unwrap_or([0; 8]));
            let host_time_sec = host_time_ms as f64 / 1000.0;
            let current_receiver_sec = start_instant.elapsed().as_secs_f64();

            // Sliding minimum sync: align to the fastest packet
            let current_offset = current_receiver_sec - host_time_sec;
            if sync_offset.is_none() {
                sync_offset = Some(current_offset);
            } else {
                // slow smoothing (VERY important)
                let alpha = 0.001; // tiny adjustment
                sync_offset = Some(
                    sync_offset.unwrap() * (1.0 - alpha) + current_offset * alpha
                );
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
                buf.push_back((host_time_ms, resampled_samples.clone()));
                
                // Keep buffer manageable (max 2 seconds)
                if buf.len() > 200 {
                    buf.pop_front();
                }
            }
        }
        if explicit_disconnect {
            log::info!("Receiver WebSocket task finished gracefully.");
        } else {
            log::warn!("Receiver WebSocket connection lost abruptly.");
        }
    });

    let mut current_packet: Option<(u64, Vec<f32>)> = None;
    let mut packet_pos = 0;

    let stream = device.build_output_stream(
        &config.into(),
        move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
            let offset = *clock_offset_reader.lock().unwrap();
            let host_now = (start_instant.elapsed().as_millis() as i64 + offset) as u64;

            for frame in data.chunks_mut(channels) {
                if current_packet.is_none() {
                    let mut buf = playback_buf_clone.lock().unwrap();
                    if let Some(pkg) = buf.pop_front() {
                        // Check if it's too early
                        if host_now < pkg.0 {
                            // Don't pop yet, just output silence for this frame
                            buf.push_front(pkg);
                        } else if host_now > pkg.0 + 500 {
                            // Too late (>500ms), drop it
                            continue;
                        } else {
                            current_packet = Some(pkg);
                            packet_pos = 0;
                        }
                    }
                }

                if let Some(ref mut pkg) = current_packet {
                    for (c, sample) in frame.iter_mut().enumerate() {
                        // Resampled samples already contain host_channels channels.
                        // We map them to the output device's channels.
                        let host_ch = host_channels as usize;
                        let idx = packet_pos * host_ch + (if pkg.1.len() > host_ch { c % host_ch } else { 0 });
                        if idx < pkg.1.len() {
                            *sample = pkg.1[idx] * output_gain;
                        } else {
                            *sample = 0.0;
                        }
                    }
                    packet_pos += 1;
                    if packet_pos * (host_channels as usize) >= pkg.1.len() {
                        current_packet = None;
                    }
                } else {
                    for sample in frame.iter_mut() { *sample = 0.0; }
                }
            }
        },
        move |err| { log::error!("Playback error: {err}"); },
        None,
    ).map_err(|e| e.to_string())?;

    stream.play().map_err(|e| e.to_string())?;
    Ok(AudioStream::Cpal(vec![stream]))
}

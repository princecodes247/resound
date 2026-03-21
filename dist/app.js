const $ = (id) => document.getElementById(id);

const hostLogEl = $("hostLog");
const rxLogEl = $("rxLog");

function nowStr() {
  return new Date().toISOString().replace("T", " ").replace("Z", "");
}

function log(el, msg) {
  el.textContent += `[${nowStr()}] ${msg}\n`;
  el.scrollTop = el.scrollHeight;
}

function requireTauri() {
  // Tauri v2 usually exposes invoke as `window.__TAURI__.core.invoke`.
  // Some environments still expose `window.__TAURI__.invoke`.
  const t = window.__TAURI__;
  const invokeFn = t?.core?.invoke ?? t?.invoke;

  // Fallback for internal injection in some builds.
  const internalInvoke = window.__TAURI_INTERNALS__?.invoke;
  const finalInvoke = invokeFn ?? internalInvoke;

  if (!finalInvoke) {
    throw new Error(
      "Tauri API not found. Ensure tauri.conf.json has app.withGlobalTauri enabled.",
    );
  }

  return { invoke: finalInvoke };
}

async function invoke(cmd, args) {
  const tauri = requireTauri();
  return await tauri.invoke(cmd, args);
}

function wsUrlFromIpPort(ip, port) {
  return `ws://${ip}:${port}/ws`;
}

// ---------- Host state ----------
let host = {
  sessionId: null,
  clientId: null,
  signalingPort: null,
  ws: null,
  // Native capture handles are in Rust now.
};

let audioCtx = null;
let nextPlaybackTime = 0;

async function populateDevices() {
  const sel = $("deviceSelect");
  const systemAudioTip = $("systemAudioTip") || createSystemAudioTip();

  try {
    const devices = await invoke("list_audio_devices", {});
    sel.innerHTML = '<option value="">Default Input</option>';

    let loopbackFound = false;
    devices.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d.name;
      opt.textContent = d.is_loopback ? `${d.name} (System Audio)` : d.name;
      sel.appendChild(opt);
      if (d.is_loopback) loopbackFound = true;
    });

    if (loopbackFound) {
      systemAudioTip.style.display = "none";
    } else {
      systemAudioTip.textContent =
        "💡 Tip: To stream system audio, install BlackHole and select it above.";
      systemAudioTip.style.display = "block";
    }
  } catch (e) {
    console.error("Failed to list devices:", e);
  }
}

async function populateOutputDevices() {
  const sel = $("monitorDeviceSelect");
  try {
    const devices = await invoke("list_output_devices", {});
    sel.innerHTML = '<option value="">Default Output</option>';
    devices.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d.name;
      opt.textContent = d.name;
      sel.appendChild(opt);
    });
  } catch (e) {
    console.error("Failed to list output devices:", e);
  }
}

populateDevices();
populateOutputDevices();

function createSystemAudioTip() {
  const tip = document.createElement("div");
  tip.id = "systemAudioTip";
  tip.style.fontSize = "12px";
  tip.style.marginTop = "8px";
  tip.style.color = "#888";
  tip.style.fontStyle = "italic";
  $("deviceSelect").parentNode.appendChild(tip);
  return tip;
}

// ---------- Host state ----------

async function startHost() {
  host.sessionId = crypto.randomUUID();
  host.clientId = crypto.randomUUID();

  $("hostSessionId").textContent = host.sessionId;
  $("hostStatus").textContent = "Starting host...";
  hostLogEl.textContent = "";

  const deviceName = $("deviceSelect").value || null;
  const monitor = $("monitorCheckbox").checked;
  const monitorDevice = $("monitorDeviceSelect").value || null;
  const monitorSkipChannels = parseInt($("monitorSkipChannels").value) || 0;

  // 1) Start signaling + mDNS + Native Capture (Rust)
  log(
    hostLogEl,
    `Starting host with device=${deviceName || "default"} monitor=${monitor} (skip=${monitorSkipChannels})...`,
  );
  const port = await invoke("start_host", {
    session_id: host.sessionId,
    sessionId: host.sessionId,
    device_name: deviceName,
    deviceName: deviceName,
    monitor: monitor,
    monitor_device: monitorDevice,
    monitorDevice: monitorDevice,
    monitor_skip_channels: monitorSkipChannels,
    monitorSkipChannels: monitorSkipChannels,
  });
  host.signalingPort = port;
  $("hostStatus").textContent =
    `Signaling on port ${port}. Streaming native audio...`;
  log(hostLogEl, `mDNS+WS+Capture started. Port=${port}`);

  $("btnStartHost").style.display = "none";
  $("btnStopHost").style.display = "inline-block";
  $("btnStopHost").disabled = false;

  // 3) Connect to local signaling server as "host"

  const wsUrl = `ws://127.0.0.1:${host.signalingPort}/ws`;
  log(hostLogEl, `Connecting to WebSocket: ${wsUrl}`);
  host.ws = new WebSocket(wsUrl);

  host.ws.onopen = () => {
    log(hostLogEl, "WebSocket connected successfully. Registering host...");
    host.ws.send(
      JSON.stringify({
        type: "register",
        sessionId: host.sessionId,
        role: "host",
        clientId: host.clientId,
      }),
    );
  };

  host.ws.onerror = (err) => {
    log(
      hostLogEl,
      `WebSocket ERROR. Check browser console or if Axum is blocked.`,
    );
    console.error("WebSocket Error:", err);
    $("hostStatus").textContent = "Signaling connection error (WebSocket).";
  };

  host.ws.onclose = (evt) => {
    log(
      hostLogEl,
      `WebSocket closed. Code: ${evt.code}, Reason: ${evt.reason || "none"}`,
    );
    if (evt.code !== 1000) {
      $("hostStatus").textContent = `Signaling closed (code ${evt.code}).`;
    }
  };

  host.ws.onmessage = async (evt) => {
    let msg;
    try {
      msg = JSON.parse(evt.data);
    } catch {
      return;
    }

    if (msg.type === "offer") {
      const receiverId = msg.from;
      log(hostLogEl, `Offer from receiver=${receiverId}`);

      let pc = host.pcsByReceiverId.get(receiverId);
      if (!pc) {
        pc = new RTCPeerConnection();
        host.pcsByReceiverId.set(receiverId, pc);

        pc.onicecandidate = (e) => {
          if (!e.candidate) return;
          host.ws.send(
            JSON.stringify({
              type: "ice",
              sessionId: host.sessionId,
              to: receiverId,
              candidate: e.candidate,
            }),
          );
        };

        pc.onconnectionstatechange = () => {
          log(
            hostLogEl,
            `Receiver=${receiverId} connectionState=${pc.connectionState}`,
          );
        };

        pc.ontrack = () => {
          // Host doesn't need to render tracks.
        };

        if (!host.audioTrack || !host.stream) return;

        // Add the shared audio track to this receiver's peer connection.
        pc.addTrack(host.audioTrack, host.stream);
      }

      await pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      host.ws.send(
        JSON.stringify({
          type: "answer",
          sessionId: host.sessionId,
          to: receiverId,
          answer: pc.localDescription,
        }),
      );
      log(hostLogEl, `Answer sent to receiver=${receiverId}`);
    } else if (msg.type === "ice") {
      const receiverId = msg.from;
      const pc = host.pcsByReceiverId.get(receiverId);
      if (!pc) return;
      if (!msg.candidate) return;
      await pc.addIceCandidate(msg.candidate);
    }
  };

  host.ws.onclose = () => log(hostLogEl, "WebSocket closed.");
}

async function stopHost() {
  log(hostLogEl, "Stopping host...");
  try {
    await invoke("stop_host", {});
    if (host.ws) {
      host.ws.close();
      host.ws = null;
    }
    host.sessionId = null;
    host.clientId = null;
    host.signalingPort = null;

    $("hostSessionId").textContent = "not started";
    $("hostStatus").textContent = "Idle";
    log(hostLogEl, "Host stopped successfully.");

    $("btnStartHost").style.display = "inline-block";
    $("btnStartHost").disabled = false;
    $("btnStopHost").style.display = "none";
  } catch (e) {
    console.error("Stop error:", e);
    log(hostLogEl, `ERROR stopping host: ${e?.message ?? String(e)}`);
    $("btnStopHost").disabled = false;
  }
}

// ---------- Receiver state ----------
let receiver = {
  receiverId: crypto.randomUUID(),
  ws: null,
  host: null, // {ip, port, session_id}
  pc: null,
};

function resetReceiverUi() {
  receiver.receiverId = crypto.randomUUID();
  receiver.ws = null;
  receiver.host = null;
  receiver.pc = null;
  $("hostSelect").disabled = true;
  $("btnConnect").disabled = true;
  $("rxStatus").textContent = "Idle";
  rxLogEl.textContent = "";
}

async function discoverHosts() {
  resetReceiverUi();
  $("rxStatus").textContent = "Discovering hosts (mDNS)...";
  rxLogEl.textContent = "";

  log(rxLogEl, "Calling Rust discover_hosts...");
  const hosts = await invoke("discover_hosts", {
    duration_ms: 3000,
    durationMs: 3000,
  });

  const sel = $("hostSelect");
  sel.innerHTML = "";

  if (!hosts.length) {
    $("rxStatus").textContent = "No hosts found.";
    log(rxLogEl, "No hosts found via mDNS.");
    return;
  }

  for (const h of hosts) {
    const opt = document.createElement("option");
    opt.value = JSON.stringify(h);
    opt.textContent = `${h.name} • ${h.ip}:${h.port} • ${h.session_id}`;
    sel.appendChild(opt);
  }

  sel.disabled = false;
  $("btnConnect").disabled = false;
  $("rxStatus").textContent =
    `Found ${hosts.length} host(s). Select one and connect.`;
  log(rxLogEl, `Found hosts: ${hosts.length}`);
}

async function connectAndPlay() {
  const sel = $("hostSelect");
  if (!sel.value) return;

  const hostInfo = JSON.parse(sel.value);
  receiver.host = hostInfo;

  $("rxStatus").textContent = "Connecting + setting up WebRTC...";
  log(rxLogEl, `Connecting to ${hostInfo.ip}:${hostInfo.port}`);

  receiver.ws = new WebSocket(wsUrlFromIpPort(hostInfo.ip, hostInfo.port));
  receiver.pc = new RTCPeerConnection();

  const audioEl = $("audio");
  audioEl.srcObject = null;

  receiver.pc.ontrack = (e) => {
    const stream = e.streams?.[0];
    if (!stream) return;
    audioEl.srcObject = stream;
    audioEl.play().catch(() => {});
  };

  receiver.pc.onicecandidate = (e) => {
    if (!e.candidate) return;
    receiver.ws.send(
      JSON.stringify({
        type: "ice",
        sessionId: hostInfo.session_id,
        from: receiver.receiverId,
        candidate: e.candidate,
      }),
    );
  };

  receiver.pc.onconnectionstatechange = () => {
    log(rxLogEl, `connectionState=${receiver.pc.connectionState}`);
  };

  receiver.ws.onmessage = async (evt) => {
    if (evt.data instanceof Blob) {
      // Binary PCM data from Rust
      const arrayBuffer = await evt.data.arrayBuffer();
      if (!audioCtx) audioCtx = new AudioContext();
      const floatData = new Float32Array(arrayBuffer);
      if (floatData.length === 0) return;

      const sampleRate = receiver.host?.sample_rate || 44100;
      const buffer = audioCtx.createBuffer(1, floatData.length, sampleRate);
      buffer.getChannelData(0).set(floatData);
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);

      const startTime = Math.max(audioCtx.currentTime, nextPlaybackTime);
      source.start(startTime);
      nextPlaybackTime = startTime + buffer.duration;
      return;
    }

    let msg;
    try {
      msg = JSON.parse(evt.data);
    } catch {
      return;
    }

    if (msg.type === "answer") {
      log(rxLogEl, "Received answer. Applying remote description...");
      await receiver.pc.setRemoteDescription(
        new RTCSessionDescription(msg.answer),
      );
    } else if (msg.type === "ice") {
      if (!msg.candidate) return;
      await receiver.pc.addIceCandidate(msg.candidate);
    }
  };

  // Create offer after websocket open/register
  await new Promise((resolve) => {
    receiver.ws.onopen = () => {
      log(rxLogEl, "WebSocket connected. Registering receiver...");
      receiver.ws.send(
        JSON.stringify({
          type: "register",
          sessionId: hostInfo.session_id,
          role: "receiver",
          clientId: receiver.receiverId,
        }),
      );
      resolve();
    };
  });

  const offer = await receiver.pc.createOffer();
  await receiver.pc.setLocalDescription(offer);

  receiver.ws.send(
    JSON.stringify({
      type: "offer",
      sessionId: hostInfo.session_id,
      from: receiver.receiverId,
      offer: receiver.pc.localDescription,
    }),
  );

  $("rxStatus").textContent =
    "Connected. If you granted audio permissions, playback should start shortly.";
  log(rxLogEl, "Offer sent. Waiting for remote tracks...");
}

// ---------- Wire up UI ----------
resetReceiverUi();

$("btnStartHost").addEventListener("click", async () => {
  $("btnStartHost").disabled = true;
  try {
    await startHost();
  } catch (e) {
    console.error(e);
    $("hostStatus").textContent = `Host error: ${e?.message ?? String(e)}`;
    log(hostLogEl, `ERROR: ${e?.message ?? String(e)}`);
    $("btnStartHost").disabled = false;
    $("btnStartHost").style.display = "inline-block";
    $("btnStopHost").style.display = "none";
  }
});

$("btnStopHost").addEventListener("click", async () => {
  $("btnStopHost").disabled = true;
  await stopHost();
});

$("btnDiscover").addEventListener("click", async () => {
  try {
    await discoverHosts();
  } catch (e) {
    console.error(e);
    $("rxStatus").textContent = `Discover error: ${e?.message ?? String(e)}`;
    log(rxLogEl, `ERROR: ${e?.message ?? String(e)}`);
  }
});

$("btnConnect").addEventListener("click", async () => {
  $("btnConnect").disabled = true;
  try {
    await connectAndPlay();
  } catch (e) {
    console.error(e);
    $("rxStatus").textContent = `Connect error: ${e?.message ?? String(e)}`;
    log(rxLogEl, `ERROR: ${e?.message ?? String(e)}`);
    $("btnConnect").disabled = false;
  }
});

$("monitorCheckbox").addEventListener("change", (e) => {
  $("monitorSettings").style.display = e.target.checked ? "block" : "none";
});

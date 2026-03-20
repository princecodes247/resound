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
  stream: null,
  audioTrack: null,
  pcsByReceiverId: new Map(),
};

async function captureHostAudioStream() {
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices) {
    throw new Error(
      "Media APIs unavailable in this WebView. Restart app after granting microphone/screen permissions to the app host (Cursor/Terminal) in macOS Privacy settings.",
    );
  }

  // Preferred path for system audio on macOS via screen/audio capture.
  if (typeof mediaDevices.getDisplayMedia === "function") {
    const stream = await mediaDevices.getDisplayMedia({
      // WebKit typically requires a video constraint for getDisplayMedia.
      video: true,
      audio: true,
    });
    // We only need audio for LAN playback.
    for (const track of stream.getVideoTracks()) {
      track.enabled = false;
    }
    return stream;
  }

  // Fallback path if display capture is not available in this WebView runtime.
  // This captures microphone only (not system output).
  if (typeof mediaDevices.getUserMedia === "function") {
    return await mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
  }

  throw new Error("No supported media capture API found (getDisplayMedia/getUserMedia).");
}

async function fallbackToMicrophoneIfNeeded(stream) {
  if (stream?.getAudioTracks?.().length) return stream;

  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== "function") {
    return stream;
  }

  const micStream = await mediaDevices.getUserMedia({
    audio: true,
    video: false,
  });

  if (!micStream.getAudioTracks().length) {
    return stream;
  }

  return micStream;
}

async function startHost() {
  host.sessionId = crypto.randomUUID();
  host.clientId = crypto.randomUUID();

  $("hostSessionId").textContent = host.sessionId;
  $("hostStatus").textContent = "Starting host...";
  hostLogEl.textContent = "";

  // 1) Start signaling + mDNS (Rust)
  const port = await invoke("start_host", {
    session_id: host.sessionId,
    sessionId: host.sessionId,
  });
  host.signalingPort = port;
  $("hostStatus").textContent = `Signaling on port ${port}. Waiting for receiver(s)...`;
  log(hostLogEl, `mDNS+WS started. Port=${port}`);

  // 2) Capture system audio first (macOS permission prompt).
  // Doing this before WS registration avoids a race where a receiver sends an offer
  // before `host.audioTrack` is available.
  $("hostStatus").textContent = "Requesting audio capture permissions...";
  log(hostLogEl, "Requesting capture stream...");
  host.stream = await captureHostAudioStream();
  host.stream = await fallbackToMicrophoneIfNeeded(host.stream);
  const audioTracks = host.stream.getAudioTracks();
  if (!audioTracks.length) {
    throw new Error(
      "No audio track returned from screen share, and microphone fallback also failed.",
    );
  }
  host.audioTrack = audioTracks[0];
  $("hostStatus").textContent = "Audio capture ready. Connecting signaling...";
  log(hostLogEl, "Audio capture ready.");

  // 3) Connect to local signaling server as "host"
  host.ws = new WebSocket(`ws://127.0.0.1:${host.signalingPort}/ws`);
  host.ws.onopen = () => {
    log(hostLogEl, "WebSocket connected. Registering host...");
    host.ws.send(
      JSON.stringify({
        type: "register",
        sessionId: host.sessionId,
        role: "host",
        clientId: host.clientId,
      }),
    );
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
          log(hostLogEl, `Receiver=${receiverId} connectionState=${pc.connectionState}`);
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
  $("rxStatus").textContent = `Found ${hosts.length} host(s). Select one and connect.`;
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
    let msg;
    try {
      msg = JSON.parse(evt.data);
    } catch {
      return;
    }

    if (msg.type === "answer") {
      log(rxLogEl, "Received answer. Applying remote description...");
      await receiver.pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
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

  $("rxStatus").textContent = "Connected. If you granted audio permissions, playback should start shortly.";
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
  }
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


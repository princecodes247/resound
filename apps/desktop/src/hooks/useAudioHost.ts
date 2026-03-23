import { useState, useCallback, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AudioDevice, LogEntry } from "@resound/shared";

// Detect if running in Tauri
const isTauri = !!(window as any).__TAURI_INTERNALS__;

export const useAudioHost = () => {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [outputDevices, setOutputDevices] = useState<AudioDevice[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [signalingPort, setSignalingPort] = useState<number | null>(null);
  const [status, setStatus] = useState<
    "idle" | "starting" | "broadcasting" | "error"
  >("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);

  const addLog = useCallback((message: string) => {
    setLogs((prev) => [
      ...prev,
      { time: new Date().toLocaleTimeString([], { hour12: false }), message },
    ]);
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!isTauri) return;
    try {
      const inputDevs = await invoke<AudioDevice[]>("list_audio_devices");
      const outputDevs = await invoke<AudioDevice[]>("list_output_devices");
      setDevices(inputDevs);
      setOutputDevices(outputDevs);
    } catch (e) {
      console.error("Failed to list devices:", e);
    }
  }, []);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  const startHost = useCallback(
    async (config: {
      deviceName: string | null;
      name: string | null;
      monitor: boolean;
      monitorDevice: string | null;
      monitorSkipChannels: number;
      monitorGain: number;
      broadcastGain: number;
    }) => {
      if (!isTauri) {
        addLog(
          "Broadcasting is currently only supported in the desktop application.",
        );
        return;
      }

      const newSessionId = crypto.randomUUID();
      const clientId = crypto.randomUUID();

      setSessionId(newSessionId);
      setStatus("starting");
      setLogs([]);
      addLog(`Starting host with device=${config.deviceName || "default"}...`);

      try {
        const port = await invoke<number>("start_host", {
          session_id: newSessionId,
          sessionId: newSessionId,
          device_name: config.deviceName,
          deviceName: config.deviceName,
          name: config.name,
          monitorLength: config.monitor,
          monitor: config.monitor,
          monitor_device: config.monitorDevice,
          monitorDevice: config.monitorDevice,
          monitor_skip_channels: config.monitorSkipChannels,
          monitorSkipChannels: config.monitorSkipChannels,
          monitorGain: config.monitorGain,
          broadcastGain: config.broadcastGain,
        });

        setSignalingPort(port);
        setStatus("broadcasting");
        addLog(`Broadcasting on port ${port}`);

        const wsUrl = `ws://127.0.0.1:${port}/ws`;
        const socket = new WebSocket(wsUrl);
        setWs(socket);

        socket.onopen = () => {
          addLog("WebSocket connected. Registering host...");
          socket.send(
            JSON.stringify({
              type: "register",
              sessionId: newSessionId,
              role: "host",
              clientId: clientId,
            }),
          );
        };

        socket.onmessage = async (evt) => {
          const msg = JSON.parse(evt.data);
          if (msg.type === "offer") {
            addLog(`Signal: Offer from receiver ${msg.from}`);
          }
        };

        socket.onclose = () => {
          addLog("Signaling WebSocket closed.");
        };
      } catch (e) {
        setStatus("error");
        addLog(`ERROR: ${String(e)}`);
      }
    },
    [addLog],
  );

  const stopHost = useCallback(async () => {
    addLog("Stopping host...");
    if (!isTauri) {
      setStatus("idle");
      return;
    }
    try {
      await invoke("stop_host");
      if (ws) ws.close();
      setWs(null);
      setSessionId(null);
      setSignalingPort(null);
      setStatus("idle");
      addLog("Host stopped successfully.");
    } catch (e) {
      addLog(`ERROR stopping host: ${String(e)}`);
    }
  }, [addLog, ws]);

  return useMemo(
    () => ({
      devices,
      outputDevices,
      sessionId,
      signalingPort,
      status,
      logs,
      startHost,
      stopHost,
      refreshDevices,
    }),
    [
      devices,
      outputDevices,
      sessionId,
      signalingPort,
      status,
      logs,
      startHost,
      stopHost,
      refreshDevices,
    ],
  );
};

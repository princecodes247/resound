import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DiscoveredHost, LogEntry } from "../types";

export const useAudioReceiver = () => {
  const [status, setStatus] = useState<
    "idle" | "discovering" | "connecting" | "receiving" | "error"
  >("idle");
  const [hosts, setHosts] = useState<DiscoveredHost[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedHost, setSelectedHost] = useState<DiscoveredHost | null>(null);

  const addLog = useCallback((message: string) => {
    setLogs((prev) => [
      ...prev,
      { time: new Date().toLocaleTimeString([], { hour12: false }), message },
    ]);
  }, []);

  const discoverHosts = async () => {
    setStatus("discovering");
    setLogs([]);
    addLog("Discovering hosts (mDNS)...");

    try {
      const data = await invoke<DiscoveredHost[]>("discover_hosts", {
        duration_ms: 3000,
        durationMs: 3000,
      });
      setHosts(data);
      setStatus("idle");
      addLog(`Found ${data.length} host(s).`);
    } catch (e) {
      setStatus("error");
      addLog(`Discovery error: ${String(e)}`);
    }
  };

  const connectAndPlay = async (host: DiscoveredHost, outputGain: number) => {
    setStatus("connecting");
    setSelectedHost(host);
    addLog(`Connecting to ${host.ip}:${host.port} (Native)...`);

    try {
      await invoke("start_receiver", {
        hostIp: host.ip,
        hostPort: host.port,
        sessionId: host.session_id,
        sampleRate: host.sample_rate || 44100,
        channels: host.channels || 2,
        outputGain,
      });
      setStatus("receiving");
      addLog("Playing (Native)");
    } catch (e) {
      setStatus("error");
      setSelectedHost(null);
      addLog(`Connection error: ${String(e)}`);
    }
  };

  const stopReceiver = async () => {
    addLog("Stopping receiver...");
    try {
      await invoke("stop_receiver");
      setStatus("idle");
      setSelectedHost(null);
      addLog("Receiver stopped.");
    } catch (e) {
      addLog(`Error stopping receiver: ${String(e)}`);
    }
  };

  return {
    status,
    hosts,
    logs,
    selectedHost,
    discoverHosts,
    connectAndPlay,
    stopReceiver,
  };
};

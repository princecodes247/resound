import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { DiscoveredHost, LogEntry } from "../types";
import { WebAudioEngine } from "./webAudioEngine";

// Detect if running in Tauri
const isTauri = !!(window as any).__TAURI_INTERNALS__;

export const useAudioReceiver = () => {
  const [status, setStatus] = useState<
    "idle" | "discovering" | "connecting" | "receiving" | "error"
  >("idle");
  const [hosts, setHosts] = useState<DiscoveredHost[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedHost, setSelectedHost] = useState<DiscoveredHost | null>(null);

  const webEngineRef = useRef<WebAudioEngine | null>(null);

  const addLog = useCallback((message: string) => {
    setLogs((prev) => [
      ...prev,
      { time: new Date().toLocaleTimeString([], { hour12: false }), message },
    ]);
  }, []);

  useEffect(() => {
    if (!isTauri && !webEngineRef.current) {
      webEngineRef.current = new WebAudioEngine({
        onLog: (msg) => addLog(msg),
        onStatusChange: (s) => setStatus(s as any),
      });
    }
    return () => {
      webEngineRef.current?.stop();
    };
  }, []);

  const discoverHosts = useCallback(async () => {
    if (!isTauri) {
      addLog(
        "mDNS discovery is not supported in the web browser. Please enter the host IP manually.",
      );
      setStatus("idle");
      return;
    }

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
  }, [addLog]);

  const connectAndPlay = useCallback(
    async (host: DiscoveredHost, outputGain: number) => {
      setStatus("connecting");
      setSelectedHost(host);
      addLog(
        `Connecting to ${host.ip}:${host.port} (${isTauri ? "Native" : "Web"})...`,
      );

      if (isTauri) {
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
      } else {
        webEngineRef.current?.start(
          host.ip,
          host.port,
          host.session_id,
          host.sample_rate || 44100,
          host.channels || 2,
          outputGain,
        );
      }
    },
    [addLog],
  );

  const stopReceiver = useCallback(async () => {
    addLog("Stopping receiver...");
    if (isTauri) {
      try {
        await invoke("stop_receiver");
        setStatus("idle");
        setSelectedHost(null);
        addLog("Receiver stopped.");
      } catch (e) {
        addLog(`Error stopping receiver: ${String(e)}`);
      }
    } else {
      webEngineRef.current?.stop();
      setSelectedHost(null);
      addLog("Web receiver stopped.");
    }
  }, [addLog]);

  const probeHost = useCallback(
    async (ip: string, port: number) => {
      if (isTauri) return null;

      addLog(`Probing ${ip}:${port}...`);
      try {
        const resp = await fetch(`http://${ip}:${port}/info`);
        if (!resp.ok) throw new Error("Host not found or not a Resound host.");

        const data = await resp.json();
        const host: DiscoveredHost = {
          name: data.name || "Manual Host",
          ip,
          port,
          session_id: data.session_id,
          sample_rate: data.sample_rate || 44100,
          channels: data.channels || 2,
        };

        setHosts((prev) => {
          if (prev.find((h) => h.ip === host.ip && h.port === host.port))
            return prev;
          return [...prev, host];
        });
        addLog(`Found host: ${host.name}`);
        return host;
      } catch (e) {
        addLog(`Probe failed: ${String(e)}`);
        return null;
      }
    },
    [addLog],
  );

  return useMemo(
    () => ({
      status,
      hosts,
      logs,
      selectedHost,
      discoverHosts,
      connectAndPlay,
      stopReceiver,
      probeHost,
      // Helper for web manual input
      addManualHost: (host: DiscoveredHost) => {
        setHosts((prev) => {
          if (prev.find((h) => h.ip === host.ip && h.port === host.port))
            return prev;
          return [...prev, host];
        });
      },
    }),
    [
      status,
      hosts,
      logs,
      selectedHost,
      discoverHosts,
      connectAndPlay,
      stopReceiver,
      probeHost,
    ],
  );
};

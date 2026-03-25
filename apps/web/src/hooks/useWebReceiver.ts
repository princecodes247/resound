import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { DiscoveredHost, LogEntry } from "@resound/shared";
import { WebAudioController } from "../audio/WebAudioController";

export const useWebReceiver = () => {
  const [hosts, setHosts] = useState<DiscoveredHost[]>([]);
  const [status, setStatus] = useState<
    | "idle"
    | "discovering"
    | "connecting"
    | "receiving"
    | "error"
    | "disconnected"
  >("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedHost, setSelectedHost] = useState<DiscoveredHost | null>(null);

  const controllerRef = useRef<WebAudioController | null>(null);

  const addLog = useCallback((message: string) => {
    setLogs((prev) => [
      ...prev,
      { time: new Date().toLocaleTimeString([], { hour12: false }), message },
    ]);
  }, []);

  if (!controllerRef.current) {
    controllerRef.current = new WebAudioController({
      onLog: addLog,
      onStatusChange: setStatus,
    });
  }

  const probeHost = useCallback(
    async (ip: string, port: number) => {
      addLog(`Probing ${ip}:${port}...`);
      setStatus("discovering");
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
        setStatus("idle");
        return host;
      } catch (e) {
        addLog(`Probe failed: ${String(e)}`);
        setStatus("error");
        return null;
      }
    },
    [addLog],
  );

  const connectAndPlay = useCallback(
    async (host: DiscoveredHost) => {
      addLog(`Connecting to ${host.name} (${host.ip}:${host.port})...`);
      setSelectedHost(host);
      await controllerRef.current?.start(
        host.ip,
        host.port,
        host.session_id,
        host.sample_rate,
        host.channels,
      );
    },
    [addLog],
  );

  const stopReceiver = useCallback(() => {
    addLog("Stopping receiver...");
    controllerRef.current?.stop();
    setSelectedHost(null);
  }, [addLog]);

  const discoverHosts = useCallback(async () => {
    addLog(
      "Discovery via mDNS is not supported in the browser. Use manual connect.",
    );
  }, [addLog]);

  useEffect(() => {
    return () => {
      controllerRef.current?.stop();
    };
  }, []);

  const addManualHost = useCallback((host: DiscoveredHost) => {
    setHosts((prev) => {
      if (prev.find((h) => h.ip === host.ip && h.port === host.port))
        return prev;
      return [...prev, host];
    });
  }, []);

  return useMemo(
    () => ({
      hosts,
      status,
      logs,
      selectedHost,
      discoverHosts,
      probeHost,
      connectAndPlay,
      stopReceiver,
      addManualHost,
    }),
    [
      hosts,
      status,
      logs,
      selectedHost,
      discoverHosts,
      probeHost,
      connectAndPlay,
      stopReceiver,
      addManualHost,
    ],
  );
};

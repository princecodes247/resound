import { useEffect } from "react";
import { AudioEngine } from "../audio/engine";

export function useReceiver(host?: string, sessionId?: string) {
  useEffect(() => {
    if (!host || !sessionId) return;
    const ws = new WebSocket(`ws://${host}/ws`);
    const audio = new AudioEngine();

    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "register",
          role: "receiver",
          sessionId,
          clientId: crypto.randomUUID(),
        }),
      );
    };

    ws.onmessage = (event) => {
      if (typeof event.data === "string") return;

      const buffer = event.data as ArrayBuffer;
      // skip timestamp (first 8 bytes)
      const samples = new Float32Array(buffer.slice(8));

      audio.enqueue(samples);
    };

    return () => {
      ws.close();
    };
  }, [host, sessionId]);
}

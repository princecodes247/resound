// WebAudioController.ts

export interface WebAudioControllerOptions {
  onLog: (message: string) => void;
  onStatusChange: (
    status: "idle" | "connecting" | "receiving" | "error",
  ) => void;
}

export class WebAudioController {
  private socket: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private options: WebAudioControllerOptions;
  private isReceiving = false;

  constructor(options: WebAudioControllerOptions) {
    this.options = options;
  }

  async start(
    hostIp: string,
    hostPort: number,
    sessionId: string,
    sampleRate: number = 44100,
    channels: number = 2,
  ) {
    if (this.isReceiving) return;
    this.isReceiving = true;
    this.options.onStatusChange("connecting");

    try {
      this.audioContext = new (
        window.AudioContext || (window as any).webkitAudioContext
      )({ sampleRate });

      // Load and add the worklet
      // Use URL constructor with import.meta.url for Vite
      const workletUrl = new URL("./processor.ts", import.meta.url).href;
      await this.audioContext.audioWorklet.addModule(workletUrl);

      this.workletNode = new AudioWorkletNode(
        this.audioContext,
        "resound-processor",
        {
          outputChannelCount: [channels],
        },
      );
      this.workletNode.connect(this.audioContext.destination);

      this.socket = new WebSocket(`ws://${hostIp}:${hostPort}/ws`);
      this.socket.binaryType = "arraybuffer";

      this.socket.onopen = () => {
        this.options.onLog("WebSocket connected. Registering...");
        this.socket?.send(
          JSON.stringify({
            type: "register",
            role: "receiver",
            sessionId,
            clientId: "web-client-" + Math.random().toString(36).substring(7),
          }),
        );
        this.options.onStatusChange("receiving");
      };

      this.socket.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          const pcmData = new Float32Array(event.data.slice(8));
          this.workletNode?.port.postMessage({
            type: "audio-data",
            payload: pcmData,
          });
        }
      };

      this.socket.onclose = () => {
        this.options.onLog("WebSocket closed.");
        this.stop();
      };

      this.socket.onerror = (err) => {
        this.options.onLog(`WebSocket error: ${err}`);
        this.options.onStatusChange("error");
      };
    } catch (e) {
      this.options.onLog(`Failed to start web audio logic: ${String(e)}`);
      this.options.onStatusChange("error");
      this.isReceiving = false;
    }
  }

  stop() {
    this.socket?.close();
    this.socket = null;
    this.workletNode?.disconnect();
    this.workletNode = null;
    this.audioContext?.close();
    this.audioContext = null;
    this.isReceiving = false;
    this.options.onStatusChange("idle");
  }
}

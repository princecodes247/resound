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
      this.options.onLog(`Initializing AudioContext at ${sampleRate}Hz...`);
      this.audioContext = new (
        window.AudioContext || (window as any).webkitAudioContext
      )({ sampleRate: 48000 });
      // )({ sampleRate });
      this.options.onLog(
        `AudioContext created. Actual Sample Rate: ${this.audioContext.sampleRate} Hz. State: ${this.audioContext.state}`,
      );

      if (this.audioContext.state === "suspended") {
        this.options.onLog("Resuming AudioContext...");
        await this.audioContext.resume();
      }

      // Load and add the worklet
      const workletUrl = new URL("./processor.ts", import.meta.url).href;
      await this.audioContext.audioWorklet.addModule(workletUrl);
      this.options.onLog("Worklet loaded successfully");
      console.log("Worklet loaded successfully");
      this.workletNode = new AudioWorkletNode(
        this.audioContext,
        "resound-processor",
        {
          outputChannelCount: [channels],
        },
      );
      this.workletNode.connect(this.audioContext.destination);

      const wsUrl = `ws://${hostIp}:${hostPort}/ws`;
      this.options.onLog(`Connecting to ${wsUrl}...`);
      this.socket = new WebSocket(wsUrl);
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

      let packetCount = 0;
      this.socket.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          packetCount++;
          const audioBytes = event.data.slice(8);

          // ensure alignment
          if (audioBytes.byteLength % 4 !== 0) {
            this.options.onLog("Misaligned audio packet — dropping");
            return;
          }

          const view = new DataView(event.data);
          const timestamp = Number(view.getBigUint64(0, true));

          const pcmData = new Float32Array(audioBytes);
          if (packetCount % 100 === 0) {
            this.options.onLog(
              `Received 100 packets. Last: ${pcmData.length} samples (${channels} ch).`,
            );
          }
          this.workletNode?.port.postMessage({
            type: "audio-data",
            payload: pcmData,
            channels,
            sampleRate,
          });
        }
      };

      this.socket.onclose = () => {
        this.options.onLog("WebSocket closed.");
        this.stop();
      };

      this.socket.onerror = (err) => {
        this.options.onLog(`WebSocket error: ${String(err)}`);
        this.options.onStatusChange("error");
      };
    } catch (e) {
      this.options.onLog(`Failed to start web audio logic: ${String(e)}`);
      console.log(`Failed to start web audio logic: ${String(e)}`);
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

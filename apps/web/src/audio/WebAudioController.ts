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
  private nextStartTime = 0;
  private useWorklet = true;

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

      if (this.audioContext.audioWorklet) {
        this.options.onLog("AudioWorklet supported. Loading module...");
        const workletUrl = new URL("./processor.ts", import.meta.url).href;
        await this.audioContext.audioWorklet.addModule(workletUrl);
        this.options.onLog("Worklet loaded successfully");

        this.workletNode = new AudioWorkletNode(
          this.audioContext,
          "resound-processor",
          {
            outputChannelCount: [channels],
          },
        );
        this.workletNode.connect(this.audioContext.destination);
        this.useWorklet = true;
      } else {
        this.options.onLog(
          "AudioWorklet NOT supported (Insecure context?). Using legacy fallback.",
        );
        this.useWorklet = false;
        this.nextStartTime = this.audioContext.currentTime;
      }

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

          const pcmData = new Float32Array(audioBytes);
          if (packetCount % 100 === 0) {
            this.options.onLog(
              `Received 100 packets. Last: ${pcmData.length} samples (${channels} ch).`,
            );
          }

          if (this.useWorklet && this.workletNode) {
            this.workletNode.port.postMessage({
              type: "audio-data",
              payload: pcmData,
              channels,
              sampleRate,
            });
          } else if (this.audioContext) {
            this.playFallback(pcmData, channels, sampleRate);
          }
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

  private playFallback(
    data: Float32Array,
    channels: number,
    sourceRate: number,
  ) {
    if (!this.audioContext) return;

    const numFrames = data.length / channels;
    const buffer = this.audioContext.createBuffer(
      channels,
      numFrames,
      sourceRate,
    );

    for (let c = 0; c < channels; c++) {
      const channelData = buffer.getChannelData(c);
      for (let i = 0; i < numFrames; i++) {
        channelData[i] = data[i * channels + c];
      }
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);

    // Schedule slightly in the future to avoid gaps
    const now = this.audioContext.currentTime;
    if (this.nextStartTime < now) {
      this.nextStartTime = now + 0.1; // 100ms head start
    }

    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;
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

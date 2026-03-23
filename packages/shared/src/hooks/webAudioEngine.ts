export interface WebAudioEngineOptions {
  onLog: (message: string) => void;
  onStatusChange: (
    status: "idle" | "connecting" | "receiving" | "error",
  ) => void;
}

export class WebAudioEngine {
  private socket: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private startTime: number = 0;
  private scheduledTime: number = 0;
  private isPlaying: boolean = false;
  private options: WebAudioEngineOptions;

  constructor(options: WebAudioEngineOptions) {
    this.options = options;
  }

  async start(
    hostIp: string,
    hostPort: number,
    sessionId: string,
    sampleRate: number = 44100,
    channels: number = 2,
    outputGain: number = 1.0,
  ) {
    this.options.onStatusChange("connecting");
    this.options.onLog(`Connecting to ws://${hostIp}:${hostPort}/ws...`);

    try {
      this.audioContext = new (
        window.AudioContext || (window as any).webkitAudioContext
      )({
        sampleRate,
      });

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
          this.handleAudioPacket(event.data, channels, outputGain);
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
      this.options.onLog(`Failed to start web audio: ${e}`);
      this.options.onStatusChange("error");
    }
  }

  private handleAudioPacket(
    data: ArrayBuffer,
    channels: number,
    outputGain: number,
  ) {
    if (!this.audioContext || this.audioContext.state === "closed") return;

    // Packet format: [8 bytes timestamp] [PCM f32 samples]
    const pcmData = new Float32Array(data.slice(8));
    const numFrames = pcmData.length / channels;

    const audioBuffer = this.audioContext.createBuffer(
      channels,
      numFrames,
      this.audioContext.sampleRate,
    );

    for (let c = 0; c < channels; c++) {
      const channelData = audioBuffer.getChannelData(c);
      for (let i = 0; i < numFrames; i++) {
        channelData[i] = pcmData[i * channels + c] * outputGain;
      }
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    if (!this.isPlaying) {
      this.startTime = this.audioContext.currentTime + 0.1; // small buffer
      this.scheduledTime = this.startTime;
      this.isPlaying = true;
    }

    // Scheduling
    const duration = audioBuffer.duration;
    source.start(this.scheduledTime);
    this.scheduledTime += duration;

    // Catch up logic if we drift too much
    if (this.scheduledTime < this.audioContext.currentTime) {
      this.scheduledTime = this.audioContext.currentTime + 0.05;
    }
  }

  stop() {
    this.socket?.close();
    this.socket = null;
    this.audioContext?.close();
    this.audioContext = null;
    this.isPlaying = false;
    this.options.onStatusChange("idle");
  }
}

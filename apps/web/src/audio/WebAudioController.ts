export interface WebAudioControllerOptions {
  onLog: (message: string) => void;
  onStatusChange: (
    status: "idle" | "connecting" | "receiving" | "error" | "disconnected",
  ) => void;
}

export class WebAudioController {
  private socket: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private eqChain: {
    lowShelf: BiquadFilterNode;
    peaking: BiquadFilterNode;
    highShelf: BiquadFilterNode;
  } | null = null;
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
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      )({ sampleRate: 48000 });

      if (!this.audioContext) {
        throw new Error("Could not create AudioContext");
      }

      this.options.onLog(
        `AudioContext created. Actual Sample Rate: ${this.audioContext.sampleRate} Hz. State: ${this.audioContext.state}`,
      );

      if (this.audioContext.state === "suspended") {
        this.options.onLog("Resuming AudioContext...");
        await this.audioContext.resume();
      }

      if (this.audioContext.audioWorklet) {
        this.options.onLog("AudioWorklet supported. Loading module...");

        // In dev, use relative path. In prod, use the bundled asset path.
        const isDev = import.meta.env.DEV;
        const workletUrl = isDev
          ? new URL("./processor.ts", import.meta.url).href
          : "/assets/processor.js";

        await this.audioContext.audioWorklet.addModule(workletUrl);
        this.options.onLog("Worklet loaded successfully");

        this.workletNode = new AudioWorkletNode(
          this.audioContext,
          "resound-processor",
          {
            outputChannelCount: [channels],
          },
        );

        // Enhance audio with EQ
        const eq = this.createEQChain(this.audioContext);
        this.workletNode.connect(eq.lowShelf);
        eq.highShelf.connect(this.audioContext.destination);
        this.eqChain = eq;

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
        } else if (typeof event.data === "string") {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "host_disconnected") {
              this.options.onLog("Host disconnected explicitly.");
              this.stop("disconnected");
            }
          } catch {
            // ignore
          }
        }
      };

      this.socket.onclose = () => {
        this.options.onLog("WebSocket closed.");
        if (this.isReceiving) {
          this.options.onLog(
            "Abrupt disconnect detected (socket closed while receiving).",
          );
          this.stop("disconnected");
        } else {
          this.stop("idle");
        }
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

    if (this.eqChain) {
      source.connect(this.eqChain.lowShelf);
    } else {
      source.connect(this.audioContext.destination);
    }

    // Schedule slightly in the future to avoid gaps
    const now = this.audioContext.currentTime;
    const targetLeadTime = 0.04; // 40ms head start for local network

    if (this.nextStartTime < now) {
      // Underflow: restart with target lead time
      this.nextStartTime = now + targetLeadTime;
    } else if (this.nextStartTime > now + 0.3) {
      // Overflow (Lag): If we are > 300ms ahead, jump forward to catch up
      this.nextStartTime = now + targetLeadTime;
    }

    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;
  }

  stop(finalStatus: "idle" | "disconnected" = "idle") {
    const wasReceiving = this.isReceiving;
    this.isReceiving = false;

    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }

    if (this.eqChain) {
      this.eqChain.lowShelf.disconnect();
      this.eqChain.peaking.disconnect();
      this.eqChain.highShelf.disconnect();
      this.eqChain = null;
    }

    this.workletNode?.disconnect();
    this.workletNode = null;
    this.audioContext?.close();
    this.audioContext = null;

    if (wasReceiving || finalStatus !== "idle") {
      this.options.onStatusChange(finalStatus);
    }
  }

  private createEQChain(ctx: AudioContext) {
    // Low Shelf: Boost bass
    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = "lowshelf";
    lowShelf.frequency.value = 180;
    lowShelf.gain.value = 7.0; // Significant bass boost

    // Peaking: Add warmth and punch
    const peaking = ctx.createBiquadFilter();
    peaking.type = "peaking";
    peaking.frequency.value = 400;
    peaking.Q.value = 0.7;
    peaking.gain.value = 2.0;

    // High Shelf: Smooth out the "dry" highs
    const highShelf = ctx.createBiquadFilter();
    highShelf.type = "highshelf";
    highShelf.frequency.value = 8000;
    highShelf.gain.value = -3.0; // Gentle roll-off

    // Connect them
    lowShelf.connect(peaking);
    peaking.connect(highShelf);

    return { lowShelf, peaking, highShelf };
  }
}

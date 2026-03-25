/* eslint-disable */
// @ts-nocheck

class ResoundProcessor extends AudioWorkletProcessor {
  private ringBuffer: Float32Array;
  private writeIndex = 0;
  private readIndex = 0;
  private bufferSize = 48000 * 4; // 4 seconds headroom
  private samplesAvailable = 0;
  private inputChannels = 2;
  private sourceRate = 44100;
  private resampleRatio = 1.0;
  private fractionalIndex = 0;
  private clockOffset = 0;
  private baseTime = 0;
  private lastPacketTimestamp = 0;
  private samplesSinceLastPacket = 0;
  private isFirstPacket = true;

  constructor() {
    super();
    this.ringBuffer = new Float32Array(this.bufferSize);
    this.sourceRate = 44100; // Default
    this.resampleRatio = this.sourceRate / sampleRate;

    this.port.onmessage = (event) => {
      const {
        type,
        payload,
        channels,
        sampleRate: sRate,
        timestamp,
        offset,
      } = event.data;
      if (type === "audio-data") {
        if (channels) this.inputChannels = channels;
        if (sRate && sRate !== this.sourceRate) {
          this.sourceRate = sRate;
          this.resampleRatio = this.sourceRate / sampleRate;
        }
        this.pushData(payload, timestamp);
      } else if (type === "sync-offset") {
        this.clockOffset = offset;
        if (baseTime) this.baseTime = baseTime;
      }
    };
  }

  private pushData(data: Float32Array, timestamp: number) {
    if (this.isFirstPacket && timestamp > 0) {
      this.lastPacketTimestamp = timestamp;
      this.isFirstPacket = false;
    }

    if (timestamp > 0) {
      // If we get a new timestamp, align our internal counter
      // This handles packets arriving out of order or gaps
      this.lastPacketTimestamp = timestamp;
      this.samplesSinceLastPacket = 0;
    }

    for (let i = 0; i < data.length; i++) {
      this.ringBuffer[this.writeIndex] = data[i];
      this.writeIndex = (this.writeIndex + 1) % this.bufferSize;

      if (this.samplesAvailable >= this.bufferSize) {
        // buffer full → overwrite oldest sample
        this.readIndex = (this.readIndex + 1) % this.bufferSize;
      } else {
        this.samplesAvailable++;
      }
    }
  }
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {
    const output = outputs[0];
    if (!output || !output[0]) return true;

    const numOutputChannels = output.length;
    const numFrames = output[0].length;

    // High-precision clock sync logic
    // hostNow is the current time in the host's timeline
    const hostNow = currentTime * 1000 + this.baseTime + this.clockOffset;

    let driftAdjustment = 1.0;
    if (this.lastPacketTimestamp > 0 && this.samplesAvailable > 0) {
      // The timestamp in the packet IS the intended playout time.
      const currentBufferMs =
        ((this.samplesAvailable / this.inputChannels) * 1000) / sampleRate;
      const tailHostTime = this.lastPacketTimestamp - currentBufferMs;

      // Error is how far away we are from the "correct" sample.
      const error = tailHostTime - hostNow;

      if (error > 20) {
        // Too early! Output silence instead of playing.
        for (let i = 0; i < numFrames; i++) {
          for (let oc = 0; oc < numOutputChannels; oc++) {
            output[oc][i] = 0;
          }
        }
        return true;
      }

      if (error < -500) {
        // Too late! Jump forward
        this.samplesAvailable = 0;
        this.isFirstPacket = true;
        return true;
      }

      // P-controller for sub-millisecond sync
      driftAdjustment = 1.0 + (error / 150.0) * 0.1; // 10% max adjustment
      driftAdjustment = Math.max(0.98, Math.min(1.02, driftAdjustment));
    }

    const effectiveRatio = this.resampleRatio * driftAdjustment;

    // Minimum buffer to start (avoid immediate underrun)
    const minBuffer = Math.max(480 * 4, this.inputChannels * 128 * 2); // ~40ms

    if (this.samplesAvailable < minBuffer) {
      return true;
    }

    for (let i = 0; i < numFrames; i++) {
      const baseIndex = Math.floor(this.fractionalIndex);
      const nextIndex = baseIndex + 1;
      const alpha = this.fractionalIndex - baseIndex;

      if (this.samplesAvailable >= (nextIndex + 1) * this.inputChannels) {
        for (let oc = 0; oc < numOutputChannels; oc++) {
          const inIdx1 =
            baseIndex * this.inputChannels +
            (this.inputChannels > 1 ? oc % this.inputChannels : 0);
          const inIdx2 =
            nextIndex * this.inputChannels +
            (this.inputChannels > 1 ? oc % this.inputChannels : 0);

          const s1 =
            this.ringBuffer[(this.readIndex + inIdx1) % this.bufferSize];
          const s2 =
            this.ringBuffer[(this.readIndex + inIdx2) % this.bufferSize];

          output[oc][i] = s1 + (s2 - s1) * alpha;
        }

        this.fractionalIndex += effectiveRatio;

        const framesToAdvance = Math.floor(this.fractionalIndex);
        if (framesToAdvance > 0) {
          this.readIndex =
            (this.readIndex + framesToAdvance * this.inputChannels) %
            this.bufferSize;
          this.samplesAvailable -= framesToAdvance * this.inputChannels;
          this.fractionalIndex -= framesToAdvance;
        }
      } else {
        for (let oc = 0; oc < numOutputChannels; oc++) {
          output[oc][i] = 0;
        }
      }
    }

    return true;
  }
}

registerProcessor("resound-processor", ResoundProcessor);

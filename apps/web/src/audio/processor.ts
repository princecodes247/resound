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

  constructor() {
    super();
    this.ringBuffer = new Float32Array(this.bufferSize);
    this.sourceRate = 44100; // Default
    this.resampleRatio = this.sourceRate / sampleRate;

    this.port.onmessage = (event) => {
      const { type, payload, channels, sampleRate: sRate } = event.data;
      if (type === "audio-data") {
        if (channels) this.inputChannels = channels;
        if (sRate && sRate !== this.sourceRate) {
          this.sourceRate = sRate;
          this.resampleRatio = this.sourceRate / sampleRate;
        }
        this.pushData(payload);
      }
    };
  }

  private pushData(data: Float32Array) {
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

    // Minimum buffer to start (avoid immediate underrun)
    const minBuffer = Math.max(480 * 10, this.inputChannels * 128 * 4);

    if (this.samplesAvailable < minBuffer) {
      return true;
    }

    for (let i = 0; i < numFrames; i++) {
      // We need to read 'resampleRatio' worth of frames from the ring buffer
      // for every 1 frame of output.
      // We use linear interpolation between frames.

      const baseIndex = Math.floor(this.fractionalIndex);
      const nextIndex = baseIndex + 1;
      const alpha = this.fractionalIndex - baseIndex;

      // Ensure we have enough data in the ring buffer for the current and next frame
      // (multiplied by channels)
      if (this.samplesAvailable >= (nextIndex + 1) * this.inputChannels) {
        for (let oc = 0; oc < numOutputChannels; oc++) {
          // If mono input, use channel 0 for both
          // If stereo input, map directly
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

        this.fractionalIndex += this.resampleRatio;

        // Advance the readIndex when fractionalIndex crosses an integer
        const framesToAdvance = Math.floor(this.fractionalIndex);
        if (framesToAdvance > 0) {
          this.readIndex =
            (this.readIndex + framesToAdvance * this.inputChannels) %
            this.bufferSize;
          this.samplesAvailable -= framesToAdvance * this.inputChannels;
          this.fractionalIndex -= framesToAdvance;
        }
      } else {
        // Underrun
        for (let oc = 0; oc < numOutputChannels; oc++) {
          output[oc][i] = 0;
        }
      }
    }

    return true;
  }
}

registerProcessor("resound-processor", ResoundProcessor);

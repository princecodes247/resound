/* eslint-disable */
// @ts-nocheck

class ResoundProcessor extends AudioWorkletProcessor {
  private buffer: Float32Array[] = [];
  private writeIndex = 0;
  private readIndex = 0;
  private bufferSize = 48000 * 2; // 2 seconds of mono/interleaved storage
  private ringBuffer: Float32Array;
  private samplesAvailable = 0;

  constructor() {
    super();
    this.ringBuffer = new Float32Array(this.bufferSize);
    this.port.onmessage = (event) => {
      const { type, payload } = event.data;
      if (type === "audio-data") {
        this.pushData(payload);
      }
    };
  }

  private pushData(data: Float32Array) {
    for (let i = 0; i < data.length; i++) {
      this.ringBuffer[this.writeIndex] = data[i];
      this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
      this.samplesAvailable++;
    }
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {
    const output = outputs[0];
    const numChannels = output.length;
    const numFrames = output[0].length;

    // Minimum buffer to start (avoid immediate underrun)
    const minBuffer = 480 * 4; // ~40ms at 48kHz
    if (
      this.samplesAvailable < minBuffer &&
      this.samplesAvailable < this.bufferSize / 2
    ) {
      // Silent while buffering
      return true;
    }

    for (let i = 0; i < numFrames; i++) {
      for (let c = 0; c < numChannels; c++) {
        if (this.samplesAvailable > 0) {
          output[c][i] = this.ringBuffer[this.readIndex];
          // If we have more than 1 channel in output but mono in ring, we'd need to handle that.
          // For now, assume interleaved or handled by the pusher.
          // Let's assume interleaved [L, R, L, R] in ringBuffer if multi-channel.
          this.readIndex = (this.readIndex + 1) % this.bufferSize;
          this.samplesAvailable--;
        } else {
          output[c][i] = 0;
        }
      }
    }

    return true;
  }
}

registerProcessor("resound-processor", ResoundProcessor);

export class AudioEngine {
  private ctx: AudioContext;
  private queue: Float32Array[] = [];
  private isPlaying = false;

  constructor() {
    this.ctx = new AudioContext();
  }

  enqueue(samples: Float32Array) {
    this.queue.push(samples);
    if (!this.isPlaying) {
      this.play();
    }
  }

  private async play() {
    this.isPlaying = true;

    while (this.queue.length > 0) {
      const chunk = this.queue.shift()!;

      const buffer = this.ctx.createBuffer(
        1, // mono for now
        chunk.length,
        this.ctx.sampleRate,
      );

      buffer.copyToChannel(chunk, 0);

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.ctx.destination);

      source.start();

      // Wait for playback duration
      await new Promise((r) =>
        setTimeout(r, (chunk.length / this.ctx.sampleRate) * 1000),
      );
    }

    this.isPlaying = false;
  }
}

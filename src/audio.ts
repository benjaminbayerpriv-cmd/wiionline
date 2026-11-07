/** Bounded PCM playback. AudioContext is created only after an explicit click. */
export class AudioOutput {
  private context?: AudioContext;
  private nextTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  async enable() {
    this.context ??= new AudioContext();
    await this.context.resume();
  }
  play(pcm: ArrayBuffer, sampleRate: number) {
    const context = this.context;
    if (!context || context.state !== 'running') return;
    if (sampleRate < 8000 || sampleRate > 192000 || pcm.byteLength % 8 !== 0 || pcm.byteLength === 0) return;
    // Drop stale/oversized chunks rather than accumulate playback latency.
    const frames = pcm.byteLength / 8;
    if (frames / sampleRate > 0.25 || this.nextTime > context.currentTime + 0.25) return;
    const data = new Float32Array(pcm);
    const buffer = context.createBuffer(2, frames, sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const output = buffer.getChannelData(channel);
      for (let i = 0; i < frames; i++) output[i] = data[i * 2 + channel];
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = () => { source.disconnect(); this.sources.delete(source); };
    this.sources.add(source);
    this.nextTime = Math.max(context.currentTime + 0.015, this.nextTime);
    source.start(this.nextTime);
    this.nextTime += buffer.duration;
  }
  clear() {
    for (const source of this.sources) { source.stop(); source.disconnect(); }
    this.sources.clear();
    this.nextTime = 0;
  }
}

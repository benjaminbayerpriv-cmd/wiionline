import type { CoreEvent } from './protocol';
import type { DolphinModule } from './dolphin-adapter';
type AudioEvent = Extract<CoreEvent, { type: 'audio' }>;
export function createAudioBridge(module: DolphinModule) {
  const exports = ['MixAudio', 'AudioBuffer', 'AudioBufferFrames', 'AudioSampleRate', 'SetAudioMuted'];
  if (!(module.HEAPU8 instanceof Uint8Array) || !exports.every(name => typeof module[`_${name}`] === 'function')) return undefined;
  const number = (name: string, values: number[] = []) => Number(module.ccall(name, 'number', values.map(() => 'number'), values));
  return {
    read(elapsedMs: number): AudioEvent | null {
      const rate = number('AudioSampleRate');
      const capacity = number('AudioBufferFrames');
      if (!Number.isInteger(rate) || rate < 8000 || rate > 192000 || !Number.isInteger(capacity) || capacity < 1 || capacity > 4096) throw new Error('Ungültiges natives PCM-Format.');
      if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return null;
      // Bound catch-up after a stalled tab; never request seconds of stale audio.
      const requested = Math.min(capacity, Math.floor(rate * Math.min(elapsedMs, 80) / 1000));
      if (requested === 0) return null;
      const frames = number('MixAudio', [requested]);
      if (frames === 0) return null;
      if (!Number.isInteger(frames) || frames < 0 || frames > requested) throw new Error('Ungültige native PCM-Länge.');
      const ptr = number('AudioBuffer');
      const heap = module.HEAPU8 as Uint8Array;
      if (!Number.isInteger(ptr) || ptr <= 0 || ptr % 2 !== 0 || ptr + frames * 4 > heap.byteLength) throw new Error('Nativer PCM-Puffer liegt außerhalb des Speichers.');
      const pcm = new Float32Array(frames * 2);
      const input = new Int16Array(heap.buffer, heap.byteOffset + ptr, frames * 2);
      for (let i = 0; i < input.length; i++) pcm[i] = input[i] / 32768;
      return { type: 'audio', sampleRate: rate, channels: 2, pcm: pcm.buffer };
    },
  };
}

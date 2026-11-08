import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAudioBridge } from '../src/native-audio';
import type { DolphinModule } from '../src/dolphin-adapter';
function fixture() {
  const heap = new Uint8Array(new SharedArrayBuffer(4096));
  const ptr = 64;
  new Int16Array(heap.buffer, ptr, 4).set([-32768, 32767, -16384, 16384]);
  const requests: number[] = [];
  const module = {
    HEAPU8: heap,
    ...Object.fromEntries(['MixAudio','AudioBuffer','AudioBufferFrames','AudioSampleRate','SetAudioMuted'].map(name => [`_${name}`, () => {}])),
    ccall(name: string, _result: unknown, _types: unknown, values: number[]) {
      if (name === 'AudioSampleRate') return 48000;
      if (name === 'AudioBufferFrames') return 2;
      if (name === 'AudioBuffer') return ptr;
      if (name === 'MixAudio') { requests.push(values[0]); return 2; }
      return 1;
    },
  } as unknown as DolphinModule;
  return { module, heap, requests };
}
test('native signed stereo PCM becomes a private transferable float32 chunk', () => {
  const f = fixture(); const audio = createAudioBridge(f.module)!.read(20)!;
  assert.equal(audio.sampleRate, 48000); assert.equal(audio.channels, 2);
  assert.deepEqual([...new Float32Array(audio.pcm)], [-1,32767/32768,-.5,.5]);
  assert.ok(!(audio.pcm instanceof SharedArrayBuffer));
  f.heap.fill(0);
  assert.equal(new Float32Array(audio.pcm)[0], -1);
  assert.deepEqual(f.requests, [2]);
});
test('audio cannot read past the WASM heap', () => {
  const f = fixture(); const base = f.module.ccall;
  f.module.ccall = (name, result, types, values) => name === 'AudioBuffer' ? 4094 : base(name,result,types,values);
  assert.throws(() => createAudioBridge(f.module)!.read(20), /außerhalb/);
});
test('missing native audio remains unavailable and invalid time produces no chunk', () => {
  const f = fixture();
  assert.equal(createAudioBridge(f.module)!.read(NaN), null);
  delete f.module._MixAudio;
  assert.equal(createAudioBridge(f.module), undefined);
});

// Unit test of graphics/bridge/frame-bridge.mjs against a FAKE module. This only checks
// the bridge's own contract (byte order, copy, torn-frame handling). It is NOT evidence
// of emulation; the fake lives only here.
import assert from 'node:assert/strict';
import { createFrameBridge } from '../graphics/bridge/frame-bridge.mjs';

function fakeModule(w, h) {
  const heap = new Uint8Array(new SharedArrayBuffer(1 << 20));
  const ptr = 4096;
  const px = new Uint32Array(heap.buffer, ptr, w * h);
  let frame = 0;
  let onSecondGetFrame = null;
  let calls = 0;
  return {
    HEAPU8: heap,
    setPixel(i, abgr) { px[i] = abgr; },
    advance() { frame++; },
    tearNextRead() { onSecondGetFrame = () => frame++; calls = 0; },
    _FrameWidth: () => w, _FrameHeight: () => h, _FrameBuffer: () => ptr,
    _GetFrame: () => { if (onSecondGetFrame && ++calls === 2) { onSecondGetFrame(); onSecondGetFrame = null; } return frame; },
  };
}

const M = fakeModule(2, 2);
const b = createFrameBridge(M);

// 1. first read delivers (counter 0 differs from lastFrame -1); second read has no new frame
M.setPixel(0, 0xff332211); // A=ff B=33 G=22 R=11 -> bytes R,G,B,A
M.setPixel(3, 0xff000000);
const ev = b.read();
assert.equal(ev.type, 'frame');
assert.deepEqual([ev.width, ev.height], [2, 2]);
assert.equal(ev.rgba.byteLength, 16);
assert.ok(!(ev.rgba instanceof SharedArrayBuffer), 'must be a transferable copy');
assert.deepEqual([...new Uint8Array(ev.rgba, 0, 4)], [0x11, 0x22, 0x33, 0xff], 'RGBA byte order');
assert.equal(b.read(), null);

// 2. copy is private: later heap writes do not alter a delivered frame
M.setPixel(0, 0xffffffff); M.advance();
assert.deepEqual([...new Uint8Array(ev.rgba, 0, 4)], [0x11, 0x22, 0x33, 0xff]);
assert.deepEqual([...new Uint8Array(b.read().rgba, 0, 4)], [255, 255, 255, 255]);

// 3. torn frame (counter changes during copy) is dropped and counted
M.advance(); M.tearNextRead();
assert.equal(b.read(), null);
assert.equal(b.stats.torn, 1);

// 4. invalid geometry is skipped, not copied
const bad = createFrameBridge({ ...fakeModule(2, 2), _FrameWidth: () => 0 });
assert.equal(bad.read(), null);
assert.equal(bad.stats.skipped, 1);

console.log('frame-bridge contract tests: OK (fake module; not emulation evidence)');

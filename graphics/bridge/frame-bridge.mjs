// Frame bridge: Dolphin WASM core (native/src/dolphin_web_discio.cpp, pinned in
// docs/upstream.json) -> protocol.ts `{ type: 'frame', width, height, rgba }`.
//
// The core decodes the XFB (YUYV) into `s_framebuffer`, a std::array<uint32_t> that
// is written by the emulation thread as 0xAABBGGRR little-endian words, i.e. bytes
// R,G,B,A in memory: exactly RGBA8 as required by the protocol baseline. Exports used
// (all already in the EXPORTED_FUNCTIONS list of core-wasm 9ac4a6a):
//   _FrameWidth _FrameHeight _FrameBuffer _GetFrame _GetFrameSignalPtr
// plus the runtime method HEAPU8. No new core export is required for this baseline.
//
// Usage inside the worker that owns the module `M` (createDolphinCore()):
//   const bridge = createFrameBridge(M);
//   const ev = bridge.read();            // null if no new frame since last read
//   if (ev) postMessage(ev, [ev.rgba]);  // ArrayBuffer is a private copy, transferable
//
// Limits (documented, not hidden):
//  * The core has a single framebuffer and no double buffering. A copy can overlap with
//    the next XFB decode. read() re-checks the frame counter after copying and reports
//    `torn` when it changed. Torn frames are dropped unless allowTorn is set.
//  * `width/height` are the *presentation* size (SetPresentationScale), not always 640x480.
//  * Each frame costs a w*h*4 copy out of the (shared) wasm heap; this is the correctness
//    baseline only. Do not quote it as a performance design.

export function createFrameBridge(M, { allowTorn = false } = {}) {
  const call = (name) => M[`_${name}`] ?? ((...a) => M.ccall(name, 'number', a.map(() => 'number'), a));
  const frameWidth = call('FrameWidth');
  const frameHeight = call('FrameHeight');
  const frameBuffer = call('FrameBuffer');
  const getFrame = call('GetFrame');
  const stats = { delivered: 0, torn: 0, skipped: 0, lastFrame: -1 };

  return {
    stats,
    /** Returns a protocol `frame` event for a new frame, or null. */
    read() {
      const before = getFrame() >>> 0;
      if (before === stats.lastFrame) return null;
      const width = frameWidth();
      const height = frameHeight();
      const ptr = frameBuffer();
      const bytes = width * height * 4;
      if (!(width > 0 && height > 0) || ptr === 0 || ptr + bytes > M.HEAPU8.length) {
        stats.skipped++;
        return null;
      }
      // slice() of a Uint8Array over a SharedArrayBuffer yields a non-shared copy.
      const rgba = M.HEAPU8.slice(ptr, ptr + bytes).buffer;
      const after = getFrame() >>> 0;
      stats.lastFrame = before;
      if (after !== before) {
        stats.torn++;
        if (!allowTorn) return null;
      }
      stats.delivered++;
      return { type: 'frame', width, height, rgba };
    },
    /** Resolves when the core publishes a new frame (Atomics on _GetFrameSignalPtr). */
    async waitForFrame(timeoutMs = 1000) {
      const ptr = M._GetFrameSignalPtr();
      const cell = new Int32Array(M.HEAPU8.buffer, ptr, 1);
      const seen = Atomics.load(cell, 0);
      if (typeof Atomics.waitAsync !== 'function') throw new Error('Atomics.waitAsync unavailable');
      const r = Atomics.waitAsync(cell, 0, seen, timeoutMs);
      return (r.async ? await r.value : r.value) !== 'timed-out';
    },
  };
}

# AV status (remote Claude: graphics, then audio)

Upstream: `dolphin-emu/dolphin` @ `4a70679d0adcd17220568f5c18d2d4005eeea0a2` (docs/upstream.json, inspected read-only).
Scope of findings: sections 1 and 2 were derived from source at the SHA above only (`4a70679d…`, the earlier candidate baseline). The core agent has since moved to `wasm-dolphin` @ Dolphin `e22551e…` with Emscripten 5.0.7 (full SHAs and patch origin pending on `claude/core-wasm`); **they must be re-verified against that revision before they are relied on.** Sections 3 and 4 do not depend on a Dolphin revision.
Status: **assessment + isolated precheck only. No Dolphin code runs in a browser yet; no Wii-produced frame exists yet.**

## 1. Backend inventory (LOC = .cpp/.h in `Source/Core/VideoBackends/<dir>`; `VideoCommon` is 61k LOC and shared)

| Backend | LOC | Built by CMake | Browser practicality |
|---|---|---|---|
| OGL | 5.7k | always | **Best.** Has a GLES 3.0 path (`OGLConfig.cpp`, `GlslEs300`, `#version 300 es`), which is what WebGL2 exposes. Emscripten maps GLES3 to WebGL2. |
| Vulkan | 10.0k | `ENABLE_VULKAN` | Needs a SPIR-V (shaderc/glslang) to WGSL path, a WebGPU port of ~10k LOC, and async buffer mapping vs. Dolphin's synchronous readbacks. High effort. |
| Software | 6.7k | always | Pure CPU rasteriser (plus an optional GL presentation window). Runs anywhere C++ runs, so it is the **fallback and correctness oracle**, but far too slow for games. Useful for the first homebrew frame. |
| Null | 0.6k | always | No output. Useful for CPU-only bring-up. |
| D3D / D3D12 / D3DCommon | 10.1k | WIN32 only | Not applicable. |
| Metal | 1.0k | APPLE only | Not applicable. |

Dolphin has **zero** Emscripten/`__EMSCRIPTEN__` references at this commit. The whole port (Common/GL context creation via EGL/X11 or a new Emscripten context, threading, JIT off, etc.) is new work shared with the core agent. No `emcc` exists in this container; the Emscripten version is still open.

### What the OGL backend loses on the GLES 3.0 path (`OGLConfig.cpp`, ES 3.00 branch)
Derived from the source; not yet exercised at runtime.
- No compute shaders, image load/store, texel buffers: GPU texture decoding and GPU palette conversion are off (CPU decode used).
- No geometry shaders: `UseVSForLinePointExpand` path must be used for lines/points. No GS-based stereoscopy.
- No fragment stores/atomics: `bSupportsBBox` false, so the bounding-box register is unsupported (affects few games).
- No logic op: approximated with blending (`PipelineUtils.cpp` warns when inexact). No depth clamp, no LOD bias in sampler, no depth readback (EFB depth peeks need a shader path).
- MSAA/SSAA off. Background shader compilation depends on shared contexts, which WebGL does not give; it must be disabled (single context, `KHR_parallel_shader_compile` only helps link).
- Dual-source blend: used when `GL_EXT_blend_func_extended` exists. WebGL2 exposes it as `WEBGL_blend_func_extended`. Without it and without framebuffer fetch, Dolphin disables dual-source blending (`PipelineUtils.cpp`), which breaks some TEV blend modes. Framebuffer fetch does not exist in WebGL2.

## 2. Decision: WebGL2 first, WebGPU later

Choose **WebGL2 through Dolphin's existing OGL backend in GLES 3.0 mode.**
- Shader translation: Dolphin already emits GLSL ES 3.00; WebGL2 consumes it. WebGPU requires GLSL to SPIR-V to WGSL (Tint/naga), a new toolchain on the critical path, plus pipeline-object precompilation for hundreds of shader permutations.
- Feature coverage: the ES 3.0 path is already maintained upstream (Android), so we get its known behaviour. The lost features above are rare for homebrew and most games.
- Browser support: WebGL2 is universal (Chrome, Firefox, Safari). WebGPU `dual-source-blending` is an optional feature and was absent on the SwiftShader adapter here; support elsewhere is uneven.
- Threading/WASM: WebGL calls are synchronous (`readPixels` for EFB peeks and the RGBA frame bridge); WebGPU readback is async and would force Asyncify/JSPI into the emulator loop. WebGL2 works in a Worker with `OffscreenCanvas`; Emscripten supports it (`OFFSCREENCANVAS_SUPPORT`, context ownership by one thread).
- Cost: ~5.7k LOC backend reused versus ~10k LOC port.
WebGPU revisit triggers: WebGL2 perf wall (draw-call overhead, no compute decode), or need for bounding box/compute texture decoding. Both are measured later, not assumed.

## 3. Isolated precheck (not emulation)
`graphics/experiments/api-probe/index.html`, run by `scripts/av-probe.mjs`. It checks WebGL2 UBO + sampler object + `sampler2DArray` + RGBA8 render + `readPixels`, a dual-source blend draw when the extension exists, and records WebGPU adapter features.

Reproduce:
```
node scripts/av-probe.mjs                                   # default flags
node scripts/av-probe.mjs graphics/results/api-probe-webgpu-flags.json -- \
  --enable-unsafe-webgpu --enable-features=Vulkan,WebGPU --use-webgpu-adapter=swiftshader --use-angle=swiftshader
```
(page: `graphics/experiments/api-probe/{index.html,probe.js}`; needs `playwright`; in this container `NODE_PATH=/opt/node-tools/node_modules`.)

| Run | Browser / GPU | WebGL2 plain render | dual-source | WebGPU |
|---|---|---|---|---|
| `api-probe.json` | HeadlessChrome 153, Linux, SwiftShader (software), 4-core Xeon 2.1GHz | PASS (200,100,50,255) | **extension missing** | no adapter |
| `api-probe-webgpu-flags.json` | same, with the flags above | PASS | missing | SwiftShader adapter; no `dual-source-blending`; `clip-distances` yes |
| `api-probe-real-gpu.json` | Claude desktop browser (Chrome 152), Windows, RTX 4070 Ti SUPER, D3D11 | PASS | **PASS**: pixel (226,126,76,255), expected (225,125,75,255) ±2 | adapter, `dual-source-blending` **yes** (feature flag only, no WebGPU render test) |

The real-GPU row was produced by pasting `probe.js` into the browser's JS console, so it is manual and not reproducible from CI. It verifies that WebGL2 dual-source blending (`src + dst*(1-src1)`) renders correctly on that GPU. `crossOriginIsolated` was false in that pane (no COOP/COEP served), so threads/SharedArrayBuffer were not tested on real hardware.

## 4. Blockers and limits
- No Emscripten toolchain and no core build: step 3 (a frame from emulated homebrew) is blocked on the core agent's pinned Emscripten and a Dolphin WASM build. Nothing here is a Wii frame.
- No real-GPU CI; the reproducible runs are software-rendered and cannot validate dual-source blending or performance.
- Proposed next steps (need coordination): adopt the core agent's final revision and toolchain, re-check sections 1 and 2 against it, then capture a first homebrew frame (native reference build only after the SHA is agreed); dump the GLSL ES 3.00 Dolphin generates and compile it in WebGL2; define the Emscripten GL context hook with the core agent.

## 5. Reassessment against the shared baseline (core-wasm 9ac4a6a)
Read from `origin/claude/core-wasm` at `9ac4a6a`: Dolphin `e22551eae1c84a7e4d0b6a5c519ef4ed4ef69df1`, Emscripten 5.0.7, 66 imported patches from `dougchansan/wasm-dolphin` `7e38409`. **Static reading of the patches only: nothing has been built or run by me, and the core agent reports the browser build is still in progress.** Sections 1 and 2 above were derived at `4a70679d…`; where they conflict with this section, this section wins.

What the patch set already contains (by file list and grep, not execution):
- `0004` Software and OGL: browser (`__EMSCRIPTEN__`) fixes for the OGL backend under WebGL2 (conservative backend info with reverse-Z off, no clip control, `glMapBufferRange` invalidate flags, a vertex-attribute workaround, worker-owned WebGL), plus a software-rasteriser XFB fast path. So the OGL/WebGL2 route I recommended is *already attempted upstream of us*; a separate OGL bridge from me would duplicate it.
- `0005` VideoCommon shader changes and `0006`+ a WebGPU backend (`Source/Core/VideoBackends/WebGPU`, GLSL to glslang to SPIR-V to Naga to WGSL via `emdawnwebgpu`) with ~50 follow-up patches (command stream, ring protocol, UBO caches). The core agent currently links a **stub** for Naga (`native/stubs/naga_stub.c`), so this path cannot compile shaders yet.
- `0006` sets `bSupportsDualSourceBlend = false` for WebGPU because WGSL translation rejected it. My real-GPU test shows the WebGPU `dual-source-blending` feature and WebGL2 dual-source blending both exist on current desktop Chrome, so this is a Naga/translator limit rather than a browser one (not tested through Naga).
- `native/test/` has a `hello_wii.dol` plus `expected.json` for a CPU trace gate (checksums, not a rendered frame).

Revised recommendation (replaces section 2 for planning purposes):
1. **Do not add a second renderer.** Reuse what exists.
2. **First homebrew frame: software-rasteriser XFB path** (already in `0004`, returns RGBA to the `frame` event in `src/protocol.ts`). It needs no GPU API and is the correctness oracle for any GPU backend.
3. **GPU path: keep both existing backends as candidates and decide by measurement.** WebGL2/OGL is the smaller, synchronous path (cost: bounding box, compute decoding, GS and logic-op losses); the WebGPU backend is far larger but blocked on a real Naga. The dual-source result favours neither; it matters for TEV blending accuracy on both. No performance numbers exist yet, so no winner is claimed.
4. Audio patch `0002` exists; I have not reviewed it. Audio work starts after a real frame.

Open questions for the core agent: which backend `dolphin_web_core` selects by default (the source mentions a "Software to WebGPU presenter hybrid"), whether the OGL WebGL2 path has been executed at all, and what blocks real Naga.

## 6. Framebuffer to `frame` event: prepared path (core-wasm 9ac4a6a)
Static reading only; nothing here has run against a real core build.

Data flow with the Software renderer (`SetVideoBackend("Software")`, patch 0005 `Video_OutputXFB`):
1. Dolphin outputs an XFB (YUYV, in guest RAM) and calls `DolphinWeb_OnXfb(xfb, width, stride, height)` (`dolphin_web_discio.cpp`).
2. The core decodes it to RGBA in `s_framebuffer` (`uint32` words `0xAABBGGRR`, little-endian, so bytes are R,G,B,A) at the presentation size (`SetPresentationScale`), then does `++s_frame` and stores/notifies `s_frame_signal`.
3. JS reads `FrameWidth()`, `FrameHeight()`, `FrameBuffer()` (heap pointer), `GetFrame()`.

`graphics/bridge/frame-bridge.mjs` implements the JS side: it copies `w*h*4` bytes out of `HEAPU8` into a private, transferable `ArrayBuffer` and returns the protocol `frame` event (`src/protocol.ts`). It re-reads `GetFrame()` after the copy and drops/counts frames that changed meanwhile (the core has one framebuffer, no double buffering). `node scripts/av-test-frame-bridge.mjs` checks byte order, copy privacy, torn-frame and bad-geometry handling against a **fake module**; it proves the bridge contract only, not emulation.

Exports: everything needed is already exported (`_FrameWidth _FrameHeight _FrameBuffer _GetFrame _GetFrameSignalPtr _RunFrame _SetPresentationScale _SetVideoBackend`, runtime method `HEAPU8`; memory growth is off, so the heap view stays valid). No new core export is requested for the baseline. Optional later requests: a frame sequence counter that is only incremented after the decode completes, or a double-buffered framebuffer, if torn frames show up in measurements.

Not yet verified (needs a running core): that `DolphinWeb_OnXfb` fires with the Software backend and a homebrew XFB, the real presentation size, the XFB-callback to `GetFrame()` ordering, and the Y orientation (the OGL copy path flips Y; the YUYV path does not).

## 7. Test program needed for the first real frame
`native/test/hello_wii.dol` only writes checksums to RAM (CPU gate), so it never scans out an XFB. A graphics gate needs a self-written homebrew that programs the VI and an XFB (and later GX). The core's `build_hello_dol.py` shows the no-cross-compiler approach (own PPC encoder). Plan: (1) own DOL that fills an XFB in MEM1 with a known pattern and programs VI registers, which verifies the XFB-to-`frame` path; (2) a DOL that issues GX commands, which verifies the rasteriser itself. Expected pixels/hash are computed independently from the program, not from emulator output. Not written yet: VI register setup cannot be validated without a running core, and I would rather not guess it.

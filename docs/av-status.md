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

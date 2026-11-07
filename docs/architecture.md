# Browser architecture and shared contract v1

Goal: actual Wii execution on the visitor's machine. No streaming substitute.

UI (Codex) → typed messages → dedicated module worker (Codex) → core adapter (local Claude) → Dolphin WASM.
GPU/native graphics patches and audio production belong to remote Claude; DOM presentation and Web Audio consumption belong to Codex.

The exact message and adapter types live in `src/protocol.ts`. This file is owned by Codex. Propose contract changes before implementing them.
The worker dynamically imports `/core/adapter.js`, which must export async `createCore(emit)` conforming to `CreateCore`. The factory resolves only after runtime initialization. Missing artifacts must produce a real unavailable status, never a simulated boot.

`load(File)` lets the adapter implement chunked reads for large images. Start with small DOL/ELF homebrew; advertise only genuinely supported extensions via `info.formats`. `load` prepares a title; execution begins only on `start`. `stop` stops and unloads the title and allows a new load. Input is a complete button snapshot plus normalized IR pointer in [0,1]. Reset input on focus loss.

Frame baseline: transferable RGBA8 ArrayBuffer, width × height × 4 bytes. This is a correctness-first bridge, not a final performance architecture. Remote Claude should propose OffscreenCanvas/shared-memory presentation after the baseline works. Audio: interleaved float32 stereo PCM, sample rate in Hz; produce bounded chunks. Metrics must be measured in the core; never generate fake FPS.

Commands are serialized; inputs can update during execution. Core start must return after scheduling execution, not block forever. Emit failures with specific codes and useful logs. UI must remain responsive.

Serve HTTPS (localhost is suitable for development), application/wasm and COOP same-origin / COEP require-corp. Vite dev and preview supply headers. Production host must supply equivalent headers; a static upload alone does not prove threaded runtime support.

Acceptance gates: reproducible toolchain → actual Wii homebrew CPU trace → actual rendered frame → input response → synchronized sound → measured performance and game compatibility. Browser shell tests do not prove emulation.

Runtime owns lifecycle status events; adapters should emit frame/audio/log/metrics/error, not independently change wrapper states. Fatal asynchronous native errors are preserved even when a command promise resolves. Use stop to recover if the initialized core can unload safely; otherwise reload the page.

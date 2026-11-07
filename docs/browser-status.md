# Browser integration status

Implemented on codex/browser-shell: Vite/TypeScript shell, dedicated module worker, serialized lifecycle, adapter discovery, local File delivery, RGBA presentation, bounded stereo PCM playback after user gesture, keyboard and normalized pointer snapshots, focus-loss reset, background-tab pause, diagnostics and explicit missing-core state.

Validation: six lifecycle/file tests pass; TypeScript and Vite production build pass. Actual in-app browser verified missing-adapter handling and retry; start/load remain disabled without a core. COOP/COEP are present on the development server and shared memory is reported available. No native core, genuine frame, CPU execution, audio or FPS has been validated by these checks. The PCM/image consumers still need integration against genuine core output.

Coordination: remote graphics branch claude/browser-av has an initial assessment. Local Claude Desktop session "Dolphin WebAssembly Portierung" was found running and received Codex's coordination message. The core agent published commit 9ac4a6a on claude/core-wasm with Dolphin e22551eae1c84a7e4d0b6a5c519ef4ed4ef69df1, Emscripten 5.0.7 and 66 patches from dougchansan/wasm-dolphin. The full Dolphin SHA was independently verified against upstream GitHub. The branch contains docs/upstream.json and native/toolchain.lock; these supersede the original candidate in main once integrated. Build and real execution remain unverified. Codex posted the new pins and a request to reassess renderer reuse in PR #1. Do not build a second incompatible upstream in parallel.

## Native adapter follow-up (codex/core-integration)

Implemented the bridge to core ABI 1 with actual exported function names, small homebrew FS staging, asynchronous boot-state checking, pause/resume/stop and AV frame delivery. Imported the already-merged AV work from main. Added local native-artifact installer and a production adapter build. Eleven fixture/lifecycle tests and the AV contract test pass; none is a real emulation test. Native binaries and XFB-producing homebrew are still required for end-to-end verification. Wii input and native audio remain disconnected and are reported as such.

## Real native integration verified

Native artifacts were located on the Mac, installed with core:install, and the actual WASM core executed Codex's own VI/XFB DOL. Node checks passed guest marker, Wii mode, PC, 320x240 geometry and all eight grayscale samples. The same installed production app was tested in the in-app browser and displayed the real bars. Pause/resume/stop and a second load/start succeeded. Dark mode was requested and implemented. Results and artifact hashes: graphics/results/xfb-node.json. Browser exact pixel reads were not available via automation; browser evidence is observed image and lifecycle state.

This supersedes earlier notes that real core output was unavailable. It does not establish games, GX rendering, input, audio or speed. The core agent has unpublished native fixes used by the locally successful build; publish those before claiming full clean-checkout reproducibility. The remote AV agent went offline and Codex took over the VI/XFB test.

Native source publication update: the core agent pushed 0d9a73a and 06485f2. The SHA-256 of native/src/dolphin_web_core.cpp on that branch matches the local source (8c057ba3…e9c21). The source-fix publication blocker is resolved. A full build from an empty directory remains unverified.

## Parallel audio work

While the native agent develops Wiimote input, Codex connected native MixAudio/AudioBuffer stereo int16 output to transferable float32 PCM chunks. Sixteen tests plus production build pass. A real installed-core run delivered 12 chunks at 48 kHz from the silent grayscale DOL; all samples were zero as expected. This verifies native mixer transport, not audible guest audio or browser speaker output. Result: graphics/results/audio-transport-node.json. Wiimote native work and browser audio work have separate owners and do not block each other.

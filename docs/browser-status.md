# Browser integration status

Implemented on codex/browser-shell: Vite/TypeScript shell, dedicated module worker, serialized lifecycle, adapter discovery, local File delivery, RGBA presentation, bounded stereo PCM playback after user gesture, keyboard and normalized pointer snapshots, focus-loss reset, background-tab pause, diagnostics and explicit missing-core state.

Validation: six lifecycle/file tests pass; TypeScript and Vite production build pass. Actual in-app browser verified missing-adapter handling and retry; start/load remain disabled without a core. COOP/COEP are present on the development server and shared memory is reported available. No native core, genuine frame, CPU execution, audio or FPS has been validated by these checks. The PCM/image consumers still need integration against genuine core output.

Coordination: remote graphics branch claude/browser-av has an initial assessment. Local Claude Desktop session "Dolphin WebAssembly Portierung" was found running and received Codex's coordination message. It is evaluating an existing wasm-dolphin patch set on e22551e… with Emscripten 5.0.7; these are observations from that session, pending full published pins. docs/upstream.json remains a candidate baseline until the core agent pushes the chosen source and exact patch provenance. Do not build a second incompatible upstream in parallel.

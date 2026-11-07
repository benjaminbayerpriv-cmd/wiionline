# Local Claude: Dolphin core / WASM

Repository: https://github.com/benjaminbayerpriv-cmd/wiionline
Branch: claude/core-wasm; own isolated worktree.

Implement the real core, not a UI simulation. Inspect prior browser ports for proven reuse before porting. Start from docs/upstream.json; preserve license notices. Pin Emscripten and Dolphin revision. Work in native/ and scripts/core-*. First milestone: reproducible minimal headless WASM build executing small Wii DOL/ELF homebrew with verifiable CPU output. An interpreter is acceptable for initial correctness; measure performance and separately document options for browser CPU acceleration. Exclude desktop UI and unnecessary host integrations. Implement /core/adapter.js against src/protocol.ts (source may live under native/; generated artifacts are not committed). Investigate threading, filesystem and boot dependencies; report exact blockers rather than replacing execution with stubs.

Remote Claude owns graphics/audio patches. Codex owns app, worker, shared contract, CI and integration. Submit contract/build changes for coordination. Finish with docs/core-status.md, exact commands, toolchain pins, upstream patch set and evidence. Commit to your branch and open a PR; do not merge main. No bundled games or firmware.

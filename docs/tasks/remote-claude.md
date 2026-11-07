# Remote Claude: browser graphics / audio

Repository: https://github.com/benjaminbayerpriv-cmd/wiionline
Clone repo, read AGENTS.md and docs/architecture.md, then create branch claude/browser-av.

Own graphics/, scripts/av-*, docs/av-status.md. Use the same Dolphin revision in docs/upstream.json and coordinate Emscripten with the core agent. Inspect backend compatibility and choose a feasible WebGL2/WebGPU path with concrete evidence. Start with an isolated compatibility experiment while the core builds. Then provide graphics patches that render a frame actually produced by emulated Wii homebrew. A synthetic triangle is only a preliminary GPU check. Use protocol.ts frame events for the first correctness baseline; propose a more efficient bridge when measured. After genuine graphics, connect native DSP output to stereo float32 audio events. Codex owns browser presentation/playback; local Claude owns core and WASM host build. Do not edit their files without coordination.

Deliver upstream-compatible patch set, reproducible commands, browser/hardware details, output evidence and limits. Submit PR from claude/browser-av, do not merge main. If blocked on the core, finish the backend assessment and isolated test with explicit blocker. Do not bundle game/firmware files.

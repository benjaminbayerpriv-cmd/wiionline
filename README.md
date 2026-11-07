# Wii Online

Experimental project to execute Wii software directly in a browser, based on a planned Dolphin → WebAssembly port.

**Current status: browser integration scaffold; no working Wii core is included yet.** No playable-game or speed claim is made.

## Develop

Node.js 22+ recommended.

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

Open the URL printed by Vite. Local files stay in the browser. The app looks for `/core/adapter.js` and reports clearly when it is absent. Adapter contract: [architecture](docs/architecture.md) and `src/protocol.ts`. Production hosting must set COOP/COEP headers; see architecture.

## Three-agent ownership

- Codex: web app, worker protocol, CI, integration.
- Local Claude: [core/WASM task](docs/tasks/local-claude.md).
- Remote Claude: [graphics/audio task](docs/tasks/remote-claude.md).

Use separate branches and PRs. Read [AGENTS.md](AGENTS.md). Candidate upstream is pinned in [docs/upstream.json](docs/upstream.json). First milestone: actual Wii homebrew execution, a rendered frame and responsive input. Game compatibility and full-speed execution remain unverified.

Dolphin code retains its upstream GPL-2.0-or-later terms. No Dolphin source or artifacts, games or firmware are bundled in this initial scaffold. Select and document the project's license before distributing an integrated core.

## Connect a native build

The browser adapter now targets core ABI 1 from `claude/core-wasm` (Dolphin e22551e…, Emscripten 5.0.7). Once that agent produces the real build output:

```sh
npm run core:install -- /absolute/path/to/dist-core
npm run build
npm run preview
```

This copies matching `dolphin-core-upstream*.js/.wasm/.data` artifacts to ignored `public/core/`. The production build bundles the TypeScript adapter into `dist/core/adapter.js`. The development entry uses the same source through Vite. Do not serve `public/` alone as a production app.

Initial integration is limited to DOL/ELF homebrew up to 64 MiB using the interpreter and software renderer. `BootDisc` submission is followed by a running-state check. The adapter never calls `RunFrame`, so the native metadata pattern is not presented as emulation. New positive frame generations use the AV agent's RGBA bridge. This still needs validation against a real native build and an XFB-producing test DOL; passing fixture tests proves only the adapter contract.

Wii Remote input and PCM audio consumption from the native module are not wired yet; UI input is suppressed until the adapter explicitly advertises Wii input support. A GameCube input mask is not treated as Wii Remote emulation. The current single framebuffer may tear during concurrent writes; the counter check can detect some overlapping copies, not all. A native synchronized snapshot remains the robust follow-up.

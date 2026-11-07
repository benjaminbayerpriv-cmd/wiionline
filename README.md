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

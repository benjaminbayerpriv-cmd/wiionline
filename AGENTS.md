# Wii Online collaboration

Three named roles: Codex integration/web; local Claude core/WASM; remote Claude AV.
Read docs/architecture.md and docs/upstream.json first. Work in a separate branch and checkout/worktree. Never reset or overwrite another agent's branch. No direct pushes to main after bootstrap; use PRs. Do not commit games, firmware, credentials, node_modules, build trees or large binaries. Respect upstream licenses and preserve notices. Do not claim browser emulation based on UI tests or dummy frames.

Ownership: Codex owns src/, package files, CI, docs/architecture.md. Local Claude owns native/, scripts/core-*, docs/core-status.md. Remote Claude owns graphics/, scripts/av-*, docs/av-status.md. Integrate AV patches into the same pinned upstream through review; do not independently fork incompatible bases. Root/shared build changes require coordination. Do not spawn extra agents: the team is the three specified agents.

Validation: npm ci, npm test, npm run build. Native changes additionally need a reproducible build and real homebrew execution evidence. Reports include exact commit, commands, browser/hardware, achieved behavior and blockers. Mock fixtures belong only in tests.

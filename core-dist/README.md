# Fertig gebauter Kern (Eigentümer-Entscheidung: im Repo)

`dolphin-core-upstream.js` / `.wasm`: Dolphin e22551e + `native/patches/0001–0076`, Emscripten 5.0.7, gebaut mit `scripts/core-build.sh`.
Lizenz GPLv2+ (`native/LICENSE.wasm-dolphin`); Quelltext/Patches/Build-Skript liegen in diesem Repo. Enthält kein Spiel, keine Firmware, keine Zugangsdaten.

Einbinden und starten:

```bash
npm run core:install -- core-dist   # kopiert nach public/core
npm run build && npm run preview
```

Prüfen: `cd core-dist && shasum -a 256 -c SHA256SUMS`. Dieselben Dateien hängen am Release `core-e22551e-20261108-1` (`scripts/core-fetch.sh`).
Neue Version: neu bauen, Dateien ersetzen, `SHA256SUMS` erneuern.

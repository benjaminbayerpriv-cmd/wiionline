#!/usr/bin/env bash
# Laedt den fertig gebauten Kern (dolphin-core-upstream.js/.wasm) aus dem GitHub-Release und prueft SHA-256.
# Aufruf: scripts/core-fetch.sh [ZIELORDNER] [TAG]   (Standard: public/core, Tag: $CORE_TAG oder core-e22551e-20261108-1)
# Quelle der Binaries: scripts/core-build.sh (Dolphin e22551e + native/patches, GPLv2+); kein Spiel, keine Firmware.
set -euo pipefail
DEST="${1:-public/core}"; TAG="${2:-${CORE_TAG:-core-e22551e-20261108-1}}"
REPO="benjaminbayerpriv-cmd/wiionline"; BASE="https://github.com/$REPO/releases/download/$TAG"
mkdir -p "$DEST"; cd "$DEST"
for f in dolphin-core-upstream.js dolphin-core-upstream.wasm SHA256SUMS; do curl -fsSL -o "$f" "$BASE/$f?r=$RANDOM$RANDOM"; done   # Query umgeht zwischengespeicherte Antworten
if command -v shasum >/dev/null; then shasum -a 256 -c SHA256SUMS; else sha256sum -c SHA256SUMS; fi
echo "Kern $TAG liegt in $(pwd)"

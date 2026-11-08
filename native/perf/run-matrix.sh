#!/usr/bin/env bash
# Sequentielle Messreihe fastsw/tevhot; Ergebnis /tmp/perf/f<i>.json, Ende-Marker /tmp/perf/matrix.done
cd "$(dirname "$0")"; rm -f /tmp/perf/matrix.done
for i in 0 1 2 3 4 5; do pkill -f perf-chrome; node run-browser.mjs "$(cat /tmp/perf/f${i}cfg.json)" > /tmp/perf/f$i.json 2>&1; done
echo fin > /tmp/perf/matrix.done

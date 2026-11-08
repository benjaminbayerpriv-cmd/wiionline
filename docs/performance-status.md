# Performance-Status Wii Play (Kern-Zweig)

Stand: 2026-11-08. Alle Zahlen sind gemessen; Reproduktion: `native/perf/` (`probe.mjs` Node, `serve-perf.mjs` + `run-browser.mjs` + `probe-worker.mjs` headless Chrome 157 per CDP, `summarize.py`, `shots.py`). Kern: Dolphin e22551e, Artefakte aus `docs/core-status.md` (js bd1555ab…, wasm ef97f9fb…). Disc: lokale Wii-Play-RVZ (nicht im Repo).

## Begriffe (bewusst getrennt)
- **Spielzeit-Rate**: Gast-Ticks (CoreTiming, Taktrate je Sample neu gelesen, Wii = 729 MHz) pro Wandzeit. Erste Messung las 486 MHz (zu früh, vor Wii-Init) und zeigte fälschlich 1,5.
- **VI-/XFB-Ausgaben**: `GetFrame`-Generation, ~60/s; zählt auch wiederholte Scanouts desselben Bilds.
- **Neue Bilder**: Vollinhalts-Hash des `FrameBuffer` (320×228 RGBA) ändert sich. Nur das ist „neues Bild“.

## Messwerte
| Messung | Ergebnis |
|---|---|
| Node 22, Software Renderer, Cached+WASM-JIT, Throttle an (Sicherheitsbild) | Spielzeit 1,00, 59,9 VI/s |
| dito ohne Throttle (Kapazität, Leerlauf-Bildschirm) | 3,5× (Node), 7,1× (Chrome headless) |
| dito Cached ohne JIT | 3,0× (JIT bringt ~15 %) |
| Interpreter | 0,04× (unbrauchbar) |
| Einkern (`SetCpuThread(0)`), ohne Throttle | 0,12× (unbrauchbar) |
| Chrome 157 headless, Sicherheitsbild → Titel → Spielerwahl → Mii-Auswahl (Wiimote per Skript), Throttle an | durchgehend Spielzeit 1,00 (kurze Dips 0,70–0,85 beim JIT-Warmlaufen, 0,98 bei 4000+ JIT-Übersetzungen) |
| Audio entmutet, nichts holt PCM ab | keine Änderung (1,00) |
| **Titelbildschirm: neue Bilder** (Chrome headless, ohne die Webseite, Vollinhalts-Hash) | **~3,3 neue Bilder/s, Abstand median 303 ms**, obwohl ~50 Ausgaben/s ankommen |
| Echte Seite in Chrome 157 (sichtbar), Titel/Übergang | ~24 Canvas-Updates/s vor dem Adapter-Fix, danach ~45–49/s; neue Inhalte ~3,3/s (wie im Kern) |

Der Nutzer sah „~5 fps mit ~2 s Verzögerung“. Das passt zu ~3,3 neuen Bildern/s.

## Was gesichert ist
1. Die Spielzeit läuft (nach Ticks und VI) mit 100 %, auch in Menüs; trotzdem erzeugt das Spiel am Titelbildschirm im Kern nur ~3,3 verschiedene Bilder pro Sekunde. „100 % Spielzeit“ ist also **keine** Aussage über flüssige Anzeige.
2. Das reproduziert sich ohne die Webseite (eigener Messaufbau) und liegt daher im Kern/Spiel, nicht in der Seite.
3. Die Seite verschärfte es: Bildabholung hing am schweren Pump-Takt (~24 statt ~50 Abholungen/s). Fix im Web-Zweig (`claude/web-integration`, d15f9d4): eigener 4-ms-Timer nur für Bilder. Das behebt nur die Abholung, nicht die niedrige Zahl neuer Bilder.
4. Geerbte Throttle-Änderungen: `SleepUntil` schläft (Busy-Spin wurde im Altpatch zurückgenommen); `Config`: Emulationsgeschwindigkeit 1,0, Overclock-Schalter an (Faktor 1,0), `RUSH_FRAME_PRESENTATION` an. Keine Auffälligkeit; das Pacing hält 59,9 VI/s.

## Offen / ungeklärt
- **Ursache der ~3,3 neuen Bilder/s.** Nicht bewiesen. Kandidaten: (a) Software-Renderer/GPU-Thread liefert EFB→XFB-Kopien nur selten, (b) Spiel wartet auf Wiimote-/BT-HLE-Takt, (c) Animation am Titel ist tatsächlich so langsam (nicht ausgeschlossen, Bildfolge nicht visuell verglichen). Geplante, nicht ausgeführte Tests: Übertaktung 3× (Lauf lief in Timeouts, kein Ergebnis), Messung pro Gast-Sekunde ohne Throttle (der 4-ms-Hash-Timer blockierte dort den Worker), Zähler im Software-Renderer für EFB→XFB-Kopien und gezeichnete Quads (Patch noch nicht geschrieben).
- Kein Minispiel erreicht: Skript-Eingaben kamen bis zur Mii-Auswahl, Spielmenü/Minispiel nicht. Last in echten Spielphasen ungemessen.
- Alle Browser-Zahlen: headless Chrome 157 bzw. ein sichtbarer Lauf; kein Firefox/Safari; ein Rechner (Apple Silicon, 10 Kerne).
- Kein belegter Kern-Fix. Behauptung „Spiel läuft flüssig“ ist **nicht** zulässig.

## Instrumentierung vom 08.11.2026 (Commit 3aff0e5)

Der vorhandene Software-Kopierpfad `SWEfbInterface::EncodeXFB` meldet nach abgeschlossener RAM-Kopie bereits `xfbgen` im aktivierten Rasterprofil. Das ist ein Ereignis an der tatsächlichen EFB→XFB-Kopie, nicht am VI-Scanout. Neu zählt `SWVertexLoader::DrawCurrentBatch` die tatsächlich an den Software-Renderer übergebenen GX-Batches (`drawbatch`). Beide Zähler sind kumulativ und werden mit `SetSoftwareRasterProfileEnabled(1)` eingeschaltet. Ein Node-Boot mit dem neuen WASM-Build erreichte 27 XFB-Kopien und 244 Draw-Batches; dieser kurze Lauf diente nur der Funktionsprüfung unter paralleler Rechnerlast.

Build: `scripts/core-build.sh patch && scripts/core-build.sh configure && JOBS=8 scripts/core-build.sh build` im Kern-Checkout, Dolphin e22551e; SHA-256 des erzeugten WASM: `42f67e40dc895f8f89099ef6ba469f325334a4c3e6dcf3a18fcc99162772c0a1`. Disc bleibt lokal und wird nicht eingecheckt. Rohdaten liegen unter `native/perf/data/`.

Vorläufige Läufe mit dem vorherigen Build (Profil aktiv, ohne neuen Batch-Zähler): Im Sicherheitsbild wurden über 24,71 s Wandzeit 24,72 s Gastzeit, 1481 VI-/XFB-Ausgaben und 136 echte XFB-Kopien gemessen. Mit der geskripteten Folge A bei 12, 24 und 36 s waren es im Fenster 25–60 s über 34,78 s Wandzeit 34,62 s Gastzeit, 2076 VI-/XFB-Ausgaben und 120 Kopien. Die Vollbild-Hash-Abstände geänderter Ausgaben hatten dort einen Median von 304,6 ms. `rast` aus dem älteren Profil ist nicht monoton und wird nicht als Draw-Rate interpretiert. Die Rohdateien heißen `baseline-old-title.json` und `old-input-sequence.json`.

Für den kontrollierten Throttle-Vergleich nutzt `probe-worker.mjs` Gastsekunden (`g`) für Eingabeereignisse und hält das Auswertefenster in Gastzeit konstant; `summarize.py` meldet Ereignisse pro Wand- und Gastsekunde getrennt. Eine niedrigere Zahl geänderter Ausgaben ist kein FPS-Nachweis für eine ganze Spielphase.

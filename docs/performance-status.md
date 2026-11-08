# Performance-Status Wii Play (Kern-Zweig)

Stand: 2026-11-08. Alle Zahlen sind gemessen; Reproduktion: `native/perf/` (`probe.mjs` Node, `serve-perf.mjs` + `run-browser.mjs` + `probe-worker.mjs` headless Chrome 157 per CDP, `summarize.py`, `shots.py`). Kern: Dolphin e22551e; die ersten Messungen nutzten die Artefakte aus `docs/core-status.md`, die neue Instrumentierung den unten genannten Build. Disc: lokale Wii-Play-RVZ (nicht im Repo).

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

## Nachtrag 2026-11-08: Ursache eingegrenzt (Messbelege `docs/evidence/perf-matrix.json`)
Profil des Kerns (`SetSoftwareRasterProfileEnabled(1)`, `GetVideoStats`: `xfbgen` = EFB→XFB-Kopien, `rast`, `tev`, `tex`):
1. **Tatsächliche EFB→XFB-Kopien** (`xfbgen`), keine Scanouts: Titelbildschirm, Zweikern (Standard der Seite): **~3,0 Kopien pro Wandsekunde** bei 59,9 VI-Ausgaben/s. Kopien können gleichen Bildinhalt enthalten; Änderungen werden separat per Vollbild-Hash geprüft. Die Kopie selbst kostet ~15 ms und ist nicht der Engpass.
2. **Einkern-Gegenprobe** (`SetCpuThread(0)`, Throttle an): Spielzeit-Rate nur 0,06, aber **59,94 EFB→XFB-Kopien pro Spielsekunde** (3,7 pro Wandsekunde). Das Spiel stößt in Gastzeit also Kopien mit ~60/s an; es wird **nicht** durch einen Gast-Takt (Wiimote/BT) auf ~3 Kopien pro Spielsekunde begrenzt. Eine Kopie liegt etwa 270 ms Wandzeit nach der vorigen.
3. **Software-Rasterizer dominiert**: ~34 000 Rasteraufrufe in 85 s, im Mittel ~1,6 ms (gesampelt 1:64) → ~56 s von ~60 aktiven Sekunden; ~349 Mio TEV- und ~356 Mio Textur-Pixelaufrufe, ~1,15 Mio Pixel/Spielbild (viel Überzeichnung). Das passt zu ~3,3 gerenderten Bildern/s. (Die Zeitschätzung beruht auf Stichproben und ist ungefähr.)
4. **Zweikernmodus**: Die Gastzeit läuft weiter, während der Software-GPU-Thread nur ~3 XFB-Kopien/s abschließt; die Anzeige zeigt entsprechend selten neue Inhalte, und die Eingabe wirkt erst mit dem GPU-Rückstand. Das erklärt „~5 fps mit ~2 s Verzögerung“ qualitativ; die Verzögerung selbst ist nicht direkt gemessen.
5. **Die geerbten Schnellmodi helfen nicht**: `SetFastSoftwareRaster` 1/2/3 → 2,96/2,99/3,07 Kopien/s; `SetSoftwareTevHotCaseMode` 1/2/3 → 3,17/3,09/3,08; Standard ~2,9–3,0. Unterschiede liegen im Rauschen.
6. Throttle/Timing-Hacks (`SleepUntil` schläft, Emulationsgeschwindigkeit 1,0, Overclock 1,0) sind unauffällig: 59,9 VI/s, Spielzeit 1,00.

**Folgerung:** Der Software-Rasterizer (SW-Backend in WASM, ein Thread) schafft bei Wii Play in dieser Phase ~3 EFB→XFB-Kopien/s. Das ist ein Durchsatzproblem der Pixel-Pipeline (TEV + Textur), kein Pacing- und kein Seitenproblem. Wege (nicht umgesetzt, nicht getestet): (a) Hardware-Renderer (WebGL2/WebGPU) statt Software; im Patchsatz gibt es einen OGL/WebGL2-Pfad, dessen Zustand ungeprüft ist (Grafik-Zweig); (b) Rasterisierung auf mehrere Pthreads aufteilen; (c) Pixel-Pipeline optimieren (SIMD). Einen belegten, sicheren Kern-Fix gibt es nicht; kein Standardwert wurde geändert.

## Offen / ungeklärt
- Ursache der seltenen Kopien für diesen Software-Renderer-Pfad eingegrenzt (siehe Nachtrag und kontrolliertes Gastzeitfenster). Übertaktung 3× lieferte zuvor kein verwertbares Ergebnis; die Gastzeit-Gegenprobe ohne Throttle ist inzwischen ausgeführt. Das Verhalten anderer Renderer und echter Minispiele bleibt offen.
- Kein Minispiel erreicht: Skript-Eingaben kamen bis zur Mii-Auswahl, Spielmenü/Minispiel nicht. Last in echten Spielphasen ungemessen.
- Alle Browser-Zahlen: headless Chrome 157 bzw. ein sichtbarer Lauf; kein Firefox/Safari; ein Rechner (Apple Silicon, 10 Kerne).
- Kein belegter Kern-Fix. Behauptung „Spiel läuft flüssig“ ist **nicht** zulässig.

## Instrumentierung vom 08.11.2026 (Commit 3aff0e5)

Der vorhandene Software-Kopierpfad `SWEfbInterface::EncodeXFB` meldet nach abgeschlossener RAM-Kopie bereits `xfbgen` im aktivierten Rasterprofil. Das ist ein Ereignis an der tatsächlichen EFB→XFB-Kopie, nicht am VI-Scanout. Neu zählt `SWVertexLoader::DrawCurrentBatch` die tatsächlich an den Software-Renderer übergebenen GX-Batches (`drawbatch`). Beide Zähler sind kumulativ und werden mit `SetSoftwareRasterProfileEnabled(1)` eingeschaltet. Ein Node-Boot mit dem neuen WASM-Build erreichte 27 XFB-Kopien und 244 Draw-Batches; dieser kurze Lauf diente nur der Funktionsprüfung unter paralleler Rechnerlast.

Build: `scripts/core-build.sh patch && scripts/core-build.sh configure && JOBS=8 scripts/core-build.sh build` im Kern-Checkout, Dolphin e22551e; SHA-256 des erzeugten WASM: `42f67e40dc895f8f89099ef6ba469f325334a4c3e6dcf3a18fcc99162772c0a1`. Disc bleibt lokal und wird nicht eingecheckt. Rohdaten liegen unter `native/perf/data/`.

Vorläufige Läufe mit dem vorherigen Build (Profil aktiv, ohne neuen Batch-Zähler): Im Sicherheitsbild wurden über 24,71 s Wandzeit 24,72 s Gastzeit, 1481 VI-/XFB-Ausgaben und 136 echte XFB-Kopien gemessen. Mit der geskripteten Folge A bei 12, 24 und 36 s waren es im Fenster 25–60 s über 34,78 s Wandzeit 34,62 s Gastzeit, 2076 VI-/XFB-Ausgaben und 120 Kopien. Die Vollbild-Hash-Abstände geänderter Ausgaben hatten dort einen Median von 304,6 ms. `rast` aus dem älteren Profil ist nicht monoton und wird nicht als Draw-Rate interpretiert. Die Rohdateien heißen `baseline-old-title.json` und `old-input-sequence.json`.

Für den kontrollierten Throttle-Vergleich nutzt `probe-worker.mjs` Gastsekunden (`g`) für Eingabeereignisse und hält das Auswertefenster in Gastzeit konstant; `summarize.py` meldet Ereignisse pro Wand- und Gastsekunde getrennt. Eine niedrigere Zahl geänderter Ausgaben ist kein FPS-Nachweis für eine ganze Spielphase.

### Kontrolliertes Fenster 25–55 Gastsekunden

Chrome 157 headless, Software-Renderer, Zweikern, A-Eingaben bei Gastsekunde 12–13, 24–25 und 36–37, Rasterprofil aktiv, keine Bild-Hashes während der Vergleichsläufe. Rohdateien unter `native/perf/data/core-*.json`. Alle Zahlen sind **Ereignisse**, nicht FPS.

| Einstellung | Gastzeit/Wandzeit | VI-Ausgaben/Gast-s | EFB→XFB-Kopien/Gast-s | SW-Draw-Batches/Gast-s | JIT-Blöcke/Gast-s |
|---|---:|---:|---:|---:|---:|
| Throttle 1, WASM-JIT an | 0,997 | 59,95 | 3,37 | 189,84 | 4,00 Mio. |
| Throttle 0, WASM-JIT an | 5,921 | 59,96 | 1,15 | 10,33 | 3,24 Mio. |
| Throttle 1, WASM-JIT aus | 0,997 | 59,94 | 4,00 | 241,40 | 0 |

Eingabeereignisse wurden tatsächlich bei 12,01/13,02/24,06/25,01/36,05/37,02 Gastsekunden (Throttle an) und 12,01/13,09/24,07/25,28/36,11/37,05 (Throttle aus) ausgelöst; die leichte Abweichung folgt dem 50-ms-Polling. Ohne Throttle läuft der Gast schneller, aber die Zahl fertiggestellter Kopien und Draw-Batches pro Gastsekunde sinkt stark. Die CPU ist also nicht durch den VI-Takt blockiert; der Software-GPU-Pfad fällt gegenüber der Gastzeit zurück. Der Vergleich beweist keine exakte Eingabelatenz und keine Bildrate eines Minispiels. Dass ohne WASM-JIT weiterhin ~4 Kopien pro Gastsekunde entstehen, schließt laufende WASM-JIT-Blöcke als notwendige Ursache aus.

Ein zusätzlicher 30-Gastsekunden-Lauf mit `SetPpcProfileEnabled(1)` zählte am VI/SI-Throttle-Punkt 122 Aufrufe, davon 68 langsame, mit insgesamt 2,98 s Wartezeit und 47,5 ms Maximum. Diese Profilzahlen gelten für den ganzen Lauf und werden wegen des zusätzlichen Profil-Overheads nicht direkt mit der obigen Fenster-Tabelle verrechnet. `rast` aus dem älteren Profil ist innerhalb dieser Läufe nicht monoton; daraus wird keine Draw-Rate berechnet. Der neue `drawbatch`-Zähler blieb monoton.

Reproduktion nach dem Build: `node native/perf/serve-perf.mjs 8124 dist-core /absoluter/pfad/zur/lokalen/Wii-Play.rvz` starten; anschließend `node native/perf/run-browser.mjs '<JSON-Konfiguration>' > messung.json` und `python3 native/perf/summarize.py < messung.json`. Die exakten JSON-Konfigurationen einschließlich Gastzeitfenster und Eingaben stehen in `cfg` jeder Rohdatei. Die Disc wird weder kopiert noch committet.

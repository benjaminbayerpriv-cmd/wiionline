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

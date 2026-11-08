# Core status (claude/core-wasm)

Stand: 2026-11-07, Besitz: Kern/Boot/Speicher/native Brücke. Alle Aussagen sind gemessen, Grenzen stehen unten.

## Ergebnis in einem Satz
Ein eigenes Wii-DOL-Homebrew (`native/test/hello_wii.dol`) wird im aus Dolphin `e22551e` gebauten WASM-Kern ausgeführt, in **Node 22.23.1 (arm64)** und in **Chrome 157 (macOS)** im Module-Worker, mit Interpreter, Cached-Interpreter und WASM-JIT. Der Nachweis ist die aus dem Gastspeicher gelesene Rechnung des Programms, nicht eine UI-Anzeige.

## Pins
| Was | Wert |
|---|---|
| Dolphin | `e22551eae1c84a7e4d0b6a5c519ef4ed4ef69df1` (2026-05-03); ersetzt den Kandidaten `4a70679d…` |
| Emscripten | 5.0.7, Compiler `263db4cffa6f9fc2ec514a70abac81362ea41849`, emsdk `bafd64c26bdaf10bd829163d1575b50b759a72d8` |
| SPIRV-Tools / Headers (für glslang) | `7f2d9ee9…` / `01e05779…` (volle SHAs in `native/toolchain.lock`) |
| Patches | 64 Wurzel- + 2 Submodul-Patches, unverändert aus [dougchansan/wasm-dolphin](https://github.com/dougchansan/wasm-dolphin) Commit `7e38409` (GPLv2+), Hashes in `native/upstream-source.lock.json`, Lizenz `native/LICENSE.wasm-dolphin` |
| Host | macOS arm64, CMake 4.x, Ninja (brew), Node 22.23.1 |

## Wiederverwendungsprüfung (vorhandene Web-Portierungen)
- **wasm-dolphin** (dougchansan, 2026-05 bis heute): echter Dolphin-Kern, PPC→WASM-JIT, Software-Raster + WebGPU. Bestes Ziel Smash Bros. Melee (GameCube); die eigene Statusseite nennt Wii und breite GC-Kompatibilität „nicht im Fokus“, Wii-Remote-Eingabe fehlt. → **als Basis übernommen**, Patches unverändert.
- Shubin123/dolphin_web: experimenteller Emscripten-Port, Wii teilweise, kein Wii-Remote. Nicht übernommen (kleiner, ohne JIT).
- WebCompiled (Mario Kart Wii): statische Rekompilation, kein Dolphin, nicht wiederverwendbar als Kern.
- Das Repo enthält 66 Patches (1,5 MB Text), davon die meisten Grafik/WebGPU. Sie hängen aneinander; ich habe sie nicht aufgetrennt.

## Build (Kommandos)
```bash
scripts/core-build.sh all        # toolchain, fetch, patch, configure, build (Erstlauf ca. 1 h auf 10 Kernen)
scripts/core-build.sh build      # inkrementell
# Ausgabe: dist-core/dolphin-core-upstream.{js,wasm} + SHA256SUMS (nicht eingecheckt)
```
Minimal heißt: keine Desktop-GUI, kein Qt/SDL/Vulkan/cubeb/UPnP/mGBA/RetroAchievements/Analytics. Die Rust/Naga-WGSL-Brücke des WebGPU-Pfads ist durch einen C-Stub ersetzt (`native/stubs/naga_stub.c`); der WebGPU-Renderer ist also **nicht funktionsfähig** in diesem Build (gehört zum AV-Zweig). Der Kern hängt von `--use-port=emdawnwebgpu` ab (wird beim Link geladen).
**Ehrlicher Hinweis:** Die Stufen patch→configure→build habe ich über das Skript gefahren, aber mit vorab geholtem emsdk/Dolphin-Baum (symlinks in einem Arbeitsordner). Ein vollständiger `all`-Lauf von einem leeren Ordner ist **noch nicht** durchgelaufen.

Artefakte (aktueller Stand mit Wiimote-Patch, `dist-core/SHA256SUMS`): `dolphin-core-upstream.js` SHA-256 `bd1555ab1bde3fef0d91feb321f23f3692dd75b9c0b9021e03b6fbe40af9ac3d`; `dolphin-core-upstream.wasm` SHA-256 `ef97f9fb779907502bb8277232cfe09330280516a557e79d14d17fa43e014ddb`. (Ältere Hashes ohne Wiimote in `docs/evidence/node-run.txt`.) Die CPU-Tests (Interpreter, Cached, Adapter) wurden mit dem neuen Build wiederholt und bestehen (volle Werte: `docs/evidence/node-run.txt`). Bitgleichheit bei Neubau ist nicht geprüft.

## Testprogramm
`native/test/build_hello_dol.py` erzeugt `hello_wii.dol` (selbst geschrieben, PowerPC-Maschinencode per Mini-Encoder, kein devkitPro, keine Fremddaten, 0 Bytes Spiel/Firmware). Es läuft ab `0x80004000`, schreibt nach MEM2 `0x90100000` das Magic `WIIONLIN`, die Summe 1..1000 (`0x7A314`), 10 000 LCG-Schritte (`0xF3BE7791`), den Marker `DONE` und endet in `b .`. Ein nie ausgeführtes `mtspr HID4` markiert es für Dolphin als Wii-Programm. SHA-256 des DOL `ec8e5016…28f`. `bench_wii.dol`: gleiche Datei mit 30 Mio. LCG-Schritten (90 Mio. PPC-Befehle).

## Ausführungsnachweis
Prüfung: Gastspeicher-Inhalt stimmt mit der in Python berechneten Erwartung überein, PC steht in der Endschleife `0x80004078`, `WiiOnline_IsWii()==1` (MEM2 gemappt, Wii-Boot-Pfad mit IOS-HLE). Rohlogs: `docs/evidence/node-run.txt`.
Kommandos:
```bash
node native/test/run-node.mjs dist-core interpreter|cached   # headless
node native/test/run-adapter-node.mjs dist-core              # Adapter nach src/protocol.ts
node native/test/serve.mjs 8123 dist-core                    # dann http://127.0.0.1:8123/?cpu=interpreter|cached&jit=0|1&dol=bench
```
Browser: Chrome 157.0.0.0 (macOS) PASS für Interpreter, Cached und Cached+JIT (hello und bench). Gastspeicher `5749494f4e4c494e 0007a314 f3be7791 444f4e45`, PC `0x80004078`, `isWii=1`.

## Leistung (Mikrobenchmark, 90 Mio. PPC-Befehle, nur enge Integerschleife; **nicht** repräsentativ für Spiele)
| Modus | Node 22 arm64 | Chrome 157 |
|---|---|---|
| Interpreter | 3,74 s | 18,0 s (ein früherer Lauf 62,5 s während eines hängenden CDP-Aufrufs: Ausreißer) |
| Cached Interpreter | 1,19 s | 4,04 s |
| Cached + WASM-JIT (Policy 1) | 1,04 s (5 Blöcke übersetzt, 30 Mio. Blocklänge-Aufrufe) | 3,05 s |
Boot bis Ausführungsbeginn ca. 0,5 s (Node). Daraus grob 25 / 75 / 87 Mio. Befehle/s (Node), also weit unter Echtzeit (~730 MHz Gast-CPU) für den Interpreter-Pfad. Der JIT bringt hier nur ~15–25 % gegenüber Cached, weil die Schleife aus einem 3-Befehls-Block besteht und der Dispatch dominiert; Aussagen über Spiele-Geschwindigkeit sind damit **nicht** möglich. Chrome ist 3–5× langsamer als Node (Ursache nicht untersucht; Verdacht: Worker-/Thread-Wechsel und Speicherzugriffsprüfung).

## Getrennt: Interpreter vs. langfristige Beschleunigung
- Interpreter/Cached-Interpreter: korrekt, trivial portabel, langsam.
- Der geerbte PPC→WASM-JIT (Patches 0003/0066/0067) läuft im Browser (Beweis oben) und erzeugt zur Laufzeit WASM-Module. Offen: Verhalten auf echten Wii-Spielen, Kompilierlatenz, JIT-Cache (IndexedDB, im Pre-JS vorgesehen), Korrektheit über alle Befehle (Float/Paired-Singles).
- Blocker für Geschwindigkeit: kein JIT in Safari-Worker-Pools ungeprüft; Dolphin-Haupt-Thread-Modell braucht Pthreads (SharedArrayBuffer, COOP/COEP) und 16 vorgestartete Worker.

## Blocker und Grenzen (genau)
1. **Keine Frames, kein Audio**: Video-Backend `Null`, Audio stumm. Frames/Audio sind AV-Sache; Adapter meldet `fps: 0`, keine erfundenen Werte.
2. **Input nicht verdrahtet**: `input()` ist leer. Wii-Remote/IR braucht eine Bluetooth-Emulation oder HLE-Wiimote; im Patchsatz fehlt sie.
3. **Nur DOL getestet**; ELF/WAD/ISO/RVZ nicht. Disc-Boot nur über Patches der Altbasis, hier nicht geprüft. Kein NAND-Inhalt, keine Firmware, IOS ist HLE.
4. **Fester Speicher**: 24 576 Seiten = 1,5 GiB, `ALLOW_MEMORY_GROWTH=0`, geteilt (Pthreads). Wird auf Systemen mit weniger Adressraum fehlschlagen (Firefox/Mobil ungeprüft).
5. **Eingebetteter Browser-Pane der Claude-Desktop-App (Chrome 152)**: Pthread-Worker starten dort nicht (Fehlerevent ohne Meldung); echter Chrome 157 funktioniert. Ursache ungeklärt. Tests daher im echten Chrome.
6. **Firefox/Safari ungeprüft**, ebenso Windows/Linux-Hosts.
7. Patchsatz stammt aus einem Forschungsprojekt (66 Patches, viele WebGPU); Wartbarkeit/Upstream-Aktualität ist ein Risiko. Der Build zieht zusätzlich den `emdawnwebgpu`-Port.
8. Vollständiger Neubau von leerem Ordner und Bitgleichheit sind nicht verifiziert (siehe oben).

## Artefaktpfad für Codex (Host: dieser Mac, keine VM)
`/Users/benjaminbayer/work/wiionline/dist-core/` enthält genau `dolphin-core-upstream.js`, `dolphin-core-upstream.wasm`, `SHA256SUMS` (geprüft mit `shasum -a 256 -c`). Es gibt keine `.data`-Datei und keine weiteren Begleitdateien: das Wii-NAND-Seed ist ins WASM eingebettet. Das `.js` ist ein ES-Modul (`export default createDolphinCore`) und startet seine 16 Pthread-Worker aus sich selbst per `new URL("dolphin-core-upstream.js", import.meta.url)`, beide Dateien müssen also im selben Verzeichnis liegen. Erforderlich: COOP `same-origin`, COEP `require-corp`, `application/wasm`. Der Ordner ist gitignored; der Build ist reproduzierbar, die Artefakte werden nicht eingecheckt.

## Eingabe: aktueller Stand und nächster Kernschritt
`SetInputMask`/`SetInputState` (in `dolphin_web_discio.cpp`) steuern ein **GameCube-Pad** (Maske, Sticks, Trigger, Analog A/B), **nicht** die Wiimote. Es gibt derzeit keinen Wii-Input-Export (Tasten, IR-Zeiger, Beschleunigung, Erweiterungen). Nächster Kernschritt: ein Export wie `WiiOnline_SetWiimote(buttonMask, irX, irY, irVisible, accel…)`, der in Dolphins emulierte Wiimote (WiimoteEmu, Bluetooth-Pass-through ist im Browser nicht verfügbar) einspeist; dafür muss die Controller-Konfiguration auf „Emulated Wiimote“ gestellt und die Quelle (ControllerInterface-Gerät) im Kern angelegt werden. Noch nicht implementiert, noch nicht getestet.

## Wiimote-Eingabe (implementiert, Native-Ebene getestet; Gastnachweis OFFEN)
Patch `native/patches/0068-web-wiimote-input.patch` (eigener Patch, gegen den Wurzelbaum nach 0001..0067 erzeugt) und eine Zeile in `EnsureRuntime`: **`Wiimote::Initialize(...)` wurde im Altbestand nie aufgerufen**, es existierten also keine emulierten Wiimotes; jetzt wird es aufgerufen (kein Host-Bluetooth).
Exporte (C-ABI, Slot 0..3, nur Slot 0 vom Adapter genutzt):
- `void WiiOnline_SetWiimote(int slot, uint32_t buttons, float pointer_x, float pointer_y, int pointer_visible, float accel_x, float accel_y, float accel_z)` aktiviert den Override. Tasten (Bits): A 0x001, B 0x002, ONE 0x004, TWO 0x008, PLUS 0x010, MINUS 0x020, HOME 0x040, UP 0x080, DOWN 0x100, LEFT 0x200, RIGHT 0x400; andere Bits werden ignoriert. Zeiger 0..1, Ursprung oben links, außerhalb wird auf den Rand geklemmt, NaN oder `visible=0` = keine IR-Punkte. Beschleunigung in g, auf ±8 g begrenzt, NaN je Achse = neutral (0,0,1).
- `void WiiOnline_ClearWiimote(int slot)` beendet den Override und setzt alles zurück (keine gehaltene Taste); Dolphins eigene Konfiguration gilt wieder.
- `uint32_t WiiOnline_GetWiimoteDebug(int slot, uint32_t* out)`: `out` zeigt auf **16 uint32 (64 Byte)**; Rückgabe **16** bei gültigem Slot, sonst 0 (ungültiger Slot oder `out==NULL`). Felder: [0] active, [1] generation (zählt Set/Clear), [2] build_count (Läufe von BuildDesiredWiimoteState mit aktivem Override seit letztem Clear), [3] zuletzt gebaute ButtonData.hex, [4..6] Beschleunigung x,y,z (10 Bit), [7..10] IR-Punkt 0..3 als `x | y<<16` (0xffff = unsichtbar), [11..14] Punktgrößen, [15] gesetzte Web-Maske. [3..14] sind 0, solange build_count 0 ist.
- Test-Export `int WiiOnline_TestPrepareInput(int slot, uint32_t* out)`: ruft `Wiimote::PrepareInput` (also den echten `BuildDesiredWiimoteState`-Pfad) der emulierten Remote direkt auf. `out` = 16 uint32: [0] ButtonData.hex, [1..3] Beschleunigung, [4..7] IR-Punkte, [8..11] Größen, [12] `GetCurrentlyPressedButtons().hex`. Rückgabe 1/0. Nur für Tests, nicht thread-synchron mit der CPU.
Der Override gilt an **zwei** Stellen: `BuildDesiredWiimoteState` (Tasten, Beschleunigung, IR) und `GetCurrentlyPressedButtons` (der Tastendruck, der eine inaktive Remote per Bluetooth-HLE weckt/verbindet).
IR-Geometrie: Dolphins Standard, unverändert aus `EmulatePoint`/`CameraLogic`: Abstand 2 m, Gesamt-Yaw 25° und -Pitch 20° (je halb auf jeder Seite), vertikaler Versatz 10 cm, Sensorleiste oben (`SYSCONF_SENSOR_BAR_POSITION`=1 Standard), LED-Abstand 0,2 m, Kamera 1024×768, FOV aus den Dolphin-Einstellungen. Der Zeiger springt sofort auf den Zielwinkel. Ergebnis (aus dem Test): Mitte ≈ (512, 452) Kamerapixel, Ecken ≈ x 137..886 / y 207..706; rechts → Punkte links; oben → kleineres Kamera-y. Die Vertikale folgt Dolphins Cursor-Konvention und ist **nicht** gegen einen Gast verifiziert.
Test: `node native/test/run-wiimote-node.mjs dist-core` (34 Prüfungen, alle bestanden; Log `docs/evidence/wiimote-native.json`). Er bootet `hello_wii.dol` (damit die Wiimote-Objekte initialisiert sind) und prüft den echten PrepareInput-Pfad: alle 11 Tasten einzeln, alle zusammen, unbekannte Bits, IR Mitte und 4 Ecken, unsichtbar/NaN, Klemmen, Beschleunigung neutral/±/NaN/Begrenzung, ungültiger Slot, Clear.
**Gastnachweis (Node, erledigt mit Grenzen):** Ein eigenes libogc/wiiuse-Homebrew (`native/test/wpad/wpad_test.c`, gebaut mit `scripts/core-build-wpad.sh` im per Digest gepinnten Image `devkitpro/devkitppc@sha256:04bab308c032848c1ca5a09c02b4aaa4d505efd7996aab05b9a4eb15231b2868`, arm64, devkitPPC GCC 16.2.0; `wpad_test.dol` 316.896 B, SHA-256 `d5f7a980…3505`) liest die Wiimote über Dolphins Bluetooth-HLE (`WPAD_Init`, `WPAD_ScanPads`, `WPAD_SetDataFormat(BTNS_ACC_IR)`) und legt Werte in eine Struktur (`g_wpad_result`, Adresse in `wpad_test.json`). `node native/test/run-wpad-node.mjs dist-core` setzt Eingaben per `WiiOnline_SetWiimote` und liest die Struktur aus dem Gastspeicher: **27/27 bestanden** mit Interpreter, Cached-Interpreter und Cached+WASM-JIT (`docs/evidence/wpad-guest.json`). Der Gast sieht: alle 11 Tasten einzeln (libogc-Bits) und gemeinsam, Loslassen, Ruhe-Beschleunigung (512,512,616) und x=+1 g (616,512,616) identisch zum nativen Pfad, IR-Punkte an Mitte und vier Ecken, `visible=0` ohne Punkte, `Clear` ohne gehaltene Taste.
Grenzen dieses Nachweises: (1) Nur Node, **nicht** im Browser gelaufen. (2) Die emulierte Remote ist beim Boot schon verbunden (Dolphin-BT-HLE verbindet sie selbst), der Verbindungsaufbau per Tastendruck (`GetCurrentlyPressedButtons`-Override) ist deshalb **nicht** gast-getestet. (3) libogc spiegelt IR-X (`rx = 1023 - x`); Punkt 0 stimmt exakt, beim zweiten Punkt liefert libogc im Basic-Modus konstant falsche obere Bits (vermutlich Bibliotheksverhalten, nicht Dolphin; Dolphins `IRBasic`-Kodierung entspricht der Hardware-Beschreibung), daher werden dort nur die unteren 8 Bit geprüft. (4) IR-Modus Basic (Punktgröße 0); Extended/Full nicht gast-getestet. (5) Kein Nunchuk/Classic/MotionPlus, kein Rumble/Speaker-Rückkanal, nur Slot 0. (6) Ein Spiel wurde nicht getestet.

## Frames
`GetFrame`/`FrameBuffer`/`RunFrame` des Altbestands liefern über `RenderMetadataFrame` ein **synthetisches Bild**, kein Wii-XFB. Nicht als Wii-Ausgabe verwenden. Eine echte XFB-Snapshot-Brücke ist mit dem AV-Zweig abzustimmen.

## Adapter
Hinweis: Codex implementiert den maßgeblichen TypeScript-Adapter (`src/dolphin-adapter.ts`, PR #2). `native/adapter/adapter.js` ist nur eine Referenz/Testhilfe aus der Kernprüfung (nutzt dieselben Exporte CoreInit, SetVideoBackend, SetCpuThread, BootDisc, PumpHostJobs, SetCorePaused, StopCore) und wird nicht ausgeliefert. Der Erst-Eintrag unten bleibt zur Dokumentation.
`native/adapter/adapter.js` exportiert `createCore(emit, options)` nach `src/protocol.ts` (`.dol`, `load/start/pause/stop`, Status-/Log-/Metrikereignisse). Headless verifiziert (`run-adapter-node.mjs`: Zustände idle→loading→ready→running, Speicherwerte korrekt). Im Worker von Codex noch nicht integriert; Auslieferung als `/core/adapter.js` neben den Artefakten. Vorschlag zum Vertrag: `CoreInfo.formats` bleibt `[".dol"]`; ein optionales `CreateCore`-Optionsobjekt (`cpu`, `wasmJit`) wäre nützlich.

## Nächste Schritte
Vollständigen `all`-Lauf von leer prüfen; CI-Cache für den ~1-h-Build; echtes Homebrew mit libogc (z. B. Text über EXI/Konsole) statt handgebautem DOL; Frames anbinden (mit AV: Software-Raster → `frame`); Wiimote-HLE; Browser-Matrix.

## Wii-Play-Eingabepfad im Kern geprüft (2026-11-08)
- **Exportliste:** Die Kernartefakte (u. a. `42f67e40…`, `ef97f9fb…`) exportieren `_WiiOnline_SetWiimote`, `_ClearWiimote`, `_GetWiimoteDebug`, `_malloc`, `_free`. Auf `Module` stehen aber nur `HEAPU8` (kein `HEAPU32`). Die Meldung „debug export unavailable“ im Adapter kommt von dessen Prüfung `module.HEAPU32 instanceof Uint32Array`, nicht von einem fehlenden Export. Lösung im Adapter: `new Uint32Array(module.HEAPU8.buffer, ptr, 16)`. Kein Kernfix nötig.
- **Gastpfad:** Mit Wii Play (RVZ, Software Renderer) kommt A über `SetWiimote` bis in `BuildDesiredWiimoteState` (`last_hex` 0x0800 = A, `build_count` steigt, beim Loslassen 0). Die Gastanzeige wechselt danach von den Warnseiten zum Wiimote-Zeiger-Bildschirm mit sichtbarem Zeiger (Hash-Wechsel 26 s → 36 s → 46 s; 3 von 4 Tastendrücken reichten, bis der Zeiger sichtbar war). Belege: `docs/evidence/wii-play-input-debug.json`; Bilder nur lokal. Grenze: ein Lauf, Software Renderer, kein OGL; ob ein früher Druck (Warnseite noch nicht annahmebereit) verworfen wird, ist nicht einzeln geprüft.

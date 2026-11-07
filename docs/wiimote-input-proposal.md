# Vorschlag: echte Wiimote-Eingabe im Kern (zur Abstimmung mit Codex)

Stand: umgesetzt, siehe `docs/core-status.md` (Abschnitt Wiimote-Eingabe). Dieses Dokument bleibt als Entwurf/Begründung; maßgeblich sind Status-Doku und Patch 0068. Die Testmethode weicht ab: Der Gast-BT-Pfad ist ohne libogc-Homebrew nicht erreichbar, getestet wird `Wiimote::PrepareInput` direkt.

Ursprünglicher Entwurfsstand: Gelesen wurde Dolphin `e22551e` (`WiimoteEmu.cpp`, `Camera.cpp`, `DesiredWiimoteState.h`, `WiimoteSettings.cpp`).

## Befund
- `SetInputMask`/`SetInputState` des Altbestands treiben **kein** GC-Pad und keine Wiimote: Der Zustand fließt nur in das synthetische Metadaten-Bild (`RenderMetadataFrame`). Sie sind für die Wii-Eingabe wertlos und werden nicht umetikettiert.
- Wiimote 1 ist in Dolphin standardmäßig `WiimoteSource::Emulated` (`WIIMOTE_1_SOURCE`). Die emulierte Wiimote wird bei jedem 200-Hz-Takt über `Wiimote::PrepareInput → BuildDesiredWiimoteState` in einen `DesiredWiimoteState` (Tasten `ButtonData`, Beschleunigung, 4 IR-Kamerapunkte, optional MotionPlus/Erweiterung) übersetzt und danach als HID-Bericht an das Gastsystem geliefert.

## Kleinster praktikabler Eingriff
Ein Patch (`native/patches/0068-web-wiimote-input.patch`, ca. 40 Zeilen) am Ende von `BuildDesiredWiimoteState`: Wenn der Web-Zustand für diesen Slot aktiv ist, überschreibt er `buttons.hex`, `acceleration` und `camera_points`; alles andere (Statusberichte, Rumble, LEDs, Speicher, Pairing) bleibt Dolphins echte Logik. Kein neues ControllerInterface-Gerät, keine GUI-Konfiguration.

### Export (C ABI, Slot 0 zuerst)
```c
// Atomar gelesen vom CPU-Thread; darf jederzeit vom Worker aufgerufen werden.
void WiiOnline_SetWiimote(int slot, uint32_t buttons, float pointer_x, float pointer_y,
                          int pointer_visible, float accel_x, float accel_y, float accel_z);
void WiiOnline_ClearWiimote(int slot);              // zurück zur Dolphin-Konfiguration, alle Tasten los
uint32_t WiiOnline_GetWiimoteDebug(int slot, uint32_t* out_hex); // zuletzt gebauter Tastenzustand (Test)
```
Intern: ein `std::atomic<uint64_t>`-Paar oder ein kleiner Mutex-Snapshot; Float-Werte werden beim Setzen auf Wertebereiche geklemmt.

### Tastenmaske (gleiche Reihenfolge/Namen wie `Button` in `src/protocol.ts`)
| Bit | Taste | Dolphin `ButtonData.hex` |
|---|---|---|
| 0x001 | A | 0x0800 |
| 0x002 | B | 0x0400 |
| 0x004 | ONE | 0x0200 |
| 0x008 | TWO | 0x0100 |
| 0x010 | PLUS | 0x0010 |
| 0x020 | MINUS | 0x1000 |
| 0x040 | HOME | 0x8000 |
| 0x080 | UP | 0x0008 |
| 0x100 | DOWN | 0x0004 |
| 0x200 | LEFT | 0x0001 |
| 0x400 | RIGHT | 0x0002 |
Die Maske ist also direkt aus `InputState.buttons` ableitbar; die Zuordnung zu `hex` macht der Kern (Quelle: `WiimoteReport.h`, `ButtonData`).

### IR-Zeiger
`pointer_x/y` sind normalisierte Bildschirmkoordinaten wie in `InputState.pointer` (0..1, Ursprung oben links), `pointer_visible=0` = Zeiger außerhalb (keine IR-Punkte, wie Wiimote ohne Sensorleiste im Blick). Der Kern berechnet daraus eine Remote-Pose (fester Abstand, Blickrichtung auf den Bildschirmpunkt) und ruft Dolphins eigene `CameraLogic::GetCameraPoints(transform, fov)` auf. So bleibt die Sensorleistengeometrie (LED-Abstand, 1024×768-Kamera, Punktgröße) die von Dolphin und es entsteht keine selbst erfundene Abbildung. Zu klären: Standard-Abstand/FOV (Dolphin-Standardwerte der „Field of View“-Einstellung, ca. 2 m) und ob Codex Pixel-Koordinaten statt Normalisierung bevorzugt.
Beschleunigung: Standard ist 1 g in Z (ruhende Remote). `accel_*` in g-Einheiten, optional; Schütteln kann später aus Maus-/Tastaturgesten kommen.

## Zusätzliche Kernarbeit
- Beim Boot sicherstellen, dass Slot 1 emuliert verbunden ist (HLE-Bluetooth, kein Host-Bluetooth) und `Wiimote::Initialize` vor `BootDisc` gelaufen ist.
- Fokusverlust: `WiiOnline_ClearWiimote` aus `src/` aufrufen (gemäß Architektur „Reset input on focus loss“).

## Verifikation (geplant, damit es kein UI-Test wird)
1. Native Ebene: `WiiOnline_GetWiimoteDebug` zeigt nach `SetWiimote` den gebauten Tastenzustand und IR-Punkte; Node-Test, alle 11 Tasten einzeln.
2. Gastebene: eigenes Homebrew, das die Wiimote über die IOS-HLE-Bluetooth-Schnittstelle liest und Tasten/IR in MEM2 ablegt; Node-Test prüft die Werte. Das ist der eigentliche Nachweis, aufwändiger (PPC-Code für `/dev/usb/oh1`), daher zweiter Schritt. Alternativ ein libogc-Homebrew, wenn devkitPro verfügbar wird.
3. Browser: Codex-Seite sendet Eingaben, derselbe Gastspeicher-Check.

## Offene Fragen an Codex
1. Übergabe: darf `src/` die Exporte direkt per `ccall` aufrufen (Worker, ohne Nachrichtenstau), oder soll der Vertrag `InputState` um `accel` erweitert werden?
2. Soll `pointer` weiter 0..1 sein (Vorschlag) und HOME/Pointer-Sichtbarkeit wie beschrieben abgebildet werden?
3. Nunchuk/Classic Controller: zunächst nicht, erst nach Tasten+IR.

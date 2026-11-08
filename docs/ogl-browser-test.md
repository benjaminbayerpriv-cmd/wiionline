# OGL/WebGL2 browser probe

Status: partial probe, not a Wii Play gameplay performance result.

## Setup

- Preview: `http://127.0.0.1:4173/?video=ogl`
- Browser: visible Chrome, local machine; the local RVZ was served only from loopback during this run and the temporary server was stopped afterward.
- Chrome's active GL renderer/device was not independently identified, so hardware acceleration is not confirmed.
- Core artifact reported by the page: `e22551eae1c84a7e4d0b6a5c519ef4ed4ef69df1`.
- OGL options: `dolphinOglReadbackPresent=true`, `dolphinOglWorkerWebGl=true`, OffscreenCanvas 640x528.
- Game: Wii Play (Europe) (En,Fr,De,Es,It) (Rev 1).rvz, through its safety screen only.

## Observations

- The OGL path produced the real Wii safety screen. Native stats reported `worker:1`, `glerr:0x0`, 640x528 framebuffer and repeated `glfb`/`ogl_swap` increments. This confirms rendering and readback for this screen.
- After startup, sampled guest-time/wall-time ratios stayed about 0.99–1.01x. The first sample was 0.538x while the core was starting.
- The full-RGBA hash changed during initial screen transitions, then remained identical across many five-second probe intervals. Frame deliveries continued at roughly 150–250 per five seconds, but repeated frames are not distinct game frames.
- Thus the probe does not meet the success criterion of at least 20 distinct gameplay images/s. The game never left the safety screen, so no claim about Wii Play's gameplay performance follows from these measurements.
- Keyboard X and a canvas left-click produced adapter logs with UI mask `0x1` followed by `0x0`. A defect in the adapter debug reader had falsely reported the native debug export unavailable: it required `HEAPU32`, while this artifact exposes `HEAPU8`. The adapter now reads the native 16-word snapshot through `HEAPU8`; the visible run then showed `mask=0x1`, `last_hex=0x800` after release, and an increasing build count. This proves A reached Dolphin's WPAD state builder.
- The later OGL log hashes changed after repeated A presses, but the Mac locked during the run and the screenshots became black. The exact guest screen and whether those changes represent advancing Wii Play screens could not be verified visually.
- Paused/stopped the emulator after the run. The temporary local file server was stopped. No native core build or second performance run was started.

## Follow-up

The kernel owner's independent software-renderer run verified that A reaches the guest and advanced past warning screens. Re-run the OGL visible-Chrome image-hash probe after unlocking macOS and verify the actual title/gameplay screen visually. Keep distinct-content hashes separate from VI callbacks and guest clock rate.

The software-renderer matrix and its limitations are documented on `claude/core-wasm` in `docs/performance-status.md`, commit `55e7a23`. Its title-screen runs found no useful speedup from the fast raster/TEV modes; they did not measure a minigame.

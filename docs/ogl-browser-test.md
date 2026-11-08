# OGL/WebGL2 browser probe

Status: the experimental OGL readback path renders a real Wii safety screen, but Wii Play does not advance under input in this run. This is not a gameplay performance result.

## Setup

- Preview: visible Chrome at `http://127.0.0.1:4173/?video=ogl&testLocal=1`.
- RVZ was served only over loopback from a temporary server; that server was stopped after the run.
- Chrome's active GL renderer/device was not independently identified, so hardware acceleration is unconfirmed.
- Core artifact revision: `e22551eae1c84a7e4d0b6a5c519ef4ed4ef69df1`.
- OGL options: `dolphinOglReadbackPresent=true`, `dolphinOglWorkerWebGl=true`; OffscreenCanvas 640x528.
- Game: Wii Play (Europe) (En,Fr,De,Es,It) (Rev 1).rvz.

## Observations

- A visible screenshot confirmed the actual Wii wrist-strap/adequate-room safety screen. Native stats reported `worker:1`, `glerr:0x0`, a 640x528 framebuffer, and advancing `glfb`/`ogl_swap` counters. This proves the OGL path draws and reads back this screen; it does not prove hardware GPU use or correct game rendering beyond this screen.
- After startup, sampled guest-time/wall-time ratios stayed about 0.99–1.01x. Frame delivery continued (typically about 35–55 deliveries/s in the probe's five-second windows), while full RGBA hashes had zero changes in each later window. Deliveries and VI generations are not distinct rendered-game FPS.
- The observed screen remained the safety warning after repeated short A presses and a longer hold. Logs showed UI mask `0x1`, native snapshot `last_hex=0x800`, and rising `build_count`, so the adapter input reached Dolphin's native WPAD state builder. Yet no screen transition/gameplay was visually confirmed. The guest input path beyond state construction is still unresolved for OGL.
- Native stats continued to report `glerr=0x0`; no GL error explains the lack of progress. The run does not meet the proposed threshold of at least 20 distinct gameplay images/s at at least 0.9x guest time. No Wii Play gameplay speed or lag claim follows.
- Clicking Stop ended the run but the worker then reported `Uncaught RuntimeError: memory access out of bounds`. This teardown failure is a separate reproducible-looking issue to investigate; the run was stopped and the temporary file server was shut down.

## Interpretation and follow-up

The OGL route avoids the measured software rasterizer workload in this probe, but the guest remains at the safety screen despite native input delivery. First compare the same core/game/input in software rendering and OGL with an explicit confirmation of each screen transition. Then trace whether the WPAD guest poll sees the pressed A bit under OGL and inspect the teardown memory error. Do not use VI callbacks, guest clock rate, or repeated readbacks as gameplay FPS.

The software-renderer matrix and limitations are documented on `claude/core-wasm` in `docs/performance-status.md`, commit `55e7a23`; it found no useful speedup from the fast raster/TEV modes on the title screen. The separate software-renderer WPAD guest evidence is commit `e64c41d`; that does not establish OGL input behavior.

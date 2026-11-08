# Original Wii VI/XFB test

The remote graphics agent went offline; Codex took over this test. `scripts/av-build-xfb-test.py` generates `xfb-bars.dol` and the expected manifest without a cross compiler, firmware, Nintendo SDK or libogc code. The DOL contains a small original PowerPC program and a 320x240 YUYV buffer with eight grayscale bars. Guest code configures VI, writes XFB1 to MEM2, and enters a fixed loop.

Run:

```sh
python3 scripts/av-build-xfb-test.py
node scripts/av-verify-xfb.mjs /path/to/dist-core /path/to/results
```

The test exercises CPU execution, Wii MEM2, VI timing/MMIO, XFB scanout, native YUYV decoding and RGBA transfer. It does **not** test GX rendering, Wii Remote input, sound, commercial games or gameplay speed. The buffer is static; its existence alone is insufficient evidence. The runner also checks the executed guest marker, terminal PC, Wii flag and a newly published frame, then independently compares the eight pixel samples.

Actual Node WASM result is in `graphics/results/xfb-node.json`: 320x240, all eight samples matched, marker and PC correct. Production browser testing then displayed the same DOL at the default 160x120 presentation scale; pause/resume/stop and a second load/start were observed. Browser pixel extraction was unavailable through the browser automation API, so exact pixel assertions belong to the Node run, not the browser claim.

Register facts were checked against the pinned owning source:
- https://github.com/dolphin-emu/dolphin/blob/e22551eae1c84a7e4d0b6a5c519ef4ed4ef69df1/Source/Core/Core/HW/VideoInterface.h
- https://github.com/dolphin-emu/dolphin/blob/e22551eae1c84a7e4d0b6a5c519ef4ed4ef69df1/Source/Core/Core/HW/VideoInterface.cpp

The generated program uses VI MMIO at 0xCC002000, byte-addressed MEM1 XFB at 0x00100000, 240 active lines and 320-pixel stride/width. It disables VI interrupts because it does not install an interrupt handler. Expected neutral-chroma grayscale values use limited-range YUV conversion with tolerance 4.

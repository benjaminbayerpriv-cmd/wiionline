# Browser WPAD guest test

This runs an actual Wii libogc/wiiuse DOL inside the production Dolphin WASM module, using the production TypeScript adapter. It reads the guest's result structure through WiiOnline_CopyGuest. It does not call the native TestPrepareInput shortcut.

Original test source, DOL and result-address manifest were taken unchanged from the core agent's commit 2dfdb65: native/test/wpad/. The toolchain image digest and DOL hash are preserved in wpad_test.json. The DOL links devkitPro libogc/wiiuse; original test source is wpad_test.c. Upstream libraries: https://github.com/devkitPro/libogc and https://github.com/devkitPro/wiiuse . The pinned build recipe is scripts/core-build-wpad.sh on claude/core-wasm.

Reproduce with the installed native build:

```sh
npm run build
npm run test:browser:stage
npm run preview
```

Open /diagnostics/wpad/index.html and click Gasttest starten. The stage step intentionally puts diagnostics in the local production preview; diagnostics are not included in the default app build.

Observed result: 25/25 checks passed in the in-app browser, including all eleven buttons, combined buttons, release, IR visible/hidden and distinct corner positions, acceleration change, neutralization across pause/resume, and stop/unload. Evidence: graphics/results/wpad-browser.json.

Limits: automated calls into the adapter do not cover the keyboard DOM handlers or focus-loss event delivery. Absolute IR coordinates and the second point's upper bits are not asserted here. Only slot 0 is covered. This is not a Wii Play responsiveness, audio, or performance benchmark.

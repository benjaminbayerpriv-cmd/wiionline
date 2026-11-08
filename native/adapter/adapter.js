// /core/adapter.js: Kern-Adapter nach src/protocol.ts (CreateCore). Laeuft im dedizierten Module-Worker.
// Stand: DOL-Homebrew wird real im Dolphin-WASM-Kern ausgefuehrt. Es gibt (noch) KEINE Frames/Audio
// (Video-Backend "Null", Audio stumm; Grafik/Audio gehoeren zum AV-Zweig) und Input ist nicht verdrahtet.
// Metriken: nur gemessene Gast-Ticks gegen Wanduhr (emulationSpeed); fps wird nicht erfunden (0).
import createDolphinCore from "./dolphin-core-upstream.js";

const REVISION = "dolphin e22551eae1c84a7e4d0b6a5c519ef4ed4ef69df1 / emscripten 5.0.7";

export async function createCore(emit, options = {}) {
  const cpu = options.cpu ?? "cached";            // "interpreter" | "cached"
  const wasmJit = options.wasmJit ?? 1;           // 0 aus, 1/2 Policy des Patchsatzes
  const log = (message) => emit({ type: "log", message });
  const M = await createDolphinCore({ dolphinCoreLog: true, print: log, printErr: log });
  const c = (n, r, a, v) => M.ccall(n, r, a, v);
  const info = { name: "Dolphin WASM (headless)", revision: REVISION, formats: [".dol"] };
  c("SetVideoBackend", "number", ["string"], ["Null"]);
  c("SetCpuCore", "number", ["string"], [cpu]);
  c("SetCpuThread", "number", ["number"], [1]);
  if (wasmJit) c("SetPpcWasmJitEnabled", null, ["number"], [wasmJit]);
  c("SetAudioMuted", "number", ["number"], [1]);
  c("CoreInit", "number", [], []);
  emit({ type: "status", state: "idle", message: "Kern initialisiert", core: info });

  let loaded = false, running = false, timer = 0, t0 = 0, ticks0 = 0n;
  const ticks = () => (BigInt(c("GetCoreTicksHigh", "number", [], []) >>> 0) << 32n) | BigInt(c("GetCoreTicksLow", "number", [], []) >>> 0);
  const stopTimer = () => { if (timer) clearInterval(timer); timer = 0; };

  return {
    info,
    async load(file) {
      if (!/\.dol$/i.test(file.name)) { emit({ type: "error", code: "unsupported-format", message: `Nur .dol wird unterstuetzt: ${file.name}` }); throw new Error("unsupported-format"); }
      emit({ type: "status", state: "loading", message: `Lade ${file.name}` });
      M.FS.writeFile("/title.dol", new Uint8Array(await file.arrayBuffer()));
      loaded = true;
      emit({ type: "status", state: "ready", message: `${file.name} bereit` });
    },
    async start() {
      if (!loaded) { emit({ type: "error", code: "no-title", message: "Kein Titel geladen" }); throw new Error("no-title"); }
      if (running) { c("SetCorePaused", "number", ["number"], [0]); emit({ type: "status", state: "running", message: "Fortgesetzt" }); return; }
      if (!c("BootDisc", "number", ["string"], ["/title.dol"])) {
        const message = c("GetCoreStatus", "string", [], []);
        emit({ type: "error", code: "boot-failed", message }); throw new Error(message);
      }
      running = true; t0 = performance.now(); ticks0 = ticks();
      timer = setInterval(() => {
        c("PumpHostJobs", null, [], []);
        const dt = (performance.now() - t0) / 1000;
        const guestSec = Number(ticks() - ticks0) / c("GetCoreTicksPerSecond", "number", [], []);
        if (dt > 0) emit({ type: "metrics", fps: 0, emulationSpeed: guestSec / dt });
      }, 500);
      emit({ type: "status", state: "running", message: "Laeuft (PC 0x" + (c("GetPPCPC", "number", [], []) >>> 0).toString(16) + ")" });
    },
    async pause() { if (running) { c("SetCorePaused", "number", ["number"], [1]); emit({ type: "status", state: "paused", message: "Pausiert" }); } },
    async stop() { stopTimer(); if (running) c("StopCore", null, [], []); running = false; loaded = false; emit({ type: "status", state: "idle", message: "Gestoppt" }); },
    input() { /* Wiimote-Eingabe noch nicht verdrahtet (siehe docs/core-status.md) */ },
    // Diagnose fuer Tests (nicht Teil von EmulatorCore)
    debug: { readU32: (a) => c("WiiOnline_ReadGuestU32", "number", ["number"], [a]) >>> 0, pc: () => c("GetPPCPC", "number", [], []) >>> 0, isWii: () => c("WiiOnline_IsWii", "number", [], []) },
  };
}

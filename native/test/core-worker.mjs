// Fuehrt das Testprogramm im Dolphin-WASM-Kern aus und meldet Beweisdaten zurueck.
// Laeuft als Module-Worker im Browser (Pthreads brauchen Atomics.wait).
import createDolphinCore from "./dolphin-core-upstream.js";

const log = (m) => postMessage({ type: "log", m });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

self.onerror = (e) => log("worker onerror: " + (e.message || e));
self.onunhandledrejection = (e) => log("unhandledrejection: " + e.reason);
onmessage = async (ev) => {
  const { cpu = "interpreter", dolUrl = "hello_wii.dol", expectedUrl = "expected.json", timeoutMs = 240000, jit = 0 } = ev.data;
  const t0 = performance.now();
  try {
    const [dol, expected] = await Promise.all([
      fetch(dolUrl).then((r) => r.arrayBuffer()), fetch(expectedUrl).then((r) => r.json())]);
    log("worker gestartet, lade Kern ...");
    if (ev.data.trace) {
      const of = self.fetch; self.fetch = (...a) => { log("fetch " + a[0]); return of(...a).then((r) => { log("fetch ok " + r.status); return r; }); };
      const OW = self.Worker; self.Worker = class extends OW { constructor(u, o) { log("new Worker " + u); super(u, o); this.addEventListener("error", (e) => log("pthread-worker error " + e.message + " @" + e.filename + ":" + e.lineno + ":" + e.colno + " " + (e.error && e.error.stack))); } };
      const om = WebAssembly.Memory; WebAssembly.Memory = class extends om { constructor(d) { log("Memory " + JSON.stringify(d)); super(d); } };
    }
    const M = await createDolphinCore({ dolphinCoreLog: true, print: log, printErr: log });
    const c = (n, r, a, v) => M.ccall(n, r, a, v);
    log(`Modul geladen nach ${(performance.now() - t0).toFixed(0)} ms; ${c("WiiOnline_BuildInfo", "string", [], [])}`);
    M.FS.writeFile("/hello_wii.dol", new Uint8Array(dol));
    log(`SetVideoBackend(Null)=${c("SetVideoBackend", "number", ["string"], ["Null"])}`);
    log(`SetCpuCore(${cpu})=${c("SetCpuCore", "number", ["string"], [cpu])}`);
    log(`SetCpuThread(1)=${c("SetCpuThread", "number", ["number"], [1])}`);
    if (jit) log(`SetPpcWasmJitEnabled(${jit})`), c("SetPpcWasmJitEnabled", null, ["number"], [jit]);
    c("SetAudioMuted", "number", ["number"], [1]);
    c("CoreInit", "number", [], []);
    const tBoot = performance.now();
    const ok = c("BootDisc", "number", ["string"], ["/hello_wii.dol"]);
    log(`BootDisc=${ok} status="${c("GetCoreStatus", "string", [], [])}"`);
    if (!ok) throw new Error("BootDisc fehlgeschlagen");
    const R = expected.result_addr;
    const u32 = (a) => c("WiiOnline_ReadGuestU32", "number", ["number"], [a]) >>> 0;
    let done = false;
    while (performance.now() - tBoot < timeoutMs) {
      c("PumpHostJobs", null, [], []);
      if (u32(R + 16) === expected.done) { done = true; break; }
      await sleep(50);
    }
    const tDone = performance.now();
    await sleep(300); c("PumpHostJobs", null, [], []);
    const pc = c("GetPPCPC", "number", [], []) >>> 0;
    const ptr = M._malloc(0x20);
    c("WiiOnline_CopyGuest", "number", ["number", "number", "number"], [R, ptr, 0x20]);
    const bytes = new Uint8Array(M.HEAPU8.subarray(ptr, ptr + 0x20)); M._free(ptr);
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    const magic = String.fromCharCode(...bytes.subarray(0, 8));
    const dv = new DataView(bytes.buffer);
    const got = { magic, sum: dv.getUint32(8), lcg: dv.getUint32(12), done: dv.getUint32(16) };
    const ticks = (BigInt(c("GetCoreTicksHigh", "number", [], []) >>> 0) << 32n) | BigInt(c("GetCoreTicksLow", "number", [], []) >>> 0);
    const isWii = c("WiiOnline_IsWii", "number", [], []);
    const verdict = done && got.magic === expected.magic && got.sum === expected.sum && got.lcg === expected.lcg &&
      got.done === expected.done && pc === expected.end_loop_pc && isWii === 1;
    postMessage({ type: "result", verdict, cpu, got, expected, pc: "0x" + pc.toString(16), isWii,
      cpuCoreName: c("GetCPUCoreName", "string", [], []), state: c("GetCoreStateName", "string", [], []),
      guestTicks: ticks.toString(), jit, jitCompiled: M._GetPpcWasmBlockCompileCount ? c("GetPpcWasmBlockCompileCount", "number", [], []) : null, jitRuns: M._GetPpcWasmBlockRunCount ? c("GetPpcWasmBlockRunCount", "number", [], []) : null, bootToDoneMs: Math.round(tDone - tBoot), resultMemHex: hex,
      userAgent: self.navigator?.userAgent ?? "node" });
    c("StopCore", null, [], []);
  } catch (e) {
    postMessage({ type: "result", verdict: false, error: String(e?.stack || e) });
  }
};

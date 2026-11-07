// Headless-Variante des Browsertests (Node >= 20): gleicher Ablauf wie core-worker.mjs.
// Aufruf: node run-node.mjs <dist-dir> [interpreter|cached]
import path from "node:path"; import { readFile } from "node:fs/promises"; import { pathToFileURL, fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(process.argv[2] || path.join(here, "../../dist-core"));
const cpu = process.argv[3] || "interpreter";
const { default: create } = await import(pathToFileURL(path.join(dist, "dolphin-core-upstream.js")));
const expected = JSON.parse(await readFile(path.join(here, process.env.EXPECTED || "expected.json"), "utf8"));
const dol = await readFile(path.join(here, process.env.DOL || "hello_wii.dol"));
const t0 = performance.now();
const M = await create({ dolphinCoreLog: true, print: console.log, printErr: console.log });
const c = (n, r, a, v) => M.ccall(n, r, a, v);
console.log("info:", c("WiiOnline_BuildInfo", "string", [], []), "load ms", Math.round(performance.now() - t0));
M.FS.writeFile("/hello_wii.dol", new Uint8Array(dol));
console.log("backend", c("SetVideoBackend", "number", ["string"], ["Null"]), "cpu", c("SetCpuCore", "number", ["string"], [cpu]), "thread", c("SetCpuThread", "number", ["number"], [1]));
if (process.env.WASMJIT) console.log("wasmjit", c("SetPpcWasmJitEnabled", null, ["number"], [Number(process.env.WASMJIT)]));
c("CoreInit", "number", [], []);
const tBoot = performance.now();
const ok = c("BootDisc", "number", ["string"], ["/hello_wii.dol"]);
console.log("BootDisc", ok, c("GetCoreStatus", "string", [], []));
const R = expected.result_addr;
const u32 = (a) => c("WiiOnline_ReadGuestU32", "number", ["number"], [a]) >>> 0;
let done = false;
while (performance.now() - tBoot < 240000) {
  c("PumpHostJobs", null, [], []);
  if (u32(R + 16) === expected.done) { done = true; break; }
  await new Promise((r) => setTimeout(r, 50));
}
await new Promise((r) => setTimeout(r, 300));
const gi = (n) => c(n, "number", [], []);
console.log(JSON.stringify({ jitCompiled: typeof M._GetPpcWasmBlockCompileCount === "function" ? gi("GetPpcWasmBlockCompileCount") : null, jitRuns: typeof M._GetPpcWasmBlockRunCount === "function" ? gi("GetPpcWasmBlockRunCount") : null, done, ms: Math.round(performance.now() - tBoot), pc: (c("GetPPCPC", "number", [], []) >>> 0).toString(16),
  isWii: c("WiiOnline_IsWii", "number", [], []), state: c("GetCoreStateName", "string", [], []), cpuName: c("GetCPUCoreName", "string", [], []),
  mem: [0, 4, 8, 12, 16].map((o) => u32(R + o).toString(16)), expected: { sum: expected.sum.toString(16), lcg: expected.lcg.toString(16) } }));
process.exit(0);

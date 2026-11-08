// Messlauf fuer eine Disc (RVZ) im Kern, headless in Node. Aufruf:
//  node probe.mjs <dist-dir> <disc.rvz> [--seconds 60] [--video "Software Renderer"|Null] [--cpu cached|interpreter] [--jit 0|1|2]
//    [--thread 0|1] [--speed 1] [--oc 1] [--raw]  -> schreibt JSON auf stdout
import path from "node:path"; import { pathToFileURL } from "node:url"; import fs from "node:fs";
const a = process.argv.slice(2); const pos = a.filter((x, i) => !x.startsWith("--") && !(i > 0 && a[i - 1].startsWith("--") && a[i - 1] !== "--raw"));
const opt = (n, d) => { const i = a.indexOf("--" + n); return i >= 0 ? a[i + 1] : d; };
const dist = path.resolve(pos[0]), disc = path.resolve(pos[1]);
const seconds = Number(opt("seconds", 60)), video = opt("video", "Software Renderer"), cpu = opt("cpu", "cached"), jit = Number(opt("jit", 1));
const thread = Number(opt("thread", 1)), speed = Number(opt("speed", 1)), oc = Number(opt("oc", 1)), warm = Number(opt("warmup", 20));
const { default: create } = await import(pathToFileURL(path.join(dist, "dolphin-core-upstream.js")));
const M = await create({ print: () => {}, printErr: () => {} });
const c = (n, r, t, v) => M.ccall(n, r, t, v);
M.FS.mkdir("/disc"); M.FS.mount(M.NODEFS, { root: path.dirname(disc) }, "/disc");
const file = "/disc/" + path.basename(disc);
c("SetVideoBackend", "number", ["string"], [video]); c("SetCpuCore", "number", ["string"], [cpu]); c("SetCpuThread", "number", ["number"], [thread]);
if (jit) c("SetPpcWasmJitEnabled", null, ["number"], [jit]);
if (speed !== 1) c("SetEmulationSpeed", "number", ["number"], [speed]);
if (oc !== 1) c("SetCpuOverclock", "number", ["number"], [oc]);
c("SetAudioMuted", "number", ["number"], [Number(opt("mute", 1))]); c("CoreInit", "number", [], []);
const t0 = performance.now();
if (!c("BootDisc", "number", ["string"], [file])) throw new Error("Boot: " + c("GetCoreStatus", "string", [], []));
if (typeof M._SetSoftwareRasterProfileEnabled !== "function") throw new Error("Kernprofil-Export fehlt");
c("SetSoftwareRasterProfileEnabled", "number", ["number"], [1]);
const num = (n) => (typeof M["_" + n] === "function" ? Number(c(n, "number", [], [])) >>> 0 : null);
const ticks = () => Number((BigInt(num("GetCoreTicksHigh")) << 32n) | BigInt(num("GetCoreTicksLow")));
const samples = []; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const snap = () => { const stats = c("GetVideoStats", "string", [], []); const counter = (name) => Number(new RegExp(`(?:^|\\s)${name}:(\\d+)`).exec(stats)?.[1] ?? NaN); return { wall: (performance.now() - t0) / 1000, ticks: ticks(), tps: num("GetCoreTicksPerSecond"), frameGen: num("GetFrame"), xfbCopies: counter("xfbgen"), drawBatches: counter("drawbatch"), pc: num("GetPPCPC"), jitCompiled: num("GetPpcWasmBlockCompileCount"), jitRuns: num("GetPpcWasmBlockRunCount"), state: c("GetCoreStateName", "string", [], []) }; };
while ((performance.now() - t0) / 1000 < seconds) { c("PumpHostJobs", null, [], []); samples.push(snap()); await sleep(250); }
const out = { cfg: { video, cpu, jit, thread, speed, oc, seconds, disc: path.basename(disc), node: process.version }, tps: samples[samples.length-1].tps, title: c("GetCoreTitle", "string", [], []), status: c("GetCoreStatus", "string", [], []),
  videoStats: c("GetVideoStats", "string", [], []), ppcProfile: typeof M._GetPpcProfileStats === "function" ? c("GetPpcProfileStats", "string", [], []) : null, samples };
if (a.includes("--raw")) console.log(JSON.stringify(out)); else {
  const w = samples.filter((s) => s.wall >= warm), f = w[0], l = w[w.length - 1];
  const dw = l.wall - f.wall, gs = (l.ticks - f.ticks) / l.tps;
  console.log(JSON.stringify({ ...out, samples: undefined, window: { fromWall: f.wall, toWall: l.wall, guestSeconds: gs, speedRatio: gs / dw, frameGenPerSec: (l.frameGen - f.frameGen) / dw, jitRunsPerSec: (l.jitRuns - f.jitRuns) / dw, jitCompiledDelta: l.jitCompiled - f.jitCompiled, lastPC: l.pc, firstSamples: samples.slice(0, 3) } }, null, 1)); }
process.exit(0);

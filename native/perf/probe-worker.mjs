// Browser-Messlauf (Module-Worker): wie probe.mjs, Disc kommt per fetch('/disc.rvz') -> Blob -> WORKERFS (wie die Seite).
import createDolphinCore from "./dolphin-core-upstream.js";
onmessage = async (ev) => {
  const o = ev.data; const t00 = performance.now();
  try {
    const M = await createDolphinCore({ print: () => {}, printErr: () => {} });
    const c = (n, r, t, v) => M.ccall(n, r, t, v);
    const blob = await (await fetch("/disc.rvz")).blob();
    postMessage({ type: "log", m: `disc ${blob.size} B geladen, ${(performance.now() - t00).toFixed(0)} ms` });
    M.FS.mkdir("/disc"); M.FS.mount(M.WORKERFS, { blobs: [{ name: "disc.rvz", data: blob }] }, "/disc");
    c("SetVideoBackend", "number", ["string"], [o.video]); c("SetCpuCore", "number", ["string"], [o.cpu]); c("SetCpuThread", "number", ["number"], [o.thread]);
    if (o.jit) c("SetPpcWasmJitEnabled", null, ["number"], [o.jit]);
    if (o.speed !== 1) c("SetEmulationSpeed", "number", ["number"], [o.speed]);
    if (o.oc !== 1) c("SetCpuOverclock", "number", ["number"], [o.oc]);
    c("SetAudioMuted", "number", ["number"], [o.mute]); c("CoreInit", "number", [], []);
    const t0 = performance.now();
    if (!c("BootDisc", "number", ["string"], ["/disc/disc.rvz"])) throw new Error("Boot: " + c("GetCoreStatus", "string", [], []));
    const num = (n) => (typeof M["_" + n] === "function" ? Number(c(n, "number", [], [])) >>> 0 : null);
    const ticks = () => Number((BigInt(num("GetCoreTicksHigh")) << 32n) | BigInt(num("GetCoreTicksLow")));
    const samples = []; const shots = []; const dist = { calls: 0, distinct: 0, series: [], gaps: [] };
    let lastGen = -1, lastHash = 0, lastDistinctT = 0;
    const gtimer = o.distinct ? setInterval(() => { const g = num("GetFrame"); if (g === lastGen) return; lastGen = g; dist.calls++; const w = num("FrameWidth"), h = num("FrameHeight"), p = num("FrameBuffer"); if (!w || !h || !p) return; const u = new Uint32Array(M.HEAPU8.buffer, p, w * h); let x = 2166136261; for (let i = 0; i < u.length; i++) x = Math.imul(x ^ u[i], 16777619); const t = (performance.now() - t0) / 1000; if (x !== lastHash) { lastHash = x; dist.distinct++; if (lastDistinctT) dist.gaps.push((t - lastDistinctT) * 1000); lastDistinctT = t; } const sec = Math.floor(t); dist.series[sec] = dist.series[sec] || [0, 0]; dist.series[sec][0]++; if (x !== dist.lastX) dist.series[sec][1]++; dist.lastX = x; }, 4) : null; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const script = (o.script || []).map((e) => ({ ...e, done: false })); const shotAt = (o.shots || []).map((t) => ({ t, done: false }));
    const grab = (label) => { const w = num("FrameWidth"), h = num("FrameHeight"), p = num("FrameBuffer"); if (!w || !h || !p) return; const u8 = M.HEAPU8.slice(p, p + w * h * 4); let bin = ""; for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); shots.push({ label, w, h, b64: btoa(bin) }); };
    while ((performance.now() - t0) / 1000 < o.seconds) {
      const now = (performance.now() - t0) / 1000;
      for (const e of script) if (!e.done && now >= e.t) { e.done = true; c("WiiOnline_SetWiimote", null, Array(8).fill("number"), [0, e.b || 0, e.x ?? 0.5, e.y ?? 0.5, e.v ?? 1, 0, 0, 1]); }
      for (const e of shotAt) if (!e.done && now >= e.t) { e.done = true; grab(String(e.t)); }
      c("PumpHostJobs", null, [], []);
      samples.push({ wall: (performance.now() - t0) / 1000, ticks: ticks(), tps: num("GetCoreTicksPerSecond"), frameGen: num("GetFrame"), pc: num("GetPPCPC"), jitCompiled: num("GetPpcWasmBlockCompileCount"), jitRuns: num("GetPpcWasmBlockRunCount") });
      await sleep(250);
    }
    postMessage({ type: "result", cfg: o, dist, shots, title: c("GetCoreTitle", "string", [], []), videoStats: c("GetVideoStats", "string", [], []), samples, ua: navigator.userAgent, cores: navigator.hardwareConcurrency });
  } catch (e) { postMessage({ type: "result", error: String(e && e.stack || e) }); }
};

// Browser-Messlauf (Module-Worker): wie probe.mjs, Disc kommt per fetch('/disc.rvz') -> Blob -> WORKERFS (wie die Seite).
import createDolphinCore from "./dolphin-core-upstream.js";
onmessage = async (ev) => {
  const o = ev.data; const t00 = performance.now();
  try {
    const modOpts = { print: o.logCore ? (t) => postMessage({ type: "log", m: "out: " + t }) : () => {}, printErr: o.logCore ? (t) => postMessage({ type: "log", m: "err: " + t }) : () => {}, ...(o.coreOpts || {}) };
    if (o.offscreenCanvas) modOpts.canvas = new OffscreenCanvas(o.offscreenCanvas[0], o.offscreenCanvas[1]);
    const M = await createDolphinCore(modOpts);
    const c = (n, r, t, v) => M.ccall(n, r, t, v);
    const blob = await (await fetch("/disc.rvz")).blob();
    postMessage({ type: "log", m: `disc ${blob.size} B geladen, ${(performance.now() - t00).toFixed(0)} ms` });
    M.FS.mkdir("/disc"); M.FS.mount(M.WORKERFS, { blobs: [{ name: "disc.rvz", data: blob }] }, "/disc");
    const dr = { calls: 0, bytes: 0 }; if (M.WORKERFS && M.WORKERFS.stream_ops) { const orig = M.WORKERFS.stream_ops.read; M.WORKERFS.stream_ops.read = function (...a) { const r = orig.apply(this, a); dr.calls++; dr.bytes += r > 0 ? r : 0; return r; }; }
    c("SetVideoBackend", "number", ["string"], [o.video]); c("SetCpuCore", "number", ["string"], [o.cpu]); c("SetCpuThread", "number", ["number"], [o.thread]);
    if (o.jit) c("SetPpcWasmJitEnabled", null, ["number"], [o.jit]);
    if (o.speed !== 1) c("SetEmulationSpeed", "number", ["number"], [o.speed]);
    if (o.oc !== 1) c("SetCpuOverclock", "number", ["number"], [o.oc]);
    if (o.fastsw) c("SetFastSoftwareRaster", "number", ["number"], [o.fastsw]);
    if (o.tevhot) c("SetSoftwareTevHotCaseMode", "number", ["number"], [o.tevhot]);
    if (o.pscale) c("SetPresentationScale", "number", ["number"], [o.pscale]);
    c("SetAudioMuted", "number", ["number"], [o.mute]); c("CoreInit", "number", [], []);
    const t0 = performance.now();
    if (!c("BootDisc", "number", ["string"], ["/disc/disc.rvz"])) throw new Error("Boot: " + c("GetCoreStatus", "string", [], []));
    if (typeof M._SetSoftwareRasterProfileEnabled !== "function") throw new Error("Kernprofil-Export fehlt");
    c("SetSoftwareRasterProfileEnabled", "number", ["number"], [1]);
    if (o.timingProfile) c("SetPpcProfileEnabled", null, ["number"], [1]);
    const num = (n) => (typeof M["_" + n] === "function" ? Number(c(n, "number", [], [])) >>> 0 : null);
    const ticks = () => Number((BigInt(num("GetCoreTicksHigh")) << 32n) | BigInt(num("GetCoreTicksLow")));
    const bootTicks = ticks();
    const guestSeconds = () => (ticks() - bootTicks) / num("GetCoreTicksPerSecond");
    const dbgPtr = typeof M._WiiOnline_GetWiimoteDebug === "function" ? M._malloc(64) : 0;
    const wmDebug = () => { if (!dbgPtr) return null; const n = M._WiiOnline_GetWiimoteDebug(0, dbgPtr); return n ? Array.from(new Uint32Array(M.HEAPU8.buffer, dbgPtr, 16)) : null; };
    const memAt = (o.mem || []).map((t) => ({ t, done: false })); const memSnaps = []; let memBuf = null;
    const memSnap = (label) => { memBuf ||= M._malloc(0x1800000); if (!M._WiiOnline_CopyGuest(0x80000000, memBuf, 0x1800000)) return; const u = new Uint32Array(M.HEAPU8.buffer, memBuf, 0x1800000 / 4); const h = []; for (let pg = 0; pg < 6144; pg++) { let x = 2166136261; for (let i = pg * 1024; i < pg * 1024 + 1024; i += 8) { x ^= u[i]; x = Math.imul(x, 16777619); } h.push(x >>> 0); } memSnaps.push({ label, h }); };
    const linkPtr = typeof M._WiiOnline_GetWiimoteLink === "function" ? M._malloc(32) : 0;
    const wmLink = () => { if (!linkPtr) return null; M._WiiOnline_GetWiimoteLink(linkPtr); return Array.from(new Uint32Array(M.HEAPU8.buffer, linkPtr, 8)); };
    const samples = []; const shots = []; const dist = { calls: 0, distinct: 0, series: [], gaps: [] };
    let lastGen = -1, lastHash = 0, lastDistinctT = 0;
    const gtimer = o.distinct ? setInterval(() => { const g = num("GetFrame"); if (g === lastGen) return; lastGen = g; dist.calls++; const w = num("FrameWidth"), h = num("FrameHeight"), p = num("FrameBuffer"); if (!w || !h || !p) return; const u = new Uint32Array(M.HEAPU8.buffer, p, w * h); let x = 2166136261; for (let i = 0; i < u.length; i++) x = Math.imul(x ^ u[i], 16777619); const t = (performance.now() - t0) / 1000; if (x !== lastHash) { lastHash = x; dist.distinct++; if (lastDistinctT) dist.gaps.push((t - lastDistinctT) * 1000); lastDistinctT = t; } const sec = Math.floor(t); dist.series[sec] = dist.series[sec] || [0, 0]; dist.series[sec][0]++; if (x !== dist.lastX) dist.series[sec][1]++; dist.lastX = x; }, 4) : null; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const script = (o.script || []).map((e) => ({ ...e, done: false })); const inputs = []; const shotAt = (o.shots || []).map((t) => ({ t, done: false }));
    const grab = (label) => { const w = num("FrameWidth"), h = num("FrameHeight"), p = num("FrameBuffer"); if (!w || !h || !p) return; const u8 = M.HEAPU8.slice(p, p + w * h * 4); let bin = ""; for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); shots.push({ label, w, h, b64: btoa(bin) }); };
    while ((performance.now() - t0) / 1000 < o.seconds && (o.guestEnd == null || guestSeconds() < o.guestEnd)) {
      const now = (performance.now() - t0) / 1000;
      const guest = guestSeconds();
      for (const e of script) if (!e.done && (e.g == null ? now >= e.t : guest >= e.g)) { e.done = true; c("WiiOnline_SetWiimote", null, Array(8).fill("number"), [0, e.b || 0, e.x ?? 0.5, e.y ?? 0.5, e.v ?? 1, 0, 0, 1]); inputs.push({ requestedGuest: e.g, requestedWall: e.t, actualGuest: guest, actualWall: now, buttons: e.b || 0 }); }
      for (const e of memAt) if (!e.done && now >= e.t) { e.done = true; memSnap(String(e.t)); }
      for (const e of shotAt) if (!e.done && now >= e.t) { e.done = true; grab(String(e.t)); }
      c("PumpHostJobs", null, [], []);
      const stats = c("GetVideoStats", "string", [], []);
      const counter = (name) => Number(new RegExp(`(?:^|\\s)${name}:(\\d+)`).exec(stats)?.[1] ?? NaN);
      const frameGen = num("GetFrame");
      samples.push({ link: wmLink(), dr: { ...dr }, ogl: (stats.match(/ogl_swap:\d+ worker:-?\d+ commit:-?\d+ bb:\d+x\d+ bits:\d+ rb:0x[0-9a-f]+ glerr:0x[0-9a-f]+/) || [null])[0], statsFull: (samples.length % 20 === 0) ? stats : undefined, wm: o.wmdebug ? wmDebug() : undefined, wall: (performance.now() - t0) / 1000, guest, ticks: ticks(), tps: num("GetCoreTicksPerSecond"), frameGen, viScanouts: frameGen, xfbCopies: counter("xfbgen"), drawBatches: counter("drawbatch"), rasterTriangles: counter("rast"), pc: num("GetPPCPC"), jitCompiled: num("GetPpcWasmBlockCompileCount"), jitRuns: num("GetPpcWasmBlockRunCount"), vs: o.profile ? stats : undefined });
      await sleep(o.sampleMs ?? 250);
    }
    postMessage({ type: "result", glRenderer: (() => { try { const g = new OffscreenCanvas(4, 4).getContext("webgl2"); const e = g.getExtension("WEBGL_debug_renderer_info"); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; } catch (x) { return String(x); } })(), memSnaps, cfg: o, dist, shots, inputs, title: c("GetCoreTitle", "string", [], []), videoStats: c("GetVideoStats", "string", [], []), timingStats: c("GetPpcWasmHelperStats", "string", [], []), samples, ua: navigator.userAgent, cores: navigator.hardwareConcurrency });
  } catch (e) { postMessage({ type: "result", error: String(e && e.stack || e) }); }
};

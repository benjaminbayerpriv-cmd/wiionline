// Wie run-browser.mjs, nimmt zusaetzlich einen Chrome-Trace (CDP Tracing) auf und gibt die laengsten Ereignisse je Prozess/Thread aus.
// Aufruf: node trace-run.mjs '<json-config>' [kategorien]
import { spawn } from "node:child_process"; import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const cfg = JSON.parse(process.argv[2]); const cats = process.argv[3] || "gpu,gpu.angle,toplevel,viz,disabled-by-default-gpu.service,disabled-by-default-gpu.angle";
const port = 9300 + Math.floor(Math.random() * 500); const chrome = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const prof = fs.mkdtempSync(path.join(os.tmpdir(), "perf-chrome-"));
const p = spawn(chrome, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, "--no-first-run", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); let ws, id = 0; const pend = new Map(); const events = [];
try {
  let targets; for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === "page")) break; } catch {} await sleep(200); }
  const page = targets.find((t) => t.type === "page"); ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let done; const tdone = new Promise((r) => (done = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === "Tracing.dataCollected") events.push(...d.params.value); else if (d.method === "Tracing.tracingComplete") done(); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Page.enable"); await send("Page.navigate", { url: `http://127.0.0.1:8124/perf.html#${encodeURIComponent(JSON.stringify(cfg))}` }); await sleep(12000);
  await send("Tracing.start", { traceConfig: { includedCategories: cats.split(","), recordMode: "recordAsMuchAsPossible" } }); await sleep(8000);
  await send("Tracing.end"); await tdone;
  const names = new Map(); for (const e of events) if (e.ph === "M" && e.name === "thread_name") names.set(e.pid + ":" + e.tid, e.args.name); const procs = new Map(); for (const e of events) if (e.ph === "M" && e.name === "process_name") procs.set(e.pid, e.args.name);
  const agg = new Map(); const longest = [];
  for (const e of events) { if (e.ph !== "X" || !e.dur) continue; const k = `${procs.get(e.pid) || e.pid}/${names.get(e.pid + ":" + e.tid) || e.tid} ${e.cat}:${e.name}`; const a = agg.get(k) || { n: 0, us: 0, max: 0 }; a.n++; a.us += e.dur; a.max = Math.max(a.max, e.dur); agg.set(k, a); }
  const top = [...agg.entries()].sort((a, b) => b[1].us - a[1].us).slice(0, 25).map(([k, v]) => `${(v.us / 1000).toFixed(0)}ms n=${v.n} max=${(v.max / 1000).toFixed(0)}ms  ${k}`);
  console.log(`events=${events.length}\n` + top.join("\n"));
} finally { try { ws && ws.close(); } catch {} p.kill("SIGKILL"); fs.rmSync(prof, { recursive: true, force: true }); }

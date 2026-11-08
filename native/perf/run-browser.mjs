// Startet headless Chrome (eigenes Profil), laedt perf.html mit Konfiguration, wartet auf das Ergebnis und gibt JSON aus.
// Aufruf: node run-browser.mjs '<json-config>'  (Port 8124 muss serve-perf.mjs bedienen)
import { spawn } from "node:child_process"; import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const cfg = JSON.parse(process.argv[2]); const port = 9300 + Math.floor(Math.random() * 500);
const chrome = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const prof = fs.mkdtempSync(path.join(os.tmpdir(), "perf-chrome-"));
const p = spawn(chrome, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, "--no-first-run", "--no-default-browser-check", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pend = new Map();
try {
  let targets; for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === "page")) break; } catch {} await sleep(200); }
  const page = targets.find((t) => t.type === "page"); ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Page.enable"); await send("Page.navigate", { url: `http://127.0.0.1:8124/perf.html#${encodeURIComponent(JSON.stringify(cfg))}` });
  const deadline = Date.now() + (cfg.seconds + 240) * 1000; let res;
  while (Date.now() < deadline) { const r = await send("Runtime.evaluate", { expression: "JSON.stringify(window.RESULT||null)", returnByValue: true }); const v = r.result && r.result.result && r.result.result.value; if (v && v !== "null") { res = JSON.parse(v); break; } await sleep(1000); }
  console.log(JSON.stringify(res || { error: "Zeitueberschreitung" }));
} finally { try { ws && ws.close(); } catch {} p.kill("SIGKILL"); fs.rmSync(prof, { recursive: true, force: true }); }

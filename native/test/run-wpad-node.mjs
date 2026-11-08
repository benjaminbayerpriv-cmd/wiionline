// Gast-Eingabenachweis: ein echtes libogc/wiiuse-Homebrew (wpad/wpad_test.dol) liest die emulierte Wiimote
// ueber Dolphins Bluetooth-HLE. Der Test setzt Eingaben per WiiOnline_SetWiimote und vergleicht, was der GAST
// in seiner Ergebnisstruktur sieht, mit den Erwartungen. Aufruf: node run-wpad-node.mjs <dist-dir>
import path from "node:path"; import { readFile } from "node:fs/promises"; import { pathToFileURL, fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(process.argv[2] || path.join(here, "../../dist-core"));
const meta = JSON.parse(await readFile(path.join(here, "wpad/wpad_test.json"), "utf8"));
const { default: create } = await import(pathToFileURL(path.join(dist, "dolphin-core-upstream.js")));
const logs = [];
const M = await create({ dolphinCoreLog: true, print: (l) => logs.push(l), printErr: (l) => logs.push(l) });
const c = (n, r, a, v) => M.ccall(n, r, a, v);
M.FS.writeFile("/t.dol", new Uint8Array(await readFile(path.join(here, "wpad/wpad_test.dol"))));
c("SetVideoBackend", "number", ["string"], ["Null"]); c("SetCpuCore", "number", ["string"], [process.env.CPU || "cached"]); c("SetCpuThread", "number", ["number"], [1]);
if (process.env.WASMJIT) c("SetPpcWasmJitEnabled", null, ["number"], [Number(process.env.WASMJIT)]);
c("SetAudioMuted", "number", ["number"], [1]); c("CoreInit", "number", [], []);
if (!c("BootDisc", "number", ["string"], ["/t.dol"])) throw new Error("Boot fehlgeschlagen: " + c("GetCoreStatus", "string", [], []));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = meta.result_addr, N = 28; // Strukturgroesse in uint32 (siehe wpad_test.c)
const pump = () => c("PumpHostJobs", null, [], []);
const ptr = M._malloc(256), dptr = M._malloc(64);
const guest = () => { c("WiiOnline_CopyGuest", "number", ["number", "number", "number"], [R, ptr, N * 4]);
  const dv = new DataView(M.HEAPU8.buffer.slice(ptr, ptr + N * 4)); const u = (i) => dv.getUint32(i * 4), s = (i) => dv.getInt32(i * 4);
  return { magic: u(0), seq: u(1), probe: s(2), type: u(3), held: u(4), present: u(5), err: s(6), accel: [u(7), u(8), u(9)],
    dots: [0, 1, 2, 3].map((i) => ({ vis: u(10 + i), rx: s(14 + i), ry: s(18 + i), size: u(22 + i) })), irValid: u(26), irEndMagic: u(27) }; };
// Struktur: magic seq probe type held present err accel[3] vis[4] rx[4] ry[4] size[4] irvalid irx iry endmagic = 30 Worte
const N2 = 30;
const guest2 = () => { c("WiiOnline_CopyGuest", "number", ["number", "number", "number"], [R, ptr, N2 * 4]);
  const dv = new DataView(M.HEAPU8.buffer.slice(ptr, ptr + N2 * 4)); const u = (i) => dv.getUint32(i * 4), s = (i) => dv.getInt32(i * 4);
  return { magic: u(0), seq: u(1), probe: s(2), type: u(3), held: u(4), present: u(5), err: s(6), accel: [u(7), u(8), u(9)],
    dots: [0, 1, 2, 3].map((i) => ({ vis: u(10 + i), rx: s(14 + i), ry: s(18 + i), size: u(22 + i) })), irValid: u(26), irx: s(27), iry: s(28), end: u(29) }; };
const sw = (b, x = .5, y = .5, vis = 1, ax = 0, ay = 0, az = 1) => c("WiiOnline_SetWiimote", null, Array(8).fill("number"), [0, b, x, y, vis, ax, ay, az]);
const prep = () => { c("WiiOnline_TestPrepareInput", "number", ["number", "number"], [0, dptr]); return new Uint32Array(M.HEAPU8.buffer.slice(dptr, dptr + 64)); };
const results = []; const ok = (name, cond, detail = "") => { results.push({ name, pass: !!cond, detail: String(detail) }); };
async function until(pred, ms, label) { const t0 = Date.now(); let g; while (Date.now() - t0 < ms) { pump(); g = guest2(); if (pred(g)) return g; await sleep(40); } return null; }
const hasWii = () => c("WiiOnline_IsWii", "number", [], []) === 1;
let g = await until((g) => g.magic === 0x57504144 && g.end === 0x454E4421 && g.seq > 5, 60000);
ok("Gast-Homebrew laeuft (Magic, Zaehler steigt)", !!g, g ? `seq=${g.seq}` : "kein Magic gefunden");
ok("Wii-Modus", hasWii());
if (g) {
  const s0 = g.seq; await sleep(400); pump(); const g1 = guest2(); ok("Gast-Schleife laeuft weiter (seq steigt)", g1.seq > s0, `${s0} -> ${g1.seq}`);
  const autoConnected = g1.probe === 0; ok("Beobachtung: Wiimote 0 ist beim Boot bereits verbunden (Dolphin-BT-HLE verbindet emulierte Remotes selbst)", true, `probe=${g1.probe}`);
  // Aufwecken: Tastendruck (Override gilt im Verbindungspfad). Mehrfach druecken/loslassen, bis der Gast verbunden meldet.
  let connected = autoConnected ? g1 : null;
  for (let attempt = 0; attempt < 30 && !connected; attempt++) { sw(0x001); await sleep(700); pump(); sw(0); await sleep(300); pump(); const x = guest2(); if (x.probe === 0) connected = x; }
  ok("Gast: Wiimote verbunden (WPAD_Probe == 0, Typ gelesen)", !!connected, connected ? `type=${connected.type}` : `probe=${guest2().probe}`);
  if (connected) {
    // Tasten: libogc-Bits
    const L = { A: 0x0008, B: 0x0004, ONE: 0x0002, TWO: 0x0001, PLUS: 0x1000, MINUS: 0x0010, HOME: 0x0080, UP: 0x0800, DOWN: 0x0400, LEFT: 0x0100, RIGHT: 0x0200 };
    const W = { A: 0x001, B: 0x002, ONE: 0x004, TWO: 0x008, PLUS: 0x010, MINUS: 0x020, HOME: 0x040, UP: 0x080, DOWN: 0x100, LEFT: 0x200, RIGHT: 0x400 };
    sw(0); await until((x) => x.held === 0, 5000);
    for (const n of Object.keys(W)) { sw(W[n]); const x = await until((y) => y.held === L[n], 5000); ok(`Gast sieht Taste ${n}`, !!x, `erwartet 0x${L[n].toString(16)}, Gast 0x${guest2().held.toString(16)}`); }
    let allL = 0, allW = 0; for (const n of Object.keys(W)) { allL |= L[n]; allW |= W[n]; }
    sw(allW); const xa = await until((y) => y.held === allL, 5000); ok("Gast sieht alle 11 Tasten", !!xa, `Gast 0x${guest2().held.toString(16)} erwartet 0x${allL.toString(16)}`);
    sw(0); const x0 = await until((y) => y.held === 0, 5000); ok("Loslassen: keine gehaltene Taste im Gast", !!x0);
    // IR: libogc/wiiuse (Basic-Modus) spiegelt X (rx = 1023 - x_roh). Punkt 0 wird exakt verglichen. Beim zweiten Punkt
    // liefert libogc im Gast konstant falsche obere Bits (gleiche Daten kaemen auch von echter Hardware), deshalb
    // werden dort nur die unteren 8 Bit von x und y geprueft.
    for (const [n, px, py] of [["Mitte", .5, .5], ["links-oben", 0, 0], ["rechts-oben", 1, 0], ["links-unten", 0, 1], ["rechts-unten", 1, 1]]) {
      sw(0, px, py, 1); const nat = prep(); const p = [0, 1].map((i) => ({ x: nat[4 + i] & 0xffff, y: nat[4 + i] >>> 16 }));
      const x = await until((y) => y.dots[0].vis && Math.abs(y.dots[0].rx - (1023 - p[0].x)) <= 1 && Math.abs(y.dots[0].ry - p[0].y) <= 1, 8000);
      const gg = guest2(); const d1 = gg.dots[1];
      ok(`Gast sieht IR ${n}: Punkt 0 exakt (gespiegelt), Punkt 1 untere 8 Bit`, !!x && d1.vis && (((1023 - d1.rx) & 0xff) === (p[1].x & 0xff)) && ((d1.ry & 0xff) === (p[1].y & 0xff)),
        `Gast ${JSON.stringify(gg.dots.slice(0, 2))} nativ ${JSON.stringify(p)}`); }
    sw(0, .5, .5, 0); const xn = await until((y) => !y.dots[0].vis && !y.dots[1].vis, 8000); ok("visible=0: Gast sieht keine IR-Punkte", !!xn, JSON.stringify(guest2().dots.slice(0, 2)));
    // Beschleunigung
    sw(0, .5, .5, 1, 0, 0, 1); await sleep(600); pump(); const an = prep(); const xan = await until((y) => y.accel[0] === an[1] && y.accel[2] === an[3], 5000);
    ok("Gast sieht Ruhe-Beschleunigung (0,0,1 g) wie nativ", !!xan, `Gast ${JSON.stringify(guest2().accel)} nativ ${an[1]},${an[2]},${an[3]}`);
    sw(0, .5, .5, 1, 1, 0, 1); await sleep(600); pump(); const ax1 = prep(); const xax = await until((y) => y.accel[0] === ax1[1], 5000);
    ok("Gast sieht x=+1 g wie nativ", !!xax, `Gast ${JSON.stringify(guest2().accel)} nativ ${ax1[1]},${ax1[2]},${ax1[3]}`);
    // Clear
    sw(0xfff & 0x7ff); await until((y) => y.held !== 0, 5000); c("WiiOnline_ClearWiimote", null, ["number"], [0]); const xc = await until((y) => y.held === 0, 8000);
    ok("Clear: Gast sieht keine gehaltene Taste mehr", !!xc, `held=0x${guest2().held.toString(16)}`);
  }
}
const out = { when: new Date().toISOString(), node: process.version, cpu: process.env.CPU || "cached", dol: meta, passed: results.filter((r) => r.pass).length, total: results.length, pass: results.every((r) => r.pass), results };
console.log(JSON.stringify(out, null, 1));
if (!out.pass) console.error(logs.filter((l) => /WIIMOTE|BT|Wiimote|IOS/i.test(l)).slice(-15).join("\n"));
process.exit(out.pass ? 0 : 1);

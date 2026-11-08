// Prueft den Wiimote-Override ueber den echten Wiimote::PrepareInput -> BuildDesiredWiimoteState-Pfad der
// emulierten Remote (Wii-Boot des hello_wii.dol). Die Gast-BT-Verbindung ist NICHT Teil dieses Tests.
// Aufruf: node run-wiimote-node.mjs <dist-dir>   (Exit 0 = alle Pruefungen bestanden)
import path from "node:path"; import { readFile } from "node:fs/promises"; import { pathToFileURL, fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(process.argv[2] || path.join(here, "../../dist-core"));
const { default: create } = await import(pathToFileURL(path.join(dist, "dolphin-core-upstream.js")));
const M = await create({ print: () => {}, printErr: () => {} });
const c = (n, r, a, v) => M.ccall(n, r, a, v);
M.FS.writeFile("/t.dol", new Uint8Array(await readFile(path.join(here, "hello_wii.dol"))));
c("SetVideoBackend", "number", ["string"], ["Null"]); c("SetCpuCore", "number", ["string"], ["cached"]); c("SetCpuThread", "number", ["number"], [1]);
c("SetAudioMuted", "number", ["number"], [1]); c("CoreInit", "number", [], []);
if (!c("BootDisc", "number", ["string"], ["/t.dol"])) throw new Error("Boot fehlgeschlagen");
const ptr = M._malloc(64);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sw = (slot, b, x = 0.5, y = 0.5, vis = 1, ax = 0, ay = 0, az = 1) => c("WiiOnline_SetWiimote", null, Array(8).fill("number"), [slot, b, x, y, vis, ax, ay, az]);
const dbg = (slot = 0) => { const n = c("WiiOnline_GetWiimoteDebug", "number", ["number", "number"], [slot, ptr]); return n === 16 ? new Uint32Array(M.HEAPU8.buffer.slice(ptr, ptr + 64)) : null; };
// Ein Aufruf des echten Pfads: Setzen, PrepareInput ausloesen, Ergebnis lesen
const run = (...args) => { sw(0, ...args); const r = c("WiiOnline_TestPrepareInput", "number", ["number", "number"], [0, ptr]); return r ? new Uint32Array(M.HEAPU8.buffer.slice(ptr, ptr + 64)) : null; };
// auf Wiimote-Initialisierung warten
let t = null; for (let i = 0; i < 100 && !(t = run(0)); i++) await sleep(100);
const results = []; const ok = (name, cond, detail = "") => results.push({ name, pass: !!cond, detail: String(detail) });
ok("emulierte Wiimote 0 vorhanden, PrepareInput liefert Ergebnis", !!t);
const before = dbg(); ok("Debug: Override aktiv, build_count zaehlt BuildDesiredWiimoteState", before[0] === 1 && before[2] >= 1, `active=${before[0]} builds=${before[2]}`);
const names = [["A", 0x001, 0x0800], ["B", 0x002, 0x0400], ["ONE", 0x004, 0x0200], ["TWO", 0x008, 0x0100], ["PLUS", 0x010, 0x0010], ["MINUS", 0x020, 0x1000], ["HOME", 0x040, 0x8000], ["UP", 0x080, 0x0008], ["DOWN", 0x100, 0x0004], ["LEFT", 0x200, 0x0001], ["RIGHT", 0x400, 0x0002]];
let all = 0;
for (const [n, bit, hex] of names) { const d = run(bit); all |= hex; ok(`Taste ${n}: BuildDesired-hex und Verbindungs-Pfad`, d[0] === hex && d[12] === hex, `build=0x${d[0].toString(16)} pressed=0x${d[12].toString(16)} erwartet 0x${hex.toString(16)}`); }
let d = run(0x7ff); ok("alle 11 Tasten", d[0] === all && d[12] === all, `0x${d[0].toString(16)}`);
d = run(0xfffff800); ok("unbekannte Bits ignoriert", d[0] === 0, `0x${d[0].toString(16)}`);
const pt = (u, i) => ({ x: u[4 + i] & 0xffff, y: u[4 + i] >>> 16, s: u[8 + i] });
const vis = (u) => [0, 1, 2, 3].map((i) => pt(u, i)).filter((p) => p.x !== 0xffff);
const cx = (v) => (v[0].x + v[1].x) / 2, cy = (v) => (v[0].y + v[1].y) / 2;
const geo = {};
for (const [n, x, y] of [["Mitte", .5, .5], ["links-oben", 0, 0], ["rechts-oben", 1, 0], ["links-unten", 0, 1], ["rechts-unten", 1, 1]]) {
  d = run(0, x, y, 1); const v = vis(d); geo[n] = v;
  ok(`IR ${n}: zwei Punkte im 1024x768-Bild`, v.length === 2 && v.every((p) => p.x < 1024 && p.y < 768), JSON.stringify(v)); }
const G = geo;
ok("IR Mitte: Schwerpunkt nahe Kameramitte (512,384)", G.Mitte.length === 2 && Math.abs(cx(G.Mitte) - 512) < 40 && Math.abs(cy(G.Mitte) - 384) < 100, `(${cx(G.Mitte)},${cy(G.Mitte)})`);
ok("IR: Zeiger rechts -> Punkte links (Spiegelung)", cx(G["rechts-oben"]) < cx(G.Mitte) && cx(G["links-oben"]) > cx(G.Mitte), `rechts=${cx(G["rechts-oben"])} mitte=${cx(G.Mitte)} links=${cx(G["links-oben"])}`);
// Vertikale Richtung folgt Dolphins eigenem Cursor-Modell (Cursor oben = +y, Kamerabild y nach unten, EmulatePoint-Winkel); gegen einen Gast noch nicht verifiziert.
ok("IR: Zeiger oben -> kleineres Kamera-y (Dolphin-Konvention), unten -> groesseres", cy(G["links-oben"]) < cy(G.Mitte) && cy(G["links-unten"]) > cy(G.Mitte), `oben=${cy(G["links-oben"])} mitte=${cy(G.Mitte)} unten=${cy(G["links-unten"])}`);
ok("IR: Punktabstand ca. konstant", Math.abs((G.Mitte[1].x - G.Mitte[0].x) - (G["rechts-unten"][1].x - G["rechts-unten"][0].x)) < 60);
d = run(0, .5, .5, 0); ok("visible=0 -> keine IR-Punkte", vis(d).length === 0);
d = run(0, NaN, .5, 1); ok("NaN-Zeiger -> unsichtbar", vis(d).length === 0);
d = run(0, 7, -3, 1); const vv = vis(d); ok("Zeiger ausserhalb 0..1 wird auf den Rand geklemmt", vv.length === 2 && Math.abs(cx(vv) - cx(G["rechts-oben"])) < 3 && Math.abs(cy(vv) - cy(G["rechts-oben"])) < 3, JSON.stringify(vv));
d = run(0, .5, .5, 1); const neutral = [d[1], d[2], d[3]]; ok("Beschleunigung neutral (0,0,1): x=y=Nullpunkt, z=1 g darueber", neutral[0] === neutral[1] && neutral[2] > neutral[0], `acc=${neutral}`);
d = run(0, .5, .5, 1, 1, 0, 1); ok("x=+1 g erhoeht Rohwert x, y/z unveraendert", d[1] > neutral[0] && d[2] === neutral[1] && d[3] === neutral[2], `acc=${d[1]},${d[2]},${d[3]}`);
d = run(0, .5, .5, 1, NaN, NaN, NaN); ok("NaN-Beschleunigung -> neutral", d[1] === neutral[0] && d[2] === neutral[1] && d[3] === neutral[2]);
d = run(0, .5, .5, 1, 100, -100, 100); ok("Beschleunigung wird begrenzt (10-Bit-Bereich)", d[1] <= 1023 && d[2] <= 1023 && d[3] <= 1023, `acc=${d[1]},${d[2]},${d[3]}`);
const g0 = dbg()[1]; sw(9, 1); sw(-1, 1);
ok("ungueltiger Slot ohne Wirkung, Debug/Test liefern 0", dbg()[1] === g0 && dbg(9) === null && dbg(-1) === null && c("WiiOnline_TestPrepareInput", "number", ["number", "number"], [9, ptr]) === 0);
run(0x7ff); c("WiiOnline_ClearWiimote", null, ["number"], [0]);
d = dbg(); const e = (() => { const r = c("WiiOnline_TestPrepareInput", "number", ["number", "number"], [0, ptr]); return new Uint32Array(M.HEAPU8.buffer.slice(ptr, ptr + 64)); })();
ok("Clear: Override inaktiv, Zaehler zurueck", d[0] === 0 && d[15] === 0 && d[3] === 0 && d[2] === 0, `active=${d[0]} mask=${d[15]} builds=${d[2]}`);
ok("Clear: keine gehaltene Taste im echten Pfad (Dolphin-Konfiguration gilt wieder)", e[0] === 0 && e[12] === 0, `hex=0x${e[0].toString(16)} pressed=0x${e[12].toString(16)}`);
const out = { when: new Date().toISOString(), node: process.version, passed: results.filter((r) => r.pass).length, total: results.length, pass: results.every((r) => r.pass), results };
console.log(JSON.stringify(out, null, 1));
process.exit(out.pass ? 0 : 1);

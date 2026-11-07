// Prueft den Adapter headless: node run-adapter-node.mjs <dist-dir>
import { cp, readFile } from "node:fs/promises"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url"; import os from "node:os"; import fs from "node:fs";
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(process.argv[2] || path.join(here, "../../dist-core"));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "adapter-")); // Adapter + Kernartefakte nebeneinander
for (const f of ["dolphin-core-upstream.js", "dolphin-core-upstream.wasm"]) await cp(path.join(dist, f), path.join(tmp, f));
await cp(path.join(here, "../adapter/adapter.js"), path.join(tmp, "adapter.js"));
const { createCore } = await import(pathToFileURL(path.join(tmp, "adapter.js")));
const ev = []; const core = await createCore((e) => { if (e.type !== "log") ev.push(e); });
const exp = JSON.parse(await readFile(path.join(here, "expected.json"), "utf8"));
await core.load(new File([await readFile(path.join(here, "hello_wii.dol"))], "hello_wii.dol"));
await core.start();
for (let i = 0; i < 100 && core.debug.readU32(exp.result_addr + 16) !== exp.done; i++) await new Promise((r) => setTimeout(r, 100));
await new Promise((r) => setTimeout(r, 700));
const ok = core.debug.readU32(exp.result_addr + 8) === exp.sum && core.debug.readU32(exp.result_addr + 12) === exp.lcg && core.debug.isWii() === 1;
console.log(JSON.stringify({ ok, pc: core.debug.pc().toString(16), states: ev.filter((e) => e.type === "status").map((e) => e.state), lastMetrics: ev.filter((e) => e.type === "metrics").at(-1) }));
await core.stop(); process.exit(ok ? 0 : 1);

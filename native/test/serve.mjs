// Statischer Server mit COOP/COEP (SharedArrayBuffer/Pthreads). Aufruf: node serve.mjs [port] [dist-dir]
import http from "node:http"; import { readFile, stat } from "node:fs/promises"; import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(process.argv[3] || path.join(here, "../../dist-core"));
const roots = [here, dist];
const types = { ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".html": "text/html", ".json": "application/json", ".dol": "application/octet-stream" };
const port = Number(process.argv[2] || 8123);
http.createServer(async (req, res) => {
  const name = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
  for (const r of roots) {
    const f = path.join(r, name);
    if (!f.startsWith(r)) continue;
    try {
      if (!(await stat(f)).isFile()) continue;
      res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream",
        "cross-origin-opener-policy": "same-origin", "cross-origin-embedder-policy": "require-corp", "cache-control": "no-store" });
      return res.end(await readFile(f));
    } catch {}
  }
  res.writeHead(404); res.end("not found");
}).listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}/`));

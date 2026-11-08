// Server fuer Browser-Messlaeufe: COOP/COEP, dist-Ordner, dieses Verzeichnis, /disc.rvz = Datei aus argv[3]. 127.0.0.1 only.
import http from "node:http"; import { readFile, stat } from "node:fs/promises"; import path from "node:path"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)); const port = Number(process.argv[2] || 8124); const dist = path.resolve(process.argv[3]); const disc = process.argv[4] && path.resolve(process.argv[4]);
const types = { ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".html": "text/html" };
http.createServer(async (req, res) => {
  const name = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "perf.html";
  const hdr = { "cross-origin-opener-policy": "same-origin", "cross-origin-embedder-policy": "require-corp", "cache-control": "no-store", "access-control-allow-origin": "*", "cross-origin-resource-policy": "cross-origin" };
  try {
    if (name === "state.bin") {
      const f = "/tmp/perf/state.bin";
      if (req.method === "PUT") { const chunks = []; for await (const c of req) chunks.push(c); await (await import("node:fs/promises")).writeFile(f, Buffer.concat(chunks)); res.writeHead(200, hdr); return res.end("ok"); }
      res.writeHead(200, { ...hdr, "content-type": "application/octet-stream", "content-length": (await stat(f)).size }); return res.end(await readFile(f));
    }
    if (name === "disc.rvz" && disc) { res.writeHead(200, { ...hdr, "content-type": "application/octet-stream", "content-length": (await stat(disc)).size }); return res.end(await readFile(disc)); }
    for (const r of [here, dist]) { const f = path.join(r, name); if (!f.startsWith(r)) continue; try { if ((await stat(f)).isFile()) { res.writeHead(200, { ...hdr, "content-type": types[path.extname(f)] || "application/octet-stream" }); return res.end(await readFile(f)); } } catch {} }
  } catch {}
  res.writeHead(404, hdr); res.end("nicht gefunden");
}).listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}/`));

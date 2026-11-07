// Runs graphics/experiments/api-probe in Chromium and writes JSON evidence.
// usage: node scripts/av-probe.mjs [outfile] [-- extra chromium flags]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// playwright is resolved from node_modules or NODE_PATH (CommonJS resolution)
const { chromium } = require('playwright');
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const sep = args.indexOf('--');
const extra = sep >= 0 ? args.slice(sep + 1) : [];
const outFile = resolve(root, (sep >= 0 ? args.slice(0, sep) : args)[0] ?? 'graphics/results/api-probe.json');
const dir = resolve(root, 'graphics/experiments/api-probe');
const files = { '/': ['index.html', 'text/html'], '/probe.js': ['probe.js', 'text/javascript'] };
const server = createServer((req, res) => {
  const f = files[req.url.split('?')[0]];
  if (!f) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': f[1], 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' });
  res.end(readFileSync(resolve(dir, f[0])));
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const browser = await chromium.launch({ args: extra });
const page = await browser.newPage();
page.on('console', m => console.log('[page]', m.text()));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => window.__result, null, { timeout: 30000 });
const result = await page.evaluate(() => window.__result);
result.browserVersion = browser.version();
result.chromiumFlags = extra;
result.host = { cpus: os.cpus()[0]?.model, cores: os.cpus().length, memGB: Math.round(os.totalmem() / 2 ** 30), platform: `${os.platform()} ${os.release()}` };
await browser.close(); server.close();
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
const ok = result.webgl2?.available && result.webgl2.checks?.plain?.pass;
process.exit(ok ? 0 : 1);

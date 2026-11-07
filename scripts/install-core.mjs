import { readdir, readFile, copyFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2] && resolve(process.argv[2]);
if (!source) throw new Error('Aufruf: npm run core:install -- /pfad/zu/dist-core');
const files = (await readdir(source)).filter(name => /^dolphin-core-upstream[\w.-]*\.(js|wasm|data)$/.test(name));
for (const required of ['dolphin-core-upstream.js', 'dolphin-core-upstream.wasm']) {
  if (!files.includes(required)) throw new Error(`Im Ausgabeordner fehlt ${required}.`);
}
const wasm = await readFile(join(source, 'dolphin-core-upstream.wasm'));
if (!wasm.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109]))) throw new Error('Die WASM-Datei hat keinen gültigen WebAssembly-Header.');
const target = join(root, 'public/core');
await mkdir(target, { recursive: true });
for (const name of files) { await copyFile(join(source, name), join(target, name)); console.log(`Kopiert: ${name}`); }
console.log('Native Artefakte eingebunden. npm run build erzeugt die Browser-Ausgabe mit Adapter.');

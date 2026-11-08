import {cp,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
await mkdir(resolve(root,'dist/diagnostics'),{recursive:true});
await cp(resolve(root,'graphics/tests/wpad'),resolve(root,'dist/diagnostics/wpad'),{recursive:true});
console.log('Open /diagnostics/wpad/index.html on the production preview server.');

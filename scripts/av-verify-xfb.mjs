// Execute the original VI/XFB DOL in the actual compiled WASM core under Node.
// This is an integration check, not a fixture. Browser playback is a separate gate.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createFrameBridge } from '../graphics/bridge/frame-bridge.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nativeDir = resolve(process.argv[2] || 'public/core');
const output = resolve(process.argv[3] || 'work/xfb-check');
await mkdir(output, { recursive: true });
let M;
const report = { verdict: false, environment: 'Node actual WASM; not browser evidence', nativeDir, errors: [] };
const t0 = performance.now();
try {
  const expected = JSON.parse(await readFile(join(root, 'graphics/homebrew/expected.json'), 'utf8'));
  const dol = new Uint8Array(await readFile(join(root, 'graphics/homebrew/xfb-bars.dol')));
  const { default: create } = await import(pathToFileURL(join(nativeDir, 'dolphin-core-upstream.js')));
  M = await create({ print: text => console.log(text), printErr: text => console.error(text) });
  const c = (name, result = 'number', types = [], values = []) => M.ccall(name, result, types, values);
  report.build = c('WiiOnline_BuildInfo', 'string');
  for (const [name, types, values] of [ ['SetVideoBackend', ['string'], ['Software']], ['SetCpuCore', ['string'], ['interpreter']], ['SetCpuThread', ['number'], [1]], ['SetPresentationScale', ['number'], [1]], ['CoreInit', [], []] ]) {
    if (c(name, 'number', types, values) !== 1) throw new Error(`${name} failed`);
  }
  c('SetAudioMuted', 'number', ['number'], [1]);
  M.FS.writeFile('/xfb-bars.dol', dol);
  const bridge = createFrameBridge(M);
  bridge.stats.lastFrame = c('GetFrame') >>> 0;
  if (c('BootDisc', 'number', ['string'], ['/xfb-bars.dol']) !== 1) throw new Error(`BootDisc failed: ${c('GetCoreStatus', 'string')}`);
  const deadline = performance.now() + 30000;
  let captured = null;
  while (performance.now() < deadline) {
    c('PumpHostJobs', null);
    report.guestMarker = c('WiiOnline_ReadGuestU32', 'number', ['number'], [expected.result_address]) >>> 0;
    const frame = c('GetFrame') >>> 0;
    if (frame > 0 && report.guestMarker === expected.guest_marker) {
      captured = bridge.read();
      if (captured) break;
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  report.pc = (c('GetPPCPC') >>> 0).toString(16);
  report.isWii = c('WiiOnline_IsWii');
  report.coreState = c('GetCoreStateName', 'string');
  report.videoStats = c('GetVideoStats', 'string');
  report.frameCounter = c('GetFrame') >>> 0;
  report.bridge = bridge.stats;
  if (!captured) throw new Error('No guest-produced XFB frame within 30 seconds');
  const bytes = new Uint8Array(captured.rgba);
  const samples = [];
  for (let i = 0; i < 8; i++) {
    const x = Math.floor((i + .5) * captured.width / 8);
    const y = Math.floor(captured.height / 2);
    const offset = (y * captured.width + x) * 4;
    const rgba = [...bytes.slice(offset, offset + 4)];
    const target = expected.expected_rgb_gray_approx[i];
    const pass = rgba.slice(0, 3).every(v => Math.abs(v - target) <= expected.rgb_tolerance) && rgba[3] === expected.alpha;
    samples.push({ bar: i, target, rgba, pass });
  }
  report.width = captured.width; report.height = captured.height; report.samples = samples;
  report.verdict = report.isWii === 1 && report.guestMarker === expected.guest_marker &&
    report.pc === expected.end_loop_pc.toString(16) && captured.width === expected.width && captured.height === expected.height && samples.every(s => s.pass);
  // Preserve actual captured RGBA, and a portable image made from those exact bytes.
  await writeFile(join(output, 'frame.rgba'), bytes);
  const rgb = Buffer.alloc(captured.width * captured.height * 3);
  for (let i = 0; i < captured.width * captured.height; i++) for (let channel = 0; channel < 3; channel++) rgb[i * 3 + channel] = bytes[i * 4 + channel];
  await writeFile(join(output, 'frame.ppm'), Buffer.concat([Buffer.from(`P6\n${captured.width} ${captured.height}\n255\n`), rgb]));
} catch (error) {
  report.errors.push(String(error?.stack || error));
} finally {
  report.elapsedMs = Math.round(performance.now() - t0);
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  // pthreads keep Node alive; report is flushed before exit, as in the core harness.
  process.exit(report.verdict ? 0 : 1);
}

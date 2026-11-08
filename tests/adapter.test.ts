import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DolphinAdapter, type DolphinModule } from '../src/dolphin-adapter';
import type { CoreEvent } from '../src/protocol';
function fixture() {
  const calls: string[] = [];
  const events: CoreEvent[] = [];
  const files = new Map<string, Uint8Array>();
  const exports = ['WiiOnline_AbiVersion', 'CoreInit', 'SetVideoBackend', 'SetCpuCore', 'SetCpuThread', 'BootDisc', 'StopCore', 'SetCorePaused', 'PumpHostJobs', 'GetCoreStatus', 'GetCoreStateName'];
  const module: DolphinModule = {
    ...Object.fromEntries(exports.map(name => [`_${name}`, () => {}])),
    FS: { writeFile: (path, data) => { files.set(path, data); }, unlink: path => { files.delete(path); } },
    ccall: (name) => { calls.push(name); if (name === 'GetCoreStateName') return 'Running'; if (name === 'GetCoreStatus') return 'fixture'; return 1; },
  };
  return { calls, events, files, module, create: () => new DolphinAdapter(module, event => events.push(event)) };
}
const homebrew = { name: 'hello.dol', size: 4, arrayBuffer: async () => new Uint8Array([1,2,3,4]).buffer } as File;
test('adapter enforces native ABI before booting', () => {
  const f = fixture(); delete f.module._BootDisc;
  assert.throws(f.create, /BootDisc/);
});
test('load prepares data, start submits real boot, stop unloads', async () => {
  const f = fixture(); const adapter = f.create();
  await adapter.load(homebrew);
  assert.equal(f.calls.includes('BootDisc'), false);
  assert.equal(f.files.size, 1);
  await adapter.start();
  await adapter.pause();
  await adapter.start();
  await adapter.stop();
  assert.equal(f.files.size, 0);
  assert.equal(f.calls.filter(name => name === 'BootDisc').length, 1);
  assert.equal(f.calls.filter(name => name === 'SetCorePaused').length, 2);
  assert.ok(f.calls.includes('StopCore'));
  assert.ok(!f.events.some(event => ['frame', 'metrics', 'audio'].includes(event.type)));
  assert.equal(adapter.info.capabilities.wiiInput, false);
});
test('native boot rejection propagates as an error', async () => {
  const f = fixture(); const adapter = f.create();
  f.module.ccall = name => name === 'BootDisc' ? 0 : 1;
  await adapter.load(homebrew);
  await assert.rejects(adapter.start(), /BootDisc/);
  await adapter.stop();
});
test('large files are rejected before allocating a buffer', async () => {
  const f = fixture(); const adapter = f.create();
  let read = false;
  await assert.rejects(adapter.load({ ...homebrew, size: 65 * 1024 * 1024, arrayBuffer: async () => { read = true; return new ArrayBuffer(0); } } as File), /64 MiB/);
  assert.equal(read, false);
  assert.equal(f.files.size, 0);
});

test('metadata is suppressed and only newly published native frames are forwarded', async () => {
  const f = fixture();
  const heap = new Uint8Array(new SharedArrayBuffer(4096));
  let frame = 0;
  Object.assign(f.module, { HEAPU8: heap, _FrameWidth: () => 1, _FrameHeight: () => 1, _FrameBuffer: () => 64, _GetFrame: () => frame });
  const baseCall = f.module.ccall;
  f.module.ccall = (name, result, types, values) => name === 'GetFrame' ? frame : baseCall(name, result, types, values);
  const adapter = f.create();
  await adapter.load(homebrew);
  await adapter.start();
  assert.equal(f.events.filter(event => event.type === 'frame').length, 0, 'initial metadata must not be shown');
  heap.set([12, 34, 56, 255], 64); frame = 1;
  await new Promise(resolve => setTimeout(resolve, 45));
  await adapter.stop();
  const frames = f.events.filter(event => event.type === 'frame');
  assert.equal(frames.length, 1);
  assert.deepEqual([...new Uint8Array(frames[0].rgba)], [12, 34, 56, 255]);
  assert.ok(!f.calls.includes('RunFrame'), 'adapter must never manufacture native frames');
});

test('Wiimote adapter neutralizes on pause and clears its override on stop', async () => {
  const f = fixture();
  f.module._WiiOnline_SetWiimote = () => {};
  f.module._WiiOnline_ClearWiimote = () => {};
  const inputs: unknown[][] = [];
  const base = f.module.ccall;
  f.module.ccall = (name, result, types, values) => {
    if (name === 'WiiOnline_SetWiimote') inputs.push(values);
    return base(name, result, types, values);
  };
  const adapter = f.create();
  assert.equal(adapter.info.capabilities.wiiInput, true);
  await adapter.load(homebrew); await adapter.start();
  adapter.input({buttons:['A','HOME','RIGHT'],pointer:{x: .25,y: .75,visible:true}});
  assert.deepEqual(inputs.at(-1), [0, 0x441, .25, .75, 1, 0, 0, 1]);
  await adapter.pause();
  assert.deepEqual(inputs.at(-1), [0, 0, .5, .5, 0, 0, 0, 1]);
  await adapter.stop();
  assert.ok(f.calls.includes('WiiOnline_ClearWiimote'));
  assert.ok(!f.calls.includes('SetInputState'));
});

test('Wiimote debug reads the 16-word snapshot through HEAPU8', () => {
  const f = fixture();
  const heap = new Uint8Array(new SharedArrayBuffer(4096));
  Object.assign(f.module, {
    HEAPU8: heap,
    _WiiOnline_SetWiimote: () => {},
    _WiiOnline_ClearWiimote: () => {},
    _WiiOnline_GetWiimoteDebug: () => {},
    _malloc: () => 256,
    _free: () => {},
  });
  const base = f.module.ccall;
  f.module.ccall = (name, result, types, values) => {
    if (name === 'WiiOnline_GetWiimoteDebug') {
      const words = new Uint32Array(heap.buffer, Number(values?.[1]), 16);
      words.set([1, 7, 9, 0x0800, ...Array(11).fill(0), 0x0800]);
      return 16;
    }
    return base(name, result, types, values);
  };
  const adapter = new DolphinAdapter(f.module, event => f.events.push(event), 'ogl');
  adapter.input({ buttons: ['A'], pointer: { x: .5, y: .5, visible: false } });
  assert.ok(f.events.some(event => event.type === 'log' && event.message.includes('n=16 active=1 gen=7 build=9 hex=0x800 mask=0x800')));
});

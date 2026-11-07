import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Runtime } from '../src/runtime';
import { validateFile } from '../src/validation';
import type { CoreEvent, EmulatorCore } from '../src/protocol';
const info = { name: 'Test fixture only', revision: 'test', formats: ['dol', 'elf'] };
const file = { name: 'homebrew.dol', size: 100 } as File;
function fixture() {
  const calls: string[] = [];
  const events: CoreEvent[] = [];
  const core: EmulatorCore = { info, load: async () => { calls.push('load'); }, start: async () => { calls.push('start'); }, pause: async () => { calls.push('pause'); }, stop: async () => { calls.push('stop'); }, input: () => { calls.push('input'); } };
  const runtime = new Runtime(async () => async () => core, event => events.push(event));
  return { runtime, calls, events, core };
}
test('missing core fails explicitly and retry can succeed', async () => {
  let attempts = 0;
  const events: CoreEvent[] = [];
  const { core } = fixture();
  const runtime = new Runtime(async () => { if (++attempts === 1) throw new Error('missing adapter'); return async () => core; }, event => events.push(event));
  await runtime.dispatch({ type: 'init' });
  assert.equal(events.at(-1)?.type, 'error');
  assert.ok(!events.some(e => e.type === 'status' && e.state === 'running'));
  await runtime.dispatch({ type: 'init' });
  assert.equal(events.at(-1)?.type, 'status');
  assert.equal(events.at(-1)?.type === 'status' && (events.at(-1) as {state: string}).state, 'idle');
});
test('commands serialize load before start and stop unloads', async () => {
  const { runtime, calls, events, core } = fixture();
  let release!: () => void;
  core.load = async () => { calls.push('load'); await new Promise<void>(resolve => { release = resolve; }); };
  await runtime.dispatch({ type: 'init' });
  const loading = runtime.dispatch({ type: 'load', file });
  const starting = runtime.dispatch({ type: 'start' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(calls, ['load']);
  release(); await loading; await starting;
  await runtime.dispatch({ type: 'pause' });
  await runtime.dispatch({ type: 'start' });
  await runtime.dispatch({ type: 'stop' });
  assert.deepEqual(calls, ['load', 'start', 'pause', 'start', 'stop']);
  assert.equal((events.at(-1) as {state: string}).state, 'idle');
  await runtime.dispatch({ type: 'start' });
  assert.equal(events.at(-1)?.type, 'error');
});
test('input is delivered only while running', async () => {
  const { runtime, calls } = fixture();
  const command = { type: 'input' as const, input: { buttons: [], pointer: { x: .5, y: .5, visible: false } } };
  await runtime.dispatch({ type: 'init' }); await runtime.dispatch(command);
  await runtime.dispatch({ type: 'load', file }); await runtime.dispatch({ type: 'start' });
  await runtime.dispatch(command); await runtime.dispatch({ type: 'pause' }); await runtime.dispatch(command);
  assert.equal(calls.filter(x => x === 'input').length, 1);
});
test('empty and unsupported files rejected; extension is case insensitive', () => {
  assert.ok(validateFile({ name: 'a.dol', size: 0 }, info));
  assert.ok(validateFile({ name: 'a.iso', size: 100 }, info));
  assert.equal(validateFile({ name: 'a.DOL', size: 100 }, info), null);
});
test('unsupported file does not replace the loaded title', async () => {
  const { runtime, calls, events } = fixture();
  await runtime.dispatch({ type: 'init' });
  await runtime.dispatch({ type: 'load', file });
  await runtime.dispatch({ type: 'load', file: { name: 'bad.iso', size: 100 } as File });
  await runtime.dispatch({ type: 'start' });
  assert.deepEqual(calls, ['load', 'start']);
  assert.equal((events.at(-1) as {state: string}).state, 'running');
});
test('a native failure during start cannot be overwritten by running status', async () => {
  const events: CoreEvent[] = [];
  const { core } = fixture();
  const runtime = new Runtime(async () => async emit => {
    core.start = async () => { emit({ type: 'error', code: 'BOOT_FAILURE', message: 'Native boot failed' }); };
    return core;
  }, event => events.push(event));
  await runtime.dispatch({ type: 'init' });
  await runtime.dispatch({ type: 'load', file });
  await runtime.dispatch({ type: 'start' });
  assert.equal(events.at(-1)?.type, 'error');
  assert.ok(!events.some(event => event.type === 'status' && event.state === 'running'));
  await runtime.dispatch({ type: 'stop' });
  assert.equal((events.at(-1) as {state: string}).state, 'idle');
});

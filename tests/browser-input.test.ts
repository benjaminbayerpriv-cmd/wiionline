import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindBrowserInput, imagePointer, mouseButtons, neutralState } from '../src/browser-input';
import type { InputState } from '../src/protocol';
test('IR tracks the visible image and excludes object-fit letterboxing', () => {
  const box = { left: 10, top: 20, width: 800, height: 600 };
  assert.deepEqual(imagePointer(410, 320, box, 1600, 900), { x: .5, y: .5, visible: true });
  assert.deepEqual(imagePointer(410, 40, box, 1600, 900), { x: .5, y: 0, visible: false });
  assert.deepEqual(imagePointer(10, 95, box, 1600, 900), { x: 0, y: 0, visible: true });
});
test('invalid layout cannot emit a visible IR pointer', () => { assert.equal(imagePointer(0, 0, { left: 0, top: 0, width: 0, height: 0 }, 0, 0).visible, false); });
test('mouse buttons map left to A and right to B', () => {
  assert.deepEqual(mouseButtons(1), ['A']); assert.deepEqual(mouseButtons(2), ['B']); assert.deepEqual(mouseButtons(3), ['A', 'B']); assert.deepEqual(mouseButtons(4), []);
});
function fixture(initiallyEnabled = true) {
  const canvas: any = new EventTarget(); canvas.width = 640; canvas.height = 480; canvas.focused = 0; canvas.captured = [];
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 480 }); canvas.focus = () => { canvas.focused++; };
  canvas.setPointerCapture = (id: number) => canvas.captured.push(id);
  const win = new EventTarget(); const out: InputState[] = []; let enabled = initiallyEnabled;
  const handle = bindBrowserInput(canvas, () => enabled, i => out.push(i), win);
  const fire = (target: EventTarget, type: string, props: object = {}) => { const e: any = Object.assign(new Event(type, { cancelable: true }), { prevented: false }, props); target.dispatchEvent(e); return e; };
  return { canvas, win, out, handle, fire, enable: (v: boolean) => { enabled = v; } };
}
test('keyboard maps to Wii buttons and releases cleanly', () => {
  const f = fixture(); f.fire(f.canvas, 'keydown', { code: 'KeyX' }); f.fire(f.canvas, 'keydown', { code: 'KeyZ' });
  assert.deepEqual(f.out.at(-1)?.buttons, ['A', 'B']);
  const e = f.fire(f.canvas, 'keydown', { code: 'ArrowLeft' }); assert.equal(e.defaultPrevented, true);
  assert.deepEqual(f.out.at(-1)?.buttons, ['A', 'B', 'LEFT']);
  f.fire(f.canvas, 'keyup', { code: 'KeyX' }); assert.deepEqual(f.out.at(-1)?.buttons, ['B', 'LEFT']);
  f.fire(f.canvas, 'keydown', { code: 'KeyQ' }); assert.equal(f.out.length, 4);
  f.fire(f.canvas, 'keydown', { code: 'KeyH', metaKey: true }); assert.equal(f.out.length, 4);
});
test('left and right mouse buttons together give A+B (Wii Play title screen)', () => {
  const f = fixture(); f.fire(f.canvas, 'pointermove', { clientX: 320, clientY: 240, buttons: 0 });
  assert.deepEqual(f.out.at(-1), { buttons: [], pointer: { x: .5, y: .5, visible: true }, accel: { x: 0, y: 0, z: 1 } });
  f.fire(f.canvas, 'pointerdown', { clientX: 320, clientY: 240, buttons: 1, pointerId: 7 }); assert.deepEqual(f.out.at(-1)?.buttons, ['A']);
  f.fire(f.canvas, 'pointerdown', { clientX: 320, clientY: 240, buttons: 3, pointerId: 7 }); assert.deepEqual(f.out.at(-1)?.buttons, ['A', 'B']);
  f.fire(f.canvas, 'pointerup', { clientX: 320, clientY: 240, buttons: 2, pointerId: 7 }); assert.deepEqual(f.out.at(-1)?.buttons, ['B']);
  assert.equal(f.canvas.focused, 2); assert.deepEqual(f.canvas.captured, [7, 7]);
  assert.equal(f.fire(f.canvas, 'contextmenu').defaultPrevented, true);
});
test('mouse and keyboard buttons combine; pointer coordinates are normalised top-left', () => {
  const f = fixture(); f.fire(f.canvas, 'keydown', { code: 'KeyZ' });
  f.fire(f.canvas, 'pointermove', { clientX: 160, clientY: 120, buttons: 1 });
  assert.deepEqual(f.out.at(-1), { buttons: ['A', 'B'], pointer: { x: .25, y: .25, visible: true }, accel: { x: 0, y: 0, z: 1 } });
  f.fire(f.canvas, 'pointerleave', { buttons: 0 }); assert.equal(f.out.at(-1)?.pointer.visible, false);
  assert.deepEqual(f.out.at(-1)?.pointer.x, .25);
});
test('focus loss and pointercancel send the neutral state', () => {
  for (const [target, type] of [['canvas', 'blur'], ['win', 'blur'], ['canvas', 'pointercancel']] as const) {
    const f = fixture(); f.fire(f.canvas, 'keydown', { code: 'KeyX' }); f.fire(f.canvas, 'pointermove', { clientX: 10, clientY: 10, buttons: 2 });
    assert.equal(f.out.at(-1)?.pointer.visible, true); f.fire(f[target], type);
    assert.deepEqual(f.out.at(-1), neutralState()); assert.deepEqual(neutralState(), { buttons: [], pointer: { x: .5, y: .5, visible: false }, accel: { x: 0, y: 0, z: 1 } });
    f.fire(f.canvas, 'keyup', { code: 'KeyX' }); assert.deepEqual(f.out.at(-1)?.buttons, []);
  }
});
test('disabled input emits nothing except neutral reset; dispose removes listeners', () => {
  const f = fixture(false); f.fire(f.canvas, 'keydown', { code: 'KeyX' }); f.fire(f.canvas, 'pointermove', { clientX: 1, clientY: 1, buttons: 0 }); assert.equal(f.out.length, 0);
  f.enable(true); f.fire(f.canvas, 'keydown', { code: 'KeyX' }); assert.equal(f.out.length, 1); f.handle.dispose(); f.fire(f.canvas, 'keydown', { code: 'KeyZ' }); assert.equal(f.out.length, 1);
});

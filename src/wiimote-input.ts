import type { Button, InputState } from './protocol';
// Application mask agreed with the native agent; conversion to Dolphin HID is native.
const order: Button[] = ['A', 'B', 'ONE', 'TWO', 'PLUS', 'MINUS', 'HOME', 'UP', 'DOWN', 'LEFT', 'RIGHT'];
function finite(value: number, fallback: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
export const neutralInput = (): InputState => ({ buttons: [], pointer: { x: .5, y: .5, visible: false } });
export function wiimoteArguments(input: InputState): number[] {
  let mask = 0;
  for (const button of input.buttons) {
    const bit = order.indexOf(button);
    if (bit >= 0) mask |= 1 << bit;
  }
  const validPointer = Number.isFinite(input.pointer.x) && Number.isFinite(input.pointer.y);
  const accel = input.accel ?? { x: 0, y: 0, z: 1 };
  return [0, mask, finite(input.pointer.x, .5, 0, 1), finite(input.pointer.y, .5, 0, 1),
    input.pointer.visible && validPointer ? 1 : 0,
    finite(accel.x, 0, -4, 4), finite(accel.y, 0, -4, 4), finite(accel.z, 1, -4, 4)];
}

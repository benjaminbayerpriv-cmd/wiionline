import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wiimoteArguments } from '../src/wiimote-input';
test('invalid pointer hides IR; acceleration and coordinates are bounded', () => {
  assert.deepEqual(wiimoteArguments({buttons:['B','B'],pointer:{x:NaN,y:2,visible:true},accel:{x:99,y:-99,z:NaN}}), [0,2,.5,1,0,4,-4,1]);
});

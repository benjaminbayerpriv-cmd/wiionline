import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { FrameMailbox } from '../src/frame-mailbox';

test('slow UI receives first and latest frame, with bounded backlog', () => {
  const delivered: number[] = [];
  const mailbox = new FrameMailbox(frame => delivered.push(new Uint8Array(frame.rgba)[0]));
  const frame = (n: number) => ({ type: 'frame' as const, width: 1, height: 1, rgba: new Uint8Array([n, 0, 0, 255]).buffer });
  mailbox.offer(frame(1));
  for (let i = 2; i <= 200; i++) mailbox.offer(frame(i));
  assert.deepEqual(delivered, [1]);
  mailbox.acknowledge();
  assert.deepEqual(delivered, [1, 200]);
  mailbox.acknowledge();
  mailbox.offer(frame(201));
  assert.deepEqual(delivered, [1, 200, 201]);
});

test('stop discards a queued frame before acknowledgment', () => {
  const delivered: number[] = [];
  const mailbox = new FrameMailbox(frame => delivered.push(new Uint8Array(frame.rgba)[0]));
  const frame = (n: number) => ({ type: 'frame' as const, width: 1, height: 1, rgba: new Uint8Array([n, 0, 0, 255]).buffer });
  mailbox.offer(frame(1)); mailbox.offer(frame(2)); mailbox.clear(); mailbox.acknowledge();
  assert.deepEqual(delivered, [1]);
});

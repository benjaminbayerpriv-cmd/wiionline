import { Runtime } from './runtime';
import type { Command, CoreEvent, CreateCore } from './protocol';
import { FrameMailbox } from './frame-mailbox';
const scope = self as unknown as {
  postMessage(event: CoreEvent, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<Command>) => void) | null;
};
const frames = new FrameMailbox(event => scope.postMessage(event, [event.rgba]));
const runtime = new Runtime(async () => {
  const path = '/core/adapter.js';
  // Check status explicitly: Vite's HTML fallback is not an installed core.
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok || response.headers.get('content-type')?.includes('text/html')) {
    throw new Error('Der Wii-Kern ist noch nicht installiert. Sobald er verfügbar ist, erneut prüfen.');
  }
  const module = await import(/* @vite-ignore */ path) as { createCore?: CreateCore };
  if (typeof module.createCore !== 'function') throw new Error('Im Kern-Adapter fehlt createCore().');
  return module.createCore;
}, event => {
  if (event.type === 'frame') frames.offer(event);
  else if (event.type === 'audio') scope.postMessage(event, [event.pcm]);
  else {
    if (event.type === 'error' || (event.type === 'status' && event.state !== 'running')) frames.clear();
    scope.postMessage(event);
  }
});
scope.onmessage = event => {
  if (event.data.type === 'frame-ack') { frames.acknowledge(); return; }
  void runtime.dispatch(event.data);
};

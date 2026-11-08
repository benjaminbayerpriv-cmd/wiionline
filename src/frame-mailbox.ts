import type { CoreEvent } from './protocol';

type Frame = Extract<CoreEvent, { type: 'frame' }>;

/** At most one transferred frame plus the newest replacement waits for the UI. */
export class FrameMailbox {
  private inFlight = false;
  private newest?: Frame;
  constructor(private send: (frame: Frame) => void) {}
  offer(frame: Frame) {
    if (this.inFlight) { this.newest = frame; return; }
    this.inFlight = true;
    this.send(frame);
  }
  acknowledge() {
    if (!this.inFlight) return;
    const next = this.newest;
    this.newest = undefined;
    if (next) this.send(next);
    else this.inFlight = false;
  }
  clear() { this.newest = undefined; }
}

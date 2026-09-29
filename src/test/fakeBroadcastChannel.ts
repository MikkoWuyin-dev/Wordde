/**
 * Shared in-memory BroadcastChannel test double.
 *
 * Mirrors the surface broadcastSync.ts uses: postMessage capture,
 * message-listener registration, and an emit() helper that feeds data to all
 * listeners synchronously (as a real same-origin BroadcastChannel would).
 * Stub with `vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)`.
 */
export class FakeBroadcastChannel {
  posted: unknown[] = [];
  listeners: ((e: { data: unknown }) => void)[] = [];
  constructor(public name: string) {}
  postMessage(m: unknown) {
    this.posted.push(m);
  }
  addEventListener(type: string, cb: (e: { data: unknown }) => void) {
    if (type === 'message') this.listeners.push(cb);
  }
  removeEventListener(type: string, cb: (e: { data: unknown }) => void) {
    this.listeners = this.listeners.filter((l) => l !== cb);
  }
  close() {}
  emit(data: unknown) {
    this.listeners.forEach((l) => l({ data }));
  }
  clear() {
    this.posted.length = 0;
    this.listeners.length = 0;
  }
}

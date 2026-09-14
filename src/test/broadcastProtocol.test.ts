import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { broadcastCommit, broadcastHeartbeat, onBroadcastMessage, getChannel } from '@/core/broadcastSync';
import type { Passage } from '@/core/types';

/**
 * §20 / RI-020 — broadcast protocol versioning.
 *
 * Every outgoing broadcast message carries the protocol version, and the
 * receiver ignores (warns, never acts on) a message whose version doesn't
 * match — an incompatible message must never mutate operator/projection
 * state, so mixed old/new windows during an upgrade cannot cross-talk.
 *
 * These tests were written against the unversioned code (the "stamps a
 * version" and "ignores a mismatched version" tests failed until versioning
 * landed); they pin the landed behavior. The "delivers a current-version
 * message" test guards valid traffic from ever being dropped.
 */

class FakeBroadcastChannel {
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
}

const bus = () => getChannel() as unknown as FakeBroadcastChannel;

const passage = {
  reference: { book: 'John', chapter: '3', verseStart: '16', translation: 'KJV' },
  displayReference: 'John 3:16',
  text: 'x',
  verses: [{ verse: '16', text: 'x' }],
} as Passage;

beforeEach(() => {
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  bus().posted.length = 0;
  bus().listeners.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('§20 / RI-020 — broadcast protocol versioning', () => {
  it('stamps a numeric protocol version on every outgoing message', () => {
    broadcastCommit(passage);
    broadcastHeartbeat();
    expect(bus().posted).toHaveLength(2);
    for (const m of bus().posted) {
      expect(typeof (m as { version?: unknown }).version).toBe('number');
    }
  });

  it('ignores an incoming message whose version does not match', () => {
    const seen: unknown[] = [];
    const off = onBroadcastMessage((msg) => seen.push(msg));
    bus().emit({ type: 'CLEAR_PASSAGE', version: -1 }); // incompatible version
    off();
    expect(seen).toHaveLength(0);
  });

  it('still delivers an incoming message that carries the current version', () => {
    // A real send stamps the current version; feeding that exact message back
    // through the receiver must be delivered.
    broadcastCommit(passage);
    const valid = bus().posted[0];
    const seen: unknown[] = [];
    const off = onBroadcastMessage((msg) => seen.push(msg));
    bus().emit(valid);
    off();
    expect(seen).toHaveLength(1);
  });
});

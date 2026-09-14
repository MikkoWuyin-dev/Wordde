import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useOperatorLease } from '@/hooks/useOperatorLease';
import { claimLease, readLease, HEARTBEAT_MS, LEASE_TTL_MS } from '@/core/operatorLease';

/**
 * RI-001 — React integration of the operator singleton lease.
 *
 * The pure lease semantics are pinned in operatorLease.test.ts; these tests
 * cover the hook wiring the task requires:
 *  - a fresh foreign lease → status 'blocked', and we do NOT claim or fight;
 *  - no lease / a stale lease → status 'active', lease claimed;
 *  - takeOver() force-claims while blocked;
 *  - the heartbeat keeps our lease and steps down to 'blocked' when another
 *    window takes over;
 *  - unmount and beforeunload release OUR lease (never another window's).
 *
 * Timing: setInterval is driven by fake timers. Lease ages are seeded relative
 * to Date.now() at seed time, and assertions only ever compare ids/statuses —
 * never absolute timestamps — so the tests hold whether or not the fake
 * timer clock also mocks Date.
 */

const OTHER = 'other-window-id';

// jsdom 20 lacks crypto.randomUUID; provide a deterministic stub regardless.
let uuidCounter = 0;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.stubGlobal('crypto', { randomUUID: () => `window-${++uuidCounter}` });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
});

describe('useOperatorLease — RI-001 integration', () => {
  it('is blocked when a fresh foreign lease is held, and does not claim', () => {
    claimLease(OTHER, Date.now());
    const { result } = renderHook(() => useOperatorLease());

    expect(result.current.status).toBe('blocked');
    // Did not fight the active operator for the lease.
    expect(readLease()?.id).toBe(OTHER);
  });

  it('claims the lease and is active when no lease exists', () => {
    const { result } = renderHook(() => useOperatorLease());

    expect(result.current.status).toBe('active');
    const lease = readLease();
    expect(lease).not.toBeNull();
    expect(lease?.id).not.toBe(OTHER);
  });

  it('claims a stale foreign lease (crashed operator) without takeOver', () => {
    claimLease(OTHER, Date.now() - (LEASE_TTL_MS + 10));
    const { result } = renderHook(() => useOperatorLease());

    expect(result.current.status).toBe('active');
    expect(readLease()?.id).not.toBe(OTHER);
  });

  it('takeOver() force-claims while blocked', () => {
    claimLease(OTHER, Date.now());
    const { result } = renderHook(() => useOperatorLease());
    expect(result.current.status).toBe('blocked');

    act(() => result.current.takeOver());

    expect(result.current.status).toBe('active');
    expect(readLease()?.id).not.toBe(OTHER);
  });

  it('the heartbeat keeps the lease while we are the operator', () => {
    const { result } = renderHook(() => useOperatorLease());
    expect(result.current.status).toBe('active');
    const ours = readLease()?.id;

    act(() => {
      vi.advanceTimersByTime(HEARTBEAT_MS * 3);
    });

    expect(result.current.status).toBe('active');
    expect(readLease()?.id).toBe(ours);
  });

  it('steps down to blocked when another window takes over mid-run', () => {
    const { result } = renderHook(() => useOperatorLease());
    expect(result.current.status).toBe('active');

    // Another window force-claims the lease (explicit take-over there).
    act(() => {
      claimLease(OTHER, Date.now() + 1);
    });
    act(() => {
      vi.advanceTimersByTime(HEARTBEAT_MS);
    });

    expect(result.current.status).toBe('blocked');
    // Our heartbeat did NOT clobber the new holder's lease.
    expect(readLease()?.id).toBe(OTHER);
  });

  it('releases the lease on unmount', () => {
    const { result, unmount } = renderHook(() => useOperatorLease());
    expect(result.current.status).toBe('active');
    expect(readLease()).not.toBeNull();

    unmount();
    expect(readLease()).toBeNull();
  });

  it('releases the lease on beforeunload', () => {
    const { result } = renderHook(() => useOperatorLease());
    expect(result.current.status).toBe('active');
    expect(readLease()).not.toBeNull();

    act(() => {
      window.dispatchEvent(new Event('beforeunload'));
    });
    expect(readLease()).toBeNull();
  });

  it('release on unmount never clears another window’s lease', () => {
    const { result, unmount } = renderHook(() => useOperatorLease());
    expect(result.current.status).toBe('active');

    // The other window takes over before we close: the lease is theirs now.
    claimLease(OTHER, Date.now() + 1);
    unmount();

    expect(readLease()?.id).toBe(OTHER);
  });
});

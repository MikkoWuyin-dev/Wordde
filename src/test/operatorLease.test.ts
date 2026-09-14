import { describe, it, expect, beforeEach } from 'vitest';
import {
  readLease,
  isLeaseHeldByOther,
  claimLease,
  refreshLease,
  releaseLease,
  LEASE_TTL_MS,
} from '@/core/operatorLease';

/**
 * RI-001 — single authoritative operator.
 *
 * The lease is the mechanism that stops a second Operator window from becoming
 * a competing writer. These tests pin the exact semantics the boot gate relies
 * on: a fresh foreign lease blocks; our own or a stale lease does not; a
 * heartbeat steps down when taken over; release only clears our own lease.
 *
 * Time is injected, so no timers or fake clocks are needed.
 */

const T0 = 1_000_000;

beforeEach(() => localStorage.clear());

describe('RI-001 — operator lease', () => {
  it('no lease present → nothing blocks a new operator', () => {
    expect(isLeaseHeldByOther('A', T0)).toBe(false);
  });

  it('a fresh lease held by another window blocks us', () => {
    claimLease('B', T0);
    expect(isLeaseHeldByOther('A', T0 + 100)).toBe(true);
  });

  it('our own fresh lease never blocks us', () => {
    claimLease('A', T0);
    expect(isLeaseHeldByOther('A', T0 + 100)).toBe(false);
  });

  it('a stale lease (older than TTL) is claimable, so it does not block', () => {
    claimLease('B', T0);
    expect(isLeaseHeldByOther('A', T0 + LEASE_TTL_MS + 1)).toBe(false);
  });

  it('refreshLease claims when absent and keeps the lease when ours', () => {
    expect(refreshLease('A', T0)).toBe(true);
    expect(readLease()).toMatchObject({ id: 'A', ts: T0 });
    expect(refreshLease('A', T0 + 2000)).toBe(true);
    expect(readLease()?.ts).toBe(T0 + 2000);
  });

  it('refreshLease steps down (returns false) when another window has taken over', () => {
    claimLease('A', T0);
    claimLease('B', T0 + 1000); // B takes over
    expect(refreshLease('A', T0 + 1500)).toBe(false); // A must step down
    expect(readLease()?.id).toBe('B'); // A did not clobber B's lease
  });

  it('claimLease force-overwrites even a fresh foreign lease (explicit take-over)', () => {
    claimLease('B', T0);
    claimLease('A', T0 + 100);
    expect(readLease()).toMatchObject({ id: 'A' });
  });

  it('releaseLease clears only our own lease', () => {
    claimLease('A', T0);
    releaseLease('B'); // not ours → no-op
    expect(readLease()?.id).toBe('A');
    releaseLease('A');
    expect(readLease()).toBeNull();
  });

  it('a malformed lease value is treated as no lease', () => {
    localStorage.setItem('wordde-operator-lease', '{not valid json');
    expect(readLease()).toBeNull();
    expect(isLeaseHeldByOther('A', T0)).toBe(false);
  });
});

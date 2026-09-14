import { safeLocalSet, safeLocalRemove } from './safeStorage';

/**
 * Operator singleton lease (RI-001 — single authoritative operator).
 *
 * Only one Operator window may be the authoritative writer. This module is the
 * pure, testable core: a heartbeated lease in localStorage. A window claims the
 * lease and refreshes it on a heartbeat; a lease not refreshed within
 * LEASE_TTL_MS is considered stale (the operator crashed/closed) and may be
 * claimed by another window. The React integration (hook + boot gate + the
 * "already running / Take over" UI) lives in the operator screen and uses these
 * functions — the time source (`now`) and the window `id` are injected so this
 * logic is deterministic and unit-testable.
 *
 * All writes go through safeLocalSet/safeLocalRemove (VF-005); reads validate
 * the stored value as untrusted input (RI-023).
 */

const LEASE_KEY = 'wordde-operator-lease';

/** A lease older than this (unrefreshed) is stale and may be claimed. */
export const LEASE_TTL_MS = 5000;
/** Heartbeat cadence. MUST be comfortably below LEASE_TTL_MS. */
export const HEARTBEAT_MS = 2000;

export interface OperatorLease {
  id: string;
  ts: number;
}

/** Read and validate the current lease. Returns null if absent or malformed. */
export function readLease(): OperatorLease | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(LEASE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as OperatorLease).id === 'string' &&
      typeof (parsed as OperatorLease).ts === 'number'
    ) {
      return parsed as OperatorLease;
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * True if a *fresh* lease is held by a window other than `id`. A stale lease
 * (older than LEASE_TTL_MS) is claimable, so it does not block.
 */
export function isLeaseHeldByOther(id: string, now: number): boolean {
  const lease = readLease();
  if (!lease) return false;
  if (lease.id === id) return false;
  return now - lease.ts < LEASE_TTL_MS;
}

/** Force-claim the lease for `id` (used on first acquire and on take-over). */
export function claimLease(id: string, now: number): void {
  safeLocalSet(LEASE_KEY, JSON.stringify({ id, ts: now }));
}

/**
 * Heartbeat. If another window holds a fresh lease (we've been taken over),
 * returns false and does NOT overwrite it — the caller must step down.
 * Otherwise (absent / stale / ours) it refreshes/claims and returns true.
 */
export function refreshLease(id: string, now: number): boolean {
  if (isLeaseHeldByOther(id, now)) return false;
  claimLease(id, now);
  return true;
}

/** Release the lease only if it is ours (never clear another window's lease). */
export function releaseLease(id: string): void {
  const lease = readLease();
  if (lease && lease.id === id) {
    safeLocalRemove(LEASE_KEY);
  }
}

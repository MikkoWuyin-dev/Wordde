import { useCallback, useEffect, useRef, useState } from 'react';
import {
  claimLease,
  HEARTBEAT_MS,
  isLeaseHeldByOther,
  refreshLease,
  releaseLease,
} from '@/core/operatorLease';

/**
 * React integration for the operator singleton lease (RI-001 — single
 * authoritative operator).
 *
 * On mount this window either claims the lease and starts heartbeating, or —
 * if a *fresh* lease is held by another window — becomes 'blocked' and renders
 * nothing that could compete with the active operator. A blocked window only
 * becomes the operator via an explicit `takeOver()` (Option A policy: never
 * take over automatically). If the other operator crashed, its lease goes
 * stale after LEASE_TTL_MS and takeOver claims it cleanly.
 *
 * The lease is an Operator-screen concern only. The projection window is a
 * replica (RI-017/RI-018, VF-004) and must NEVER take a lease.
 *
 * Note: the lease heartbeat (this file) is unrelated to the operator→projector
 * readiness `broadcastHeartbeat` in broadcastSync.ts.
 */
export type OperatorLeaseStatus = 'active' | 'blocked';

export interface UseOperatorLeaseResult {
  status: OperatorLeaseStatus;
  /** Force-claim the lease for this window and start heartbeating. */
  takeOver: () => void;
}

export function useOperatorLease(): UseOperatorLeaseResult {
  // One id per mounted hook instance — the ref keeps the first value, so the
  // window's identity is stable across renders.
  const idRef = useRef(crypto.randomUUID());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initial status is computed synchronously (before first paint) so a blocked
  // second tab never renders the operator UI nor kicks off boot work like the
  // Bible preload. The mount effect below then claims/heartbeats or stays
  // blocked, per the same check.
  const [status, setStatus] = useState<OperatorLeaseStatus>(() =>
    isLeaseHeldByOther(idRef.current, Date.now()) ? 'blocked' : 'active',
  );

  const clearHeartbeat = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // (Re)start the heartbeat. Clears any existing interval first, so repeated
  // calls (mount + takeOver) never create duplicate intervals.
  const startHeartbeat = useCallback(() => {
    clearHeartbeat();
    intervalRef.current = setInterval(() => {
      // We've been taken over by another window → step down (refreshLease
      // already refused to clobber the new holder's lease).
      if (!refreshLease(idRef.current, Date.now())) {
        clearHeartbeat();
        setStatus('blocked');
      }
    }, HEARTBEAT_MS);
  }, [clearHeartbeat]);

  // On mount: block if another operator holds a fresh lease; otherwise claim
  // and heartbeat. (Heartbeat cadence MUST stay below LEASE_TTL_MS.)
  useEffect(() => {
    const id = idRef.current;
    const now = Date.now();
    if (isLeaseHeldByOther(id, now)) {
      setStatus('blocked');
      return;
    }
    claimLease(id, now);
    setStatus('active');
    startHeartbeat();
    return () => {
      clearHeartbeat();
      releaseLease(id);
    };
  }, [startHeartbeat, clearHeartbeat]);

  // Reload/close of the operator window releases the lease immediately so the
  // next window can claim without waiting out the TTL. releaseLease is a no-op
  // when the lease belongs to another window.
  useEffect(() => {
    const id = idRef.current;
    const handleBeforeUnload = () => releaseLease(id);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const takeOver = useCallback(() => {
    claimLease(idRef.current, Date.now());
    setStatus('active');
    startHeartbeat();
  }, [startHeartbeat]);

  return { status, takeOver };
}

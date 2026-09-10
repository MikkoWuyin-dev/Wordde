// Projection recovery persistence
// -------------------------------------------------------------
// Purpose: allow the Operator Window to reconstruct its ACTIVE projection /
// navigation session after an accidental reload or crash.
//
// This is deliberately a *small, explicit* snapshot — not blanket persistence of
// the Zustand store. Transient UI state (search query/results, onboarding,
// modals, tooltips) is never persisted here.
//
// The Operator Window remains the single source of truth. This module only
// stores/loads a snapshot; it never broadcasts and never lets the Projection
// Window write operator state.

import type { Passage, Slide } from './types';
import { BibleRepository } from './bibleRepository';

export const RECOVERY_KEY = 'projectionRecoveryState';
export const RECOVERY_VERSION = 1;

/**
 * Stale-state policy
 * -------------------
 * The existing `projectionState` key is written on every projection with a
 * timestamp, and the Projection Window restores it without a time bound because
 * it only mirrors a passage. The operator queue is heavier: silently adopting a
 * queue from an unrelated session weeks later would be surprising.
 *
 * We therefore bound operator recovery to a single service window: 12 hours.
 * A crash/reload during or shortly before a service recovers; an old session
 * does not become the active operator queue.
 */
export const RECOVERY_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** Hard bound on snapshot size — queues are chapter-sized in practice. */
export const MAX_QUEUE_SLIDES = 200;
/** Matches the in-memory history cap in stateManager (slice(-10)). */
export const MAX_HISTORY_SLIDES = 10;

export interface ProjectionRecoveryState {
  version: number;
  queue: Slide[];
  currentSlideIndex: number;
  /** null = nothing live (e.g. chapter loaded but not yet projected) */
  liveSlideIndex: number | null;
  committedPassage: Passage | null;
  isScreenBlanked: boolean;
  currentTranslation: string;
  projectionLocked: boolean;
  /** Passage-level undo stack; capped, so the snapshot stays bounded. */
  historyStack: Slide[];
  timestamp: number;
}

function isSlide(v: unknown): v is Slide {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.reference === 'string' &&
    typeof s.text === 'string' &&
    typeof s.book === 'string' &&
    typeof s.chapter === 'string' &&
    typeof s.verse === 'string'
  );
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function isPassage(v: unknown): v is Passage {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  const ref = p.reference as Record<string, unknown> | undefined;
  return (
    !!ref &&
    typeof ref === 'object' &&
    typeof ref.book === 'string' &&
    typeof ref.chapter === 'string' &&
    typeof ref.translation === 'string' &&
    typeof p.text === 'string' &&
    Array.isArray(p.verses)
  );
}

/**
 * Build the snapshot payload from the authoritative operator state.
 * Pure — no I/O — so it is trivially testable.
 */
export function buildRecoverySnapshot(input: {
  projectionQueue: Slide[];
  currentSlideIndex: number;
  liveSlideIndex: number | null;
  committedPassage: Passage | null;
  isScreenBlanked: boolean;
  currentTranslation: string;
  projectionLocked: boolean;
  historyStack: Slide[];
}): ProjectionRecoveryState {
  return {
    version: RECOVERY_VERSION,
    queue: input.projectionQueue.slice(0, MAX_QUEUE_SLIDES),
    currentSlideIndex: input.currentSlideIndex,
    liveSlideIndex: input.liveSlideIndex,
    committedPassage: input.committedPassage,
    isScreenBlanked: input.isScreenBlanked,
    currentTranslation: input.currentTranslation,
    projectionLocked: input.projectionLocked,
    historyStack: input.historyStack.slice(-MAX_HISTORY_SLIDES),
    timestamp: Date.now(),
  };
}

/**
 * Persist the snapshot. NEVER throws: a persistence failure must not break a
 * live projection (quota exceeded, private mode, storage disabled, etc.).
 */
export function saveRecoverySnapshot(snapshot: ProjectionRecoveryState): boolean {
  try {
    localStorage.setItem(RECOVERY_KEY, JSON.stringify(snapshot));
    return true;
  } catch (error) {
    console.warn('[projectionRecovery] Failed to persist recovery snapshot:', error);
    return false;
  }
}

export function clearRecoverySnapshot(): void {
  try {
    localStorage.removeItem(RECOVERY_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Validate + normalize a parsed snapshot. Returns null when unusable.
 * Index bounds are repaired rather than rejected where that is safe.
 */
export function validateRecoverySnapshot(raw: unknown): ProjectionRecoveryState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;

  if (s.version !== RECOVERY_VERSION) {
    console.warn('[projectionRecovery] Unsupported snapshot version:', s.version);
    return null;
  }
  if (!Array.isArray(s.queue) || s.queue.length === 0) return null;
  if (s.queue.length > MAX_QUEUE_SLIDES) return null;
  if (!s.queue.every(isSlide)) {
    console.warn('[projectionRecovery] Snapshot queue contains invalid slides.');
    return null;
  }
  if (!isInt(s.currentSlideIndex)) return null;
  if (s.liveSlideIndex !== null && !isInt(s.liveSlideIndex)) return null;
  if (typeof s.currentTranslation !== 'string' || !s.currentTranslation) return null;
  if (!isInt(s.timestamp)) return null;

  const available = BibleRepository.getAvailableTranslations();
  if (available.length > 0 && !available.includes(s.currentTranslation)) {
    console.warn('[projectionRecovery] Unknown translation in snapshot:', s.currentTranslation);
    return null;
  }

  if (Date.now() - (s.timestamp as number) > RECOVERY_MAX_AGE_MS) {
    console.warn('[projectionRecovery] Snapshot is stale; ignoring.');
    return null;
  }

  const queue = s.queue as Slide[];
  const clamp = (i: number) => Math.min(Math.max(i, 0), queue.length - 1);

  const currentSlideIndex = clamp(s.currentSlideIndex as number);
  let liveSlideIndex: number | null = null;
  if (isInt(s.liveSlideIndex)) {
    liveSlideIndex =
      s.liveSlideIndex >= 0 && s.liveSlideIndex < queue.length ? s.liveSlideIndex : null;
    if (liveSlideIndex === null) {
      console.warn('[projectionRecovery] liveSlideIndex out of range; treating as not live.');
    }
  }

  const historyStack = Array.isArray(s.historyStack)
    ? (s.historyStack as unknown[]).filter(isSlide).slice(-MAX_HISTORY_SLIDES)
    : [];

  return {
    version: RECOVERY_VERSION,
    queue,
    currentSlideIndex,
    liveSlideIndex,
    committedPassage: isPassage(s.committedPassage) ? s.committedPassage : null,
    isScreenBlanked: s.isScreenBlanked === true,
    currentTranslation: s.currentTranslation,
    projectionLocked: s.projectionLocked === true,
    historyStack,
    timestamp: s.timestamp as number,
  };
}

/** Read + validate the persisted snapshot. Never throws. */
export function loadRecoverySnapshot(): ProjectionRecoveryState | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(RECOVERY_KEY);
  } catch (error) {
    console.warn('[projectionRecovery] localStorage unavailable:', error);
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.warn('[projectionRecovery] Malformed snapshot JSON; discarding.', error);
    clearRecoverySnapshot();
    return null;
  }

  const valid = validateRecoverySnapshot(parsed);
  if (!valid) {
    // Consistent with the app's persistence philosophy: quarantine bad data so
    // it cannot repeatedly log/parse on every boot.
    clearRecoverySnapshot();
    return null;
  }
  return valid;
}

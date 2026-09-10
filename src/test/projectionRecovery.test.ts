import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  RECOVERY_KEY,
  RECOVERY_VERSION,
  buildRecoverySnapshot,
  saveRecoverySnapshot,
  loadRecoverySnapshot,
  validateRecoverySnapshot,
  clearRecoverySnapshot,
} from '@/core/projectionRecovery';
import { useStateManager } from '@/core/stateManager';
import type { Slide, Passage } from '@/core/types';

const slide = (verse: string, text = `text ${verse}`): Slide => ({
  reference: `John 3:${verse}`,
  text,
  book: 'John',
  chapter: '3',
  verse,
});

const A = slide('16');
const B = slide('17');
const C = slide('18');

const passageFor = (s: Slide, translation = 'KJV'): Passage => ({
  reference: { book: s.book, chapter: s.chapter, verseStart: s.verse, translation },
  displayReference: s.reference,
  text: s.text,
  verses: [{ verse: s.verse, text: s.text }],
});

const baseInput = {
  projectionQueue: [A, B, C],
  currentSlideIndex: 1,
  liveSlideIndex: 1,
  committedPassage: passageFor(B),
  isScreenBlanked: false,
  currentTranslation: 'KJV',
  projectionLocked: false,
  historyStack: [] as Slide[],
};

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  useStateManager.setState({
    projectionQueue: [],
    currentSlideIndex: 0,
    liveSlideIndex: null,
    committedPassage: null,
    isScreenBlanked: false,
    currentTranslation: 'KJV',
    projectionLocked: false,
    historyStack: [],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Test 1 — save recovery state', () => {
  it('persists queue and indexes under the dedicated key', () => {
    saveRecoverySnapshot(buildRecoverySnapshot(baseInput));
    const raw = localStorage.getItem(RECOVERY_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.version).toBe(RECOVERY_VERSION);
    expect(parsed.queue.map((s: Slide) => s.reference)).toEqual([
      'John 3:16',
      'John 3:17',
      'John 3:18',
    ]);
    expect(parsed.currentSlideIndex).toBe(1);
    expect(parsed.liveSlideIndex).toBe(1);
    expect(typeof parsed.timestamp).toBe('number');
  });

  it('does not persist transient UI state', () => {
    saveRecoverySnapshot(buildRecoverySnapshot(baseInput));
    const parsed = JSON.parse(localStorage.getItem(RECOVERY_KEY) as string);
    expect(parsed.searchQuery).toBeUndefined();
    expect(parsed.searchResults).toBeUndefined();
    expect(parsed.previewPassage).toBeUndefined();
  });
});

describe('Test 2 — restore recovery state', () => {
  it('reconstructs Zustand state from a valid snapshot', () => {
    saveRecoverySnapshot(buildRecoverySnapshot(baseInput));
    const restored = useStateManager.getState().restoreProjectionSession();
    expect(restored).toBe(true);
    const s = useStateManager.getState();
    expect(s.projectionQueue).toHaveLength(3);
    expect(s.currentSlideIndex).toBe(1);
    expect(s.liveSlideIndex).toBe(1);
    expect(s.committedPassage?.displayReference).toBe('John 3:17');
  });

  it('returns false and changes nothing when no snapshot exists', () => {
    expect(useStateManager.getState().restoreProjectionSession()).toBe(false);
    expect(useStateManager.getState().projectionQueue).toEqual([]);
  });
});

describe('Test 3 — invalid snapshot', () => {
  it('ignores malformed JSON without throwing and quarantines it', () => {
    localStorage.setItem(RECOVERY_KEY, '{not json');
    expect(() => loadRecoverySnapshot()).not.toThrow();
    expect(loadRecoverySnapshot()).toBeNull();
    expect(localStorage.getItem(RECOVERY_KEY)).toBeNull();
    expect(useStateManager.getState().restoreProjectionSession()).toBe(false);
  });

  it('rejects unsupported versions and structurally invalid queues', () => {
    expect(validateRecoverySnapshot({ ...baseInput, version: 99 })).toBeNull();
    expect(
      validateRecoverySnapshot({
        version: RECOVERY_VERSION,
        queue: [{ reference: 'John 3:16' }],
        currentSlideIndex: 0,
        liveSlideIndex: 0,
        currentTranslation: 'KJV',
        timestamp: Date.now(),
      }),
    ).toBeNull();
  });

  it('ignores stale snapshots outside the recovery window', () => {
    const old = { ...buildRecoverySnapshot(baseInput), timestamp: Date.now() - 48 * 60 * 60 * 1000 };
    localStorage.setItem(RECOVERY_KEY, JSON.stringify(old));
    expect(loadRecoverySnapshot()).toBeNull();
  });
});

describe('Test 4 — index validation', () => {
  it('clamps out-of-range currentSlideIndex and drops invalid liveSlideIndex', () => {
    const snap = { ...buildRecoverySnapshot(baseInput), currentSlideIndex: 99, liveSlideIndex: 42 };
    const valid = validateRecoverySnapshot(snap);
    expect(valid).not.toBeNull();
    expect(valid?.currentSlideIndex).toBe(2);
    expect(valid?.liveSlideIndex).toBeNull();

    localStorage.setItem(RECOVERY_KEY, JSON.stringify(snap));
    expect(() => useStateManager.getState().restoreProjectionSession()).not.toThrow();
    expect(useStateManager.getState().liveSlideIndex).toBeNull();
  });
});

describe('Test 5 — reload preserves navigation', () => {
  it('recovers the queue so slide navigation continues from the live position', () => {
    // Simulate an active session: queue A,B,C with B live.
    useStateManager.setState({
      projectionQueue: [A, B, C],
      currentSlideIndex: 1,
      liveSlideIndex: 1,
      committedPassage: passageFor(B),
    });
    useStateManager.getState().persistRecoveryState();

    // "Reload": wipe in-memory state, then restore.
    useStateManager.setState({
      projectionQueue: [],
      currentSlideIndex: 0,
      liveSlideIndex: null,
      committedPassage: null,
    });
    expect(useStateManager.getState().restoreProjectionSession()).toBe(true);
    expect(useStateManager.getState().liveSlideIndex).toBe(1);

    // → moves to C, ← returns to A's neighbour (B) without repository lookups.
    useStateManager.getState().slideNext();
    expect(useStateManager.getState().currentSlideIndex).toBe(2);
    useStateManager.getState().slidePrevious();
    useStateManager.getState().slidePrevious();
    expect(useStateManager.getState().currentSlideIndex).toBe(0);
    expect(useStateManager.getState().projectionQueue[0].reference).toBe('John 3:16');
  });
});

describe('Test 6 — blank recovery', () => {
  it('preserves blank state across recovery', () => {
    saveRecoverySnapshot(buildRecoverySnapshot({ ...baseInput, isScreenBlanked: true }));
    useStateManager.getState().restoreProjectionSession();
    expect(useStateManager.getState().isScreenBlanked).toBe(true);
  });
});

describe('Test 7 — translation recovery', () => {
  it('restores the persisted translation with no fallback', () => {
    saveRecoverySnapshot(
      buildRecoverySnapshot({
        ...baseInput,
        currentTranslation: 'NIV',
        committedPassage: passageFor(B, 'NIV'),
      }),
    );
    useStateManager.getState().restoreProjectionSession();
    const s = useStateManager.getState();
    expect(s.currentTranslation).toBe('NIV');
    expect(s.committedPassage?.reference.translation).toBe('NIV');
  });

  it('rejects snapshots referencing an unregistered translation', () => {
    expect(
      validateRecoverySnapshot({ ...buildRecoverySnapshot(baseInput), currentTranslation: 'ZZZ' }),
    ).toBeNull();
  });
});

describe('Test 8 — persistence failure', () => {
  it('does not throw when localStorage.setItem fails', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(saveRecoverySnapshot(buildRecoverySnapshot(baseInput))).toBe(false);
    useStateManager.setState({ projectionQueue: [A, B, C], currentSlideIndex: 0, liveSlideIndex: 0 });
    expect(() => useStateManager.getState().persistRecoveryState()).not.toThrow();
    expect(() => useStateManager.getState().slideNext()).not.toThrow();
    // In-memory navigation state (the authoritative source) still advanced.
    expect(useStateManager.getState().currentSlideIndex).toBe(1);
    spy.mockRestore();
  });
});

describe('bounded snapshot', () => {
  it('caps queue and history length', () => {
    const bigQueue = Array.from({ length: 500 }, (_, i) => slide(String(i + 1)));
    const bigHistory = Array.from({ length: 50 }, (_, i) => slide(String(i + 1)));
    const snap = buildRecoverySnapshot({ ...baseInput, projectionQueue: bigQueue, historyStack: bigHistory });
    expect(snap.queue.length).toBe(200);
    expect(snap.historyStack.length).toBe(10);
    clearRecoverySnapshot();
  });
});

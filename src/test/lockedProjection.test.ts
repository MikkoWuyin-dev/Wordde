import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { useStateManager } from '@/core/stateManager';
import { getChannel } from '@/core/broadcastSync';
import type { Passage, Slide } from '@/core/types';

/**
 * RI-003  Locked projection must not be accidentally modified.
 * RI-060  Preview must never accidentally become live.
 *
 * While Projection Lock is active, operator navigation may move the PREVIEW
 * cursor, but the audience-visible (live) passage must not change and no
 * COMMIT_PASSAGE may be broadcast — unless an explicitly permitted
 * lock-breaking action (projectNow) is taken.
 *
 * Driven directly against the store; slideToPassage builds passages from slide
 * fields, so no loaded Bible data is required. Queue has three slides with the
 * cursor kept away from the end, so the commit path never reaches the
 * BibleRepository preload branch.
 */

const slide = (verse: string, text = `text ${verse}`): Slide => ({
  reference: `John 3:${verse}`,
  text,
  book: 'John',
  chapter: '3',
  verse,
});

const passageFor = (s: Slide, translation = 'KJV'): Passage => ({
  reference: { book: s.book, chapter: s.chapter, verseStart: s.verse, translation },
  displayReference: s.reference,
  text: s.text,
  verses: [{ verse: s.verse, text: s.text }],
});

const A = slide('16');
const B = slide('17');
const C = slide('18');

/** jsdom has no BroadcastChannel; the commit path requires one. */
class FakeBroadcastChannel {
  messages: unknown[] = [];
  constructor(public name: string) {}
  postMessage(msg: unknown) {
    this.messages.push(msg);
  }
  addEventListener() {}
  removeEventListener() {}
  close() {}
}

const bus = () => getChannel() as unknown as FakeBroadcastChannel;
const commits = () =>
  bus().messages.filter((m) => (m as { type?: string }).type === 'COMMIT_PASSAGE');
const liveRef = () => useStateManager.getState().committedPassage?.displayReference ?? null;

function seed(overrides: Partial<ReturnType<typeof useStateManager.getState>> = {}) {
  useStateManager.setState({
    projectionQueue: [A, B, C],
    currentSlideIndex: 0,
    liveSlideIndex: 0,
    committedPassage: passageFor(A),
    isScreenBlanked: false,
    currentTranslation: 'KJV',
    projectionLocked: false,
    historyStack: [],
    searchQuery: '',
    searchResults: [],
    selectedResultIndex: -1,
    previewPassage: null,
    ...overrides,
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  bus().messages.length = 0; // reset the memoized channel's buffer
  seed();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('RI-003 / RI-060 — projection lock', () => {
  it('navigating while locked moves preview but does not broadcast or change the live passage', () => {
    seed({ projectionLocked: true });
    useStateManager.getState().goToNextVerse();

    const s = useStateManager.getState();
    expect(s.currentSlideIndex).toBe(1); // preview cursor advanced
    expect(s.liveSlideIndex).toBe(0); // live slide unchanged
    expect(liveRef()).toBe('John 3:16'); // audience still sees A
    expect(commits()).toHaveLength(0); // nothing broadcast
  });

  it('navigating while unlocked broadcasts COMMIT_PASSAGE and updates the live passage', () => {
    seed({ projectionLocked: false });
    useStateManager.getState().goToNextVerse();

    const s = useStateManager.getState();
    expect(s.currentSlideIndex).toBe(1);
    expect(s.liveSlideIndex).toBe(1);
    expect(liveRef()).toBe('John 3:17');
    expect(commits()).toHaveLength(1);
  });

  it('previewNextVerse never broadcasts and never changes the live passage (preview ≠ live)', () => {
    seed({ projectionLocked: false });
    useStateManager.getState().previewNextVerse();

    const s = useStateManager.getState();
    expect(s.currentSlideIndex).toBe(1); // preview moved
    expect(s.liveSlideIndex).toBe(0); // live unchanged
    expect(liveRef()).toBe('John 3:16');
    expect(commits()).toHaveLength(0);
  });

  it('projectNow is the sanctioned lock-breaking action: it broadcasts even while locked', () => {
    // Operator has previewed B (cursor at 1) while A is live, with lock ON.
    seed({ projectionLocked: true, currentSlideIndex: 1, liveSlideIndex: 0, committedPassage: passageFor(A) });
    useStateManager.getState().projectNow();

    const s = useStateManager.getState();
    expect(s.liveSlideIndex).toBe(1);
    expect(liveRef()).toBe('John 3:17'); // B is now live
    expect(commits()).toHaveLength(1); // explicit projection breaks the lock
  });

  it('toggling the lock does not itself broadcast', () => {
    seed({ projectionLocked: false });
    useStateManager.getState().toggleProjectionLock();
    expect(useStateManager.getState().projectionLocked).toBe(true);
    expect(commits()).toHaveLength(0);
  });
});

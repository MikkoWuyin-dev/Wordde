import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Passage } from '@/core/types';
import { BibleRepository } from '@/core/bibleRepository';
import { useStateManager } from '@/core/stateManager';
import { saveServices } from '@/components/operator/ServicePlan';
import { safeLocalSet } from '@/core/safeStorage';
import type { BibleBook } from '@/core/types';

const book = (name: string, chapters: Record<string, string[]>): BibleBook => ({
  book: name,
  chapters: Object.entries(chapters).map(([chapter, verses]) => ({
    chapter,
    verses: verses.map((v) => ({ verse: v, text: `${name} ${chapter}:${v} text` })),
  })),
});

function installFixture(translation: string, books: BibleBook[], setCurrent = true) {
  const repo = BibleRepository as unknown as {
    translations: Map<string, Map<string, BibleBook>>;
    translationMetadata: Map<string, unknown>;
    loadedTranslations: Set<string>;
    bookNames: string[];
    bookAliases: Map<string, string[]>;
    currentTranslation: string;
  };
  const map = new Map<string, BibleBook>();
  for (const b of books) {
    map.set(b.book.toLowerCase(), b);
    repo.bookAliases.set(b.book.toLowerCase(), [b.book]);
  }
  repo.translations.set(translation, map);
  repo.loadedTranslations.add(translation);
  repo.bookNames = books.map((b) => b.book);
  if (setCurrent) repo.currentTranslation = translation;
}

function reset() {
  const repo = BibleRepository as unknown as {
    translations: Map<string, unknown>;
    loadedTranslations: Set<string>;
    bookNames: string[];
    bookAliases: Map<string, string[]>;
  };
  repo.translations.clear();
  repo.loadedTranslations.clear();
  repo.bookNames = [];
  repo.bookAliases.clear();
}

/** Simulate what ServicePlan.loadPassageAtIndex does */
async function simulateLoadPassage(
  reference: string,
  translation: string,
  buildQueueFromPassage: (passage: Passage) => void,
  buildQueueFromChapter: (book: string, chapter: string) => void,
): Promise<LoadResult> {
  const rangePattern = /^(.+?)\s*(\d+)\s*:\s*(\d+)(?:\s*-\s*(\d+))?$/i;
  const chapterPattern = /^(.+?)\s*(\d+)$/i;

  const rangeMatch = reference.match(rangePattern);
  if (rangeMatch) {
    const [, bookPart, chapter, verseStart, verseEnd] = rangeMatch;
    const bookName = BibleRepository.resolveBookName(bookPart.trim());
    if (!bookName || bookName.length === 0) return null;
    const passage = BibleRepository.getPassage({
      book: bookName[0], chapter, verseStart, verseEnd, translation,
    });
    if (passage) {
      buildQueueFromPassage(passage);
      return passage;
    }
    return null;
  }

  const chapterMatch = reference.match(chapterPattern);
  if (chapterMatch) {
    const [, bookPart, chapter] = chapterMatch;
    const bookName = BibleRepository.resolveBookName(bookPart.trim());
    if (!bookName || bookName.length === 0) return null;
    buildQueueFromChapter(bookName[0], chapter);
    return { type: 'chapter', book: bookName[0], chapter };
  }

  return null;
}

type ChapterResult = { type: 'chapter'; book: string; chapter: string };
type LoadResult = Passage | ChapterResult | null;

/** Narrow to a verse passage (or fail the test with a clear message). */
function expectPassage(result: LoadResult): Passage {
  if (!result || !('reference' in result)) {
    throw new Error(`Expected a verse passage, got: ${JSON.stringify(result)}`);
  }
  return result;
}

/** Narrow to a chapter-load result (or fail the test with a clear message). */
function expectChapter(result: LoadResult): ChapterResult {
  if (!result || !('type' in result)) {
    throw new Error(`Expected a chapter result, got: ${JSON.stringify(result)}`);
  }
  return result;
}

describe('ServicePlan passage loading', () => {
  beforeEach(() => {
    reset();
    installFixture('TEST', [
      book('John', { '3': ['1', '2', '3', '4', '16'] }),
      book('Romans', { '8': ['1', '18', '28'] }),
    ]);
  });

  it('loads a verse reference and builds the queue', async () => {
    const store = useStateManager;
    store.setState({
      currentTranslation: 'TEST',
      projectionQueue: [],
      currentSlideIndex: 0,
      liveSlideIndex: null,
      projectionLocked: false,
    });

    const result = expectPassage(await simulateLoadPassage(
      'John 3:16',
      'TEST',
      store.getState().buildQueueFromPassage,
      store.getState().buildQueueFromChapter,
    ));

    expect(result.reference.book).toBe('John');
    expect(result.reference.chapter).toBe('3');
    expect(result.reference.verseStart).toBe('16');

    const state = store.getState();
    expect(state.projectionQueue.length).toBeGreaterThan(0);
    expect(state.projectionQueue[0].reference).toBe('John 3:16');
    expect(state.currentSlideIndex).toBe(0);
  });

  it('loads a chapter reference and builds the queue', async () => {
    const store = useStateManager;
    store.setState({
      currentTranslation: 'TEST',
      projectionQueue: [],
      currentSlideIndex: 0,
      liveSlideIndex: null,
      projectionLocked: false,
    });

    const result = expectChapter(await simulateLoadPassage(
      'Romans 8',
      'TEST',
      store.getState().buildQueueFromPassage,
      store.getState().buildQueueFromChapter,
    ));

    expect(result.type).toBe('chapter');
    expect(result.book).toBe('Romans');
    expect(result.chapter).toBe('8');

    const state = store.getState();
    expect(state.projectionQueue.length).toBeGreaterThan(0);
    expect(state.projectionQueue[0].book).toBe('Romans');
  });

  it('returns null for unresolvable book references', async () => {
    const store = useStateManager;
    store.setState({
      currentTranslation: 'TEST',
      projectionQueue: [],
      currentSlideIndex: 0,
      liveSlideIndex: null,
      projectionLocked: false,
    });

    const result = await simulateLoadPassage(
      'XyzNonexistent 99:1',
      'TEST',
      store.getState().buildQueueFromPassage,
      store.getState().buildQueueFromChapter,
    );

    expect(result).toBeNull();
    const state = store.getState();
    expect(state.projectionQueue.length).toBe(0);
  });

  it('works with verse ranges (e.g. Romans 8:28-31)', async () => {
    const store = useStateManager;
    store.setState({
      currentTranslation: 'TEST',
      projectionQueue: [],
      currentSlideIndex: 0,
      liveSlideIndex: null,
      projectionLocked: false,
    });

    const result = expectPassage(await simulateLoadPassage(
      'Romans 8:28-31',
      'TEST',
      store.getState().buildQueueFromPassage,
      store.getState().buildQueueFromChapter,
    ));

    expect(result.reference.book).toBe('Romans');
    expect(result.reference.chapter).toBe('8');
    expect(result.reference.verseStart).toBe('28');
    expect(result.reference.verseEnd).toBe('31');
  });

  it('fails silently (returns null) when resolveBookName returns empty array', async () => {
    // This test verifies the fix: the old code had !bookName which is false for []
    const emptyResult = BibleRepository.resolveBookName('xyznonexistent');
    expect(emptyResult).toEqual([]);
    expect(emptyResult.length).toBe(0);
    expect(!emptyResult).toBe(false); // The bug: ![] is false

    const store = useStateManager;
    store.setState({
      currentTranslation: 'TEST',
      projectionQueue: [],
      currentSlideIndex: 0,
      liveSlideIndex: null,
      projectionLocked: false,
    });

    const result = await simulateLoadPassage(
      'Xyz 1:1',
      'TEST',
      store.getState().buildQueueFromPassage,
      store.getState().buildQueueFromChapter,
    );

    // With the fix (bookName.length === 0 check), this should return null
    expect(result).toBeNull();
  });

  it('buildQueueFromPassage replaces the queue and sets currentSlideIndex to 0', async () => {
    const store = useStateManager;
    store.setState({
      currentTranslation: 'TEST',
      projectionQueue: [
        { reference: 'Old 1:1', text: 'old', book: 'Old', chapter: '1', verse: '1' },
      ],
      currentSlideIndex: 5,
      liveSlideIndex: 0,
      projectionLocked: false,
    });

    const passage = BibleRepository.getPassage({
      book: 'John', chapter: '3', verseStart: '16', translation: 'TEST',
    });
    expect(passage).not.toBeNull();

    store.getState().buildQueueFromPassage(passage!);

    const state = store.getState();
    expect(state.projectionQueue.length).toBeGreaterThan(0);
    expect(state.projectionQueue[0].reference).toBe('John 3:16');
    expect(state.currentSlideIndex).toBe(0);
  });
});

describe('ServicePlan saveServices — RI-045/RI-059 (failing persistence never crashes the UI)', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it('does not throw when setItem fails, and safeLocalSet reports failure instead of throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(() => saveServices([{ id: '1', name: 'Sunday', passages: [] }])).not.toThrow();
      expect(safeLocalSet('deliberately-failing-key', 'x')).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });
});

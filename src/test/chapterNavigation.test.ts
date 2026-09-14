import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { useStateManager } from '@/core/stateManager';
import { BibleRepository } from '@/core/bibleRepository';
import type { BibleBook, Passage } from '@/core/types';

/**
 * RI-010 / RI-011 — chapter and book boundaries are data-driven.
 *
 * Locks the behaviour of stateManager.goToNextChapter / goToPreviousChapter:
 * stepping within a book, crossing book boundaries in both directions, landing
 * on the new chapter's first verse, and no-op at the very ends. These functions
 * implement boundary-crossing independently of BibleRepository.getNextVerse
 * (RI-051 duplication) — this suite pins their behaviour so the duplication is
 * safe until/if the two are consolidated.
 *
 * Uses the same private-store fixture seam as the translation suites; drives the
 * real store. Book order is John → Acts (getAllBooks reflects bookNames).
 */

type RepoPrivate = {
  translations: Map<string, Map<string, BibleBook>>;
  translationMetadata: Map<string, unknown>;
  loadedTranslations: Set<string>;
  bookNames: string[];
  bookAliases: Map<string, string[]>;
  currentTranslation: string;
};

const book = (name: string, chapters: Record<string, string[]>): BibleBook => ({
  book: name,
  chapters: Object.entries(chapters).map(([chapter, verses]) => ({
    chapter,
    verses: verses.map((v) => ({ verse: v, text: `${name} ${chapter}:${v}` })),
  })),
});

function install(translation: string, books: BibleBook[]) {
  const repo = BibleRepository as unknown as RepoPrivate;
  const map = new Map<string, BibleBook>();
  for (const b of books) {
    map.set(b.book.toLowerCase(), b);
    repo.bookAliases.set(b.book.toLowerCase(), [b.book]);
  }
  repo.translations.set(translation, map);
  repo.loadedTranslations.add(translation);
  repo.bookNames = books.map((b) => b.book); // canonical order for getAllBooks()
  repo.currentTranslation = translation;
}

function reset() {
  const repo = BibleRepository as unknown as RepoPrivate;
  repo.translations.clear();
  repo.loadedTranslations.clear();
  repo.bookAliases.clear();
  repo.bookNames = [];
  repo.currentTranslation = 'KJV';
}

class FakeBroadcastChannel {
  constructor(public name: string) {}
  postMessage() {}
  addEventListener() {}
  removeEventListener() {}
  close() {}
}

function seedCommitted(bookName: string, chapter: string, verse = '1', translation = 'KJV') {
  const passage: Passage = {
    reference: { book: bookName, chapter, verseStart: verse, translation },
    displayReference: `${bookName} ${chapter}:${verse}`,
    text: 'x',
    verses: [{ verse, text: 'x' }],
  };
  useStateManager.setState({
    committedPassage: passage,
    currentTranslation: translation,
    projectionQueue: [],
    currentSlideIndex: 0,
    liveSlideIndex: null,
    projectionLocked: false,
    isScreenBlanked: false,
    historyStack: [],
  });
}

const liveRef = () => useStateManager.getState().committedPassage?.reference;

beforeEach(() => {
  localStorage.clear();
  reset();
  install('KJV', [
    book('John', { '1': ['1', '2'], '2': ['1', '2'], '3': ['1', '2'] }),
    book('Acts', { '1': ['1', '2'] }),
  ]);
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
});

afterAll(() => {
  vi.unstubAllGlobals();
  reset();
});

describe('RI-010 / RI-011 — chapter & book navigation', () => {
  it('advances to the next chapter within a book', () => {
    seedCommitted('John', '1');
    useStateManager.getState().goToNextChapter();
    expect(liveRef()).toMatchObject({ book: 'John', chapter: '2', verseStart: '1' });
  });

  it('advancing past the last chapter crosses into the next book', () => {
    seedCommitted('John', '3');
    useStateManager.getState().goToNextChapter();
    expect(liveRef()).toMatchObject({ book: 'Acts', chapter: '1', verseStart: '1' });
  });

  it('goes back to the previous chapter within a book', () => {
    seedCommitted('John', '2');
    useStateManager.getState().goToPreviousChapter();
    expect(liveRef()).toMatchObject({ book: 'John', chapter: '1' });
  });

  it("going back past the first chapter crosses to the previous book's last chapter", () => {
    seedCommitted('Acts', '1');
    useStateManager.getState().goToPreviousChapter();
    expect(liveRef()).toMatchObject({ book: 'John', chapter: '3' });
  });

  it('next chapter at the very end of the last book is a no-op', () => {
    seedCommitted('Acts', '1');
    useStateManager.getState().goToNextChapter();
    expect(liveRef()).toMatchObject({ book: 'Acts', chapter: '1' });
  });

  it('previous chapter at the very start of the first book is a no-op', () => {
    seedCommitted('John', '1');
    useStateManager.getState().goToPreviousChapter();
    expect(liveRef()).toMatchObject({ book: 'John', chapter: '1' });
  });

  it('lands on the first verse of the new chapter and rebuilds the queue', () => {
    seedCommitted('John', '1');
    useStateManager.getState().goToNextChapter();
    const s = useStateManager.getState();
    expect(s.committedPassage?.reference).toMatchObject({ book: 'John', chapter: '2', verseStart: '1' });
    expect(s.projectionQueue[0]).toMatchObject({ book: 'John', chapter: '2' });
    expect(s.currentSlideIndex).toBe(0);
  });
});

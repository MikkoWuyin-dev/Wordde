import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BibleRepository } from '@/core/bibleRepository';
import type { BibleBook } from '@/core/types';

/**
 * These tests validate the position-based navigation model:
 * navigation resolves the current verse's index in the normalized
 * `Chapter.verses` array and moves by array position — never by
 * arithmetic over verse keys.
 */

const book = (name: string, chapters: Record<string, string[]>): BibleBook => ({
  book: name,
  chapters: Object.entries(chapters).map(([chapter, verses]) => ({
    chapter,
    verses: verses.map((v) => ({ verse: v, text: `${name} ${chapter}:${v} text` })),
  })),
});

/** Install fixture books into the repository's private stores. */
function installFixture(translation: string, books: BibleBook[], setCurrent = true) {
  const repo = BibleRepository as unknown as {
    translations: Map<string, Map<string, BibleBook>>;
    translationMetadata: Map<string, unknown>;
    loadedTranslations: Set<string>;
    bookNames: string[];
    bookAliases: Map<string, string>;
    currentTranslation: string;
  };
  const map = new Map<string, BibleBook>();
  for (const b of books) {
    map.set(b.book.toLowerCase(), b);
    repo.bookAliases.set(b.book.toLowerCase(), b.book);
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
    bookAliases: Map<string, string>;
  };
  repo.translations.clear();
  repo.loadedTranslations.clear();
  repo.bookNames = [];
  repo.bookAliases.clear();
}

describe('verse navigation (position-based)', () => {
  beforeEach(() => reset());

  it('A — walks normal sequential verses forwards and backwards', () => {
    installFixture('TEST', [book('John', { '3': ['1', '2', '3', '4'] })]);
    expect(BibleRepository.getNextVerse('John', '3', '1')?.verse).toBe('2');
    expect(BibleRepository.getNextVerse('John', '3', '2')?.verse).toBe('3');
    expect(BibleRepository.getNextVerse('John', '3', '3')?.verse).toBe('4');
    expect(BibleRepository.getPreviousVerse('John', '3', '4')?.verse).toBe('3');
    expect(BibleRepository.getPreviousVerse('John', '3', '3')?.verse).toBe('2');
    expect(BibleRepository.getPreviousVerse('John', '3', '2')?.verse).toBe('1');
  });

  it('B — walks lettered verse keys exactly as stored', () => {
    installFixture('TEST', [book('John', { '3': ['3', '3a', '3b', '4'] })]);
    expect(BibleRepository.getNextVerse('John', '3', '3')?.verse).toBe('3a');
    expect(BibleRepository.getNextVerse('John', '3', '3a')?.verse).toBe('3b');
    expect(BibleRepository.getNextVerse('John', '3', '3b')?.verse).toBe('4');
    expect(BibleRepository.getPreviousVerse('John', '3', '4')?.verse).toBe('3b');
    expect(BibleRepository.getPreviousVerse('John', '3', '3b')?.verse).toBe('3a');
    expect(BibleRepository.getPreviousVerse('John', '3', '3a')?.verse).toBe('3');
  });

  it('C — skips gaps in non-contiguous numeric keys', () => {
    installFixture('TEST', [book('John', { '3': ['1', '2', '4'] })]);
    expect(BibleRepository.getNextVerse('John', '3', '2')?.verse).toBe('4');
    expect(BibleRepository.getPreviousVerse('John', '3', '4')?.verse).toBe('2');
    expect(BibleRepository.getNextVerse('John', '3', '3')).toBeNull();
  });

  it('D — crosses chapter boundaries using array order', () => {
    installFixture('TEST', [book('John', { '1': ['1', '2'], '2': ['1', '2', '3'] })]);
    expect(BibleRepository.getNextVerse('John', '1', '2')).toMatchObject({ chapter: '2', verse: '1' });
    expect(BibleRepository.getPreviousVerse('John', '2', '1')).toMatchObject({ chapter: '1', verse: '2' });
  });

  it('E — crosses book boundaries using canonical book order', () => {
    installFixture('TEST', [
      book('Genesis', { '1': ['1', '2'] }),
      book('Exodus', { '1': ['1', '2'] }),
    ]);
    expect(BibleRepository.getNextVerse('Genesis', '1', '2')).toMatchObject({
      book: 'Exodus', chapter: '1', verse: '1',
    });
    expect(BibleRepository.getPreviousVerse('Exodus', '1', '1')).toMatchObject({
      book: 'Genesis', chapter: '1', verse: '2',
    });
    // Bible edges: no wraparound.
    expect(BibleRepository.getPreviousVerse('Genesis', '1', '1')).toBeNull();
    expect(BibleRepository.getNextVerse('Exodus', '1', '2')).toBeNull();
  });

  it('F — handles a lettered final verse at a chapter boundary', () => {
    installFixture('TEST', [book('John', { '1': ['1', '2', '3a'], '2': ['1'] })]);
    expect(BibleRepository.getNextVerse('John', '1', '3a')).toMatchObject({ chapter: '2', verse: '1' });
    expect(BibleRepository.getPreviousVerse('John', '2', '1')).toMatchObject({ chapter: '1', verse: '3a' });
  });

  it('G — fails safely when the current verse does not exist', () => {
    installFixture('TEST', [book('John', { '3': ['1', '2', '4'] })]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(BibleRepository.getNextVerse('John', '3', '99')).toBeNull();
    expect(BibleRepository.getPreviousVerse('John', '3', '99')).toBeNull();
    expect(BibleRepository.getNextVerse('John', '99', '1')).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('H — follows the active translation structure', () => {
    installFixture('TA', [book('John', { '3': ['3', '3a', '3b', '4'] })], true);
    installFixture('TB', [book('John', { '3': ['3', '4'] })], false);
    expect(BibleRepository.getNextVerse('John', '3', '3', 'TA')?.verse).toBe('3a');
    expect(BibleRepository.getNextVerse('John', '3', '3', 'TB')?.verse).toBe('4');
    expect(BibleRepository.getPreviousVerse('John', '3', '4', 'TB')?.verse).toBe('3');
  });
});

describe('queue extension uses position-based navigation', () => {
  beforeEach(() => reset());

  it('I — slideNext/slidePrevious extend the queue with the real adjacent verse', async () => {
    installFixture('TEST', [book('John', { '3': ['3', '3a', '3b', '4'] })]);
    const { useStateManager } = await import('@/core/stateManager');
    const store = useStateManager;
    store.setState({
      currentTranslation: 'TEST',
      projectionQueue: [
        { reference: 'John 3:3b', text: 'x', book: 'John', chapter: '3', verse: '3b' },
      ],
      currentSlideIndex: 0,
      liveSlideIndex: null,
      projectionLocked: false,
    });

    store.getState().slideNext();
    let s = store.getState();
    expect(s.projectionQueue[s.currentSlideIndex].verse).toBe('4');

    store.getState().slidePrevious();
    store.getState().slidePrevious();
    s = store.getState();
    expect(s.projectionQueue[s.currentSlideIndex].verse).toBe('3a');
  });
});

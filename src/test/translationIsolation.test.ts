import { describe, it, expect, beforeEach } from 'vitest';
import { BibleRepository } from '@/core/bibleRepository';
import type { BibleBook } from '@/core/types';

/**
 * RI-016  Translation data must not be cross-contaminated.
 * RI-014  No silent translation fallback.
 *
 * Two translations are installed with the SAME references but DIFFERENT text
 * and DIFFERENT verse structure. Reads for one translation must never return
 * the other's text ("label says NIV, text is KJV"), and a translation that
 * was never loaded must return empty/null rather than falling back.
 *
 * Uses the same private-store seam the verseNavigation suite uses, so no zip
 * fetch or normalizer round-trip is required.
 */

type RepoPrivate = {
  translations: Map<string, Map<string, BibleBook>>;
  translationMetadata: Map<string, unknown>;
  loadedTranslations: Set<string>;
  bookNames: string[];
  bookAliases: Map<string, string[]>;
  currentTranslation: string;
};

const book = (name: string, chapters: Record<string, string[]>, tag: string): BibleBook => ({
  book: name,
  chapters: Object.entries(chapters).map(([chapter, verses]) => ({
    chapter,
    verses: verses.map((v) => ({ verse: v, text: `${tag} ${name} ${chapter}:${v}` })),
  })),
});

function install(translation: string, books: BibleBook[], setCurrent = false) {
  const repo = BibleRepository as unknown as RepoPrivate;
  const map = new Map<string, BibleBook>();
  for (const b of books) {
    map.set(b.book.toLowerCase(), b);
    repo.bookAliases.set(b.book.toLowerCase(), [b.book]);
  }
  repo.translations.set(translation, map);
  repo.loadedTranslations.add(translation);
  // Merge canonical names (translations share the canon).
  repo.bookNames = Array.from(new Set([...repo.bookNames, ...books.map((b) => b.book)]));
  if (setCurrent) repo.currentTranslation = translation;
}

function reset() {
  const repo = BibleRepository as unknown as RepoPrivate;
  repo.translations.clear();
  repo.loadedTranslations.clear();
  repo.bookAliases.clear();
  repo.bookNames = [];
  repo.currentTranslation = 'KJV';
}

// TA carries lettered verses; TB does not — same book/chapter, divergent shape.
const TA = () => [book('John', { '3': ['1', '2', '3', '3a', '3b', '4'] }, 'A')];
const TB = () => [book('John', { '3': ['1', '2', '3', '4'] }, 'B')];

describe('RI-016 / RI-014 — translation isolation', () => {
  beforeEach(() => reset());

  it('returns each translation its own text for the same reference', () => {
    install('TA', TA());
    install('TB', TB());
    expect(BibleRepository.getVerse('John', '3', '1', 'TA')?.text).toBe('A John 3:1');
    expect(BibleRepository.getVerse('John', '3', '1', 'TB')?.text).toBe('B John 3:1');
  });

  it('loading a second translation does not overwrite the first', () => {
    install('TA', TA());
    expect(BibleRepository.getVerse('John', '3', '3', 'TA')?.text).toBe('A John 3:3');
    install('TB', TB()); // same references, different text
    expect(BibleRepository.getVerse('John', '3', '3', 'TA')?.text).toBe('A John 3:3'); // unchanged
    expect(BibleRepository.getVerse('John', '3', '3', 'TB')?.text).toBe('B John 3:3');
  });

  it('a not-loaded translation returns empty/null, never another translation\'s data', () => {
    install('TA', TA()); // only TA loaded
    expect(BibleRepository.getBook('John', 'TB')).toBeNull();
    expect(BibleRepository.getVerses('John', '3', 'TB')).toEqual([]);
    expect(BibleRepository.getVerse('John', '3', '1', 'TB')).toBeNull();
  });

  it('navigation follows the requested translation\'s own structure', () => {
    install('TA', TA());
    install('TB', TB());
    // TA has lettered verses between 3 and 4; TB goes straight to 4.
    expect(BibleRepository.getNextVerse('John', '3', '3', 'TA')?.verse).toBe('3a');
    expect(BibleRepository.getNextVerse('John', '3', '3', 'TB')?.verse).toBe('4');
    expect(BibleRepository.getPreviousVerse('John', '3', '4', 'TA')?.verse).toBe('3b');
    expect(BibleRepository.getPreviousVerse('John', '3', '4', 'TB')?.verse).toBe('3');
  });

  it('an explicit translation argument overrides the current-translation setting', () => {
    install('TA', TA());
    install('TB', TB(), true); // current = TB
    expect(BibleRepository.getCurrentTranslation()).toBe('TB');
    expect(BibleRepository.getVerse('John', '3', '1', 'TA')?.text).toBe('A John 3:1'); // explicit wins
    expect(BibleRepository.getVerse('John', '3', '1')?.text).toBe('B John 3:1'); // falls to current (TB), not a fallback
  });
});

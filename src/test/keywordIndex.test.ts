import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import JSZip from 'jszip';
import { BibleRepository } from '@/core/bibleRepository';

/**
 * Inverted keyword index (teardown §7 scaling recommendation) — correctness
 * contract: the index must return EXACTLY what the replaced linear scan
 * returned, in the same order. The linear scan matched a verse when ANY
 * query term (>2 chars) was a SUBSTRING of the verse's lowercase text, in
 * map-insertion traversal order (books in map order, chapters/verses in
 * array order), stopping at `limit`.
 *
 * The index must also never substitute another translation (RI-014): an
 * unloaded translation yields empty results.
 *
 * Verses are crafted to pin the subtle cases:
 *  - substring matching inside tokens ("love" matches "loved", "loves")
 *  - no cross-token matches ("vedthe" must NOT match "loved the")
 *  - verse keys include lettered ("3b") and non-contiguous ("16", "18") keys
 *  - multiple books/chapters to pin ordering
 */

type RepoPrivate = {
  translations: Map<string, unknown>;
  loadedTranslations: Set<string>;
  failedTranslations: Map<string, string>;
  keywordIndexes: Map<string, unknown>;
  translationMetadata: Map<string, unknown>;
  bookNames: string[];
  bookAliases: Map<string, string[]>;
};

function reset() {
  const r = BibleRepository as unknown as RepoPrivate;
  r.translations.clear();
  r.loadedTranslations.clear();
  r.failedTranslations.clear();
  r.keywordIndexes.clear();
  r.translationMetadata.clear();
  r.bookAliases.clear();
  r.bookNames = [];
}

async function makeZip(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    'books.json',
    JSON.stringify([
      {
        book: 'John',
        chapters: [
          {
            chapter: '3',
            verses: [
              { verse: '16', text: 'For God so loved the world that he gave his only Son' },
              { verse: '17', text: 'For God sent not his Son into the world to condemn the world' },
              { verse: '18', text: 'He that believeth on him is not condemned' },
              { verse: '3b', text: 'Whosoever believeth should not perish but have everlasting loved life' },
            ],
          },
        ],
      },
      {
        book: 'Psalms',
        chapters: [
          {
            chapter: '23',
            verses: [
              { verse: '1', text: 'The LORD is my shepherd I shall not want' },
              { verse: '2', text: 'He maketh me to lie down in green pastures of love' },
            ],
          },
        ],
      },
    ]),
  );
  return zip.generateAsync({ type: 'arraybuffer' });
}

/** Brute-force reference: exactly what the old linear scan returned (ANY-term union). */
function bruteForceKeywordSearch(
  books: {
    book: string;
    chapters: { chapter: string; verses: { verse: string; text: string }[] }[];
  }[],
  query: string,
  limit: number,
): { book: string; chapter: string; verse: string; text: string }[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  if (terms.length === 0) return [];
  const out: { book: string; chapter: string; verse: string; text: string }[] = [];
  for (const book of books) {
    for (const chapter of book.chapters) {
      for (const verse of chapter.verses) {
        const lower = verse.text.toLowerCase();
        if (terms.some((t) => lower.includes(t))) {
          out.push({ book: book.book, chapter: chapter.chapter, verse: verse.verse, text: verse.text });
          if (out.length >= limit) return out;
        }
      }
    }
  }
  return out;
}

let zipBuf: ArrayBuffer;

beforeEach(async () => {
  reset();
  zipBuf = await makeZip();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => zipBuf }) as unknown as Response));
});

afterEach(() => {
  vi.unstubAllGlobals();
  reset();
});

describe('inverted keyword index — equivalence with the replaced linear scan', () => {
  it('orders results by map insertion order (John before Psalms), replicating the scan', async () => {
    await BibleRepository.loadTranslation('KJV');
    // 'love' matches John 3:16, John 3:3b, then Psalms 23:2 — the fixture's
    // map insertion order, NOT the canonical 66-book order (where Psalms
    // precedes John). The old linear scan iterated booksMap.values(), so the
    // index must produce the same sequence.
    const results = BibleRepository.searchByKeyword('love', 20);
    expect(results.map((p) => `${p.reference.book} ${p.reference.chapter}:${p.reference.verseStart}`)).toEqual([
      'John 3:16',
      'John 3:3b',
      'Psalms 23:2',
    ]);
  });

  it('unions matches across terms instead of intersecting (scan semantics)', async () => {
    await BibleRepository.loadTranslation('KJV');
    // 'condemned' only in John 3:18; 'world' only in John 3:16/17. Union
    // returns all three; an intersection would return none.
    const results = BibleRepository.searchByKeyword('condemned world', 20);
    const refs = results.map((p) => `${p.reference.book} ${p.reference.chapter}:${p.reference.verseStart}`);
    expect(refs).toEqual(['John 3:16', 'John 3:17', 'John 3:18']);
  });

  const queries: { q: string; limit: number; why: string }[] = [
    { q: 'loved', limit: 20, why: 'substring inside tokens' },
    { q: 'love', limit: 20, why: 'short term matching several tokens' },
    { q: 'vedthe', limit: 20, why: 'cross-token sequence must not match' },
    { q: 'world condemned', limit: 20, why: 'two-term union across verses' },
    { q: 'believeth', limit: 2, why: 'limit truncation preserves order' },
    { q: 'shepherd of', limit: 20, why: 'terms matching different chapters' },
    { q: 'zzz', limit: 20, why: 'no matches' },
    { q: 'ab', limit: 20, why: 'term filtered out by length (>2 rule)' },
  ];

  for (const { q, limit, why } of queries) {
    it(`"${q}" (${why}) matches the brute-force reference exactly`, async () => {
      await BibleRepository.loadTranslation('KJV');
      const actual = BibleRepository.searchByKeyword(q, limit);
      const expected = bruteForceKeywordSearch(
        [
          {
            book: 'John',
            chapters: [
              {
                chapter: '3',
                verses: [
                  { verse: '16', text: 'For God so loved the world that he gave his only Son' },
                  { verse: '17', text: 'For God sent not his Son into the world to condemn the world' },
                  { verse: '18', text: 'He that believeth on him is not condemned' },
                  { verse: '3b', text: 'Whosoever believeth should not perish but have everlasting loved life' },
                ],
              },
            ],
          },
          {
            book: 'Psalms',
            chapters: [
              {
                chapter: '23',
                verses: [
                  { verse: '1', text: 'The LORD is my shepherd I shall not want' },
                  { verse: '2', text: 'He maketh me to lie down in green pastures of love' },
                ],
              },
            ],
          },
        ],
        q,
        limit,
      );
      expect(actual.map((p) => `${p.reference.book} ${p.reference.chapter}:${p.reference.verseStart}`)).toEqual(
        expected.map((e) => `${e.book} ${e.chapter}:${e.verse}`),
      );
    });
  }

  it('unloaded translation yields empty results — never another translation (RI-014)', async () => {
    await BibleRepository.loadTranslation('KJV');
    // NIV was never loaded; switch the active translation to it for real.
    BibleRepository.setCurrentTranslation('NIV');
    expect(BibleRepository.searchByKeyword('loved', 20)).toEqual([]);
    // Restore so later assertions/tests see KJV again.
    BibleRepository.setCurrentTranslation('KJV');
  });

  it('results are full passages resolvable through the normal pipeline', async () => {
    await BibleRepository.loadTranslation('KJV');
    const results = BibleRepository.searchByKeyword('loved', 20);
    expect(results.length).toBeGreaterThan(0);
    for (const p of results) {
      expect(p.displayReference).toBeTruthy();
      expect(p.verses.length).toBeGreaterThan(0);
      expect(p.text).toContain(p.verses[0].text.slice(0, 10));
    }
  });
});

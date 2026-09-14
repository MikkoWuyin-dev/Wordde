import { describe, it, expect } from 'vitest';
import { normalizeBibleJson } from '@/core/bibleNormalizer';

/**
 * bibleNormalizer is the single source-format boundary: it converts every
 * supported input shape into the canonical BibleBook and MUST NOT alter
 * scripture text. These tests lock down the P0 data-fidelity invariants:
 *
 *   RI-040  source verse text is preserved verbatim
 *   RI-041  normalization is deterministic
 *   RI-008  verse/chapter identifiers are opaque strings
 *
 * Ordering is exercised through the public output (numericKeyCompare is
 * internal). Real shipped data: KJV/NIV/NKJV are canonical; NLT/AMP are the
 * nested-object format and therefore the only shapes that get sorted here.
 */

// A verse text with every kind of whitespace the normalizer must not touch,
// modelled on real NLT/AMP data (which embeds \n line breaks and curly quotes).
const TRICKY_TEXT =
  '  Leading and trailing spaces  \nA new line, a\ttab, double  spaces, and \u201Ccurly quotes\u201D.\n';

describe('bibleNormalizer — canonical & array passthrough', () => {
  it('passes a canonical single-book object through unchanged', () => {
    const input = {
      book: 'John',
      chapters: [{ chapter: '3', verses: [{ verse: '16', text: 'For God so loved...' }] }],
    };
    const { books, metadata } = normalizeBibleJson(input);
    expect(books).toHaveLength(1);
    expect(books[0]).toBe(input); // identity: canonical data is not rebuilt
    expect(metadata).toEqual({});
  });

  it('accepts an array of canonical books and filters non-canonical entries', () => {
    const good = { book: 'Acts', chapters: [] };
    const input = [good, { notABook: true }, null, 'nope'];
    const { books } = normalizeBibleJson(input);
    expect(books).toEqual([good]);
  });
});

describe('bibleNormalizer — nested-object format (NLT/AMP shape)', () => {
  const nested = {
    Info: { Translation: 'NLT', Language: 'English' },
    James: {
      '1': { '1': 'This letter is from James...', '2': 'Dear brothers and sisters...' },
      '2': { '1': 'My dear brothers and sisters...' },
    },
  };

  it('converts nested book/chapter/verse objects to canonical shape', () => {
    const { books } = normalizeBibleJson(nested);
    expect(books).toHaveLength(1);
    expect(books[0].book).toBe('James');
    expect(books[0].chapters.map(c => c.chapter)).toEqual(['1', '2']);
    expect(books[0].chapters[0].verses).toEqual([
      { verse: '1', text: 'This letter is from James...' },
      { verse: '2', text: 'Dear brothers and sisters...' },
    ]);
  });

  it('extracts the Info block into metadata, never as a book', () => {
    const { books, metadata } = normalizeBibleJson(nested);
    expect(metadata).toMatchObject({ Translation: 'NLT', Language: 'English' });
    expect(books.some(b => b.book === 'Info')).toBe(false);
  });

  it('recognises info/metadata block keys as well as Info', () => {
    expect(normalizeBibleJson({ info: { Translation: 'X' }, B: { '1': { '1': 't' } } }).metadata)
      .toMatchObject({ Translation: 'X' });
    expect(normalizeBibleJson({ metadata: { Translation: 'Y' }, B: { '1': { '1': 't' } } }).metadata)
      .toMatchObject({ Translation: 'Y' });
  });

  it('keeps verse and chapter identifiers as strings (RI-008)', () => {
    const { books } = normalizeBibleJson(nested);
    for (const chapter of books[0].chapters) {
      expect(typeof chapter.chapter).toBe('string');
      for (const verse of chapter.verses) expect(typeof verse.verse).toBe('string');
    }
  });
});

describe('RI-040 — verse text is preserved verbatim', () => {
  it('preserves leading/trailing/internal whitespace, tabs and newlines', () => {
    const { books } = normalizeBibleJson({ B: { '1': { '1': TRICKY_TEXT } } });
    expect(books[0].chapters[0].verses[0].text).toBe(TRICKY_TEXT);
  });

  it('preserves canonical-format text byte-for-byte', () => {
    const input = { book: 'B', chapters: [{ chapter: '1', verses: [{ verse: '1', text: TRICKY_TEXT }] }] };
    expect(normalizeBibleJson(input).books[0].chapters[0].verses[0].text).toBe(TRICKY_TEXT);
  });

  it('preserves text when the verse value is an object with a text field', () => {
    const { books } = normalizeBibleJson({ B: { '1': { '1': { text: TRICKY_TEXT } } } });
    expect(books[0].chapters[0].verses[0].text).toBe(TRICKY_TEXT);
  });
});

describe('RI-041 — normalization is deterministic', () => {
  const input = {
    Info: { Translation: 'NLT' },
    Psalms: { '2': { '2': 'b', '1': 'a' }, '1': { '1': 'x' }, '10': { '1': 'z' } },
  };

  it('produces deep-equal output for repeated calls on the same input', () => {
    expect(normalizeBibleJson(input)).toEqual(normalizeBibleJson(input));
  });

  it('orders chapters and verses independent of input key order', () => {
    const { books } = normalizeBibleJson(input);
    expect(books[0].chapters.map(c => c.chapter)).toEqual(['1', '2', '10']);
    expect(books[0].chapters[1].verses.map(v => v.verse)).toEqual(['1', '2']);
  });
});

describe('numeric key ordering (observable, RI-041)', () => {
  it('sorts numeric chapter keys numerically, not lexically ("2" before "10")', () => {
    const { books } = normalizeBibleJson({
      B: { '10': { '1': 'a' }, '2': { '1': 'a' }, '1': { '1': 'a' } },
    });
    expect(books[0].chapters.map(c => c.chapter)).toEqual(['1', '2', '10']);
  });

  it('sorts numeric verse keys numerically', () => {
    const { books } = normalizeBibleJson({
      B: { '1': { '10': 'j', '2': 'b', '1': 'a' } },
    });
    expect(books[0].chapters[0].verses.map(v => v.verse)).toEqual(['1', '2', '10']);
  });
});

describe('bibleNormalizer — shape detection & safety', () => {
  it('returns an empty result for null or primitive input', () => {
    for (const bad of [null, undefined, 42, 'text', true]) {
      expect(normalizeBibleJson(bad as unknown)).toEqual({ books: [], metadata: {} });
    }
  });

  it('returns empty books for an empty object', () => {
    expect(normalizeBibleJson({}).books).toEqual([]);
  });

  it('gives a nested chapter with a non-object value an empty verses array', () => {
    const { books } = normalizeBibleJson({ B: { '1': 'not-an-object' } });
    expect(books[0].chapters[0]).toEqual({ chapter: '1', verses: [] });
  });
});

describe('canonical book names across source formats', () => {
  it('canonicalizes the nested-format "Psalm" key to "Psalms" (NKJV/NLT/AMP shape)', () => {
    // Real shipped divergence: NKJV/NLT/AMP key the book "Psalm"; the
    // canonical spellings (KJV/NIV `book` fields, Browse's list, the
    // repository's canonical order) say "Psalms". Left alone, this made
    // the book vanish from Browse whenever a nested-format translation
    // seeded the canonical order first.
    const { books } = normalizeBibleJson({
      Info: { Copyright: 'x' },
      Psalm: { '23': { '1': 'The LORD is my shepherd' } },
    });
    expect(books).toHaveLength(1);
    expect(books[0].book).toBe('Psalms');
    expect(books[0].chapters[0].chapter).toBe('23');
    expect(books[0].chapters[0].verses[0]).toEqual({ verse: '1', text: 'The LORD is my shepherd' });
  });

  it('canonicalizes the book field of canonical-shaped files too, preserving identity when already canonical', () => {
    const renamed = normalizeBibleJson({ book: 'Psalm', chapters: [{ chapter: '1', verses: [{ verse: '1', text: 'x' }] }] });
    expect(renamed.books[0].book).toBe('Psalms');

    // Already-canonical KJV/NIV data passes through untouched (same object).
    const canonical = { book: 'Psalms', chapters: [{ chapter: '1', verses: [{ verse: '1', text: 'x' }] }] };
    const { books } = normalizeBibleJson(canonical);
    expect(books[0]).toBe(canonical); // identity preserved: no rebuild
  });

  it('canonicalizes names in an array of canonical books', () => {
    const { books } = normalizeBibleJson([
      { book: 'Psalm', chapters: [] },
      { book: 'John', chapters: [] },
    ]);
    expect(books.map((b) => b.book)).toEqual(['Psalms', 'John']);
  });

  it('leaves every non-divergent name untouched — no case-mangling of scripture metadata', () => {
    const { books } = normalizeBibleJson({ JAMES: { '1': { '1': 'x' } } });
    expect(books[0].book).toBe('JAMES'); // source spelling wins unless it is a known divergence
  });
});

describe('RI-008 — lettered verse ordering in the nested-object format', () => {
  it('places lettered verses in reading order: 3, 3a, 3b, 4 (nested format)', () => {
    const { books } = normalizeBibleJson({ B: { '3': { '4': 'd', '3': 'c', '3a': 'ca', '3b': 'cb' } } });
    expect(books[0].chapters[0].verses.map((v) => v.verse)).toEqual(['3', '3a', '3b', '4']);
  });

  it('sorts numeric-prefixed keys before purely alphabetic ones', () => {
    const { books } = normalizeBibleJson({ B: { '1': { intro: 'x', '1': 'a', '2': 'b' } } });
    expect(books[0].chapters[0].verses.map((v) => v.verse)).toEqual(['1', '2', 'intro']);
  });
});

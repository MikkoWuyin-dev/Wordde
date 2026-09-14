// Wordde - Data Normalization Layer
// Converts arbitrary incoming Bible JSON into the canonical BibleBook format.
//
// Canonical format (do not change):
//   BibleBook  { book: string,    chapters: Chapter[] }
//   Chapter    { chapter: string, verses:   Verse[]   }
//   Verse      { verse:   string, text:     string    }
//
// Supported input shapes:
//   1. Canonical (already correct):
//        { "book": "John", "chapters": [ { "chapter": "1", "verses": [...] } ] }
//
//   2. Nested-object (new format), one or many books per file, plus optional metadata:
//        {
//          "Info": { "translation": "NLT", "language": "en", ... },
//          "John": {
//            "1": { "1": "In the beginning was the Word...", "2": "..." },
//            "2": { ... }
//          },
//          "Acts": { ... }
//        }
//
// Downstream code (search, projection, browse) MUST only ever see canonical data.
// All format detection lives here and nowhere else. Canonical data includes the
// canonical BOOK NAME list (the 66-book spellings used by Browse, search, recents,
// and ServicePlan): source datasets that name a book differently are canonicalized
// here, once, at load time.

import type { BibleBook, Chapter, Verse } from './types';

export interface TranslationMetadata {
  translation?: string;
  language?: string;
  [key: string]: unknown;
}

export interface NormalizedBibleFile {
  books: BibleBook[];
  metadata: TranslationMetadata;
}

/**
 * Split a key into a leading integer and a suffix, e.g. "3a" -> { num: 3, rest: "a" }.
 * Keys with no leading digit -> { num: null, rest: key }.
 */
function parseKey(key: string): { num: number | null; rest: string } {
  const m = /^(\d+)(.*)$/.exec(key);
  return m ? { num: parseInt(m[1], 10), rest: m[2] } : { num: null, rest: key };
}

/**
 * Natural-order comparison for verse/chapter keys. Numeric-prefixed keys sort
 * by their number and then by any suffix, so lettered verses interleave in
 * reading order (3, 3a, 3b, 4) instead of being pushed after every numeric key.
 * Numeric-prefixed keys sort before pure-alphabetic ones (RI-008 / RI-041).
 */
function numericKeyCompare(a: string, b: string): number {
  const pa = parseKey(a);
  const pb = parseKey(b);
  if (pa.num !== null && pb.num !== null) {
    return pa.num !== pb.num ? pa.num - pb.num : pa.rest.localeCompare(pb.rest);
  }
  if (pa.num !== null) return -1;
  if (pb.num !== null) return 1;
  return a.localeCompare(b);
}

/** Type guard: detects the canonical `{ book, chapters: [...] }` shape. */
function isCanonicalBook(value: unknown): value is BibleBook {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.book === 'string' && Array.isArray(v.chapters);
}

/**
 * Canonical book-name mapping for source datasets that name a book differently
 * from the app's canonical 66-book spellings. Known divergence in the shipped
 * data: the nested-object translations (NKJV/NLT/AMP) key the Book of Psalms
 * "Psalm" while the canonical shape (KJV/NIV) says "Psalms". Everything
 * downstream keys books by this name (bookNames, aliases, Browse's filter), and
 * the canonical order is seeded by whichever translation loads first — so an
 * un-canonicalized "Psalm" makes the book vanish from Browse depending on a
 * load race, and resolves to null for reference lookups in the other
 * translations. Case-insensitive; every other name passes through untouched.
 */
function canonicalizeBookName(rawName: string): string {
  return rawName.trim().toLowerCase() === 'psalm' ? 'Psalms' : rawName;
}

/**
 * Canonicalize the `book` field of an already-canonical-shaped book. Returns
 * the SAME object when the name is already canonical (passthrough identity is
 * preserved); otherwise a shallow copy with only the name corrected —
 * chapters, verses, and verse text are never touched (VF-001).
 */
function canonicalizeCanonicalBook(book: BibleBook): BibleBook {
  const canonical = canonicalizeBookName(book.book);
  return canonical === book.book ? book : { ...book, book: canonical };
}

/** Convert one nested-object book into the canonical BibleBook shape. */
function normalizeNestedBook(
  bookName: string,
  rawChapters: Record<string, unknown>,
): BibleBook {
  const chapterKeys = Object.keys(rawChapters).sort(numericKeyCompare);

  const chapters: Chapter[] = chapterKeys.map((chapterKey) => {
    const rawVerses = rawChapters[chapterKey];
    if (!rawVerses || typeof rawVerses !== 'object') {
      return { chapter: chapterKey, verses: [] };
    }

    const verseObj = rawVerses as Record<string, unknown>;
    const verseKeys = Object.keys(verseObj).sort(numericKeyCompare);

    const verses: Verse[] = verseKeys.map((verseKey) => {
      const raw = verseObj[verseKey];
      // Preserve text exactly as provided — no trimming, no whitespace
      // collapsing, no line-break stripping.
      const text =
        typeof raw === 'string'
          ? raw
          : raw && typeof raw === 'object' && typeof (raw as { text?: unknown }).text === 'string'
            ? (raw as { text: string }).text
            : String(raw ?? '');

      return { verse: verseKey, text };
    });

    return { chapter: chapterKey, verses };
  });

  return { book: bookName, chapters };
}

/**
 * Public entry point. Accepts any supported input shape and returns
 * canonical books + extracted translation metadata.
 *
 * Runs ONCE at load time per JSON file. Downstream systems never see the raw input.
 */
export function normalizeBibleJson(raw: unknown): NormalizedBibleFile {
  // Case A: already canonical (single book file, current KJV/NIV shape)
  if (isCanonicalBook(raw)) {
    return { books: [canonicalizeCanonicalBook(raw)], metadata: {} };
  }

  // Case B: array of canonical books
  if (Array.isArray(raw)) {
    const books = raw.filter(isCanonicalBook).map(canonicalizeCanonicalBook);
    return { books, metadata: {} };
  }

  if (!raw || typeof raw !== 'object') {
    return { books: [], metadata: {} };
  }

  // Case C: nested-object format with dynamic book keys + optional Info
  const root = raw as Record<string, unknown>;
  const metadata: TranslationMetadata = {};
  const books: BibleBook[] = [];

  for (const key of Object.keys(root)) {
    const value = root[key];

    // Metadata block — extracted separately, never merged into books.
    if (key === 'Info' || key === 'info' || key === 'metadata') {
      if (value && typeof value === 'object') {
        Object.assign(metadata, value as Record<string, unknown>);
      }
      continue;
    }

    // A canonical book embedded under a wrapper key
    if (isCanonicalBook(value)) {
      books.push(canonicalizeCanonicalBook(value));
      continue;
    }

    // Nested-object book: key is book name, value is { chapter: { verse: text } }.
    // The key IS the book name in this shape, so it must pass through
    // name canonicalization — there is no `book` field to correct later.
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      books.push(normalizeNestedBook(canonicalizeBookName(key), value as Record<string, unknown>));
    }
  }

  return { books, metadata };
}

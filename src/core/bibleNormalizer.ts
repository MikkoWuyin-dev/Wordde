// Bible Projection App - Data Normalization Layer
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
// All format detection lives here and nowhere else.

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
 * Numeric comparator for keys that should be numeric (chapter / verse).
 * Falls back to lexical comparison if either side is non-numeric (e.g. "3a").
 * This is what guarantees "10" sorts after "9", not after "1".
 */
function numericKeyCompare(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  const aNum = Number.isFinite(na);
  const bNum = Number.isFinite(nb);
  if (aNum && bNum) return na - nb;
  if (aNum) return -1;
  if (bNum) return 1;
  return a.localeCompare(b);
}

/** Type guard: detects the canonical `{ book, chapters: [...] }` shape. */
function isCanonicalBook(value: unknown): value is BibleBook {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.book === 'string' && Array.isArray(v.chapters);
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
    return { books: [raw], metadata: {} };
  }

  // Case B: array of canonical books
  if (Array.isArray(raw)) {
    const books = raw.filter(isCanonicalBook);
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
      books.push(value);
      continue;
    }

    // Nested-object book: key is book name, value is { chapter: { verse: text } }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      books.push(normalizeNestedBook(key, value as Record<string, unknown>));
    }
  }

  return { books, metadata };
}

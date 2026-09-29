// Wordde - Bible translation cache (IndexedDB)
//
// Caches the PARSED (normalized, deduplicated) form of each translation so a
// second boot skips fetch + JSZip + JSON parse entirely (teardown §7/§10
// improvement #4: "persist parsed translations in IndexedDB so subsequent
// boots skip fetch + decode").
//
// Fidelity: the canonical model is pure strings (Verse/Chapter/BibleBook), so
// the IndexedDB structured clone is lossless — verbatim scripture text
// survives the round-trip byte-for-byte (VF-001/RI-040).
//
// Untrusted-input discipline: everything read back is validated before use
// (RI-023) — a malformed or partially-written record is rejected (null), and
// boot falls through to the decode tiers. All writes are best-effort and
// never throw into the caller (RI-022 discipline, like safeStorage).

import type { BibleBook, Chapter, Verse } from './types';
import type { TranslationMetadata } from './bibleNormalizer';

const DB_NAME = 'bible_translation_cache';
const DB_VERSION = 1;
const STORE = 'translations';

/** What loadTranslation consumes from any decode tier. */
export interface ParsedTranslation {
  booksMap: Map<string, BibleBook>;
  metadata: TranslationMetadata;
}

interface CachedTranslationRecord {
  code: string;
  books: BibleBook[];
  metadata: TranslationMetadata;
  cachedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'code' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// --- Validation (RI-023: persisted state is untrusted input) ---

function isVerse(v: unknown): v is Verse {
  if (!v || typeof v !== 'object') return false;
  const rec = v as Record<string, unknown>;
  return typeof rec.verse === 'string' && typeof rec.text === 'string';
}

function isChapter(c: unknown): c is Chapter {
  if (!c || typeof c !== 'object') return false;
  const rec = c as Record<string, unknown>;
  return typeof rec.chapter === 'string' && Array.isArray(rec.verses) && rec.verses.every(isVerse);
}

function isBibleBook(b: unknown): b is BibleBook {
  if (!b || typeof b !== 'object') return false;
  const rec = b as Record<string, unknown>;
  return typeof rec.book === 'string' && rec.book.length > 0 && Array.isArray(rec.chapters) && rec.chapters.every(isChapter);
}

/**
 * Validate a record read from IndexedDB. Returns null when anything is
 * malformed — a whole-record reject (not per-book filtering) keeps the cache
 * honest: doubtful data is re-decoded from source instead of half-trusted.
 */
export function validateCachedRecord(raw: unknown): CachedTranslationRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.code !== 'string' || !rec.code) return null;
  if (!Array.isArray(rec.books) || rec.books.length === 0) return null;
  if (!rec.books.every(isBibleBook)) return null;
  if (!rec.metadata || typeof rec.metadata !== 'object') return null;
  if (typeof rec.cachedAt !== 'number') return null;
  return {
    code: rec.code,
    books: rec.books as BibleBook[],
    metadata: rec.metadata as TranslationMetadata,
    cachedAt: rec.cachedAt,
  };
}

/**
 * Rebuild the booksMap from a validated record's array, preserving insertion
 * order (canonical traversal order depends on it) and applying the same
 * keep-first duplicate rule as the decoders.
 */
export function booksArrayToMap(books: BibleBook[]): Map<string, BibleBook> {
  const map = new Map<string, BibleBook>();
  for (const book of books) {
    const key = book.book.toLowerCase();
    if (map.has(key)) continue; // keep-first duplicates, matching loadTranslation
    map.set(key, book);
  }
  return map;
}

/** Best-effort cache write. Never throws; returns false on any failure. */
export async function saveCachedTranslation(
  code: string,
  booksMap: Map<string, BibleBook>,
  metadata: TranslationMetadata,
): Promise<boolean> {
  try {
    const db = await openDb();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const record: CachedTranslationRecord = {
        code,
        books: [...booksMap.values()],
        metadata,
        cachedAt: Date.now(),
      };
      const req = tx.objectStore(STORE).put(record);
      req.onsuccess = () => resolve(true);
      req.onerror = () => {
        console.warn(`[bibleCache] Failed to cache "${code}":`, req.error);
        resolve(false);
      };
      tx.oncomplete = () => db.close();
    });
  } catch (error) {
    console.warn(`[bibleCache] Failed to cache "${code}":`, error);
    return false;
  }
}

/**
 * Read a cached translation. Resolves null on miss/failure/invalid record —
 * callers fall through to the decode tiers. Never throws.
 */
export async function loadCachedTranslation(code: string): Promise<ParsedTranslation | null> {
  try {
    const db = await openDb();
    const record = await new Promise<CachedTranslationRecord | null>((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(code);
      req.onsuccess = () => resolve((req.result as CachedTranslationRecord | undefined) ?? null);
      req.onerror = () => {
        console.warn(`[bibleCache] Failed to read "${code}":`, req.error);
        resolve(null);
      };
      tx.oncomplete = () => db.close();
    });
    if (!record) return null;
    const valid = validateCachedRecord(record);
    if (!valid) {
      console.warn(`[bibleCache] Cached record for "${code}" failed validation; ignoring.`);
      return null;
    }
    return { booksMap: booksArrayToMap(valid.books), metadata: valid.metadata };
  } catch (error) {
    // No IndexedDB (private mode, quota) is a normal condition, not an error.
    console.warn(`[bibleCache] Cache unavailable for "${code}":`, error);
    return null;
  }
}

/** Drop the whole translation cache (kept for diagnosability/support). */
export async function clearTranslationCache(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch (error) {
    console.warn('[bibleCache] Failed to clear cache:', error);
  }
}

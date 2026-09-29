import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import JSZip from 'jszip';
import { BibleRepository } from '@/core/bibleRepository';
import {
  CACHE_DATA_VERSION,
  loadCachedTranslation,
  saveCachedTranslation,
} from '@/core/bibleCache';

/**
 * Integration test — the real (unmocked) bibleCache module against a real
 * IndexedDB implementation, via fake-indexeddb.
 *
 * jsdom has no IndexedDB, so every other suite exercises the guarded
 * no-op path. This file installs fake-indexeddb and closes the gap the
 * Teardown §8 failure table records: the round-trip through a REAL
 * database (open → put → get → structuredClone) was only ever verified
 * manually in the browser.
 *
 * The contract proven here, end to end:
 *   1. A LEGACY record — structurally valid but written by the
 *      pre-versioning writer, so it carries NO dataVersion stamp — sits in
 *      the store unchanged.
 *   2. loadCachedTranslation REJECTS it (the CACHE_DATA_VERSION gate, not
 *      structural validation — the record is otherwise well-formed).
 *   3. BibleRepository.loadTranslation therefore falls through to decode,
 *      and OVERWRITES the legacy record with a current-stamped one.
 *   4. The new record is then genuinely SERVED from the database: a fresh
 *      repository boot uses it without re-decoding (fetch never called),
 *      with byte-identical verse text, and a cache hit does not re-write
 *      the record (cachedAt unchanged).
 *
 * The store/DB names are pinned as literals on purpose: if they ever
 * change, existing users' caches are silently orphaned — this test should
 * fail loudly when that happens.
 */

const DB_NAME = 'bible_translation_cache';
const STORE = 'translations';

/** Open the same DB the module opens, for raw out-of-band writes/reads. */
function openRaw(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'code' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Write a record directly into the store, bypassing the module entirely —
 * this is how a legacy record "survives" from an older app version. */
async function rawPut(record: unknown): Promise<void> {
  const db = await openRaw();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function rawGet(code: string): Promise<unknown> {
  const db = await openRaw();
  const result = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(code);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

type RepoPrivate = {
  translations: Map<string, unknown>;
  loadedTranslations: Set<string>;
  failedTranslations: Map<string, string>;
  keywordIndexes: Map<string, unknown>;
  translationMetadata: Map<string, unknown>;
  bookNames: string[];
  bookAliases: Map<string, string[]>;
  currentTranslation: string;
};

function resetRepo() {
  const r = BibleRepository as unknown as RepoPrivate;
  r.translations.clear();
  r.loadedTranslations.clear();
  r.failedTranslations.clear();
  r.keywordIndexes.clear();
  r.translationMetadata.clear();
  r.bookAliases.clear();
  r.bookNames = [];
}

async function makeValidZip(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    'John.json',
    JSON.stringify({
      book: 'John',
      chapters: [{ chapter: '3', verses: [{ verse: '16', text: 'For God so loved the world' }] }],
    }),
  );
  return zip.generateAsync({ type: 'arraybuffer' });
}

/** A structurally VALID record in the pre-versioning shape: every field
 * validateCachedRecord requires EXCEPT the dataVersion stamp. */
function legacyRecord(): Record<string, unknown> {
  return {
    code: 'KJV',
    books: [
      {
        book: 'John',
        chapters: [{ chapter: '3', verses: [{ verse: '16', text: 'LEGACY STALE TEXT' }] }],
      },
    ],
    metadata: {},
    cachedAt: 1111111111111,
  };
}

beforeEach(() => {
  // Fresh database per test — no cross-test state through the store.
  globalThis.indexedDB = new IDBFactory();
  resetRepo();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetRepo();
});

describe('bibleCache against a real IndexedDB (fake-indexeddb)', () => {
  it('round-trips a record: save persists, load returns identical books and metadata', async () => {
    const booksMap = new Map([
      ['john', { book: 'John', chapters: [{ chapter: '3', verses: [{ verse: '16', text: 'For God so loved the world' }] }] }],
    ]);
    await expect(saveCachedTranslation('KJV', booksMap, { translation: 'KJV' })).resolves.toBe(true);

    const loaded = await loadCachedTranslation('KJV');
    expect(loaded).not.toBeNull();
    expect([...loaded!.booksMap.keys()]).toEqual(['john']);
    expect(loaded!.booksMap.get('john')!.chapters[0].verses[0].text).toBe('For God so loved the world');
    expect(loaded!.metadata).toEqual({ translation: 'KJV' });

    // The persisted record carries the current stamp.
    const stored = (await rawGet('KJV')) as Record<string, unknown>;
    expect(stored.dataVersion).toBe(CACHE_DATA_VERSION);
  });

  it('rejects a legacy un-stamped record at load (the version gate, not structure)', async () => {
    await rawPut(legacyRecord());

    const loaded = await loadCachedTranslation('KJV');
    expect(loaded).toBeNull();

    // And the legacy record is still verifiably the reason: the same shape
    // WITH the current stamp would have been accepted.
    const withStamp = { ...legacyRecord(), dataVersion: CACHE_DATA_VERSION };
    await rawPut(withStamp);
    expect(await loadCachedTranslation('KJV')).not.toBeNull();
  });

  it('end to end: legacy record is ignored, decode overwrites it, cache serves the next boot', async () => {
    // 1. A stale legacy record sits in a real database.
    await rawPut(legacyRecord());

    // 2. Boot: decode via the main-thread tier (jsdom has no Worker) after
    //    the version gate rejects the legacy record.
    let zip: ArrayBuffer;
    zip = await makeValidZip();
    const fetchMock = vi.fn(async () => ({ ok: true, arrayBuffer: async () => zip }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    await BibleRepository.loadTranslation('KJV');
    expect(BibleRepository.getVerse('John', '3', '16', 'KJV')?.text).toBe('For God so loved the world');

    // 3. The legacy record was overwritten with a current-stamped one.
    const stored = (await rawGet('KJV')) as Record<string, unknown>;
    expect(stored.dataVersion).toBe(CACHE_DATA_VERSION);
    expect(stored.cachedAt).not.toBe(1111111111111);
    const storedBooks = stored.books as { chapters: { verses: { text: string }[] }[] }[];
    expect(storedBooks[0].chapters[0].verses[0].text).toBe('For God so loved the world'); // legacy text gone

    // 4. A fresh repository boot is SERVED by that record: no re-decode.
    resetRepo();
    await BibleRepository.loadTranslation('KJV');
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the first boot fetched
    expect(BibleRepository.getVerse('John', '3', '16', 'KJV')?.text).toBe('For God so loved the world');

    // 5. A cache hit does not re-write the record.
    const afterHit = (await rawGet('KJV')) as Record<string, unknown>;
    expect(afterHit.cachedAt).toBe(stored.cachedAt);
  });
});

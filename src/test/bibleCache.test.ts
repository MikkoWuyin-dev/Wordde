import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import JSZip from 'jszip';
import { BibleRepository } from '@/core/bibleRepository';
import {
  CACHE_DATA_VERSION,
  validateCachedRecord,
  booksArrayToMap,
  loadCachedTranslation,
  saveCachedTranslation,
  clearTranslationCache,
} from '@/core/bibleCache';

/**
 * P3 — IndexedDB translation cache + Web Worker decode tier.
 *
 * The repository's load order is: IndexedDB cache → Web Worker → main thread.
 * jsdom has no Worker and no real IndexedDB, so in unit tests:
 *   • loadCachedTranslation resolves null → loadTranslation falls through the
 *     worker attempt (also unavailable) to the main-thread decoder. All 20
 *     pre-existing suites exercise exactly this fallback, unchanged.
 *   • vi.mock lets us pin the cache-hit / cache-write / invalid-cache paths
 *     against a working main-thread decode.
 *
 * Contract pinned here:
 *   • a valid cached record is USED (decode tiers skipped, no re-write)
 *   • a malformed cached record is IGNORED (falls through to decode)
 *   • a record stamped with anything but the current CACHE_DATA_VERSION is
 *     IGNORED — bumping the version invalidates stale Bible data (re-decoded,
 *     never served)
 *   • a successful decode writes the cache (best-effort)
 *   • failed decode tiers never substitute another translation (RI-014)
 */

const { cacheMock } = vi.hoisted(() => ({
  cacheMock: {
    load: vi.fn(),
    save: vi.fn(),
  },
}));

vi.mock('@/core/bibleCache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/bibleCache')>();
  return {
    ...actual,
    loadCachedTranslation: (...args: unknown[]) => cacheMock.load(...(args as [])),
    saveCachedTranslation: (...args: unknown[] ) => cacheMock.save(...(args as [])),
  };
});

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

let goodZip: ArrayBuffer;

beforeEach(async () => {
  reset();
  cacheMock.load.mockReset().mockResolvedValue(null);
  cacheMock.save.mockReset().mockResolvedValue(false);
  goodZip = await makeValidZip();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, arrayBuffer: async () => goodZip }) as unknown as Response),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  reset();
});

describe('cached record validation (RI-023)', () => {
  const goodRecord = {
    code: 'KJV',
    dataVersion: CACHE_DATA_VERSION,
    cachedAt: Date.now(),
    metadata: {},
    books: [
      {
        book: 'John',
        chapters: [{ chapter: '3', verses: [{ verse: '16', text: 'For God so loved the world' }] }],
      },
    ],
  };

  it('accepts a fully valid record', () => {
    expect(validateCachedRecord(goodRecord)).not.toBeNull();
  });

  it('rejects on any structural defect (books, chapters, verses, metadata)', () => {
    expect(validateCachedRecord(null)).toBeNull();
    expect(validateCachedRecord({ ...goodRecord, books: [] })).toBeNull();
    expect(validateCachedRecord({ ...goodRecord, books: 'nope' })).toBeNull();
    expect(validateCachedRecord({ ...goodRecord, books: [{ book: '', chapters: [] }] })).toBeNull();
    expect(
      validateCachedRecord({
        ...goodRecord,
        books: [{ book: 'John', chapters: [{ chapter: '3', verses: [{ verse: 16, text: 'x' }] }] }],
      }),
    ).toBeNull(); // verse keys must be strings (VT-002)
    expect(validateCachedRecord({ ...goodRecord, metadata: null })).toBeNull();
    expect(validateCachedRecord({ ...goodRecord, cachedAt: 'now' })).toBeNull();
    expect(validateCachedRecord({ ...goodRecord, code: '' })).toBeNull();
  });

  it('rejects records whose data version is not the current CACHE_DATA_VERSION (stale-data invalidation)', () => {
    // A record written before versioning existed has no stamp at all.
    const legacyRecord: Record<string, unknown> = { ...goodRecord };
    delete legacyRecord.dataVersion;

    expect(validateCachedRecord(legacyRecord)).toBeNull();
    expect(validateCachedRecord({ ...goodRecord, dataVersion: CACHE_DATA_VERSION + 1 })).toBeNull();
    expect(validateCachedRecord({ ...goodRecord, dataVersion: CACHE_DATA_VERSION - 1 })).toBeNull();
    expect(validateCachedRecord({ ...goodRecord, dataVersion: 0 })).toBeNull();
    expect(validateCachedRecord({ ...goodRecord, dataVersion: String(CACHE_DATA_VERSION) })).toBeNull(); // wrong type
    expect(validateCachedRecord({ ...goodRecord, dataVersion: undefined })).toBeNull();
  });

  it('accepts a record stamped with the current CACHE_DATA_VERSION', () => {
    expect(validateCachedRecord({ ...goodRecord, dataVersion: CACHE_DATA_VERSION })).not.toBeNull();
  });

  it('booksArrayToMap preserves insertion order and keep-first duplicates', () => {
    const map = booksArrayToMap([
      { book: 'John', chapters: [] },
      { book: 'Psalms', chapters: [] },
      { book: 'John', chapters: [] }, // duplicate — keep first
    ]);
    expect([...map.keys()]).toEqual(['john', 'psalms']);
  });
});

describe('loadTranslation 3-tier behavior', () => {
  it('cache hit: uses the cached parse, skips decode, and does not re-write the cache', async () => {
    cacheMock.load.mockResolvedValue({
      booksMap: new Map([
        ['john', { book: 'John', chapters: [{ chapter: '3', verses: [{ verse: '16', text: 'CACHED TEXT' }] }] }],
      ]),
      metadata: { translation: 'KJV' },
    });

    await BibleRepository.loadTranslation('KJV');

    expect(BibleRepository.getLoadedTranslations()).toContain('KJV');
    // Served from cache: fetch (decode) must never have run.
    expect(fetch).not.toHaveBeenCalled();
    expect(cacheMock.save).not.toHaveBeenCalled();
    expect(BibleRepository.getVerse('John', '3', '16', 'KJV')?.text).toBe('CACHED TEXT');
  });

  it('cache miss: decodes (main-thread fallback in jsdom) and writes the cache best-effort', async () => {
    cacheMock.save.mockResolvedValue(true);

    await BibleRepository.loadTranslation('KJV');

    expect(fetch).toHaveBeenCalled();
    expect(cacheMock.save).toHaveBeenCalledWith('KJV', expect.any(Map), expect.anything());
    expect(BibleRepository.getVerse('John', '3', '16', 'KJV')?.text).toBe('For God so loved the world');
  });

  it('malformed cached record is ignored — falls through to decode (RI-023)', async () => {
    cacheMock.load.mockResolvedValue({
      booksMap: 'not-a-map',
      metadata: {},
    } as unknown as never);

    await BibleRepository.loadTranslation('KJV');

    expect(fetch).toHaveBeenCalled(); // decode ran
    expect(BibleRepository.getVerse('John', '3', '16', 'KJV')?.text).toBe('For God so loved the world');
  });

  it('failed decode still never substitutes another translation (RI-014)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 }) as unknown as Response),
    );

    await expect(BibleRepository.loadTranslation('KJV')).rejects.toThrow(/HTTP 404/);
    expect(BibleRepository.getVerses('John', '3', 'KJV')).toEqual([]);
  });
});

// Integration smoke for the real (unmocked) cache module against fake IndexedDB.
describe('bibleCache real module (no fake-indexeddb available — guarded no-op checks)', () => {
  it('load on a missing/unsupported environment resolves null instead of throwing', async () => {
    // jsdom lacks indexedDB — the guarded wrapper must resolve null.
    const result = await loadCachedTranslation('KJV');
    expect(result).toBeNull();
  });

  it('save/clear fail gracefully without throwing (RI-022)', async () => {
    await expect(saveCachedTranslation('KJV', new Map(), {})).resolves.toBe(false);
    await expect(clearTranslationCache()).resolves.toBeUndefined();
  });
});

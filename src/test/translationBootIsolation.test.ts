import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import JSZip from 'jszip';
import { BibleRepository } from '@/core/bibleRepository';

/**
 * RI-043 — non-critical failure isolation, applied to translation boot.
 * RI-014 — no silent fallback.
 *
 * One translation zip failing to load (missing file, HTTP error, corrupt data)
 * must NOT prevent the other translations from loading. The failed translation
 * simply stays unavailable — reads for it return empty, never another
 * translation's data.
 *
 * Ships with the R2 fix. Against the current Promise.all preload this FAILS
 * (one rejection rejects the whole preload); it passes once preload isolates
 * per-translation failures.
 *
 * fetch is stubbed: every translation gets a valid in-memory zip except NKJV,
 * which 404s.
 */

type RepoPrivate = {
  translations: Map<string, unknown>;
  loadedTranslations: Set<string>;
  translationMetadata: Map<string, unknown>;
  bookNames: string[];
  bookAliases: Map<string, string[]>;
  currentTranslation: string;
};

function reset() {
  const r = BibleRepository as unknown as RepoPrivate;
  r.translations.clear();
  r.loadedTranslations.clear();
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
  goodZip = await makeValidZip();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).includes('NKJV')) {
        return { ok: false, status: 404 } as Response; // the one failing translation
      }
      return { ok: true, arrayBuffer: async () => goodZip } as unknown as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  reset();
});

describe('RI-043 — translation boot isolation', () => {
  it('one failing translation does not reject the whole preload; the rest load', async () => {
    let rejected: unknown = null;
    await BibleRepository.preloadAllTranslations().catch((e) => {
      rejected = e;
    });
    expect(rejected).toBeNull(); // preload resolved despite NKJV failing

    const loaded = BibleRepository.getLoadedTranslations();
    expect(loaded).toEqual(expect.arrayContaining(['KJV', 'NIV', 'NLT', 'AMP']));
    expect(loaded).not.toContain('NKJV');
  });

  it('the failed translation stays unavailable — no fallback (RI-014)', async () => {
    await BibleRepository.preloadAllTranslations().catch(() => undefined);

    expect(BibleRepository.getVerses('John', '3', 'KJV').length).toBeGreaterThan(0);
    // NKJV never loaded: empty, not another translation's verses.
    expect(BibleRepository.getVerses('John', '3', 'NKJV')).toEqual([]);
    expect(BibleRepository.getBook('John', 'NKJV')).toBeNull();
  });
});

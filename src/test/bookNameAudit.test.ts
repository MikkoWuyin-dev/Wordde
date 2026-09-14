import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { normalizeBibleJson } from '@/core/bibleNormalizer';
import { BibleRepository } from '@/core/bibleRepository';

/**
 * Real-data audit: normalize the SHIPPED translation zips and verify that
 * every canonical book name (the list Browse filters against, seeded into
 * the repository's `bookNames` by whichever translation loads first) is
 * present in every translation after normalization.
 *
 * Regression: the nested-object translations (NKJV/NLT/AMP) key the Book of
 * Psalms "Psalm" while the canonical spellings say "Psalms". The normalizer
 * passed the raw key through, so the book vanished from the Browse tab
 * whenever a nested-format translation won the parallel load race — and
 * reference lookups resolved to null across translations. Any future dataset
 * that diverges from the canonical name list fails HERE, at the boundary.
 */

const PUBLIC_DATA = path.resolve(__dirname, '../../public/data');

const ZIPS: Record<string, string> = {
  KJV: 'KJV_Bible_JSON.zip',
  NIV: 'NIV_Bible_JSON.zip',
  NKJV: 'NKJV.zip',
  NLT: 'NLT.zip',
  AMP: 'AMP.zip',
};

const CANONICAL_BOOKS = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy',
  'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel',
  '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles',
  'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs',
  'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah',
  'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos',
  'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah',
  'Haggai', 'Zechariah', 'Malachi',
  'Matthew', 'Mark', 'Luke', 'John', 'Acts',
  'Romans', '1 Corinthians', '2 Corinthians', 'Galatians',
  'Ephesians', 'Philippians', 'Colossians',
  '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy',
  'Titus', 'Philemon', 'Hebrews', 'James',
  '1 Peter', '2 Peter', '1 John', '2 John', '3 John',
  'Jude', 'Revelation',
];

async function normalizedBookNames(zipFile: string): Promise<string[]> {
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(PUBLIC_DATA, zipFile)));
  const names = new Set<string>();
  const jobs: Promise<void>[] = [];
  zip.forEach((relativePath, file) => {
    if (!relativePath.endsWith('.json') || file.dir) return;
    jobs.push(
      file.async('text').then((content) => {
        const { books } = normalizeBibleJson(JSON.parse(content));
        for (const b of books) names.add(b.book);
      }),
    );
  });
  await Promise.all(jobs);
  return [...names];
}

describe('shipped translation data — canonical book-name audit', () => {
  for (const [translation, zipFile] of Object.entries(ZIPS)) {
    it(`normalizes ${translation} to the canonical 66-book name list`, async () => {
      const names = await normalizedBookNames(zipFile);
      const nameSet = new Set(names.map((n) => n.toLowerCase()));

      const missing = CANONICAL_BOOKS.filter((b) => !nameSet.has(b.toLowerCase()));
      expect(missing, `${translation} is missing canonical books after normalization`).toEqual([]);

      // Psalms specifically — the book this audit exists for.
      expect(nameSet.has('psalms')).toBe(true);
      expect(nameSet.has('psalm')).toBe(false);
    }, 30000);
  }

  it('repository book-key maps resolve Psalms 23:1 in every translation', async () => {
    // Install each translation's normalized books into the live repository
    // the same way loadTranslation does, then read through the public API.
    for (const [translation, zipFile] of Object.entries(ZIPS)) {
      const zip = await JSZip.loadAsync(fs.readFileSync(path.join(PUBLIC_DATA, zipFile)));
      const booksMap = new Map<string, import('@/core/types').BibleBook>();
      const jobs: Promise<void>[] = [];
      zip.forEach((relativePath, file) => {
        if (!relativePath.endsWith('.json') || file.dir) return;
        jobs.push(
          file.async('text').then((content) => {
            const { books } = normalizeBibleJson(JSON.parse(content));
            for (const b of books) {
              if (!b.book || !Array.isArray(b.chapters)) return;
              booksMap.set(b.book.toLowerCase(), b);
            }
          }),
        );
      });
      await Promise.all(jobs);

      const repo = BibleRepository as unknown as {
        translations: Map<string, Map<string, import('@/core/types').BibleBook>>;
        loadedTranslations: Set<string>;
      };
      repo.translations.set(translation, booksMap);
      repo.loadedTranslations.add(translation);

      const verse = BibleRepository.getVerse('Psalms', '23', '1', translation);
      expect(verse, `Psalms 23:1 must resolve in ${translation}`).not.toBeNull();
    }
  }, 60000);
});

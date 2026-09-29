// Wordde - Bible decode Web Worker
//
// Runs fetch + JSZip + JSON.parse + normalizeBibleJson + keep-first dedup on
// a background thread so the 3–5 s boot decode never blocks the main thread
// (teardown §10 improvement #1). The worker imports the normalizer directly,
// so ALL format knowledge stays inside the normalization boundary (RI-042) —
// nothing here understands source JSON shapes; it routes every parsed file
// through normalizeBibleJson exactly like the main-thread decoder in
// bibleRepository.ts, producing the identical book list and metadata.
//
// Protocol (bibleRepository.decodeViaWorker):
//   in : { translation, zipPath }
//   out: { ok: true, books, metadata } | { ok: false, error }
// books is an ARRAY in first-encounter insertion order — the repository
// rebuilds its Map from it with the same keep-first duplicate rule, so
// canonical traversal order is identical to the main-thread path.

import JSZip from 'jszip';
import { normalizeBibleJson, type TranslationMetadata } from './bibleNormalizer';
import type { BibleBook } from './types';

interface DecodeRequest {
  translation: string;
  zipPath: string;
}

type DecodeResponse =
  | { ok: true; books: BibleBook[]; metadata: TranslationMetadata }
  | { ok: false; error: string };

self.onmessage = async (event: MessageEvent<DecodeRequest>) => {
  const { translation, zipPath } = event.data;
  try {
    const res = await fetch(zipPath);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${zipPath}: HTTP ${res.status}`);
    }
    const zipData = await res.arrayBuffer();
    const zip = await JSZip.loadAsync(zipData);

    // Insertion-ordered book list; keep-first duplicates (same rule as the
    // main-thread decoder, so the cache and fallback paths are identical).
    const books: BibleBook[] = [];
    const seen = new Set<string>();
    const aggregatedMetadata: TranslationMetadata = {};
    let jsonFileCount = 0;

    const filePromises: Promise<void>[] = [];
    zip.forEach((relativePath, file) => {
      if (!relativePath.endsWith('.json') || file.dir) return;
      jsonFileCount++;
      const promise = file.async('text').then((content) => {
        let raw: unknown;
        try {
          raw = JSON.parse(content);
        } catch {
          // Invalid JSON files are skipped, same as main-thread (parseErrors
          // are only surfaced when the whole translation ends up empty).
          return;
        }
        const { books: normalized, metadata } = normalizeBibleJson(raw);
        Object.assign(aggregatedMetadata, metadata);
        for (const bookData of normalized) {
          if (!bookData.book || !Array.isArray(bookData.chapters)) continue;
          const key = bookData.book.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          books.push(bookData);
        }
      });
      filePromises.push(promise);
    });

    await Promise.all(filePromises);

    if (jsonFileCount === 0) {
      throw new Error(`No .json files found inside ${zipPath}`);
    }
    if (books.length === 0) {
      throw new Error(`No valid books found in ${translation}`);
    }

    const response: DecodeResponse = { ok: true, books, metadata: aggregatedMetadata };
    self.postMessage(response);
  } catch (error) {
    const response: DecodeResponse = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};

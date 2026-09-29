// Wordde - Decode worker client
//
// Thin Promise wrapper around bibleDecodeWorker: spawns the module worker,
// posts the decode request, and resolves with the parsed translation or
// rejects with a reason. A timeout guard guarantees the caller can always
// fall back to the main-thread decoder (RI-043: a hung optional subsystem
// must not hang the boot). The client never mutates repository state — the
// repository owns installation, indexing, and cache writes.

import type { BibleBook } from './types';
import type { TranslationMetadata } from './bibleNormalizer';
import { booksArrayToMap, type ParsedTranslation } from './bibleCache';

interface DecodeRequest {
  translation: string;
  zipPath: string;
}

type DecodeResponse =
  | { ok: true; books: BibleBook[]; metadata: TranslationMetadata }
  | { ok: false; error: string };

/**
 * Decode a translation ZIP in the worker. Rejects on worker failure, decode
 * error, or timeout — the caller falls back to the main-thread path either way.
 */
export function decodeViaWorker(
  translation: string,
  zipPath: string,
  timeoutMs: number = 60_000,
): Promise<ParsedTranslation> {
  return new Promise((resolve, reject) => {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL('./bibleDecodeWorker.ts', import.meta.url), { type: 'module' });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    const finish = () => {
      clearTimeout(timeout);
      worker?.terminate();
    };

    const timeout = setTimeout(() => {
      finish();
      reject(new Error(`Decode worker timed out for ${translation} after ${timeoutMs}ms`));
    }, timeoutMs);

    worker.onmessage = (event: MessageEvent<DecodeResponse>) => {
      finish();
      const data = event.data;
      if (data && data.ok) {
        // Same keep-first Map rebuild the main-thread decoder applies, so
        // insertion (traversal) order is identical across tiers.
        resolve({ booksMap: booksArrayToMap(data.books), metadata: data.metadata });
      } else {
        reject(new Error(data?.error || 'Unknown decode worker error'));
      }
    };

    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || 'Decode worker failed to start'));
    };

    const request: DecodeRequest = { translation, zipPath };
    worker.postMessage(request);
  });
}

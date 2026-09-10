// Bible Projection App - Bible Repository
// Read-only access layer for Bible data
// Supports multiple translations (KJV, NIV, etc.)

import JSZip from 'jszip';
import type { BibleBook, Passage, PassageReference, Verse } from './types';
import { normalizeBibleJson, type TranslationMetadata } from './bibleNormalizer';

/**
 * Map of translation code → zip file path.
 *
 * To add a new translation:
 *   1. Drop `<CODE>.zip` (or any zip containing one or more `.json` files) into /public/data/
 *   2. Add an entry below: `<CODE>: '/data/<file>.zip'`
 *
 * The JSON inside may be canonical, an array of canonical books, or the
 * nested-object format with an `Info` block. The normalizer handles all three.
 */
const TRANSLATION_ZIPS: Record<string, string> = {
  KJV:  '/data/KJV_Bible_JSON.zip',
  NIV:  '/data/NIV_Bible_JSON.zip',
  NKJV: '/data/NKJV.zip',
  NLT:  '/data/NLT.zip',
  AMP:  '/data/AMP.zip',
};

class BibleRepositoryClass {
  /** Per-translation book data */
  private translations: Map<string, Map<string, BibleBook>> = new Map();
  /** Per-translation metadata extracted from incoming files (e.g. "Info" block) */
  private translationMetadata: Map<string, TranslationMetadata> = new Map();
  /** Canonical book order (same across translations) */
  private bookNames: string[] = [];
  private loadedTranslations: Set<string> = new Set();
  private currentTranslation: string = 'KJV';

  // Book name normalization map
  private bookAliases: Map<string, string> = new Map();

  /** Get list of available translation codes */
  getAvailableTranslations(): string[] {
    return Object.keys(TRANSLATION_ZIPS);
  }

  /** Get currently loaded translations */
  getLoadedTranslations(): string[] {
    return [...this.loadedTranslations];
  }

  setCurrentTranslation(translation: string) {
    this.currentTranslation = translation;
  }

  getCurrentTranslation(): string {
    return this.currentTranslation;
  }

  /** Read translation metadata extracted at load time (e.g. from `Info` blocks). */
  getTranslationMetadata(translation?: string): TranslationMetadata {
    const t = translation || this.currentTranslation;
    return this.translationMetadata.get(t) || {};
  }

  /**
   * Load a single translation from its zip file.
   * Can be called multiple times for different translations.
   */
  async loadTranslation(translation: string): Promise<void> {
    if (this.loadedTranslations.has(translation)) return;

    const zipPath = TRANSLATION_ZIPS[translation];
    if (!zipPath) throw new Error(`Unknown translation: ${translation}`);

    try {
      const response = await fetch(zipPath);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${zipPath}: HTTP ${response.status}`);
      }
      const zipData = await response.arrayBuffer();
      const zip = await JSZip.loadAsync(zipData);

      const booksMap = new Map<string, BibleBook>();
      const aggregatedMetadata: TranslationMetadata = {};
      const parseErrors: string[] = [];
      let jsonFileCount = 0;
      const filePromises: Promise<void>[] = [];

      zip.forEach((relativePath, file) => {
        if (!relativePath.endsWith('.json') || file.dir) return;
        jsonFileCount++;

        const promise = file.async('text').then((content) => {
          let raw: unknown;
          try {
            raw = JSON.parse(content);
          } catch (e) {
            parseErrors.push(`${relativePath}: invalid JSON (${(e as Error).message})`);
            return;
          }

          // Route every file through the normalization layer.
          // Downstream code only ever sees the canonical BibleBook shape,
          // regardless of whether the source file is canonical, an array,
          // or the nested-object format with an `Info` block.
          const { books, metadata } = normalizeBibleJson(raw);

          // Merge metadata from any file in the archive (Info blocks
          // typically appear once per translation; last write wins per key).
          Object.assign(aggregatedMetadata, metadata);

          for (const bookData of books) {
            if (!bookData.book || !Array.isArray(bookData.chapters)) continue;
            const key = bookData.book.toLowerCase();
            if (booksMap.has(key)) {
              // Fail-soft on duplicates: keep first occurrence so a stray
              // duplicate file doesn't silently overwrite verified data.
              console.warn(
                `[BibleRepository] Duplicate book "${bookData.book}" in ${translation}; keeping first occurrence.`,
              );
              continue;
            }
            booksMap.set(key, bookData);
            if (!this.bookAliases.has(key)) {
              this.setupBookAliases(bookData.book);
            }
          }
        });
        filePromises.push(promise);
      });

      await Promise.all(filePromises);

      if (jsonFileCount === 0) {
        throw new Error(`No .json files found inside ${zipPath}`);
      }
      if (booksMap.size === 0) {
        const detail = parseErrors.length ? ` (${parseErrors.join('; ')})` : '';
        throw new Error(`No valid books found in ${translation}${detail}`);
      }

      this.translations.set(translation, booksMap);
      this.translationMetadata.set(translation, aggregatedMetadata);
      this.loadedTranslations.add(translation);

      // Build canonical book order from the first translation loaded
      // (all translations share the 66-book canon).
      if (this.bookNames.length === 0) {
        const names: string[] = [];
        for (const book of booksMap.values()) names.push(book.book);
        this.bookNames = this.sortBooksInOrder(names);
      }

      console.log(
        `[BibleRepository] Loaded ${translation}: ${booksMap.size} books`,
        aggregatedMetadata,
      );
    } catch (error) {
      console.error(`Failed to load ${translation} Bible data:`, error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Legacy compat: load KJV from zip path
   */
  async loadFromZip(zipPath: string): Promise<void> {
    // If zipPath matches KJV, use the new method
    await this.loadTranslation('KJV');
  }

  /**
   * Preload all configured translations in parallel.
   * Called once on app boot to eliminate translation-switch lag during a live service.
   */
  async preloadAllTranslations(): Promise<void> {
    const translations = Object.keys(TRANSLATION_ZIPS);
    console.log(`[BibleRepository] Preloading ${translations.length} translations:`, translations);
    const startTime = performance.now();
    try {
      await Promise.all(translations.map((t) => this.loadTranslation(t)));
      const elapsed = Math.round(performance.now() - startTime);
      console.log(`[BibleRepository] ✅ All translations loaded in ${elapsed}ms`);
    } catch (error) {
      console.error('[BibleRepository] Failed to preload translations:', error);
      throw error;
    }
  }

  // --- Private helpers ---

  private getBooksMap(translation?: string): Map<string, BibleBook> {
    const t = translation || this.currentTranslation;
    const map = this.translations.get(t);
    if (map) return map;
    // Do NOT silently fall back to another translation — that produces the
    // "label says NIV, text is KJV" mismatch bug. Callers must ensure the
    // translation is loaded (via loadTranslation) before requesting data.
    console.warn(
      `[BibleRepository] getBooksMap: translation "${t}" not loaded; returning empty map.`,
    );
    return new Map();
  }

  private setupBookAliases(bookName: string): void {
    const lower = bookName.toLowerCase();
    this.bookAliases.set(lower, bookName);

    const abbreviations: Record<string, string[]> = {
      'genesis': ['gen', 'ge'],
      'exodus': ['exod', 'ex'],
      'leviticus': ['lev', 'le'],
      'numbers': ['num', 'nu'],
      'deuteronomy': ['deut', 'dt'],
      'joshua': ['josh', 'jos'],
      'judges': ['judg', 'jdg'],
      'ruth': ['ru'],
      '1 samuel': ['1sam', '1sa', '1 sam'],
      '2 samuel': ['2sam', '2sa', '2 sam'],
      '1 kings': ['1kgs', '1ki', '1 kgs'],
      '2 kings': ['2kgs', '2ki', '2 kgs'],
      '1 chronicles': ['1chr', '1ch', '1 chr'],
      '2 chronicles': ['2chr', '2ch', '2 chr'],
      'ezra': ['ezr'],
      'nehemiah': ['neh', 'ne'],
      'esther': ['est', 'es'],
      'job': ['jb'],
      'psalms': ['ps', 'psa', 'psalm'],
      'proverbs': ['prov', 'pr'],
      'ecclesiastes': ['eccl', 'ec'],
      'song of solomon': ['song', 'sos', 'ss'],
      'isaiah': ['isa', 'is'],
      'jeremiah': ['jer', 'je'],
      'lamentations': ['lam', 'la'],
      'ezekiel': ['ezek', 'eze'],
      'daniel': ['dan', 'da'],
      'hosea': ['hos', 'ho'],
      'joel': ['joe', 'jl'],
      'amos': ['am'],
      'obadiah': ['obad', 'ob'],
      'jonah': ['jon', 'jnh'],
      'micah': ['mic', 'mi'],
      'nahum': ['nah', 'na'],
      'habakkuk': ['hab'],
      'zephaniah': ['zeph', 'zep'],
      'haggai': ['hag'],
      'zechariah': ['zech', 'zec'],
      'malachi': ['mal'],
      'matthew': ['matt', 'mt'],
      'mark': ['mk', 'mar'],
      'luke': ['lk', 'lu'],
      'john': ['jn', 'joh'],
      'acts': ['ac', 'act'],
      'romans': ['rom', 'ro'],
      '1 corinthians': ['1cor', '1co', '1 cor'],
      '2 corinthians': ['2cor', '2co', '2 cor'],
      'galatians': ['gal', 'ga'],
      'ephesians': ['eph'],
      'philippians': ['phil', 'php'],
      'colossians': ['col'],
      '1 thessalonians': ['1thess', '1th', '1 thess'],
      '2 thessalonians': ['2thess', '2th', '2 thess'],
      '1 timothy': ['1tim', '1ti', '1 tim'],
      '2 timothy': ['2tim', '2ti', '2 tim'],
      'titus': ['tit'],
      'philemon': ['phlm', 'phm'],
      'hebrews': ['heb'],
      'james': ['jas', 'jm'],
      '1 peter': ['1pet', '1pe', '1 pet'],
      '2 peter': ['2pet', '2pe', '2 pet'],
      '1 john': ['1jn', '1jo', '1 jn'],
      '2 john': ['2jn', '2jo', '2 jn'],
      '3 john': ['3jn', '3jo', '3 jn'],
      'jude': ['jud'],
      'revelation': ['rev', 're', 'revelations'],
    };

    const aliases = abbreviations[lower];
    if (aliases) {
      aliases.forEach(alias => this.bookAliases.set(alias, bookName));
    }
  }

  private sortBooksInOrder(books: string[]): string[] {
    const biblicalOrder = [
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
      'Jude', 'Revelation'
    ];

    return books.sort((a, b) => {
      const indexA = biblicalOrder.findIndex(name => name.toLowerCase() === a.toLowerCase());
      const indexB = biblicalOrder.findIndex(name => name.toLowerCase() === b.toLowerCase());
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });
  }

  // --- Public API (translation-aware) ---

  resolveBookName(input: string): string | null {
    const normalized = input.toLowerCase().trim();
    return this.bookAliases.get(normalized) || null;
  }

  getBook(bookName: string, translation?: string): BibleBook | null {
    const resolved = this.resolveBookName(bookName);
    if (!resolved) return null;
    return this.getBooksMap(translation).get(resolved.toLowerCase()) || null;
  }

  getVerse(bookName: string, chapter: string, verse: string, translation?: string): Verse | null {
    const book = this.getBook(bookName, translation);
    if (!book) return null;
    const chapterData = book.chapters.find(c => c.chapter === chapter);
    if (!chapterData) return null;
    return chapterData.verses.find(v => v.verse === verse) || null;
  }

  getPassage(reference: PassageReference): Passage | null {
    const book = this.getBook(reference.book, reference.translation);
    if (!book) return null;

    const chapterData = book.chapters.find(c => c.chapter === reference.chapter);
    if (!chapterData) return null;

    const startIndex = chapterData.verses.findIndex(v => v.verse === reference.verseStart);
    if (startIndex === -1) return null;

    const endVerse = reference.verseEnd || reference.verseStart;
    const endIndex = chapterData.verses.findIndex(v => v.verse === endVerse);

    const verses = chapterData.verses.slice(
      startIndex,
      endIndex === -1 ? startIndex + 1 : endIndex + 1
    );

    const text = verses.map(v => `${v.verse} ${v.text}`).join(' ');
    const displayRef = reference.verseEnd && reference.verseEnd !== reference.verseStart
      ? `${book.book} ${reference.chapter}:${reference.verseStart}-${reference.verseEnd}`
      : `${book.book} ${reference.chapter}:${reference.verseStart}`;

    return {
      reference: { ...reference, book: book.book },
      displayReference: displayRef,
      text,
      verses,
    };
  }

  getAllBooks(): string[] {
    return [...this.bookNames];
  }

  getChapters(bookName: string, translation?: string): string[] {
    const book = this.getBook(bookName, translation);
    if (!book) return [];
    return book.chapters.map(c => c.chapter);
  }

  getVerses(bookName: string, chapter: string, translation?: string): Verse[] {
    const book = this.getBook(bookName, translation);
    if (!book) return [];
    const chapterData = book.chapters.find(c => c.chapter === chapter);
    return chapterData?.verses || [];
  }

  getVerseCount(bookName: string, chapter: string, translation?: string): number {
    return this.getVerses(bookName, chapter, translation).length;
  }

  getChapterCount(bookName: string, translation?: string): number {
    const book = this.getBook(bookName, translation);
    if (!book) return 0;
    return book.chapters.length;
  }

  /**
   * Navigation model (P0 correctness):
   * The normalized `Chapter.verses` array is the canonical ordered sequence.
   * Navigation resolves the CURRENT verse's index in that array and steps by
   * array position. Verse keys are never derived arithmetically, so lettered
   * ("3a") and non-contiguous (1, 2, 4) keys navigate exactly as stored.
   */
  getNextVerse(
    bookName: string,
    chapter: string,
    verse: string,
    translation?: string,
  ): { book: string; chapter: string; verse: string } | null {
    const book = this.getBook(bookName, translation);
    if (!book) return null;

    const chapterIndex = book.chapters.findIndex(c => c.chapter === chapter);
    if (chapterIndex === -1) {
      console.warn(`[BibleRepository] getNextVerse: chapter ${bookName} ${chapter} not found.`);
      return null;
    }

    const verses = book.chapters[chapterIndex].verses;
    const verseIndex = verses.findIndex(v => v.verse === verse);
    if (verseIndex === -1) {
      // Fail safe: never guess a nearby verse.
      console.warn(
        `[BibleRepository] getNextVerse: verse "${verse}" not found in ${bookName} ${chapter}.`,
      );
      return null;
    }

    // Next element in this chapter.
    if (verseIndex < verses.length - 1) {
      return { book: book.book, chapter, verse: verses[verseIndex + 1].verse };
    }

    // Chapter boundary: first verse of the next chapter, by array order.
    const nextChapter = book.chapters[chapterIndex + 1];
    if (nextChapter && nextChapter.verses.length > 0) {
      return { book: book.book, chapter: nextChapter.chapter, verse: nextChapter.verses[0].verse };
    }

    // Book boundary: first verse of the first chapter of the next book.
    const bookIndex = this.bookNames.findIndex(b => b.toLowerCase() === book.book.toLowerCase());
    if (bookIndex >= 0 && bookIndex < this.bookNames.length - 1) {
      const nextBook = this.getBook(this.bookNames[bookIndex + 1], translation);
      const firstChapter = nextBook?.chapters.find(c => c.verses.length > 0);
      if (nextBook && firstChapter) {
        return {
          book: nextBook.book,
          chapter: firstChapter.chapter,
          verse: firstChapter.verses[0].verse,
        };
      }
    }

    return null;
  }

  getPreviousVerse(
    bookName: string,
    chapter: string,
    verse: string,
    translation?: string,
  ): { book: string; chapter: string; verse: string } | null {
    const book = this.getBook(bookName, translation);
    if (!book) return null;

    const chapterIndex = book.chapters.findIndex(c => c.chapter === chapter);
    if (chapterIndex === -1) {
      console.warn(`[BibleRepository] getPreviousVerse: chapter ${bookName} ${chapter} not found.`);
      return null;
    }

    const verses = book.chapters[chapterIndex].verses;
    const verseIndex = verses.findIndex(v => v.verse === verse);
    if (verseIndex === -1) {
      console.warn(
        `[BibleRepository] getPreviousVerse: verse "${verse}" not found in ${bookName} ${chapter}.`,
      );
      return null;
    }

    if (verseIndex > 0) {
      return { book: book.book, chapter, verse: verses[verseIndex - 1].verse };
    }

    // Chapter boundary: final verse of the previous chapter, by array order.
    const prevChapter = book.chapters[chapterIndex - 1];
    if (prevChapter && prevChapter.verses.length > 0) {
      return {
        book: book.book,
        chapter: prevChapter.chapter,
        verse: prevChapter.verses[prevChapter.verses.length - 1].verse,
      };
    }

    // Book boundary: final verse of the last chapter of the previous book.
    const bookIndex = this.bookNames.findIndex(b => b.toLowerCase() === book.book.toLowerCase());
    if (bookIndex > 0) {
      const prevBook = this.getBook(this.bookNames[bookIndex - 1], translation);
      if (prevBook) {
        for (let i = prevBook.chapters.length - 1; i >= 0; i--) {
          const ch = prevBook.chapters[i];
          if (ch.verses.length > 0) {
            return {
              book: prevBook.book,
              chapter: ch.chapter,
              verse: ch.verses[ch.verses.length - 1].verse,
            };
          }
        }
      }
    }

    return null;
  }

  isDataLoaded(): boolean {
    return this.loadedTranslations.size > 0;
  }

  isTranslationLoaded(translation: string): boolean {
    return this.loadedTranslations.has(translation);
  }

  searchByReference(query: string): Passage | null {
    const pattern = /^(.+?)\s*(\d+)\s*:\s*(\d+)(?:\s*-\s*(\d+))?$/i;
    const match = query.match(pattern);
    if (!match) return null;

    const [, bookPart, chapter, verseStart, verseEnd] = match;
    const bookName = this.resolveBookName(bookPart.trim());
    if (!bookName) return null;

    return this.getPassage({
      book: bookName,
      chapter,
      verseStart,
      verseEnd,
      translation: this.currentTranslation,
    });
  }

  searchByKeyword(query: string, limit: number = 20): Passage[] {
    const results: Passage[] = [];
    const searchTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    if (searchTerms.length === 0) return results;

    const booksMap = this.getBooksMap();
    for (const book of booksMap.values()) {
      for (const chapter of book.chapters) {
        for (const verse of chapter.verses) {
          const verseTextLower = verse.text.toLowerCase();
          const matchCount = searchTerms.filter(term => verseTextLower.includes(term)).length;

          if (matchCount > 0) {
            const passage = this.getPassage({
              book: book.book,
              chapter: chapter.chapter,
              verseStart: verse.verse,
              translation: this.currentTranslation,
            });

            if (passage) {
              results.push(passage);
              if (results.length >= limit) return results;
            }
          }
        }
      }
    }

    return results;
  }
}

// Singleton instance
export const BibleRepository = new BibleRepositoryClass();

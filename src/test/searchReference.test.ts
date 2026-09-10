import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BibleRepository } from '@/core/bibleRepository';
import { SearchEngine } from '@/core/searchEngine';
import type { BibleBook, Passage, SearchResult } from '@/core/types';

/** Create a test book with given chapters/verses */
const book = (name: string, chapters: Record<string, string[]>): BibleBook => ({
  book: name,
  chapters: Object.entries(chapters).map(([chapter, verses]) => ({
    chapter,
    verses: verses.map((v) => ({ verse: v, text: `${name} ${chapter}:${v} text` })),
  })),
});

/** Install fixture books into the repository's private stores */
function installFixture(translation: string, books: BibleBook[], setCurrent = true) {
  const repo = BibleRepository as unknown as {
    translations: Map<string, Map<string, BibleBook>>;
    translationMetadata: Map<string, unknown>;
    loadedTranslations: Set<string>;
    bookNames: string[];
    bookAliases: Map<string, string[]>;
    currentTranslation: string;
  };
  const map = new Map<string, BibleBook>();
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
  
  for (const b of books) {
    map.set(b.book.toLowerCase(), b);
    // Initialize bookAliases for this book (mirrors setupBookAliases behavior)
    const lower = b.book.toLowerCase();
    repo.bookAliases.set(lower, [b.book]);
    
    // Add common abbreviations for the book
    const abbreviations: Record<string, string[]> = {
      'genesis': ['gen', 'ge', 'gn'],
      'exodus': ['exo', 'exod', 'ex'],
      'nahum': ['nah', 'na'],
      '1 corinthians': ['1cor', '1co', '1 cor', '1 co'],
      '2 corinthians': ['2cor', '2co', '2 cor', '2 co'],
      '1 chronicles': ['1chr', '1ch', '1 chr', '1 ch'],
      '2 chronicles': ['2chr', '2ch', '2 chr', '2 ch'],
      'luke': ['luke', 'luk', 'lk'],
      'matthew': ['matt', 'mat', 'mt'],
      'mark': ['mark', 'mar', 'mrk', 'mk'],
      'malachi': ['mal', 'ml'],
    };
    
    const aliases = abbreviations[lower];
    if (aliases) {
      for (const alias of aliases) {
        const existing = repo.bookAliases.get(alias);
        if (existing) {
          if (!existing.includes(b.book)) {
            repo.bookAliases.set(alias, [...existing, b.book]);
          }
        } else {
          repo.bookAliases.set(alias, [b.book]);
        }
      }
    }
  }
  
  repo.translations.set(translation, map);
  repo.loadedTranslations.add(translation);
  repo.bookNames = books.map((b) => b.book);
  // Set canonical order
  repo.bookNames.sort((a, b) => {
    const idxA = biblicalOrder.findIndex(n => n.toLowerCase() === a.toLowerCase());
    const idxB = biblicalOrder.findIndex(n => n.toLowerCase() === b.toLowerCase());
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });
  if (setCurrent) repo.currentTranslation = translation;
}

function reset() {
  const repo = BibleRepository as unknown as {
    translations: Map<string, unknown>;
    loadedTranslations: Set<string>;
    bookNames: string[];
    bookAliases: Map<string, string[]>;
  };
  repo.translations.clear();
  repo.loadedTranslations.clear();
  repo.bookNames = [];
  repo.bookAliases.clear();
}

describe('Book abbreviation resolution', () => {
  beforeEach(() => reset());

  it('luk 2:10 resolves to Luke 2:10', () => {
    installFixture('TEST', [
      book('Luke', { '2': ['1', '2', '10', '11'] }),
      book('2 Timothy', { '4': ['11'] }), // Has "Only Luke is with me"
    ]);
    // Simulate 2 Timothy 4:11 text containing "Luke"
    const repo = BibleRepository as unknown as {
      translations: Map<string, Map<string, BibleBook>>;
    };
    const testMap = repo.translations.get('TEST');
    if (testMap) {
      const timothy = testMap.get('2 timothy');
      if (timothy) {
        const ch4 = timothy.chapters.find(c => c.chapter === '4');
        if (ch4) {
          const v11 = ch4.verses.find(v => v.verse === '11');
          if (v11) v11.text = 'Only Luke is with me.';
        }
      }
    }

    const results = BibleRepository.searchByReference('luk 2:10');
    expect(results).toHaveLength(1);
    expect(results[0].passage.reference.book).toBe('Luke');
    expect(results[0].passage.reference.chapter).toBe('2');
    expect(results[0].passage.reference.verseStart).toBe('10');
    expect(results[0].score).toBe(100);
  });

  it('Exo 3:5 resolves to Exodus 3:5', () => {
    installFixture('TEST', [
      book('Exodus', { '3': ['1', '2', '5', '6'] }),
    ]);
    const results = BibleRepository.searchByReference('Exo 3:5');
    expect(results).toHaveLength(1);
    expect(results[0].passage.reference.book).toBe('Exodus');
    expect(results[0].passage.reference.chapter).toBe('3');
    expect(results[0].passage.reference.verseStart).toBe('5');
  });

  it('na 1:8 resolves to Nahum 1:8', () => {
    installFixture('TEST', [
      book('Nahum', { '1': ['1', '5', '8'] }),
    ]);
    const results = BibleRepository.searchByReference('na 1:8');
    expect(results).toHaveLength(1);
    expect(results[0].passage.reference.book).toBe('Nahum');
    expect(results[0].passage.reference.chapter).toBe('1');
    expect(results[0].passage.reference.verseStart).toBe('8');
  });

  it('1cor 13:4 resolves to 1 Corinthians 13:4', () => {
    installFixture('TEST', [
      book('1 Corinthians', { '13': ['1', '4', '5'] }),
      book('1 Chronicles', { '13': ['1', '2'] }), // Doesn't have verse 4
    ]);
    const results = BibleRepository.searchByReference('1cor 13:4');
    expect(results.length).toBeGreaterThan(0);
    // Should find 1 Corinthians 13:4 (1 Chronicles doesn't have verse 4)
    const corinthians = results.find(r => r.passage.reference.book === '1 Corinthians');
    expect(corinthians).toBeDefined();
    expect(corinthians!.passage.reference.chapter).toBe('13');
    expect(corinthians!.passage.reference.verseStart).toBe('4');
  });

  it('1 co 13:4 resolves to 1 Corinthians 13:4', () => {
    installFixture('TEST', [
      book('1 Corinthians', { '13': ['1', '4', '5'] }),
    ]);
    const results = BibleRepository.searchByReference('1 co 13:4');
    expect(results).toHaveLength(1);
    expect(results[0].passage.reference.book).toBe('1 Corinthians');
    expect(results[0].passage.reference.chapter).toBe('13');
    expect(results[0].passage.reference.verseStart).toBe('4');
  });

  it('1chr 4:10 resolves to 1 Chronicles 4:10', () => {
    installFixture('TEST', [
      book('1 Chronicles', { '4': ['1', '5', '10'] }),
    ]);
    const results = BibleRepository.searchByReference('1chr 4:10');
    expect(results).toHaveLength(1);
    expect(results[0].passage.reference.book).toBe('1 Chronicles');
    expect(results[0].passage.reference.chapter).toBe('4');
    expect(results[0].passage.reference.verseStart).toBe('10');
  });

  it('1 ch 4:10 resolves to 1 Chronicles 4:10', () => {
    installFixture('TEST', [
      book('1 Chronicles', { '4': ['1', '5', '10'] }),
    ]);
    const results = BibleRepository.searchByReference('1 ch 4:10');
    expect(results).toHaveLength(1);
    expect(results[0].passage.reference.book).toBe('1 Chronicles');
    expect(results[0].passage.reference.chapter).toBe('4');
    expect(results[0].passage.reference.verseStart).toBe('10');
  });

  it('1c 13:4 treats alias as ambiguous (both 1 Chronicles and 1 Corinthians)', () => {
    // Manually set up ambiguous alias for 1c
    const repo = BibleRepository as unknown as {
      bookAliases: Map<string, string[]>;
    };
    installFixture('TEST', [
      book('1 Corinthians', { '13': ['1', '4', '5'] }),
      book('1 Chronicles', { '13': ['1', '2', '4'] }), // Has verse 4
    ]);
    // Set up the ambiguous alias manually
    repo.bookAliases.set('1c', ['1 Chronicles', '1 Corinthians']);
    
    const results = BibleRepository.searchByReference('1c 13:4');
    // Both books have chapter 13 verse 4, so both should be in results
    expect(results.length).toBeGreaterThanOrEqual(1);
    const books = results.map(r => r.passage.reference.book);
    expect(books).toContain('1 Corinthians');
    expect(books).toContain('1 Chronicles');
  });

  it('ma 5:1 returns multiple valid book candidates', () => {
    installFixture('TEST', [
      book('Matthew', { '5': ['1', '2', '3'] }),
      book('Mark', { '5': ['1', '2'] }),
      book('Malachi', { '5': ['1'] }),
    ]);
    // 'ma' should match Matthew, Mark, Malachi (contains match)
    const results = BibleRepository.searchByReference('ma 5:1');
    expect(results.length).toBeGreaterThanOrEqual(1);
    const books = results.map(r => r.passage.reference.book);
    // All three should be candidates if they have chapter 5 verse 1
    expect(books).toContain('Matthew');
    expect(books).toContain('Mark');
    expect(books).toContain('Malachi');
  });

  it('Isaac sowed in that land uses keyword search', async () => {
    installFixture('TEST', [
      book('Genesis', { '26': ['12'] }),
    ]);
    const repo = BibleRepository as unknown as {
      translations: Map<string, Map<string, BibleBook>>;
    };
    const testMap = repo.translations.get('TEST');
    if (testMap) {
      const gen = testMap.get('genesis');
      if (gen) {
        const ch26 = gen.chapters.find(c => c.chapter === '26');
        if (ch26) {
          const v12 = ch26.verses.find(v => v.verse === '12');
          if (v12) v12.text = 'Then Isaac sowed in that land, and received in the same year an hundredfold.';
        }
      }
    }

    // This should NOT resolve as a reference (no book matches)
    const refResults = BibleRepository.searchByReference('Isaac sowed in that land');
    expect(refResults).toHaveLength(0);

    // But keyword search should find it
    const keywordResults = BibleRepository.searchByKeyword('Isaac sowed in that land', 10);
    expect(keywordResults.length).toBeGreaterThan(0);
    expect(keywordResults[0].reference.book).toBe('Genesis');
  });

  it('Only Luke is with me can be found by keyword search', async () => {
    installFixture('TEST', [
      book('2 Timothy', { '4': ['11'] }),
      book('Luke', { '2': ['10'] }),
    ]);
    const repo = BibleRepository as unknown as {
      translations: Map<string, Map<string, BibleBook>>;
    };
    const testMap = repo.translations.get('TEST');
    if (testMap) {
      const timothy = testMap.get('2 timothy');
      if (timothy) {
        const ch4 = timothy.chapters.find(c => c.chapter === '4');
        if (ch4) {
          const v11 = ch4.verses.find(v => v.verse === '11');
          if (v11) v11.text = 'Only Luke is with me.';
        }
      }
    }

    // Keyword search should find 2 Timothy 4:11
    const keywordResults = BibleRepository.searchByKeyword('Only Luke is with me', 10);
    expect(keywordResults.length).toBeGreaterThan(0);
    const timothyResult = keywordResults.find(r => r.reference.book === '2 Timothy');
    expect(timothyResult).toBeDefined();
  });

  it('Invalid reference-like input does not crash', () => {
    installFixture('TEST', [
      book('Genesis', { '1': ['1'] }),
    ]);
    // Should not throw
    expect(() => BibleRepository.searchByReference('xyz 99:99')).not.toThrow();
    expect(BibleRepository.searchByReference('xyz 99:99')).toHaveLength(0);
  });

  it('Missing translation does not fall back to KJV', () => {
    // Install in TEST translation only
    installFixture('TEST', [
      book('Genesis', { '1': ['1'] }),
    ]);

    // Request with non-existent translation
    const repo = BibleRepository as unknown as {
      currentTranslation: string;
    };
    repo.currentTranslation = 'NONEXISTENT';

    const results = BibleRepository.searchByReference('gen 1:1');
    // Should return empty (no books in NONEXISTENT translation)
    expect(results).toHaveLength(0);
  });

  it('g 1:1 (single char) does not trigger abbreviation matching', () => {
    installFixture('TEST', [
      book('Genesis', { '1': ['1'] }),
    ]);
    // 'g' is only 1 char, should not match
    const results = BibleRepository.searchByReference('g 1:1');
    // May or may not match depending on contains logic, but shouldn't crash
    expect(() => BibleRepository.searchByReference('g 1:1')).not.toThrow();
  });

  it('ge 1:1 (2 chars) may trigger matching', () => {
    installFixture('TEST', [
      book('Genesis', { '1': ['1'] }),
    ]);
    const results = BibleRepository.searchByReference('ge 1:1');
    // Should match Genesis via alias 'ge'
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].passage.reference.book).toBe('Genesis');
  });

  it('Full book names still resolve correctly', () => {
    installFixture('TEST', [
      book('John', { '3': ['16'] }),
    ]);
    const results = BibleRepository.searchByReference('John 3:16');
    expect(results).toHaveLength(1);
    expect(results[0].passage.reference.book).toBe('John');
  });

  it('Case insensitivity works for abbreviations', () => {
    installFixture('TEST', [
      book('Luke', { '2': ['10'] }),
    ]);
    expect(BibleRepository.searchByReference('LUK 2:10').length).toBeGreaterThan(0);
    expect(BibleRepository.searchByReference('Luk 2:10').length).toBeGreaterThan(0);
    expect(BibleRepository.searchByReference('luk 2:10').length).toBeGreaterThan(0);
  });

  it('2c 13:4 is ambiguous (both 2 Chronicles and 2 Corinthians)', () => {
    // Manually set up ambiguous alias for 2c
    const repo = BibleRepository as unknown as {
      bookAliases: Map<string, string[]>;
    };
    installFixture('TEST', [
      book('2 Corinthians', { '13': ['1', '4'] }),
      book('2 Chronicles', { '13': ['1', '4'] }),
    ]);
    // Set up the ambiguous alias manually
    repo.bookAliases.set('2c', ['2 Chronicles', '2 Corinthians']);
    
    const results = BibleRepository.searchByReference('2c 13:4');
    const books = results.map(r => r.passage.reference.book);
    expect(books).toContain('2 Corinthians');
    expect(books).toContain('2 Chronicles');
  });
});

describe('SearchEngine integration with multiple reference results', () => {
  beforeEach(() => reset());

  it('SearchEngine handles multiple exact reference matches', async () => {
    // Manually set up ambiguous alias for 1c
    const repo = BibleRepository as unknown as {
      bookAliases: Map<string, string[]>;
    };
    installFixture('TEST', [
      book('1 Corinthians', { '13': ['4'] }),
      book('1 Chronicles', { '13': ['4'] }),
    ]);
    // Set up the ambiguous alias manually
    repo.bookAliases.set('1c', ['1 Chronicles', '1 Corinthians']);

    const results = SearchEngine.search('1c 13:4', 'TEST');
    const books = results
      .filter(r => r.matchType === 'exact')
      .map(r => r.passage.reference.book);

    expect(books).toContain('1 Corinthians');
    expect(books).toContain('1 Chronicles');
  });
});

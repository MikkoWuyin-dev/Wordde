// Bible Projection App - Autocomplete Engine
// Provides fast, fuzzy reference suggestions as the operator types

import { BibleRepository } from './bibleRepository';

export interface Suggestion {
  display: string;    // What to show in the dropdown (e.g. "Romans 8:28")
  reference: string;  // The normalized reference to use
  type: 'book' | 'chapter' | 'verse';
}

const MAX_SUGGESTIONS = 6;

/**
 * Compute edit distance between two strings (Levenshtein)
 * Used for fuzzy matching book names
 */
function editDistance(a: string, b: string): number {
  const la = a.length, lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  
  // Use single-row DP for memory efficiency
  let prev = Array.from({ length: lb + 1 }, (_, i) => i);
  for (let i = 1; i <= la; i++) {
    const curr = [i];
    for (let j = 1; j <= lb; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
    }
    prev = curr;
  }
  return prev[lb];
}

/**
 * Find matching book names using prefix, alias, and fuzzy matching
 * Returns array of full book names sorted by match quality
 */
function matchBooks(input: string): string[] {
  const query = input.toLowerCase().trim();
  if (!query) return [];

  const allBooks = BibleRepository.getAllBooks();
  const scored: { name: string; score: number }[] = [];

  for (const book of allBooks) {
    const lower = book.toLowerCase();

    // Exact alias match via repository
    const resolved = BibleRepository.resolveBookName(query);
    if (resolved && resolved.toLowerCase() === lower) {
      scored.push({ name: book, score: 100 });
      continue;
    }

    // Prefix match on full name
    if (lower.startsWith(query)) {
      scored.push({ name: book, score: 90 });
      continue;
    }

    // Substring match
    if (lower.includes(query)) {
      scored.push({ name: book, score: 70 });
      continue;
    }

    // Fuzzy match - only for inputs >= 3 chars to avoid false positives
    if (query.length >= 3) {
      const dist = editDistance(query, lower.slice(0, Math.max(query.length, 3)));
      const threshold = query.length <= 4 ? 1 : 2;
      if (dist <= threshold) {
        scored.push({ name: book, score: 60 - dist * 5 });
      }
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return scored
    .sort((a, b) => b.score - a.score)
    .filter(s => {
      if (seen.has(s.name)) return false;
      seen.add(s.name);
      return true;
    })
    .map(s => s.name);
}

/**
 * Parse user input into book part and remainder (chapter:verse)
 */
function parseInput(input: string): { bookPart: string; rest: string } {
  const trimmed = input.trim();
  
  // Handle numbered books like "1 John 3:16" or "2cor 5"
  const numberedMatch = trimmed.match(/^(\d\s*\S+)\s*(.*)$/);
  if (numberedMatch) {
    const [, bookCandidate, rest] = numberedMatch;
    // Check if the numbered prefix resolves to a book
    const resolved = BibleRepository.resolveBookName(bookCandidate.trim());
    if (resolved) {
      return { bookPart: bookCandidate.trim(), rest: rest.trim() };
    }
  }

  // Try progressively longer prefixes to find the book name
  const words = trimmed.split(/\s+/);
  
  // Try first word (most common: "romans", "gen", "john")
  for (let i = 1; i <= Math.min(words.length, 3); i++) {
    const candidate = words.slice(0, i).join(' ');
    const resolved = BibleRepository.resolveBookName(candidate);
    if (resolved) {
      return { bookPart: candidate, rest: words.slice(i).join(' ').trim() };
    }
  }

  // No exact match - return all as book part for fuzzy matching
  // But if there are numbers at the end, split them off
  const fuzzyMatch = trimmed.match(/^([a-zA-Z\s]+?)\s*(\d.*)$/);
  if (fuzzyMatch) {
    return { bookPart: fuzzyMatch[1].trim(), rest: fuzzyMatch[2].trim() };
  }

  return { bookPart: trimmed, rest: '' };
}

/**
 * Generate autocomplete suggestions for the given input
 */
export function getSuggestions(input: string): Suggestion[] {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length < 1) return [];

  const { bookPart, rest } = parseInput(trimmed);
  const matchedBooks = matchBooks(bookPart);

  if (matchedBooks.length === 0) return [];

  const suggestions: Suggestion[] = [];

  // Parse chapter:verse from rest
  const cvMatch = rest.match(/^(\d+)\s*(?::(\d+)(?:\s*-\s*(\d+))?)?$/);
  const chapter = cvMatch?.[1];
  const verse = cvMatch?.[2];
  const verseEnd = cvMatch?.[3];

  for (const book of matchedBooks) {
    if (suggestions.length >= MAX_SUGGESTIONS) break;

    if (!chapter) {
      // Just book name typed - suggest the book
      suggestions.push({
        display: book,
        reference: book,
        type: 'book',
      });

      // Also suggest first few popular chapters if only one book matches
      if (matchedBooks.length === 1) {
        const chapters = BibleRepository.getChapters(book);
        for (const ch of chapters.slice(0, Math.min(3, MAX_SUGGESTIONS - suggestions.length))) {
          suggestions.push({
            display: `${book} ${ch}`,
            reference: `${book} ${ch}`,
            type: 'chapter',
          });
        }
      }
    } else if (!verse) {
      // Book + chapter typed - suggest chapter and individual verses
      const chapters = BibleRepository.getChapters(book);
      if (chapters.includes(chapter)) {
        suggestions.push({
          display: `${book} ${chapter}`,
          reference: `${book} ${chapter}`,
          type: 'chapter',
        });

        // Suggest first few verses
        const verses = BibleRepository.getVerses(book, chapter);
        for (const v of verses.slice(0, Math.min(MAX_SUGGESTIONS - suggestions.length, 5))) {
          suggestions.push({
            display: `${book} ${chapter}:${v.verse}`,
            reference: `${book} ${chapter}:${v.verse}`,
            type: 'verse',
          });
        }
      } else {
        // Partial chapter number - find matching chapters
        const matchingChapters = chapters.filter(ch => ch.startsWith(chapter));
        for (const ch of matchingChapters.slice(0, MAX_SUGGESTIONS - suggestions.length)) {
          suggestions.push({
            display: `${book} ${ch}`,
            reference: `${book} ${ch}`,
            type: 'chapter',
          });
        }
      }
    } else {
      // Book + chapter + verse typed
      const verses = BibleRepository.getVerses(book, chapter);
      const ref = verseEnd
        ? `${book} ${chapter}:${verse}-${verseEnd}`
        : `${book} ${chapter}:${verse}`;

      // Exact verse suggestion
      const exactVerse = verses.find(v => v.verse === verse);
      if (exactVerse) {
        suggestions.push({
          display: ref,
          reference: ref,
          type: 'verse',
        });

        // Suggest a few following verses as ranges
        const verseNum = parseInt(verse, 10);
        for (let i = 1; i <= Math.min(3, MAX_SUGGESTIONS - suggestions.length); i++) {
          const endV = String(verseNum + i);
          if (verses.find(v => v.verse === endV)) {
            suggestions.push({
              display: `${book} ${chapter}:${verse}-${endV}`,
              reference: `${book} ${chapter}:${verse}-${endV}`,
              type: 'verse',
            });
          }
        }
      } else {
        // Partial verse number - find matching verses
        const matchingVerses = verses.filter(v => v.verse.startsWith(verse));
        for (const v of matchingVerses.slice(0, MAX_SUGGESTIONS - suggestions.length)) {
          suggestions.push({
            display: `${book} ${chapter}:${v.verse}`,
            reference: `${book} ${chapter}:${v.verse}`,
            type: 'verse',
          });
        }
      }
    }
  }

  return suggestions.slice(0, MAX_SUGGESTIONS);
}

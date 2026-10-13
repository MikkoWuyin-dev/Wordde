// Wordde - Search Engine
// Ranks and returns passages based on query
// Per PRD: Pure ranking logic, read-only access to Bible data

import { BibleRepository } from './bibleRepository';
import type { Passage, SearchResult, SemanticEntry } from './types';

class SearchEngineClass {
  private semanticIndex: SemanticEntry[] = [];
  private semanticLoaded = false;

  /**
   * Load semantic index from JSON file
   */
  async loadSemanticIndex(path: string = '/data/semanticIndex.json'): Promise<void> {
    if (this.semanticLoaded) return;
    try {
      const response = await fetch(path);
      this.semanticIndex = await response.json();
      this.semanticLoaded = true;
    } catch (error) {
      console.warn('Failed to load semantic index:', error);
    }
  }

  /**
   * Search for passages matching the query
   * Priority: exact reference > semantic > keyword
   */
  search(query: string, translation: string = 'KJV', limit: number = 5): SearchResult[] {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return [];

    const results: SearchResult[] = [];
    const existingRefs = new Set<string>();

    // 1. Exact reference match (highest priority)
    const exactMatches = BibleRepository.searchByReference(trimmedQuery);
    if (exactMatches.length > 0) {
      exactMatches.forEach((result, index) => {
        if (results.length < limit && !existingRefs.has(result.passage.displayReference)) {
          results.push({ ...result, score: 100 - index * 0 }); // All exact matches score 100
          existingRefs.add(result.passage.displayReference);
        }
      });
    }

    // 2. Nearby verses for exact matches (use first match if multiple)
    if (exactMatches.length > 0 && results.length < limit) {
      const firstMatch = exactMatches[0].passage;
      const nearbyPassages = this.getNearbyPassages(firstMatch, 2);
      nearbyPassages.forEach((passage, index) => {
        if (results.length < limit && !existingRefs.has(passage.displayReference)) {
          results.push({ passage, score: 90 - index * 5, matchType: 'reference' });
          existingRefs.add(passage.displayReference);
        }
      });
    }

    // 3. Semantic index matches
    if (results.length < limit && trimmedQuery.length >= 2) {
      const semanticResults = this.searchSemanticIndex(trimmedQuery, translation);
      semanticResults.forEach((result, index) => {
        if (results.length < limit && !existingRefs.has(result.passage.displayReference)) {
          results.push({ ...result, score: 80 - index * 3 });
          existingRefs.add(result.passage.displayReference);
        }
      });
    }

    // 4. Keyword search for remaining slots
    if (results.length < limit && trimmedQuery.length >= 3) {
      const keywordResults = BibleRepository.searchByKeyword(trimmedQuery, limit - results.length + 5);
      keywordResults.forEach((passage, index) => {
        if (results.length < limit && !existingRefs.has(passage.displayReference)) {
          results.push({ passage, score: 50 - index * 2, matchType: 'keyword' });
          existingRefs.add(passage.displayReference);
        }
      });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Search the semantic index by matching query against labels and synonyms
   */
  private searchSemanticIndex(query: string, translation: string): SearchResult[] {
    const lowerQuery = query.toLowerCase();
    const scored: { entry: SemanticEntry; score: number }[] = [];

    for (const entry of this.semanticIndex) {
      let bestScore = 0;

      // Check label
      const lowerLabel = entry.label.toLowerCase();
      if (lowerLabel === lowerQuery) {
        bestScore = 80;
      } else if (lowerLabel.includes(lowerQuery)) {
        bestScore = 70;
      }

      // Check synonyms
      for (const syn of entry.synonyms) {
        const lowerSyn = syn.toLowerCase();
        if (lowerSyn === lowerQuery) {
          bestScore = Math.max(bestScore, 78);
        } else if (lowerSyn.includes(lowerQuery)) {
          bestScore = Math.max(bestScore, 65);
        } else if (lowerQuery.split(/\s+/).some(word => word.length > 2 && lowerSyn.includes(word))) {
          bestScore = Math.max(bestScore, 55);
        }
      }

      if (bestScore > 0) {
        scored.push({ entry, score: bestScore });
      }
    }

    // Sort by score and convert to SearchResults
    scored.sort((a, b) => b.score - a.score);

    const results: SearchResult[] = [];
    for (const { entry, score } of scored.slice(0, 10)) {
      const passage = BibleRepository.getPassage({
        book: entry.passage.book,
        chapter: entry.passage.chapter,
        verseStart: entry.passage.verseStart,
        verseEnd: entry.passage.verseEnd,
        translation,
      });
      if (passage) {
        results.push({ passage, score, matchType: 'semantic' });
      }
    }

    return results;
  }

  /**
   * Get nearby passages for context
   */
  private getNearbyPassages(basePassage: Passage, count: number): Passage[] {
    const results: Passage[] = [];
    const { book, chapter, verseStart, translation } = basePassage.reference;

    // VF-003: never derive a verse key arithmetically. `parseInt('3a') + 1`
    // silently skips the real '3b' key and mis-orders lettered passages, and
    // the previous version also read the chapter without the translation the
    // search ran under. Walk the normalized chapter order with the same
    // primitive stateManager uses for queue pre-load, threading the reference's
    // translation through every read so both reads agree mid-flight.
    let currentVerse = verseStart;
    for (let i = 0; i < count; i++) {
      const next = BibleRepository.getNextVerse(book, chapter, currentVerse, translation);
      if (!next) break;
      const passage = BibleRepository.getPassage({
        book: next.book,
        chapter: next.chapter,
        verseStart: next.verse,
        translation,
      });
      if (passage) results.push(passage);
      currentVerse = next.verse;
    }

    return results;
  }

  /**
   * Quick validation check for search input
   */
  isValidInput(query: string): boolean {
    const sanitized = query.replace(/[<>{}[\]\\]/g, '');
    return sanitized === query && query.length <= 200;
  }
}

// Singleton instance
export const SearchEngine = new SearchEngineClass();

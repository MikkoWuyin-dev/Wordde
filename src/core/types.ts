// Bible Projection App - Core Type Definitions
// Based on PRD and MCD specifications

/**
 * Represents a single verse from the Bible data
 * Matches the guaranteed source shape from PRD
 */
export interface Verse {
  verse: string; // Verse number as string (no coercion)
  text: string;  // Verbatim scripture text
}

/**
 * Represents a chapter containing verses
 */
export interface Chapter {
  chapter: string; // Chapter number as string
  verses: Verse[];
}

/**
 * Represents a book of the Bible
 * Matches the canonical internal representation
 */
export interface BibleBook {
  book: string;
  chapters: Chapter[];
}

/**
 * A reference to a specific passage
 */
export interface PassageReference {
  book: string;
  chapter: string;
  verseStart: string;
  verseEnd?: string; // Optional for ranges
  translation: string;
}

/**
 * A passage with its full text and reference
 */
export interface Passage {
  reference: PassageReference;
  displayReference: string; // Formatted string like "John 3:16"
  text: string;
  verses: Verse[];
}

/**
 * Search result with ranking information
 */
export interface SearchResult {
  passage: Passage;
  score: number;
  matchType: 'exact' | 'reference' | 'keyword' | 'semantic';
}

/**
 * Semantic Index entry for events, places, and people
 */
export interface SemanticEntry {
  label: string;
  synonyms: string[];
  category: 'event' | 'place' | 'person';
  passage: {
    book: string;
    chapter: string;
    verseStart: string;
    verseEnd: string;
  };
}

/**
 * Application State Model (V1)
 * Per State Inventory from PRD
 */
export interface AppState {
  // Search Query State
  searchQuery: string;
  
  // Search Results State (derived)
  searchResults: SearchResult[];
  
  // Preview Passage State
  previewPassage: Passage | null;
  
  // Selected result index for keyboard navigation
  selectedResultIndex: number;
  
  // Committed Passage State (NOT updated in preview flow)
  committedPassage: Passage | null;
  
  // Current Translation State
  currentTranslation: string;
  
  // Display Mode State
  displayMode: 'dual' | 'operator-only';
  
  // Loading states
  isLoading: boolean;
  isBibleLoaded: boolean;
}

/**
 * Actions that can mutate state
 * All mutations go through StateManager
 */
/**
 * A single projection slide
 */
export interface Slide {
  reference: string;   // e.g. "Genesis 1:1"
  text: string;        // verse text
  book: string;
  chapter: string;
  verse: string;
}

/**
 * Actions that can mutate state
 * All mutations go through StateManager
 */
export type StateAction =
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'SET_SEARCH_RESULTS'; payload: SearchResult[] }
  | { type: 'SET_PREVIEW'; payload: Passage | null }
  | { type: 'SET_SELECTED_INDEX'; payload: number }
  | { type: 'COMMIT_PASSAGE' } // Commits current preview
  | { type: 'CLEAR_PREVIEW' }
  | { type: 'SET_TRANSLATION'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_BIBLE_LOADED'; payload: boolean };

// Bible Projection App - State Manager
// Single source of truth for all application state
// Per MCD: State is the truth. UI is a projection.

import { create } from 'zustand';
import type { AppState, Passage, Slide, SearchResult } from './types';
import { BibleRepository } from './bibleRepository';
import { broadcastCommit, broadcastBlank, broadcastUnblank, loadBlankSettings, persistProjectionState } from './broadcastSync';
import { buildRecoverySnapshot, saveRecoverySnapshot, loadRecoverySnapshot } from './projectionRecovery';


/**
 * Determines if two slides belong to the same reference group (same book + chapter).
 * Verse-to-verse navigation within the same chapter should NOT push to the undo stack.
 */
function isSameReferenceGroup(a: Slide | null, b: Slide | null): boolean {
  if (!a || !b) return false;
  return a.book === b.book && a.chapter === b.chapter;
}

interface StateManager extends AppState {
  // State mutation methods
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: SearchResult[]) => void;
  setPreview: (passage: Passage | null) => void;
  setSelectedIndex: (index: number) => void;
  commitPassage: () => void;
  clearPreview: () => void;
  setTranslation: (translation: string) => Promise<void>;
  setLoading: (loading: boolean) => void;
  setBibleLoaded: (loaded: boolean) => void;

  // Search result navigation
  selectNext: () => void;
  selectPrevious: () => void;

  // Projection queue (slide-based)
  projectionQueue: Slide[];
  currentSlideIndex: number;
  liveSlideIndex: number | null;
  isScreenBlanked: boolean;

  // Slide actions
  buildQueueFromPassage: (passage: Passage) => void;
  buildQueueFromChapter: (book: string, chapter: string) => void;

  // Recent passages
  recentPassages: string[];
  addToRecent: (reference: string) => void;
  removeFromRecent: (reference: string) => void;
  clearAllRecent: () => void;

  // Projection history (reference-level undo)
  historyStack: Slide[];
  undoProjection: () => void;

  // Projection recovery (operator reload/crash resilience)
  /** Persist the small recovery snapshot of the active projection session. */
  persistRecoveryState: () => void;
  /** Restore the active projection session after an operator reload. Returns true if restored. */
  restoreProjectionSession: () => boolean;


  // Projection lock
  projectionLocked: boolean;
  toggleProjectionLock: () => void;
  projectNow: () => void;

  slideNext: () => void;
  slidePrevious: () => void;
  commitCurrentSlide: () => void;
  /** Internal: commit with a pre-captured old live slide for correct history tracking */
  _commitWithOldSlide: (oldLiveSlide: Slide | null) => void;
  blankScreen: () => void;
  loadChapterAsQueue: () => void;

  // Legacy committed passage (derived from live slide)
  committedPassage: Passage | null;

  // Legacy navigation kept for header controls
  goToNextVerse: () => void;
  goToPreviousVerse: () => void;
  goToNextChapter: () => void;
  goToPreviousChapter: () => void;
  displayCurrentChapter: () => void;
  previewNextVerse: () => void;
  previewPreviousVerse: () => void;
  previewCurrentChapter: () => void;
}

function passageToSlides(passage: Passage): Slide[] {
  return passage.verses.map((v) => ({
    reference: `${passage.reference.book} ${passage.reference.chapter}:${v.verse}`,
    text: v.text,
    book: passage.reference.book,
    chapter: passage.reference.chapter,
    verse: v.verse,
  }));
}

function chapterToSlides(book: string, chapter: string, translation?: string): Slide[] {
  const verses = BibleRepository.getVerses(book, chapter, translation);
  return verses.map((v) => ({
    reference: `${book} ${chapter}:${v.verse}`,
    text: v.text,
    book,
    chapter,
    verse: v.verse,
  }));
}

function slideToPassage(slide: Slide, translation: string): Passage {
  return {
    reference: {
      book: slide.book,
      chapter: slide.chapter,
      verseStart: slide.verse,
      translation,
    },
    displayReference: slide.reference,
    text: slide.text,
    verses: [{ verse: slide.verse, text: slide.text }],
  };
}

/**
 * Core projection function: updates history stack using reference grouping,
 * then broadcasts the slide to the projection screen.
 */
function projectSlide(
  slide: Slide,
  currentSlideIndex: number,
  get: () => StateManager,
  set: (partial: Partial<StateManager>) => void,
  oldLiveSlideOverride?: Slide | null,
) {
  const { liveSlideIndex, projectionQueue, historyStack, currentTranslation } = get();
  // Use override when the queue was replaced before this call
  const oldLiveSlide = oldLiveSlideOverride !== undefined
    ? oldLiveSlideOverride
    : (liveSlideIndex !== null ? projectionQueue[liveSlideIndex] ?? null : null);

  // Only push to history if transitioning to a DIFFERENT passage (book/chapter)
  if (oldLiveSlide && !isSameReferenceGroup(oldLiveSlide, slide)) {
    set({
      historyStack: [...historyStack, oldLiveSlide].slice(-10),
    });
  }

  const passage = slideToPassage(slide, currentTranslation);
  set({
    liveSlideIndex: currentSlideIndex,
    committedPassage: passage,
    isScreenBlanked: false,
  });
  // Persistence must never break a live projection: broadcast first, then persist.
  broadcastCommit(passage);
  try {
    localStorage.setItem('currentProjection', JSON.stringify(passage));
    persistProjectionState({ passage, isBlanked: false, timestamp: Date.now() });
  } catch (error) {
    console.warn('[projectSlide] Failed to persist projection state:', error);
  }
  get().addToRecent(slide.reference);

  // Pre-load next slide
  if (currentSlideIndex >= get().projectionQueue.length - 1) {
    const nextPos = BibleRepository.getNextVerse(slide.book, slide.chapter, slide.verse, currentTranslation);
    if (nextPos) {
      const verse = BibleRepository.getVerse(nextPos.book, nextPos.chapter, nextPos.verse, currentTranslation);
      if (verse) {
        set({
          projectionQueue: [
            ...get().projectionQueue,
            {
              reference: `${nextPos.book} ${nextPos.chapter}:${nextPos.verse}`,
              text: verse.text,
              book: nextPos.book,
              chapter: nextPos.chapter,
              verse: nextPos.verse,
            },
          ],
        });
      }
    }
  }

  // Recovery snapshot last — after authoritative state + broadcast.
  get().persistRecoveryState();
}


export const useStateManager = create<StateManager>((set, get) => ({
  // App state
  searchQuery: '',
  searchResults: [],
  previewPassage: null,
  selectedResultIndex: -1,
  committedPassage: null,
  currentTranslation: 'KJV',
  displayMode: 'operator-only',
  isLoading: false,
  isBibleLoaded: false,

  // Projection queue state
  historyStack: [],
  projectionLocked: false,
  projectionQueue: [],
  currentSlideIndex: 0,
  liveSlideIndex: null,
  isScreenBlanked: false,

  // Recent passages
  recentPassages: (() => {
    try { return JSON.parse(localStorage.getItem('recentPassages') || '[]'); } catch { return []; }
  })(),
  addToRecent: (reference: string) => {
    const MAX = 15;
    const current = get().recentPassages.filter(r => r !== reference);
    const updated = [reference, ...current].slice(0, MAX);
    set({ recentPassages: updated });
    localStorage.setItem('recentPassages', JSON.stringify(updated));
  },
  removeFromRecent: (reference: string) => {
    const updated = get().recentPassages.filter(r => r !== reference);
    set({ recentPassages: updated });
    localStorage.setItem('recentPassages', JSON.stringify(updated));
  },
  clearAllRecent: () => {
    set({ recentPassages: [] });
    localStorage.setItem('recentPassages', JSON.stringify([]));
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  setSearchResults: (results) => {
    // Only update the results list and preview — do NOT project automatically.
    // Projection happens only on explicit user action (Enter / click).
    set({
      searchResults: results,
      selectedResultIndex: results.length > 0 ? 0 : -1,
      previewPassage: results.length > 0 ? results[0].passage : null,
    });
  },

  setPreview: (passage) => {
    set({ previewPassage: passage });
    if (passage) {
      const { projectionQueue, liveSlideIndex } = get();
      const oldLiveSlide = liveSlideIndex !== null ? projectionQueue[liveSlideIndex] ?? null : null;
      const slides = passageToSlides(passage);
      set({ projectionQueue: slides, currentSlideIndex: 0 });
      get()._commitWithOldSlide(oldLiveSlide);
    }
  },

  setSelectedIndex: (index) => {
    const { searchResults } = get();
    if (index >= 0 && index < searchResults.length) {
      // Preview only — no projection until explicit action
      set({
        selectedResultIndex: index,
        previewPassage: searchResults[index].passage,
      });
    }
  },

  commitPassage: () => {
    get().commitCurrentSlide();
  },

  clearPreview: () => {
    set({
      searchQuery: '',
      searchResults: [],
      previewPassage: null,
      selectedResultIndex: -1,
      projectionQueue: [],
      currentSlideIndex: 0,
    });
  },

  setTranslation: async (translation) => {
    const previousTranslation = get().currentTranslation;
    if (translation === previousTranslation && BibleRepository.isTranslationLoaded(translation)) {
      return;
    }

    // Translations are preloaded on app boot. This is normally a no-op,
    // but we keep the guard so manual reloads or future translations still work.
    if (!BibleRepository.isTranslationLoaded(translation)) {
      try {
        console.log(`[setTranslation] "${translation}" not preloaded; loading on demand…`);
        await BibleRepository.loadTranslation(translation);
      } catch (error) {
        console.error(`[setTranslation] Failed to load "${translation}":`, error);
        // Stay on the previously working translation — do NOT force-revert to KJV.
        return;
      }
    }

    set({ currentTranslation: translation });
    BibleRepository.setCurrentTranslation(translation);

    // If there's a live slide, re-project it in the new translation
    const { projectionQueue, liveSlideIndex } = get();
    const liveSlide = liveSlideIndex !== null ? projectionQueue[liveSlideIndex] ?? null : null;
    if (liveSlide) {
      const passage = BibleRepository.getPassage({
        book: liveSlide.book,
        chapter: liveSlide.chapter,
        verseStart: liveSlide.verse,
        translation,
      });
      if (passage) {
        const slides = passageToSlides(passage);
        set({ projectionQueue: slides, currentSlideIndex: 0 });
        get()._commitWithOldSlide(liveSlide);
      } else {
        console.warn(
          `[setTranslation] Live slide ${liveSlide.reference} not found in ${translation}; leaving queue as-is.`,
        );
      }
    }
    // Translation is part of the recovery contract, so snapshot it even when
    // nothing is live (projectSlide already snapshots the re-projection case).
    get().persistRecoveryState();
  },


  setLoading: (loading) => set({ isLoading: loading }),
  setBibleLoaded: (loaded) => set({ isBibleLoaded: loaded }),

  selectNext: () => {
    const { selectedResultIndex, searchResults } = get();
    if (selectedResultIndex < searchResults.length - 1) {
      const newIndex = selectedResultIndex + 1;
      const passage = searchResults[newIndex].passage;
      const slides = passageToSlides(passage);
      set({
        selectedResultIndex: newIndex,
        previewPassage: passage,
        projectionQueue: slides,
        currentSlideIndex: 0,
      });
    }
  },

  selectPrevious: () => {
    const { selectedResultIndex, searchResults } = get();
    if (selectedResultIndex > 0) {
      const newIndex = selectedResultIndex - 1;
      const passage = searchResults[newIndex].passage;
      const slides = passageToSlides(passage);
      set({
        selectedResultIndex: newIndex,
        previewPassage: passage,
        projectionQueue: slides,
        currentSlideIndex: 0,
      });
    }
  },

  // === Slide queue operations ===

  buildQueueFromPassage: (passage) => {
    // Capture old live slide BEFORE replacing the queue
    const { projectionQueue, liveSlideIndex } = get();
    const oldLiveSlide = liveSlideIndex !== null ? projectionQueue[liveSlideIndex] ?? null : null;
    const slides = passageToSlides(passage);
    set({ projectionQueue: slides, currentSlideIndex: 0 });
    get()._commitWithOldSlide(oldLiveSlide);
  },

  buildQueueFromChapter: (book, chapter) => {
    // Capture old live slide BEFORE replacing the queue
    const { projectionQueue, liveSlideIndex, currentTranslation } = get();
    const oldLiveSlide = liveSlideIndex !== null ? projectionQueue[liveSlideIndex] ?? null : null;
    const slides = chapterToSlides(book, chapter, currentTranslation);
    set({ projectionQueue: slides, currentSlideIndex: 0 });
    get()._commitWithOldSlide(oldLiveSlide);
  },

  slideNext: () => {
    const { currentSlideIndex, projectionQueue, currentTranslation } = get();
    if (currentSlideIndex < projectionQueue.length - 1) {
      set({ currentSlideIndex: currentSlideIndex + 1 });
    } else {
      const lastSlide = projectionQueue[projectionQueue.length - 1];
      if (!lastSlide) return;
      const nextPos = BibleRepository.getNextVerse(lastSlide.book, lastSlide.chapter, lastSlide.verse, currentTranslation);
      if (!nextPos) return;
      const verse = BibleRepository.getVerse(nextPos.book, nextPos.chapter, nextPos.verse, currentTranslation);
      if (!verse) return;
      const newSlide: Slide = {
        reference: `${nextPos.book} ${nextPos.chapter}:${nextPos.verse}`,
        text: verse.text,
        book: nextPos.book,
        chapter: nextPos.chapter,
        verse: nextPos.verse,
      };
      set({
        projectionQueue: [...projectionQueue, newSlide],
        currentSlideIndex: currentSlideIndex + 1,
      });
    }
    get().persistRecoveryState();
  },


  slidePrevious: () => {
    const { currentSlideIndex, projectionQueue, currentTranslation } = get();
    if (currentSlideIndex > 0) {
      set({ currentSlideIndex: currentSlideIndex - 1 });
    } else {
      const firstSlide = projectionQueue[0];
      if (!firstSlide) return;
      const prevPos = BibleRepository.getPreviousVerse(firstSlide.book, firstSlide.chapter, firstSlide.verse, currentTranslation);
      if (!prevPos) return;
      const verse = BibleRepository.getVerse(prevPos.book, prevPos.chapter, prevPos.verse, currentTranslation);
      if (!verse) return;
      const newSlide: Slide = {
        reference: `${prevPos.book} ${prevPos.chapter}:${prevPos.verse}`,
        text: verse.text,
        book: prevPos.book,
        chapter: prevPos.chapter,
        verse: prevPos.verse,
      };
      set({
        projectionQueue: [newSlide, ...projectionQueue],
        currentSlideIndex: 0,
      });
    }
    get().persistRecoveryState();
  },


  undoProjection: () => {
    const { historyStack, currentTranslation } = get();
    if (historyStack.length === 0) return;
    const last = historyStack[historyStack.length - 1];
    // Pop from history — do NOT push current back (true undo)
    set({ historyStack: historyStack.slice(0, -1) });
    const passage = slideToPassage(last, currentTranslation);
    const slides = passageToSlides(passage);
    set({ projectionQueue: slides, currentSlideIndex: 0 });
    // Project directly without history tracking (pass null to skip history push)
    const slide = slides[0];
    if (slide) {
      const p = slideToPassage(slide, currentTranslation);
      set({ liveSlideIndex: 0, committedPassage: p, isScreenBlanked: false });
      broadcastCommit(p);
      try {
        persistProjectionState({ passage: p, isBlanked: false, timestamp: Date.now() });
      } catch (error) {
        console.warn('[undoProjection] Failed to persist projection state:', error);
      }
      get().addToRecent(slide.reference);
      get().persistRecoveryState();
    }
  },

  persistRecoveryState: () => {
    const {
      projectionQueue,
      currentSlideIndex,
      liveSlideIndex,
      committedPassage,
      isScreenBlanked,
      currentTranslation,
      projectionLocked,
      historyStack,
    } = get();
    if (projectionQueue.length === 0) return;
    saveRecoverySnapshot(
      buildRecoverySnapshot({
        projectionQueue,
        currentSlideIndex,
        liveSlideIndex,
        committedPassage,
        isScreenBlanked,
        currentTranslation,
        projectionLocked,
        historyStack,
      }),
    );
  },

  restoreProjectionSession: () => {
    const snapshot = loadRecoverySnapshot();
    if (!snapshot) return false;

    // Restore ONLY the active projection/navigation session. No broadcast is
    // performed here: the Projection Window keeps its own last-committed
    // passage, so restoring must never re-project or promote a preview.
    set({
      projectionQueue: snapshot.queue,
      currentSlideIndex: snapshot.currentSlideIndex,
      liveSlideIndex: snapshot.liveSlideIndex,
      committedPassage: snapshot.committedPassage,
      isScreenBlanked: snapshot.isScreenBlanked,
      currentTranslation: snapshot.currentTranslation,
      projectionLocked: snapshot.projectionLocked,
      historyStack: snapshot.historyStack,
    });
    BibleRepository.setCurrentTranslation(snapshot.currentTranslation);
    console.log('[restoreProjectionSession] Recovered projection session:', {
      queue: snapshot.queue.length,
      currentSlideIndex: snapshot.currentSlideIndex,
      liveSlideIndex: snapshot.liveSlideIndex,
      translation: snapshot.currentTranslation,
      blanked: snapshot.isScreenBlanked,
    });
    return true;
  },

  toggleProjectionLock: () => {
    set({ projectionLocked: !get().projectionLocked });
    get().persistRecoveryState();
  },


  projectNow: () => {
    const { projectionQueue, currentSlideIndex } = get();
    const slide = projectionQueue[currentSlideIndex];
    if (!slide) return;
    projectSlide(slide, currentSlideIndex, get, set);
  },

  commitCurrentSlide: () => {
    const { projectionQueue, currentSlideIndex, projectionLocked, currentTranslation } = get();
    const slide = projectionQueue[currentSlideIndex];
    if (!slide) return;

    // When locked, only update preview — do NOT broadcast
    if (projectionLocked) {
      if (currentSlideIndex >= projectionQueue.length - 1) {
        const nextPos = BibleRepository.getNextVerse(slide.book, slide.chapter, slide.verse, currentTranslation);
        if (nextPos) {
          const verse = BibleRepository.getVerse(nextPos.book, nextPos.chapter, nextPos.verse, currentTranslation);
          if (verse) {
            set({
              projectionQueue: [
                ...get().projectionQueue,
                {
                  reference: `${nextPos.book} ${nextPos.chapter}:${nextPos.verse}`,
                  text: verse.text,
                  book: nextPos.book,
                  chapter: nextPos.chapter,
                  verse: nextPos.verse,
                },
              ],
            });
          }
        }
      }
      return;
    }

    // Normal (unlocked) projection through single entry point
    projectSlide(slide, currentSlideIndex, get, set);
  },

  _commitWithOldSlide: (oldLiveSlide: Slide | null) => {
    const { projectionQueue, currentSlideIndex, projectionLocked, currentTranslation } = get();
    const slide = projectionQueue[currentSlideIndex];
    if (!slide) return;

    if (projectionLocked) {
      // Same pre-load logic as commitCurrentSlide
      if (currentSlideIndex >= projectionQueue.length - 1) {
        const nextPos = BibleRepository.getNextVerse(slide.book, slide.chapter, slide.verse, currentTranslation);
        if (nextPos) {
          const verse = BibleRepository.getVerse(nextPos.book, nextPos.chapter, nextPos.verse, currentTranslation);
          if (verse) {
            set({
              projectionQueue: [
                ...get().projectionQueue,
                {
                  reference: `${nextPos.book} ${nextPos.chapter}:${nextPos.verse}`,
                  text: verse.text,
                  book: nextPos.book,
                  chapter: nextPos.chapter,
                  verse: nextPos.verse,
                },
              ],
            });
          }
        }
      }
      return;
    }

    projectSlide(slide, currentSlideIndex, get, set, oldLiveSlide);
  },

  blankScreen: () => {
    const { isScreenBlanked, committedPassage } = get();
    if (isScreenBlanked) {
      set({ isScreenBlanked: false });
      broadcastUnblank();
      try {
        persistProjectionState({ passage: committedPassage, isBlanked: false, timestamp: Date.now() });
      } catch (error) {
        console.warn('[blankScreen] Failed to persist projection state:', error);
      }
    } else {
      set({ isScreenBlanked: true });
      const settings = loadBlankSettings();
      broadcastBlank(settings);
      try {
        persistProjectionState({ passage: committedPassage, isBlanked: true, blankSettings: settings, timestamp: Date.now() });
      } catch (error) {
        console.warn('[blankScreen] Failed to persist projection state:', error);
      }
    }
    get().persistRecoveryState();
  },

  loadChapterAsQueue: () => {
    const { projectionQueue, currentSlideIndex, previewPassage, currentTranslation } = get();
    const slide = projectionQueue[currentSlideIndex];
    const book = slide?.book || previewPassage?.reference.book;
    const chapter = slide?.chapter || previewPassage?.reference.chapter;
    if (!book || !chapter) return;

    const slides = chapterToSlides(book, chapter, currentTranslation);
    if (slides.length === 0) return;

    const verses = BibleRepository.getVerses(book, chapter, currentTranslation);
    const chapterPassage = BibleRepository.getPassage({
      book,
      chapter,
      verseStart: verses[0].verse,
      verseEnd: verses[verses.length - 1].verse,
      translation: currentTranslation,
    });

    set({
      projectionQueue: slides,
      currentSlideIndex: 0,
      liveSlideIndex: null,
    });

    if (chapterPassage) {
      set({ committedPassage: chapterPassage, isScreenBlanked: false });
      broadcastCommit(chapterPassage);
      try {
        persistProjectionState({ passage: chapterPassage, isBlanked: false, timestamp: Date.now() });
      } catch (error) {
        console.warn('[loadChapterAsQueue] Failed to persist projection state:', error);
      }
    }
    get().persistRecoveryState();
  },


  // === Legacy navigation methods ===
  goToNextVerse: () => {
    get().slideNext();
    get().commitCurrentSlide();
  },
  goToPreviousVerse: () => {
    get().slidePrevious();
    get().commitCurrentSlide();
  },
  goToNextChapter: () => {
    const { committedPassage, currentTranslation, projectionQueue, liveSlideIndex } = get();
    if (!committedPassage) return;
    const oldLiveSlide = liveSlideIndex !== null ? projectionQueue[liveSlideIndex] ?? null : null;
    const { book, chapter } = committedPassage.reference;
    // Chapter order comes from the normalized chapters array, not arithmetic.
    const chapterList = BibleRepository.getChapters(book, currentTranslation);
    const chapterIdx = chapterList.indexOf(chapter);
    const nextChapter = chapterIdx >= 0 ? chapterList[chapterIdx + 1] : undefined;
    const nextChapterVerses = nextChapter ? BibleRepository.getVerses(book, nextChapter, currentTranslation) : [];
    if (nextChapter && nextChapterVerses.length > 0) {
      const slides = chapterToSlides(book, nextChapter, currentTranslation);
      const passage = BibleRepository.getPassage({ book, chapter: nextChapter, verseStart: nextChapterVerses[0].verse, translation: currentTranslation });
      if (passage) {
        set({ projectionQueue: slides, currentSlideIndex: 0 });
        get()._commitWithOldSlide(oldLiveSlide);
      }
      return;
    }
    const allBooks = BibleRepository.getAllBooks();
    const bookIndex = allBooks.findIndex(b => b.toLowerCase() === book.toLowerCase());
    if (bookIndex >= 0 && bookIndex < allBooks.length - 1) {
      const nextBook = allBooks[bookIndex + 1];
      const chapters = BibleRepository.getChapters(nextBook, currentTranslation);
      const firstVerses = chapters.length > 0 ? BibleRepository.getVerses(nextBook, chapters[0], currentTranslation) : [];
      if (chapters.length > 0 && firstVerses.length > 0) {
        const slides = chapterToSlides(nextBook, chapters[0], currentTranslation);
        const passage = BibleRepository.getPassage({ book: nextBook, chapter: chapters[0], verseStart: firstVerses[0].verse, translation: currentTranslation });
        if (passage) {
          set({ projectionQueue: slides, currentSlideIndex: 0 });
          get()._commitWithOldSlide(oldLiveSlide);
        }
      }
    }
  },
  goToPreviousChapter: () => {
    const { committedPassage, currentTranslation, projectionQueue, liveSlideIndex } = get();
    if (!committedPassage) return;
    const oldLiveSlide = liveSlideIndex !== null ? projectionQueue[liveSlideIndex] ?? null : null;
    const { book, chapter } = committedPassage.reference;
    const chapterList = BibleRepository.getChapters(book, currentTranslation);
    const chapterIdx = chapterList.indexOf(chapter);
    const prevChapter = chapterIdx > 0 ? chapterList[chapterIdx - 1] : undefined;
    const prevChapterVerses = prevChapter ? BibleRepository.getVerses(book, prevChapter, currentTranslation) : [];
    if (prevChapter && prevChapterVerses.length > 0) {
      const slides = chapterToSlides(book, prevChapter, currentTranslation);
      const passage = BibleRepository.getPassage({ book, chapter: prevChapter, verseStart: prevChapterVerses[0].verse, translation: currentTranslation });
      if (passage) {
        set({ projectionQueue: slides, currentSlideIndex: 0 });
        get()._commitWithOldSlide(oldLiveSlide);
      }
      return;
    }
    const allBooks = BibleRepository.getAllBooks();
    const bookIndex = allBooks.findIndex(b => b.toLowerCase() === book.toLowerCase());
    if (bookIndex > 0) {
      const prevBook = allBooks[bookIndex - 1];
      const chapters = BibleRepository.getChapters(prevBook, currentTranslation);
      const lastChapter = chapters[chapters.length - 1];
      const lastVerses = lastChapter ? BibleRepository.getVerses(prevBook, lastChapter, currentTranslation) : [];
      if (lastChapter && lastVerses.length > 0) {
        const slides = chapterToSlides(prevBook, lastChapter, currentTranslation);
        const passage = BibleRepository.getPassage({ book: prevBook, chapter: lastChapter, verseStart: lastVerses[0].verse, translation: currentTranslation });
        if (passage) {
          set({ projectionQueue: slides, currentSlideIndex: 0 });
          get()._commitWithOldSlide(oldLiveSlide);
        }
      }
    }
  },
  displayCurrentChapter: () => { get().loadChapterAsQueue(); },
  previewNextVerse: () => { get().slideNext(); },
  previewPreviousVerse: () => { get().slidePrevious(); },
  previewCurrentChapter: () => { get().loadChapterAsQueue(); },
}));

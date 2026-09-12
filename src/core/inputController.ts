// Wordde - Input Controller
// Handles keyboard input and coordinates between UI, SearchEngine, and StateManager
// Per MCD: Input mutates state only

import { useCallback, useEffect, useRef } from 'react';
import { useStateManager } from './stateManager';
import { SearchEngine } from './searchEngine';

/**
 * Input Controller Hook
 * Provides handlers for all operator input actions
 */
export function useInputController() {
  const {
    searchQuery,
    searchResults,
    selectedResultIndex,
    previewPassage,
    currentTranslation,
    setSearchQuery,
    setSearchResults,
    setPreview,
    selectNext,
    selectPrevious,
    commitPassage,
    clearPreview,
  } = useStateManager();
  
  /**
   * Handle search input changes
   * Per Implementation Guide: Capture operator input, query SearchEngine, update preview
   */
  const handleInputChange = useCallback((value: string) => {
    // Validate input
    if (!SearchEngine.isValidInput(value)) {
      return;
    }
    
    // Update search query state
    setSearchQuery(value);
    
    // Empty input -> clear results and preview
    if (!value.trim()) {
      setSearchResults([]);
      setPreview(null);
      return;
    }
    
    // Query SearchEngine with current translation
    const results = SearchEngine.search(value, currentTranslation);
    
    // Update results (this also auto-previews first result)
    setSearchResults(results);
  }, [currentTranslation, setSearchQuery, setSearchResults, setPreview]);
  
  /**
   * Handle keyboard navigation
   * Per MCD: Arrow Up/Down navigate results, Enter commits, Esc clears
   */
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        selectNext();
        break;
        
      case 'ArrowUp':
        event.preventDefault();
        selectPrevious();
        break;

      case 'Enter':
        // Explicit projection: project the selected result (or first result)
        if (searchResults.length > 0) {
          event.preventDefault();
          const idx = selectedResultIndex >= 0 ? selectedResultIndex : 0;
          const passage = searchResults[idx]?.passage;
          if (passage) {
            setPreview(passage); // setPreview projects the passage
          }
        }
        break;
        
      case 'Escape':
        event.preventDefault();
        clearPreview();
        break;
    }
  }, [selectNext, selectPrevious, searchResults, selectedResultIndex, setPreview, clearPreview]);
  
  /**
   * Handle result selection via click
   */
  const handleResultSelect = useCallback((index: number) => {
    if (index >= 0 && index < searchResults.length) {
      setPreview(searchResults[index].passage);
    }
  }, [searchResults, setPreview]);
  
  /**
   * Handle autocomplete suggestion selection
   * Loads the reference through the existing slide generation pipeline
   */
  const handleSuggestionSelect = useCallback((reference: string) => {
    setSearchQuery(reference);
    
    // Query SearchEngine with the selected reference and project the top result
    const results = SearchEngine.search(reference, currentTranslation);
    setSearchResults(results);
    // Explicit user selection → project immediately
    if (results.length > 0) {
      setPreview(results[0].passage);
    }
  }, [currentTranslation, setSearchQuery, setSearchResults, setPreview]);

  return {
    // State
    searchQuery,
    searchResults,
    selectedResultIndex,
    previewPassage,
    
    // Handlers
    handleInputChange,
    handleKeyDown,
    handleResultSelect,
    handleSuggestionSelect,
    
    // Actions
    commitPassage,
    clearPreview,
  };
}

/**
 * Global keyboard shortcuts hook
 * For app-wide keyboard handling including passage navigation
 */
export function useGlobalKeyboard() {
  const {
    clearPreview,
    commitCurrentSlide,
    projectionQueue,
    slideNext,
    slidePrevious,
    loadChapterAsQueue,
    blankScreen,
    goToNextChapter,
    goToPreviousChapter,
    projectNow,
    undoProjection,
  } = useStateManager();

  const handlersRef = useRef({
    clearPreview,
    commitCurrentSlide,
    slideNext,
    slidePrevious,
    loadChapterAsQueue,
    blankScreen,
    goToNextChapter,
    goToPreviousChapter,
    projectNow,
    undoProjection,
  });

  useEffect(() => {
    handlersRef.current = {
      clearPreview,
      commitCurrentSlide,
      slideNext,
      slidePrevious,
      loadChapterAsQueue,
      blankScreen,
      goToNextChapter,
      goToPreviousChapter,
      projectNow,
      undoProjection,
    };
  });

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;

      // Skip shortcuts when the user is typing in an input field.
      // Nuance: the search input auto-focuses on boot, so a blanket skip made
      // every shortcut dead until the operator clicked elsewhere. While the
      // field is focused but EMPTY nothing is being typed, so non-printing
      // navigation keys (arrows, paging, Escape, ?) are safe to pass through.
      // Letters stay blocked in fields: they would both type AND trigger.
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        const emptyInput = target.tagName === 'INPUT' && !(target as HTMLInputElement).value;
        const navigationKeys = [
          'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
          'PageUp', 'PageDown', 'Escape', '?',
        ];
        if (!(emptyInput && navigationKeys.includes(event.key))) {
          return;
        }
      }

      const h = handlersRef.current;

      switch (event.key) {
        case '?':
          // Advertised in the footer help: "? — Show this help".
          event.preventDefault();
          window.dispatchEvent(new CustomEvent('wordde:toggle-shortcut-help'));
          return;

        case 'z':
        case 'Z':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            h.undoProjection();
          }
          return;

        case 'Escape':
          // Advertised as "Esc — Clear preview". Only reached outside input
          // fields (the guard above returns for INPUT/TEXTAREA), where the
          // search field's own handler has already cleared it.
          event.preventDefault();
          h.clearPreview();
          return;

        case 'ArrowRight':
          event.preventDefault();
          h.slideNext();
          h.commitCurrentSlide();
          return;

        case 'ArrowLeft':
          event.preventDefault();
          h.slidePrevious();
          h.commitCurrentSlide();
          return;

        case 'c':
        case 'C':
          // Letters must not hijack OS/browser combos (Ctrl+C copy, etc.).
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          event.preventDefault();
          h.loadChapterAsQueue();
          return;

        case 'b':
        case 'B':
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          event.preventDefault();
          h.blankScreen();
          return;

        case 'PageDown':
          event.preventDefault();
          h.goToNextChapter();
          return;

        case 'PageUp':
          event.preventDefault();
          h.goToPreviousChapter();
          return;

        case 'p':
        case 'P':
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          event.preventDefault();
          h.projectNow();
          return;

        case 'n':
        case 'N':
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          event.preventDefault();
          window.dispatchEvent(new CustomEvent('nextServicePlanPassage'));
          return;

        case 'Enter':
          if (event.shiftKey) {
            event.preventDefault();
            window.dispatchEvent(new CustomEvent('nextServicePlanPassage'));
          }
          return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []); // Registered once, uses refs for current handlers
}

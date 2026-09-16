import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useStateManager } from '@/core/stateManager';
import { SearchInput } from '@/components/operator/SearchInput';
import { useGlobalKeyboard, useInputController } from '@/core/inputController';
import { BibleRepository } from '@/core/bibleRepository';
import type { BibleBook, Passage, Slide } from '@/core/types';

/**
 * Regression suite for the operator's live-typing surface.
 *
 * Drives the REAL pipeline — SearchInput wired to useInputController's
 * handlers plus useGlobalKeyboard — because the original defects lived in
 * the plumbing between the component and the store, not in either alone:
 *
 *  - Escape with the autocomplete dropdown open was swallowed by the
 *    component (preventDefault + stopPropagation + return) — "Esc — clear
 *    preview" never reached clearPreview;
 *  - committing from the field kept focus in the input, and the global
 *    guard (rightly) blocks letters in inputs — so "P — project current
 *    slide" was dead until the operator clicked away;
 *  - plain Enter/Escape with the dropdown closed (no suggestions) also
 *    kept focus, leaving P/B/C/N dead after keyword-ish commits.
 *
 * Key events are dispatched on `document.activeElement` — what a real
 * browser does — so a lost focus release makes the P test fail, exactly
 * as the bug manifested live.
 */

const slide = (verse: string, text = `text ${verse}`): Slide => ({
  reference: `John 3:${verse}`,
  text,
  book: 'John',
  chapter: '3',
  verse,
});

const passageFor = (s: Slide, translation = 'KJV'): Passage => ({
  reference: { book: s.book, chapter: s.chapter, verseStart: s.verse, translation },
  displayReference: s.reference,
  text: s.text,
  verses: [{ verse: s.verse, text: s.text }],
});

const A = slide('16');
const B = slide('17');

/** jsdom has no BroadcastChannel; the commit pipeline requires one. */
class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  constructor(public name: string) {
    FakeBroadcastChannel.instances.push(this);
  }
  postMessage() {}
  addEventListener() {}
  removeEventListener() {}
  close() {}
}

/** Install a minimal John fixture into the repository's private stores. */
function installFixture() {
  const john: BibleBook = {
    book: 'John',
    chapters: [
      {
        chapter: '3',
        verses: [A, B].map((s) => ({ verse: s.verse, text: s.text })),
      },
    ],
  };
  const repo = BibleRepository as unknown as {
    translations: Map<string, Map<string, BibleBook>>;
    bookNames: string[];
    bookAliases: Map<string, string[]>;
    loadedTranslations: Set<string>;
    currentTranslation: string;
  };
  const map = new Map<string, BibleBook>();
  map.set('john', john);
  repo.bookAliases.set('john', ['John']);
  repo.translations.set('KJV', map);
  repo.bookNames = ['John'];
  repo.loadedTranslations.add('KJV');
  repo.currentTranslation = 'KJV';
}

/** Real wiring: SearchInput with useInputController's own handlers. */
function Host() {
  useGlobalKeyboard();
  const { searchQuery, handleInputChange, handleKeyDown, clearPreview, handleSuggestionSelect } =
    useInputController();
  return (
    <SearchInput
      value={searchQuery}
      onChange={handleInputChange}
      onKeyDown={handleKeyDown}
      onClear={clearPreview}
      onSelectSuggestion={handleSuggestionSelect}
    />
  );
}

type StoreState = ReturnType<typeof useStateManager.getState>;
function setStore(partial: Partial<StoreState>) {
  act(() => {
    useStateManager.setState(partial);
  });
}

/** Render the real wiring with `searchQuery` seeded (controls the input). */
function setup(searchQuery: string) {
  setStore({ searchQuery });
  render(<Host />);
  const input = screen.getByRole('textbox') as HTMLInputElement;
  expect(input.value).toBe(searchQuery);
  return { input };
}

beforeEach(() => {
  localStorage.clear();
  FakeBroadcastChannel.instances = [];
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  installFixture();
  // Operator mid-service state: B is staged in the queue but NOTHING is
  // live yet — so a fired "P" is observable (B becomes committed).
  setStore({
    projectionQueue: [B],
    currentSlideIndex: 0,
    liveSlideIndex: null,
    committedPassage: null,
    isScreenBlanked: true,
    currentTranslation: 'KJV',
    projectionLocked: false,
    historyStack: [],
    searchResults: [],
    selectedResultIndex: -1,
    previewPassage: null,
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('SearchInput keyboard contract (real pipeline)', () => {
  it('forwards Escape to clearPreview even with the dropdown open (regression: swallowed)', () => {
    const { input } = setup('Jo'); // book suggestions exist for "Jo"
    // Dropdown is open (controlled value → suggestions effect on mount).
    expect(document.activeElement).toBe(input); // auto-focus boot state
    const dropdownButtons = document.querySelectorAll('button').length;
    expect(dropdownButtons).toBeGreaterThan(0);

    setStore({ previewPassage: passageFor(A) });
    fireEvent.keyDown(input, { key: 'Escape' });

    const s = useStateManager.getState();
    expect(s.previewPassage).toBeNull(); // reached the real clearPreview
    expect(s.searchQuery).toBe(''); // clearPreview also empties the field
    // Dropdown is closed by the component's own Escape handling.
    expect(document.querySelectorAll('button').length).toBe(0);
  });

  it('still clears the preview via the component path when the dropdown is closed (guard blocked)', () => {
    // "Zzz" yields no suggestions, so the global guard blocks Escape for the
    // non-empty input — the component's forward is the only path that can
    // clear the preview here.
    const { input } = setup('Zzz');
    setStore({ previewPassage: passageFor(A) });
    fireEvent.keyDown(input, { key: 'Escape' });

    const s = useStateManager.getState();
    expect(s.previewPassage).toBeNull();
    expect(s.searchQuery).toBe('');
    // Escape ends the typing session — focus must be released.
    expect(document.activeElement).not.toBe(input);
  });

  it('Escape on the empty focused field clears the preview (guard pass-through, boot state)', () => {
    const { input } = setup('');
    setStore({ previewPassage: passageFor(A) });
    fireEvent.keyDown(input, { key: 'Escape' });

    // Reached through BOTH paths (component forward + global guard's
    // empty-input navigation pass-through); preview must be gone.
    expect(useStateManager.getState().previewPassage).toBeNull();
  });

  it('Enter releases focus so the next keystroke (P) reaches the global handler (regression: P dead)', () => {
    const { input } = setup('John 3:16');
    expect(document.activeElement).toBe(input); // focused, text present

    fireEvent.keyDown(input, { key: 'Enter' }); // commit path (no results: no-op)
    expect(document.activeElement).not.toBe(input); // focus released

    // A real browser delivers the next keystroke to document.activeElement.
    fireEvent.keyDown(document.activeElement as Element, { key: 'p' });

    const s = useStateManager.getState();
    // projectNow ran: the staged slide B (John 3:17) became live.
    expect(s.committedPassage?.displayReference).toBe('John 3:17');
    expect(s.liveSlideIndex).toBe(0);
    expect(s.isScreenBlanked).toBe(false);
  });

  it('letters stay blocked while the focused field holds text (no double-fire)', () => {
    const { input } = setup('John 3:16');
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: 'p' });

    const s = useStateManager.getState();
    // Global guard blocked the letter: nothing was projected…
    expect(s.committedPassage).toBeNull();
    expect(s.isScreenBlanked).toBe(true);
    // …and the controlled field was not mutated by the raw keydown.
    expect(input.value).toBe('John 3:16');
  });
});

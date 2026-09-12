import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useGlobalKeyboard } from '@/core/inputController';
import { useStateManager } from '@/core/stateManager';
import type { Passage, Slide } from '@/core/types';

/**
 * Regression suite for the operator keyboard shortcut pipeline.
 *
 * These tests pin down defects that previously shipped in useGlobalKeyboard
 * and its dependencies:
 *  - an Escape→ArrowRight switch fall-through that ADVANCED the projection
 *    when the operator dismissed a preview;
 *  - letter shortcuts (b/c/p/n) that hijacked Ctrl/⌘/Alt OS combos;
 *  - a blanket INPUT-target guard that made every shortcut dead while the
 *    auto-focused, empty search field had focus (the boot state);
 *  - a clearPreview that wiped projectionQueue while a passage was live,
 *    leaving ←/→/P as silent no-ops;
 *  - undoProjection not syncing localStorage['currentProjection'], so a
 *    projection-window refresh after undo resurrected the undone verse.
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

/** jsdom has no BroadcastChannel; the pipeline requires one for commits. */
class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  messages: unknown[] = [];
  constructor(public name: string) {
    FakeBroadcastChannel.instances.push(this);
  }
  postMessage(msg: unknown) {
    this.messages.push(msg);
  }
  addEventListener() {}
  removeEventListener() {}
  close() {}
}

function pressKey(key: string, init: KeyboardEventInit = {}) {
  // Dispatched on document.body so the handler's target-tag guard sees a
  // non-input target, exactly like real typing outside a field. Wrapped in
  // act because shortcuts update the store the mounted host subscribes to.
  act(() => {
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
    );
  });
}

/** Mounts the global hook the same way OperatorScreen does. */
function ShortcutHost() {
  useGlobalKeyboard();
  return null;
}

beforeEach(() => {
  localStorage.clear();
  FakeBroadcastChannel.instances = [];
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  render(<ShortcutHost />);
  setStore({
    // Two queued slides with slide 0 live: arrows can move in-queue without
    // touching BibleRepository (no translation data in unit tests).
    projectionQueue: [A, B],
    currentSlideIndex: 0,
    liveSlideIndex: 0,
    committedPassage: passageFor(A),
    isScreenBlanked: false,
    currentTranslation: 'KJV',
    projectionLocked: false,
    historyStack: [],
    searchQuery: '',
    searchResults: [],
    selectedResultIndex: -1,
    previewPassage: null,
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const channel = () => FakeBroadcastChannel.instances.at(-1)!;
const committedRef = () => useStateManager.getState().committedPassage?.displayReference ?? null;
const currentProjectionRef = () => {
  try {
    return (JSON.parse(localStorage.getItem('currentProjection') ?? 'null') as Passage | null)?.displayReference ?? null;
  } catch {
    return null;
  }
};

describe('Escape semantics', () => {
  it('does NOT advance the projection (regression: fall-through into ArrowRight)', () => {
    pressKey('Escape');
    const s = useStateManager.getState();
    expect(committedRef()).toBe('John 3:16'); // unchanged
    expect(s.currentSlideIndex).toBe(0); // not advanced
    expect(s.liveSlideIndex).toBe(0);
    expect(s.projectionQueue).toHaveLength(2);
  });

  it('clears the preview state (advertised footer behaviour)', () => {
    setStore({ searchQuery: 'John', searchResults: [], previewPassage: passageFor(A) });
    pressKey('Escape');
    const s = useStateManager.getState();
    expect(s.searchQuery).toBe('');
    expect(s.previewPassage).toBeNull();
  });
});

describe('Arrow navigation', () => {
  it('ArrowRight advances to the next slide and broadcasts COMMIT_PASSAGE', () => {
    pressKey('ArrowRight');
    const s = useStateManager.getState();
    expect(s.currentSlideIndex).toBe(1);
    expect(s.liveSlideIndex).toBe(1);
    expect(committedRef()).toBe('John 3:17');
    const commits = channel().messages.filter((m) => (m as { type: string }).type === 'COMMIT_PASSAGE');
    expect(commits).toHaveLength(1);
  });

  it('ArrowLeft returns to the previous slide', () => {
    setStore({ currentSlideIndex: 1, liveSlideIndex: 1, committedPassage: passageFor(B) });
    pressKey('ArrowLeft');
    const s = useStateManager.getState();
    expect(s.currentSlideIndex).toBe(0);
    expect(committedRef()).toBe('John 3:16');
  });

  it('works while the search input is focused but EMPTY (regression: boot-state dead zone)', () => {
    const input = document.createElement('input');
    input.value = ''; // boot state: auto-focused, nothing typed yet
    document.body.appendChild(input);
    input.focus();
    pressKeyOn(input, 'ArrowRight');
    expect(useStateManager.getState().currentSlideIndex).toBe(1);
    input.remove();
  });

  it('does nothing for unbound keys (ArrowUp/Down, PageUp/Down, Home/End)', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']) {
      pressKey(key);
    }
    const s = useStateManager.getState();
    expect(s.currentSlideIndex).toBe(0);
    expect(s.isScreenBlanked).toBe(false);
  });
});

function pressKeyOn(target: Element, key: string, init: KeyboardEventInit = {}) {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
    );
  });
}

/** Store writes re-render the mounted host, so they must run inside act. */
type StoreState = ReturnType<typeof useStateManager.getState>;
function setStore(partial: Partial<StoreState>) {
  act(() => {
    useStateManager.setState(partial);
  });
}

describe('Letter shortcuts and modifier guards', () => {
  it('plain B toggles blank on then off', () => {
    pressKey('b');
    expect(useStateManager.getState().isScreenBlanked).toBe(true);
    pressKey('B');
    expect(useStateManager.getState().isScreenBlanked).toBe(false);
  });

  it('Ctrl/⌘/Alt + letter does NOT trigger the shortcut (regression: OS combo hijack)', () => {
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      pressKey('b', init);
      expect(useStateManager.getState().isScreenBlanked).toBe(false);
    }
  });

  it('plain Z does nothing; Ctrl+Z undoes the last projection', () => {
    setStore({ historyStack: [A], currentSlideIndex: 0 });
    // live B, history holds A
    setStore({
      projectionQueue: [B],
      liveSlideIndex: 0,
      committedPassage: passageFor(B),
    });
    localStorage.setItem('currentProjection', JSON.stringify(passageFor(B)));

    pressKey('z');
    expect(useStateManager.getState().historyStack).toHaveLength(1); // plain z: no undo

    pressKey('z', { ctrlKey: true });
    const s = useStateManager.getState();
    expect(s.historyStack).toHaveLength(0);
    expect(committedRef()).toBe('John 3:16');
  });

  it('letters are blocked while typing in a field WITH text (no double-fire)', () => {
    const input = document.createElement('input');
    input.value = 'John'; // operator is mid-search
    document.body.appendChild(input);
    input.focus();
    const before = useStateManager.getState().isScreenBlanked;
    pressKeyOn(input, 'b');
    expect(useStateManager.getState().isScreenBlanked).toBe(before);
    input.remove();
  });
});

describe('clearPreview preserves the live session', () => {
  it('keeps the queue and snaps the cursor to the live slide when a passage is live', () => {
    setStore({ currentSlideIndex: 1 }); // cursor parked away from live(0)
    act(() => {
      useStateManager.getState().clearPreview();
    });
    const s = useStateManager.getState();
    expect(s.projectionQueue).toHaveLength(2); // NOT wiped
    expect(s.currentSlideIndex).toBe(0); // snapped back to live
    expect(s.liveSlideIndex).toBe(0);
    expect(s.searchQuery).toBe('');
  });

  it('still drops a preview-only queue when nothing is live', () => {
    setStore({ projectionQueue: [A], liveSlideIndex: null, committedPassage: null });
    act(() => {
      useStateManager.getState().clearPreview();
    });
    const s = useStateManager.getState();
    expect(s.projectionQueue).toHaveLength(0);
    expect(s.currentSlideIndex).toBe(0);
  });

  it('arrows keep working after Escape during a live passage (end-to-end regression)', () => {
    pressKey('Escape'); // previously wiped the queue → arrows became no-ops
    pressKey('ArrowRight');
    const s = useStateManager.getState();
    expect(s.currentSlideIndex).toBe(1);
    expect(committedRef()).toBe('John 3:17');
  });
});

describe('undo keeps the projection window in sync', () => {
  it('updates localStorage["currentProjection"] (regression: refresh resurrected undone verse)', () => {
    setStore({
      historyStack: [A],
      projectionQueue: [B],
      currentSlideIndex: 0,
      liveSlideIndex: 0,
      committedPassage: passageFor(B),
    });
    localStorage.setItem('currentProjection', JSON.stringify(passageFor(B)));

    act(() => {
      useStateManager.getState().undoProjection();
    });

    expect(committedRef()).toBe('John 3:16');
    expect(currentProjectionRef()).toBe('John 3:16');
    expect(useStateManager.getState().historyStack).toHaveLength(0);
  });
});

describe('Service Plan pass-through and help shortcut', () => {
  it('N dispatches nextServicePlanPassage', () => {
    const seen = vi.fn();
    window.addEventListener('nextServicePlanPassage', seen);
    pressKey('n');
    window.removeEventListener('nextServicePlanPassage', seen);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('Shift+Enter dispatches nextServicePlanPassage; bare Enter does not', () => {
    const seen = vi.fn();
    window.addEventListener('nextServicePlanPassage', seen);
    pressKey('Enter');
    expect(seen).not.toHaveBeenCalled();
    pressKey('Enter', { shiftKey: true });
    window.removeEventListener('nextServicePlanPassage', seen);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('? dispatches the help-toggle event advertised in the footer', () => {
    const seen = vi.fn();
    window.addEventListener('wordde:toggle-shortcut-help', seen);
    pressKey('?');
    window.removeEventListener('wordde:toggle-shortcut-help', seen);
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RecentPassages } from '@/components/operator/RecentPassages';
import { useStateManager } from '@/core/stateManager';
import { BibleRepository } from '@/core/bibleRepository';
import type { BibleBook, Slide } from '@/core/types';

/**
 * Regression suite for Recent tab item behavior.
 *
 * Pins down defects that made the tab inconsistent:
 *  - a "fallback" in the component lit queue[0] as LIVE whenever no slide was
 *    committed, so a mere preview (queue built, liveSlideIndex null) painted
 *    a recent as on-air — the operator is told a lie about the projector;
 *  - stored references were re-parsed with a digits-only verse pattern, so
 *    lettered verse keys ("3a") could never re-open their own entry;
 *  - dead entries (captured under another translation / missing verse)
 *    failed as a silent no-op — the volunteer got zero feedback (UX
 *    constraints: fail visibly, never silently).
 */

const slide = (reference: string): Slide => {
  const [bookChapter, verse] = reference.split(':');
  const [book, chapter] = bookChapter.split(' ');
  return { reference, text: `text ${reference}`, book, chapter, verse };
};

/** jsdom has no BroadcastChannel; the commit pipeline requires one. */
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

/** Install fixture books into the repository's private stores (test-only). */
function installFixture(translation: string, books: BibleBook[]) {
  const repo = BibleRepository as unknown as {
    translations: Map<string, Map<string, BibleBook>>;
    bookNames: string[];
    bookAliases: Map<string, string[]>;
    loadedTranslations: Set<string>;
    currentTranslation: string;
  };
  const map = new Map<string, BibleBook>();
  for (const b of books) {
    map.set(b.book.toLowerCase(), b);
    repo.bookAliases.set(b.book.toLowerCase(), [b.book]);
  }
  repo.translations.set(translation, map);
  repo.bookNames = books.map((b) => b.book);
  repo.loadedTranslations.add(translation);
  repo.currentTranslation = translation;
}

const book = (name: string, chapter: string, verses: string[]): BibleBook => ({
  book: name,
  chapters: [
    { chapter, verses: verses.map((v) => ({ verse: v, text: `${name} ${chapter}:${v} text` })) },
  ],
});

function setStore(partial: Parameters<typeof useStateManager.setState>[0]) {
  useStateManager.setState(partial);
}

function resetStore() {
  setStore({
    recentPassages: [],
    projectionQueue: [],
    currentSlideIndex: 0,
    liveSlideIndex: null,
    committedPassage: null,
    isScreenBlanked: false,
    currentTranslation: 'TEST',
    projectionLocked: false,
    historyStack: [],
    searchQuery: '',
    searchResults: [],
    selectedResultIndex: -1,
    previewPassage: null,
  });
}

function renderTab() {
  render(<RecentPassages />);
}

/** The LIVE row is the one with the paprika play lamp; idle rows show a number. */
const playLamp = () => document.querySelector('svg.lucide-play');
const rowFor = (ref: string) => screen.getAllByText(ref)[0].closest('div[class*="group"]');

beforeEach(() => {
  localStorage.clear();
  FakeBroadcastChannel.instances = [];
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  resetStore();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Recent tab — LIVE highlight', () => {
  it('does NOT light any entry while nothing is committed (phantom-highlight regression)', () => {
    // Exact historical defect shape: a preview built a queue and moved the
    // operator cursor, but liveSlideIndex stayed null. The old fallback lit
    // queue[0]'s reference ("John 3:16") as if it were on air.
    setStore({
      recentPassages: ['John 3:16', 'John 3:17'],
      projectionQueue: [slide('John 3:16'), slide('John 3:17')],
      currentSlideIndex: 0,
      liveSlideIndex: null,
    });
    renderTab();

    expect(playLamp()).toBeNull();
    expect(rowFor('John 3:16')!.className).not.toContain('bg-paprika');
    expect(rowFor('John 3:17')!.className).not.toContain('bg-paprika');
  });

  it('does NOT light an out-of-range live index', () => {
    setStore({
      recentPassages: ['John 3:16'],
      projectionQueue: [slide('John 3:16'), slide('John 3:17')],
      currentSlideIndex: 0,
      liveSlideIndex: 7, // stale from a replaced queue
    });
    renderTab();

    expect(playLamp()).toBeNull();
    expect(rowFor('John 3:16')!.className).not.toContain('bg-paprika');
  });

  it('lights exactly the committed slide', () => {
    setStore({
      recentPassages: ['John 3:16', 'John 3:17'],
      projectionQueue: [slide('John 3:16'), slide('John 3:17')],
      currentSlideIndex: 1,
      liveSlideIndex: 1,
      committedPassage: null,
    });
    renderTab();

    expect(playLamp()).not.toBeNull();
    expect(rowFor('John 3:17')!.className).toContain('bg-paprika');
    expect(rowFor('John 3:16')!.className).not.toContain('bg-paprika');
  });
});

describe('Recent tab — re-opening entries', () => {
  beforeEach(() => {
    installFixture('TEST', [book('John', '3', ['1', '2', '3a', '4'])]);
  });

  it('re-opens a numeric entry and puts it back at the front of the history', () => {
    setStore({ recentPassages: ['John 3:2', 'John 3:1'] });
    renderTab();

    fireEvent.click(screen.getAllByText('John 3:2')[0]);

    const s = useStateManager.getState();
    // projectSlide's by-design next-verse prefetch may append the successor;
    // the opened passage must be the queue head and live.
    expect(s.projectionQueue[0].reference).toBe('John 3:2');
    expect(s.liveSlideIndex).toBe(0);
    expect(s.recentPassages[0]).toBe('John 3:2');
    expect(s.recentPassages.filter((r) => r === 'John 3:2')).toHaveLength(1);
  });

  it('re-opens a lettered verse key verbatim — no verse arithmetic (VF-003 regression)', () => {
    // The core stores slide references with the verbatim source key, so a
    // session that projected "3a" leaves "John 3:3a" in the history. The old
    // digits-only parser matched book/chapter but rebuilt nothing — clicking
    // was a silent no-op.
    setStore({ recentPassages: ['John 3:3a', 'John 3:2'] });
    renderTab();

    fireEvent.click(screen.getAllByText('John 3:3a')[0]);

    const s = useStateManager.getState();
    expect(s.projectionQueue[0].reference).toBe('John 3:3a');
    // The funnel's positional prefetch resolved the lettered key's real
    // successor (3a → 4) — key-based navigation, no arithmetic (VF-003).
    expect(s.projectionQueue[1]?.reference).toBe('John 3:4');
    expect(s.liveSlideIndex).toBe(0);
    expect(s.recentPassages[0]).toBe('John 3:3a');
  });

  it('re-opens a range whose end is a lettered key', () => {
    setStore({ recentPassages: ['John 3:2-3a'] });
    renderTab();

    fireEvent.click(screen.getAllByText('John 3:2-3a')[0]);

    const s = useStateManager.getState();
    expect(s.projectionQueue.map((sl) => sl.reference)).toEqual(['John 3:2', 'John 3:3a']);
  });

  it('fails VISIBLY and keeps the entry when the verse is missing in this translation', () => {
    setStore({ recentPassages: ['John 3:16'] }); // fixture has only 1..3a,4
    renderTab();

    fireEvent.click(screen.getAllByText('John 3:16')[0]);

    expect(screen.getByText(/Couldn't open John 3:16/)).toBeInTheDocument();
    // No silent mutation: the entry survives; nothing was projected.
    expect(useStateManager.getState().recentPassages).toContain('John 3:16');
    expect(useStateManager.getState().projectionQueue).toHaveLength(0);
    expect(useStateManager.getState().liveSlideIndex).toBeNull();
  });
});

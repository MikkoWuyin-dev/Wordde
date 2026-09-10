# docs/ARCHITECTURE.md

# Bible Projection System — Architecture Documentation

**Version:** 1.0  
**Last Updated:** 2024  
**Codebase Reference:** All claims map to code in `src/`

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architectural Principles](#2-architectural-principles)
3. [System Topology](#3-system-topology)
4. [State Management](#4-state-management)
5. [Data Layer](#5-data-layer)
6. [Navigation Model](#6-navigation-model)
7. [Communication Protocol](#7-communication-protocol)
8. [Persistence Strategy](#8-persistence-strategy)
9. [Recovery System](#9-recovery-system)
10. [Layer Boundaries](#10-layer-boundaries)
11. [Failure Modes & Guarantees](#11-failure-modes--guarantees)
12. [Performance Characteristics](#12-performance-characteristics)
13. [Constraints & Invariants](#13-constraints--invariants)

---

## 1. System Overview

### Problem Statement

Church A/V operators need to display Bible verses on a projector during live services with:
- **Zero tolerance for latency** (sub-second projection)
- **Zero tolerance for network failure** (fully offline)
- **Zero tolerance for visible operator UI** on audience screen
- **Zero installation/setup friction** (pure web app)

### Solution

A pure client-side React SPA that:
- Projects any verse in any of 5 translations on a second screen
- Works completely offline (all Bible text ships as static assets)
- Uses a second browser window for projection (not iframe or CSS)
- Maintains separation between operator controls and audience display

### Target Users

- Volunteer A/V operators (low technical skill, rotating weekly)
- Small-to-mid churches (one laptop + HDMI projector/TV)
- Users who set up minutes before service (cannot debug anything)

### Core Invariants

These are **load-bearing architectural decisions** that must never be violated:

1. **Offline-first**: All Bible text ships as static ZIP assets in `/public/data/`
2. **Zero infrastructure**: Pure client-side, no backend, no auth, no database
3. **Two physical screens, one browser**: Second `window.open('/projection')`
4. **Single source of truth**: Operator window owns all state
5. **Verbatim fidelity**: Scripture text is never modified
6. **Index-based navigation**: Verse navigation uses array position, never arithmetic

---

## 2. Architectural Principles

### 2.1 Single Source of Truth

**Rule:** The Operator Window (`/`) is the **only** writer of projection state.

```
Operator Window (/)
  ↓
Zustand Store (stateManager.ts)
  ↓
BroadcastChannel
  ↓
Projection Window (/projection) — READ ONLY
```

**Consequence:**  
The Projection Window (`/projection`) maintains **only local React state** for rendering. It has **no Zustand store** and **never writes** to the global state.

**Verification:**
```typescript
// ✅ CORRECT - Operator window
const useStateManager = create<StateManager>((set, get) => ({
  projectSlide: (slide) => { /* writes state */ }
}));

// ✅ CORRECT - Projection window
const [passage, setPassage] = useState<Passage | null>(null);
// Local state only, updated via BroadcastChannel messages

// ❌ FORBIDDEN - Projection window
import { useStateManager } from '@/core/stateManager'; // NEVER DO THIS
```

### 2.2 Verbatim Data Fidelity

**Rule:** Scripture text is preserved **exactly as-is** from source data.

**Forbidden operations:**
- ❌ `.trim()` on verse text
- ❌ `.replace()` on verse text
- ❌ Whitespace normalization
- ❌ Unicode normalization
- ❌ Case conversion
- ❌ Punctuation modification

**Implementation:**
```typescript
// bibleNormalizer.ts
// ✅ Verse text preserved verbatim
verse.text = rawData.text; // No transformation

// ❌ NEVER do this
verse.text = rawData.text.trim().replace(/\s+/g, ' ');
```

**Rationale:** Scripture is sacred text. Byte-level fidelity is non-negotiable.

### 2.3 Fail Visibly, Not Silently

**Rule:** When the system cannot fulfill a request correctly, it must fail **visibly** rather than silently substitute incorrect data.

**Examples:**

```typescript
// ✅ CORRECT - Fail visibly
getBooksMap(translation: string): Map<string, BibleBook> {
  if (!this.translations.has(translation)) {
    console.warn(`Translation ${translation} not found`);
    return new Map(); // Empty, not fallback to KJV
  }
}

// ❌ FORBIDDEN - Silent fallback
getBooksMap(translation: string): Map<string, BibleBook> {
  return this.translations.get(translation) 
    || this.translations.get('KJV'); // NEVER
}
```

**Rationale:** Displaying the wrong translation is **worse** than displaying nothing. The operator must know something is wrong.

### 2.4 One-Way Data Flow

**Rule:** Data flows in a single direction through the system.

```
User Input
  ↓
Input Controller (useInputController, useGlobalKeyboard)
  ↓
State Manager (Zustand store)
  ↓
Bible Repository (read-only queries)
  ↓
Broadcast Sync (fire-and-forget)
  ↓
Projection Window (replica rendering)
```

**Forbidden:**
- ❌ UI components directly calling Repository
- ❌ Repository mutating state
- ❌ Projection window writing to store
- ❌ Circular dependencies between layers

---

## 3. System Topology

### 3.1 Window Architecture

```
┌─────────────────────────────────────┐  ┌─────────────────────────────┐
│ OPERATOR WINDOW (/)                 │  │ PROJECTION WINDOW           │
│                                     │  │ (/projection)               │
│ ┌─────────────────────────────────┐ │  │                             │
│ │ OperatorScreen.tsx              │ │  │ ┌─────────────────────────┐ │
│ │  ├─ SearchInput                 │ │  │ │ Projection.tsx          │ │
│ │  ├─ BibleNavigator              │ │  │ │  ├─ AutoFitVerse        │ │
│ │  ├─ ServicePlan                 │ │  │ │  └─ BlankOverlay        │ │
│ │  ├─ RecentPassages              │ │  │ └─────────────────────────┘ │
│ │  ├─ PresenterPanel              │ │  │                             │
│ │  ├─ ProjectionSettings          │ │  │ Local React state only      │
│ │  └─ ProjectionControl           │ │  │ NO Zustand store            │
│ └─────────────────────────────────┘ │  │                             │
│                                     │  │                             │
│ ┌─────────────────────────────────┐ │  │                             │
│ │ Zustand Store (stateManager)    │ │  │                             │
│ │ ✓ Single source of truth        │ │  │                             │
│ └─────────────────────────────────┘ │  │                             │
└──────────────┬──────────────────────┘  └──────────────┬──────────────┘
               │                                        │
               │  BroadcastChannel                      │
               │  'bible-projection-sync'               │
               │                                        │
               ├───── COMMIT_PASSAGE ──────────────────►│
               ├───── BLANK / UNBLANK ─────────────────►│
               ├───── SYNC (every 3s) ─────────────────►│
               ├───── RELOAD_ASSETS ───────────────────►│
               │◄──── HEARTBEAT (every 2s) ─────────────┤
               │◄──── PROJECTOR_READY ──────────────────┤
               │◄──── REQUEST_STATE ────────────────────┤
               ├───── STATE_RESPONSE ──────────────────►│
               │                                        │
┌──────────────┴────────────────────────────────────────┴──────────────┐
│ Shared Browser Storage (same origin)                                 │
│                                                                       │
│ localStorage:                                                         │
│   • currentProjection (last projected passage)                       │
│   • projectionState (passage + blank state + timestamp)              │
│   • projectionRecoveryState (queue + indexes + translation) ← P0 #1  │
│   • blankSettings (style, session screens, background refs)          │
│   • recentPassages (last 15, ordered by use)                         │
│   • servicePlanV2 (ordered list of passages)                         │
│   • onboarding flags (bible-projection-onboarded, hint:<id>)         │
│                                                                       │
│ IndexedDB (bible_projection_assets):                                 │
│   • logo (single blob)                                                │
│   • softBackground (single blob)                                      │
│   • bg:<uuid> (up to 7 custom backgrounds)                           │
└───────────────────────────────────────────────────────────────────────┘
```

### 3.2 Why Two Real Windows?

**Requirement:** The projection must appear on a **second physical display** (TV/projector).

**Attempted solutions:**
- ❌ CSS fullscreen "presenter mode" — Cannot move to second display
- ❌ `<iframe>` — Cannot be fullscreened independently
- ❌ Single window, operator controls off-canvas — Still visible on mirror

**Chosen solution:** `window.open('/projection', 'projectionWindow')`

**Consequences:**
- ✅ Can be dragged to second display
- ✅ Can be fullscreened independently (F11)
- ✅ Operator UI never visible on projection
- ⚠️ State synchronization becomes a distributed system problem
  - Solved with BroadcastChannel + redundancy (heartbeat + periodic sync)

---

## 4. State Management

### 4.1 Zustand Store Structure

**Location:** `src/core/stateManager.ts`

**Store shape:**
```typescript
interface StateManager {
  // Current projection state
  projectionQueue: Slide[];          // Ordered verses for navigation
  currentSlideIndex: number;         // Selected position (preview)
  liveSlideIndex: number;            // Projected position (on screen)
  committedPassage: Passage | null;  // Currently displayed passage
  isScreenBlanked: boolean;          // Blank overlay state
  
  // Translation
  currentTranslation: string;        // Active translation code
  
  // Search state (ephemeral)
  searchQuery: string;
  searchResults: SearchResult[];
  selectedResultIndex: number;
  previewPassage: Passage | null;
  
  // History (ephemeral)
  historyStack: Slide[];             // Max 10, passage-level
  
  // UI state (ephemeral)
  projectionLocked: boolean;         // Preview-then-project mode
  
  // Actions
  setTranslation: (code: string) => Promise<void>;
  projectSlide: (slide: Slide, index: number) => void;
  slideNext: () => void;
  slidePrevious: () => void;
  setPreview: (passage: Passage) => void;
  commitCurrentSlide: () => void;
  toggleBlank: () => void;
  // ... more actions
}
```

### 4.2 State Categories

#### **Persisted State** (survives reload)

**Recovery state** (`projectionRecoveryState`):
```typescript
interface ProjectionRecoveryState {
  version: number;                   // Schema version (currently 1)
  queue: Slide[];                    // Projection queue
  currentSlideIndex: number;         // Selected position
  liveSlideIndex: number;            // Projected position
  committedPassage: Passage | null;  // Currently displayed
  isScreenBlanked: boolean;          // Blank state
  currentTranslation: string;        // Active translation
  timestamp: number;                 // For staleness detection
}
```

**Other persisted state:**
- `currentProjection` — Lightweight fallback (passage only)
- `projectionState` — Includes blank state
- `blankSettings` — Visual settings (both windows read this)
- `recentPassages` — Last 15 references (array of strings)
- `servicePlanV2` — Ordered passages for service

**Rationale for separate recovery state:**
- More complete than `currentProjection`
- Includes navigation context (queue, indexes)
- Versioned for future schema changes
- Has staleness policy

#### **Ephemeral State** (lost on reload)

**Intentionally not persisted:**
- `searchQuery` / `searchResults` — Transient UI state
- `selectedResultIndex` — Transient UI state
- `previewPassage` — Operator hasn't committed it yet
- `historyStack` — Undo is passage-level; operator can re-select
- `projectionLocked` — Safety: default to unlocked on reload

**Rationale:**
- Search state: Operator will re-type query
- Preview: Not committed = not important to restore
- History: Operator can navigate via recents/search
- Lock: Safer to require operator to re-enable

### 4.3 Derived State

**Never stored, always computed:**

```typescript
// committedPassage is stored for convenience, but is derived from:
const committedPassage = slideToPassage(
  projectionQueue[liveSlideIndex],
  currentTranslation
);

// displayReference is computed in BibleRepository.getPassage()
// Translation display name is computed at render time
```

### 4.4 State Update Triggers

**Every projection funnels through ONE function:**

```typescript
projectSlide(slide: Slide, index: number, get, set, oldLiveSlideOverride?)
```

**Call sites:**
1. `commitCurrentSlide()` — Normal projection path
2. `_commitWithOldSlide()` — When queue replaced before commit
3. `projectNow()` — `P` shortcut (bypass lock)
4. `undoProjection()` — Deliberately bypasses history tracking
5. `loadChapterAsQueue()` — Batch load, bypasses history

**Side effects (in order):**
1. Update authoritative in-memory state (Zustand)
2. Broadcast to Projection window (`broadcastCommit`)
3. Persist recovery state (`persistRecoveryState`)
4. Persist lightweight fallback (`localStorage.currentProjection`)
5. Add to recent passages (`addToRecent`)
6. Pre-load next verse (queue extension)

**Critical ordering:** Persistence failure must **never** prevent projection.

```typescript
projectSlide() {
  // 1. Update state (critical path)
  set({ liveSlideIndex: index, committedPassage, isScreenBlanked: false });
  
  // 2. Broadcast (critical path)
  broadcastCommit(passage);
  
  // 3. Persist (best-effort, wrapped in try/catch)
  try {
    persistRecoveryState({ queue, liveSlideIndex, ... });
  } catch (err) {
    console.error('Persistence failed, projection continues:', err);
  }
}
```

---

## 5. Data Layer

### 5.1 Canonical Data Model

**Location:** `src/core/types.ts`

```typescript
interface Verse {
  verse: string;  // ⚠️ STRING, not number (supports "3a", "3b", etc.)
  text: string;   // Verbatim scripture text
}

interface Chapter {
  chapter: string;  // ⚠️ STRING, not number
  verses: Verse[];  // ✓ Ordered array (canonical sequence)
}

interface BibleBook {
  book: string;     // Full name, e.g., "John"
  chapters: Chapter[];
}

interface Slide {
  reference: string;  // "John 3:16"
  text: string;       // Verse text
  book: string;       // "John"
  chapter: string;    // "3"
  verse: string;      // "16" (or "3a", etc.)
}

interface Passage {
  reference: PassageReference;  // Structured reference
  slides: Slide[];              // One or more verses
  translation: string;          // "KJV", "NIV", etc.
  displayReference: string;     // "John 3:16-18 (NIV)"
}
```

**Key design decision:** Verse and chapter numbers are **strings**, never integers.

**Rationale:**
- Source data contains non-numeric keys (`"3a"`, `"3b"`)
- Integer coercion would **silently corrupt data**
- Sorting handled explicitly with `numericKeyCompare()`

### 5.2 Bible Repository

**Location:** `src/core/bibleRepository.ts`

**Responsibilities:**
- Load and normalize Bible translations
- Read-only data access
- Verse lookup by reference
- Navigation (next/previous verse)
- Chapter/book boundary handling

**Critical invariant:** Repository is **read-only**. It never mutates app state.

```typescript
class BibleRepository {
  private translations: Map<string, Map<string, BibleBook>>;
  public currentTranslation: string; // ⚠️ Mirror of store, for defaulting only
  
  // Load translation from ZIP
  async loadTranslation(code: string): Promise<void>
  
  // Read-only queries
  getBooksMap(translation: string): Map<string, BibleBook>
  getPassage(ref: PassageReference, translation: string): Passage | null
  getChapter(book: string, chapter: string, translation: string): Chapter | null
  
  // Navigation (read-only, returns new verse)
  getNextVerse(book, chapter, verse, translation): Verse | null
  getPreviousVerse(book, chapter, verse, translation): Verse | null
  getFirstVerseOfNextChapter(...): Verse | null
  getPreviousChapter(...): Chapter | null
  
  // Search
  searchByReference(query: string, translation: string): SearchResult[]
  searchByKeyword(query: string, translation: string): SearchResult[]
}

export const bibleRepository = new BibleRepository(); // Singleton
```

**Critical methods:**

#### `getBooksMap(translation: string)`

```typescript
getBooksMap(translation: string): Map<string, BibleBook> {
  const books = this.translations.get(translation);
  
  if (!books) {
    console.warn(`Translation ${translation} not loaded`);
    return new Map(); // ✅ Empty, NOT fallback to KJV
  }
  
  return books;
}
```

**Rationale:** Returning KJV when NIV is requested would **silently display wrong text**. Empty map causes visible failure.

#### `getNextVerse()` — Index-Based Navigation (P0 #2)

```typescript
getNextVerse(
  bookName: string,
  chapterNum: string,
  verseKey: string,  // ⚠️ Not verseNum — it's a KEY
  translation: string
): Verse | null {
  const chapter = this.getChapter(bookName, chapterNum, translation);
  if (!chapter) return null;
  
  // ✅ Find verse by KEY, not by assuming index === number
  const currentIndex = chapter.verses.findIndex(v => v.verse === verseKey);
  if (currentIndex === -1) {
    console.warn(`Verse ${verseKey} not found in ${bookName} ${chapterNum}`);
    return null;
  }
  
  // ✅ Next verse is ARRAY INDEX + 1, not verse number + 1
  const nextVerse = chapter.verses[currentIndex + 1];
  
  if (nextVerse) {
    return nextVerse;
  }
  
  // Reached end of chapter, move to next chapter
  return this.getFirstVerseOfNextChapter(bookName, chapterNum, translation);
}
```

**Critical difference:**
```typescript
// ❌ FORBIDDEN (old approach)
const nextVerseNum = parseInt(verseKey) + 1;
const nextVerse = chapter.verses.find(v => v.verse === String(nextVerseNum));

// ✅ CORRECT (current approach)
const currentIndex = chapter.verses.findIndex(v => v.verse === verseKey);
const nextVerse = chapter.verses[currentIndex + 1];
```

**Why this matters:**

Given verses: `["3", "3a", "3b", "4"]`

Old approach (arithmetic):
```
"3" + 1 = "4"   ❌ Skips 3a, 3b
```

New approach (index):
```
"3" → index 0 → next index 1 → "3a" ✅
"3a" → index 1 → next index 2 → "3b" ✅
"3b" → index 2 → next index 3 → "4" ✅
```

### 5.3 Data Normalization

**Location:** `src/core/bibleNormalizer.ts`

**Responsibility:** Convert raw JSON (various formats) into canonical model.

**Supported input formats:**
1. Canonical single book: `{ book: "John", chapters: [...] }`
2. Array of canonical books: `[{ book: "Genesis", ... }, ...]`
3. Nested object format: `{ "John": { "1": { "1": "In the beginning..." } } }`

**Normalization rules:**
1. Chapter/verse keys sorted with `numericKeyCompare()` (numeric when possible, lexical fallback)
2. Verse text preserved **verbatim** (no `.trim()`, no whitespace normalization)
3. `Info`/`metadata` keys extracted separately, never merged into books
4. Duplicate books: **first occurrence wins**, logged warning

```typescript
export function normalizeBibleJson(raw: any): {
  books: BibleBook[];
  metadata: Record<string, any>;
} {
  // ... format detection ...
  
  // ✅ Sort verses by KEY, not by numeric value
  verses.sort((a, b) => numericKeyCompare(a.verse, b.verse));
  
  // ✅ Preserve text verbatim
  verse.text = rawVerse.text; // NO TRANSFORMATION
  
  return { books, metadata };
}

function numericKeyCompare(a: string, b: string): number {
  const aNum = parseInt(a, 10);
  const bNum = parseInt(b, 10);
  
  // Both numeric? Compare as numbers
  if (!isNaN(aNum) && !isNaN(bNum)) {
    return aNum - bNum;
  }
  
  // Fallback to lexical comparison (handles "3a" vs "3b")
  return a.localeCompare(b);
}
```

**Example:** `["1", "2", "10", "3a", "3b", "4"]` normalizes to `["1", "2", "3a", "3b", "4", "10"]`

### 5.4 Translation Loading

**Preload strategy:** All 5 translations loaded at boot.

```typescript
// OperatorScreen.tsx mount effect
useEffect(() => {
  preloadAllTranslations()
    .then(() => setIsLoading(false))
    .catch(err => setError(err));
}, []);

// bibleRepository.ts
export async function preloadAllTranslations(): Promise<void> {
  const codes = ['KJV', 'NIV', 'NKJV', 'NLT', 'AMP'];
  
  await Promise.all(
    codes.map(code => bibleRepository.loadTranslation(code))
  );
}
```

**Critical decision:** `Promise.all`, not lazy loading.

**Rationale:**
- Mid-service translation switch must be instant (<1s)
- 3-5s decode per translation is **unacceptable** during live use
- Boot delay (3-5s) is acceptable; mid-service lag is not

**Cost:**
- 3-5 second boot time
- ~60-100 MB resident memory for parsed verse objects

**Alternative considered and rejected:**
- Lazy load on translation switch → 3-5s lag during service ❌

### 5.5 Data Integrity Guarantees

**Load failure handling:**

```typescript
async loadTranslation(code: string): Promise<void> {
  // 1. Unknown code → fail immediately
  if (!TRANSLATION_ZIPS[code]) {
    throw new Error(`Unknown translation: ${code}`);
  }
  
  // 2. Fetch failure → throw with status
  const response = await fetch(`/data/${TRANSLATION_ZIPS[code]}`);
  if (!response.ok) {
    throw new Error(`Failed to load ${code}: ${response.status}`);
  }
  
  // 3. ZIP decode failure → throw
  const zipData = await response.arrayBuffer();
  const zip = await JSZip.loadAsync(zipData);
  
  // 4. Parse each JSON file, collect errors
  const errors: string[] = [];
  zip.forEach((path, file) => {
    if (!path.endsWith('.json')) return;
    
    try {
      const text = await file.async('text');
      const data = JSON.parse(text);
      // ... normalize and insert ...
    } catch (err) {
      errors.push(`${path}: ${err.message}`);
    }
  });
  
  // 5. Zero valid books → fail with accumulated errors
  if (books.length === 0) {
    throw new Error(`No valid books in ${code}: ${errors.join('; ')}`);
  }
  
  // 6. Some books failed → warn but succeed
  if (errors.length > 0) {
    console.warn(`Partial load of ${code}:`, errors);
  }
}
```

**Duplicate book handling:**

```typescript
// First occurrence wins
if (booksMap.has(bookKey)) {
  console.warn(`Duplicate book ${bookName} in ${code}, keeping first`);
  continue;
}
booksMap.set(bookKey, book);
```

**Rationale:** Fail-soft. One malformed file cannot break an entire translation at service time.

---

## 6. Navigation Model

### 6.1 Core Navigation Rule (P0 #2)

**Principle:** The normalized `Chapter.verses` array IS the canonical ordered sequence.

**Navigation algorithm:**

```
Given current verse:
1. Identify current verse by its KEY (not number)
2. Find its INDEX in the normalized verses array
3. Next verse = array[index + 1]
4. If no next verse in chapter → first verse of next chapter
5. If no next chapter → first verse of next book
```

**Example:**

Given normalized verses: `["3", "3a", "3b", "4"]`

```
Current: "3"
  → findIndex(v => v.verse === "3") = 0
  → verses[0 + 1] = verses[1] = "3a" ✅

Current: "3a"
  → findIndex(v => v.verse === "3a") = 1
  → verses[1 + 1] = verses[2] = "3b" ✅

Current: "3b"
  → findIndex(v => v.verse === "3b") = 2
  → verses[2 + 1] = verses[3] = "4" ✅
```

**Contrast with arithmetic approach (FORBIDDEN):**

```typescript
// ❌ WRONG
currentVerse = "3";
nextVerse = String(parseInt("3") + 1) = "4"; // Skipped 3a, 3b!

// ❌ WRONG
currentVerse = "3a";
nextVerse = String(parseInt("3a") + 1) = "NaN"; // Broken!
```

### 6.2 Queue-Based Navigation

**State Manager maintains a projection queue:**

```typescript
projectionQueue: Slide[];        // Ordered verses
currentSlideIndex: number;       // Selected position (preview)
liveSlideIndex: number;          // Projected position (what's on screen)
```

**Navigation actions:**

```typescript
slideNext() {
  const { currentSlideIndex, projectionQueue } = get();
  const newIndex = currentSlideIndex + 1;
  
  // Extend queue if at boundary
  if (newIndex >= projectionQueue.length) {
    const lastSlide = projectionQueue[projectionQueue.length - 1];
    const nextVerse = bibleRepository.getNextVerse(
      lastSlide.book,
      lastSlide.chapter,
      lastSlide.verse,  // ⚠️ Pass KEY, not number
      get().currentTranslation
    );
    
    if (nextVerse) {
      // Append to queue
      const newSlide = verseToSlide(nextVerse, lastSlide.book, lastSlide.chapter);
      set({ projectionQueue: [...projectionQueue, newSlide] });
    } else {
      // Reached end of Bible
      return;
    }
  }
  
  set({ currentSlideIndex: newIndex });
  
  // Auto-project if not locked
  if (!get().projectionLocked) {
    get().commitCurrentSlide();
  }
}
```

**Key insight:** Queue extension calls `getNextVerse()` with **verse KEY**, not numeric calculation.

### 6.3 Chapter/Book Boundaries

**Chapter boundary (forward):**

```typescript
getFirstVerseOfNextChapter(
  bookName: string,
  currentChapter: string,
  translation: string
): Verse | null {
  const book = this.getBook(bookName, translation);
  if (!book) return null;
  
  // Find current chapter INDEX (not number)
  const chapterIndex = book.chapters.findIndex(
    ch => ch.chapter === currentChapter
  );
  
  if (chapterIndex === -1) return null;
  
  const nextChapter = book.chapters[chapterIndex + 1];
  if (!nextChapter) {
    // Reached end of book, move to next book
    return this.getFirstVerseOfNextBook(bookName, translation);
  }
  
  // Return first verse of next chapter
  return nextChapter.verses[0] || null;
}
```

**Book boundary:**

```typescript
getFirstVerseOfNextBook(
  currentBook: string,
  translation: string
): Verse | null {
  // Use canonical book order (established at first translation load)
  const bookIndex = this.canonicalOrder.findIndex(
    name => name.toLowerCase() === currentBook.toLowerCase()
  );
  
  if (bookIndex === -1) return null;
  
  const nextBookName = this.canonicalOrder[bookIndex + 1];
  if (!nextBookName) {
    // Reached end of Bible
    return null;
  }
  
  const nextBook = this.getBook(nextBookName, translation);
  if (!nextBook || nextBook.chapters.length === 0) return null;
  
  return nextBook.chapters[0].verses[0] || null;
}
```

**Invariant:** Canonical book order is established from the **first translation loaded** and remains fixed for the session.

### 6.4 History Semantics

**History is passage-level, not verse-level.**

```typescript
projectSlide(slide, index, get, set, oldLiveSlideOverride?) {
  const oldSlide = oldLiveSlideOverride || get().projectionQueue[get().liveSlideIndex];
  
  // Only add to history if book/chapter changed
  if (!isSameReferenceGroup(oldSlide, slide)) {
    const history = get().historyStack;
    const newHistory = [oldSlide, ...history].slice(0, 10); // Cap at 10
    set({ historyStack: newHistory });
  }
  
  // ... rest of projection ...
}

function isSameReferenceGroup(a: Slide, b: Slide): boolean {
  return a.book === b.book && a.chapter === b.chapter;
}
```

**Rationale:** Undo should take you back to the **previous passage**, not the previous verse within the same chapter.

**Example:**
```
John 3:16 → John 3:17 → John 3:18 (no history entries)
John 3:18 → John 4:1 (history entry: John 3:18)
```

Pressing Undo from John 4:1 returns to John 3:18, not John 3:17.

---

## 7. Communication Protocol

### 7.1 BroadcastChannel Architecture

**Location:** `src/core/broadcastSync.ts`

**Channel name:** `'bible-projection-sync'`

**Why BroadcastChannel over alternatives:**

| Alternative | Rejected Because |
|---|---|
| `postMessage` on `window.open()` handle | Handle breaks on projection window refresh; operator reload loses reference |
| `localStorage` events | Awkward for structured messages; polling required |
| WebSocket | Requires network/server; offline-first violated |

**BroadcastChannel advantages:**
- Handle-independent (survives window refresh)
- Origin-scoped (automatic security boundary)
- Fire-and-forget (no ack complexity)
- Browser-native (no polyfill needed)

### 7.2 Message Schema

```typescript
type BroadcastMessage =
  | { type: 'COMMIT_PASSAGE'; payload: Passage }
  | { type: 'BLANK_SCREEN' }
  | { type: 'UNBLANK_SCREEN' }
  | { type: 'SYNC'; payload: SyncPayload }
  | { type: 'RELOAD_ASSETS' }
  | { type: 'HEARTBEAT' }  // Projection → Operator
  | { type: 'PROJECTOR_READY' }  // Projection → Operator
  | { type: 'REQUEST_STATE' }  // Projection → Operator
  | { type: 'STATE_RESPONSE'; payload: SyncPayload };  // Operator → Projection

interface SyncPayload {
  passage: Passage | null;
  isBlanked: boolean;
  blankSettings: BlankSettings;
}
```

### 7.3 Reliability Strategy

**Problem:** BroadcastChannel is fire-and-forget. Messages can be dropped (tab throttling, backgrounding, etc.).

**Solution:** Three independent redundancy mechanisms.

#### **Mechanism 1: Periodic SYNC** (every 3 seconds)

```typescript
// ProjectionControl.tsx
useEffect(() => {
  const interval = setInterval(() => {
    const state = useStateManager.getState();
    broadcastSync({
      passage: state.committedPassage,
      isBlanked: state.isScreenBlanked,
      blankSettings: loadBlankSettings()
    });
  }, 3000);
  
  return () => clearInterval(interval);
}, []);
```

**Effect:** Any dropped message self-heals within 3 seconds.

#### **Mechanism 2: Heartbeat** (every 2 seconds)

```typescript
// Projection.tsx
useEffect(() => {
  channel.postMessage({ type: 'HEARTBEAT' });
  
  const interval = setInterval(() => {
    channel.postMessage({ type: 'HEARTBEAT' });
  }, 2000);
  
  return () => clearInterval(interval);
}, []);

// ProjectionControl.tsx
const [lastHeartbeat, setLastHeartbeat] = useState(Date.now());

useEffect(() => {
  const check = setInterval(() => {
    if (Date.now() - lastHeartbeat > 5000) {
      setStatus('disconnected');
    }
  }, 1500);
  
  return () => clearInterval(check);
}, [lastHeartbeat]);
```

**Effect:** Operator knows within 5 seconds if projection window died.

#### **Mechanism 3: localStorage Persistence**

```typescript
// Projection.tsx mount
useEffect(() => {
  // 1. Try currentProjection (lightweight)
  const saved = localStorage.getItem('currentProjection');
  if (saved) {
    const passage = JSON.parse(saved);
    setPassage(passage);
  }
  
  // 2. Try projectionState (includes blank)
  const state = localStorage.getItem('projectionState');
  if (state) {
    const { passage, isBlanked } = JSON.parse(state);
    setPassage(passage);
    setIsBlanked(isBlanked);
  }
  
  // 3. Request current state from operator
  channel.postMessage({ type: 'REQUEST_STATE' });
}, []);
```

**Effect:** Projection window refresh/crash recovers instantly with **no operator action**.

### 7.4 Connection States

```typescript
type ProjectionStatus =
  | 'idle'           // Projection window not open
  | 'connecting'     // Opened, waiting for PROJECTOR_READY
  | 'active'         // Receiving heartbeats
  | 'disconnected';  // No heartbeat for >5s
```

**State transitions:**
```
idle
  → (operator clicks "Open Projection") → connecting
  → (receives PROJECTOR_READY) → active
  → (no heartbeat for 5s) → disconnected
  → (receives heartbeat) → active
  → (window.closed === true) → idle
```

### 7.5 Message Ordering

**No ordering guarantees.** Messages may arrive out of order.

**Mitigation:** Each message is **idempotent** and carries complete state.

```typescript
// ✅ CORRECT - Full state in every message
{ type: 'COMMIT_PASSAGE', payload: { reference: ..., slides: [...], translation: 'NIV' } }

// ❌ FORBIDDEN - Delta updates
{ type: 'UPDATE_TRANSLATION', payload: 'NIV' } // Projection window has no context
```

**SYNC message:** Overwrites entire projection state, not a delta.

---

## 8. Persistence Strategy

### 8.1 Storage Allocation

**localStorage:**
- `currentProjection` — Passage only (~1-2 KB)
- `projectionState` — Passage + blank state (~2-3 KB)
- `projectionRecoveryState` — Queue + indexes (~5-10 KB)
- `blankSettings` — Visual settings (~2-5 KB)
- `recentPassages` — Array of 15 strings (~1 KB)
- `servicePlanV2` — Ordered passages (~2-10 KB)
- `onboarding` flags (~1 KB)

**Total localStorage:** ~15-30 KB (well under 5 MB quota)

**IndexedDB:**
- `logo` — Single blob (max 10 MB)
- `softBackground` — Single blob (max 10 MB)
- `bg:<uuid>` — Up to 7 blobs (max 10 MB each)

**Total IndexedDB:** Up to ~80 MB (configurable per blob)

### 8.2 Persistence Triggers

**`projectionRecoveryState` written after:**

1. `projectSlide()` — Normal projection
2. `slideNext()` / `slidePrevious()` — Navigation
3. `setTranslation()` — Translation change (triggers re-projection)
4. `toggleBlank()` — Blank state change
5. Queue replacement (passage selection, chapter load)

**NOT written after:**
- Search query changes (ephemeral UI state)
- Preview changes (not committed)
- Undo (uses in-memory history stack)

### 8.3 Failure Handling

**localStorage quota exceeded:**

```typescript
try {
  localStorage.setItem('projectionRecoveryState', JSON.stringify(state));
} catch (err) {
  if (err.name === 'QuotaExceededError') {
    console.error('localStorage quota exceeded, recovery disabled');
    // ✅ Projection still works, just no recovery on reload
  } else {
    console.error('localStorage write failed:', err);
  }
}
```

**Privacy mode / disabled localStorage:**

```typescript
function safeLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;  // Graceful degradation
  }
}
```

**IndexedDB unavailable:**

```typescript
export async function loadAllAssets(): Promise<AssetRefs> {
  try {
    const db = await openDB('bible_projection_assets', 1);
    // ... load blobs ...
  } catch (err) {
    console.warn('IndexedDB unavailable, backgrounds disabled:', err);
    return { logo: null, softBackground: null, customBackgrounds: [] };
    // ✅ App works, just no custom backgrounds
  }
}
```

**Critical principle:** Persistence failure must **never** prevent core functionality (projection, navigation).

---

## 9. Recovery System

### 9.1 Recovery State Schema (P0 #1)

**Location:** `src/core/stateManager.ts`

```typescript
interface ProjectionRecoveryState {
  version: number;                   // Currently 1
  queue: Slide[];                    // Full projection queue
  currentSlideIndex: number;         // Selected position
  liveSlideIndex: number;            // Projected position
  committedPassage: Passage | null;  // Currently displayed passage
  isScreenBlanked: boolean;          // Blank state
  currentTranslation: string;        // Active translation
  timestamp: number;                 // When this was written
}
```

**Versioning strategy:**

```typescript
const RECOVERY_VERSION = 1;

function persistRecoveryState(state: Omit<ProjectionRecoveryState, 'version' | 'timestamp'>) {
  const recovery: ProjectionRecoveryState = {
    version: RECOVERY_VERSION,
    timestamp: Date.now(),
    ...state
  };
  
  try {
    localStorage.setItem('projectionRecoveryState', JSON.stringify(recovery));
  } catch (err) {
    console.error('Failed to persist recovery state:', err);
  }
}
```

**Future schema changes:**

```typescript
function loadRecoveryState(): ProjectionRecoveryState | null {
  const raw = localStorage.getItem('projectionRecoveryState');
  if (!raw) return null;
  
  const state = JSON.parse(raw);
  
  if (state.version !== RECOVERY_VERSION) {
    console.warn(`Recovery state version ${state.version} != ${RECOVERY_VERSION}, ignoring`);
    return null;
  }
  
  // Future: Handle version migrations
  // if (state.version === 1) { migrate_v1_to_v2(state); }
  
  return state;
}
```

### 9.2 Recovery Sequence

**Operator window startup:**

```typescript
// stateManager.ts - Zustand store initialization
const useStateManager = create<StateManager>((set, get) => ({
  // ... initial state ...
}));

// After translations load
export function initializeRecoveryState() {
  const recovery = loadRecoveryState();
  
  if (!recovery) {
    console.log('No recovery state found');
    return;
  }
  
  // Validate staleness (24-hour window)
  const age = Date.now() - recovery.timestamp;
  const MAX_AGE = 24 * 60 * 60 * 1000;
  
  if (age > MAX_AGE) {
    console.warn(`Recovery state is ${Math.round(age / 1000 / 60)} minutes old, ignoring`);
    localStorage.removeItem('projectionRecoveryState');
    return;
  }
  
  // Validate structure
  if (!Array.isArray(recovery.queue)) {
    console.error('Invalid recovery state: queue is not array');
    return;
  }
  
  if (typeof recovery.liveSlideIndex !== 'number' ||
      typeof recovery.currentSlideIndex !== 'number') {
    console.error('Invalid recovery state: indexes not numbers');
    return;
  }
  
  // Validate indexes
  if (recovery.liveSlideIndex >= recovery.queue.length ||
      recovery.liveSlideIndex < 0) {
    console.error('Invalid recovery state: liveSlideIndex out of bounds');
    return;
  }
  
  if (recovery.currentSlideIndex >= recovery.queue.length ||
      recovery.currentSlideIndex < 0) {
    console.error('Invalid recovery state: currentSlideIndex out of bounds');
    return;
  }
  
  // Restore state
  useStateManager.setState({
    projectionQueue: recovery.queue,
    currentSlideIndex: recovery.currentSlideIndex,
    liveSlideIndex: recovery.liveSlideIndex,
    committedPassage: recovery.committedPassage,
    isScreenBlanked: recovery.isScreenBlanked,
    currentTranslation: recovery.currentTranslation
  });
  
  console.log('Recovery state restored:', {
    queueSize: recovery.queue.length,
    liveIndex: recovery.liveSlideIndex,
    passage: recovery.committedPassage?.displayReference
  });
  
  // Sync with projection window
  broadcastSync({
    passage: recovery.committedPassage,
    isBlanked: recovery.isScreenBlanked,
    blankSettings: loadBlankSettings()
  });
}
```

### 9.3 Staleness Policy

**Rule:** Recovery state older than 24 hours is **ignored and deleted**.

**Rationale:**

| Age | Scenario | Desired Behavior |
|---|---|---|
| < 5 minutes | Browser crash during service | ✅ Restore (operator expects continuity) |
| 5-60 minutes | Break between services | ✅ Restore (probably same service) |
| 1-24 hours | Same day, later service | ⚠️ Restore (might be useful) |
| > 24 hours | Different day | ❌ Ignore (stale, confusing) |

**Implementation:**

```typescript
const MAX_RECOVERY_AGE = 24 * 60 * 60 * 1000; // 24 hours

if (Date.now() - recovery.timestamp > MAX_RECOVERY_AGE) {
  console.warn('Recovery state is stale, ignoring');
  localStorage.removeItem('projectionRecoveryState');
  return;
}
```

**Future consideration:** Make staleness window configurable (e.g., 1 hour for weekly services, 24h for daily services).

### 9.4 What Is NOT Recovered

**Intentionally ephemeral (lost on reload):**

1. **Search state** (`searchQuery`, `searchResults`, `selectedResultIndex`, `previewPassage`)
   - **Rationale:** Operator will re-type query. Search is transient UI interaction.

2. **History stack** (`historyStack`)
   - **Rationale:** Undo is passage-level. Operator can re-navigate via recents, search, or browse.

3. **Projection lock** (`projectionLocked`)
   - **Rationale:** Safer to default to unlocked on reload. Prevents accidental perpetual lock.

**Partial recovery (read from other keys):**

- **Blank settings:** Read from separate `blankSettings` key (both windows need it)
- **Recent passages:** Read from separate `recentPassages` key
- **Service plan:** Read from separate `servicePlanV2` key

**Rationale for separate keys:** These have independent lifecycles and are useful outside recovery context.

### 9.5 Recovery vs. Projection State

**Why both `projectionRecoveryState` AND `projectionState`?**

**`projectionState` (legacy):**
```typescript
{
  passage: Passage | null,
  isBlanked: boolean,
  blankSettings?: BlankSettings,
  timestamp: number
}
```
- Used by Projection window for cold-start recovery
- No navigation context (queue, indexes)

**`projectionRecoveryState` (P0 #1):**
```typescript
{
  version: number,
  queue: Slide[],
  currentSlideIndex: number,
  liveSlideIndex: number,
  committedPassage: Passage | null,
  isScreenBlanked: boolean,
  currentTranslation: string,
  timestamp: number
}
```
- Used by Operator window for full state recovery
- Includes navigation context → enables → / ← after reload

**Projection window recovery sequence:**
1. Read `currentProjection` (lightweight fallback)
2. Read `projectionState` (includes blank, overwrites #1)
3. Send `REQUEST_STATE` to operator (overwrites #2 if operator responds)

**Operator window recovery sequence:**
1. Read `projectionRecoveryState` (full state)
2. Validate and restore Zustand state
3. Broadcast `SYNC` to projection window

**Design:** Both windows can recover independently, with operator as authority.

---

## 10. Layer Boundaries

### 10.1 Dependency Graph (Strict One-Way)

```
┌─────────────────────────────────────────────────────────────┐
│ UI Layer                                                    │
│ (React components)                                          │
│                                                             │
│ • OperatorScreen.tsx                                        │
│ • SearchInput.tsx                                           │
│ • BibleNavigator.tsx                                        │
│ • ServicePlan.tsx                                           │
│ • ProjectionControl.tsx                                     │
│ • Projection.tsx                                            │
└───────────────────────┬─────────────────────────────────────┘
                        │ (calls actions, subscribes to state)
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ Controller Layer                                            │
│ (User interaction → State transitions)                      │
│                                                             │
│ • inputController.ts (useInputController, useGlobalKeyboard)│
│ • ProjectionControl.tsx (window management)                 │
└───────────────────────┬─────────────────────────────────────┘
                        │ (calls state actions)
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ State Layer                                                 │
│ (Single source of truth)                                    │
│                                                             │
│ • stateManager.ts (Zustand store)                           │
└─────┬─────────────────┬───────────────────┬─────────────────┘
      │                 │                   │
      │ (reads)         │ (writes)          │ (fire-and-forget)
      ▼                 ▼                   ▼
┌────────────┐  ┌───────────────┐  ┌──────────────────┐
│ Repository │  │ Persistence   │  │ BroadcastChannel │
│ Layer      │  │ Layer         │  │ Layer            │
│            │  │               │  │                  │
│ • bible    │  │ • localStorage│  │ • broadcastSync  │
│   Repository│  │ • IndexedDB   │  │                  │
│ • search   │  │               │  │                  │
│   Engine   │  │               │  │                  │
│ • autocomplete │             │  │                  │
└────────────┘  └───────────────┘  └──────────────────┘
      │
      │ (reads raw data)
      ▼
┌─────────────────────────────────────────────────────────────┐
│ Data Normalization Layer                                    │
│                                                             │
│ • bibleNormalizer.ts                                        │
│ • translationMetadata.ts                                    │
└───────────────────────┬─────────────────────────────────────┘
                        │ (reads)
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ Static Assets                                               │
│                                                             │
│ /public/data/*.zip (Bible translations)                     │
│ /public/data/semanticIndex.json                             │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 Forbidden Dependencies

**❌ NEVER:**

1. UI directly imports Repository
   ```typescript
   // ❌ WRONG
   import { bibleRepository } from '@/core/bibleRepository';
   function MyComponent() {
     const passage = bibleRepository.getPassage(...); // NO
   }
   ```

2. Repository mutates State
   ```typescript
   // ❌ WRONG
   class BibleRepository {
     getPassage() {
       useStateManager.setState({ ... }); // NO
     }
   }
   ```

3. Projection window imports State Manager
   ```typescript
   // ❌ WRONG - Projection.tsx
   import { useStateManager } from '@/core/stateManager'; // FORBIDDEN
   ```

4. State Manager imports UI components
   ```typescript
   // ❌ WRONG
   import { SearchInput } from '@/components/SearchInput';
   ```

5. Circular dependencies
   ```typescript
   // ❌ WRONG
   // stateManager.ts
   import { inputController } from './inputController';
   
   // inputController.ts
   import { useStateManager } from './stateManager';
   ```

### 10.3 Correct Data Flow Examples

**Search:**
```typescript
// SearchInput.tsx (UI)
const handleChange = (value: string) => {
  inputController.handleInputChange(value); // → Controller
};

// inputController.ts (Controller)
export function handleInputChange(value: string) {
  useStateManager.getState().setSearchQuery(value); // → State
}

// stateManager.ts (State)
setSearchQuery: (query: string) => {
  set({ searchQuery: query });
  const results = SearchEngine.search(query, get().currentTranslation); // → Repository
  set({ searchResults: results });
}

// searchEngine.ts (Repository)
export function search(query: string, translation: string): SearchResult[] {
  return bibleRepository.searchByReference(query, translation); // → Data
}
```

**Projection:**
```typescript
// OperatorScreen.tsx (UI)
<button onClick={() => projectCurrentSlide()}>Project</button>

// stateManager.ts (State)
projectCurrentSlide: () => {
  const slide = get().projectionQueue[get().currentSlideIndex];
  get().projectSlide(slide, get().currentSlideIndex);
}

projectSlide: (slide, index) => {
  set({ liveSlideIndex: index, committedPassage: ... }); // → State update
  broadcastCommit(passage); // → BroadcastChannel
  persistRecoveryState({ ... }); // → Persistence
  addToRecent(slide.reference); // → Persistence
}
```

---

## 11. Failure Modes & Guarantees

### 11.1 Critical Guarantees (MUST NEVER BREAK)

1. **Projection must never display wrong translation**
   - ❌ No fallback to KJV when NIV requested
   - ✅ Empty result or visible error

2. **Scripture text must never be modified**
   - ❌ No `.trim()`, `.normalize()`, `.replace()` on verse text
   - ✅ Byte-for-byte identical to source

3. **Navigation must follow normalized order**
   - ❌ No `verseNum + 1` arithmetic
   - ✅ Array index-based lookups

4. **Persistence failure must not prevent projection**
   - ❌ No `throw` on localStorage.setItem failure
   - ✅ Wrapped in try/catch, projection continues

5. **Projection window must remain read-only**
   - ❌ Projection window never writes to Zustand store
   - ✅ Only local React state

### 11.2 Failure Scenarios & Behavior

| Failure | Detection | Behavior | Recovery |
|---|---|---|---|
| **Projection window never opens** | Status stays `connecting` | Operator sees "disconnected" indicator | Click "Open Projection" again; check popup blocker |
| **Projection window closed mid-service** | `window.closed === true` polled every 1.5s | Status → `idle` | Click "Open Projection"; state restores from localStorage |
| **BroadcastChannel message dropped** | No explicit detection | Self-heals via 3s SYNC | Max 3s stale content |
| **Operator window reloads** | N/A (user action) | Projection keeps displaying last passage; operator restores from `projectionRecoveryState` | Queue + navigation restored; arrows work immediately |
| **Translation fails to load at boot** | `loadTranslation()` throws | Error screen with retry button | Click retry; or reload page |
| **Translation loaded but book missing** | `getBooksMap()` returns empty | `getPassage()` returns null; UI shows "not found" | Switch translation; or report data issue |
| **localStorage quota exceeded** | `QuotaExceededError` caught | Warning logged; persistence disabled; projection works | Clear localStorage; or reduce other apps' usage |
| **localStorage disabled (privacy mode)** | Try/catch on read/write | All persistence fails gracefully; app works without recovery | Use normal browsing mode |
| **IndexedDB unavailable** | `openDB()` throws | Backgrounds disabled; app works otherwise | Enable IndexedDB; or use without custom backgrounds |
| **Invalid verse reference** | `findIndex()` returns -1 | Warning logged; navigation returns null; UI shows error | Operator re-selects valid passage |
| **Stale recovery state (>24h)** | Timestamp check | Recovery ignored; deleted from localStorage | Operator selects passage fresh |
| **Two operator windows open** | No detection | Last writer wins; undo stacks diverge; projection confused | Close one window |
| **Verse key doesn't exist in translation** | Array lookup fails | Returns null/empty; UI shows "not found" | Operator uses different translation |

### 11.3 Error Handling Patterns

**localStorage writes:**
```typescript
try {
  localStorage.setItem(key, value);
} catch (err) {
  if (err.name === 'QuotaExceededError') {
    console.error('localStorage quota exceeded');
  } else {
    console.error('localStorage write failed:', err);
  }
  // ✅ App continues to work
}
```

**localStorage reads:**
```typescript
function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    console.warn(`localStorage read failed for ${key}:`, err);
    return null;
  }
}
```

**IndexedDB:**
```typescript
async function loadAsset(key: string): Promise<Blob | null> {
  try {
    const db = await openDB(...);
    const blob = await db.get('assets', key);
    return blob || null;
  } catch (err) {
    console.warn(`IndexedDB read failed for ${key}:`, err);
    return null; // ✅ Graceful degradation
  }
}
```

**Translation loading:**
```typescript
async loadTranslation(code: string): Promise<void> {
  try {
    // ... load and parse ...
  } catch (err) {
    console.error(`Failed to load translation ${code}:`, err);
    throw err; // ❌ Re-throw: boot failure is critical
  }
}
```

---

## 12. Performance Characteristics

### 12.1 Load-Time Performance

**Boot sequence:**
1. React app loads (~500ms)
2. Fetch 5 translation ZIPs in parallel (~1-2s network)
3. Decode ZIPs with JSZip (~1-2s CPU)
4. Parse JSON and normalize (~500ms)
5. Build indexes and canonical order (~200ms)
6. Render UI (~100ms)

**Total boot time:** ~3-5 seconds (offline)

**Dominant cost:** ZIP decoding (main thread, blocking)

**Optimization opportunities:**
- Move JSZip decode to Web Worker (non-blocking)
- Cache parsed translations in IndexedDB (instant second boot)
- Lazy-load translations (3-5s → <1s boot, but adds lag on translation switch)

**Trade-off decision:** Eager load all 5 translations.
- **Pro:** Translation switch is instant (<100ms)
- **Con:** 3-5s boot delay

**Rationale:** Mid-service lag is **unacceptable**. Boot delay is **acceptable**.

### 12.2 Runtime Performance

**Projection latency:**
```
User presses → or clicks "Project"
  ↓ <10ms
Input handler fires
  ↓ <5ms
Zustand state update (sync)
  ↓ <1ms
BroadcastChannel.postMessage (fire-and-forget)
  ↓ <50ms (browser IPC)
Projection window receives message
  ↓ <5ms
React setState + re-render
  ↓ <100ms (AutoFitVerse layout calculation)
Verse appears on screen
```

**Total latency:** <200ms (sub-second requirement met)

**Dominant cost:** AutoFitVerse binary search for font size

**Optimization opportunities:**
- Cache font sizes for common verses
- Use CSS `clamp()` for responsive sizing (less accurate)
- Limit binary search iterations (trade accuracy for speed)

**Current approach:** Up to 28 iterations (72px → 16px, step 2px)

### 12.3 Memory Usage

**Bible text (in-memory):**
- 5 translations × ~31,000 verses × ~100 bytes/verse ≈ 15 MB
- JavaScript object overhead ≈ 3× ≈ 45 MB
- Plus Maps, arrays, metadata ≈ 15 MB
- **Total:** ~60-100 MB resident

**Projection queue:**
- Typically <100 slides × ~200 bytes ≈ <20 KB (negligible)

**Total app memory:** ~100 MB (acceptable for desktop)

**Scalability limit:** ~10 translations before low-end devices (4 GB RAM) start swapping

### 12.4 Search Performance

**Keyword search (worst case):**
- Scan 31,000 verses
- Per verse: lowercase + split + match
- Complexity: O(n × m) where n = verses, m = words/verse
- Latency: ~50-200ms (still interactive)

**Bottleneck:** Full linear scan on every keystroke >3 chars

**Optimization opportunities:**
- Build inverted index at load (token → verse IDs)
- Debounce search input (reduce scans)
- Limit results (already capped at 5)

**Current approach:** Linear scan (acceptable for 5 translations)

**Semantic search:**
- Scan ~200 semantic entries
- Complexity: O(n) where n = semantic entries
- Latency: ~5-10ms (negligible)

---

## 13. Constraints & Invariants

### 13.1 Data Fidelity Constraints

**NEVER:**
- ❌ Modify verse text (trim, normalize, replace)
- ❌ Fall back to a different translation
- ❌ Invent verse keys that don't exist in source
- ❌ Assume verse number === array index
- ❌ Use `parseInt()` for verse navigation

**ALWAYS:**
- ✅ Preserve verse text byte-for-byte
- ✅ Return empty/null when data missing
- ✅ Use array index for navigation
- ✅ Validate source data during normalization

### 13.2 Architectural Constraints

**NEVER:**
- ❌ Make Projection window write to Zustand store
- ❌ Use verse arithmetic (`verseNum + 1`)
- ❌ Introduce a backend/database
- ❌ Lazy-load translations (breaks instant switch)
- ❌ Block projection on persistence failure

**ALWAYS:**
- ✅ Single source of truth (Operator window)
- ✅ Index-based navigation
- ✅ Offline-first
- ✅ Fail-safe persistence (try/catch)
- ✅ Fire-and-forget BroadcastChannel

### 13.3 Performance Constraints

**NEVER:**
- ❌ Let projection latency exceed 1 second
- ❌ Block main thread for >100ms (except boot)
- ❌ Introduce network dependency for core features

**ALWAYS:**
- ✅ Preload all translations at boot
- ✅ Async/await for ZIP loading
- ✅ Try/catch for all I/O
- ✅ Sub-second projection

### 13.4 User Experience Constraints

**NEVER:**
- ❌ Show operator UI on projection screen
- ❌ Auto-project a preview
- ❌ Let persistence failure break core UX
- ❌ Silently fall back to wrong data

**ALWAYS:**
- ✅ Separate operator/projection windows
- ✅ Require explicit commit (Enter/click)
- ✅ Graceful degradation
- ✅ Visible errors over silent incorrectness

---

## Document Version History

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2024 | Initial architecture documentation after P0 implementations |

---

## References

- System Teardown Document (original specification)
- P0 #1 Prompt: "Persist and Recover Active Projection Navigation State"
- P0 #2 Prompt: "Make Verse Navigation Key/Index-Based"
- Codebase at commit `84b164a9653ad8b71faf16cbd0b5e3b16ec06d0d`

---

**END OF ARCHITECTURE.md**
```
# System Teardown — Offline-First Bible Projection System

Version of record: current `main` working tree. Every claim below maps to code in `src/`.

---

## 1. System Overview

### Problem
Church A/V operators need to display Bible verses on a projector or TV during a live service, with zero tolerance for latency, network failure, or visible operator UI on the audience screen. Commercial presentation software is heavyweight, license-bound, and usually requires setup per machine. Generic browser tabs cannot guarantee that the audience never sees the operator's controls.

This application solves: **project any verse, in any of five translations, on a second screen, in under one second, with no internet connection and no installation.**

### Target users
- Volunteer A/V operators with low technical skill, often rotating weekly.
- Small-to-mid churches with one laptop plus an HDMI-connected TV/projector.
- Users who set up minutes before a service and cannot debug anything.

### Core use cases
1. Operator types `John 3:16`, presses Enter — verse appears on the projector.
2. Operator arrows forward/backward through consecutive verses during preaching.
3. Operator prepares a Service Plan before the service and steps through it with `N`.
4. Operator blanks the screen (`B`) between segments, optionally showing a logo, soft background, or a session screen ("Prayer Time", "Offering").
5. Operator switches translation mid-service; the live verse re-renders in the new translation instantly.
6. Operator recovers from a mistake with Undo (`Ctrl/⌘+Z`), from a projector-window crash by reopening the window, or from an operator-window reload via the automatic recovery snapshot — arrows, undo stack, and blank state all restore.

### Constraints that shaped the design
| Constraint | Consequence |
|---|---|
| **Must work fully offline** | All Bible text ships as static ZIP assets in `/public/data/`; no API, no server, no database. |
| **Zero infrastructure cost** | Pure client-side SPA (React + Vite). No backend, no auth, no hosted storage. |
| **Sub-second projection** | All five translations preloaded into memory at boot; projection is an in-memory lookup plus a `BroadcastChannel.postMessage`. |
| **Two physical screens, one browser** | Second `window.open('/projection')` rather than an iframe or CSS-only "presenter mode" — only a real window can be dragged to a second display and fullscreened. |
| **Volunteer-grade operators** | Progressive onboarding, contextual hints, guided projector-setup dialog, large keyboard surface. |
| **Desktop only** | `MobileBlocker` refuses to render below 768px; a phone cannot drive a projector. |

---

## 2. High-Level Architecture

### Topology

```text
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  OPERATOR WINDOW  ("/")     │        │  PROJECTION WINDOW           │
│                             │        │  ("/projection")             │
│  OperatorScreen             │        │                              │
│   ├ SearchInput / Results   │        │  Projection.tsx              │
│   ├ BibleNavigator (browse) │        │   ├ AutoFitVerse             │
│   ├ ServicePlan             │        │   └ BlankOverlay             │
│   ├ RecentPassages          │        │                              │
│   ├ PresenterPanel          │        │  Local React state only.     │
│   ├ ProjectionSettings      │        │  NO Zustand store here.      │
│   └ ProjectionControl       │        │                              │
│                             │        │                              │
│  Zustand store (truth)      │        │                              │
└──────────┬──────────────────┘        └───────────┬──────────────────┘
           │                                       │
           │      BroadcastChannel                 │
           │      'bible-projection-sync'          │
           ├──── COMMIT_PASSAGE ──────────────────►│
           ├──── BLANK / UNBLANK ─────────────────►│
           ├──── SYNC (every 3s) ─────────────────►│
           ├──── RELOAD_ASSETS ───────────────────►│
           │◄─── HEARTBEAT (every 2s) ─────────────┤
           │◄─── PROJECTOR_READY ──────────────────┤
           │◄─── REQUEST_STATE ────────────────────┤
           ├──── STATE_RESPONSE ──────────────────►│
           │                                       │
     ┌─────┴───────────────────────────────────────┴─────┐
     │  Shared browser origin storage                    │
     │   localStorage: currentProjection, projectionState│
     │                 blankSettings, recentPassages,    │
     │                 servicePlanV2, onboarding flags   │
     │   IndexedDB   : logo, softBackground, bg:<uuid>   │
     └───────────────────────────────────────────────────┘
```

### Frontend structure

**Layer boundaries are strict and one-directional:**

```text
UI components  ──►  inputController  ──►  stateManager (Zustand)
                                              │
                          ┌───────────────────┼───────────────────┐
                          ▼                   ▼                   ▼
                   bibleRepository      broadcastSync        localStorage
                          │
                   bibleNormalizer  ◄── raw ZIP JSON
```

- `src/core/types.ts` — canonical domain types (`Verse`, `Chapter`, `BibleBook`, `PassageReference`, `Passage`, `Slide`, `SearchResult`, `SemanticEntry`).
- `src/core/bibleNormalizer.ts` (149 LOC) — the only place that knows about input file formats.
- `src/core/bibleRepository.ts` (512 LOC) — read-only, translation-aware data access. Singleton class instance. Never mutates app state.
- `src/core/searchEngine.ts` (169 LOC) — pure ranking. Read-only against the repository. Singleton.
- `src/core/autocomplete.ts` — Levenshtein-based reference suggestions, read-only.
- `src/core/stateManager.ts` (~770 LOC) — Zustand store. The **only** writer of projection state.
- `src/core/broadcastSync.ts` (168 LOC) — message schema, channel singleton, blank-settings persistence, projection-state persistence.
- `src/core/assetStorage.ts` (137 LOC) — IndexedDB wrapper for image blobs.
- `src/core/translationMetadata.ts` — code → display-name map with code fallback.
- `src/core/inputController.ts` (~310 LOC) — two hooks: `useInputController` (search-scoped) and `useGlobalKeyboard` (window-scoped shortcuts; modifier-guarded letters, empty-input pass-through, Escape/`?` handling — see §5.11).

**Rendering flow:** React function components subscribing to Zustand slices. No memoized selectors — the store is small and updates are user-paced (a few per second at most), so full-store subscription is acceptable.

### Backend structure
There is none. Deliberately. There is no service layer, no API, no database, no auth. "Business logic" lives in three pure-ish modules (`bibleRepository`, `searchEngine`, `autocomplete`) that are separated from the mutable store by being read-only singletons.

### Data flow — a complete projection

```text
1. Operator types "John 3:16"
2. SearchInput.onChange → useInputController.handleInputChange
3. SearchEngine.isValidInput(value)             (rejects <>{}[]\ and >200 chars)
4. setSearchQuery(value)                        (store write)
5. SearchEngine.search(value, currentTranslation)
      ├ BibleRepository.searchByReference()     exact, score 100
      ├ getNearbyPassages()                     score 90 - 5i
      ├ searchSemanticIndex()                   score 80 - 3i
      └ BibleRepository.searchByKeyword()       score 50 - 2i
6. setSearchResults(results)                    → selectedResultIndex = 0,
                                                  previewPassage = results[0]
   *** NOTHING IS PROJECTED YET ***
7. Operator presses Enter → setPreview(passage)
8. setPreview captures oldLiveSlide, calls passageToSlides(), replaces
   projectionQueue, currentSlideIndex = 0, then _commitWithOldSlide(oldLiveSlide)
9. _commitWithOldSlide → (if not locked) projectSlide()
10. projectSlide:
      ├ push oldLiveSlide onto historyStack IF book/chapter differs (cap 10)
      ├ set liveSlideIndex, committedPassage, isScreenBlanked = false
      ├ localStorage['currentProjection'] = passage
      ├ broadcastCommit(passage)                → BroadcastChannel
      ├ persistProjectionState({passage,isBlanked,timestamp})
      ├ addToRecent(slide.reference)            → localStorage, cap 15
      └ pre-load the next verse into the queue tail
11. Projection window's onBroadcastMessage receives COMMIT_PASSAGE
12. setPassage(payload); setIsBlanked(false)
13. AutoFitVerse re-runs useLayoutEffect → binary-ish downscale loop to fit
```

### Communication patterns
- **Synchronous:** everything inside the operator window. Store writes are synchronous; UI re-renders in the same tick.
- **Asynchronous, fire-and-forget:** operator → projection over `BroadcastChannel`. There is no ack for `COMMIT_PASSAGE`. Reliability comes from three independent redundancies:
  1. `SYNC` broadcast every 3 s from `ProjectionControl` (full state re-assert).
  2. `HEARTBEAT` every 2 s from the projection window; operator marks `disconnected` after 5 s of silence.
  3. `localStorage` persistence read on projection-window mount (`currentProjection` then `projectionState`), so a refresh or crash restores instantly with no operator action.
- **Asynchronous, awaited:** ZIP fetch + JSZip decode + normalization at boot; IndexedDB reads for images.

### Why this architecture over alternatives

| Alternative | Rejected because |
|---|---|
| Server-rendered app with a DB | Requires internet in buildings that often have none; adds cost and an ops burden no volunteer can carry. |
| Single window, CSS fullscreen "presenter mode" | Cannot place output on a second physical display; the browser has no API to move content between screens without user gesture. |
| iframe for the projection view | Same-window; cannot be fullscreened onto a second monitor independently. |
| `postMessage` on the `window` handle returned by `window.open` | Breaks on projector-window refresh (handle survives but listeners rebind awkwardly) and gives no recovery if the operator window reloads. `BroadcastChannel` is handle-independent and origin-scoped. |
| Redux / Context | Zustand gives a single store with `get()`/`set()` usable from outside React (`useStateManager.getState()` inside intervals in `ProjectionControl`) without provider plumbing. |
| Loading verse text on demand from ZIP | 3–5 s of decode per translation is intolerable mid-service; hence full preload at boot. |
| Server-side search index | Search must work offline; the semantic index is a 25 KB static JSON. |

---

## 3. State Management

### Source of truth — precise definitions

| Concern | Source of truth | Notes |
|---|---|---|
| What is currently on the projector | `stateManager.committedPassage` + `liveSlideIndex` + `isScreenBlanked` | The projection window's own React state is a **replica**, never authoritative. |
| Current translation | `stateManager.currentTranslation` | Mirrored into `BibleRepository.currentTranslation` for defaulting only. |
| Verse text | `BibleRepository` in-memory maps | Immutable after load. |
| Blank/session/background settings | `localStorage['blankSettings']` via `loadBlankSettings()` / `saveBlankSettings()` | Read on demand, not held in Zustand — the only intentional exception, because both windows need it and it changes rarely. |
| Image binaries | IndexedDB (`bible_projection_assets`) | Never in Zustand, never in localStorage. |
| Service plan | `localStorage['servicePlanV2']`, component state in `ServicePlan.tsx` | Migrated from legacy key `servicePlan` on read. |
| Onboarding/hint completion | `localStorage` (`bible-projection-onboarded`, `hint:<id>`) | Boolean flags only. |

### Persisted vs derived

**Persisted (survives reload):**
- `currentProjection` — last projected `Passage` (written on every projection *and* on undo, so the projection window's refresh loader can never resurrect an undone verse).
- `projectionState` — `{passage, isBlanked, blankSettings?, timestamp}`.
- `blankSettings` — style, session screens, background refs, active IDs.
- `recentPassages` — array of reference strings, max 15.
- `projectionRecoveryState` — bounded snapshot of the active projection session (`queue` capped 200, `historyStack` capped 10, `currentSlideIndex`, `liveSlideIndex`, `committedPassage`, `isScreenBlanked`, `currentTranslation`, `projectionLocked`), written by `persistRecoveryState()` after every state-changing action and restored on operator boot via `restoreProjectionSession()` (48 h freshness window, quarantined on parse/shape failure). This is what makes queue navigation survive an operator reload.
- `servicePlanV2`, onboarding flags, `hint:*` flags.
- IndexedDB image blobs.

**In-memory only (lost on reload):**
- `searchQuery`, `searchResults`, `selectedResultIndex`, `previewPassage`
- All Bible text and translation metadata

**Derived, never stored:**
- `committedPassage` is derived from a `Slide` via `slideToPassage(slide, currentTranslation)` — it is stored in the store for convenience, but it is a projection of `projectionQueue[liveSlideIndex]`.
- `displayReference` is derived in `BibleRepository.getPassage()`.
- Translation display name is derived at render time in `AutoFitVerse`.

### How state updates propagate

Every projection funnels through **one function**: `projectSlide(slide, index, get, set, oldLiveSlideOverride?)` in `stateManager.ts`. Nothing else calls `broadcastCommit` except `undoProjection` and `loadChapterAsQueue`, which deliberately bypass history tracking.

Callers reach it through exactly three entry points:
- `commitCurrentSlide()` — normal path (keyboard, buttons).
- `_commitWithOldSlide(oldLiveSlide)` — used when the queue is replaced *before* committing, so history can still record what was previously live. This exists because `projectSlide` reads `projectionQueue[liveSlideIndex]` to find the outgoing slide, and that read is wrong once the queue has been swapped.
- `projectNow()` — the `P` shortcut and the Project button under Lock.

The **Projection Lock** short-circuits both commit paths: when `projectionLocked` is true, the queue is still extended (next-verse pre-load runs) but no broadcast happens. That is the whole "preview-then-project" mode.

### Consistency mechanisms
1. **Single-writer invariant.** Only the operator window writes projection state. The projection window is strictly a subscriber; it has no store and cannot originate a change.
2. **Idempotent re-assertion.** The 3-second `SYNC` overwrites the projection window's passage, blank flag, and blank settings unconditionally. Any dropped message self-heals within 3 s.
3. **Cold-start reconciliation.** On mount the projection window reads `currentProjection`, then `projectionState` (which wins, since it also carries blank state), then sends `REQUEST_STATE`; the operator answers with `STATE_RESPONSE`.
4. **Liveness.** `PROJECTOR_READY` on mount plus a 2 s heartbeat; the operator flips to `disconnected` after 5 s and to `idle` when the polled `window.closed` becomes true (checked every 1.5 s).
5. **Translation invariant.** No call site hardcodes `'KJV'` any more. Search, Browse, Service Plan, Recent, and next/previous navigation all read `currentTranslation` from the store. `setTranslation` re-projects the live slide in the new translation so the on-screen label and text can never disagree.

---

## 4. Data Layer

### Canonical model
```ts
interface Verse   { verse: string;   text: string }
interface Chapter { chapter: string; verses: Verse[] }
interface BibleBook { book: string; chapters: Chapter[] }
```
Numbers are **strings**, never coerced. Reason: source data contains keys like `"3a"` in some translations, and integer coercion would silently corrupt them. Sorting handles numeric ordering explicitly.

Runtime projection unit:
```ts
interface Slide { reference: string; text: string; book: string; chapter: string; verse: string }
```
A `Slide` is one verse. A `Passage` may hold a range. `passageToSlides()` explodes a passage into slides; `slideToPassage()` wraps a slide back into a single-verse passage for broadcast.

### Storage decisions

| Data | Store | Why |
|---|---|---|
| Bible text (~7 MB zipped, 5 translations) | Static ZIPs in `/public/data/`, decoded into RAM | Immutable, cacheable by the browser, no DB needed. |
| Semantic index (25 KB) | `/public/data/semanticIndex.json` | Small; loaded eagerly alongside translations. |
| Projection state, settings, plan, history flags | `localStorage` | Small JSON, synchronous reads, shared across both windows on the same origin. |
| Images (logo, up to 7 backgrounds) | IndexedDB, blobs | localStorage's ~5 MB quota and string-only values make blob storage there impossible; a single 3 MB PNG base64-encoded would blow the quota. |

Only **references** (`{id, name, createdAt}`) live in `blankSettings`; the binaries live under `bg:<uuid>` keys in IndexedDB. `MAX_BACKGROUNDS = 7`, `MAX_SIZE = 10 MB`, allowed types PNG/JPEG/WEBP (`validateImageFile`).

### Normalization
`bibleNormalizer.normalizeBibleJson(raw)` accepts three shapes and emits `{books: BibleBook[], metadata}`:
1. Canonical single book — `{book, chapters: [...]}`.
2. Array of canonical books.
3. Nested-object format — `{Info: {...}, "John": {"1": {"1": "In the beginning…"}}}`.

Rules enforced there and nowhere else:
- Chapter and verse keys sorted with `numericKeyCompare` — numeric when both sides parse, lexical fallback. This is what makes `"10"` sort after `"9"`.
- Verse text preserved **verbatim** — no trimming, no whitespace collapsing, no newline stripping. Scripture text must be byte-faithful.
- `Info` / `info` / `metadata` keys extracted into a separate metadata object, never merged into books.

Because all format knowledge is confined to this file, search, browse, and projection are format-agnostic and adding a new source shape is a one-file change.

### Loading pipeline (`BibleRepository.loadTranslation`)
1. Look up the code in `TRANSLATION_ZIPS` (`KJV`, `NIV`, `NKJV`, `NLT`, `AMP`) — unknown code throws immediately.
2. `fetch` the ZIP; non-2xx throws with the status.
3. `JSZip.loadAsync`, then walk **every** `.json` entry (some ZIPs are one file per book).
4. Parse each; JSON errors are collected, not thrown per-file.
5. Route each through the normalizer; merge metadata (last write wins per key).
6. Insert books into a `Map` keyed by lowercased name. **Duplicates keep the first occurrence** and log a warning — a stray duplicate file must never silently overwrite verified data.
7. Fail fast: zero `.json` files → throw; zero valid books → throw with accumulated parse errors.
8. Build canonical 66-book order once, from the first translation loaded, via `sortBooksInOrder`.
9. Register book aliases (`gen`, `ps`, `1 cor`, `revelations`, …) for reference parsing.

`preloadAllTranslations()` runs all five in `Promise.all` at boot from `OperatorScreen`'s mount effect, alongside `SearchEngine.loadSemanticIndex()`, behind a full-screen spinner.

### Integrity guarantees
- `getBooksMap()` **never falls back to another translation.** It logs and returns an empty map. This is a deliberate, load-bearing decision: the earlier silent fallback produced the "label says NIV, text is KJV" class of bug.
- Bible data is never mutated after load; the repository exposes only readers.
- `setTranslation` awaits `loadTranslation` and only commits `currentTranslation` after success; on failure it stays on the previously working translation rather than reverting to a default.

---

## 5. Core Features

### 5.1 Search
**Problem:** find a verse from a reference, a partial reference, or a plain-language phrase, in under a keystroke's latency.

**Flow:** validate → store query → `SearchEngine.search(query, translation, limit=5)` → four ranked strategies (exact reference 100, adjacent verses 90−5i, semantic 80−3i, keyword 50−2i) → dedupe by `displayReference` → sort by score → truncate.

**State:** `searchQuery`, `searchResults`, `selectedResultIndex`, `previewPassage`, `currentTranslation`.

**Edge cases:** empty query clears results and preview; injection-ish characters rejected outright; keyword search requires ≥3 chars and ≥3-char terms; semantic requires ≥2 chars; results never auto-project — projection requires Enter or a click.

### 5.2 Browse (BibleNavigator)
Two-column Old/New Testament book list → chapter grid → verse grid. Selecting a verse builds a queue from the passage under `currentTranslation` and projects it through the standard pipeline.

### 5.3 Service Plan
Ordered, editable list persisted at `servicePlanV2` (auto-migrated from legacy `servicePlan`). Supports inline edit, reorder, safe delete, and active-item tracking. `N` or `Shift+Enter` dispatches a `nextServicePlanPassage` window event that the component consumes — the one place a DOM CustomEvent is used instead of the store, to avoid coupling the global keyboard hook to plan internals.

### 5.4 Recent Passages
`addToRecent` is called from every projection. It removes any existing identical reference before unshifting, so the list is duplicate-free and ordered by last use, capped at 15. Individual and bulk deletion are supported and do not touch what is live.

### 5.5 Slide navigation
`slideNext`/`slidePrevious` walk `projectionQueue`. At either boundary they extend the queue by fetching the true next/previous verse via `BibleRepository.getNextVerse`/`getPreviousVerse`, which roll over chapter *and* book boundaries using canonical order. `→`/`←` navigate **and** commit in one action. `Escape` clears the preview (search query, results, preview passage) — it never advances the projection. When a passage is live, `clearPreview` preserves the queue and snaps `currentSlideIndex` back to `liveSlideIndex`, so `←`/`→`/`P` keep working after dismissing a preview; with nothing live, the preview-only queue is dropped.

`isSameReferenceGroup` means verse-to-verse movement inside one chapter does **not** pollute the undo stack — undo is passage-level, which matches how operators think.

### 5.6 Blank / session screens
`B` toggles blank. Blank renders one of four styles: `black`, `logo`, `soft` (image or gradient), `session` (title + subtitle card, e.g. "Prayer Time"). Five default session screens ship; users can add, edit, and delete their own. Settings travel with the `BLANK_SCREEN` and `SYNC` messages, so the projection window never needs to read localStorage mid-service.

### 5.7 Image uploads
Validated (type + 10 MB), stored as a blob under `bg:<uuid>`, reference appended to `blankSettings.backgrounds` (cap 7), then `RELOAD_ASSETS` is broadcast. The projection window revokes existing object URLs and re-runs `loadAllAssets()`.

### 5.8 Auto-fit projection rendering
The projection viewport is split into two siblings inside a full-screen flex column:
- **Verse region** — `flex-1 min-h-0`, holds `verseBoundsRef`. This is the *only* measured region.
- **Metadata region** — `shrink-0`, holds the reference and the translation display name at fixed responsive sizes.

`useLayoutEffect` sets the verse font to 72 px and steps down by 2 px while `scrollHeight > clientHeight || scrollWidth > clientWidth`, floor 16 px. The `scrollWidth` check catches long unbroken strings. Re-runs on verse change and on `resize`.

Because metadata is outside the measured bounds, long verses can never compress or overlap the reference, and spacing is identical for a 5-word verse and a 60-word verse.

### 5.9 Projection window setup
`ProjectionControl` opens `window.open('/projection', 'projectionWindow', 'width=1280,height=720')`, sets status `connecting`, and on `PROJECTOR_READY` shows a three-step guided dialog: drag to the TV → press F11 → confirm only the verse is visible. Status badge shows idle / connecting / active / disconnected. No screen-detection or window-moving APIs are used — they are unreliable and permission-gated.

### 5.10 Onboarding
`OnboardingManager` runs a `welcome → prompt → tutorial → done` phase machine gated on `bible-projection-onboarded`. `TutorialOverlay` measures the target rect, calls `scrollIntoView({behavior:'smooth', block:'nearest'})` when the target is offscreen, clamps the tooltip to a 12 px viewport inset (correct under browser zoom and resize), and always renders a fixed Exit button so the user can never be trapped. `ContextualHint` shows a one-time inline hint per feature, keyed `hint:<id>`. "Replay Tutorial" clears the onboarding flag and every hint flag, then reloads.

### 5.11 Keyboard shortcut pipeline
Five listeners coexist and must not be confused:
1. **`useGlobalKeyboard`** (window `keydown`, mounted once by `OperatorScreen`, handlers read through a ref so the listener is registered exactly once): `→`/`←` = slideNext/Previous + commit, `B` = blank toggle, `P` = projectNow, `C` = chapter-as-queue, `PageUp`/`PageDown` = chapter jump, `N`/`Shift+Enter` = next Service Plan passage (via `nextServicePlanPassage` CustomEvent), `Ctrl/⌘+Z` = undo, `Escape` = clearPreview, `?` = toggle the footer shortcut-help popover (dispatches `wordde:toggle-shortcut-help`, which `OperatorScreen` uses to control the Radix popover).
2. **Search field path** — `SearchInput` handles suggestions (arrows/Enter/Tab/Escape with `stopPropagation`) then forwards to `useInputController.handleKeyDown` (arrows move the selected result, Enter commits, Escape clears). Forwarding happens exactly once — the wrapping `div` in `OperatorScreen` deliberately has NO `onKeyDown`; a second registration here previously double-fired every arrow (skipping two results at a time).
3. **`OperatorScreen` arrow tracker** — passive usage tracker for the keyboard hint chip.
4. **`TutorialOverlay`** — onboarding step listeners, unaffected by the global hook.
5. **`ServicePlan`** — consumes `nextServicePlanPassage`; the DOM CustomEvent is deliberate so the global hook stays decoupled from plan internals.

Load-bearing invariants (each was a shipped defect once — do not "simplify" them back):
- **No fall-through.** The global `switch` gives `Escape` its own `return`; `case 'Escape':` directly followed by `case 'ArrowRight':` once projected instead of clearing (unconditional `preventDefault`+`slideNext`).
- **Modifier-guarded letters.** `b`/`c`/`p`/`n` fire only without Ctrl/⌘/Alt, so OS combos (copy/print/new-window) are never hijacked. `Ctrl/⌘+Z` is the one intentional combo.
- **Empty-input pass-through.** The INPUT/TEXTAREA/contentEditable guard returns early for typing targets — but the search input auto-focuses on boot, so a blanket guard made EVERY shortcut dead until the first click. While the field is focused but EMPTY, non-printing navigation keys (`←`/`→`/`↑`/`↓`/`PageUp`/`PageDown`/`Escape`/`?`) pass through; once the field has text, everything is blocked so typing never double-fires shortcuts.
- **Live queue survives Escape.** `clearPreview` keeps `projectionQueue` and snaps `currentSlideIndex` to `liveSlideIndex` when a passage is live (previously it emptied the queue, making `←`/`→`/`P` silent no-ops until the next passage load); a preview-only queue is still dropped.
- **Undo syncs both persistence keys.** `undoProjection` writes `currentProjection` (broadcast + refresh loader) AND the recovery snapshot; skipping `currentProjection` once made a projection-window refresh after undo resurrect the undone verse.

Behavioral coverage lives in `src/test/keyboardShortcut.test.tsx` (17 tests, real KeyboardEvents through the mounted hook). Synthetic-event caveat: Radix dismissable layers only respond to trusted Escape, so popover Esc-close is verified manually, not in jsdom.

---

## 6. Design Decisions & Tradeoffs

**1. Two real windows over one.**
Options: single window + CSS, iframe, second window. Chose second window — the only option that can live on a second physical display and be fullscreened independently. Downside: cross-window state sync is now a real distributed-systems problem (solved with heartbeats and periodic re-sync), and popup blockers can interfere on first use.

**2. `BroadcastChannel` over `postMessage` / `localStorage` events.**
Handle-independent, survives refresh on either side, origin-scoped. Downside: same-origin, same-browser only — no networked second device.

**3. Preload all five translations at boot.**
Options: lazy per translation, preload all. Chose preload: mid-service switch lag was unacceptable. Cost: 3–5 s boot and roughly 60–100 MB of resident JS heap for parsed verse objects. This is the single largest resource decision in the system.

**4. Full-store Zustand subscription, no selectors.**
Simpler code; update frequency is human-paced. Downside: every store write re-renders every subscribed operator component. Irrelevant at this scale, would matter if the operator UI grew large lists.

**5. `blankSettings` in localStorage rather than Zustand.**
Both windows need it and it mutates rarely. Downside: it is the one piece of state outside the single-source-of-truth rule; changes require an explicit broadcast to propagate.

**6. Verse-to-verse moves excluded from undo.**
Matches operator mental models (undo = "go back to the previous passage"). Downside: you cannot undo a single accidental arrow press; you press the other arrow instead.

**7. Strings for chapter/verse numbers.**
Preserves non-numeric verse keys and exact source fidelity. Downside: every ordering operation needs an explicit comparator, and off-by-one arithmetic requires `parseInt` at each site.

**8. First-occurrence-wins on duplicate books.**
Fail-soft rather than fail-hard, so one malformed extra file cannot break an entire translation at service time. Downside: a genuinely wrong first file is silently preferred; only a console warning surfaces it.

**9. Empty map instead of translation fallback.**
Fails visibly (blank result) rather than incorrectly (wrong text under the right label). Correctness over convenience.

**10. No backend at all.**
Zero cost, zero ops, guaranteed offline. Downside: no multi-device control, no shared plans between machines, no analytics, no central content updates.

---

## 7. Scalability

### What breaks first
1. **Memory.** Five fully parsed translations are the dominant cost. At ~10 translations, low-end 4 GB laptops — the exact hardware churches donate to A/V — will start swapping or OOM the tab.
2. **Boot time.** `preloadAllTranslations` is `Promise.all` over N ZIPs, each decoded on the main thread by JSZip. Decode is not parallel; it competes for the single JS thread. Boot grows roughly linearly with translation count.
3. **Keyword search.** `searchByKeyword` is a full linear scan over every verse of the current translation — roughly 31,000 verses × string ops per keystroke over 3 characters. It is already the slowest interaction and will become visibly laggy well before the memory ceiling.
4. **Semantic index.** A flat array scanned linearly with per-entry synonym loops. Fine at ~hundreds of entries; unusable at tens of thousands.
5. **localStorage.** Combined footprint is small (a few KB), but `projectionState` is written on *every* projection — synchronous main-thread I/O in the hot path.

### Bottlenecks today
- JSZip decode on the main thread (boot only).
- Linear keyword scan (per keystroke).
- Full-store re-render on every write (negligible now).

### To reach 10× / 100×
- Move ZIP decode into a Web Worker; stream results so the first translation is usable before the last finishes.
- Replace eager full-preload with: preload the two most-used translations, lazy-load the rest with a warm-on-idle prefetch.
- Build an inverted keyword index once at load (token → verse IDs) instead of scanning; or switch to a purpose-built client index.
- Persist parsed translations in IndexedDB so subsequent boots skip fetch + decode entirely.
- Convert the semantic index to a keyed map with a prefix trie.
- Batch/debounce `persistProjectionState` writes.
- For multi-device control (a genuinely different scale axis), the `BroadcastChannel` abstraction would be swapped for a transport interface with a local WebSocket implementation — the message schema in `broadcastSync.ts` is already the right seam.

---

## 8. Failure Modes & Weak Points

| Failure | Trigger | Current mitigation | Residual risk |
|---|---|---|---|
| Projection window never opens | Popup blocker | Status stays `connecting`; setup dialog never appears | No explicit "popup blocked" message |
| Projection window closed mid-service | Operator error | Polled `window.closed` → status `idle`; reopening restores from localStorage | Screen is dark until reopened |
| Broadcast message dropped | Tab throttling, backgrounded window | 3 s `SYNC` re-assert | Up to 3 s of stale content |
| Operator window reloads | Crash, accidental refresh | Projection keeps rendering last passage; on boot `restoreProjectionSession()` restores queue, indexes, history, blank state, and translation from the `projectionRecoveryState` snapshot (48 h window) | Recovery snapshot only persists when the queue is non-empty; a reload while idle starts clean |
| Translation fails to load at boot | Corrupt/missing ZIP | `preloadAllTranslations` rejects → error state with retry | One bad ZIP fails the entire `Promise.all`, blocking boot for all translations |
| Translation loaded but book missing | Incomplete source data | `getBooksMap` returns empty; `getPassage` returns null; warning logged | Operator sees "nothing happened" with no on-screen explanation |
| IndexedDB blocked | Private browsing, quota | `loadAllAssets` catches and returns a stable empty shape | Backgrounds silently absent |
| localStorage full/disabled | Quota, hardened privacy settings | Reads are try/catch'd | **Writes are not guarded** — a quota error in `projectSlide` would throw mid-projection |
| Two operator windows open | User opens `/` twice | None | Both write the same keys and both broadcast; last writer wins, undo stacks diverge |
| Clock skew / `timestamp` | — | Unused for ordering | None today, but `persistProjectionState.timestamp` is written and never read |

### Assumptions that could break
- Exactly one operator window and one projection window per origin.
- All translations share the same 66-book canon and identical verse numbering (used by `setTranslation`'s re-projection and by canonical book ordering built from the *first* translation loaded).
- Verse numbers are 1..N contiguous integers — `getNextVerse` compares `verseNum < verses.length` rather than looking up the actual next key, which is wrong for any translation with gaps or lettered verses.
- `BroadcastChannel` is available (all modern browsers; absent in older Safari).

### Tight coupling
- `stateManager` imports `BibleRepository` and `broadcastSync` directly — no injection, so it cannot be unit-tested without stubbing modules.
- `ProjectionControl` reaches into the store imperatively via `useStateManager.getState()` inside `setInterval`s.
- Service Plan "next" travels over a DOM CustomEvent rather than the store.
- `projectSlide` is a free function threaded with `get`/`set`, plus an `oldLiveSlideOverride` parameter that exists purely to work around read-ordering when the queue is replaced — subtle and easy to break.

---

## 9. Principles Followed

**Single source of truth.** Zustand owns projection state; the projection window holds only a replica it can never author. All Bible text has one owner, `BibleRepository`. All format knowledge has one owner, `bibleNormalizer`.

**One-way data flow.** `input → controller → store → (repository read) → broadcast → replica render`. No component writes to another component's state; no read path writes.

**Separation of concerns.** Ranking (`searchEngine`) is separate from access (`bibleRepository`), which is separate from mutation (`stateManager`), which is separate from transport (`broadcastSync`), which is separate from binary storage (`assetStorage`).

**Explicit over implicit state.** `projectionLocked` is an explicit mode, not inferred. `liveSlideIndex` is stored separately from `currentSlideIndex` so "what is on screen" and "what is selected" can never be conflated. Translation is always passed explicitly to repository readers rather than relied on as ambient default in the hot paths.

**Single funnel for dangerous operations.** Every normal projection goes through `projectSlide`. History, persistence, broadcast, and recents are therefore impossible to forget.

**Fail visibly, not incorrectly.** Missing translation → empty result plus a warning, never another translation's text. Failed translation load → stay on the working one, never silently revert to KJV.

**Verbatim data fidelity.** The normalizer performs zero text transformation. Scripture is not the place for whitespace heuristics.

**Progressive disclosure.** Onboarding teaches goals before features; hints fire once per feature; nothing blocks the operator.

---

## 10. What I Would Improve

### Rebuild differently
1. **Decode in a Web Worker and cache parsed data in IndexedDB.** Boot would drop from seconds to near-instant on the second run, and the main thread would stay responsive.
2. **Build an inverted index at load time.** Removes the only algorithmically bad path in the app.
3. **Introduce a transport interface** (`ProjectionTransport` with `send`/`subscribe`) over `BroadcastChannel`, so a LAN WebSocket implementation could enable a phone or tablet as a remote without touching the store.
4. ~~Persist the projection queue and live index~~ **Done** — `projectionRecoveryState` now snapshots the queue, both indexes, history, blank state, and translation after every state change, and `restoreProjectionSession()` rebuilds them on boot.
5. **Per-translation load isolation.** `Promise.allSettled` instead of `Promise.all`, so one corrupt ZIP degrades one translation instead of blocking boot.
6. **Verse-key-based navigation.** Replace `verseNum < verses.length` arithmetic with index lookup in the actual verse array, removing the contiguous-integer assumption.
7. **Guard all localStorage writes.** A `safeSet` wrapper with try/catch and a quota warning.
8. **Operator-window singleton lock.** A `BroadcastChannel` claim on startup that warns when a second operator window opens.
9. **Move `blankSettings` into Zustand** with an explicit persistence middleware, closing the one hole in the single-source-of-truth rule.

### Existing technical debt
- `loadFromZip(zipPath)` ignores its argument and always loads KJV — dead legacy compat.
- Legacy navigation methods (`goToNextChapter`, `previewNextVerse`, `displayCurrentChapter`, …) duplicate slide-queue logic that `slideNext`/`loadChapterAsQueue` already implement.
- `AppState.displayMode` and the `StateAction` union in `types.ts` are declared and never used.
- `persistProjectionState.timestamp` is written and never read.
- `Projection.tsx` sets both `channel.onmessage` (a logger) and an `addEventListener` subscription — two mechanisms on one channel.
- The `RELOAD_ASSETS` handler closes over a stale `assetUrls` (its effect has an empty dependency array), so object-URL revocation can miss URLs.
- `blankSettings.logoUrl` / `softBgUrl` remain in the type as unused legacy fields.
- Console logging in hot paths (`projectSlide` logs every projection).
- Only 6 test files exist (recovery, keyboard shortcuts, service plan, verse navigation, search reference, example); the normalizer, repository loader, and `projectSlide` history rules remain the highest-value untested logic in the system.

### "Good enough" vs "correct"
- **Good enough:** polling `window.closed` every 1.5 s; a 3 s blanket re-sync instead of acked delivery; full-store subscriptions; linear keyword search; first-occurrence-wins duplicate handling.
- **Correct:** the normalization boundary; the single `projectSlide` funnel; the no-fallback translation rule; auto-fit measuring only the verse region; IndexedDB for binaries with references in settings.

The distinction is deliberate. In a system where the failure cost is "a wrong verse appears in front of a congregation," correctness was spent on data fidelity and state integrity, and pragmatism was spent on timing, delivery, and performance — where the worst case is a three-second delay that self-heals.

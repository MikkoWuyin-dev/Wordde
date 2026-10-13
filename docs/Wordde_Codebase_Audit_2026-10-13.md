# Wordde — Codebase-Wide Audit (2026-10-13)

**Scope:** full working tree at `Wordde/` — `src/` (206 files, ~16.8k LOC), `pwa/`, `public/`, tests, build/lint config, dependency graph.
**Method:** static read of every core module and operator/projection component; executed `tsc --noEmit`, `eslint .`, `vitest run`, `vite build`; grep-based dead-code/dependency tracing. Findings are cited by file (and line where stable). This is a *fresh* audit — it verifies current reality and does not restate the earlier `Wordde_Senior_Engineering_Audit.md` / `Wordde-Reconciliation-Report.md` (both of which predate the PWA, theme, cache, and keyword-index work now in the tree).

---

## 0. Verification baseline (what actually passes today)

| Check | Command | Result |
|---|---|---|
| Types | `npx tsc --noEmit` | **PASS — but it is a NO-OP.** The root `tsconfig.json` sets `"files": []` and only lists project references, so non-build mode compiles **zero files**. |
| Types (real) | `npx tsc -b` | **FAIL — 12 errors**, hidden behind the no-op above. See [Wordde_Audit_Handoff_2026-10-13.md](Wordde_Audit_Handoff_2026-10-13.md) §3.4. |
| Lint | `npx eslint .` | **FAIL** — 6 errors, 15 warnings (see §6.2) |
| Unit/integration | `npx vitest run` | **PASS** — 25 files, 214/214 on a clean re-run. An earlier run showed 213/214 with a load-sensitive timeout (no `testTimeout` is configured). |
| Build | `npx vite build` | **PASS** — `index-*.js` **622 kB (191 kB gzip)**, `index-*.css` 83 kB, worker 99 kB; emits a chunk-size warning (§4.1) |

The build is real and the architecture is genuinely well-documented, but the checks in `AGENTS.md` paint a greener picture than the tree deserves: the mandated `tsc` command **cannot fail**, `lint` is broken, and the test suite has a load-sensitive flake.

> **Correction (2026-10-13):** the first pass of this audit recorded `npx tsc --noEmit` as a genuine pass. It is not — it is a no-op that hides 12 real errors. See [Wordde_Audit_Handoff_2026-10-13.md](Wordde_Audit_Handoff_2026-10-13.md) §3.4 for the full analysis.

---

## 1. Correctness & reliability (highest severity)

### 1.1 Projection window never revokes reloaded object URLs (stale closure) — real leak
[src/pages/Projection.tsx:218-258](src/pages/Projection.tsx)
The broadcast listener effect has `[]` deps but reads `assetUrls`:
```ts
} else if (msg.type === 'RELOAD_ASSETS') {
  Object.values(assetUrls).forEach(u => { if (u) URL.revokeObjectURL(u); });
  loadAllAssets().then(setAssetUrls);
}
```
`assetUrls` is captured at first render (`{}`), so **the revoke loop is always a no-op**. Every image upload/replace in the operator (`broadcastReloadAssets`) creates a fresh set of blob URLs in the projection window while the previous set is orphaned. Over a long service with background changes this grows unbounded. ESLint flags exactly this (`react-hooks/exhaustive-deps` at 258:6).
- Same file, mount effect (182-207) builds URLs via `loadAllAssets().then(setAssetUrls)` with **no cleanup** — closing the projection window leaks the whole set too.

### 1.2 `getNearbyPassages` violates the "no verse arithmetic" invariant
[src/core/searchEngine.ts:143-160](src/core/searchEngine.ts)
```ts
const startNum = parseInt(verseStart, 10);
... const nextVerseNum = String(startNum + i); const verse = verses.find(v => v.verse === nextVerseNum);
```
The rest of the codebase is careful to navigate by array index precisely so lettered/non-contiguous keys (`3a`, `1,2,4`) work (RI-009–RI-012, VF-003). This helper reintroduces integer arithmetic: for `verseStart = "3a"` it proposes `"4"`, `"5"` — skipping the real next verse and silently mis-ordering "nearby" results. It also calls `getVerses(book, chapter)` **without** the translation argument, so it reads whatever `currentTranslation` happens to be rather than the translation the search was run under.

### 1.3 No React error boundary anywhere
`src/App.tsx`, `main.tsx`
There is a boot-failure screen for Bible loading, but **no error boundary**. A single render-time throw in the operator (e.g. a malformed `Passage` restored from localStorage, a corrupted recovery snapshot that passes validation but not render) unmounts the whole React tree to a blank white page. For a product whose stated principle is "Recovery over prevention," the operator UI has no recovery net for its own crashes; the projection window is likewise unguarded.

### 1.4 Unguarded localStorage reads in projection/onboarding paths
- [src/pages/Projection.tsx:184](src/pages/Projection.tsx) `localStorage.getItem('currentProjection')` — raw, no try/catch (contrast `loadPersistedProjectionState`, which is guarded). A storage-disabled environment throws inside the mount effect → blank projection window.
- [src/components/onboarding/ContextualHint.tsx:20](src/components/onboarding/ContextualHint.tsx) `hasSeenHint` reads raw (the write path correctly uses `safeLocalSet`).
- [src/components/onboarding/OnboardingManager.tsx:24](src/components/onboarding/OnboardingManager.tsx) `localStorage.getItem(STORAGE_KEY)` raw.

These are the exact class of call the project's own VF-005/RI-022 rule exists to prevent; the write side was hardened but these reads were missed.

### 1.5 Broadcast `SYNC`/log double-listening
[src/pages/Projection.tsx:220-232](src/pages/Projection.tsx)
`channel.onmessage = broadcastLogger` installs a second, unconditional listener in addition to `onBroadcastMessage`'s `addEventListener`. Every message is handled once and logged once — fine functionally, but it is a redundant listener seam and a `console.log` of full payloads. Low risk, easy cleanup.

### 1.6 SW doc/behavior mismatch: `skipWaiting()` + `clients.claim()`
[pwa/sw.js:94-108](pwa/sw.js)
The header comment (and teardown RI-059) asserts "the old worker keeps serving until every client reloads; a mid-service deploy never yanks assets out from under a live window." With `skipWaiting()` inside `install` and `clients.claim()` in `activate`, a newly installed worker **takes over open clients immediately and deletes every non-current cache**. The already-open page has its assets in memory so the practical blast radius is small, but the guarantee the docs claim is not what the code does. Either drop `skipWaiting`/`claim` or correct the documentation.

---

## 2. Performance

### 2.1 Autocomplete re-resolves the query 66× per keystroke — the single most wasteful hot path
[src/core/autocomplete.ts:44-70](src/core/autocomplete.ts)
```ts
for (const book of allBooks) {          // 66 books
  ...
  const resolved = BibleRepository.resolveBookName(query);   // <-- loop-invariant, recomputed every iteration
```
`resolveBookName` is not cheap: it scans all 66 books and runs an O(n log n) comparator whose tie-break does `findIndex` over the 66-name canon **per comparison**. So one keystroke in the search field performs ~66 full book resolutions, plus up to 66 Levenshtein DP passes, plus `parseInput`'s several more `resolveBookName` calls (lines 103, 115) — a few thousand redundant scans before the dropdown can render. Hoisting line 52 above the loop is a two-line change with a large constant factor.

### 2.2 Keyword search still scans every token on every keystroke
[src/core/bibleRepository.ts — `searchByKeyword`](src/core/bibleRepository.ts)
The inverted index replaces the ~31k-verse linear scan, but the union step is:
```ts
for (const term of searchTerms)
  for (const [token, id] of index.tokenIds) if (token.includes(term)) ...
```
Substring matching can't hash, so every keystroke iterates **all unique tokens** (~10k+ per translation) once per term. It is an improvement, but the claimed "replaced the per-keystroke linear scan" is only partly true — it is now a per-keystroke scan over the token vocabulary. A prefix-keyed map (token → list) or a trigram/Suffix array would make it sub-linear.

### 2.3 No debounce on the search pipeline
[src/components/operator/SearchInput.tsx:53-66](src/components/operator/SearchInput.tsx) → [src/core/inputController.ts:41-66](src/core/inputController.ts)
Every `onChange` synchronously runs `getSuggestions` (§2.1) **and** `SearchEngine.search` (§2.2) and then re-renders. A ~50–100 ms debounce would remove almost all of the typing-time cost with no perceptible latency difference.

### 2.4 Full-store Zustand subscriptions → whole-UI re-render per keystroke
11 components subscribe with `useStateManager()` and no selector (OperatorScreen, PresenterPanel, ProjectionControl, ProjectionStatus, ServicePlan, BibleNavigator, RecentPassages, PassageNavigation, TutorialOverlay, and both hooks in `inputController`). Zustand re-renders *every* subscriber on *any* store write. `setSearchQuery` fires on every keystroke, so each character re-renders the header, presenter panel, projection control, status badge, active tab, and settings shell. The teardown calls this acceptable "at this scale," but on the donated low-spec laptops the product targets this is the main observable typing/rendering cost, and it compounds with §2.1/§2.3. Selector-based subscriptions (or `useShallow`) for the read-only consumers would fix it.

### 2.5 Fonts shipped uncompressed (TTF/OTF), ~1.0 MB, one missing preload
[src/index.css:4-52](src/index.css), `public/fonts/`
Seven faces totalling ~1.04 MB: 5× Poppins (~780 kB), Playfair Display Regular (177 kB), Autography.otf (52 kB) — all `.ttf`/`.otf`, all precached by the SW ([pwa/sw.js](pwa/sw.js)). Converting to WOFF2 would cut this to roughly 200–300 kB (a 3–4× reduction) on the offline first-load path. Also, `index.html` preloads Poppins-Regular/SemiBold and Playfair but **not Autography**, which is the wordmark face on the first-paint `<h1>` — so the header FOUTs on every cold start.

### 2.6 First SW install fetches ~8.5 MB all-or-nothing
[pwa/sw.js:60-89](pwa/sw.js) — `install` does `cache.addAll` over both route shells, 7 fonts, all 5 Bible ZIPs (~7.5 MB), semantic index and build assets. Deliberate (offline-first), but on a slow sanctuary connection install blocks for a long time, and any single 404 fails the entire install. Consider splitting data precache from shell precache so the app shell can install fast and data can stream in.

### 2.7 Smaller per-frame/layout costs
- **AutoFitVerse** ([src/pages/Projection.tsx:63-88](src/pages/Projection.tsx)) writes `text.style.fontSize` inside a 72→16 px decrement loop, forcing a layout read (`scrollHeight`) on each iteration — up to ~28 forced reflows per verse change. A binary search or single `ResizeObserver` measurement removes most of them.
- **TutorialOverlay** ([src/components/onboarding/TutorialOverlay.tsx:152-158](src/components/onboarding/TutorialOverlay.tsx)) polls `getBoundingClientRect` every 500 ms and calls `setRect` with a *fresh* DOMRect each tick — guaranteeing a re-render twice a second for as long as the tutorial is open, even when nothing moved.
- **ProjectionControl** ([src/components/operator/ProjectionControl.tsx](src/components/operator/ProjectionControl.tsx)) runs three unconditional intervals (3 s `broadcastSync`, 2 s watchdog, 1.5 s `window.closed` poll) even when no projector window has ever been opened.
- **`BibleRepository.getPassage`** recomputes `resolveBookName` (66-book scan + sort) and rebuilds the joined text on every call; it is on the per-result and per-navigation path.

---

## 3. Redundancy & dead code

### 3.1 ~13 unused dependencies propping up ~40 unused shadcn components
`package.json` declares `@tanstack/react-query`, `recharts`, `embla-carousel-react`, `react-day-picker`, `input-otp`, `cmdk`, `vaul`, `react-resizable-panels`, `react-hook-form`, `@hookform/resolvers`, `zod`, `date-fns`. None are used by application code — they are imported only by unused files in `src/components/ui/` (`chart.tsx`, `carousel.tsx`, `calendar.tsx`, `command.tsx`, `drawer.tsx`, `resizable.tsx`, `form.tsx`, `input-otp.tsx`). The one live import is **`@tanstack/react-query`**, which is *actively wired up* in [src/App.tsx:11-28](src/App.tsx) (`QueryClient` + provider) around a zero-query app — so it is shipped in the 191 kB gzip bundle for nothing.

Only ~9 of the ~50 `ui/*` files are actually reachable: `button, input, scroll-area, select, dialog, popover, alert-dialog, tooltip, sonner, toaster` (+ `toast` via `toaster`). Everything else (accordion, alert, aspect-ratio, avatar, badge, breadcrumb, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, drawer, dropdown-menu, form, hover-card, input-otp, label, menubar, navigation-menu, pagination, progress, radio-group, resizable, sheet, sidebar, skeleton, slider, switch, table, tabs, textarea, toggle, toggle-group, `use-toast`) is dead weight.

### 3.2 Dead exports / files
- [src/App.css](src/App.css) — never imported (Vite template residue).
- [src/core/index.ts](src/core/index.ts) — barrel re-export never imported by anyone.
- `broadcastClear` — [src/core/broadcastSync.ts:127](src/core/broadcastSync.ts) (and the `CLEAR_PASSAGE` type it sends has no producer).
- `getTranslationMetadata`, `getVerseCount`, `getChapterCount` — [src/core/bibleRepository.ts](src/core/bibleRepository.ts); `getCurrentTranslation` is test-only.
- `ShortcutRow` — [src/components/operator/SettingsAndMore.tsx:264](src/components/operator/SettingsAndMore.tsx) (the shortcuts view inlines its own markup instead).
- `restartTutorial` — [src/components/onboarding/OnboardingManager.tsx:80](src/components/onboarding/OnboardingManager.tsx); the `restartTutorial` CustomEvent listener at line 30 waits for an event nothing dispatches.
- Both toast systems are mounted and never triggered: `useToast`/`toast` ([src/hooks/use-toast.ts](src/hooks/use-toast.ts), [ui/toaster.tsx](src/components/ui/toaster.tsx)) and the Sonner `Toaster`. `ui/use-toast.ts` is a third file that just re-exports the hook.

### 3.3 Duplicated logic / sources of truth
- **66-book canon in two places**: `CANONICAL_BOOK_ORDER` ([src/core/bibleRepository.ts:36](src/core/bibleRepository.ts)) vs `OT_BOOKS`/`NT_BOOKS` ([src/components/operator/BibleNavigator.tsx:11-32](src/components/operator/BibleNavigator.tsx)). Adding/renaming a book means editing both.
- **"Pre-load next slide" implemented three times** in [src/core/stateManager.ts](src/core/stateManager.ts) (`projectSlide`, and the locked branch of both `commitCurrentSlide` and `_commitWithOldSlide`).
- **Event-name literal vs constant**: `new CustomEvent('nextServicePlanPassage')` ([src/core/inputController.ts:293](src/core/inputController.ts)) while the same file imports `NEXT_SERVICE_PLAN_EVENT` for the `n` case — drift waiting to happen.
- `recentPassages.slice(0, MAX_RECENT_PASSAGES)` ([src/components/operator/RecentPassages.tsx:152](src/components/operator/RecentPassages.tsx)) — the store already caps at that constant (the comment-writer's own point).
- `score: 100 - index * 0` ([src/core/searchEngine.ts:39](src/core/searchEngine.ts)) — a no-op expression left in the ranking code.
- `setupBookAliases` rebuilds its ~66-entry `abbreviations` object on every call (called once per book at load), and `sortBooksInOrder` runs `findIndex` over the canon per comparator invocation.
- **Three lockfiles**: `bun.lock`, `bun.lockb`, `package-lock.json` (+ `skills-lock.json`). `AGENTS.md` mandates npm; the Bun locks are stale and will silently drift.

### 3.4 Doc drift (contract violation)
[System Teardown §5.12](docs/System%20Teardown.md) states Settings & More contains "**exactly three** items — Display Settings, Replay Tutorial, Keyboard Shortcuts." The code ([SettingsAndMore.tsx](src/components/operator/SettingsAndMore.tsx)) and its test (`settingsAndMore.test.tsx`, "opens a menu with exactly four entries") both have **four**, the Theme picker having been added later. `AGENTS.md` RI-053 requires the teardown to track implementation reality; it has fallen behind here.

---

## 4. Build, config & tooling

### 4.1 Single 622 kB chunk, no code splitting
`vite build` emits one app chunk with a size warning. Given `@tanstack/react-query` (§3.1) is dead weight and the three routes could be split (`/projection` is a separate window that rarely needs the operator bundle), lazy routes + removing unused deps would materially shrink first load.

### 4.2 6 lint errors + 15 warnings (`npm run lint` is red)
- `no-empty` — [broadcastSync.ts:76](src/core/broadcastSync.ts), [broadcastSync.ts:192](src/core/broadcastSync.ts) (`catch {}`).
- `@typescript-eslint/no-empty-object-type` — `ui/command.tsx:24`, `ui/textarea.tsx:5`.
- `prefer-const` — `test/bibleCache.integration.test.ts:181`.
- `@typescript-eslint/no-require-imports` — [tailwind.config.ts:128](tailwind.config.ts) (`require("tailwindcss-animate")`).
- `react-hooks/exhaustive-deps` — the §1.1 stale-closure bug is *the warning* at `Projection.tsx:258`.
- 8× `react-refresh/only-export-components` warnings (shadcn residue).

### 4.3 Test-suite flake and slowness
`settingsAndMore.test.tsx > "opens a menu with exactly four entries"` timed out (7.1 s vs the 5 s default) under full-suite load but passes in 0.47 s in isolation. The run reports **51 s setup / 262 s environment time** — a heavy jsdom matrix with no per-test timeout headroom, so the suite is one CI hiccup away from a red build. The failing assertion is not wrong; the suite configuration is fragile.

### 4.4 Type/lint strictness is switched off
[tsconfig.json](tsconfig.json) + [tsconfig.app.json](tsconfig.app.json): `strict: false`, `noImplicitAny: false`, `noUnusedLocals: false`, `noUnusedParameters: false`, `noFallthroughCasesInSwitch: false`, `strictNullChecks: false`; [eslint.config.js](eslint.config.js): `@typescript-eslint/no-unused-vars: "off"`. This is the systemic reason §3.2's dead exports, the §1.1 stale closure, and unused imports survive a "passing" `tsc`. Turning on `noUnusedLocals`/`noUnusedParameters` alone would surface most of §3.2 automatically.

### 4.5 Repository hygiene
Tracked residue: `lovable-tagger` devDependency + `componentTagger()` in the dev build ([vite.config.ts](vite.config.ts)); and `public/placeholder.svg` (verified unreferenced). `.agents/skills/impeccable/**`, `.impeccable/*` and `.impeccable-live-boot.json` are tracked **intentional agent tooling**, not junk; `.freebuff/`, `dist/` and `test-results/` are correctly gitignored. `public/App Icon Orange.png` **is used** by `index.html` (favicon + apple-touch-icon) — do not delete it. `src/test/example.test.ts` is an `expect(true).toBe(true)` placeholder.

> **Correction (2026-10-13):** an earlier draft of this section named `Untitled-1.psd`, `App Icon Dark.png` and `App Icon Light.png` at the repo root. A full `ls -la` shows no such files; that claim was wrong and has been removed.

---

## 5. Product & UX observations

- **Weak point vs. stated principles.** "Recovery over prevention" (§1.3) and "fail visibly" are honored for data loading but not for runtime rendering — there is no boundary between a component crash and a service-killing white screen.
- **`robots.txt` allows all crawlers and `index.html` carries `og:`/`twitter:` marketing tags** for an app `PRODUCT.md` explicitly describes as local-church-only, not-public-distribution. Harmless, but it advertises a product the owner says is intentionally not distributed.
- **MobileBlocker copy** ([MobileBlocker.tsx](src/components/MobileBlocker.tsx)) says "Please use a tablet, laptop, or desktop device," yet the block trips below 768 px — which includes tablets in portrait. The instruction contradicts the trigger.
- **"Beta" badge** in the header ([OperatorScreen.tsx](src/components/operator/OperatorScreen.tsx)) on a product declared feature-complete for its one church.
- **`BibleNavigator` chapter/verse memos** don't depend on `currentTranslation`, so a mid-session translation switch doesn't refresh the Browse grids (stale keys if a translation's verse keys differ).
- **`duplicateService`/`createService` ids** use `Date.now().toString()` ([ServicePlan.tsx](src/components/operator/ServicePlan.tsx)); two rapid creations in the same millisecond collide, and the list keys on `id`.
- **11 `console.log` calls in production code** (mostly `Projection.tsx` mount/broadcast logging that dumps full passages and every received message) — noisy in the field and not gated on a dev flag.

---

## 6. Suggested fix order

**Correctness (do first):**
1. Fix the `assetUrls` stale closure in `Projection.tsx` (§1.1) — revoke via a ref or functional `setAssetUrls`, and add cleanup on unmount.
2. Add an app-level error boundary around the operator and projection routes (§1.3).
3. Replace `getNearbyPassages` integer arithmetic with the repository's `getNextVerse` and pass the translation through (§1.2).
4. Guard the raw `localStorage` reads (§1.4).

**Performance:**
5. Hoist `resolveBookName(query)` out of autocomplete's loop (§2.1); add a ~75 ms debounce to the search/autocomplete pipeline (§2.3).
6. Convert fonts to WOFF2 and preload Autography (§2.5).
7. Introduce selector-based Zustand subscriptions for the read-only consumers (§2.4).

**Hygiene (cheap, high signal):**
8. Delete dead files/exports (§3.2), remove unused deps + the react-query provider (§3.1), remove the two stale Bun lockfiles (§3.3), delete `App.css`, fix the 6 lint errors (§4.2).
9. Turn on `noUnusedLocals`/`noUnusedParameters` and `no-unused-vars` (§4.4).
10. Update System Teardown §5.12 to four menu items (§3.4) and reconcile the SW `skipWaiting` claim (§1.6).

**Product:**
11. Increase the flaky test's timeout / add headroom or reduce environment cost (§4.3).
12. Split the bundle and lazy-load routes (§4.1).

# Wordde — Audit Findings, Evidence & Agent Handoff

**Date:** 2026-10-13
**Branch:** `main`
**Scope:** the entire `Wordde/` working tree — `src/` (206 files), `pwa/`, `public/`, `e2e/`, tests, build/lint/TS config, dependency graph.
**Method:** static read of every core module (`src/core/*`) and every operator/projection/onboarding component, plus executed commands (see §2). Findings cite `file:line`.
**Author:** automated audit agent. **No application source was modified.** The only files this audit added are in `docs/`.

### Audience & how to use this document

This is written for **other coding agents** picking up work in this repo. Read it *after* `AGENTS.md` and *before* touching anything. It is deliberately explicit about **evidence** (command output, line numbers) so you can re-verify rather than trust. Every claim marked **Verified** was executed or read directly; claims marked **Inferred** are reasoning from code structure and are flagged as such.

---

## 0. Read this first

Three things in this document will change how you work:

1. **The typecheck command mandated by `AGENTS.md` cannot fail.** `npx tsc --noEmit` exits `0` while the project has **12 real type errors**, because the root `tsconfig.json` sets `"files": []` and only lists project references — in non-build mode TypeScript compiles *zero files*. The real check is `npx tsc -b` (or `-p tsconfig.app.json`), which exits `2`. See §3.4.
2. **`npm run lint` is red** — exit `1`, 6 errors + 15 warnings. One of those warnings *is* the most serious bug in the codebase (an object-URL leak). See §6.2 and §3.1.
3. **The test suite is currently fully green** — 25 files, 214/214 tests, exit `0` (§2, §6.4). An earlier flake did not reproduce. Do not "fix" a failing test that is no longer failing.

---

## 1. TL;DR — findings by severity

| # | Severity | Finding | Location |
|---|---|---|---|
| 1 | **High** | Projection window's object-URL revoke loop is a **no-op stale closure**; every image reload orphans blob URLs, and unmount never revokes | `src/pages/Projection.tsx:248` |
| 2 | **High** | **Mandated `tsc` check is a no-op**; 12 real type errors hidden behind it | `tsconfig.json`, `src/core/bibleDecodeClient.ts:59`, `src/test/recentPassages.test.tsx` |
| 3 | **High** | **No React error boundary** anywhere — one render throw blanks the whole operator UI | `src/App.tsx` |
| 4 | **High** | `getNearbyPassages` re-introduces **integer verse arithmetic** (banned by VF-003) and drops the translation arg | `src/core/searchEngine.ts:144-160` |
| 5 | Medium | Autocomplete re-resolves the query **66× per keystroke** | `src/core/autocomplete.ts:51` |
| 6 | Medium | **11 call sites subscribe to the whole Zustand store** → full operator re-render per keystroke | 10 files, §4.4 |
| 7 | Medium | **No debounce** on the typing path; suggestions + search run synchronously per character | `src/components/operator/SearchInput.tsx`, `src/core/inputController.ts` |
| 8 | Medium | Fonts ship as **~1.01 MB of TTF/OTF**; Autography (the first-paint wordmark) is **not preloaded** | `public/fonts/`, `index.html` |
| 9 | Medium | ~12 unused dependencies propping up **40 of 49** unreachable `src/components/ui/*` files | `package.json`, `src/components/ui/` |
| 10 | Medium | Unguarded raw `localStorage` **reads** on the boot/projection path (writes were hardened, reads missed) | `Projection.tsx:185`, `ContextualHint.tsx:20`, `OnboardingManager.tsx:24` |
| 11 | Low | SW `skipWaiting()`+`clients.claim()` contradicts the documented mid-service guarantee | `pwa/sw.js:82,93` |
| 12 | Low | Doc drift: Teardown §5.12 says "exactly three items"; code + test say **four** | `docs/System Teardown.md:381` |

---

## 2. Verification log — every command run, with exact results

All commands run from `Wordde/`. Nothing below is inferred.

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `npx tsc --noEmit` | **0** | **Misleading pass.** Root config has `files: []`; compiles 0 files. See §3.4. |
| 2 | `npx tsc -b` | **2** | **FAIL — 12 errors** (1 in `src/core/bibleDecodeClient.ts`, 11 in `src/test/recentPassages.test.tsx`). |
| 3 | `npx tsc --noEmit -p tsconfig.app.json` | **2** | Same 12 errors — confirms it is not a `-b` artifact. |
| 4 | `npm run lint` (`npx eslint .`) | **1** | **FAIL — 6 errors, 15 warnings** (full list in §6.2). |
| 5 | `npx vitest run` | **0** | **PASS — 25 files, 214/214 tests**, 45.80 s (setup 32.86 s, collect 82.91 s, tests 40.78 s, env 107.85 s). |
| 6 | `npx vite build` | **0** | **PASS** — `dist/assets/index-*.js` 622,187 B; `index-*.css` 83,158 B; `bibleDecodeWorker-*.js` 99,473 B. Emits chunk-size warning. |
| 7 | `npm run test:e2e` (Playwright) | **0** | **NOT RUN during the audit; since run in full and green.** Requires `vite build && vite preview` on :4174. `npm run test:e2e` → **24 tests passed, exit 0, 2.0 m** across all four specs — `liquid-glass`, `offline-and-worker`, `projection-hardening` (new), `theme-boot`. Nothing needed fixing. See §10.1 for what this does *not* discharge. |
| 8 | `git status --short` | 0 | Only `?? docs/Wordde_Codebase_Audit_2026-10-13.md` (+ this file) — **no source modified**. |
| 9 | `git branch --show-current` | 0 | `main`. |

### Test-suite detail (run #5, the one that matters)

```
 Test Files  25 passed (25)
      Tests  214 passed (214)
   Duration  45.80s
VITEST_EXIT=0
```

Notable: `src/test/settingsAndMore.test.tsx` (10 tests) took **16.6 s** — the single slowest file, and the source of the earlier flake. On this run its "exactly four entries" assertion passed in 939 ms. **An earlier audit run recorded 213/214 with that test timing out (7.1 s vs a 5 s default) under full-suite load.** Conclusion: the assertion is correct; the file is load-sensitive because jsdom + 25-file parallelism leaves no timeout headroom. Treat as flaky-under-load, not broken.

### Raw lint output (run #4)

```
✖ 21 problems (6 errors, 15 warnings)
```

Errors (these are the ones that break the build gate):

| File:line | Rule |
|---|---|
| `src/components/ui/command.tsx:24` | `@typescript-eslint/no-empty-object-type` |
| `src/components/ui/textarea.tsx:5` | `@typescript-eslint/no-empty-object-type` |
| `src/core/broadcastSync.ts:76` | `no-empty` |
| `src/core/broadcastSync.ts:192` | `no-empty` |
| `src/test/bibleCache.integration.test.ts:181` | `prefer-const` |
| `tailwind.config.ts:128` | `@typescript-eslint/no-require-imports` |

Warnings of interest (the rest are `react-refresh/only-export-components` shadcn residue):

- **`src/pages/Projection.tsx:258` — `react-hooks/exhaustive-deps` missing `assetUrls`. This warning *is* the leak in §3.1.** Do not dismiss it.
- `src/components/operator/SearchInput.tsx:166` — missing `releaseFocusAfterCommit`.
- `src/components/onboarding/TutorialOverlay.tsx:172` — missing `currentSlideIndex`.
- `src/components/operator/RecentPassages.tsx:22` — `safeQueue` conditional destabilises a `useCallback` at line 92.

---

## 3. Correctness & reliability

### 3.1 Object-URL leak: the revoke loop can never work — **Verified** (read + lint)

**`src/pages/Projection.tsx:249-258`** (the mounting broadcast listener, deps `[]`):

```ts
} else if (msg.type === 'RELOAD_ASSETS') {
  Object.values(assetUrls).forEach(u => { if (u) URL.revokeObjectURL(u); });  // line 248
  loadAllAssets().then(setAssetUrls);
}
```

`assetUrls` is captured at first render, when it is `{}` (line 151: `useState<Record<string,string>>({})`). The effect closes over that empty object forever, so **the revoke loop is provably a no-op**. ESLint reports exactly this at `258:6`.

Corroborating evidence:

- The producer's own contract says revocation is required — `src/core/assetStorage.ts:95-96`: *"Caller is responsible for revoking URLs when replacing the map."*
- `URL.revokeObjectURL` appears in the codebase exactly 4 times: 3 in `ProjectionSettings.tsx` (75, 84, 121 — its own local map, correct) and **once** in `Projection.tsx:248 (this dead line). `src/core/assetStorage.ts` has **none**.
- The mount effect (`Projection.tsx:181-210`) calls `loadAllAssets().then(setAssetUrls)` at line 183 with **no cleanup** returning a revoke — so closing the projection window also orphans the entire set.

**Impact:** every background/logo change broadcast (`RELOAD_ASSETS`) while the projection window is open allocates a fresh set of blob URLs and orphans the previous set. Blob URLs pin their backing `Blob` in memory until revoked **or** the document is destroyed, so on a long service with background changes this grows without bound. Low frequency, unbounded growth — a real leak, not a theoretical one.

**Fix direction:** hold the map in a `ref` alongside state so the listener reads the live value (`assetUrlsRef.current`), revoke in the `setAssetUrls` updater (functional form: revoke `prev` before returning `next`), and add an unmount cleanup that revokes the current set. Sizing: ~15 lines in one file. **Do not** just add `assetUrls` to the dep array — that re-subscribes the channel on every asset change and is worse.

### 3.2 No error boundary anywhere — **Verified** (read)

`src/App.tsx` wraps the tree in `ThemeProvider → QueryClientProvider → TooltipProvider → BrowserRouter → Routes`. There is **no** `componentDidCatch` / `ErrorBoundary` / `errorElement` anywhere in `src/`.

There *is* a boot-failure path for Bible loading, but nothing catches a **render-time** throw. A malformed `Passage` restored from `localStorage` (parsed at `Projection.tsx:187-192` with `JSON.parse` and only a `try/catch` around the parse — no shape validation), or a corrupt recovery snapshot that passes validation but not render, unmounts the whole React tree to a blank white page.

This contradicts `PRODUCT.md` principle 4 (*"Recovery over prevention"*) and principle 2 (*offline-first, survive crashes and refreshes*). **Fix direction:** one class-component boundary (or `react-error-boundary`) wrapping each route separately — the projection window should be independently recoverable from the operator window. Sizing: ~40 lines + a fallback.

### 3.3 `getNearbyPassages` breaks the no-verse-arithmetic invariant — **Verified** (read)

`src/core/searchEngine.ts:144-160`:

```ts
private getNearbyPassages(basePassage: Passage, count: number): Passage[] {
  const { book, chapter, verseStart } = basePassage.reference;
  const verses = BibleRepository.getVerses(book, chapter);      // <-- translation arg DROPPED
  const startNum = parseInt(verseStart, 10);                    // <-- arithmetic on a verse key
  for (let i = 1; i <= count; i++) {
    const nextVerseNum = String(startNum + i);                  // <-- "3a" -> "4"
    const verse = verses.find(v => v.verse === nextVerseNum);
```

Two independent defects:

1. **Verse arithmetic.** `AGENTS.md` §3 states it as a hard rule: *"No verse arithmetic — navigate by array index off the real key, never `parseInt(verse)+1` (VF-003)."* The repository already provides the correct primitive: `BibleRepository.getNextVerse()` at `src/core/bibleRepository.ts:638`, which every other call site in `stateManager.ts` uses (`:179`, `:428`, `:576`, `:610`). For `verseStart = "3a"`, this helper proposes `"4"`, `"5"` — silently skipping `3b` and mis-ordering "nearby" results. Lettered verses are real, tested data (`bibleNormalizer.test.ts` asserts the order `3, 3a, 3b, 4`).
2. **Translation dropped.** `getVerses(bookName, chapter, translation?)` (`bibleRepository.ts:614`) is called **without** the translation, so it reads whatever `currentTranslation` happens to be — not the translation the search ran under. The very next call, `getPassage({..., translation: basePassage.reference.translation})`, *does* pass it, so the two reads can disagree mid-flight.

**Fix direction:** replace the whole loop body with `BibleRepository.getNextVerse(book, chapter, verse, translation)` walked forward by array index, threading `basePassage.reference.translation` through. Sizing: ~20 lines, one method.

### 3.4 The mandated typecheck is a no-op — **Verified** (executed)

`AGENTS.md` §2 says the checks that must pass are `npx tsc --noEmit`, `npm test`, `npm run build`. Running `npx tsc --noEmit` gives exit `0`.

That pass is vacuous. `tsconfig.json`:

```json
{ "compilerOptions": { ... }, "files": [], "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }] }
```

With `files: []` and references, plain `tsc` (non-build mode) has **nothing to compile**. Every real error is invisible. `npx tsc -b` — and `npx tsc --noEmit -p tsconfig.app.json` — exit **2** with 12 errors:

**(a) One production-code error** — `src/core/bibleDecodeClient.ts:59`:

```ts
worker.onmessage = (event: MessageEvent<DecodeResponse>) => {
  const data = event.data;
  if (data && data.ok) { resolve({...}) }
  else { reject(new Error(data?.error || 'Unknown decode worker error')); }   // <-- TS2339
```

`DecodeResponse` (defined identically in the client at `:19-21` and the worker at `:27-29`) **is** a correct discriminated union:

```ts
| { ok: true;  books: BibleBook[]; metadata: TranslationMetadata }
| { ok: false; error: string }
```

TS2339 says `Property 'error' does not exist on type '{ ok: true; books; metadata }'` — i.e. TS refused to narrow away the `ok: true` member in the `else` branch. **Inferred cause:** the project runs with `strictNullChecks: false` (§6.3), which defeats truthiness-based narrowing of the union by `data &&`. I have not proven this by experiment; treat the *error* as verified and the *mechanism* as the most likely explanation.

**(b) Eleven test-only errors** — `src/test/recentPassages.test.tsx` lines 75, 117, 131, 144, 165, 184, 199, 209 (and their continuation blocks): every `useStateManager.setState({ ...partial })` call passes an object of a few fields where the signature wants `StateManager | ((s) => StateManager)`. The test fabricates partial store slices; TypeScript rejects them. **This is a real, reproducible type failure** — the test passes at runtime but does not typecheck.

**Fix direction:** (1) add a `"typecheck": "tsc -b"` script and change `AGENTS.md` §2 to call it — *this is the single highest-leverage change in this document*, because it converts a permanently-green gate into a real one; (2) then fix the 12 errors it uncovers; (3) for CI use `tsc -b --noEmit` — **verified working** on this project's TypeScript (5.8.3): same 12 errors, exit 2. Sizing: one config line + the fixes.

**Two operational side effects to handle** (both observed directly, not inferred):

- Because project references are composite, the command writes `tsconfig.app.tsbuildinfo` and `tsconfig.node.tsbuildinfo` to the repo root, and `.gitignore` does **not** cover them (`git check-ignore` confirms). Adopting this gate without a `*.tsbuildinfo` ignore rule dirties the tree on every typecheck. `--noEmit` does **not** avoid this — it still writes them.
- A **cold** `tsc -b` run takes minutes (it exceeded a 240 s budget here and completed in the background), versus milliseconds for the no-op. That cost is plausibly part of *why* the no-op went unnoticed — worth knowing before you wire it into a pre-commit hook.

**The no-op also sat in CI.** `.github/workflows/gate.yml` runs `npx tsc --noEmit` as its `Typecheck` step, so the gate guarding `main` has always passed regardless of type errors — the mandated check's real home, and the audit did not inspect `.github/`. Changed to `npm run typecheck` alongside fix #1. *(Added post-audit.)*

> ⚠️ **Read `AGENTS.md` §4 before editing `tsconfig.*` or `bibleDecodeClient.ts`**: `src/core/bibleNormalizer.ts`, `src/core/broadcastSync.ts`, `src/core/types.ts` are protected (VF-100), and `docs/ARCHITECTURE.md`, `CONSTRAINTS.md`, `DEVELOPMENT.md`, `VERIFICATION-RULES.md` are human-maintained (VF-101). `bibleDecodeClient.ts` is *not* on the protected list, but changing a `tsconfig` affects the whole tree — surface the change rather than doing it silently.

### 3.5 Unguarded raw `localStorage` reads — **Verified** (read)

`AGENTS.md` VF-005 requires every `localStorage` access to be guarded; the project has a `src/core/safeStorage.ts` helper (`safeLocalSet` / `safeLocalRemove`) and used it on the **write** side. Three **read** sites were missed:

| Location | Code |
|---|---|
| `src/pages/Projection.tsx:185` | `const saved = localStorage.getItem('currentProjection');` — inside the mount effect; a storage-disabled environment throws here → blank projection window |
| `src/components/onboarding/ContextualHint.tsx:20` | `return localStorage.getItem(HINT_PREFIX + id) === 'true';` (write side at `:23` correctly uses `safeLocalSet`) |
| `src/components/onboarding/OnboardingManager.tsx:24` | `localStorage.getItem(STORAGE_KEY)` raw |

Contrast with the correct pattern in `broadcastSync.ts` → `loadPersistedProjectionState()`, which is guarded. **Fix direction:** add a `safeLocalGet(key): string | null` to `safeStorage.ts` and route these three through it. Sizing: ~10 lines total. Note `public/theme-boot.js` already *does* guard its `localStorage.getItem('theme')` in a `try/catch` — so the pattern is understood in this repo; these three are oversights, not a policy.

### 3.6 Service worker contradicts its own documented guarantee — **Verified** (read)

`pwa/sw.js` header comment claims a mid-service deploy never yanks assets: *"the old worker keeps serving until every client reloads."* The code does the opposite:

- `pwa/sw.js:81-82` — `await cache.addAll(PRECACHE_URLS); await self.skipWaiting();` inside `install`.
- `pwa/sw.js:87-96` — `activate` does `caches.keys()`, deletes **every** cache whose key ≠ `CACHE_VERSION`, then `await self.clients.claim()`.

So a newly-installed worker takes over open clients immediately and deletes all non-current caches. Practical blast radius is small (the live page holds its assets in memory), but the documented guarantee is false. **Fix direction:** either drop `skipWaiting`/`claim` and gate the swap behind a user-visible reload prompt, or correct the comment. Pick one deliberately — do not leave the doc lying. (`AGENTS.md` RI-053 requires the Teardown to track reality; the SW comment is written as a guarantee, so treat it as a contract.)

### 3.7 Redundant second broadcast listener — **Verified** (read)

`src/pages/Projection.tsx:220-232`: `channel.onmessage = broadcastLogger` installs an unconditional listener **in addition to** `onBroadcastMessage`'s `addEventListener`. Every message is handled once and logged once. Functionally harmless, but it is a second seam on the protocol and it `console.log`s full payloads (see §5.7). Low risk, easy cleanup.

---

## 4. Performance

> **Framing:** the product targets *"often donated, low-spec laptops"* (`PRODUCT.md`, Operating Context). §4.1, §4.3 and §4.4 compose into the dominant typing-time cost and should be treated as one workstream. All costs below are reasoned from code paths (**Inferred**); none were profiled in a browser, so treat magnitudes as structural, not measured. See §10.

### 4.1 Autocomplete re-resolves the query 66× per keystroke — **Verified** (read)

`src/core/autocomplete.ts:44-70`, inside `matchBooks`:

```ts
const allBooks = BibleRepository.getAllBooks();
for (const book of allBooks) {                                    // 66 books
  const lower = book.toLowerCase();
  const resolved = BibleRepository.resolveBookName(query);        // line 51 — LOOP-INVARIANT
  if (resolved.some(r => r.toLowerCase() === lower)) { ... }
```

`resolveBookName` (`bibleRepository.ts:497-556`) is not cheap: it scans all books and, when it falls through to name matching, sorts with a comparator whose tie-break runs `canonicalOrder.findIndex(...)` **per comparison** (`:545-550`). So one keystroke performs ~66 full resolutions on an identical input, plus up to 66 Levenshtein DP passes (`:70`), plus `parseInput`'s further `resolveBookName` calls (lines ~103, ~115).

**Fix direction:** hoist line 51 above the loop into a `const resolved = ...` (a ~2-line change with a large constant-factor win). Bigger win: memoise `resolveBookName` by normalised input — it is a pure function of `(input, currentTranslation)`.

### 4.2 Keyword search still scans the whole token vocabulary — **Verified** (read)

`src/core/bibleRepository.ts` → `searchByKeyword`. The inverted index removes the ~31k-verse linear scan, but the union step is a nested loop:

```ts
for (const term of searchTerms)
  for (const [token, id] of index.tokenIds) if (token.includes(term)) ...
```

Substring matching cannot hash, so every keystroke iterates **all unique tokens** per term. It is a genuine improvement over the previous per-keystroke verse scan, but the docstring's claim that the linear scan is "replaced" overstates it — it is now a per-keystroke scan over the *token* vocabulary. **Fix direction (P2):** prefix-keyed buckets, or an n-gram/Suffix-array index. Only worth doing after §4.3 debouncing, which likely hides the cost entirely.

### 4.3 No debounce on the typing path — **Verified** (read)

`src/components/operator/SearchInput.tsx:53-66` → `src/core/inputController.ts:41-66`: every `onChange` synchronously runs `getSuggestions` (§4.1) **and** `SearchEngine.search` (§4.2), then re-renders. There is no `debounce`/`useDeferredValue`/`startTransition` on this path anywhere in `src/`.

**Fix direction:** a ~75 ms debounce (or `useDeferredValue` on the query for the *suggestion* path only) removes almost all typing-time cost with no perceptible latency change. **Highest value-per-line change in §4.** Caveat: the search field has load-bearing keyboard semantics (`SearchInput` handles arrows/Enter/Tab/Escape and forwards to `useInputController`; teardown §5.11 documents two shipped defects that must not regress). Debounce the *query→results* computation, **not** the key handling. Run `src/test/searchInputKeys.test.tsx` (5 tests) and `keyboardShortcut.test.tsx` (17 tests) after any change here.

### 4.4 11 full-store Zustand subscriptions → whole-UI re-render per keystroke — **Verified** (grep)

`useStateManager()` with **no selector** appears **11 times across 10 files**:

```
src/components/onboarding/TutorialOverlay.tsx
src/components/operator/BibleNavigator.tsx
src/components/operator/OperatorScreen.tsx
src/components/operator/PassageNavigation.tsx
src/components/operator/PresenterPanel.tsx
src/components/operator/ProjectionControl.tsx
src/components/operator/ProjectionStatus.tsx
src/components/operator/RecentPassages.tsx
src/components/operator/ServicePlan.tsx
src/core/inputController.ts
```

Zustand re-renders **every** subscriber on **any** store write. `setSearchQuery` fires per keystroke, so each character re-renders the header, presenter panel, projection control, status badge, active tab and settings shell — even the ones that read none of the changed fields.

**Fix direction:** give read-only consumers a selector (`useStateManager(s => s.committedPassage)`) or `useShallow` for multi-field reads. Start with the panels that clearly do not read `searchQuery` (`PresenterPanel`, `ProjectionStatus`, `ProjectionControl`, `BibleNavigator`). Sizing: mechanical but touches 10 files — do it as its own PR, verify with the existing suite.

### 4.5 Fonts: ~1.01 MB uncompressed, one missing preload — **Verified** (ls + read)

`public/fonts/` — 7 faces, **1,012,960 bytes** total, all `.ttf`/`.otf`:

| File | Bytes |
|---|---|
| `Autography.otf` | 52,396 |
| `PlayfairDisplay-Regular.ttf` | 176,736 |
| `Poppins-Bold.ttf` | 153,944 |
| `Poppins-Light.ttf` | 159,892 |
| `Poppins-Medium.ttf` | 156,520 |
| `Poppins-Regular.ttf` | 158,240 |
| `Poppins-SemiBold.ttf` | 155,232 |

All seven are precached by the SW, so this is on the offline first-load path. `index.html` preloads **three** (`Poppins-Regular`, `Poppins-SemiBold`, `PlayfairDisplay-Regular`) but **not `Autography`** — and Autography is the wordmark face on the first-paint `<h1>`, so the header FOUTs on every cold start.

**Fix direction:** convert all to WOFF2 (typically 3–4× smaller → ~250–350 kB, **Inferred** from the format's usual compression, not measured here), and add the missing Autography preload. Also worth considering: subset the Poppins family (5 weights) to the Latin subset actually used.

### 4.6 First SW install fetches ~8.5 MB all-or-nothing — **Verified** (read)

`pwa/sw.js:81` — `install` runs `cache.addAll(PRECACHE_URLS)` over both route shells, 7 fonts, all 5 Bible ZIPs (~7.5 MB per `PRODUCT.md`), the semantic index and build assets. Any single 404 fails the **entire** install. Deliberate offline-first trade, but on a slow sanctuary connection install blocks for a long time and one bad asset is fatal.

**Fix direction:** split **shell** precache (fast, must succeed) from **data** precache (can stream/degrade). Keep the app-shell guarantee absolute; let Bible data populate lazily on first use, which the runtime already does on demand.

### 4.7 Smaller per-frame / per-interval costs — **Verified** (read)

- **`AutoFitVerse`** — `src/pages/Projection.tsx:63-88`. The fit loop writes `text.style.fontSize` then reads `text.scrollHeight`/`scrollWidth` each iteration, from 72 px down to 16 px in 2 px steps: **up to ~28 forced synchronous reflows per verse change**, on the projection window, during a live service. Replace with a binary search over the size range (~5 reflows) or measure once via `ResizeObserver`.
- **`TutorialOverlay`** — `:152-158` polls `getBoundingClientRect` every 500 ms and calls `setRect` with a **fresh** `DOMRect` every tick, guaranteeing **2 re-renders/second** for as long as the tutorial is open even when nothing moved. Compare dimensions and skip `setRect` when unchanged (`ResizeObserver` is the better fix).
- **`ProjectionControl`** — three unconditional intervals run for the whole session even if no projector window was ever opened: 2 s heartbeat-timeout check (`:64-71`), 1.5 s `window.closed` poll (`:74-81`), 3 s `broadcastSync` (`:84-94`). The 3 s sync is *load-bearing* (teardown §5 "idempotent re-assertion" is the self-healing mechanism — **do not remove it**); the other two could be gated on "a projector has ever connected".
- **`BibleRepository.getPassage`** (`:573`) → `getBook` (`:558`) → `resolveBookName` (`:559`) recomputes a 66-book scan + sort on **every** call, and it is on the per-result and per-navigation path. Memoisation (§4.1's fix) helps here too.

---

## 5. Redundancy, dead code & drift

### 5.1 ~12 unused dependencies propping up 40 of 49 `ui/*` files — **Verified** (grep + ls)

`src/components/ui/` contains **49** files. Only ~9 are reachable from application code: `button, input, scroll-area, select, dialog, popover, alert-dialog, tooltip, sonner, toaster` (+ `toast` via `toaster`). Everything else is unreachable.

Importers, verified by grep across `src/**/*.{ts,tsx}`:

| Package | Imported by | Verdict |
|---|---|---|
| `@tanstack/react-query` | **`src/App.tsx`** | Actively wired (`QueryClient` + provider) around a **zero-query app** — ships in the bundle for nothing |
| `recharts` | `ui/chart.tsx` only | Unreachable |
| `embla-carousel-react` | `ui/carousel.tsx` only | Unreachable |
| `react-day-picker` | `ui/calendar.tsx` only | Unreachable |
| `input-otp` | `ui/input-otp.tsx` only | Unreachable |
| `cmdk` | `ui/command.tsx` only | Unreachable |
| `vaul` | `ui/drawer.tsx` only | Unreachable |
| `react-resizable-panels` | `ui/resizable.tsx` only | Unreachable |
| `react-hook-form` | `ui/form.tsx` only | Unreachable |
| `@hookform/resolvers` | **nothing** | Truly unused |
| `zod` | **nothing** | Truly unused |
| `date-fns` | **nothing** | Truly unused |

**Fix direction:** delete the unreachable `ui/*` files, drop the packages, and remove the `QueryClientProvider` from `App.tsx:4,18`. Verify with `npm ls` + a build. **Caveat:** `docs/ARCHITECTURE.md` / `DEVELOPMENT.md` may reference the shadcn baseline — check before deleting, and note that `components.json` declares the shadcn config, so a future component addition expects the deps.

### 5.2 Dead exports & files — **Verified** (grep, reference counts)

| Symbol / file | Location | Refs outside its own definition |
|---|---|---|
| `broadcastClear` | `src/core/broadcastSync.ts:127` | **0** (the `CLEAR_PASSAGE` message also has no producer) |
| `getTranslationMetadata` | `src/core/bibleRepository.ts:130` | **0** |
| `getVerseCount` | `src/core/bibleRepository.ts:621` | **0** |
| `getChapterCount` | `src/core/bibleRepository.ts:625` | **0** |
| `getCurrentTranslation` | `src/core/bibleRepository.ts:125` | 1 — **test-only** (`translationIsolation.test.ts:100`) |
| `ShortcutRow` | `src/components/operator/SettingsAndMore.tsx:264` | **0** — the shortcuts view inlines its own markup |
| `restartTutorial()` | `src/components/onboarding/OnboardingManager.tsx:80` | **0** — and the `restartTutorial` CustomEvent listener at `:30` waits for an event **nothing dispatches** |
| `src/core/index.ts` | barrel re-export of 5 modules | **0** importers |
| `src/App.css` | Vite-template CSS | **0** importers (never imported by `main.tsx`) |
| `src/test/example.test.ts` | `expect(true).toBe(true)` placeholder | counts as 1 of the 214 "passing" tests |

**Fix direction:** delete `App.css`, `core/index.ts`, `example.test.ts`, and the dead exports. `restartTutorial()` is a **latent trap**: it dispatches a CustomEvent that no one listens for in the intended way — if a future change wires a button to it, it will silently do nothing. Either wire it up or delete both halves.

### 5.3 Duplicated logic / competing sources of truth — **Verified** (read)

- **The 66-book canon exists twice.** `CANONICAL_BOOK_ORDER` (`src/core/bibleRepository.ts:37`) and `OT_BOOKS`/`NT_BOOKS` (`src/components/operator/BibleNavigator.tsx:10,21`). Adding or renaming a book means editing both — and a mismatch is silent.
- **"Extend the queue with the next verse" is written three times** verbatim:
  - `src/core/stateManager.ts:179` (inside `projectSlide`, unconditional pre-load)
  - `:576` (inside `commitCurrentSlide`, locked branch)
  - `:610` (inside `_commitWithOldSlide`, locked branch — the comment even says *"Same pre-load logic as commitCurrentSlide"*)
  A fourth near-copy (inline, different shape) lives in `slideNext` at `:428`. Extract one `extendQueueWithNextVerse(...)` helper.
- **Event-name literal vs constant.** `src/core/inputController.ts:292` uses the imported `NEXT_SERVICE_PLAN_EVENT`, but `:298` dispatches `new CustomEvent('nextServicePlanPassage')` as a **string literal**. `src/core/shortcutRegistry.ts:21` is the declared single source of truth. Drift waiting to happen.
- **Redundant slice.** `src/components/operator/RecentPassages.tsx:152` does `recentPassages.slice(0, MAX_RECENT_PASSAGES)` while the store already caps at that constant (`stateManager.ts:205`, `MAX_RECENT_PASSAGES = 20`) — the source comment even says so.
- **No-op ranking expression.** `src/core/searchEngine.ts:42` — `score: 100 - index * 0`, with the comment *"All exact matches score 100"*. Write `score: 100` or delete the field.
- **Repeated setup work.** `setupBookAliases` rebuilds its ~66-entry `abbreviations` object on every call; `sortBooksInOrder` runs `findIndex` over the canon per comparator invocation (same pattern as `resolveBookName`).

### 5.4 Three lockfiles — **Verified** (git ls-files)

Tracked: `bun.lock` (144,920 B), `bun.lockb` (245,395 B), `package-lock.json` (299,710 B), plus `skills-lock.json` (278 B, agent tooling). `AGENTS.md` mandates **npm** (`npm install --no-audit --no-fund`). The two Bun locks are stale (Sep 10; `package-lock.json` is Sep 29) and will silently drift from `package.json`. **Fix direction:** delete `bun.lock` and `bun.lockb`; keep `package-lock.json`.

### 5.5 Documentation drift (contract violation) — **Verified** (read)

`docs/System Teardown.md:381` (§5.12) states the Settings & More menu has *"role=\"menu\", exactly three items — Display Settings, Replay Tutorial, Keyboard Shortcuts."*

Reality: **four** items. `src/components/operator/SettingsAndMore.tsx` has a `'menu' | 'display' | 'theme' | 'shortcuts'` view union (`:47`) and four menu buttons at `:128` (Display Settings), `:136` (**Theme**), `:148` (Replay Tutorial), `:152` (Keyboard Shortcuts). The test agrees: `src/test/settingsAndMore.test.tsx:53` is named *"opens a menu with exactly four entries"* and passes.

`AGENTS.md` §4 says `System Teardown.md` is *"the one doc you are expected to keep current"* (RI-053). It has fallen behind here. **Fix direction:** update §5.12 to four items and document the Theme sub-view. Cheapest high-signal fix in this document.

### 5.6 Both toast systems are mounted and never triggered — **Verified** (read)

`src/App.tsx:3,14` mounts `Toaster` (Radix) and `:4,15` mounts Sonner's `Toaster`. Neither is ever fired: `toast(` appears nowhere in application code. On top of that, `src/components/ui/use-toast.ts` (82 B) is a third file that merely re-exports the hook in `src/hooks/use-toast.ts`. **Fix direction:** keep whichever one the design intends, delete the other two files plus the unused dependency (`@radix-ui/react-toast` or `sonner`).

### 5.7 11 `console.log` calls in production code — **Verified** (grep)

Distribution: `src/pages/Projection.tsx` **6**, `src/core/bibleRepository.ts` **3**, `src/core/stateManager.ts` **2**. The `Projection.tsx` ones are the noisiest — they dump the full saved passage (`:186` *"Loaded from localStorage:"*) and **every received broadcast message** (`:226` *"Received broadcast:"*). There is no dev-only gate. **Fix direction:** delete or gate behind `import.meta.env.DEV`. Run `vite build` after — Vite does **not** strip bare `console.log` by default, so these ship.

---

## 6. Build, config & tooling

### 6.1 Single 622 kB chunk, no code splitting — **Verified** (build output)

`vite build` emits one app chunk: **622,187 B JS** (191 kB gzip per the earlier audit), 83,158 B CSS, 99,473 B worker, and a chunk-size warning. `App.tsx` imports `Index` and `Projection` eagerly. The projection route is a **separate window** that rarely needs the operator bundle (search, autocomplete, navigator, service plan), so it is a natural split point.

**Fix direction:** `React.lazy` the routes; drop the unused deps (§5.1). Low risk, but note `Projection` must still be fast on cold start — prefetch it from the operator window rather than lazy-loading it on demand.

### 6.2 Lint is red — **Verified** (executed)

6 errors + 15 warnings, exit `1`. Full list in §2. Two of the six errors are in `ui/command.tsx` and `ui/textarea.tsx` — files that §5.1 says should be deleted, so deleting them fixes two errors for free. `broadcastSync.ts` is a **protected file** (`AGENTS.md` §4 / VF-100) — the two `no-empty` errors there need explicit justification in your task prompt.

### 6.3 Type/lint strictness is switched off — **Verified** (read)

`tsconfig.json`: `noImplicitAny: false`, `noUnusedLocals: false`, `noUnusedParameters: false`, `strictNullChecks: false`.
`tsconfig.app.json`: additionally `strict: false`, `noFallthroughCasesInSwitch: false`.
`eslint.config.js`: `@typescript-eslint/no-unused-vars: "off"`.

This is the systemic reason §5.2's dead exports survive and §3.1's stale closure isn't a type error. Turning on `noUnusedLocals` + `noUnusedParameters` alone surfaces most of §5.2 automatically. **Do this before** deleting by hand — the compiler will produce the list for you. Note `tsconfig.node.json` **does** set `strict: true`, so config files are held to a higher standard than the app.

### 6.4 Test suite architecture — **Verified** (executed)

25 files, 214 tests, 45.8 s. Slowest: `settingsAndMore.test.tsx` (16.6 s) and `bibleCache.integration.test.ts`. `vitest.config.ts` sets **no `testTimeout`**, so Vitest's 5 s default applies — that is why a 7 s assertion under parallel load fails. There are also **no coverage thresholds**.

`e2e/` holds 3 Playwright specs (`liquid-glass`, `offline-and-worker`, `theme-boot`) plus `helpers/` and `global-teardown.ts`. `playwright.config.ts` runs them against the **production build** via `vite preview --port 4174` with `reuseExistingServer: !CI`, a 180 s timeout, `workers: 1`, and a `globalTeardown` that reaps the respawned preview server. That teardown comment is a real bug fix — don't remove it.

**Fix direction:** raise `testTimeout` (e.g. 15 s) or reduce parallelism for the heavy files; consider a coverage threshold once the dead code (§5) is gone.

### 6.5 Repository hygiene — **Verified** (ls + git ls-files)

**Corrected from an earlier pass.** Actual state:

- **Tracked residue:** `public/placeholder.svg` (verified **unreferenced** by any source or HTML). `.agents/skills/impeccable/**` and `.impeccable/*` **are tracked and intentional** (agent tooling config), not junk — leave them.
- **Correctly gitignored (present but untracked):** `dist/`, `test-results/`, `playwright-report/`, `.freebuff/`, `node_modules/`.
- **Not present, contrary to an earlier draft of this audit:** there is no `Untitled-1.psd` and no `App Icon Dark.png` / `App Icon Light.png` at the repo root. `public/App Icon Orange.png` **is used** (`index.html` favicon + apple-touch-icon) — do not delete it.
- **Genuine residue:** `src/App.css`, `src/core/index.ts`, `src/test/example.test.ts`, `public/placeholder.svg`, the two Bun lockfiles, and the `lovable-tagger` devDependency wired into the dev build at `vite.config.ts:6,149` (`mode === "development" && componentTagger()`). Remove `lovable-tagger` and the tagger call — it is Lovable scaffolding with no role in this project.

---

## 7. Product & UX observations

Every item is **Verified** by reading the file cited.

- **No error boundary contradicts the stated principles** — `PRODUCT.md` principles 2 & 4 require surviving crashes; §3.2 shows there is no net. This is the one product-level gap.
- **`MobileBlocker` copy contradicts its trigger.** `src/components/MobileBlocker.tsx:14` says *"Please use a tablet, laptop, or desktop device"*, but `src/hooks/use-mobile.tsx:3` sets `MOBILE_BREAKPOINT = 768` and blocks at `innerWidth < 768` — which **includes tablets in portrait** (768–834 px). `PRODUCT.md` states the intended constraint as "below 768 px the app refuses to render". So: fix the copy to say the app needs a wider screen, or lower the breakpoint — but don't leave the instruction disagreeing with the behaviour.
- **"Beta" badge on a product declared feature-complete for its one church.** `src/components/operator/OperatorScreen.tsx` renders a Beta badge while `PRODUCT.md` says the scope is one church, one operator, and the capabilities list is "confirmed". Decide which is true.
- **`BibleNavigator` memos omit `currentTranslation`.** `:40-41` memoise `otBooks`/`ntBooks` on `[allBooks]` only, so a mid-session translation switch does **not** refresh the Browse grids. `PRODUCT.md` lists mid-service translation switching as a live-service rhythm. If two translations expose different verse keys, the grids go stale. Also check the chapter/verse memos in the same file.
- **`Date.now()` IDs collide.** `src/components/operator/ServicePlan.tsx` lines 45, 147, 161, 163, 183 all build ids from `Date.now().toString()`; `:163` appends `Math.random()` but the others do not. Two rapid creations in the same millisecond produce duplicate ids, and the lists key on `id`. Use `crypto.randomUUID()`.
- **`robots.txt` + social meta advertise an intentionally-undistributed product.** `public/robots.txt` allows every crawler; `index.html` carries `og:` and `twitter:` tags. `PRODUCT.md` states the product *"is not intended for public distribution"*. Harmless, but incoherent — a `Disallow: /` or removal of the meta tags would match the intent.
- **Dropped translation label?** `AutoFitVerse` (`Projection.tsx:76-78`) resolves `getTranslationDisplayName(translationCode)` and renders it below the reference, so the on-screen label is correct — but the teardown's "translation invariant" (§5, item 5) depends on `setTranslation` re-projecting the live slide. Worth an explicit test: switch translation while a passage is live and assert the projected label **and** text both update.

---

## 8. Decisions made during this audit

Recorded so the next agent does not have to re-derive them.

1. **No application source was modified.** The task was explicitly *"not to write any code"*. `git status --short` shows only new `docs/` files. Findings are reported, not fixed.
2. **The `tsc` result was re-tested after an initial misreading, and the earlier report was corrected.** The first pass recorded `npx tsc --noEmit` = PASS. Re-running with the project reference (`npx tsc -b`) exposed 12 real errors (§3.4). The stale row in `docs/Wordde_Codebase_Audit_2026-10-13.md` has been corrected to match this document. **Lesson for other agents: `tsc --noEmit` at the repo root of this project proves nothing.**
3. **The earlier "213/214 with a flake" result was superseded, not hidden.** A clean re-run gives **214/214, exit 0**. The flaky-*under-load* characterisation is retained (no `testTimeout` in `vitest.config.ts`) but the suite is not currently red.
4. **An earlier draft's claim about root residue (`Untitled-1.psd`, `App Icon Dark/Light.png`) was wrong and was removed.** A full `ls -la` of the repo root shows no such files, and `public/App Icon Orange.png` is actively referenced by `index.html`. §6.5 reflects the actual listing.
5. **Playwright e2e was deliberately not run.** `playwright.config.ts` runs `npm run build && npm run preview` on port 4174 with a 180 s budget per spec and requires the production build. Running it would spawn a dev/preview server, which was outside a read-only audit's scope. Reported as **not run**, not as passing (§10). *(Post-audit the suite has been run in full: 24 tests, exit 0 — see §10.1.)*
6. **No browser profiling was performed,** so §4's magnitudes are marked **Inferred**. Verifying them is the highest-value *next* investigation — see §9 and §10.
7. **Service/dependency research was judged unnecessary.** The audit identifies *unused* third-party packages, not a need for new ones, so no provider research was relevant.
8. **`System Teardown.md` was left untouched.** `AGENTS.md` designates it as the document a change should keep current (RI-053), but updating it is part of *implementing* a fix, not auditing one — and §5.5's drift is itself a finding. The correction belongs to whoever makes the corresponding code change.

---

## 9. Suggested fix order

### P0 — correctness, do first (each is small and independently verifiable)

> **Remediation status (2026-10-13).** **P0 #1–#6 are landed** (uncommitted, working tree).
> After the fixes: `npm run typecheck` → **exit 0**; `npm run lint` → **6 errors / 14 warnings**
> (was 6/15 — the §3.1 warning is gone); `npx vitest run` → **27 files / 224 tests passing**
> (was 25/214); `npx vite build` → **exit 0**, 624.20 kB JS (was 622.19 kB).
> P1–P3 are untouched. Each row keeps its status below.

| # | Fix | Files | Verify with | Status |
|---|---|---|---|---|
| 1 | Add `"typecheck": "tsc -b"`, a `*.tsbuildinfo` ignore rule, and make it the mandated check | `package.json`, `.gitignore`, `AGENTS.md` §2, `.github/workflows/gate.yml` | `npm run typecheck` now fails, then fix the 12 errors | **Landed.** `AGENTS.md` §2 now mandates `npm run typecheck`; **`.github/workflows/gate.yml`'s `Typecheck` step was running the same no-op `npx tsc --noEmit`** and is now `npm run typecheck` — the audit missed CI, which is where a mandated check actually lives (§3.4). |
| 2 | Fix the 12 type errors the real check uncovers | `src/core/bibleDecodeClient.ts:59`, `src/test/recentPassages.test.tsx` | `npx tsc -b` → exit 0 | **Landed.** Verified: `tsc -b` exit 0. |
| 3 | Fix the object-URL stale closure + add unmount revoke | `src/pages/Projection.tsx:248` | lint warning at `258:6` disappears; manual: reload assets repeatedly, watch blob-URL count in DevTools | **Landed and measured in a real browser.** Warning gone. `e2e/projection-hardening.spec.ts` instruments `URL.createObjectURL`/`revokeObjectURL` inside the projection window across 5 `RELOAD_ASSETS` cycles: 12 created, 10 revoked, live steady at 2, peak 4. Against the pre-fix file the same spec fails with `Expected: 10, Received: 0`. See §10.3. |
| 4 | Add error boundaries (operator + projection, separately) | `src/App.tsx` + new component | throw deliberately in a child; the other route must survive | **Landed and proven in a real browser.** `src/components/ErrorBoundary.tsx`; `src/test/errorBoundary.test.tsx` (4 unit tests). `e2e/projection-hardening.spec.ts` poisons `currentProjection` with a Passage whose `verses` is null (parses, throws on render), then asserts the boundary's own catch log fires, the `Projection stopped` fallback renders, `#root` is still mounted, and a second operator window on the same poisoned storage keeps serving. Against the pre-fix `App.tsx` the same spec fails. |
| 5 | Replace `getNearbyPassages` arithmetic with `getNextVerse`, thread translation | `src/core/searchEngine.ts:144-160` | `bibleNormalizer.test.ts`, `verseNavigation.test.ts`; add a `3a` case | **Landed.** `src/test/searchReference.test.ts` gained 2 cases (lettered `3`→`3a`→`3b`; non-contiguous `1,2,5`). |
| 6 | Guard the three raw `localStorage` reads | `Projection.tsx:185`, `ContextualHint.tsx:20`, `OnboardingManager.tsx:24` | `persistenceGuards.test.ts` | **Landed.** `safeLocalGet` added to `safeStorage.ts`; `src/test/persistenceReadGuards.test.tsx` (4 tests, including an `OnboardingManager` boot with storage throwing). |

### P1 — performance (one workstream; do them together)

| # | Fix | Files |
|---|---|---|
| 7 | Hoist `resolveBookName(query)` out of the 66-book loop; memoise `resolveBookName` | `src/core/autocomplete.ts:51`, `src/core/bibleRepository.ts:497` |
| 8 | Debounce the query→results path (**not** key handling) | `src/components/operator/SearchInput.tsx`, `src/core/inputController.ts` |
| 9 | Selector-based subscriptions for read-only consumers | 10 files, §4.4 |
| 10 | Convert fonts to WOFF2 + preload Autography | `public/fonts/`, `index.html`, `src/index.css` |
| 11 | Binary-search / `ResizeObserver` the verse auto-fit | `src/pages/Projection.tsx:63-88` |

### P2 — hygiene (cheap, high signal)

| # | Fix | Files |
|---|---|---|
| 12 | Turn on `noUnusedLocals`/`noUnusedParameters` + `no-unused-vars` to generate the dead-code list, then delete per §5.2 | `tsconfig*.json`, `eslint.config.js` |
| 13 | Delete unreachable `ui/*` files + their deps; remove `QueryClientProvider` | `src/components/ui/` (40 files), `package.json`, `src/App.tsx:4,18` |
| 14 | Delete `App.css`, `core/index.ts`, `example.test.ts`, `placeholder.svg`, `bun.lock`, `bun.lockb`, `lovable-tagger` | §6.5 |
| 15 | Fix the 6 lint errors (`ui/*` deletions clear two of them) | §6.2 |
| 16 | Gate or delete the 11 `console.log`s | §5.7 |
| 17 | Update `docs/System Teardown.md` §5.12 to four menu items | `docs/System Teardown.md:381` |
| 18 | Reconcile the SW `skipWaiting`/`claim` claim | `pwa/sw.js:82,93` |
| 19 | Deduplicate the canon, the 3× preload block, the event literal | §5.3 |
| 20 | Raise `testTimeout`; split shell vs data precache | `vitest.config.ts`, `pwa/sw.js` |

### P3 — product

21. Fix the `MobileBlocker` copy vs the 768 px trigger (§7).
22. Decide on the "Beta" badge (§7).
23. Refresh `BibleNavigator` memos on translation change (§7).
24. `crypto.randomUUID()` for Service Plan ids (§7).
25. `Disallow: /` in `robots.txt` if the product is truly undistributed (§7).

---

## 10. Not verified / limitations

State these honestly if you cite this document.

1. ~~The e2e suite was not run.~~ **Now run in full and green:** `npm run test:e2e` → **24 tests passed, exit 0, 2.0 m** (all four specs, production build on :4174). Nothing had to be changed to get there — the suite simply had never been executed. **This does not discharge §3.6.** The audit suggested the offline spec could validate it, but reading that spec shows it tests an *offline reload* (server killed, assets served from cache), not a *mid-service deploy* swapping the worker under an open client — which is the behaviour §3.6 actually disputes (`skipWaiting`/`claim` vs the comment's promise). §3.6 remains **unverified** and still needs a purpose-built test.
2. **No browser profiling.** Every performance magnitude in §4 is reasoned from code (marked **Inferred**). To turn §4.1–§4.4 from structural claims into measurements: run the built app, open DevTools Performance, type a 6-character reference with a CPU throttle of 4×–6× (representative of the donated laptops in `PRODUCT.md`), and record Scripting time and long-task counts before/after each fix.
3. ~~No memory measurement of the §3.1 leak.~~ **Now measured.** `e2e/projection-hardening.spec.ts` instruments `URL.createObjectURL`/`revokeObjectURL` inside a real Chromium projection window, seeds two blobs into IndexedDB, then fires 5 `RELOAD_ASSETS` cycles: 12 URLs created, 10 revoked, the live set steady at 2 and peaking at 4. With the pre-fix code the same spec fails at 0 revocations. **Not** measured: process-level heap growth — the URL bookkeeping is the leak, and it is now provably bounded.
4. **The §3.4 `strictNullChecks` narrowing mechanism is inferred**, not proven experimentally. The 12 errors are verified; the *explanation* is the most likely cause.
5. **The WOFF2 size estimate (~250–350 kB) is inferred** from typical format compression, not measured by converting these specific fonts.
6. **The e2e specs and `public/data/*.zip` contents were not opened.** The ZIPs are protected (`AGENTS.md` §4) and out of audit scope; the earlier "~7.5 MB / 5 translations" figure comes from `PRODUCT.md`, not from measuring the files.
7. **`AutoFitVerse` reflow count (~28 per verse change) is computed** from the 72→16 px range at a 2 px step, assuming the loop runs to completion. Real counts depend on content.
8. **No dead-code analysis tool was run** (no `knip`/`ts-prune`). §5's list comes from targeted greps — thorough for the symbols named, not exhaustive. Turning on `noUnusedLocals` (fix #12) will find more.

---

## Appendix A — file inventory established during this audit

- **`src/components/ui/`:** 49 files; ~9 reachable.
- **`public/fonts/`:** 7 files, 1,012,960 B, all TTF/OTF.
- **Lockfiles:** `bun.lock`, `bun.lockb`, `package-lock.json`, `skills-lock.json`.
- **`src/test/`:** 25 test files + `setup.ts` + `fakeBroadcastChannel.ts`.
- **`e2e/`:** `liquid-glass.spec.ts`, `offline-and-worker.spec.ts`, `theme-boot.spec.ts`, `projection-hardening.spec.ts` (added post-audit), `helpers/`, `global-teardown.ts`.
- **`dist/assets/` (last build):** `index-utF3gnt7.js` (622,187 B), `index-DDFCE-Uc.css` (83,158 B), `bibleDecodeWorker-DLIZoEGG.js` (99,473 B).
- **`src/core/`:** `assetStorage, autocomplete, bibleCache, bibleDecodeClient, bibleDecodeWorker, bibleNormalizer, bibleRepository, broadcastSync, index, inputController, operatorLease, projectionRecovery, safeStorage, searchEngine, shortcutRegistry, stateManager, translationMetadata, types`.

## Appendix B — `AGENTS.md` constraints that bind any fix in §9

- **Read first:** `docs/MCD.md`, `docs/RELIABILITY & INVARIANT SPECIFICATION.md`, `docs/CONSTRAINTS.md`, `docs/VERIFICATION-RULES.md`, `docs/System Teardown.md`, `docs/ARCHITECTURE.md`.
- **Never violate:** VF-001 verbatim scripture · VF-002 no translation fallback · VF-003 no verse arithmetic (§3.3) · VF-004 projection window is read-only · VF-005 guard localStorage (§3.5) · VP-004 offline-first, only `fetch('/data/*.zip')` · one commit funnel through `projectSlide`.
- **Protected files (VF-100):** `src/core/bibleNormalizer.ts`, `src/core/broadcastSync.ts`, `src/core/types.ts` — change only with explicit justification in the task prompt. **(Relevant to fixes #15 and #18, both of which touch `broadcastSync.ts` / `pwa/sw.js`.)**
- **Never modify (VF-101):** `docs/ARCHITECTURE.md`, `docs/CONSTRAINTS.md`, `docs/DEVELOPMENT.md`, `docs/VERIFICATION-RULES.md`; and `public/data/*.zip`.
- **Expected to keep current (RI-053):** `docs/System Teardown.md` — hence fix #17.
- **Every task ends with a completion report** (MCD §26, Phase H): what changed and why, files touched, invariants affected, tests added, verification results, known limitations, teardown sections updated, new debt, decisions to preserve.

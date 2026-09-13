# Wordde — Codebase Reconciliation Report

**Method:** Full clone of `MikkoWuyin-dev/Wordde` @ `a9d17ae` ("Add Master Context Document and Reliability & Invariant Specification"). Static reading of all `src/core/` modules, the operator/projection pages, the input layer, and the test suite; `npm ci` + `npx vitest run` executed to capture the live baseline. Every claim below cites `file:line` from that commit. Code is treated as ground truth for "what is"; documents are treated as intent.

---

## 1. Summary

- **The reverted state is healthy and genuinely invariant-aware.** The critical P0 domain logic (verse navigation, translation isolation, recovery) is not merely present — it is correct, commented against the exact failure modes the spec names, and largely covered by tests.
- **Test baseline is GREEN: 66 tests across 6 files, all passing (~6s).** The "P0 test foundation" step is partly built, not greenfield. It becomes a *coverage-gap* exercise.
- **Navigation is position-based end to end (RI-008/009/010/011/012 upheld).** Verse keys are opaque strings; stepping is by array index; boundaries walk real arrays; missing keys return `null` and never guess.
- **No silent translation fallback anywhere (RI-014/016 upheld).** The repository throws on unknown translations and returns an *empty* map (never another translation's data) when one isn't loaded, with an inline comment naming the "label says NIV, text is KJV" bug it prevents.
- **Recovery cannot re-project (RI-021/024/026/028 upheld).** `restoreProjectionSession` restores local state only, never broadcasts; snapshots are versioned, validated, staleness-bounded, and quarantined on failure.
- **Projection window is a true replica (RI-017/019 upheld).** It writes no authoritative state and requests current state on cold-start.
- **Duplicate-nav-path question: RESOLVED, and it's not a real duplication.** `bibleRepository.getNextVerse/getPreviousVerse` is the live low-level primitive (called from `stateManager` in 5 places), not dead code.
- **Top real risk — inconsistent `localStorage` guarding (RI-022/043).** Recovery persistence is guarded at the function level (the correct pattern); several operator-facing writes are raw and can throw into the UI. Full enumeration in §5.
- **Secondary risk — translation preload is all-or-nothing (RI-043 / MCD §24.3).** `preloadAllTranslations` uses `Promise.all`, so one bad zip fails the whole boot.
- **Documented limitations confirmed present, as expected:** broadcast messages are unversioned (§20), and there is no operator-singleton/lease (§21, RI-001).

---

## 2. Codebase Map

**Stack (confirmed):** React 18.3, Vite 5.4 (SWC), TypeScript 5.8, Zustand 5, Vitest 3.2, Tailwind 3.4, Radix/shadcn, JSZip, react-router, @tanstack/react-query, sonner. `lovable-tagger` still present in devDeps (Lovable residue). Deployed to Vercel (`vercel.json`, `wordde.vercel.app`).

**Core modules (`src/core/`), by size:**

| Module | Lines | Role |
|---|---|---|
| `stateManager.ts` | 766 | Zustand store; state ownership, slide/commit funnel, lock, blank, history, recents, persistence, recovery, legacy nav. The flagged "large" module. |
| `bibleRepository.ts` | 666 | Read-only, translation-aware data access; loading/preload; opaque-key navigation primitive. |
| `inputController.ts` | 295 | Keyboard handling with input-context guards. |
| `autocomplete.ts` | 246 | Reference autocomplete (Levenshtein). |
| `projectionRecovery.ts` | 228 | Versioned snapshot save/validate/restore; never throws. |
| `searchEngine.ts` | 174 | Tiered search (see §8 discrepancy). |
| `broadcastSync.ts` | 168 | BroadcastChannel transport + `localStorage` projection/blank persistence. |
| `assetStorage.ts` | 137 | IndexedDB for user visual assets. |
| `bibleNormalizer.ts` | 149 | Sole source-format boundary → canonical `BibleBook`. |
| `types.ts` / `translationMetadata.ts` / `index.ts` | 134 / 18 / 6 | Types; display names; barrel. |

**Windows:** operator = `src/pages/Index.tsx` → `components/operator/*`; projection replica = `src/pages/Projection.tsx` (284 lines).

**Tests (`src/test/`):** `verseNavigation` (157), `projectionRecovery` (236), `servicePlan` (262), `searchReference` (404), `keyboardShortcut` (309), `example` (7), plus `setup.ts`. **66 tests, all passing.**

**Docs are split across two homes:** repo root (`System Teardown.md`, `Wordde_Senior_Engineering_Audit.md`) and `docs/` (`MCD.md`, `RELIABILITY & INVARIANT SPECIFICATION.md`, `ARCHITECTURE.md`, `CONSTRAINTS.md`, `DEVELOPMENT.md`, `VERIFICATION-RULES.md`). Tooling is wired: `.freebuff/`, `.impeccable/`, `.agents/skills/impeccable/`.

---

## 3. Architecture Reconciliation (MCD claims)

| MCD claim | Status | Evidence |
|---|---|---|
| State centralized in `stateManager.ts` (§5) | **CONFIRMED** | Single Zustand store owns queue/live/committed/lock/blank/history/recents/persistence/recovery. |
| Operator authoritative; Projection is replica (§4) | **CONFIRMED** | `Projection.tsx` has no `localStorage` writes; posts `PROJECTOR_READY` (215), listens, requests state. |
| `bibleNormalizer.ts` is the sole format boundary (§6.2) | **CONFIRMED** | "All format detection lives here and nowhere else"; repo routes every file through `normalizeBibleJson` (`bibleRepository.ts:~120`). |
| `bibleRepository` read-only, translation-aware, no fallback (§6.3, §7) | **CONFIRMED** | `getBooksMap` returns empty map, never another translation (`bibleRepository.ts:~197`), with explicit anti-fallback comment. |
| Verse/chapter IDs are opaque strings (§6.1) | **CONFIRMED** | Normalizer keeps `verse: verseKey`, `chapter: chapterKey` as strings; nav uses `findIndex` on keys. |
| Translations = KJV/NIV/NKJV/NLT/AMP, preloaded (§7) | **CONFIRMED** | `TRANSLATION_ZIPS` (`bibleRepository.ts:19`); `preloadAllTranslations()` on boot. |
| Single projection commit funnel (§9) | **CONFIRMED** | `projectNow`/`commitCurrentSlide`/`_commitWithOldSlide` all route through `projectSlide` when unlocked (`stateManager.ts:585`). |
| Search is a linear corpus scan (§8) | **PARTIAL / OUTDATED** | Search is *tiered*: exact-ref → nearby → prebuilt `semanticIndex.json` → keyword (`searchEngine.ts:40–76`). Richer than the doc states. |

---

## 4. P0 Invariant Status (highest-priority list)

| RI | Status | Evidence |
|---|---|---|
| RI-001 single authoritative operator | **AT RISK (as documented)** | No singleton/lease exists; multiple operator windows possible. Matches §21. |
| RI-002 audience == committed state | **UPHELD (partial test)** | Broadcast on commit only (`projectSlide`); `COMMIT_PASSAGE` asserted in `keyboardShortcut.test`. No projection-window render assertion. |
| RI-003 locked projection not modified | **UPHELD** | `commitCurrentSlide` locked branch updates preview only, "do NOT broadcast" (`stateManager.ts:560–561`); same in `_commitWithOldSlide`. |
| RI-004 commit funnel | **UPHELD** | Single `projectSlide` entry: broadcast → guarded persist → preload → recovery-last (`stateManager.ts:~157–200`). |
| RI-008 opaque verse keys | **UPHELD** | Strings throughout; `verseNavigation.test` B/C cover lettered + non-contiguous. |
| RI-009 position-based nav | **UPHELD** | `getNextVerse` steps `verses[verseIndex+1]` (`bibleRepository.ts:~502`). |
| RI-010 chapter boundaries data-driven | **UPHELD** | `book.chapters[chapterIndex+1]`; `stateManager.goToNextChapter` uses `getChapters().indexOf`. |
| RI-011 book boundaries data-driven | **UPHELD** | `bookNames.findIndex` + adjacent element (`bibleRepository.ts:~512`; `stateManager.ts:~715`). |
| RI-012 missing verse fails safe | **UPHELD** | `verseIndex === -1 → return null` "never guess a nearby verse" (`bibleRepository.ts:~494`); `verseNavigation.test` G. |
| RI-013 explicit translation identity | **UPHELD** | `currentTranslation` passed on every lookup in the nav path. |
| RI-014 no silent translation fallback | **UPHELD** | Throws `Unknown translation` (`bibleRepository.ts:73`); empty-map, no-substitute policy; `searchReference.test` + `projectionRecovery.test` Test 7. |
| RI-015 translation change preserves reference | **UPHELD** | `verseNavigation.test` H navigates identical refs across TA/TB. |
| RI-016 translation data isolation | **UPHELD (partial test)** | Per-translation `Map`; duplicate books kept-first; no cross-write. No dedicated "TB load doesn't corrupt TA" test. |
| RI-020 sync loss doesn't corrupt operator | **AT RISK (untested)** | Operator persists independently of broadcast success, but no test simulates channel failure. |
| RI-021 recovery doesn't re-project | **UPHELD** | `restoreProjectionSession` "No broadcast is performed here" (`stateManager.ts:~514`). |
| RI-022 persistence failure isolation | **PARTIAL** | Recovery + `projectSlide`/`undo`/`blank` writes guarded; several operator writes raw — see §5. |
| RI-024 stale recovery rejected | **UPHELD** | `RECOVERY_MAX_AGE_MS` check (`projectionRecovery.ts:~162`); `projectionRecovery.test` Test 3. |
| RI-026 recovery not auto-projected | **UPHELD** | Same as RI-021; restore is local-only. |
| RI-028 invalid recovery fails safe | **UPHELD** | `validateRecoverySnapshot` returns null; `loadRecoverySnapshot` never throws, quarantines bad data. |
| RI-029 blank state distinct from passage | **UPHELD** | `blankScreen` toggles `isScreenBlanked` while keeping `committedPassage` (`stateManager.ts:~622`); `projectionRecovery.test` Test 6. |
| RI-040 source text preserved verbatim | **UPHELD (untested)** | "Preserve text exactly as provided — no trimming…" (`bibleNormalizer.ts`). No dedicated normalizer test. |
| RI-043 non-critical failure isolation | **AT RISK** | `preloadAllTranslations` uses `Promise.all` — one zip failure rejects the whole boot. |
| RI-044 no silent data substitution | **UPHELD** | Empty-not-substitute in repo; recovery/translation tests confirm. |
| RI-045 preserve last-known-good | **UPHELD** | Failed persistence logs + continues; state only `set()` on success paths. |
| RI-046/047 offline core | **UPHELD (untestable in unit)** | All data local (`/public/data/*.zip`, IndexedDB); no runtime network dependency in core paths. |
| RI-049 regression tests accompany fixes | **UPHELD** | `keyboardShortcut.test` is explicitly regression-driven (Escape fall-through, OS-combo hijack, boot-state dead zone). |
| RI-059 last-known-good projection | **UPHELD** | Guarded persist + broadcast-first ordering preserves live state on failure. |
| RI-060 preview never accidentally live | **UPHELD** | Preview methods (`previewNextVerse`, locked branch) never broadcast; `keyboardShortcut.test` "clearPreview preserves the live session". |

---

## 5. Unguarded `localStorage` Writes (full enumeration)

**The reference pattern to copy:** `projectionRecovery.saveRecoverySnapshot` self-guards at the function level (proven by `projectionRecovery.test` "does not throw when localStorage.setItem fails" — the run logs `[projectionRecovery] Failed to persist recovery snapshot` and continues). Everything below should converge on this pattern.

**GUARDED (try/catch at the call site):**
- `stateManager.ts:159–160` — `currentProjection` + `persistProjectionState` in `projectSlide` ✓
- `stateManager.ts:478–479` — `currentProjection` + `persistProjectionState` in `undoProjection` ✓
- `stateManager.ts:628` / `637` — `persistProjectionState` in `blankScreen` (both branches) ✓
- `stateManager.ts:674` — `persistProjectionState` in `loadChapterAsQueue` ✓
- `projectionRecovery.ts:119` / `129` — snapshot write/remove (self-guarded) ✓
- `ServicePlan.tsx:45–46` — legacy migration writes, inside `loadServices` try/catch ✓

**UNGUARDED (raw write — an exception propagates to the caller):**

| Location | Function | When it runs | Severity |
|---|---|---|---|
| `stateManager.ts:233` | `addToRecent` | on passage selection / recents update | **P1** |
| `stateManager.ts:238` | `removeFromRecent` | operator removes a recent | P2 |
| `stateManager.ts:242` | `clearAllRecent` | operator clears recents | P2 |
| `broadcastSync.ts:69` | `saveBlankSettings` (fn-level) | via `ProjectionSettings.tsx:65` (also unguarded) — editing blank/session screens | **P1** |
| `broadcastSync.ts:149` | `persistProjectionState` (fn-level) | *latent* — safe only because every current caller wraps it; a future caller inherits no guard | **P1 (latent)** |
| `ServicePlan.tsx:57` | `saveServices` | add / edit / reorder passages, potentially mid-service | **P1** |
| `OnboardingManager.tsx:34,85` | onboarding flags | first-run only | P2 |
| `ContextualHint.tsx:21,26` | hint dismissal | non-service | P2 |

**Recommended fix shape (for the later P1 task, not now):** a single `safeLocalSet(key, value)` helper that try/catches and logs, plus moving the guard *into* `saveBlankSettings` and `persistProjectionState` so it can't be lost at a call site. This closes RI-022/043 for storage uniformly.

---

## 6. Duplicate-Nav-Path & RI-012 — resolved

**Duplicate path — NOT a real duplication.** There are three layers, not two rivals:
1. **Primitive:** `bibleRepository.getNextVerse/getPreviousVerse` — opaque-key, data-driven stepping incl. chapter+book crossing. **Live**, called from `stateManager.ts:179, 412, 439, 563, 597` (queue preload + locked preload). Not dead.
2. **Slide model:** `slideNext/slidePrevious` over `projectionQueue` — used by keyboard (`inputController.ts:234/240`).
3. **Legacy shims:** `goToNextVerse/goToPreviousVerse` = slide + commit — wired to the operator arrow buttons (`PassageNavigation.tsx:30–42`).

**One genuine (mild) redundancy remains:** chapter/book boundary-crossing logic exists **twice** — inside `getNextVerse` *and* independently inside `stateManager.goToNextChapter/goToPreviousChapter`. Both are currently correct, but they can drift. Classify **RI-051 / P2** — consolidate later, with tests, not now. (Also minor: `commitCurrentSlide` and `_commitWithOldSlide` duplicate the locked-preload block — acknowledged in a code comment.)

**RI-012 — confirmed fail-safe.** `getNextVerse`/`getPreviousVerse` return `null` on a missing chapter **or** missing verse (`bibleRepository.ts:~486, ~494, ~538, ~546`), with "Fail safe: never guess a nearby verse." Covered by `verseNavigation.test` G and the `'99'` cases.

---

## 7. Test Inventory & P0 Coverage Gaps

**Covered well:** navigation (opaque/lettered/non-contiguous/boundaries/fail-safe/translation-structure), recovery (save/restore/invalid/stale/version/index-clamp/blank/translation-no-fallback/persist-fail/bounded), service-plan loading + ranges + fail-safe, reference resolution + ambiguity + keyword + "missing translation doesn't fall back," keyboard semantics (Escape fall-through, arrows+broadcast, empty-input, modifier guard, typing-field guard, undo sync, service-plan pass-through).

**P0 gaps to fill (this is the P0 test-foundation backlog):**
- **`bibleNormalizer` has no dedicated test file** → add RI-040 (verbatim text, incl. whitespace/line-breaks) and RI-041 (determinism: same input → same output; `numericKeyCompare` "10" after "9").
- **RI-003 locked-projection** → assert a nav action while `projectionLocked` does **not** emit `COMMIT_PASSAGE`.
- **RI-016 isolation** → assert loading TB does not mutate TA's data.
- **RI-020 sync-loss** → simulate `getChannel().postMessage` throwing; operator state must remain intact.
- **RI-043 translation-boot isolation** → currently would *fail* (Promise.all); test belongs with the fix.
- **RI-002 replica** → `Projection.tsx` cold-start (`REQUEST_STATE`/`STATE_RESPONSE`) and render-on-commit are untested.
- **`broadcastSync`** has no direct test (heartbeat, state-response, SYNC).

---

## 8. Discrepancies & Undocumented Behavior

- **Search (MCD §8).** Documented as a linear scan; actually tiered with a prebuilt `semanticIndex.json`. Update the doc, or note the index as an accepted optimization.
- **Committed docs vs our chat drafts.** `docs/MCD.md` and `docs/RELIABILITY & INVARIANT SPECIFICATION.md` are in the repo but I have **not** diffed them against the versions we drafted in chat — they may differ. Confirm which is canonical before Freebuff treats any as truth.
- **Doc location split.** Teardown + Audit at root; the rest under `docs/`. Pick one home to avoid drift (RI-053).
- **Protocol versioning (§20).** `BroadcastMessage` union (`broadcastSync.ts:73–82`) has **no `version` field**; recovery snapshots **do** (`RECOVERY_VERSION`). Blank settings migrate by key-merge with no version.
- **Lovable residue.** `lovable-tagger` in devDeps; `loadFromZip` legacy compat shim in the repo. Harmless, flag for eventual cleanup.
- **`getTranslationDisplayName` "fallback".** Falls back to the *code string* for display only (`translationMetadata.ts`) — a label fallback, **not** a data fallback. Not an RI-014 violation.

---

## 9. Risk Register

| # | Risk | Evidence | Invariant | Severity |
|---|---|---|---|---|
| R1 | Operator-facing `localStorage` writes are unguarded; a quota/private-mode error throws into the UI mid-service | §5 (recents, `saveServices`, `saveBlankSettings`) | RI-022/043 | **P1** |
| R2 | Translation preload is all-or-nothing | `preloadAllTranslations` → `Promise.all` | RI-043 / §24.3 | **P1** |
| R3 | No operator singleton/lease → competing writers possible | no code enforcing it | RI-001 / §21 | **P1** |
| R4 | Broadcast protocol unversioned → future schema change breaks window compatibility | `broadcastSync.ts:73–82` | §20 | **P1** |
| R5 | Boundary-crossing logic duplicated (repo primitive vs `goToNextChapter`) can drift | §6 | RI-051 | P2 |
| R6 | `persistProjectionState`/`saveBlankSettings` guarded only by caller discipline | `broadcastSync.ts:69,149` | RI-022 | P2→P1 if reused |
| R7 | Docs split across two homes / possible drift from chat drafts | §8 | RI-053 | P2 |

---

## 10. Open Questions for You

1. **Canonical docs:** are `docs/MCD.md` and `docs/RELIABILITY & INVARIANT SPECIFICATION.md` the same as what we drafted in chat, or older/edited? Should I diff them and reconcile before the P0 test work?
2. **P0 test ordering:** given the green baseline, do we fill the *test gaps* first (normalizer RI-040/041, locked-projection RI-003, sync-loss RI-020) before touching any code — i.e. lock down behavior — and only then do the R1/R2 reliability fixes with their regression tests attached?
3. **Storage hardening scope:** when we fix R1, do you want the single `safeLocalSet` helper + guards-moved-into-functions approach, or minimal per-site try/catch to keep the diff tiny?
4. **`.impeccable` / `.freebuff` config:** want me to read those (and `docs/VERIFICATION-RULES.md`, `CONSTRAINTS.md`) so the prompts I write for each agent match the conventions already committed?

---

*No code was modified in producing this report.*

# START HERE — Wordde audit remediation

**Read this first. It is the entry point to the audit; the detail lives in
[Wordde_Audit_Handoff_2026-10-13.md](Wordde_Audit_Handoff_2026-10-13.md).**

You are a coding agent picking up remediation work on the Wordde codebase from a completed
read-only audit (2026-10-13, branch `main`). This file tells you what to read, what to check
before you touch anything, the order to work in, and the three things in this repo that will
mislead you if nobody warns you.

> **Current status (updated 2026-10-13, after remediation).** The **P0 correctness block — audit
> fixes #1–#6 — is landed but uncommitted.** `npm run typecheck` exits 0, `npm run lint` is at
> **6 errors / 14 warnings**, `npx vitest run` is **27 files / 224 tests passing**, and
> `npx vite build` exits 0. Start from **P1** in the audit's §9 work queue. **Trap 1 below is
> resolved** and kept only as history; traps 2 and 3 still apply (lint is still red, tests are
> still green). The audit's §9 table carries a per-fix status column.

---

## 0. Your first 30 minutes

Read in this order. Do not skip step 1 — the repo's own contract requires it.

1. **`../AGENTS.md`** — the durable contract. §0 lists six documents you must read before writing
   any code (`MCD.md`, `RELIABILITY & INVARIANT SPECIFICATION.md`, `CONSTRAINTS.md`,
   `VERIFICATION-RULES.md`, `System Teardown.md`, `ARCHITECTURE.md`). §3 lists the hard rules,
   §4 the protected files, §5 the completion report every task must end with.
2. **`Wordde_Audit_Handoff_2026-10-13.md` §0 → §2.** Four minutes. §0 tells you about the trap in
   §3 below; §2 is the raw evidence log.
3. **`Wordde_Audit_Handoff_2026-10-13.md` §8 (decisions) and §10 (limitations)** — so you know
   which findings are *proven* and which are *reasoned*. Fixes #7–#11 rest on structural
   reasoning, not measurement.

Everything after that is reference. §9 is the work queue; §3–§7 are the findings with `file:line`.

---

## 1. The three traps — all of them will mislead you

### Trap 1 — the typecheck in `AGENTS.md` cannot fail — **RESOLVED (fix #1/#2)**

> This is history. `package.json` now defines `"typecheck": "tsc -b"`, `.gitignore` covers
> `*.tsbuildinfo`, `AGENTS.md` §2 mandates `npm run typecheck`, and the 12 errors are fixed. It is
> kept because it explains why the rest of the audit was written against a gate that looked green.

`npx tsc --noEmit` exits **0**. It is a **no-op**: the root `tsconfig.json` sets `"files": []` and
only lists project references, so non-build mode compiles *zero files*.

> **The real check is `npx tsc -b`. On a clean checkout it exits 2 with 12 genuine errors.**

Two operational notes, both observed directly:

- It writes `tsconfig.app.tsbuildinfo` and `tsconfig.node.tsbuildinfo` to the repo root, and
  `.gitignore` does **not** cover them (`git check-ignore` confirms). Add a `*.tsbuildinfo` rule
  before adopting this gate. `--noEmit` does **not** avoid this.
- A **cold** run takes minutes (it exceeded a 240 s budget during the audit). That cost is
  plausibly why the no-op went unnoticed. Think before wiring it into a pre-commit hook.

### Trap 2 — lint is already red

`npm run lint` exits **1** with **6 errors and 14 warnings**. That is the *starting* state, not
something you broke. (The `react-hooks/exhaustive-deps` warning on `Projection.tsx:258` was the
codebase's most serious bug — audit fix #3 — and is now **gone**; the remaining 6 errors are
fix #15.) Do not silence what is left.

### Trap 3 — the tests are already green

`npx vitest run` exits **0** with **27 files, 224/224 passing**, ~27 s. If you see red, you caused
it. (An earlier audit run showed one flake; it is load-sensitivity — `vitest.config.ts` sets no
`testTimeout` against Vitest's 5 s default — not a broken test. If it reappears, raise the timeout;
do not weaken the assertion.)

---

## 2. Pin the baseline before you change a line

Record all five so you can prove what you moved:

| Command | Expected on a clean checkout |
|---|---|
| `npm run typecheck` (`tsc -b`) | **exit 0** — the 12 errors are fixed (was exit 2 / 12 errors before #1–#2) |
| `npx eslint .` | **exit 1** — 6 errors, 14 warnings |
| `npx vitest run` | **exit 0** — 27 files, 224/224, ~27 s |
| `npx vite build` | **exit 0** — one `index-*.js` ≈ 624 kB, plus a chunk-size warning |
| `git status --short` | modified app/test/doc files from the P0 fixes, plus the untracked new `docs/` and `scripts/` |

Report these five results *before* your first change.

---

## 3. Work order

Work the P0 block first, **one fix per branch**, in the numbered order from
`Wordde_Audit_Handoff_2026-10-13.md` §9. Each row there carries its own verification command —
use it, don't invent one.

### Start here: ~~fix #1 before anything else~~ — **DONE; begin at P1**

~~Add a real `typecheck` script (and a `*.tsbuildinfo` ignore rule) and make it the mandated
check.~~ Landed. The reasoning is kept because it still governs #12: a real `tsc -b` gate now
exists (and the 12 errors behind it are fixed), so #12's "turn the strict flags on and let the
compiler find the dead code" is now safe to do — it was not before.

### The P0 block (correctness) — **all six landed**

The rows below are complete; the audit's §9 table records each fix's status and evidence.

| # | Fix | Verified by |
|---|---|---|
| 1 | Real `typecheck` script + ignore rule + update `AGENTS.md` §2 | `npm run typecheck` now fails, then fix the 12 errors |
| 2 | Fix the 12 errors the real check uncovers | `npx tsc -b` → exit 0 |
| 3 | Object-URL stale closure in the projection window + unmount revoke | the lint warning at `Projection.tsx:258` disappears |
| 4 | Error boundaries for the operator and projection routes separately | throw deliberately in a child; the other route must survive |
| 5 | Replace `getNearbyPassages` verse arithmetic with `getNextVerse`; thread the translation | `bibleNormalizer.test.ts`, `verseNavigation.test.ts`; add a `3a` case |
| 6 | Guard the three raw `localStorage` reads | `persistenceGuards.test.ts` |

Then P1 (performance), P2 (hygiene), P3 (product) — §9 of the audit, with file targets and effort.

---

## 4. Guardrails

### Re-verify each finding before you fix it

The audit is a **snapshot** on `main` at a point in time. It is evidence-based, but the audit
itself already caught one of its own earlier claims being wrong (a phantom set of root residue
files). Treat §3–§7 as strong leads with precise citations, not gospel. Confirming one takes
seconds; the citations are exact enough to check.

### Protected files — get permission, don't ask forgiveness

`AGENTS.md` §4 / VF-100: **`src/core/bibleNormalizer.ts`, `src/core/broadcastSync.ts`,
`src/core/types.ts`** are protected. Change only with explicit justification in the task prompt.

**Two planned fixes hit protected ground:** fix #15 (the two `no-empty` errors are in
`broadcastSync.ts`) and fix #18 (the `pwa/sw.js` mid-service guarantee). Flag the conflict
*before* editing, or surface it instead of proceeding.

Never edit (VF-101): `docs/ARCHITECTURE.md`, `CONSTRAINTS.md`, `DEVELOPMENT.md`,
`VERIFICATION-RULES.md`, and `public/data/*.zip`.
Expected to keep current (RI-053): **`System Teardown.md`** — fix #17 exists because its §5.12
still says the settings menu has "exactly three items" when the code and its own test say four.

### Do NOT "fix" these — each looks like a smell and is load-bearing

- **The 3 s `broadcastSync` interval** in `../src/components/operator/ProjectionControl.tsx`. That
  is the self-healing re-assertion (Teardown §5). Removing it removes dropped-message recovery.
- **The search field's key handling.** Fix #8's debounce must wrap the *query → results*
  computation, never the arrow / Enter / Escape path. Two shipped defects are documented in
  Teardown §5.11 for exactly this: Escape must always forward, and every commit must release
  focus. Run `../src/test/searchInputKeys.test.tsx` and `keyboardShortcut.test.tsx` after any
  change here.
- **`globalTeardown` in `playwright.config.ts`.** It exists because the e2e suite leaks a process
  holding port :4174.
- **Fix #3's tempting shortcut:** adding `assetUrls` to the effect's dependency array silences the
  lint warning and makes the leak worse (it re-subscribes the broadcast channel on every asset
  change). Use a ref.

### Also don't do this

- No opportunistic cleanup in the same commit as a fix — "smallest coherent change" is the repo's
  own golden rule (`DEVELOPMENT.md` §2).
- Don't run `npm run test:e2e` casually: it runs `vite build && vite preview` on :4174 with a
  180 s per-spec budget. It is currently **unrun** and is the only way to verify the service-worker
  finding (#18) — see §6.

---

## 5. Definition of done

`AGENTS.md` §5 (MCD §26, Phase H). Per fix:

1. The fix's own verification command from §9 passes.
2. The affected tests are re-run **after** the edit — a green suite from before your change proves
   nothing about it.
3. `System Teardown.md` updated wherever your change altered implementation reality (RI-053).
4. The Phase H completion report: what changed and why; files added/modified/deleted; invariants
   affected; tests added/modified; `tsc` / `test` / `build` results; known limitations; teardown
   sections updated; new technical debt; decisions future agents must preserve.
5. As you land fixes, mark them in `Wordde_Audit_Handoff_2026-10-13.md` §9 so the audit stays
   alive as a tracker instead of decaying into a stale document.

---

## 6. Known blockers and open limitations

- ~~The e2e suite has never been run.~~ **Now run in full and green:** `npm run test:e2e` →
  24 tests, exit 0, 2.0 m (four specs, production build). `e2e/projection-hardening.spec.ts` is new
  and proves #3's revoke and #4's containment in a real Chromium.
- **But green e2e does not close #18.** No spec exercises a *mid-service deploy* swapping the
  service worker under an open client — the offline spec tests an offline reload instead. The
  `skipWaiting`/`claim` claim in `pwa/sw.js` is still unverified, and fix #18 is where "not
  verified" becomes a real blocker rather than a footnote.
- **The performance findings (#7–#11) are structural, not measured.** No browser profiling was
  done. To turn them into numbers: run the built app, throttle CPU 4×–6× (representative of the
  donated laptops named in `PRODUCT.md`), type a six-character reference, and record scripting time
  and long-task counts before and after each fix.
- **The §3.1 memory leak is proven at the code level but its growth rate is unmeasured.** To
  measure: open the projection window, trigger N asset reloads, and count live blob URLs.
- **The `strictNullChecks` explanation for the `bibleDecodeClient.ts:59` error is inferred.** The
  error is verified; the mechanism is the most likely cause.
- `Wordde_Audit_Handoff_2026-10-13.md` §10 holds the full list — read it before citing the audit
  as authority on anything.

---

## 7. Where the detail lives

| You need | Read |
|---|---|
| The work queue with effort and file targets | [Wordde_Audit_Handoff_2026-10-13.md](Wordde_Audit_Handoff_2026-10-13.md) §9 |
| Evidence for a specific finding | that doc, §3–§7 (each cites `file:line`) |
| What was and wasn't proven | that doc §8 and §10 |
| The earlier independent audit + corrections | [Wordde_Codebase_Audit_2026-10-13.md](Wordde_Codebase_Audit_2026-10-13.md) |
| The repo's rules and invariants | `../AGENTS.md`, then the six documents it lists in §0 |

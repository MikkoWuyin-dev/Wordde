# AGENTS.md — Wordde

Standing instructions for **every** coding agent working in this repo (Freebuff/Codebuff, Claude Code, Codex, etc.). Read this file at the start of every session, before any implementation. Task-specific detail comes in the prompt; this file is the durable contract.

---

## 0. Required-reading gate — do this before writing or changing ANY code

You may not propose or make a code change until you have read, in this order:

1. `docs/MCD.md` — what Wordde is; architecture philosophy; how agents must work here.
2. `docs/RELIABILITY & INVARIANT SPECIFICATION.md` — invariants RI-001…RI-061 you must never break.
3. `docs/CONSTRAINTS.md` — the inviolable NEVER / ALWAYS rules.
4. `docs/VERIFICATION-RULES.md` — the checks your change must pass (VF / VP / VT / VB / VC).
5. `System Teardown.md` — the current implementation reality.
6. `docs/ARCHITECTURE.md` — deep design; required when the change touches state, data, sync, or recovery.

If the task conflicts with anything in these documents, **STOP and surface the conflict** instead of proceeding.

## 1. The golden rule (see DEVELOPMENT.md §2)

Plan → Prompt → Verify → Review → Test → Commit. Make the **smallest coherent change**. Do no unrelated cleanup. A passing build is **not** proof of correctness — only tests plus runtime verification are.

## 2. Project facts

- Stack: React 18 + Vite + TypeScript + Zustand + Tailwind/shadcn. No backend, no env files, offline-first.
- Desktop-only (the operator app refuses to render below 768 px).
- Run: `npm install --no-audit --no-fund`, then `npm run dev` (serves on **port 8080**).
- Checks that must all pass before you call a task done: `npx tsc --noEmit`, `npm test`, `npm run build`.

## 3. Hard rules (ordered by how easily they get violated)

- **Verse text is verbatim** — never `trim`/`replace`/`normalize`/case-change scripture (VF-001).
- **No translation fallback** — missing data returns empty/null, never another translation (VF-002).
- **No verse arithmetic** — navigate by array index off the real key, never `parseInt(verse)+1` (VF-003).
- **Projection window is read-only** — it never writes the Zustand store (VF-004).
- **Wrap every `localStorage` write in try/catch** — persistence failure must never break projection (VF-005).
- **Offline-first** — no network calls for Bible data; only `fetch('/data/*.zip')` is allowed (VP-004).
- **One commit funnel** — normal projection goes through `projectSlide`; don't mutate projection state around it.

## 4. Files you must NOT edit

- `docs/ARCHITECTURE.md`, `docs/CONSTRAINTS.md`, `docs/DEVELOPMENT.md`, `docs/VERIFICATION-RULES.md` — human-maintained (VF-101). Never modify.
- `public/data/*.zip` — curated Bible source data. Never modify.
- `src/core/bibleNormalizer.ts`, `src/core/broadcastSync.ts`, `src/core/types.ts` — protected (VF-100). Change only with explicit justification and review in the task.
- `docs/MCD.md`, `docs/RELIABILITY & INVARIANT SPECIFICATION.md` — canonical and slow-moving. Change only when an invariant or decision is formally added/changed/retired, never casually.
- **`System Teardown.md` is the one doc you are expected to keep current** — update it whenever your change alters implementation reality (RI-053).

## 5. Every task ends with a completion report (MCD §26, Phase H)

State: what changed and why; files added/modified/deleted; invariants affected; tests added/modified; verification results (`tsc` / `test` / `build`); known limitations; System Teardown sections updated; new technical debt; decisions future agents must preserve.

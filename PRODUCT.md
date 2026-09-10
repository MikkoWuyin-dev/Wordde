# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Volunteer A/V operators at the owner's local church — often rotating weekly, with low technical skill and zero time to debug once a service starts. One laptop drives one HDMI-connected TV or projector. Setup happens minutes before a service.

The product is for this one local church. It is not intended for public distribution or other churches (owner-confirmed).

## Product Purpose

Offline-first Bible verse lookup and projection: the operator types a reference (e.g. `John 3:16`), presses Enter, and the verse appears on the second screen in under a second — with no internet connection, no installation, and no operator UI ever visible to the congregation. Success is a service that runs flawlessly with a first-time volunteer at the controls.

## Positioning

Strips away the complexity of conventional presentation software: a pure client-side SPA that bundles five Bible translations (KJV, NIV, NKJV, NLT, AMP) as static assets and projects through a second browser window over BroadcastChannel. No server, no database, no license-bound install — which a neighboring product with a backend or per-seat licensing could not truthfully copy.

## Operating Context

- Two physical screens, one browser: an operator window (`/`) and a projection window (`/projection`) dragged to the second display and fullscreened (F11).
- Live-service rhythm: search → preview → project → arrow through verses; `N` steps a prepared Service Plan; `B` blanks between segments; mid-service translation switches.
- Buildings with no reliable internet; hardware is often donated, low-spec laptops.
- Rotating volunteers mean onboarding, contextual hints, and the guided projector-setup dialog are load-bearing, not decoration.

## Capabilities and Constraints

Confirmed functionality: reference/keyword/semantic search with ranked results; BibleNavigator browse (book → chapter → verse); Service Plan (ordered, editable, persisted); recent passages (cap 15); undo of last passage; verse-by-verse navigation that extends the queue across chapter/book boundaries; blank screens in four styles (black, logo, soft background, session card) with five default session screens; image uploads (logo + up to 7 backgrounds, 10 MB max, IndexedDB); auto-fit verse rendering; progressive onboarding with replay; two-window sync with heartbeat + 3 s re-assertion + localStorage cold-start recovery.

Constraints:
- Fully offline; all Bible text ships as static ZIP assets in `/public/data/`. No API, no backend, no auth.
- Desktop only: below 768 px the app refuses to render (a phone cannot drive a projector).
- Scripture text is verbatim — the normalizer performs zero text transformation.
- Single operator window and single projection window per origin are assumed.
- Sub-second projection is a hard requirement; all five translations preload into memory at boot (3–5 s boot, ~60–100 MB heap — a deliberate trade).

Known weak points are documented in `System Teardown.md` (owner's notes, spot-verified against code where load-bearing: 768 px block, boot preload, background cap, blank styles).

Open / undecided:
- **More translations** are planned (owner-confirmed). Everything else in the teardown's improvement list (Web Worker decode, inverted keyword index, remote control, etc.) is aspiration, not commitment.
- Translation licensing terms (NIV, AMP, NLT) have not been reviewed; with local-church-only scope this is not currently a blocker.

## Brand Commitments

- Product name: **Wordde** (as in `index.html` title and meta tags).
- Voice: simplicity-first, volunteer-respectful — copy in the UI explains in plain terms, never assumes technical vocabulary.
- Brand direction: progressive rebrand from Scripture Ray to Wordde; user-facing copy should use "passage" rather than "verse" where contextually appropriate.

## Evidence on Hand

- `System Teardown.md` — a detailed architecture and product rationale document written by the owner. Treated as informed notes, not gospel; specific claims should be verified in code when they matter.
- Five translation ZIPs and a semantic index under `public/data/` (real, bundled data).
- No screenshots, testimonials, press, or marketing assets. Do not fabricate any.

## Product Principles

1. **Correct scripture over convenience.** A wrong verse in front of a congregation is the worst possible failure; fail visibly (blank result, warning) rather than incorrectly.
2. **Zero-setup reliability.** No internet, no install, no account; the projector path must survive crashes, refreshes, and dropped messages on its own.
3. **Speed under service pressure.** Every operator interaction is timed against a live congregation; projection is sub-second, boot is the only acceptable wait.
4. **Recovery over prevention.** Volunteers make mistakes; undo, state restore, and self-healing sync are the safety net, not operator training.
5. **Scope discipline.** One church, one operator, one projector — depth and polish beat feature surface.

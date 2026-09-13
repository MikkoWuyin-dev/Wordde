Wordde — Master Context Document (MCD)

Document status: Living project context
Audience: Freebuff, Impeccable, human developers, and future AI coding agents
Purpose: Establish the product, architectural, engineering, and workflow context that should remain stable across future iterations.

1. Project Identity

Project: Wordde

Wordde is an offline-first Bible verse search and projection web application designed primarily for use by a local church during live services.

Its core operating scenario is deliberately narrow:

One laptop runs the operator interface. The laptop is connected by HDMI to a TV/projector. The operator controls what is displayed, while the audience sees only the dedicated projection window.

Wordde is not currently a multi-tenant SaaS platform, cloud Bible service, church-management platform, or collaborative presentation system.

The primary objective is:

Reliable operation during a live church service.

A first-time volunteer operator should be able to use Wordde without needing to understand its internal architecture.

2. Product Philosophy
2.1 Reliability over novelty

A simple feature that works reliably during a live service is more valuable than a sophisticated feature that introduces fragile state or synchronization behavior.

2.2 Incremental evolution over rewrites

The existing architecture is fundamentally sound.

Do not rebuild the application merely because individual modules are large or imperfect.

Prefer targeted improvements that:

solve a demonstrated problem;
preserve working behavior;
add regression protection;
reduce future risk;
and remain understandable to future developers and AI agents.
2.3 Offline-first by design

Core Bible search, navigation, projection, and service operation must not depend on an internet connection.

Network services must not become accidental runtime dependencies for core functionality.

2.4 Operator authority

The Operator window is authoritative.

The Projection window is a replica.

This distinction is fundamental and must be preserved unless an explicit architectural decision changes it.

2.5 Domain correctness

Bible data is not generic application data.

Verse keys, chapter boundaries, book boundaries, translation identity, and source fidelity must be handled carefully.

Do not assume that all verse identifiers are numeric or contiguous.

2.6 Evidence-driven engineering

Do not optimize or refactor merely because something looks theoretically inefficient.

First understand:

current behavior;
actual failure mode;
relevant scale;
regression risk;
and the product impact.

Then make the smallest justified change.

3. Current Technology Stack

Wordde is a React/Vite/TypeScript single-page application.

Primary technologies include:

React 18
TypeScript
Vite
Zustand
Vitest
React Testing Library
Tailwind CSS
Radix/shadcn UI components
JSZip
IndexedDB for local binary assets
Browser BroadcastChannel for operator/projection communication
localStorage for persistence and recovery state
Static Bible ZIP assets served from /public/data/

The project currently has:

no backend;
no authentication system;
no application database;
no requirement for cloud connectivity for core operation.

Do not introduce infrastructure that is not required by the current product.

4. Runtime Topology

Wordde has two important browser contexts.

4.1 Operator Window

The Operator window:

owns application state;
receives user input;
searches and navigates Bible data;
controls projection;
manages Service Plan behavior;
controls blank/session screens;
and initiates synchronization.

It is the authoritative state writer.

4.2 Projection Window

The Projection window:

displays the current presentation state;
receives synchronized state/commands;
renders verses and session/blank screens;
and must not become an independent source of truth.

The Projection window may maintain local React state for rendering, but it does not authoritatively control the application state.

4.3 Communication

The two windows communicate through the established BroadcastChannel synchronization layer.

Persistence and cold-start reconciliation provide additional resilience when windows are opened or refreshed.

5. State Ownership

src/core/stateManager.ts is the central state-management authority for projection-related behavior.

It coordinates behaviors including:

current navigation;
slide queue;
live/committed projection;
history;
recent passages;
translation;
blank state;
projection lock;
Service Plan interactions;
persistence;
recovery;
synchronization.

The size and responsibility of this module are recognized maintainability risks.

However:

Complexity alone is not sufficient justification for replacing the state manager.

Future changes should first establish the specific problem and then reduce complexity incrementally.

6. Bible Data Architecture

Wordde uses normalized Bible data so the rest of the application operates against a consistent structure.

The canonical conceptual model is:

Verse
  verse: string
  text: string

Chapter
  chapter: string
  verses: Verse[]

BibleBook
  book: string
  chapters: Chapter[]
6.1 Critical Data Rule

Verse and chapter identifiers are strings.

Do not convert them to numbers merely for convenience.

Source data may contain:

non-contiguous verse identifiers;
lettered verse identifiers;
source-specific keys.

Navigation must therefore operate against actual normalized arrays and keys rather than assuming mathematical continuity.

6.2 Normalization Boundary

src/core/bibleNormalizer.ts is the boundary responsible for understanding source JSON structures.

It should remain the area that understands peculiarities of individual source formats.

The rest of the application should consume normalized Bible data.

6.3 Repository

src/core/bibleRepository.ts provides read-only, translation-aware access to Bible data.

Important principles:

translation identity must be explicit;
source data must not silently fall back to another translation;
duplicate books are handled deterministically;
normalized data is exposed to consumers;
supported translations are currently preloaded during startup.
7. Current Translation Set

The current supported translations are:

KJV
NIV
NKJV
NLT
AMP

Translation switching is an explicit application operation.

A requested translation must never silently substitute another translation when unavailable.

Any future translation addition must preserve this principle.

8. Search Architecture

Bible search is currently implemented through a pure search/ranking layer.

The current implementation scans the verse corpus linearly.

This is acceptable at the current scale.

The corpus is on the order of tens of thousands of verses, so an inverted search index should only be introduced if measurement demonstrates that the current implementation has become a meaningful bottleneck.

Do not prematurely introduce complex search infrastructure.

9. Projection Model

The projection system is built around a slide/queue model.

The application distinguishes between:

navigation/preview state;
current live projected slide;
committed passage state;
presentation history.

Normal projection should pass through the established projection commit funnel rather than independently manipulating individual pieces of projection state.

Projection operations may affect:

live slide state;
queue/index state;
history;
recents;
persistence;
recovery;
BroadcastChannel synchronization.

When modifying projection behavior, inspect the complete transition rather than changing a single setter in isolation.

10. Projection Reliability Model

Wordde currently uses several complementary mechanisms:

BroadcastChannel messages for active synchronization.
Periodic synchronization/heartbeat behavior.
Projection-window readiness signaling.
Cold-start state requests/reconciliation.
localStorage persistence.
Recovery snapshots for active projection/navigation state.

These mechanisms are pragmatic for the current one-laptop/one-projection-window operating model.

Do not replace them with substantially more complicated distributed-state architecture without a demonstrated need.

11. Recovery

Wordde has a recovery snapshot mechanism intended to preserve important active-session state across reload/crash-like interruptions.

Recovery state includes relevant information such as:

queue;
active/live indexes;
committed passage;
translation;
blank state;
projection lock;
history.

Recovery snapshots are validated and treated as potentially stale.

Restoration should restore local application state without accidentally re-broadcasting it as a new projection command.

Preserve the distinction between:

restoring local application state

and

intentionally projecting a new state.

12. Verse Navigation

Verse navigation must be position-based and data-driven.

Do not use arithmetic assumptions such as:

currentVerse + 1
currentVerse - 1

Instead:

Locate the current chapter using its exact key.
Locate the current verse using its exact key.
Move to the next/previous element in the actual verse array.
Cross chapter boundaries using actual chapter ordering.
Cross book boundaries using actual book/chapter ordering.

This is a critical correctness rule.

It protects against:

lettered verses;
missing verse numbers;
non-contiguous source data;
translation-specific structure.
13. Projection Lock

Projection Lock allows the operator to modify/preview navigation without immediately changing what the audience sees.

This separation between:

operator exploration

and

audience-visible projection

is an important product behavior.

Any change to navigation or commit behavior must explicitly account for locked versus unlocked projection state.

14. Service Plan

Service Plan is a persistent, editable presentation sequence.

It supports:

adding passages;
editing passages;
reordering;
progressing through planned passages;
persisted plan state.

Legacy Service Plan state is migrated where applicable.

Keyboard behavior associated with Service Plan must remain distinct from general passage navigation.

Do not reintroduce removed global commands merely because a similar shortcut exists elsewhere.

15. Recent Passages

Recent Passages provide quick access to previously used references.

Current behavior includes:

duplicate avoidance;
capped history;
entries from relevant passage-selection flows;
deletion/confirmation behavior.

Changes must preserve predictable history semantics.

16. Blank and Session Screens

Wordde supports blank/projection interruption states including:

black;
logo;
soft;
session-oriented screens.

User-provided visual assets are stored locally through IndexedDB rather than requiring network access during service operation.

Any changes to this subsystem must consider:

browser storage failure;
missing assets;
stale object URLs;
projection-window synchronization.
17. Rendering

Projection rendering is designed for presentation readability rather than general web-page layout.

The verse region is measured for auto-fit while fixed metadata is handled separately.

Font sizing adapts to the available projection region.

Future visual changes must not sacrifice:

readability;
predictable fitting;
projection aspect-ratio behavior;
reliable rendering on the target display.
18. Keyboard and Input Architecture

Keyboard input is important during live-service operation.

Existing behavior includes shortcuts for:

committing;
next/previous navigation;
chapter navigation;
blanking;
Service Plan progression.

When modifying keyboard behavior:

Inspect global listeners.
Inspect component-specific listeners.
Check event propagation.
Check focused-input behavior.
Check conflicts between global and contextual commands.

Avoid introducing shortcut collisions.

19. Persistence

Wordde uses browser-local persistence for operational state.

Important persisted areas include:

projection state;
recovery state;
Service Plan;
blank/session settings;
locally stored visual assets.

Persistence is best-effort rather than equivalent to transactional durable storage.

A known reliability concern is inconsistent failure isolation around localStorage writes.

Future persistence work should:

isolate storage failures;
prevent storage errors from taking down live projection;
make degraded behavior explicit and safe.

Do not assume browser storage operations can never fail.

20. Cross-Window Synchronization

BroadcastChannel is the current transport for same-origin Operator/Projection communication.

The protocol includes operations such as:

passage commits;
blank/unblank;
clearing;
synchronization;
heartbeat;
projection readiness;
state requests/responses;
asset reload signaling.

The synchronization system is pragmatic rather than formally distributed.

Known limitations include:

no formal ACK/retry protocol;
unversioned message schemas;
possibility of multiple operator windows.

These limitations should be addressed as deliberate reliability work, not accidentally through unrelated features.

21. Single-Operator Assumption

Wordde currently assumes one authoritative Operator window.

The application does not yet enforce an operator-window singleton.

Multiple Operator windows can therefore create:

competing writers;
conflicting broadcasts;
divergent local histories.

This is a recognized reliability risk.

Future work should consider an explicit operator singleton/lease mechanism before treating multiple Operator windows as safely supported.

Do not accidentally design new features as though multiple Operator windows are already safely supported.

22. Testing Philosophy

Testing currently requires significant improvement.

The primary goal is not maximum line coverage.

The goal is executable proof of Wordde's critical behavioral invariants.

Priority areas include:

projection state transitions;
navigation correctness;
recovery behavior;
synchronization behavior;
persistence failure handling;
translation isolation;
Service Plan behavior;
critical user flows.

Tests should emphasize failure modes and invariants, not only happy paths.

23. Reliability Priorities

Unless a production issue dictates otherwise, the preferred engineering order is:

P0 — Proof of Correctness

Establish strong automated tests around critical state and domain behavior.

P1 — Reliability Hardening

Address demonstrated risks such as:

persistence failure isolation;
translation-load isolation;
operator singleton enforcement;
synchronization hardening;
other live-service failure modes.
P2 — Maintainability

Reduce unnecessary complexity and technical debt after behavior is protected by tests.

P3 — Performance

Optimize measured bottlenecks.

P4 — UX / Visual Refinement

Improve visual design and interaction quality without destabilizing the functional foundation.

24. Known Architectural Risks
24.1 State Manager Complexity

stateManager.ts is large and coordinates many responsibilities.

Risk: transition complexity, accidental coupling, regression difficulty, AI-agent modification risk.

Response: add tests first, then refactor incrementally.

24.2 Persistence Failure Isolation

Some persistence operations are guarded while others can still throw.

Risk: browser storage failures can escape into live application behavior.

Response: establish a consistent safe persistence boundary.

24.3 Translation Boot Isolation

Multiple translations are currently preloaded together.

Risk: one translation-load failure can affect overall startup.

Response: consider independent translation-load isolation where justified.

24.4 Multiple Operator Windows

Risk: competing writers, conflicting broadcasts, divergent histories.

Response: introduce an operator singleton/lease mechanism if multi-window protection becomes a priority.

24.5 Protocol Versioning

Broadcast messages currently lack a formal protocol version.

Risk: future schema changes may create compatibility problems between windows.

Response: version the protocol before substantial message-schema evolution.

24.6 Legacy/Duplicate Pathways

Some historical pathways and abstractions remain.

Risk: future agents may modify the wrong implementation path.

Response: identify, test, then remove or consolidate deliberately.

24.7 Documentation Drift

Historical technical documentation can become inaccurate after implementation changes.

Response: System Teardown.md is a living document and must be updated as part of task completion.

25. Important Things Not to Do

Do not:

rewrite the application without a demonstrated architectural need;
replace the current state model casually;
introduce a backend simply because it appears more sophisticated;
add network dependencies to core offline functionality;
assume verse numbers are contiguous integers;
silently fall back between translations;
let the Projection window become a second source of truth;
bypass established projection commit pathways without understanding their side effects;
modify persistence without considering failure behavior;
optimize based only on theoretical complexity;
perform broad refactors without regression tests;
remove seemingly redundant code without understanding the invariant it may protect;
treat successful compilation as proof of behavioral correctness;
treat a passing happy-path test as proof of reliability;
allow System Teardown.md to become stale;
make large batches of unrelated changes in one implementation task.
26. Engineering Workflow for AI Coding Agents

Every implementation should follow this sequence unless the task explicitly requires otherwise.

Phase A — Reconnaissance

Inspect:

relevant source files;
relevant tests;
relevant documentation;
existing architectural patterns;
related state flows.
Phase B — Risk Analysis

Identify:

affected invariants;
failure modes;
regression risks;
edge cases.
Phase C — Plan

Define the smallest coherent implementation.

Do not begin unrelated cleanup.

Phase D — Implementation

Make the change incrementally.

Keep modifications reviewable.

Phase E — Testing

Add or update tests for:

intended behavior;
important edge cases;
meaningful failure modes.
Phase F — Verification

Run appropriate:

tests;
build;
lint;
manual runtime checks.
Phase G — Documentation

Update System Teardown.md so it accurately describes the resulting system.

Phase H — Completion Report

Every completed task must report:

What changed.
Why it changed.
Files modified/added/deleted.
Architecture/behavior affected.
Tests added/modified.
Verification results.
Known limitations.
System Teardown sections updated.
New technical debt.
Architectural decisions future agents must preserve.

A task is not complete until all applicable phases are finished.

27. Documentation Hierarchy

Wordde intentionally uses different documents for different purposes.

Master Context Document

This document.

Purpose:

product identity;
architectural philosophy;
important constraints;
long-lived decisions;
engineering workflow.

It should change relatively slowly.

System Teardown

Purpose:

detailed current-state technical record;
implementation structure;
current modules;
flows;
technical debt;
implementation details.

It should change whenever implementation materially changes.

Reliability & Invariant Specification

Purpose:

explicit non-negotiable behavioral rules;
state invariants;
data correctness requirements;
synchronization guarantees;
recovery rules;
testable reliability properties.

It should evolve when an invariant is formally added, changed, or retired.

Senior Engineering Audit

Purpose:

independent critique;
architectural assessment;
risk identification;
prioritization.

It is not the daily source of truth for implementation details.

28. Change Discipline

Every change should have a clear reason.

Before implementation, ask:

What problem does this solve?
Is the problem real and demonstrated?
What existing behavior could this break?
Which invariant does it affect?
What tests prove it works?
What happens when it fails?
Does the documentation remain accurate?
Does it introduce technical debt?
Is there a smaller/safer implementation?
Does this belong in the current task?

If these questions cannot be answered satisfactorily, investigate before implementing.

29. Product Scope Discipline

The current product is optimized for:

One church, one laptop, one operator, one projection destination, offline-first live-service use.

That scope is a strength, not a temporary deficiency.

Do not introduce:

SaaS-oriented architecture;
accounts;
cloud synchronization;
multi-user collaboration;
generalized infrastructure;

unless the product requirements explicitly change.

Build for the actual operating environment first.

30. Design Direction

The current codebase represents the stable functional baseline.

Future visual/design work should be treated separately from reliability architecture.

Impeccable may be used for design/UX exploration and implementation guidance where appropriate.

A visual redesign must not silently alter:

state ownership;
projection synchronization;
persistence;
navigation semantics;
core live-service behavior.

Design improvements must respect the established product architecture.

31. Definition of a Good Wordde Change

A good change should ideally be:

narrowly scoped;
understandable;
testable;
reversible;
documented;
compatible with offline operation;
consistent with existing state ownership;
protective of Bible-data correctness;
justified by an actual product or engineering need.

The objective is not to make the code look sophisticated.

The objective is to make Wordde increasingly:

reliable, understandable, maintainable, and difficult to accidentally break.

32. Final Principle

Wordde is a live-service tool.

A bug during ordinary web use is inconvenient.

A bug during a church service can interrupt the entire presentation.

Therefore, future engineering decisions should consistently favor:

correctness → reliability → recoverability → maintainability → performance → visual refinement

while remaining proportional to the actual needs of the product.

When in doubt:

Preserve the existing working architecture, investigate before changing it, and prove important behavior with tests.
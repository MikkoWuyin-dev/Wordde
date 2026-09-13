Wordde — Reliability & Invariant Specification

Document status: Living engineering specification
Priority: P0
Audience: Freebuff, human developers, reviewers, and future AI coding agents

1. Purpose

This document defines the non-negotiable behavioral invariants of Wordde.

An invariant is a condition that must remain true regardless of:

which UI action triggered a state transition;
which Bible translation is active;
whether the Projection window has just opened;
whether the application has been reloaded;
whether the browser temporarily loses synchronization;
whether persisted state is missing, stale, malformed, or unavailable;
whether the operator is previewing or actively projecting;
or whether an unusual Bible verse key is encountered.

These rules exist because Wordde is a live-service application.

The purpose of this specification is to convert architectural assumptions into:

explicit engineering rules;
testable properties;
regression barriers;
implementation constraints for AI coding agents.

A feature that violates an invariant is not considered correct even if its UI appears to work.

2. Invariant Classification

Invariants are classified as:

P0 — Critical

A violation can cause incorrect Bible content, incorrect audience-visible projection, state corruption, or serious live-service failure.

P1 — High

A violation may degrade reliability, recovery, synchronization, or operator behavior.

P2 — Structural

A violation primarily increases maintainability or future regression risk.

P0 invariants should receive automated tests before substantial refactoring of the code responsible for them.

3. Authority Invariants
RI-001 — Single Authoritative Operator

Priority: P0

There must be one authoritative source of projection state.

The Operator window is that authority.

The Projection window must never independently become an authoritative writer of projection state.

Must remain true
Operator → authoritative state
Projection → synchronized rendering replica
Must not become
Operator ↔ Projection

where both sides independently modify authoritative state.

4. Projection Invariants
RI-002 — Audience Projection Must Represent Committed State

Priority: P0

The audience-visible projection must correspond to the application's committed/live projection state.

Preview/navigation state must not accidentally replace audience-visible state.

RI-003 — Locked Projection Must Not Be Accidentally Modified

Priority: P0

When Projection Lock is active:

operator navigation may change preview state;
operator exploration may change candidate state;
audience-visible projection must remain unchanged unless an explicitly permitted lock-breaking action occurs.

A navigation action alone must not silently project while locked.

RI-004 — Normal Projection Uses the Established Commit Funnel

Priority: P0

Normal projection must pass through the established projection transition pathway.

Do not create isolated projection mutations that bypass the existing side effects unless there is an explicit architectural reason.

The projection pathway is responsible for keeping related state coherent.

RI-005 — Projection State Must Remain Internally Coherent

Priority: P0

The following must not contradict one another:

slide queue;
active/live slide index;
committed passage;
live projection state;
projection lock;
blank state;
translation.

A state transition must update related state atomically from the perspective of application behavior.

5. History Invariants
RI-006 — History Represents Actual Projection Transitions

Priority: P1

History must not record arbitrary previews as though they were audience-visible projections.

History should correspond to meaningful projection transitions according to the established product semantics.

RI-007 — Undo/History Must Not Cross Invalid Reference Boundaries

Priority: P1

History behavior must preserve the intended grouping semantics of projected passages.

Changes to history logic must account for book/chapter/reference boundaries rather than assuming every state transition should create an independent history entry.

6. Bible Data Invariants
RI-008 — Verse Keys Are Opaque Identifiers

Priority: P0

Verse identifiers must be treated as strings/opaque keys.

Never assume:

1, 2, 3, 4...

is the universal structure.

The system must support:

lettered verse identifiers;
missing numbers;
non-contiguous identifiers;
source-specific keys.
RI-009 — Verse Navigation Uses Actual Data Order

Priority: P0

Next/previous navigation must operate on the actual normalized verse array.

It must not derive the next key through arithmetic.

Correct:

current index → adjacent array element

Incorrect:

Number(currentVerse) + 1
RI-010 — Chapter Boundaries Are Data-Driven

Priority: P0

When navigating beyond the last verse of a chapter, Wordde must move to the first valid verse of the next chapter according to actual normalized chapter ordering.

It must not infer chapter structure numerically without consulting the actual data.

RI-011 — Book Boundaries Are Data-Driven

Priority: P0

When navigating beyond the final relevant chapter of a book, Wordde must move to the appropriate first verse of the next available book according to actual data ordering.

Likewise, previous navigation must correctly cross backward across book boundaries.

RI-012 — Missing Current Verse Fails Safely

Priority: P0

If a requested current verse cannot be found in the active translation's normalized data:

navigation must not invent a verse;
navigation must not perform numeric arithmetic;
state must not become corrupted;
the application must fail safely.
7. Translation Invariants
RI-013 — Translation Identity Must Be Explicit

Priority: P0

Every Bible lookup relevant to projection must be performed against an explicit translation context.

Do not rely on implicit global/default translation assumptions inside domain logic.

RI-014 — No Silent Translation Fallback

Priority: P0

If the requested translation is unavailable:

Wordde must not silently substitute another translation.

Failure must remain visible and explicit.

RI-015 — Translation Changes Must Preserve Reference Intent

Priority: P0

When changing translation, Wordde must preserve the intended Bible reference while retrieving the corresponding content from the selected translation.

The translation change must not accidentally change:

book;
chapter;
verse;
passage boundaries.
RI-016 — Translation Data Must Not Be Cross-Contaminated

Priority: P0

Data loaded for one translation must not accidentally overwrite, masquerade as, or substitute for another translation's data.

8. Projection Synchronization Invariants
RI-017 — Projection Window Is a Replica

Priority: P0

The Projection window must render synchronized state.

It must not independently decide what the authoritative projection state should be.

RI-018 — Synchronization Must Not Change Operator Authority

Priority: P0

Receiving synchronization messages must not cause the Projection window to become a writer.

RI-019 — Projection Window Must Recover Current State

Priority: P1

When a Projection window opens or reconnects, it must be able to obtain the current authoritative state.

The system must not require the Operator to manually re-project a passage merely because the Projection window was restarted.

RI-020 — Synchronization Loss Must Not Corrupt Authoritative State

Priority: P0

Temporary BroadcastChannel failure, delayed messages, or Projection-window unavailability must not corrupt the Operator's authoritative state.

The Operator must remain operational.

RI-021 — Synchronization Must Not Turn Recovery Into Projection

Priority: P0

Restoring persisted/recovery state locally must not accidentally broadcast that restored state as a new projection command.

9. Persistence Invariants
RI-022 — Persistence Failure Must Not Destroy Live Operation

Priority: P0

Failure to write browser persistence must not cause Wordde's core projection behavior to fail.

For example:

localStorage write fails
        ↓
projection should continue safely

not:

localStorage write fails
        ↓
projection operation crashes
RI-023 — Persisted State Is Untrusted Input

Priority: P1

Persisted state must be treated as potentially:

malformed;
incomplete;
stale;
incompatible;
manually modified;
or unavailable.

Loading persisted state must validate it before using it.

RI-024 — Stale Recovery State Must Not Override Valid Current State

Priority: P0

A stale recovery snapshot must not blindly replace newer valid state.

Recovery must respect the established staleness policy.

RI-025 — Recovery Must Preserve Navigation Intent

Priority: P0

A valid recovery snapshot must restore sufficient navigation/projection context to allow the operator to continue from the recovered session state.

10. Recovery Invariants
RI-026 — Recovery Must Not Re-Project Automatically

Priority: P0

Restoring recovery state is a restoration operation.

It must not automatically behave like a fresh projection command.

This prevents a reload/recovery operation from unintentionally changing the audience-visible display.

RI-027 — Recovery Must Preserve Translation Context

Priority: P0

If the recovered session was using a particular translation, the recovered navigation state must remain associated with that translation.

RI-028 — Invalid Recovery Must Fail Safely

Priority: P0

If recovery data fails validation:

do not partially apply corrupted state;
do not crash the application;
fall back to a safe initialization state;
make the failure diagnosable.
11. Blank-State Invariants
RI-029 — Blank State Is Distinct From Passage State

Priority: P0

Blanking the projection must not destroy the underlying passage/navigation state unless the product behavior explicitly requires it.

Unblanking should restore the intended projection state.

RI-030 — Blank/Unblank Must Synchronize

Priority: P0

A deliberate blank/unblank operation must result in consistent audience-visible behavior between the Operator and Projection windows.

12. Service Plan Invariants
RI-031 — Service Plan Persistence Is Independent

Priority: P1

Service Plan state must persist independently of transient projection state.

RI-032 — Service Plan Ordering Is Authoritative

Priority: P1

When the operator progresses through a Service Plan, passage order must correspond to the current persisted/editable plan.

RI-033 — Service Plan Navigation Must Not Accidentally Become Global Navigation

Priority: P1

Contextual Service Plan commands must not unexpectedly trigger unrelated global navigation behavior.

13. Recent Passage Invariants
RI-034 — Recent Passages Must Not Duplicate Identical Entries

Priority: P1

The recent-passage system must maintain the established duplicate-avoidance behavior.

RI-035 — Recent Passages Must Reflect Relevant User Actions

Priority: P1

Previewing arbitrary navigation must not automatically be interpreted as a completed projected passage if the product semantics distinguish between preview and projection.

14. Input Invariants
RI-036 — Keyboard Shortcuts Must Respect Context

Priority: P1

A keyboard shortcut must not trigger an unrelated global action when the operator is interacting with:

search inputs;
editable fields;
Service Plan controls;
dialogs;
or other contexts where keyboard input has a local meaning.
RI-037 — Removed Commands Must Stay Removed

Priority: P1

A previously removed shortcut/action must not reappear through an unrelated refactor or duplicate listener.

15. Asset Invariants
RI-038 — Core Projection Must Not Depend on Remote Assets

Priority: P0

Core projection operation must remain functional offline.

Local user assets must not unexpectedly become network dependencies.

RI-039 — Missing Local Assets Must Fail Gracefully

Priority: P1

If a locally stored asset is unavailable or corrupted:

projection must not crash;
the application should use an appropriate safe fallback;
the failure should remain diagnosable.
16. Data Integrity Invariants
RI-040 — Source Verse Text Must Be Preserved

Priority: P0

The normalization layer must preserve source verse text faithfully.

Do not silently rewrite, normalize, paraphrase, or alter Bible text as part of data ingestion.

RI-041 — Normalization Must Be Deterministic

Priority: P0

Given the same source data, normalization should produce the same canonical representation.

RI-042 — Source-Format Knowledge Must Remain Encapsulated

Priority: P2

Source-specific JSON structure knowledge should remain inside the normalization boundary.

UI/state/search/projection modules should not independently parse source-specific structures.

17. Error-Handling Invariants
RI-043 — Non-Critical Failures Must Be Isolated

Priority: P0

Failure in a non-critical subsystem must not unnecessarily take down critical projection functionality.

Examples:

persistence failure;
optional asset failure;
one translation failing to load;
non-critical UI state failure.
RI-044 — Errors Must Not Produce Silent Data Substitution

Priority: P0

When Wordde cannot obtain the requested data, it must not quietly substitute different data merely to keep the UI populated.

This is especially important for Bible translations and references.

RI-045 — Error Recovery Must Preserve Known-Good State

Priority: P0

When an operation fails, Wordde should preserve the last known valid state whenever possible rather than replacing it with partial or corrupted state.

18. Offline Invariants
RI-046 — Core Functionality Must Work Without Internet

Priority: P0

The following must remain operational offline:

Bible data access;
search;
navigation;
projection;
projection synchronization between local windows;
Service Plan;
locally stored assets.
RI-047 — Runtime Network Failure Must Not Break Core Operation

Priority: P0

If network access disappears during a service, core operation must continue.

19. Testing Invariants
RI-048 — Critical Invariants Must Be Executable

Priority: P0

Important invariants must eventually have automated tests wherever technically practical.

The test suite should not merely test implementation details.

It should test observable behavioral guarantees.

RI-049 — Regression Tests Must Accompany Reliability Fixes

Priority: P0

When a bug is fixed because a particular invariant was violated:

Add a regression test that would fail if the bug were reintroduced.

RI-050 — Refactoring Requires Behavioral Protection

Priority: P0

Do not perform high-risk refactoring of critical state/projection logic without adequate behavioral tests.

20. Maintainability Invariants
RI-051 — One Concept Should Have One Authoritative Implementation Path

Priority: P2

Avoid maintaining multiple competing implementations of the same domain behavior.

If legacy and current pathways coexist:

identify them;
determine which is authoritative;
test the authoritative path;
remove or consolidate obsolete paths deliberately.
RI-052 — Dead Code Must Not Be Removed Blindly

Priority: P2

Apparently unused code may still protect an invariant or support a compatibility path.

Before removing it:

determine why it exists;
inspect references;
inspect historical behavior where relevant;
verify that removal does not change runtime semantics.
21. Documentation Invariants
RI-053 — System Teardown Must Describe Reality

Priority: P1

System Teardown.md must describe the current implementation.

If code changes invalidate its contents, the document must be updated as part of the same task.

RI-054 — Architectural Decisions Must Be Recorded

Priority: P1

When a non-obvious architectural decision is introduced, record:

the decision;
the reason;
the alternatives considered where relevant;
the invariant it protects;
and what future agents must not accidentally undo.
22. AI-Agent Safety Invariants
RI-055 — No Broad Changes Without Scope

Priority: P1

An AI coding agent must not turn a narrowly scoped task into an unrelated refactor.

RI-056 — No Architectural Rewrite Without Explicit Justification

Priority: P0

An agent must not replace a core architecture merely because it prefers another pattern.

A proposed architectural change must establish:

the existing problem;
why the current architecture cannot reasonably solve it;
the proposed alternative;
migration/regression risks;
test strategy;
rollback strategy.
RI-057 — Passing Build Is Not Proof of Correctness

Priority: P0

The following are not equivalent:

Build passes

and

Feature is correct

Compilation validates syntax/types/build integration.

Tests and runtime verification validate behavior.

RI-058 — Documentation Is Part of the Implementation

Priority: P1

A feature is not complete until the resulting architecture and behavior are reflected in the appropriate documentation.

23. Live-Service Safety Invariants
RI-059 — Last Known Good Projection Must Be Protected

Priority: P0

When an operation fails, the system should prefer preserving the last known valid audience-visible state over displaying an invalid or partially constructed state.

RI-060 — Preview Must Never Accidentally Become Live

Priority: P0

An operator exploring a reference must not accidentally expose it to the audience unless the appropriate projection/commit action occurs.

RI-061 — Audience State Must Be Predictable

Priority: P0

For every operator action that can affect projection, it must be possible to determine whether the action:

changes preview only;
changes live projection;
changes blank state;
changes Service Plan state;
or changes another persisted state.

Hidden side effects should be minimized.

24. Invariant Testing Strategy

The first P0 testing phase should prioritize these invariants:

Highest priority
RI-001 — single authoritative Operator
RI-002 — committed state equals audience projection
RI-003 — Projection Lock
RI-004 — projection commit funnel
RI-008 — opaque verse keys
RI-009 — position-based navigation
RI-010 — chapter boundaries
RI-011 — book boundaries
RI-012 — missing verse safety
RI-013 — explicit translation identity
RI-014 — no translation fallback
RI-015 — translation preserves reference
RI-016 — translation isolation
RI-020 — synchronization loss safety
RI-021 — recovery does not re-project
RI-022 — persistence failure isolation
RI-024 — stale recovery protection
RI-026 — recovery does not re-project
RI-028 — invalid recovery safety
RI-029 — blank state preservation
RI-040 — source text preservation
RI-043 — non-critical failure isolation
RI-044 — no silent substitution
RI-045 — preserve known-good state
RI-046 — offline core operation
RI-049 — regression testing
RI-059 — last-known-good projection
RI-060 — preview/live separation

These should form the initial reliability test foundation.

25. Invariant Violation Response

When a new bug is discovered, do not merely patch the observed symptom.

Perform this sequence:

Identify the violated invariant.
Determine why the existing architecture permitted the violation.
Fix the underlying behavior.
Add a regression test.
Determine whether the invariant itself needs clarification.
Update this specification if a new invariant has been discovered.
Update System Teardown.md.
Record the architectural decision in the completion report.

This turns individual bugs into progressively stronger system guarantees.

26. Change-Control Rule

Before making a change to critical state, projection, navigation, persistence, recovery, translation, or synchronization code, the implementing agent must explicitly answer:

Which invariants does this change affect, and how will we prove that they remain satisfied?

If the answer is unclear, reconnaissance should continue before implementation begins.

27. Final Reliability Principle

The most important property of Wordde is not that every feature works under ideal conditions.

It is that when something goes wrong, the application fails safely and protects the last known valid state.

The system should prefer:

known-good state → graceful degradation → recoverability → explicit failure

over:

partial state → silent substitution → corruption → crash

The purpose of this specification is to make those principles executable rather than aspirational.
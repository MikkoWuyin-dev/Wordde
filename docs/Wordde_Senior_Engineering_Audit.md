# Wordde — Senior Engineering Audit & Infrastructure Critique

**Repository:** `MikkoWuyin-dev/Wordde`  
**Application:** Offline-first Bible search and projection system  
**Audit perspective:** software architecture, reliability engineering, testing, data integrity, performance, UI/UX, interaction design, maintainability, and future AI-agent development.

---

# 1. Executive Assessment

## Overall engineering assessment

| Area | Assessment |
|---|---|
| Product architecture | **Good** |
| Offline-first strategy | **Very good** |
| Domain/data model | **Good** |
| Projection architecture | **Good, but distributed-state risks remain** |
| State ownership | **Good principle, implementation becoming too complex** |
| Persistence/recovery | **Improved significantly, but still fragile** |
| Bible data integrity | **Strong** |
| Navigation correctness | **Strong after P0 fix** |
| Cross-window reliability | **Acceptable prototype / needs hardening** |
| Error handling | **Mixed** |
| Test architecture | **Weak** |
| Performance at current scale | **Good enough** |
| Scalability | **Limited but appropriately so for current product** |
| UI/UX philosophy | **Strong product thinking, implementation needs continued refinement** |
| Maintainability | **Moderate** |
| AI-agent maintainability | **Currently risky** |
| Production readiness | **Not yet where I would want it for unattended church-service use** |

### Overall verdict

**Architecture: 7.5/10**

**Current reliability posture: 6/10**

**Data correctness: 8.5/10**

**Testing maturity: 3.5/10**

**Maintainability: 6/10**

**UX/product thinking: 8/10**

**Potential with disciplined engineering: 9/10**

The important distinction is that **the architecture is considerably better than the test discipline**.

That is a dangerous combination because it creates a codebase that *looks* trustworthy while still having insufficient automated proof around its most dangerous behavior.

---

# 2. What Wordde Actually Is

Wordde is an offline-first Bible projection application for volunteer church A/V operators. The product intentionally avoids backend infrastructure, authentication, databases, and network dependencies. One laptop runs the operator interface while a second browser window is moved to an HDMI-connected TV/projector.

The core architecture is essentially:

```text
                 ┌────────────────────────────┐
                 │      OPERATOR WINDOW       │
                 │                            │
                 │ React UI                   │
                 │      ↓                     │
                 │ Zustand                    │
                 │      ↓                     │
                 │ ┌──────────┬────────────┐  │
                 │ │ Bible    │ Broadcast  │  │
                 │ │ Repo     │ Sync       │  │
                 │ └──────────┴────────────┘  │
                 └─────────────┬──────────────┘
                               │
                       BroadcastChannel
                               │
                               ▼
                 ┌────────────────────────────┐
                 │     PROJECTION WINDOW      │
                 │                            │
                 │ Local React replica        │
                 │                            │
                 │ NO authority               │
                 └────────────────────────────┘
```

That is fundamentally the right direction.

The key architectural decision is:

> **There is one authoritative operator state, and the projection window is a rendering replica.**

---

# 3. The Best Architectural Decision in the Project

The strongest design choice in Wordde is not React, Zustand, BroadcastChannel, IndexedDB, or even offline operation.

It is the **authority model**.

The system deliberately distinguishes:

```text
Operator state
      ↓
authoritative
      ↓
transport
      ↓
projection replica
```

instead of:

```text
Operator state ←→ Projection state
```

If the projection window were allowed to mutate authoritative state, you would eventually get race conditions, conflicting navigation, stale state overwrites, translation mismatches, duplicated persistence, and difficult reload semantics.

Wordde avoids that.

### Senior-engineer verdict

**Keep this invariant permanently.**

I would promote it from documentation to an explicit architectural law:

> **The Projection Window MUST NEVER become a state authority.**

Every future AI agent should be reminded of this.

---

# 4. The Two P0 Bugs Were Real Architectural Bugs

The two reliability issues previously fixed were not cosmetic problems. They exposed weaknesses in the system's domain model.

## P0 #1 — Reload destroyed navigation continuity

Originally, the system persisted the last projected passage but not enough of the active navigation session.

The new recovery system snapshots:

- queue
- current index
- live index
- committed passage
- blank state
- translation
- projection lock
- history

and restores those into the store.

The important architectural rule is:

> **Zustand remains authoritative. Recovery persistence is a safety mechanism, not a replacement state-management system.**

The recovery process is:

```text
Bible repository loads
        ↓
recovery snapshot read/validated
        ↓
queue reconstructed
        ↓
indexes validated
        ↓
Zustand restored
        ↓
projection synchronized
```

Malformed/stale snapshots and localStorage failures must never prevent the application from booting or projecting.

---

# 5. P0 #2 — Verse arithmetic was fundamentally unsafe

Bible verse identifiers are not necessarily mathematical integers.

The unsafe assumption was effectively:

```text
3 → 4 → 5 → 6
```

when source data can contain:

```text
3 → 3a → 3b → 4
```

or:

```text
1 → 2 → 4
```

The corrected navigation treats the normalized `Chapter.verses` array as the canonical sequence:

```text
find current verse in array
        ↓
move to adjacent array element
        ↓
if at boundary, move to actual first/last verse
of adjacent chapter/book
```

This preserves the source's actual verse keys instead of manufacturing them.

The underlying principle is:

> **The domain's canonical ordering should determine navigation, not an assumption imposed by the implementation.**

---

# 6. The Data Model Is One of the Strongest Parts

The canonical model:

```ts
Verse {
  verse: string;
  text: string;
}

Chapter {
  chapter: string;
  verses: Verse[];
}

BibleBook {
  book: string;
  chapters: Chapter[];
}
```

is appropriate.

The decision to represent chapter/verse identifiers as strings is especially correct because the source data contains non-numeric identifiers.

The normalizer is correctly positioned as the **translation/source-format boundary**.

The rest of the system therefore does not need to know the shape of each source JSON format.

This is good architecture.

---

# 7. The "No Translation Fallback" Rule Is Excellent

A particularly dangerous failure would be:

```text
UI says NIV
actual text = KJV
```

The current repository deliberately refuses to silently fall back to another translation.

For Bible projection software:

> **An explicit failure is better than a plausible-looking wrong verse.**

This principle should remain immutable.

---

# 8. Translation Loading Still Has a P1 Problem

The current preload mechanism loads the five translations together.

A failure in one translation can potentially cause the entire preload to fail:

```text
KJV      ✓
NIV      ✓
NKJV     ✓
NLT      ✗
AMP      ✓
        ↓
Promise.all rejects
        ↓
entire boot fails
```

That is not ideal.

A better policy is conceptually:

```text
Promise.allSettled()
        ↓
availableTranslations
failedTranslations
```

The UI can then report:

> NLT unavailable — data file could not be loaded.

while allowing the other translations to remain usable.

**Priority: P1.**

---

# 9. The Biggest Structural Risk: `stateManager.ts`

The actual `stateManager.ts` is currently approximately **752 lines / 681 LOC**.

The problem isn't merely file length.

The real problem is responsibility concentration.

It knows about:

- search
- preview
- translations
- queue construction
- slide navigation
- history
- recent passages
- projection
- blanking
- projection lock
- persistence
- recovery
- BibleRepository
- BroadcastChannel
- service behavior

It has effectively become a **mini application runtime**.

---

# 10. Why This Matters for Freebuff

This is especially dangerous because the project is being handed to an AI coding agent.

A human senior engineer can build a mental model of a large state manager.

A smaller coding model is much more likely to modify one path without understanding its relationship to the others.

That is how regressions happen.

Therefore:

> **The larger and more central `stateManager` becomes, the more important automated behavioral contracts become.**

Do not immediately split it into many files. Establish tests first, then extract boundaries around proven behavior.

---

# 11. Architecture Is Layered, But There Is Layer Leakage

The intended architecture is:

```text
UI
 ↓
input controller
 ↓
state manager
 ↓
repository / transport / persistence
```

This is reasonable.

But the state manager directly knows about several infrastructure concerns, creating coupling.

This makes isolated unit testing harder.

A future architecture should make it possible to test domain transitions without requiring the entire browser persistence and communication environment.

**Do not refactor this immediately.** Establish behavioral proof first.

---

# 12. The Projection Funnel Is Excellent — But Fragile

The existence of a central projection funnel such as:

```text
projectSlide()
```

is one of the better decisions in the code.

It centralizes:

- history
- live index
- committed passage
- blank state
- BroadcastChannel
- persistence
- recents
- queue preloading

This is good.

However, the function now carries significant semantic responsibility, depending on several pieces of state such as:

```text
currentSlideIndex
liveSlideIndex
projectionQueue
projectionLocked
currentTranslation
```

That complexity should eventually be reduced through explicit state-transition abstractions.

---

# 13. `_commitWithOldSlide()` Is a Smell — But a Legitimate One

The existence of an internal path equivalent to:

```text
_commitWithOldSlide(oldLiveSlide)
```

appears to compensate for a transition where the queue has already been replaced before the old live slide needs to be captured.

That is a legitimate correctness workaround.

But it signals that the current state-transition API does not express the transition atomically.

A future abstraction could make the transition explicit, but this is not an immediate refactor target.

---

# 14. `committedPassage` Is Potentially Redundant State

The system stores both:

```text
projectionQueue
currentSlideIndex
liveSlideIndex
committedPassage
```

while `committedPassage` is conceptually derivable from the queue, live index, and translation.

Whenever both source and derived state are stored, there is a synchronization obligation:

```text
queue changes
↓
live index changes
↓
committedPassage must also change
```

If one mutation path forgets the final step, the system can become internally inconsistent.

However, removing it immediately would be risky because existing behavior relies on it.

The right future task is to formally classify:

```text
canonical state
derived state
persistent state
transport state
UI state
```

and then decide whether `committedPassage` should remain as cached projection state.

---

# 15. Recovery Persistence Needs Stronger Failure Isolation

The normal projection path intends to ensure persistence never breaks a live projection.

However, recovery persistence needs to be uniformly protected by that same boundary.

The desired architecture is:

```text
projection
   ↓
broadcast
   ↓
best-effort persistence
   ↓
failure logged / ignored
```

not:

```text
projection
   ↓
broadcast
   ↓
persistence exception
   ↓
mutation chain interrupted
```

This is a **P1 candidate**.

---

# 16. LocalStorage Needs a Proper Reliability Policy

Potential localStorage failures include:

- quota exceeded
- browser restrictions
- storage disabled
- malformed existing data
- serialization failures

For this application, the policy should be:

### Critical state

If persistence fails:

> **Do not stop projection.**

### Non-critical state

If persistence fails:

> Log and continue.

### User preference state

If persistence fails:

> Optionally show a non-blocking warning.

A small infrastructure abstraction such as a `safeStorage` layer could eventually enforce this consistently.

---

# 17. BroadcastChannel Reliability Is Pragmatic, Not Strong

The current communication model uses:

```text
COMMIT_PASSAGE
BLANK_SCREEN
SYNC
HEARTBEAT
PROJECTOR_READY
REQUEST_STATE
STATE_RESPONSE
RELOAD_ASSETS
```

with periodic synchronization and readiness/recovery messages.

This is reasonable for a single-browser, same-origin projection system.

If a message disappears, periodic synchronization can recover it.

If the projection window starts late, state can be requested.

If the projection window disappears, heartbeat can detect it.

This is good pragmatic engineering.

---

# 18. Broadcast Protocol Versioning Is Missing

The protocol is typed, but there is no obvious protocol-level:

```text
version
revision
epoch
sequence number
```

This makes future protocol evolution more dangerous.

A future version could use something like:

```ts
{
    protocolVersion: 1,
    type: 'SYNC',
    ...
}
```

This is a future maintainability improvement, not an immediate requirement.

---

# 19. The 3-Second Sync Is Acceptable

Do not over-engineer this into a full ACK/retry message broker yet.

For this product:

- one laptop
- one browser
- same-origin
- one projection window

a short periodic self-healing interval is reasonable.

The relevant question is not whether it is theoretically perfect.

The question is whether the worst-case behavior is acceptable during service.

A stale projection of a few seconds is undesirable, but substantially less dangerous than projecting the wrong verse.

---

# 20. The Multiple-Operator-Window Problem Is Real

The architecture assumes one authoritative operator window, but the platform does not necessarily enforce that only one operator instance exists.

Imagine:

```text
Operator Window A
    ↓
John 3:16

Operator Window B
    ↓
Romans 8:28
```

Both could potentially:

- write localStorage
- broadcast messages
- modify their own Zustand state
- maintain different histories

This violates the single-writer invariant.

**Priority: P1.**

Eventually the application should claim the operator role and block/warn additional operator instances.

Do not let an AI agent invent the mechanism without a precise invariant and acceptance criteria.

---

# 21. Translation Switching Is Well Thought Out

The current system explicitly tracks the active translation and uses it during navigation.

That avoids dangerous assumptions such as:

```text
UI = NIV
repository default = KJV
navigation = KJV
```

The translation-specific navigation behavior is one of the stronger aspects of the current implementation.

---

# 22. Translation Switching Needs Adversarial Tests

Test cases should include structurally different translations:

```text
Translation A:
3 → 3a → 4

Translation B:
3 → 4
```

Then test switching while:

```text
live slide = 3a
```

The application must not fabricate a corresponding verse if the target translation does not contain it.

The correct behavior should be explicitly tested.

---

# 23. Bible Loading Is Correctness-First

The current pipeline:

```text
ZIP
 ↓
decode
 ↓
normalize
 ↓
validate
 ↓
repository
```

is sound.

It:

- validates responses
- decodes ZIPs
- normalizes source formats
- preserves text
- rejects empty translations
- deduplicates books
- establishes canonical order
- avoids silent translation fallback

The weakness is not the architecture.

It is insufficient automated proof around the behavior.

---

# 24. Testing Is Currently the Biggest Weakness

The repository's testing maturity is far below what the application warrants.

Critical logic includes:

```text
normalizeBibleJson()
loadTranslation()
getPassage()
getNextVerse()
getPreviousVerse()
projectSlide()
setTranslation()
restoreProjectionSession()
persistRecoveryState()
slideNext()
slidePrevious()
blankScreen()
```

These are business-critical operations.

They should not rely primarily on manual confidence.

---

# 25. Testing Strategy I Recommend

## Tier 1 — Pure domain tests

### Normalization

Test:

```text
canonical single book
canonical array
nested object
metadata
numeric sorting
lettered verses
non-contiguous verses
empty data
malformed data
duplicate books
verbatim text
```

## Tier 2 — Repository navigation

Test:

```text
3 → 4
3 → 3a → 3b → 4
1 → 2 → 4
chapter boundary
book boundary
first verse
last verse
missing verse
missing chapter
missing book
translation-specific ordering
```

## Tier 3 — Projection state machine

Test:

```text
project verse
project range
replace queue
navigate
lock
unlock
blank
unblank
translation switch
undo
recent
history
```

## Tier 4 — Recovery

Test:

```text
persist
reload
restore
malformed snapshot
stale snapshot
invalid index
missing queue
blank state
translation state
projection lock
history
localStorage failure
```

## Tier 5 — Integration

Eventually test:

```text
Operator
   ↓
BroadcastChannel
   ↓
Projection
```

with a mocked channel.

---

# 26. The Most Important Missing Tests Are Invariant Tests

Example:

```text
currentSlideIndex >= 0
AND
currentSlideIndex < projectionQueue.length
```

when the queue is non-empty.

And:

```text
liveSlideIndex === null
OR
0 <= liveSlideIndex < projectionQueue.length
```

And:

```text
committedPassage corresponds to liveSlideIndex
```

And:

```text
projectionLocked === true
→ navigation may alter preview
→ navigation must not broadcast
```

And:

```text
projection window cannot mutate authoritative state
```

These invariants are more valuable than a large number of superficial UI tests.

---

# 27. Search Performance Is a Known Bottleneck — But Not Yet a Problem

The current search engine uses linear scans.

At current Bible-data scale, that is acceptable.

An eventual inverted index could provide:

```text
"grace"
   ↓
[verse123, verse884, verse912...]
```

instead of scanning every verse for every query.

But this belongs in the performance phase.

Do not prematurely optimize it.

---

# 28. Preloading Five Translations Is a Reasonable Tradeoff

The current architecture trades startup time and memory for instant translation switching.

For the intended deployment—a church laptop—that can be a sensible trade.

Do not change this merely because a different architecture sounds more scalable.

Measure the actual deployment hardware first.

---

# 29. Web Worker Decoding Is a Future Optimization

If translation count/data size grows or startup responsiveness becomes problematic:

```text
JSZip
    ↓
Web Worker
    ↓
normalization
    ↓
main thread
```

would be a natural optimization.

Priority: **P3.**

---

# 30. IndexedDB Bible Caching Is Also Premature

A parsed-data cache could eventually be:

```text
ZIP
 ↓
decode
 ↓
parsed data
 ↓
IndexedDB
```

but it introduces cache invalidation, schema versions, migrations, stale-data handling, and corruption recovery.

Unless startup performance is demonstrated to be unacceptable, the simpler static-asset architecture is preferable.

---

# 31. Projection Rendering Strategy Is Good

The auto-fit system measures the verse region and keeps metadata separate.

Conceptually:

```text
┌──────────────────────────────┐
│                              │
│          VERSE               │
│                              │
│                              │
├──────────────────────────────┤
│ John 3:16       NIV          │
└──────────────────────────────┘
```

This is preferable to shrinking the entire presentation layout simply because the verse is long.

For a projection application, readability at distance matters more than interface density.

---

# 32. Auto-Fit Could Eventually Be More Efficient

The current iterative font-size search is simple.

A future binary-search approach could reduce layout measurements:

```text
min = 16
max = 72

while min <= max:
    test midpoint
```

This is an optimization opportunity, not a current reliability issue.

---

# 33. UX Architecture Is Better Than the Visual Layer

The product documentation understands the primary user:

```text
rotating volunteer
+
low technical skill
+
minutes before service
+
cannot debug during service
```

That is good product thinking.

The onboarding, contextual hints, guided projection setup, and keyboard-first operation follow naturally from that.

The UI should optimize for:

- recognition over recall
- immediate feedback
- safe failure
- minimal destructive actions

---

# 34. The Product's Best UX Decision: Preview ≠ Projection

The application deliberately separates:

```text
search
 ↓
preview
 ↓
commit
 ↓
projection
```

That is correct.

An operator should be able to search and browse without accidentally putting content on the public screen.

This separation must not be sacrificed for interface simplicity.

---

# 35. Projection Lock Is Another Strong UX Concept

The interaction model:

```text
screen currently showing A

operator browses B
operator browses C
operator browses D

screen still shows A

operator explicitly commits D
```

is exactly what a live presentation system should do.

The lock should remain predictable and explicit.

---

# 36. Service Plan's CustomEvent Architecture Is Slightly Odd

The Service Plan's `N` behavior uses a DOM `CustomEvent` rather than the central store.

This is defensible if it prevents a global keyboard hook from becoming tightly coupled to Service Plan internals.

However, the application then has several communication mechanisms:

```text
Zustand
BroadcastChannel
CustomEvent
localStorage
IndexedDB
```

That increases conceptual complexity.

The future architecture should explicitly document when each mechanism is appropriate.

---

# 37. Legacy Code Should Be Removed Carefully

Known technical-debt areas include:

- legacy navigation methods
- unused state fields/types
- obsolete image fields
- old loading paths
- duplicated communication listeners

These should eventually be removed.

But not through a broad:

> "Clean up the codebase."

Instead:

1. Search all call sites.
2. Establish tests.
3. Verify build.
4. Remove one coherent cluster.
5. Re-test.

Dead code is safer than accidentally deleting code whose usage is poorly understood.

---

# 38. Dual Projection Listeners Deserve Consolidation

Having both property-style and event-listener-style BroadcastChannel handlers in the projection layer is unnecessary complexity if both are active for related purposes.

A single authoritative listener path is easier to reason about.

Priority: **P2.**

---

# 39. Stale `assetUrls` Closure Is a Legitimate Technical-Debt Finding

The teardown identifies a stale closure around asset URLs during asset reload handling.

Repeated reloads could potentially leave old object URLs alive longer than intended:

```text
reload assets
 ↓
old URLs remain
 ↓
new URLs created
 ↓
repeat
 ↓
memory pressure
```

This is not a normal-service catastrophe, but it is worth correcting.

Priority: **P2.**

---

# 40. Dependency Surface Is Larger Than the Product Needs

The package configuration contains a broad collection of UI/scaffolding dependencies, including various Radix/shadcn components, React Query, Recharts, Embla, React Hook Form, date-fns, Vaul, and others.

Some may be legitimate; some may be scaffold residue.

The concern is not just bundle size.

It is cognitive noise for future AI coding agents.

A dependency-usage audit should eventually identify genuinely unused packages and remove them.

Do not make this the first Freebuff task.

---

# 41. The Project Configuration Is Still Lovable-Influenced

The repository retains scaffold residue such as the generic package setup and Lovable-related development tooling.

That is not a functional problem.

But as the project migrates away from Lovable, the development surface should eventually be cleaned up.

Priority: **P2.**

---

# 42. Documentation Is Good — But It Is Becoming Dangerous

The `System Teardown.md` is unusually detailed for a project of this size.

That is useful.

But it has already drifted from the implementation.

For example:

```text
Documentation:
stateManager = 634 LOC

Actual:
stateManager ≈ 681 LOC
```

The teardown also describes earlier reliability problems that have since been addressed.

Therefore it should no longer be treated as the definitive current-state specification.

It is better understood as:

> **architectural intent + historical snapshot**

rather than immutable truth.

---

# 43. We Should Stop Treating the Teardown as Source of Truth

The hierarchy should be:

```text
SOURCE CODE
    ↓
source of truth

TESTS
    ↓
behavioral evidence

DOCUMENTATION
    ↓
intent / architecture map
```

This is particularly important for AI-agent development.

If the documentation says X but the source does Y, the discrepancy should be surfaced explicitly.

---

# 44. Freebuff/Impeccable Tooling Must Remain Separate From Product Architecture

The repository now contains development-agent/design tooling such as:

```text
.freebuff/
.impeccable/
.agents/skills/impeccable/
```

This is useful for the migration.

But:

> **Development tooling must not dictate product architecture merely because it is present in the repository.**

Freebuff should handle behavior, state, persistence, architecture, testing, and reliability.

Impeccable should primarily handle visual design, interaction quality, accessibility, hierarchy, spacing, and UX refinement.

---

# 45. UI/UX Architecture vs Visual Design

The operator and projection surfaces have different jobs.

### Operator UI

Optimizes:

```text
density
discoverability
controls
feedback
navigation
```

### Projection UI

Optimizes:

```text
legibility
contrast
hierarchy
silence
stability
distance readability
```

They should therefore not share design assumptions simply because they are both React surfaces.

---

# 46. The UX Risk: Too Many Modes

The application has accumulated:

- search
- browse
- service plan
- recent
- presenter
- lock
- blank
- session screens
- settings
- onboarding
- hints
- projection setup

Each can be justified.

Together they create a risk of **mode overload**.

The operator should always be able to answer:

```text
WHAT IS LIVE?
WHAT AM I PREVIEWING?
WHAT WILL ENTER DO?
WHAT WILL ARROW DO?
WHAT WILL B DO?
WHAT WILL N DO?
```

If those aren't clear, visual polish won't solve the problem.

This should be central to future Impeccable work.

---

# 47. Keyboard Design Is a Product Advantage

For a live operator, keyboard shortcuts reduce:

```text
mouse movement
visual attention switching
reaction time
```

The shortcut system should eventually have one authoritative registry:

```text
SHORTCUTS
   ↓
single definition
   ↓
handler
   ↓
tooltip/help/onboarding
```

That prevents help documentation and actual behavior from drifting.

---

# 48. Projection UX Should Be Treated as a Separate Product Surface

Operator UI and projection UI have fundamentally different optimization targets.

This becomes especially important when the visual system is redesigned.

A projection screen should not inherit operator-interface density or decorative interaction patterns.

---

# 49. Current Scalability Strategy Is Appropriate

This is not a SaaS architecture.

The intended deployment is roughly:

```text
one church
one laptop
one projection
five translations
```

Therefore there is no justification for introducing:

- PostgreSQL
- Redis
- GraphQL
- authentication
- microservices
- cloud sync
- Kubernetes

unless the product's actual requirements change.

The offline SPA is the correct architecture for the current problem.

---

# 50. What I Would NOT Change

Preserve:

### Architecture

```text
React
+
Zustand
+
BibleRepository
+
BroadcastChannel
+
localStorage
+
IndexedDB
```

### Authority model

```text
Operator = writer
Projection = replica
```

### Data model

```text
string chapter/verse identifiers
```

### Projection funnel

```text
projectSlide()
```

### No translation fallback

### Offline-first design

### Two-window architecture

### Preview/live separation

### Projection lock

### Array-based verse navigation

### Static Bible assets

### Current five-translation preload strategy

At least until measurements prove something needs changing.

---

# 51. What I Would Change First

## P0 — Establish proof

Before more features or visual redesign:

### P0.1

Build a real test suite around:

```text
normalizer
repository navigation
projection state
recovery
translation switching
```

### P0.2

Run and record:

```text
test
build
lint
```

### P0.3

Create a formal invariant document.

---

# 52. P1 — Reliability Hardening

Then:

### P1.1

Guard every persistence write with consistent failure isolation.

### P1.2

Make translation loading resilient with partial availability.

### P1.3

Prevent conflicting operator windows.

### P1.4

Strengthen recovery validation.

### P1.5

Test cross-window recovery.

---

# 53. P2 — Structural Maintainability

Only after tests exist:

### P2.1

Reduce `stateManager` responsibility based on behavioral boundaries.

### P2.2

Remove legacy navigation paths.

### P2.3

Remove unused state/types.

### P2.4

Consolidate BroadcastChannel listeners.

### P2.5

Clean Lovable-specific scaffolding.

### P2.6

Update architecture documentation.

---

# 54. P3 — Performance

Then, only if measurements justify them:

```text
Web Worker ZIP decoding
IndexedDB parsed Bible cache
inverted search index
semantic index optimization
font-fit optimization
selective Zustand subscriptions
```

---

# 55. P4 — UX / Visual System

Finally:

```text
operator UX refinement
projection visual design
accessibility
motion
design tokens
responsive behavior
interaction polish
```

This is where Impeccable becomes valuable.

---

# 56. The Most Important Engineering Rule for Freebuff

> **Do not refactor architecture merely because a structure looks inelegant. Preserve behavior first. Establish tests around the behavior. Then refactor one boundary at a time.**

AI agents are prone to seemingly sophisticated but dangerous rewrites.

For example:

```text
"I see a large stateManager.
I'll split it into several stores."
```

or:

```text
"This synchronization is complicated.
I'll replace BroadcastChannel."
```

or:

```text
"localStorage is primitive.
I'll introduce IndexedDB everywhere."
```

Any of these could destroy carefully established invariants.

---

# 57. The Current Codebase's Biggest Risk Is No Longer the Original P0 Bugs

The original P0 issues were:

```text
reload
→ navigation state disappears
```

and:

```text
verse + 1
→ assumes mathematical sequence
```

Those are substantially addressed.

The next generation of problems is about **system integrity**:

```text
                  ┌────────────────────┐
                  │   STATE MANAGER    │
                  │                    │
                  │ too much authority │
                  └─────────┬──────────┘
                            │
           ┌────────────────┼────────────────┐
           │                │                │
           ▼                ▼                ▼
      persistence      transport        repository
           │                │                │
           ▼                ▼                ▼
       localStorage   BroadcastChannel   Bible data
```

The system works.

But the boundaries aren't strong enough yet.

---

# 58. Risk Register

| ID | Finding | Priority | Why |
|---|---|---:|---|
| R-001 | Insufficient tests around projection state | **P0** | Can't prove critical behavior |
| R-002 | Recovery persistence not uniformly failure-isolated | **P1** | Storage failure can leak into control flow |
| R-003 | Translation preload is all-or-nothing | **P1** | One corrupt translation can block boot |
| R-004 | Multiple operator windows not prevented | **P1** | Violates single-writer invariant |
| R-005 | State manager excessive responsibility | **P2** | High regression risk |
| R-006 | Legacy navigation paths remain | **P2** | Duplicate behavior surface |
| R-007 | Dual BroadcastChannel listener mechanisms | **P2** | Unnecessary complexity |
| R-008 | Stale asset URL closure | **P2** | Potential resource leak |
| R-009 | Documentation drift | **P2** | AI-agent misinformation risk |
| R-010 | Unused dependencies/scaffold residue | **P2** | Maintenance noise |
| R-011 | Linear keyword search | **P3** | Future performance issue |
| R-012 | Main-thread ZIP decoding | **P3** | Boot responsiveness |
| R-013 | Full translation preload | **P3** | Memory scalability |
| R-014 | Auto-fit iterative layout | **P3** | Optimization opportunity |
| R-015 | Operator UX refinement | **P4** | Quality/polish |
| R-016 | Projection visual system | **P4** | Design quality |
| R-017 | Design-system migration | **P4** | Future visual architecture |

---

# 59. What the Project Really Needs

Not a rewrite.

Not a framework migration.

Not a backend.

Not another giant AI prompt.

It needs a **reliability maturation phase**.

The architecture is already good enough to support the product.

What it lacks is evidence.

We need to move from:

> "The code appears to implement the invariant."

to:

> "The invariant is executable, tested, and continuously protected."

That's the difference between prototype engineering and production engineering.

---

# 60. Recommended Engineering Maturity Model

```text
STAGE 1
Feature prototype
        ↓
STAGE 2
Architecturally coherent prototype
        ↓
YOU ARE HERE
        ↓
STAGE 3
Reliability-hardened application
        ↓
STAGE 4
Maintainable application
        ↓
STAGE 5
Polished operator product
```

The mistake would be jumping:

```text
Stage 2 → Stage 5
```

because it feels productive.

Instead:

```text
Stage 2
 ↓
prove behavior
 ↓
harden reliability
 ↓
clean architecture
 ↓
UX
 ↓
visual system
```

---

# 61. Final Verdict

After examining the repository, I would **not recommend rebuilding Wordde**.

The project has a legitimate architectural foundation.

Its strongest characteristics are:

- clear authority model
- offline-first architecture
- strong data normalization boundary
- explicit translation handling
- correct verse-key navigation
- projection funnel
- preview/live separation
- projection lock
- reasonable cross-window synchronization
- good understanding of the actual church operator
- sensible avoidance of unnecessary backend infrastructure

The weaknesses are concentrated in:

- insufficient automated tests
- growing `stateManager` complexity
- persistence failure isolation
- translation boot isolation
- lack of operator singleton enforcement
- legacy paths
- protocol/versioning maturity
- documentation drift
- leftover scaffold/dependency noise

The most concerning sentence about the project is:

> **There is more confidence encoded in the architecture and documentation than there is evidence encoded in the test suite.**

That's what should be fixed first.

The second key conclusion is:

> **Do not give Freebuff permission to "improve the architecture" yet. Give it permission to understand, test, verify, and harden the architecture.**

---

# 62. Recommended Next Phase

Before touching application code, create these engineering artifacts:

1. **Wordde Current-State Master Context Document** — authoritative context for Freebuff.
2. **Wordde Reliability & Invariant Specification** — non-negotiable behavioral laws.
3. **Wordde P0–P4 Engineering Backlog** — ordered work items with dependencies and acceptance criteria.

Then give Freebuff a **read-only reconnaissance prompt**, followed by the first implementation task: **establishing the critical test foundation**, not redesigning anything.

---

## Audit Note

This report is a static engineering audit of the GitHub repository and associated project documentation. It should be supplemented by runtime verification of:

- `npm test`
- `npm run build`
- linting/type checks
- two-window operator/projection behavior
- actual HDMI/projector behavior
- browser storage failure scenarios
- translation loading failures
- cross-window synchronization under reload/disconnect conditions

Those runtime checks should be treated as a required part of the baseline before the next implementation phase.

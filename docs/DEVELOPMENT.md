# docs/DEVELOPMENT.md

```markdown
# Bible Projection System — Development Guide

**Purpose:** How to safely develop features using FreeBuff Desktop (or any AI coding agent).  
**Audience:** Developers working with AI agents on this codebase.  
**Critical:** Read `ARCHITECTURE.md` and `CONSTRAINTS.md` before making ANY changes.

---

## Table of Contents

1. [Before You Start](#1-before-you-start)
2. [Working with FreeBuff Desktop](#2-working-with-freebuff-desktop)
3. [Prompt Templates](#3-prompt-templates)
4. [Code Review Checklist](#4-code-review-checklist)
5. [Testing Requirements](#5-testing-requirements)
6. [Common Tasks & Patterns](#6-common-tasks--patterns)
7. [What NOT to Touch](#7-what-not-to-touch)
8. [Debugging Guide](#8-debugging-guide)
9. [Build & Deployment](#9-build--deployment)

---

## 1. Before You Start

### Required Reading (In Order)

1. **`ARCHITECTURE.md`** — Understand the system design (30 min read)
2. **`CONSTRAINTS.md`** — Memorize the NEVER/ALWAYS rules (10 min read)
3. **This document** — Learn the workflow

### Prerequisites

**Environment:**
```bash
# Verify you have:
node --version  # v18+ recommended
npm --version   # v9+ recommended

# Install dependencies
npm install

# Verify build works
npm run build

# Verify tests pass
npm test  # or npm run test
```

**Tools:**
- FreeBuff Desktop installed and configured
- Git configured with your details
- Code editor with TypeScript support (VS Code recommended)

### Mental Model

**This is NOT a greenfield project.**

You are working on a **production system** with:
- ✅ Working P0 implementations (recovery + navigation)
- ✅ Established architecture (single source of truth, offline-first)
- ✅ Strict constraints (data fidelity, no verse arithmetic)
- ⚠️ Real users (church A/V operators during live services)

**Your goal:** Add value WITHOUT breaking existing guarantees.

---

## 2. Working with FreeBuff Desktop

### The Golden Rule

**FreeBuff is a powerful tool that can easily violate constraints if not guided properly.**

Every prompt MUST:
1. ✅ Reference `ARCHITECTURE.md` sections by name
2. ✅ Reference `CONSTRAINTS.md` rules explicitly
3. ✅ List files that can/cannot be modified
4. ✅ Specify test requirements
5. ✅ Define acceptance criteria
6. ✅ Include "What NOT to do" section

### Workflow: Plan → Prompt → Verify → Review → Test → Commit

```
┌─────────────────────────────────────────────────────────┐
│ 1. PLAN (Human + AI collaboration)                      │
│    - Define the goal                                    │
│    - Identify affected components                       │
│    - Check CONSTRAINTS.md for violations                │
│    - Break into smallest safe change                    │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 2. PROMPT (Human → FreeBuff)                            │
│    - Use template from section 3                        │
│    - Be explicit about scope                            │
│    - Include constraints checklist                      │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 3. VERIFY (Automated - Impeccable)                      │
│    - Run verification rules                             │
│    - Check for constraint violations                    │
│    - Flag suspicious patterns                           │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 4. REVIEW (Human + AI collaboration)                    │
│    - Read the generated code                            │
│    - Check against acceptance criteria                  │
│    - Verify no scope creep                              │
│    - Use checklist from section 4                       │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 5. TEST (Manual + Automated)                            │
│    - Run automated tests (npm test)                     │
│    - Run manual smoke test                              │
│    - Verify no regressions                              │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 6. COMMIT (Human)                                       │
│    - Write descriptive commit message                   │
│    - Reference issue/task                               │
│    - Push to feature branch                             │
└─────────────────────────────────────────────────────────┘
```

### FreeBuff-Specific Tips

**Do:**
- ✅ Start with small, focused tasks (1-2 files max)
- ✅ Test FreeBuff's output immediately
- ✅ Keep conversation context focused (reference docs, not full code dumps)
- ✅ Ask FreeBuff to explain its changes
- ✅ Use iterative refinement (small corrections)

**Don't:**
- ❌ Give vague prompts ("improve the search feature")
- ❌ Let FreeBuff refactor unrelated code
- ❌ Accept changes you don't understand
- ❌ Skip the manual review step
- ❌ Commit without testing

---

## 3. Prompt Templates

### Template 1: Add New UI Component (Low Risk)

```markdown
**Task:** Add [specific UI element] to [specific component]

**Context:**
- Read ARCHITECTURE.md sections: "UI Layer", "Layer Boundaries"
- This is a UI-only change, no state/business logic modifications

**Files to Modify:**
- `src/components/[ComponentName].tsx` — Add new element

**Files NOT to Touch:**
- src/core/stateManager.ts
- src/core/bibleRepository.ts
- src/core/broadcastSync.ts
- src/core/bibleNormalizer.ts

**Requirements:**
1. Add [specific element] that [specific behavior]
2. Use existing Tailwind classes (no new styles)
3. Ensure responsive (works on desktop only, >768px)
4. No state changes (purely presentational)

**Constraints Check:**
- [ ] No verse text modification
- [ ] No translation fallbacks
- [ ] No verse arithmetic
- [ ] No new state persistence
- [ ] UI layer only (no Repository calls)

**Acceptance Criteria:**
- [ ] Element renders in correct location
- [ ] Matches existing design system
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] Build succeeds

**What NOT to Do:**
- Do NOT modify stateManager
- Do NOT add new dependencies
- Do NOT refactor existing components
- Do NOT change color scheme or typography

**Tests:**
Manual smoke test:
1. Open operator window
2. Verify element appears
3. Verify no visual regressions
```

---

### Template 2: Modify State Logic (MEDIUM Risk)

```markdown
**Task:** [Specific state behavior change]

**Context:**
- Read ARCHITECTURE.md sections: "State Management", "State Update Triggers"
- Read CONSTRAINTS.md section: "State Management Constraints"
- This modifies Zustand store behavior

**Files to Modify:**
- `src/core/stateManager.ts` — [Specific function/action]

**Files NOT to Touch:**
- src/core/bibleRepository.ts (read-only)
- src/components/Projection.tsx (no store access)
- src/core/bibleNormalizer.ts (format logic)

**Requirements:**
1. [Specific change]
2. Preserve single-writer invariant (Operator window only)
3. No new persistence (unless explicitly required)
4. Maintain backward compatibility with existing callers

**Critical Constraints:**
- [ ] No Projection window state writes
- [ ] All localStorage writes wrapped in try/catch
- [ ] Projection must not be blocked by persistence
- [ ] Single funnel (projectSlide) preserved
- [ ] No translation fallbacks

**Acceptance Criteria:**
- [ ] Behavior works as specified
- [ ] No regressions in existing projection flow
- [ ] Tests added (see below)
- [ ] TypeScript compiles
- [ ] Build succeeds

**Tests Required:**
```typescript
// Add to src/test/stateManager.test.ts
describe('[Feature Name]', () => {
  it('should [expected behavior]', () => {
    // Test implementation
  });
  
  it('should not break existing projection', () => {
    // Regression test
  });
});
```

**What NOT to Do:**
- Do NOT introduce new persistence without versioning
- Do NOT bypass the projectSlide funnel
- Do NOT add translation fallback logic
- Do NOT modify Repository (read-only)

**Manual Test:**
1. Open operator window
2. [Specific user action]
3. Verify [expected result]
4. Reload operator window → verify recovery still works
```

---

### Template 3: Add Repository Method (HIGH Risk)

```markdown
**Task:** Add [specific data access method] to BibleRepository

**Context:**
- Read ARCHITECTURE.md sections: "Data Layer", "Navigation Model"
- Read CONSTRAINTS.md section: "Data Fidelity Constraints"
- Repository is READ-ONLY, never mutates app state

**Files to Modify:**
- `src/core/bibleRepository.ts` — Add method [methodName]
- `src/core/types.ts` — Add type [TypeName] (if needed)

**Files NOT to Touch:**
- src/core/stateManager.ts (Repository doesn't call store)
- src/core/bibleNormalizer.ts (unless format change required)

**Requirements:**
1. Method signature: `[methodName](params): ReturnType`
2. Read-only (no mutations)
3. Returns null/empty on failure (never throws in normal use)
4. Takes `translation` parameter explicitly
5. Uses actual verse keys, not arithmetic

**Critical Constraints:**
- [ ] No verse arithmetic (verseNum + 1)
- [ ] No translation fallback (getBooksMap returns empty, not KJV)
- [ ] No text modification
- [ ] No state mutations
- [ ] Uses array index for navigation (findIndex + offset)

**Acceptance Criteria:**
- [ ] Method implemented as specified
- [ ] Returns correct type
- [ ] Handles missing data gracefully (null/empty)
- [ ] Tests pass (see below)
- [ ] No TypeScript errors

**Tests Required:**
```typescript
// Add to src/test/bibleRepository.test.ts
describe('BibleRepository.[methodName]', () => {
  it('should return [expected result] for valid input', () => {
    // ...
  });
  
  it('should return null for missing translation', () => {
    // ...
  });
  
  it('should handle lettered verses (3a, 3b)', () => {
    // Critical for navigation
  });
  
  it('should not fall back to KJV', () => {
    const result = bibleRepository.[methodName]('INVALID');
    expect(result).toBeNull(); // NOT KJV data
  });
});
```

**What NOT to Do:**
- Do NOT add translation fallback logic
- Do NOT use parseInt(verse) for navigation
- Do NOT mutate internal maps
- Do NOT call useStateManager
- Do NOT modify verse text

**Manual Test:**
1. Call method with valid input → verify correct output
2. Call with invalid translation → verify null/empty (not KJV)
3. Test with lettered verses (if applicable)
4. Test chapter/book boundary handling (if applicable)
```

---

### Template 4: Fix a Bug (Variable Risk)

```markdown
**Task:** Fix [specific bug description]

**Context:**
- Bug report: [description]
- Expected behavior: [expected]
- Actual behavior: [actual]
- Read ARCHITECTURE.md sections: [relevant sections]

**Root Cause Analysis:**
[Explain what's causing the bug]

**Files to Modify:**
- [List specific files and functions]

**Files NOT to Touch:**
- [List files that might seem related but shouldn't be changed]

**Fix Strategy:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Constraints Check:**
- [ ] Fix doesn't violate data fidelity rules
- [ ] Fix doesn't introduce verse arithmetic
- [ ] Fix doesn't break single source of truth
- [ ] Fix doesn't add translation fallback
- [ ] Fix is minimal (no "while we're here" refactoring)

**Acceptance Criteria:**
- [ ] Bug no longer reproduces
- [ ] No new bugs introduced
- [ ] Existing tests still pass
- [ ] New test added to prevent regression
- [ ] TypeScript compiles
- [ ] Build succeeds

**Tests Required:**
```typescript
// Regression test
it('should not [bug behavior]', () => {
  // Reproduce bug scenario
  // Assert fix works
});
```

**What NOT to Do:**
- Do NOT refactor unrelated code
- Do NOT "improve" working features
- Do NOT introduce new dependencies
- Do NOT change architecture

**Manual Test:**
1. Reproduce bug with original code (verify it exists)
2. Apply fix
3. Verify bug is resolved
4. Test related functionality (no new bugs)
```

---

### Template 5: Trivial Change (Test FreeBuff Setup)

**Use this for your FIRST FreeBuff prompt to validate the workflow.**

```markdown
**Task:** Add app version number to operator UI footer

**Context:**
- This is a test task to validate FreeBuff + Impeccable workflow
- Read ARCHITECTURE.md section: "UI Layer"
- Minimal risk, no business logic changes

**Files to Modify:**
- `src/components/OperatorScreen.tsx` — Add version display in footer
- `package.json` — Read version from here

**Files NOT to Touch:**
- src/core/* (all core logic)
- src/pages/Projection.tsx (projection window)

**Requirements:**
1. Display version number in bottom-right corner of operator window
2. Format: "v[version]" (e.g., "v1.0.0")
3. Read from package.json
4. Small, unobtrusive text (text-xs, text-gray-400)
5. Does not interfere with existing UI

**Constraints Check:**
- [ ] No state changes
- [ ] No new dependencies
- [ ] No modification of core logic
- [ ] UI layer only

**Acceptance Criteria:**
- [ ] Version displays correctly
- [ ] Reads from package.json (not hardcoded)
- [ ] Styling matches existing design system
- [ ] No console errors
- [ ] Build succeeds

**What NOT to Do:**
- Do NOT modify stateManager
- Do NOT add new npm packages
- Do NOT change existing layout
- Do NOT add complex state logic

**Manual Test:**
1. Open operator window
2. Verify version appears in footer
3. Verify matches package.json version
4. Verify doesn't overlap other UI elements
```

---

## 4. Code Review Checklist

### After FreeBuff Generates Code

**Before you accept ANY code, verify:**

#### Scope Check
- [ ] Only the specified files were modified?
- [ ] No "bonus" refactoring of unrelated code?
- [ ] No new dependencies added without approval?
- [ ] No changes to files in the "NOT to Touch" list?

#### Architecture Check
- [ ] Layer boundaries respected? (UI → Controller → State → Repository)
- [ ] No UI directly calling Repository?
- [ ] No Repository calling State Manager?
- [ ] No circular dependencies introduced?
- [ ] Single source of truth preserved? (Operator window only writes)

#### Constraint Check (Use CONSTRAINTS.md)
- [ ] No verse text modification (`.trim()`, `.normalize()`, etc.)?
- [ ] No translation fallback (`|| 'KJV'`)?
- [ ] No verse arithmetic (`parseInt(verse) + 1`)?
- [ ] No assumption that verse number === array index?
- [ ] All localStorage writes wrapped in try/catch?
- [ ] No new persistence without versioning?
- [ ] Projection window doesn't import useStateManager?

#### Code Quality Check
- [ ] TypeScript types are correct (no `any`)?
- [ ] Functions have clear single responsibility?
- [ ] Error handling is appropriate?
- [ ] No console.log in production code?
- [ ] Comments explain WHY, not WHAT?

#### Test Check
- [ ] Tests were added as specified?
- [ ] Tests actually test the new behavior?
- [ ] Tests include edge cases?
- [ ] Tests include regression prevention?

#### Build Check
```bash
# Run these before accepting:
npm run build  # Must succeed
npm test       # Must pass
npm run type-check  # If you have this script
```

---

### Code Smells to Reject Immediately

**Reject code that contains:**

```typescript
// ❌ REJECT: Verse text modification
verse.text = text.trim();
verse.text = text.replace(/\s+/g, ' ');

// ❌ REJECT: Translation fallback
const books = getBooksMap(translation) || getBooksMap('KJV');

// ❌ REJECT: Verse arithmetic
const nextVerse = String(parseInt(currentVerse) + 1);

// ❌ REJECT: Unguarded localStorage
localStorage.setItem('key', value); // Not in try/catch

// ❌ REJECT: Projection window writing to store
// In Projection.tsx
import { useStateManager } from '@/core/stateManager';

// ❌ REJECT: Any type abuse
const result: any = someFunction();

// ❌ REJECT: Ignoring errors
try { ... } catch {} // Empty catch

// ❌ REJECT: Commented-out code
// const oldImplementation = ...

// ❌ REJECT: Hardcoded values that should be configurable
const MAX_RESULTS = 5; // OK if intentional
const BIBLE_API_URL = '...'; // NOT OK - violates offline-first
```

---

## 5. Testing Requirements

### Test Coverage Rules

**Every change must include tests unless:**
- It's purely visual styling (then manual test required)
- It's documentation only

### Categories of Tests

#### Unit Tests (src/test/*.test.ts)
```typescript
// Test pure functions and isolated logic
describe('BibleRepository.getNextVerse', () => {
  it('should handle lettered verses', () => {
    // Given verses: ["3", "3a", "3b", "4"]
    const next = repo.getNextVerse('John', '3', '3a', 'KJV');
    expect(next?.verse).toBe('3b');
  });
});
```

#### Integration Tests
```typescript
// Test interaction between layers
describe('Projection Flow', () => {
  it('should project verse and persist recovery state', () => {
    const { projectSlide } = useStateManager.getState();
    projectSlide(testSlide, 0);
    
    // Verify state updated
    expect(useStateManager.getState().liveSlideIndex).toBe(0);
    
    // Verify persisted
    const saved = localStorage.getItem('projectionRecoveryState');
    expect(saved).toBeTruthy();
  });
});
```

#### Regression Tests
```typescript
// Test that bugs don't come back
describe('Bug #123 - Navigation skips lettered verses', () => {
  it('should not skip 3a and 3b when navigating', () => {
    // Reproduce the exact bug scenario
    // Assert fix works
  });
});
```

### Critical Test Scenarios (Must Cover)

**Navigation:**
- [ ] Sequential verses (1 → 2 → 3)
- [ ] Lettered verses (3 → 3a → 3b → 4)
- [ ] Non-contiguous verses (1 → 2 → 4)
- [ ] Chapter boundary (last verse → first of next chapter)
- [ ] Book boundary (last verse of book → first of next book)

**Recovery:**
- [ ] Operator reload restores queue
- [ ] Operator reload restores navigation position
- [ ] Projection reload restores displayed passage
- [ ] Stale state (>24h) is ignored

**Persistence:**
- [ ] localStorage quota exceeded (graceful failure)
- [ ] localStorage disabled (graceful failure)
- [ ] IndexedDB unavailable (graceful failure)

**Translation:**
- [ ] Switch translation updates displayed verse
- [ ] Missing translation returns empty, not KJV
- [ ] Different verse structures respected (A has "3a", B doesn't)

### Manual Testing Checklist

**Before every commit, manually test:**

1. **Basic Projection Flow**
   ```
   [ ] Type "John 3:16" → Enter
   [ ] Verse appears on projection window
   [ ] Press → (forward navigation)
   [ ] Press ← (backward navigation)
   ```

2. **Recovery**
   ```
   [ ] Project a verse
   [ ] Navigate to another verse
   [ ] Reload operator window (Ctrl+R / Cmd+R)
   [ ] Verify queue restored
   [ ] Press → (navigation still works)
   ```

3. **Translation Switch**
   ```
   [ ] Project "John 3:16" in KJV
   [ ] Switch to NIV
   [ ] Verify text changes to NIV
   [ ] Verify label shows "NIV"
   ```

4. **Blank Screen**
   ```
   [ ] Press B (blank)
   [ ] Verify projection window shows blank/logo
   [ ] Press B (unblank)
   [ ] Verify verse reappears
   ```

5. **Projection Window Crash**
   ```
   [ ] Close projection window
   [ ] Reopen projection window
   [ ] Verify last verse appears automatically
   ```

---

## 6. Common Tasks & Patterns

### Task: Add a New UI Component

**Safe pattern:**
```typescript
// src/components/MyNewComponent.tsx
import { useStateManager } from '@/core/stateManager';

export function MyNewComponent() {
  // ✅ Subscribe to state (read-only)
  const someValue = useStateManager((state) => state.someValue);
  
  // ✅ Get actions
  const someAction = useStateManager((state) => state.someAction);
  
  return (
    <div>
      <span>{someValue}</span>
      <button onClick={someAction}>Do Something</button>
    </div>
  );
}
```

**Forbidden pattern:**
```typescript
// ❌ WRONG
import { bibleRepository } from '@/core/bibleRepository';

export function MyNewComponent() {
  // ❌ UI calling Repository directly
  const passage = bibleRepository.getPassage(...);
}
```

---

### Task: Add a New State Action

**Safe pattern:**
```typescript
// src/core/stateManager.ts
export const useStateManager = create<StateManager>((set, get) => ({
  // Existing state...
  
  myNewAction: (param: string) => {
    // 1. Validate input
    if (!param) {
      console.warn('Invalid parameter');
      return;
    }
    
    // 2. Query Repository if needed (read-only)
    const data = bibleRepository.getSomeData(param, get().currentTranslation);
    
    // 3. Update state
    set({ someField: data });
    
    // 4. Side effects (broadcast, persist)
    if (data) {
      broadcastSomething(data);
      persistSomething(data);
    }
  }
}));
```

---

### Task: Add a New Repository Method

**Safe pattern:**
```typescript
// src/core/bibleRepository.ts
class BibleRepository {
  getNewData(param: string, translation: string): ResultType | null {
    // 1. Get books for SPECIFIED translation (no fallback)
    const books = this.getBooksMap(translation);
    if (books.size === 0) {
      console.warn(`Translation ${translation} not loaded`);
      return null; // ✅ Fail visibly
    }
    
    // 2. Lookup data
    const result = books.get(param);
    if (!result) {
      return null; // ✅ Missing data returns null
    }
    
    // 3. Return verbatim (no modification)
    return result;
  }
}
```

---

### Task: Modify Navigation Logic

**Safe pattern:**
```typescript
// src/core/bibleRepository.ts
getNextVerse(book: string, chapter: string, verseKey: string, translation: string) {
  const chapterData = this.getChapter(book, chapter, translation);
  if (!chapterData) return null;
  
  // ✅ Find by KEY, not number
  const currentIndex = chapterData.verses.findIndex(v => v.verse === verseKey);
  if (currentIndex === -1) {
    console.warn(`Verse ${verseKey} not found`);
    return null;
  }
  
  // ✅ Use array index, not arithmetic
  const nextVerse = chapterData.verses[currentIndex + 1];
  
  if (nextVerse) {
    return nextVerse;
  }
  
  // Boundary handling
  return this.getFirstVerseOfNextChapter(book, chapter, translation);
}
```

**Forbidden pattern:**
```typescript
// ❌ WRONG
getNextVerse(book: string, chapter: string, verseNum: number) {
  const nextNum = verseNum + 1; // ❌ Arithmetic
  return chapter.verses.find(v => parseInt(v.verse) === nextNum); // ❌ Assumes numeric
}
```

---

## 7. What NOT to Touch

### Files That Should RARELY Change

Unless you have a VERY good reason and explicit approval:

**❌ Do NOT modify:**

```
src/core/bibleNormalizer.ts
```
**Reason:** Handles multiple Bible data formats. Changes here can corrupt all translations.  
**When to modify:** Only when adding support for a new source format.

```
src/core/broadcastSync.ts
```
**Reason:** Message protocol between windows. Breaking changes break communication.  
**When to modify:** Only when adding new message types (versioned carefully).

```
src/core/types.ts
```
**Reason:** Core domain types used everywhere.  
**When to modify:** Only when adding new features that need new types.

```
/public/data/*.zip
```
**Reason:** Bible source data. User-facing content.  
**When to modify:** Only when updating translations or fixing known data errors.

---

### Features That Should NOT Be Removed

**❌ Do NOT remove:**

- Two-window architecture → Single window CSS presenter mode
  - **Reason:** Cannot place content on second physical display

- BroadcastChannel → postMessage or localStorage events
  - **Reason:** Handle-independent, survives refresh

- Preload all translations → Lazy load
  - **Reason:** Mid-service lag is unacceptable

- Index-based navigation → Verse arithmetic
  - **Reason:** Breaks lettered verses (3a, 3b)

- Single source of truth → Distributed state
  - **Reason:** Sync complexity explodes

- Offline-first → API dependency
  - **Reason:** Churches often have no network

---

## 8. Debugging Guide

### Common Issues & Solutions

#### Issue: "Translation not found" warning

**Symptom:**
```
console.warn('Translation NIV not found')
```

**Check:**
1. Is translation loaded? `bibleRepository.translations.has('NIV')`
2. Did preload complete? Check boot sequence
3. Is ZIP file present? Check `/public/data/`

**Fix:**
```typescript
// Ensure preload completed
await preloadAllTranslations();
// Then retry
```

---

#### Issue: Navigation skips verses

**Symptom:**
```
John 3:3 → forward → John 3:4 (skipped 3a, 3b)
```

**Check:**
1. Is verse arithmetic being used? (FORBIDDEN)
2. Is findIndex() being used correctly?

**Fix:**
```typescript
// ✅ CORRECT
const index = verses.findIndex(v => v.verse === currentVerse);
const next = verses[index + 1];

// ❌ WRONG
const next = verses.find(v => v.verse === String(parseInt(currentVerse) + 1));
```

---

#### Issue: Projection window shows stale data after operator action

**Symptom:**
```
Operator projects John 3:17, but projection shows John 3:16
```

**Check:**
1. Is BroadcastChannel message being sent?
2. Is projection window listening?
3. Check browser console for errors

**Debug:**
```typescript
// In stateManager.ts
broadcastCommit(passage);
console.log('Broadcasted:', passage.displayReference);

// In Projection.tsx
channel.addEventListener('message', (e) => {
  console.log('Received:', e.data);
});
```

**Fix:**
- Verify channel name matches: `'bible-projection-sync'`
- Check 3-second SYNC is running
- Verify no console errors

---

#### Issue: localStorage quota exceeded

**Symptom:**
```
QuotaExceededError: Failed to execute 'setItem' on 'Storage'
```

**Check:**
```typescript
// Measure current usage
let total = 0;
for (let key in localStorage) {
  total += localStorage[key].length;
}
console.log(`localStorage usage: ${(total / 1024).toFixed(2)} KB`);
```

**Fix:**
```typescript
// Already wrapped in try/catch (should be graceful)
// If not, wrap:
try {
  localStorage.setItem(key, value);
} catch (err) {
  if (err.name === 'QuotaExceededError') {
    console.error('localStorage full, clearing old data');
    localStorage.removeItem('projectionRecoveryState'); // Safe to clear
  }
}
```

---

#### Issue: Recovery state not restoring

**Symptom:**
```
Operator reload → queue is empty, navigation doesn't work
```

**Check:**
```typescript
// Inspect recovery state
const raw = localStorage.getItem('projectionRecoveryState');
console.log('Recovery state:', JSON.parse(raw));

// Check age
const state = JSON.parse(raw);
const age = Date.now() - state.timestamp;
console.log(`State age: ${(age / 1000 / 60).toFixed(1)} minutes`);
```

**Fix:**
- If >24 hours old → intentionally ignored (stale)
- If invalid structure → validation failed, check schema
- If not being called → verify `initializeRecoveryState()` is called after translation load

---

### Debug Mode

**Enable verbose logging:**

```typescript
// Add to stateManager.ts temporarily
const DEBUG = true;

projectSlide(slide, index, get, set) {
  if (DEBUG) console.log('[projectSlide] slide:', slide);
  
  // ... existing code ...
  
  if (DEBUG) console.log('[projectSlide] state updated:', get());
}
```

**Disable before committing.**

---

## 9. Build & Deployment

### Development Build

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open in browser
# http://localhost:5173 (or whatever Vite uses)
```

### Production Build

```bash
# Clean previous build
rm -rf dist

# Build for production
npm run build

# Preview production build locally
npm run preview
```

### Build Checks

**Before deploying, verify:**

```bash
# 1. TypeScript compiles
npm run build
# Look for: "Build completed successfully"

# 2. No TypeScript errors
npx tsc --noEmit
# Should output nothing (silence = success)

# 3. Tests pass
npm test
# Look for: "Tests passed"

# 4. Bundle size reasonable
ls -lh dist/assets/*.js
# Main bundle should be <5MB
```

### Deployment

```bash
# If using GitHub Pages, Netlify, Vercel, etc.
# Build artifacts are in /dist

# Example: Deploy to GitHub Pages
npm run build
# Commit dist/ folder or use gh-pages branch

# Example: Deploy to Netlify
# Point Netlify to /dist after build
```

---

### Common Build Errors

**Error: "Cannot find module '@/core/...'"**

**Fix:**
```typescript
// Verify tsconfig.json has path alias:
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

---

**Error: "localStorage is not defined"**

**Context:** Server-side rendering or Node environment

**Fix:**
```typescript
// Guard localStorage access
if (typeof window !== 'undefined' && window.localStorage) {
  localStorage.setItem(...);
}
```

---

**Error: "Module not found: Can't resolve '/data/KJV.zip'"**

**Fix:**
- Verify `/public/data/KJV.zip` exists
- Vite serves `/public` at root, so path is `/data/KJV.zip` (not `/public/data/`)

---

## Quick Reference Card

### Before Every Code Change

```
1. [ ] Read relevant ARCHITECTURE.md sections
2. [ ] Check CONSTRAINTS.md for violations
3. [ ] Identify minimum files to change
4. [ ] Write prompt using template
5. [ ] Specify test requirements
```

### After FreeBuff Generates Code

```
1. [ ] Review against checklist (section 4)
2. [ ] Run npm run build
3. [ ] Run npm test
4. [ ] Manual smoke test
5. [ ] Commit with clear message
```

### Red Flags (Reject Immediately)

```
❌ verse.text.trim()
❌ || 'KJV'
❌ parseInt(verse) + 1
❌ localStorage.setItem (not in try/catch)
❌ useStateManager in Projection.tsx
❌ bibleRepository.setState(...)
❌ any type without justification
```

---

## Getting Help

**If you're unsure about a change:**

1. ✅ Read `ARCHITECTURE.md` again
2. ✅ Check `CONSTRAINTS.md` for explicit rules
3. ✅ Look for similar patterns in existing code
4. ✅ Ask in PR review / discussion
5. ✅ Test with trivial change first (Template 5)

**If FreeBuff produces confusing code:**

1. ✅ Ask FreeBuff to explain the changes
2. ✅ Compare with existing patterns
3. ✅ Check if it violates constraints
4. ✅ Reject and refine prompt
5. ✅ DON'T commit code you don't understand

---

## Document Version

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2024 | Initial development guide |

---

**Related Documentation:**
- `ARCHITECTURE.md` — System design
- `CONSTRAINTS.md` — Rules checklist
- `VERIFICATION-RULES.md` — Automated checks
- `TESTING-STRATEGY.md` — Test requirements
- `FREEBUFF-PROMPTING.md` — (Optional) Dedicated prompt guide

---

**END OF DEVELOPMENT.md**
```

---

## What to Do Now

### Step 1: Create the file
```bash
cd docs
touch DEVELOPMENT.md
```

### Step 2: Copy the content
Copy everything from the markdown block above and paste into `docs/DEVELOPMENT.md`.

### Step 3: Commit it
```bash
git add docs/DEVELOPMENT.md
git commit -m "docs: Add comprehensive development guide for FreeBuff workflow"
git push
```

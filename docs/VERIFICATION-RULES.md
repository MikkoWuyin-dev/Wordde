# docs/VERIFICATION-RULES.md

```markdown
# Bible Projection System — Verification Rules

**Purpose:** Automated constraint enforcement for Impeccable (or manual pre-commit checks).  
**Audience:** CI/CD pipelines, pre-commit hooks, code reviewers.  
**Related:** See `CONSTRAINTS.md` for explanations of each rule.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Critical Violations (Auto-Reject)](#2-critical-violations-auto-reject)
3. [Pattern-Based Rules](#3-pattern-based-rules)
4. [File-Based Rules](#4-file-based-rules)
5. [Type-Based Rules](#5-type-based-rules)
6. [Build-Time Rules](#6-build-time-rules)
7. [Test Coverage Rules](#7-test-coverage-rules)
8. [Pre-Commit Checklist](#8-pre-commit-checklist)
9. [Pre-Deploy Checklist](#9-pre-deploy-checklist)
10. [Impeccable Configuration](#10-impeccable-configuration)

---

## 1. Overview

### Rule Severity Levels

| Level | Action | Examples |
|---|---|---|
| **CRITICAL** | ❌ Auto-reject commit | Verse text modification, translation fallback |
| **ERROR** | 🚫 Block PR merge | Unguarded localStorage, verse arithmetic |
| **WARNING** | ⚠️ Requires manual review | Large diffs, missing tests |
| **INFO** | ℹ️ Log only | Code style suggestions |

### Verification Stages

```
Code Change
    ↓
Pre-Commit Hooks (local)
    ↓ (pass)
CI Pipeline (GitHub Actions / etc.)
    ↓ (pass)
Manual Review
    ↓ (approved)
Merge to Main
    ↓
Pre-Deploy Checks
    ↓ (pass)
Deploy
```

---

## 2. Critical Violations (Auto-Reject)

### Rule: VF-001 — No Verse Text Modification

**Severity:** CRITICAL ❌

**Description:** Verse text must be preserved byte-for-byte from source.

**Forbidden Patterns:**
```typescript
// ❌ REJECT
verse.text = rawText.trim();
verse.text = rawText.replace(/\s+/g, ' ');
verse.text = rawText.normalize('NFC');
verse.text = rawText.toLowerCase();
verse.text = rawText.toUpperCase();
text.split('\n').join(' ');
```

**Regex Detection:**
```regex
verse\.text\s*=.*\.(trim|replace|normalize|toLowerCase|toUpperCase)\(
text.*\.(trim|replace|normalize|split)
```

**Allowed Exceptions:** NONE

**Manual Check:**
- Search codebase for `.text =` assignments
- Verify right-hand side is raw source data only

---

### Rule: VF-002 — No Translation Fallback

**Severity:** CRITICAL ❌

**Description:** Never silently substitute a different translation.

**Forbidden Patterns:**
```typescript
// ❌ REJECT
const books = getBooksMap(translation) || getBooksMap('KJV');
const passage = getPassage(ref, 'NIV') ?? getPassage(ref, 'KJV');
return books || this.translations.get('KJV');
translation = translation || 'KJV';
```

**Regex Detection:**
```regex
getBooksMap\([^)]+\)\s*\|\|\s*getBooksMap\(['"]KJV['"]\)
getPassage\([^)]+\)\s*\?\?\s*getPassage\([^,]+,\s*['"]KJV['"]\)
\|\|\s*['"]KJV['"]
\?\?\s*['"]KJV['"]
```

**Allowed Exceptions:**
- Default at initialization: `currentTranslation = 'KJV'` (startup only)
- Explicit user choice: `setTranslation('KJV')` (user action)

**Manual Check:**
- Every `getBooksMap()` call returns empty Map on failure, never fallback
- Every `getPassage()` call returns null on failure, never fallback

---

### Rule: VF-003 — No Verse Arithmetic

**Severity:** CRITICAL ❌

**Description:** Navigation must use array indices, not verse number arithmetic.

**Forbidden Patterns:**
```typescript
// ❌ REJECT
const nextVerse = parseInt(currentVerse) + 1;
const prevVerse = parseInt(currentVerse) - 1;
verse.verse = String(Number(verse.verse) + 1);
verseNum++;
verseNum--;
const next = `${parseInt(verse) + 1}`;
```

**Regex Detection:**
```regex
parseInt\s*\([^)]*verse[^)]*\)\s*[\+\-]\s*\d
Number\s*\([^)]*verse[^)]*\)\s*[\+\-]
verse(Num|Number|Key)\s*[\+\-][\+\-]
verse(Num|Number|Key)\s*[\+\-]=
```

**Allowed Pattern:**
```typescript
// ✅ CORRECT
const currentIndex = verses.findIndex(v => v.verse === verseKey);
const nextVerse = verses[currentIndex + 1];
```

**Manual Check:**
- All `getNextVerse` / `getPreviousVerse` use `findIndex()`
- All navigation uses array offset, not key arithmetic

---

### Rule: VF-004 — No Projection Window State Writes

**Severity:** CRITICAL ❌

**Description:** Projection window is read-only, never writes to Zustand store.

**Forbidden Patterns:**
```typescript
// ❌ REJECT - in Projection.tsx or any /projection route file
import { useStateManager } from '@/core/stateManager';
const setState = useStateManager(state => state.setState);
setState({ ... });
useStateManager.getState().someAction();
```

**File-Based Check:**
```bash
# These files must NEVER import stateManager
src/pages/Projection.tsx
src/components/projection/*
```

**Regex Detection in Projection Window Files:**
```regex
import.*useStateManager.*from.*stateManager
useStateManager\.getState\(\)\.(?!currentTranslation|committedPassage|isScreenBlanked)
```

**Allowed in Projection Window:**
- Read-only imports for types: `import type { Passage } from '@/core/types'`
- Local React state: `useState`, `useEffect`

**Manual Check:**
- `grep -r "useStateManager" src/pages/Projection.tsx` → should return NOTHING
- Projection window only uses BroadcastChannel messages to update local state

---

### Rule: VF-005 — No Unguarded localStorage Writes

**Severity:** ERROR 🚫

**Description:** All localStorage writes must be wrapped in try/catch.

**Forbidden Patterns:**
```typescript
// ❌ REJECT
localStorage.setItem('key', value);
localStorage.removeItem('key');
localStorage.clear();

// Without try/catch around them
```

**Required Pattern:**
```typescript
// ✅ CORRECT
try {
  localStorage.setItem('key', value);
} catch (err) {
  console.error('localStorage write failed:', err);
  // Graceful fallback
}
```

**Regex Detection:**
```regex
localStorage\.(setItem|removeItem|clear)\s*\(
# Then check: is this inside a try block?
```

**Allowed Exceptions:**
- Inside existing helper functions that already have try/catch
- Test files (mock environment)

**Manual Check:**
- Search for `localStorage.setItem`
- Verify each is inside a try block
- Verify catch block doesn't re-throw (unless critical startup)

---

## 3. Pattern-Based Rules

### Rule: VP-001 — No Direct UI → Repository Calls

**Severity:** ERROR 🚫

**Description:** UI components must not directly import or call bibleRepository.

**Forbidden Patterns:**
```typescript
// ❌ REJECT - in any component file
import { bibleRepository } from '@/core/bibleRepository';

function MyComponent() {
  const passage = bibleRepository.getPassage(...);
}
```

**Allowed Pattern:**
```typescript
// ✅ CORRECT
import { useStateManager } from '@/core/stateManager';

function MyComponent() {
  const passage = useStateManager(state => state.committedPassage);
}
```

**Detection:**
```bash
# Check all component files
find src/components -name "*.tsx" -exec grep -l "bibleRepository" {} \;
# Should return EMPTY (or only type imports)
```

---

### Rule: VP-002 — No Repository State Mutations

**Severity:** ERROR 🚫

**Description:** BibleRepository is read-only, never mutates app state.

**Forbidden Patterns:**
```typescript
// ❌ REJECT - in bibleRepository.ts
import { useStateManager } from './stateManager';

class BibleRepository {
  getPassage() {
    useStateManager.setState({ ... }); // NEVER
  }
}
```

**Detection:**
```bash
# In bibleRepository.ts
grep -n "useStateManager" src/core/bibleRepository.ts
grep -n "setState" src/core/bibleRepository.ts
# Should return EMPTY
```

---

### Rule: VP-003 — No Hardcoded Verse Assumptions

**Severity:** WARNING ⚠️

**Description:** Don't assume verses start at 1, are contiguous, or numeric.

**Suspicious Patterns:**
```typescript
// ⚠️ WARNING - requires manual review
const firstVerse = chapter.verses[0]; // Assumes verse exists
for (let i = 1; i <= 31; i++) { ... } // Assumes contiguous 1-31
if (verseNum < verses.length) { ... } // Confuses number with index
```

**Preferred Patterns:**
```typescript
// ✅ CORRECT
const firstVerse = chapter.verses[0] || null;
const verseKeys = chapter.verses.map(v => v.verse); // Actual keys
```

---

### Rule: VP-004 — No Network Calls for Bible Data

**Severity:** CRITICAL ❌

**Description:** All Bible data is local, no API calls.

**Forbidden Patterns:**
```typescript
// ❌ REJECT
fetch('/api/verses');
fetch('https://bible-api.com/...');
axios.get('/verses');
```

**Allowed:**
- `fetch('/data/*.zip')` — Loading local static assets

**Detection:**
```regex
fetch\s*\(\s*['"`]/api
fetch\s*\(\s*['"`]https?://(?!localhost)
axios\.(get|post)
```

---

### Rule: VP-005 — No Empty Catch Blocks

**Severity:** WARNING ⚠️

**Description:** Catch blocks must handle or log errors.

**Forbidden Patterns:**
```typescript
// ❌ REJECT
try {
  doSomething();
} catch (err) {
  // Silent failure
}

try {
  doSomething();
} catch {} // Empty
```

**Required Pattern:**
```typescript
// ✅ CORRECT
try {
  doSomething();
} catch (err) {
  console.error('Operation failed:', err);
  // Graceful fallback or propagate
}
```

---

## 4. File-Based Rules

### Rule: VF-100 — Protected Files

**Severity:** WARNING ⚠️

**Description:** These files should RARELY change. Require manual approval.

**Protected Files:**
```
src/core/bibleNormalizer.ts      # Format parsing
src/core/broadcastSync.ts        # Message protocol
src/core/types.ts                # Core domain types
/public/data/*.zip               # Bible source data
```

**When Changed:**
- [ ] Requires explicit justification in PR description
- [ ] Requires architectural review
- [ ] Requires extensive testing
- [ ] May require migration plan (breaking changes)

**Detection:**
```bash
# In CI pipeline
git diff --name-only origin/main | grep -E "(bibleNormalizer|broadcastSync|types\.ts|public/data)"
# If matches, flag for manual review
```

---

### Rule: VF-101 — Forbidden File Modifications

**Severity:** CRITICAL ❌

**Description:** These files must NEVER be modified by automated tools.

**Forbidden:**
```
/public/data/*.zip               # Bible data (curated externally)
docs/ARCHITECTURE.md             # Human-maintained
docs/CONSTRAINTS.md              # Human-maintained
docs/DEVELOPMENT.md              # Human-maintained
docs/VERIFICATION-RULES.md       # This file
```

**Allowed Changes:**
- Human edits only
- Version control tracked
- PR review required

---

### Rule: VF-102 — Projection Window Isolation

**Severity:** ERROR 🚫

**Description:** Projection window files must not import from core state management.

**Projection Window Files:**
```
src/pages/Projection.tsx
src/components/projection/*
Any file in /projection route
```

**Forbidden Imports in These Files:**
```typescript
// ❌ REJECT
import { useStateManager } from '@/core/stateManager';
import { bibleRepository } from '@/core/bibleRepository';
import { ... } from '@/core/inputController';
```

**Allowed Imports:**
```typescript
// ✅ CORRECT
import type { Passage, Slide } from '@/core/types';
import { loadBlankSettings } from '@/core/broadcastSync';
```

**Detection:**
```bash
# Check projection files
grep -r "from.*stateManager" src/pages/Projection.tsx src/components/projection/
# Should return EMPTY
```

---

## 5. Type-Based Rules

### Rule: VT-001 — No Promiscuous `any` Types

**Severity:** WARNING ⚠️

**Description:** Avoid `any` type without explicit justification.

**Forbidden Patterns:**
```typescript
// ⚠️ WARNING - requires justification
const data: any = ...;
function doSomething(param: any) { ... }
```

**Allowed Exceptions:**
- JSON.parse results (immediately cast to known type)
- Third-party library types that are genuinely unknown
- Temporary during refactoring (with TODO comment)

**Detection:**
```bash
# Count any types
grep -r ": any" src/ | wc -l
# Flag if increasing
```

---

### Rule: VT-002 — Verse/Chapter Keys Are Strings

**Severity:** ERROR 🚫

**Description:** Verse and chapter identifiers must be typed as `string`, never `number`.

**Forbidden Patterns:**
```typescript
// ❌ REJECT
interface Verse {
  verse: number; // WRONG
  text: string;
}

function getVerse(verseNum: number) { ... } // WRONG
```

**Required Pattern:**
```typescript
// ✅ CORRECT
interface Verse {
  verse: string; // Supports "3a", "3b", etc.
  text: string;
}

function getVerse(verseKey: string) { ... }
```

**Manual Check:**
- Review all type definitions in `src/core/types.ts`
- Ensure verse/chapter identifiers are `string`

---

## 6. Build-Time Rules

### Rule: VB-001 — TypeScript Must Compile

**Severity:** CRITICAL ❌

**Command:**
```bash
npx tsc --noEmit
```

**Expected Output:** (silence = success)

**If Fails:** Auto-reject commit

---

### Rule: VB-002 — Production Build Must Succeed

**Severity:** CRITICAL ❌

**Command:**
```bash
npm run build
```

**Expected Output:**
```
✓ built in [time]
```

**If Fails:** Auto-reject commit

---

### Rule: VB-003 — Bundle Size Limit

**Severity:** WARNING ⚠️

**Description:** Main bundle should stay under 5MB.

**Command:**
```bash
npm run build
ls -lh dist/assets/*.js
```

**Threshold:**
- Main JS bundle: < 5 MB (compressed)
- Total assets: < 10 MB

**If Exceeds:** Flag for manual review (possible dependency bloat)

---

### Rule: VB-004 — No Console Errors in Production Build

**Severity:** ERROR 🚫

**Description:** Production build must not contain `console.error` in hot paths.

**Allowed:**
- `console.error` inside catch blocks (error handling)
- `console.warn` for recoverable issues

**Forbidden:**
```typescript
// ❌ REJECT in production code
console.error('Debug info'); // Use console.log in dev, remove in prod
```

**Detection:**
```bash
# Search production build output
grep -r "console.error" dist/assets/*.js
# Review each occurrence
```

---

## 7. Test Coverage Rules

### Rule: VC-001 — All Tests Must Pass

**Severity:** CRITICAL ❌

**Command:**
```bash
npm test
```

**Expected Output:**
```
Tests: X passed, X total
```

**If Fails:** Auto-reject commit

---

### Rule: VC-002 — New Features Require Tests

**Severity:** ERROR 🚫

**Description:** New functionality must include tests.

**Exceptions:**
- Purely visual styling (requires manual test)
- Documentation changes

**Detection:**
```bash
# If new .ts/.tsx files added, check for corresponding .test.ts
git diff --name-only --diff-filter=A | grep -E "\.(ts|tsx)$"
# For each, verify .test.ts exists or manual test documented
```

---

### Rule: VC-003 — Critical Scenarios Covered

**Severity:** WARNING ⚠️

**Description:** These scenarios must have automated tests.

**Required Test Coverage:**

**Navigation:**
- [ ] Sequential verses (1 → 2 → 3)
- [ ] Lettered verses (3 → 3a → 3b → 4)
- [ ] Non-contiguous verses (1 → 2 → 4)
- [ ] Chapter boundary
- [ ] Book boundary

**Recovery:**
- [ ] Operator reload restores queue
- [ ] Operator reload restores indexes
- [ ] Stale state (>24h) ignored

**Translation:**
- [ ] Missing translation returns empty, not KJV
- [ ] Switch translation updates displayed verse

**Persistence:**
- [ ] localStorage quota exceeded (graceful)
- [ ] localStorage disabled (graceful)

**Detection:**
```bash
# Check test files for these scenarios
grep -r "lettered verses" src/test/
grep -r "chapter boundary" src/test/
# etc.
```

---

## 8. Pre-Commit Checklist

### Automated Checks (Run Locally)

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "Running pre-commit checks..."

# 1. TypeScript compilation
echo "1. TypeScript check..."
npx tsc --noEmit
if [ $? -ne 0 ]; then
  echo "❌ TypeScript errors found"
  exit 1
fi

# 2. Build
echo "2. Build check..."
npm run build > /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Build failed"
  exit 1
fi

# 3. Tests
echo "3. Running tests..."
npm test
if [ $? -ne 0 ]; then
  echo "❌ Tests failed"
  exit 1
fi

# 4. Forbidden patterns
echo "4. Constraint checks..."

# VF-001: Verse text modification
if git diff --cached | grep -E "verse\.text.*\.(trim|replace|normalize)"; then
  echo "❌ CRITICAL: Verse text modification detected (VF-001)"
  exit 1
fi

# VF-002: Translation fallback
if git diff --cached | grep -E "\|\|\s*['\"]KJV['\"]"; then
  echo "❌ CRITICAL: Translation fallback detected (VF-002)"
  exit 1
fi

# VF-003: Verse arithmetic
if git diff --cached | grep -E "parseInt\s*\([^)]*verse[^)]*\)\s*[\+\-]"; then
  echo "❌ CRITICAL: Verse arithmetic detected (VF-003)"
  exit 1
fi

# VF-005: Unguarded localStorage (WARNING only, not blocking)
if git diff --cached | grep -E "localStorage\.(setItem|removeItem)" | grep -v "try"; then
  echo "⚠️  WARNING: Unguarded localStorage detected (VF-005)"
  echo "   Verify all writes are wrapped in try/catch"
fi

echo "✅ All pre-commit checks passed"
```

### Manual Pre-Commit Review

- [ ] Read the diff yourself
- [ ] Check against `CONSTRAINTS.md`
- [ ] Verify only intended files changed
- [ ] Confirm tests cover new behavior
- [ ] Write descriptive commit message

---

## 9. Pre-Deploy Checklist

### Before Merging to Main

- [ ] All automated checks pass (CI green)
- [ ] Manual code review completed
- [ ] No critical violations
- [ ] Tests cover changes
- [ ] Documentation updated (if needed)
- [ ] No new `TODO` or `FIXME` comments (or explicitly tracked)

### Before Production Deployment

- [ ] Production build succeeds
- [ ] Manual smoke test:
  ```
  [ ] Open operator window
  [ ] Project a verse (John 3:16)
  [ ] Navigate forward/backward
  [ ] Switch translation
  [ ] Reload operator window → verify recovery
  [ ] Close/reopen projection window → verify recovery
  [ ] Blank/unblank screen
  ```
- [ ] No console errors in browser dev tools
- [ ] Performance acceptable (projection <1s)
- [ ] Works on target browsers (Chrome, Edge, Firefox)

---

## 10. Impeccable Configuration

### Setup Instructions

**1. Install Impeccable** (if using)
```bash
# Follow Impeccable installation guide
# npm install -D impeccable (or however it's installed)
```

**2. Create `.impeccable.yml` Configuration**

```yaml
# .impeccable.yml
version: 1

rules:
  # Critical violations
  - id: VF-001
    name: No verse text modification
    severity: critical
    pattern: 'verse\.text\s*=.*\.(trim|replace|normalize|toLowerCase|toUpperCase)'
    message: "Verse text must be preserved verbatim (CONSTRAINTS.md)"
    
  - id: VF-002
    name: No translation fallback
    severity: critical
    pattern: '(getBooksMap|getPassage).*\|\|.*[''"]KJV[''"]'
    message: "Translation fallback forbidden (CONSTRAINTS.md VF-002)"
    
  - id: VF-003
    name: No verse arithmetic
    severity: critical
    pattern: 'parseInt\s*\([^)]*verse[^)]*\)\s*[\+\-]\s*\d'
    message: "Use array index navigation, not verse arithmetic (CONSTRAINTS.md VF-003)"
    
  - id: VF-004
    name: No projection window state writes
    severity: critical
    files: 
      - 'src/pages/Projection.tsx'
      - 'src/components/projection/**'
    pattern: 'import.*useStateManager|useStateManager\.getState\(\)\.'
    message: "Projection window is read-only (ARCHITECTURE.md)"
    
  - id: VF-005
    name: Unguarded localStorage writes
    severity: error
    pattern: 'localStorage\.(setItem|removeItem|clear)'
    exclude_pattern: 'try\s*\{[^}]*localStorage'
    message: "Wrap localStorage writes in try/catch (CONSTRAINTS.md)"
    
  # Pattern-based violations
  - id: VP-001
    name: UI components calling Repository
    severity: error
    files: 'src/components/**/*.tsx'
    pattern: 'import.*bibleRepository.*from'
    message: "UI must not directly call Repository (DEVELOPMENT.md)"
    
  - id: VP-004
    name: Network calls for Bible data
    severity: critical
    pattern: 'fetch\s*\(\s*[''"`]/api|fetch\s*\(\s*[''"`]https?://(?!localhost)'
    message: "Bible data must be offline-first (ARCHITECTURE.md)"
    
  # Type-based rules
  - id: VT-002
    name: Verse keys must be strings
    severity: error
    files: 'src/core/types.ts'
    pattern: 'verse:\s*number'
    message: "Verse/chapter keys are strings, not numbers (supports '3a', '3b')"

ignore:
  - 'src/test/**'
  - 'node_modules/**'
  - 'dist/**'
  - 'docs/**'

```

**3. Add Pre-Commit Hook**

```bash
# .husky/pre-commit or .git/hooks/pre-commit
#!/bin/sh

# Run Impeccable
npx impeccable check

# Run tests
npm test

# Run build
npm run build
```

**4. CI Integration (GitHub Actions)**

```yaml
# .github/workflows/verify.yml
name: Verify

on: [push, pull_request]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: 18
          
      - name: Install dependencies
        run: npm install
        
      - name: Run Impeccable
        run: npx impeccable check
        
      - name: TypeScript check
        run: npx tsc --noEmit
        
      - name: Run tests
        run: npm test
        
      - name: Build
        run: npm run build
```

---

### Alternative: Manual Verification Script

If not using Impeccable, create a manual check script:

```bash
#!/bin/bash
# scripts/verify.sh

echo "🔍 Running verification checks..."

errors=0

# VF-001: Verse text modification
echo "Checking VF-001 (verse text modification)..."
if grep -r "verse\.text.*\.\(trim\|replace\|normalize\)" src/core src/components --exclude-dir=test; then
  echo "❌ VF-001 CRITICAL: Verse text modification detected"
  errors=$((errors + 1))
fi

# VF-002: Translation fallback
echo "Checking VF-002 (translation fallback)..."
if grep -r "|| ['\"]KJV['\"]" src/core --exclude-dir=test; then
  echo "❌ VF-002 CRITICAL: Translation fallback detected"
  errors=$((errors + 1))
fi

# VF-003: Verse arithmetic
echo "Checking VF-003 (verse arithmetic)..."
if grep -r "parseInt.*verse.*[\+\-]" src/core --exclude-dir=test; then
  echo "❌ VF-003 CRITICAL: Verse arithmetic detected"
  errors=$((errors + 1))
fi

# VF-004: Projection window state writes
echo "Checking VF-004 (projection window isolation)..."
if grep -r "useStateManager" src/pages/Projection.tsx src/components/projection 2>/dev/null; then
  echo "❌ VF-004 CRITICAL: Projection window writing to state"
  errors=$((errors + 1))
fi

# VF-005: Unguarded localStorage
echo "Checking VF-005 (unguarded localStorage)..."
unguarded=$(grep -r "localStorage\.setItem" src/ --exclude-dir=test | grep -v "try")
if [ ! -z "$unguarded" ]; then
  echo "⚠️  VF-005 WARNING: Unguarded localStorage detected"
  echo "$unguarded"
fi

# VP-001: UI → Repository
echo "Checking VP-001 (UI calling Repository)..."
if grep -r "from.*bibleRepository" src/components --exclude-dir=test | grep -v "type.*from"; then
  echo "❌ VP-001 ERROR: UI component calling Repository directly"
  errors=$((errors + 1))
fi

# Build & Test
echo "Running TypeScript check..."
npx tsc --noEmit
if [ $? -ne 0 ]; then
  echo "❌ TypeScript errors found"
  errors=$((errors + 1))
fi

echo "Running tests..."
npm test
if [ $? -ne 0 ]; then
  echo "❌ Tests failed"
  errors=$((errors + 1))
fi

echo "Running build..."
npm run build > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "❌ Build failed"
  errors=$((errors + 1))
fi

# Summary
echo ""
if [ $errors -eq 0 ]; then
  echo "✅ All verification checks passed"
  exit 0
else
  echo "❌ $errors verification check(s) failed"
  exit 1
fi
```

**Make executable:**
```bash
chmod +x scripts/verify.sh
```

**Run before commit:**
```bash
./scripts/verify.sh
```

---

## Quick Reference

### Command Summary

```bash
# Full verification suite
./scripts/verify.sh

# Individual checks
npx tsc --noEmit           # TypeScript
npm test                   # Tests
npm run build              # Build
npx impeccable check       # Constraint violations (if using Impeccable)

# Pre-commit
git add .
./scripts/verify.sh        # Run checks
git commit -m "..."        # Commit if passes
```

### Severity Response Guide

| Severity | Action |
|---|---|
| ❌ CRITICAL | Stop immediately, reject code, revert if committed |
| 🚫 ERROR | Block PR merge, require fix before proceeding |
| ⚠️ WARNING | Flag for manual review, may proceed with justification |
| ℹ️ INFO | Informational only, no action required |

---

## Document Version

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2024 | Initial verification rules |

---

**Related Documentation:**
- `ARCHITECTURE.md` — System design
- `CONSTRAINTS.md` — Human-readable rules
- `DEVELOPMENT.md` — Development workflow
- `TESTING-STRATEGY.md` — Test requirements

---

**END OF VERIFICATION-RULES.md**
```

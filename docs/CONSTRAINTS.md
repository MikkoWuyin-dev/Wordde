# docs/CONSTRAINTS.md

```markdown
# Bible Projection System — Constraints & Invariants

**Purpose:** Quick-reference guide for inviolable architectural rules.  
**Audience:** Developers, AI agents (FreeBuff), code reviewers, Impeccable verification rules.  
**Related:** See `ARCHITECTURE.md` for detailed explanations.

---

## Table of Contents

1. [Data Fidelity Constraints](#1-data-fidelity-constraints)
2. [Architectural Constraints](#2-architectural-constraints)
3. [State Management Constraints](#3-state-management-constraints)
4. [Navigation Constraints](#4-navigation-constraints)
5. [Performance Constraints](#5-performance-constraints)
6. [User Experience Constraints](#6-user-experience-constraints)
7. [Security & Privacy Constraints](#7-security--privacy-constraints)
8. [Quick Verification Checklist](#8-quick-verification-checklist)

---

## 1. Data Fidelity Constraints

### ❌ NEVER

1. **Modify verse text in any way**
   ```typescript
   // ❌ FORBIDDEN
   verse.text = rawText.trim();
   verse.text = rawText.replace(/\s+/g, ' ');
   verse.text = rawText.normalize('NFC');
   verse.text = rawText.toLowerCase();
   ```
   
2. **Fall back to a different translation**
   ```typescript
   // ❌ FORBIDDEN
   const books = getBooksMap(translation) || getBooksMap('KJV');
   const passage = getPassage(ref, 'NIV') ?? getPassage(ref, 'KJV');
   ```

3. **Invent verse keys that don't exist in source data**
   ```typescript
   // ❌ FORBIDDEN
   const nextVerse = `${parseInt(currentVerse) + 1}`; // Manufacturing keys
   ```

4. **Assume verse keys are contiguous integers**
   ```typescript
   // ❌ FORBIDDEN
   for (let i = 1; i <= 31; i++) {
     const verse = verses.find(v => v.verse === String(i));
   }
   ```

5. **Normalize whitespace in scripture**
   ```typescript
   // ❌ FORBIDDEN
   text.replace(/\n/g, ' ');  // Newlines may be intentional
   text.replace(/\s+/g, ' '); // Multiple spaces may be intentional
   ```

### ✅ ALWAYS

1. **Preserve verse text byte-for-byte from source**
   ```typescript
   // ✅ CORRECT
   verse.text = rawData.text; // No transformation
   ```

2. **Return empty/null when data is missing**
   ```typescript
   // ✅ CORRECT
   if (!translation) {
     console.warn(`Translation ${code} not found`);
     return new Map(); // Empty, not fallback
   }
   ```

3. **Use actual verse keys from normalized data**
   ```typescript
   // ✅ CORRECT
   const verse = chapter.verses.find(v => v.verse === verseKey);
   ```

4. **Validate data structure during normalization**
   ```typescript
   // ✅ CORRECT
   if (!Array.isArray(rawData.chapters)) {
     throw new Error('Invalid Bible data: chapters must be array');
   }
   ```

---

## 2. Architectural Constraints

### ❌ NEVER

1. **Introduce a backend or database**
   ```typescript
   // ❌ FORBIDDEN
   fetch('/api/verses'); // No API calls for Bible data
   const db = new SQL.Database(); // No local database
   ```

2. **Make Projection window write to Zustand store**
   ```typescript
   // ❌ FORBIDDEN - in Projection.tsx
   import { useStateManager } from '@/core/stateManager';
   const setState = useStateManager((state) => state.setState);
   ```

3. **Allow UI components to directly call Repository**
   ```typescript
   // ❌ FORBIDDEN
   import { bibleRepository } from '@/core/bibleRepository';
   
   function MyComponent() {
     const passage = bibleRepository.getPassage(...); // NO
   }
   ```

4. **Let Repository mutate application state**
   ```typescript
   // ❌ FORBIDDEN - in bibleRepository.ts
   class BibleRepository {
     getPassage() {
       useStateManager.setState({ currentPassage: ... }); // NO
     }
   }
   ```

5. **Use `postMessage` on window handle instead of BroadcastChannel**
   ```typescript
   // ❌ FORBIDDEN
   const projWindow = window.open('/projection');
   projWindow.postMessage({ ... }); // Breaks on refresh
   ```

6. **Introduce circular dependencies between layers**
   ```typescript
   // ❌ FORBIDDEN
   // stateManager.ts
   import { handleInput } from './inputController';
   
   // inputController.ts
   import { useStateManager } from './stateManager'; // Circular!
   ```

### ✅ ALWAYS

1. **Maintain offline-first architecture**
   ```typescript
   // ✅ CORRECT
   // All Bible text in /public/data/*.zip
   // No network calls for core functionality
   ```

2. **Preserve single source of truth (Operator window)**
   ```
   Operator Window (Zustand) → BroadcastChannel → Projection Window (React state)
   ```

3. **Respect layer boundaries**
   ```
   UI → Controller → State → Repository/Persistence/Broadcast
   ```

4. **Use BroadcastChannel for window communication**
   ```typescript
   // ✅ CORRECT
   const channel = new BroadcastChannel('bible-projection-sync');
   channel.postMessage({ type: 'COMMIT_PASSAGE', payload });
   ```

5. **Keep Projection window as pure subscriber**
   ```typescript
   // ✅ CORRECT - Projection.tsx
   const [passage, setPassage] = useState<Passage | null>(null);
   
   useEffect(() => {
     const handler = (event: MessageEvent) => {
       if (event.data.type === 'COMMIT_PASSAGE') {
         setPassage(event.data.payload); // Local state only
       }
     };
     channel.addEventListener('message', handler);
   }, []);
   ```

---

## 3. State Management Constraints

### ❌ NEVER

1. **Persist search/preview state**
   ```typescript
   // ❌ FORBIDDEN
   localStorage.setItem('searchQuery', query);
   localStorage.setItem('previewPassage', passage);
   ```

2. **Persist projection lock state**
   ```typescript
   // ❌ FORBIDDEN
   localStorage.setItem('projectionLocked', 'true');
   ```

3. **Store Bible text in localStorage or Zustand**
   ```typescript
   // ❌ FORBIDDEN
   set({ allVerses: [...31000 verses...] }); // Too large, already in Repository
   ```

4. **Let persistence failure prevent projection**
   ```typescript
   // ❌ FORBIDDEN
   localStorage.setItem('recoveryState', state); // Unguarded
   projectSlide(); // If above throws, projection blocked
   ```

5. **Introduce multiple sources of truth**
   ```typescript
   // ❌ FORBIDDEN
   // Both windows maintaining independent state
   ```

### ✅ ALWAYS

1. **Persist only navigation-critical state**
   ```typescript
   // ✅ CORRECT
   interface ProjectionRecoveryState {
     version: number;
     queue: Slide[];
     currentSlideIndex: number;
     liveSlideIndex: number;
     committedPassage: Passage | null;
     isScreenBlanked: boolean;
     currentTranslation: string;
     timestamp: number;
   }
   ```

2. **Wrap all localStorage writes in try/catch**
   ```typescript
   // ✅ CORRECT
   try {
     localStorage.setItem(key, JSON.stringify(value));
   } catch (err) {
     console.error('Persistence failed, continuing:', err);
     // Projection still works
   }
   ```

3. **Use versioned schemas for persisted data**
   ```typescript
   // ✅ CORRECT
   const RECOVERY_VERSION = 1;
   const state = { version: RECOVERY_VERSION, ...data };
   ```

4. **Validate persisted data on read**
   ```typescript
   // ✅ CORRECT
   const raw = localStorage.getItem('recoveryState');
   if (!raw) return null;
   
   const state = JSON.parse(raw);
   if (state.version !== RECOVERY_VERSION) return null;
   if (!Array.isArray(state.queue)) return null;
   ```

5. **Funnel all projections through single function**
   ```typescript
   // ✅ CORRECT
   // Only projectSlide() calls broadcastCommit and persistRecoveryState
   ```

---

## 4. Navigation Constraints

### ❌ NEVER

1. **Use arithmetic to calculate next/previous verse**
   ```typescript
   // ❌ FORBIDDEN
   const nextVerse = parseInt(currentVerse) + 1;
   const prevVerse = parseInt(currentVerse) - 1;
   ```

2. **Assume verse number equals array index**
   ```typescript
   // ❌ FORBIDDEN
   const verse = chapter.verses[verseNumber]; // Wrong if verses = ["3", "3a", "3b", "4"]
   ```

3. **Use `parseInt()` for verse navigation**
   ```typescript
   // ❌ FORBIDDEN
   const verseNum = parseInt(verseKey);
   const next = verses.find(v => v.verse === String(verseNum + 1));
   ```

4. **Hard-code verse assumptions (e.g., chapters start at 1)**
   ```typescript
   // ❌ FORBIDDEN
   const firstVerse = chapter.verses[0]; // Assumes verse "1" exists
   ```

5. **Navigate without checking current translation**
   ```typescript
   // ❌ FORBIDDEN
   getNextVerse(book, chapter, verse); // Missing translation parameter
   ```

### ✅ ALWAYS

1. **Find verse by KEY, then use array INDEX**
   ```typescript
   // ✅ CORRECT
   const currentIndex = chapter.verses.findIndex(v => v.verse === verseKey);
   if (currentIndex === -1) return null;
   
   const nextVerse = chapter.verses[currentIndex + 1];
   ```

2. **Use normalized array order as canonical sequence**
   ```typescript
   // ✅ CORRECT
   // Given: ["3", "3a", "3b", "4"]
   // "3" → index 0 → next index 1 → "3a"
   // "3a" → index 1 → next index 2 → "3b"
   ```

3. **Handle chapter/book boundaries with actual data**
   ```typescript
   // ✅ CORRECT
   if (!nextVerse) {
     return getFirstVerseOfNextChapter(book, chapter, translation);
   }
   ```

4. **Respect translation-specific verse structures**
   ```typescript
   // ✅ CORRECT
   // Translation A might have ["3", "3a", "3b", "4"]
   // Translation B might have ["3", "4"]
   // Navigation follows the active translation's structure
   ```

---

## 5. Performance Constraints

### ❌ NEVER

1. **Lazy-load translations**
   ```typescript
   // ❌ FORBIDDEN
   async function switchTranslation(code) {
     await loadTranslation(code); // 3-5s lag mid-service
     projectVerse();
   }
   ```

2. **Block main thread for >100ms (except boot)**
   ```typescript
   // ❌ FORBIDDEN
   for (let i = 0; i < 1000000; i++) { ... } // Synchronous heavy work
   ```

3. **Allow projection latency >1 second**
   ```typescript
   // ❌ FORBIDDEN
   async function projectVerse() {
     await fetch('/api/verse'); // Network call in critical path
     await heavyProcessing();
   }
   ```

4. **Store parsed Bible data in localStorage**
   ```typescript
   // ❌ FORBIDDEN
   localStorage.setItem('bibleData', JSON.stringify(allVerses)); // >5MB quota exceeded
   ```

### ✅ ALWAYS

1. **Preload all translations at boot**
   ```typescript
   // ✅ CORRECT
   useEffect(() => {
     preloadAllTranslations() // Promise.all over all 5
       .then(() => setReady(true));
   }, []);
   ```

2. **Keep projection on critical path synchronous**
   ```typescript
   // ✅ CORRECT
   projectSlide(slide) {
     set({ liveSlideIndex, committedPassage }); // Sync
     broadcastCommit(passage); // Fire-and-forget
     persistRecoveryState(state).catch(err => console.error(err)); // Async, non-blocking
   }
   ```

3. **Use async/await for I/O, try/catch for errors**
   ```typescript
   // ✅ CORRECT
   async function loadTranslation(code) {
     try {
       const response = await fetch(`/data/${code}.zip`);
       const data = await response.arrayBuffer();
       // ...
     } catch (err) {
       console.error('Load failed:', err);
       throw err;
     }
   }
   ```

4. **Cache frequently accessed data in memory**
   ```typescript
   // ✅ CORRECT
   // BibleRepository keeps all 5 translations in memory
   private translations: Map<string, Map<string, BibleBook>>;
   ```

---

## 6. User Experience Constraints

### ❌ NEVER

1. **Show operator UI on projection screen**
   ```typescript
   // ❌ FORBIDDEN
   // Single window with CSS "presenter mode" - operator controls visible on mirror
   ```

2. **Auto-project a preview**
   ```typescript
   // ❌ FORBIDDEN
   setPreview(passage) {
     projectSlide(passage.slides[0]); // NO - requires explicit commit
   }
   ```

3. **Silently fall back to wrong data**
   ```typescript
   // ❌ FORBIDDEN
   const translation = requested || 'KJV'; // Silent fallback
   ```

4. **Block the UI on persistence operations**
   ```typescript
   // ❌ FORBIDDEN
   await saveToLocalStorage(); // Blocking
   projectSlide(); // Delayed
   ```

5. **Crash the app on data errors**
   ```typescript
   // ❌ FORBIDDEN
   if (!verse) throw new Error('Verse not found'); // Uncaught, app breaks
   ```

### ✅ ALWAYS

1. **Use separate windows for operator/projection**
   ```typescript
   // ✅ CORRECT
   const projWindow = window.open('/projection', 'projectionWindow');
   ```

2. **Require explicit commit (Enter, click, or P)**
   ```typescript
   // ✅ CORRECT
   setPreview(passage) {
     set({ previewPassage: passage }); // Not projected yet
   }
   
   commitCurrentSlide() {
     projectSlide(get().previewPassage.slides[0]); // Explicit action
   }
   ```

3. **Fail visibly with helpful errors**
   ```typescript
   // ✅ CORRECT
   if (!verse) {
     console.warn(`Verse ${verseKey} not found in ${book} ${chapter}`);
     return null; // Caller handles
   }
   ```

4. **Gracefully degrade on non-critical failures**
   ```typescript
   // ✅ CORRECT
   try {
     logo = await loadAsset('logo');
   } catch {
     logo = null; // App works without logo
   }
   ```

5. **Provide recovery mechanisms**
   ```typescript
   // ✅ CORRECT
   // Operator reload → auto-restore from projectionRecoveryState
   // Projection crash → auto-restore from localStorage
   ```

---

## 7. Security & Privacy Constraints

### ❌ NEVER

1. **Send Bible data over network**
   ```typescript
   // ❌ FORBIDDEN
   fetch('/api/verses'); // Bible data is local-only
   ```

2. **Store sensitive user data**
   ```typescript
   // ❌ FORBIDDEN
   localStorage.setItem('userCredentials', ...); // No auth system
   ```

3. **Use eval() or Function() constructor**
   ```typescript
   // ❌ FORBIDDEN
   eval(userInput); // XSS risk
   ```

4. **Trust user input without validation**
   ```typescript
   // ❌ FORBIDDEN
   const query = input; // No sanitization
   ```

### ✅ ALWAYS

1. **Keep all Bible data offline**
   ```typescript
   // ✅ CORRECT
   // All data in /public/data/*.zip
   ```

2. **Validate and sanitize input**
   ```typescript
   // ✅ CORRECT
   if (!isValidInput(query)) {
     console.warn('Invalid input rejected');
     return;
   }
   ```

3. **Use Content Security Policy**
   ```html
   <!-- ✅ CORRECT -->
   <meta http-equiv="Content-Security-Policy" content="default-src 'self'">
   ```

4. **Fail safely on privacy-restricted environments**
   ```typescript
   // ✅ CORRECT
   try {
     localStorage.setItem(...);
   } catch {
     // Privacy mode detected, degrade gracefully
   }
   ```

---

## 8. Quick Verification Checklist

### Before Every Commit

**Data Fidelity:**
- [ ] No `.trim()`, `.normalize()`, `.replace()` on verse text?
- [ ] No translation fallbacks (e.g., `|| 'KJV'`)?
- [ ] No manufactured verse keys?

**Architecture:**
- [ ] Projection window doesn't import `useStateManager`?
- [ ] No UI components directly calling `bibleRepository`?
- [ ] No circular dependencies?

**Navigation:**
- [ ] No `parseInt(verseKey) + 1` or similar arithmetic?
- [ ] Using `findIndex()` + array lookup?
- [ ] Passing `translation` parameter to all repository queries?

**State:**
- [ ] All `localStorage.setItem` wrapped in try/catch?
- [ ] Not persisting search/preview/lock state?
- [ ] Using versioned schemas?

**Performance:**
- [ ] No lazy translation loading?
- [ ] Projection path is non-blocking?
- [ ] No heavy sync operations in critical path?

**UX:**
- [ ] No auto-projection of previews?
- [ ] Failing visibly (warnings/errors), not silently?
- [ ] Graceful degradation on non-critical failures?

### Before Every Release

**Functional Tests:**
- [ ] Project a verse (sub-second latency)?
- [ ] Navigate forward/backward (correct verses)?
- [ ] Reload operator window (state restores)?
- [ ] Switch translation mid-projection (correct text)?
- [ ] Lettered verses navigate correctly (3 → 3a → 3b → 4)?
- [ ] Non-contiguous verses work (1 → 2 → 4)?
- [ ] Chapter/book boundaries correct?
- [ ] Blank screen toggles?
- [ ] Projection window crash/reconnect?

**Build/Deploy:**
- [ ] TypeScript compiles with no errors?
- [ ] All tests pass?
- [ ] Production build succeeds?
- [ ] Bundle size reasonable (<5MB)?
- [ ] No console errors in production mode?

---

## Violation Examples (NEVER COPY THESE)

### ❌ Data Fidelity Violation
```typescript
// WRONG: Modifying verse text
verse.text = rawText.trim().replace(/\s+/g, ' ');

// WRONG: Translation fallback
const books = getBooksMap(translation) || getBooksMap('KJV');
```

### ❌ Architecture Violation
```typescript
// WRONG: Projection window writing to store
// Projection.tsx
import { useStateManager } from '@/core/stateManager';
const setState = useStateManager(state => state.setState);
setState({ committedPassage: ... });
```

### ❌ Navigation Violation
```typescript
// WRONG: Verse arithmetic
const nextVerse = String(parseInt(currentVerse) + 1);

// WRONG: Assuming index === verse number
const verse = chapter.verses[parseInt(verseKey)];
```

### ❌ State Management Violation
```typescript
// WRONG: Unguarded localStorage write
localStorage.setItem('recoveryState', JSON.stringify(state));
// If this throws, next line doesn't execute
projectSlide();
```

### ❌ Performance Violation
```typescript
// WRONG: Lazy-loading translation mid-service
async function switchTranslation(code) {
  setLoading(true);
  await loadTranslation(code); // 3-5s lag
  setLoading(false);
}
```

---

## Correct Patterns (ALWAYS USE THESE)

### ✅ Data Fidelity
```typescript
// CORRECT: Preserve verbatim
verse.text = rawData.text; // No transformation

// CORRECT: Fail visibly
if (!books.has(translation)) {
  console.warn(`Translation ${translation} not found`);
  return new Map(); // Empty, not fallback
}
```

### ✅ Architecture
```typescript
// CORRECT: Projection window as subscriber
// Projection.tsx
const [passage, setPassage] = useState<Passage | null>(null);

useEffect(() => {
  const handler = (event: MessageEvent) => {
    if (event.data.type === 'COMMIT_PASSAGE') {
      setPassage(event.data.payload);
    }
  };
  channel.addEventListener('message', handler);
}, []);
```

### ✅ Navigation
```typescript
// CORRECT: Index-based navigation
const currentIndex = chapter.verses.findIndex(v => v.verse === verseKey);
if (currentIndex === -1) return null;

const nextVerse = chapter.verses[currentIndex + 1];
```

### ✅ State Management
```typescript
// CORRECT: Fail-safe persistence
projectSlide(slide) {
  // 1. Update state (critical)
  set({ liveSlideIndex, committedPassage });
  
  // 2. Broadcast (critical)
  broadcastCommit(passage);
  
  // 3. Persist (best-effort)
  try {
    persistRecoveryState(state);
  } catch (err) {
    console.error('Persistence failed, projection continues:', err);
  }
}
```

### ✅ Performance
```typescript
// CORRECT: Preload all translations
useEffect(() => {
  Promise.all([
    loadTranslation('KJV'),
    loadTranslation('NIV'),
    loadTranslation('NKJV'),
    loadTranslation('NLT'),
    loadTranslation('AMP'),
  ])
    .then(() => setReady(true))
    .catch(err => setError(err));
}, []);
```

---

## For AI Agents (FreeBuff)

**Before generating ANY code, verify:**

1. Have I read the relevant sections of `ARCHITECTURE.md`?
2. Does this change violate ANY constraint in this document?
3. Am I modifying verse text? (If yes, STOP)
4. Am I introducing verse arithmetic? (If yes, STOP)
5. Am I making Projection window write to store? (If yes, STOP)
6. Am I adding a backend/network dependency? (If yes, STOP)
7. Have I wrapped localStorage writes in try/catch?
8. Have I added tests for this change?
9. Does the change preserve all existing guarantees?

**If unsure, ASK before proceeding.**

---

## Document Version

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2024 | Initial constraints documentation |

---

**Related Documentation:**
- `ARCHITECTURE.md` — Detailed explanations
- `DEVELOPMENT.md` — Development workflow
- `VERIFICATION-RULES.md` — Automated checks
- `TESTING-STRATEGY.md` — Test requirements

---

**END OF CONSTRAINTS.md**
```

---

## What You Should Do Now

### Step 1: Create the file
```bash
cd docs  # You should still be in the docs folder
touch CONSTRAINTS.md
```

### Step 2: Copy the content
Copy everything from:
```markdown
# Bible Projection System — Constraints & Invariants
```
to:
```markdown
**END OF CONSTRAINTS.md**
```

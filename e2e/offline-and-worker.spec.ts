import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { expect, test, type Page } from '@playwright/test';

/**
 * The two verifications that were manual-only (Teardown §8 residual):
 *
 * 1. Worker decode tier — jsdom has no Worker, so only a real Chromium can
 *    prove tier 2 runs. Evidence: `[BibleRepository] Loaded <code> (Web
 *    Worker)` console lines, one per translation. That line is behavioral,
 *    not a build detail: the repository names the tier that actually
 *    served, so a main-thread fallback cannot satisfy this test.
 *
 * 2. Service-worker offline reload — load once online so the SW installs,
 *    commit the canary verse (John 3:16), then KILL the preview server and
 *    reload. The SW must serve the shell + bundles from its precache; the
 *    app must restore the session and render the verse. The expected text
 *    is NOT hardcoded: it is extracted at runtime from the shipped
 *    public/data/KJV_Bible_JSON.zip, so the assertion is exactly the
 *    fidelity property (VF-001) — screen text == shipped data text,
 *    byte for byte. Wrong, trimmed, or missing text fails loudly.
 *
 * Prereqs: `webServer` in playwright.config.ts runs `vite build` then
 * serves dist/ on :4174 — the SW registers in prod builds only, so this
 * also exercises the strict CSP and the real bundle.
 */

const PREVIEW_PORT = process.env.PLAYWRIGHT_PREVIEW_PORT ?? '4174';

/** All five translation codes, matching TRANSLATION_ZIPS. */
const CODES = ['KJV', 'NIV', 'NKJV', 'NLT', 'AMP'];

/** Full production boot: every translation loaded, search input ready. */
async function bootForReal(page: Page): Promise<void> {
  // Fresh profiles get the WelcomeSlides/tutorial flow (OnboardingManager).
  // The tests verify boot + offline behavior, not the tour, so preset the
  // same localStorage key finishOnboarding() writes and skip it entirely.
  await page.addInitScript(() => localStorage.setItem('bible-projection-onboarded', 'true'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // OperatorScreen overrides the SearchInput default with the placeholder
  // "Search reference or keyword..." — anchor on the override, not the default.
  const search = page.getByPlaceholder(/search reference or keyword/i);
  try {
    await expect(search).toBeVisible({ timeout: 120_000 }); // cold decode budget
  } catch (err) {
    // Diagnostic on timeout: is this the boot spinner, the total-failure
    // screen, the operator-lease gate, or something else entirely?
    const consoleLog = consoleLines.join('\n');
    throw new Error(
      `App never reached the search input. Body:\n${(await page.locator('body').innerText().catch(() => '<unreadable>')).slice(0, 2000)}\n\nConsole:\n${consoleLog.slice(-2000)}`,
      { cause: err },
    );
  }
  await expect(search).toBeEnabled();
}

// --- The canary: John 3:16, read from the shipped data itself ---

let cachedCanary: string | null = null;

/** Extract the KJV John 3:16 text from the shipped zip. Handles the four
 * source shapes the normalizer accepts: canonical single book (the actual
 * KJV shape), array of books, object with a `books` array, and nested
 * object with an Info block. */
async function canary(): Promise<string> {
  if (cachedCanary) return cachedCanary;
  const zip = await JSZip.loadAsync(readFileSync('public/data/KJV_Bible_JSON.zip'));
  // The KJV archive is one file per book (e.g. "Bible-kjv-master/John.json").
  // Match the exact name so "1John.json" can never win.
  const entry = Object.keys(zip.files).find((f) => /\/John\.json$/i.test(f) || f.toLowerCase() === 'john.json');
  if (!entry) throw new Error(`No John.json entry in KJV zip: ${Object.keys(zip.files).slice(0, 10).join(', ')}…`);
  const raw: unknown = JSON.parse(await zip.file(entry)!.async('text'));

  let text: string | undefined;
  if (
    raw &&
    typeof raw === 'object' &&
    (raw as { book?: unknown }).book === 'John' &&
    Array.isArray((raw as { chapters?: unknown }).chapters)
  ) {
    // Single canonical book — the actual KJV zip shape: { book, chapters: [...] }.
    text = (
      (raw as { chapters: { chapter?: string; verses?: { verse?: string; text?: string }[] }[] }).chapters.find(
        (c) => c.chapter === '3',
      )?.verses ?? []
    ).find((v) => v.verse === '16')?.text;
  } else if (Array.isArray(raw)) {
    // Array of canonical books.
    const john = raw.find((b) => (b as { book?: string })?.book?.toLowerCase() === 'john') as
      | { chapters?: { chapter?: string; verses?: { verse?: string; text?: string }[] }[] }
      | undefined;
    text = john?.chapters?.find((c) => c.chapter === '3')?.verses?.find((v) => v.verse === '16')?.text;
  } else if (raw && typeof raw === 'object' && Array.isArray((raw as { books?: unknown }).books)) {
    // Canonical single book (top-level `books` array).
    const john = (raw as { books: { book?: string; chapters?: { chapter?: string; verses?: { verse?: string; text?: string }[] }[] }[] })
      .books.find((b) => b.book?.toLowerCase() === 'john');
    text = john?.chapters?.find((c) => c.chapter === '3')?.verses?.find((v) => v.verse === '16')?.text;
  } else if (raw && typeof raw === 'object') {
    // Nested-object format: { Info: {...}, "John": { "3": { "16": "text" } } }.
    const johnChapter = (raw as Record<string, Record<string, Record<string, string>>>).John;
    text = johnChapter?.['3']?.['16'];
  }
  if (!text || typeof text !== 'string') throw new Error('Could not extract John 3:16 from the shipped KJV zip — inspect its format.');
  cachedCanary = text;
  return cachedCanary;
}

/** Console lines of the CURRENT test's page, for boot-failure diagnostics. */
const consoleLines: string[] = [];

test.beforeEach(() => {
  consoleLines.length = 0;
});

test.describe('worker decode tier', () => {
  test('all five translations decode in the Web Worker at boot', async ({ page }) => {
    page.on('console', (msg) => consoleLines.push(msg.text()));

    await bootForReal(page);

    for (const code of CODES) {
      await expect
        .poll(() => consoleLines.some((l) => l.includes('(Web Worker)') && l.includes(code)), {
          timeout: 10_000,
        })
        .toBe(true);
    }
  });
});

test.describe('service-worker offline reload', () => {
  test('offline reload: SW serves the app and the committed verse renders verbatim', async ({ page }) => {
    test.setTimeout(240_000);
    page.on('console', (msg) => consoleLines.push(msg.text()));
    const verse = await canary();

    // 1. Load online once: full boot + SW install + activation.
    await bootForReal(page);
    const swState = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return reg.active?.state ?? 'none';
    });
    expect(swState).toBe('activated');

    // 2. Commit the canary verse while ONLINE (projection + recovery snapshot).
    const search = page.getByPlaceholder(/search reference or keyword/i);
    await search.fill('John 3:16');
    await search.press('Enter');
    await expect(page.getByText(verse, { exact: true }).first()).toBeVisible({ timeout: 15_000 });

    // 3. Kill the preview server. A real reload must hit dead HTTP —
    //    context.setOffline fakes the network flag but cannot stop the
    //    SW's fetches, so only a process kill is a true offline test.
    killPreview();

    // 4. Reload offline: shell + hashed bundles must come from the precache.
    await page.reload({ waitUntil: 'domcontentloaded' });

    // 5. The app restores the session and renders the verse — verbatim.
    await expect(page.getByText(verse, { exact: true }).first()).toBeVisible({ timeout: 30_000 });

    // 6. The offline boot must NOT show the total-failure screen.
    await expect(page.getByText('Bible data could not be loaded')).toHaveCount(0);
  });
});

/** Kill whatever LISTENS on the preview port (Windows/Unix). Only LISTENING
 * sockets are targeted — outbound ESTABLISHED connections from the test's
 * own browser must never match, or we would kill the browser mid-test.
 * "Port already free" is tolerated: bootForReal succeeded moments earlier,
 * so the server was alive. */
function killPreview(): void {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr LISTENING | findstr :${PREVIEW_PORT}`, {
        encoding: 'utf8',
      });
      const pids = new Set(
        out
          .split(/\r?\n/)
          .map((l) => l.trim().split(/\s+/).pop())
          .filter((p): p is string => !!p && /^\d+$/.test(p)),
      );
      pids.delete(String(process.pid));
      for (const pid of pids) execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
    } else {
      execSync(`kill $(lsof -t -iTCP:${PREVIEW_PORT} -sTCP:LISTEN) 2>/dev/null`, { stdio: 'ignore' });
    }
  } catch {
    // Port already free — the server was demonstrably up moments ago
    // (bootForReal completed), so proceeding is safe.
  }
}

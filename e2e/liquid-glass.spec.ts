import { expect, test, type Page } from '@playwright/test';

/**
 * Liquid-glass material guard (computed styles, house style of theme-boot).
 *
 * The glass recipes live in index.css components layer; Tailwind utilities at
 * call sites can silently override them (utilities layer wins), and a future
 * refactor can silently drop a class. These tests pin the material itself —
 * resolved computed styles, not class names — on the five rewired surfaces:
 * buttons, tabs, dropdowns (Select + suggestions + Settings menu), the
 * passage-navigator transport chips, and browse tiles. Both themes, since
 * every recipe is tokenized per theme.
 *
 * What each signal means (recipes in src/index.css):
 *  - .btn-glass           → backdrop-filter blur+saturate
 *  - .glass-item          → background-color fill (no blur) on hover/selected
 *  - .glass-item-selected → fill + paprika inset ring
 *
 * App boot: goto + networkidle, onboarding skipped via the localStorage key
 * finishOnboarding() writes (verified in OnboardingManager.tsx).
 */

const ONBOARDING_KEY = 'bible-projection-onboarded';

/** A transparent computed background-color in either color format. */
const TRANSPARENT = new Set(['rgba(0, 0, 0, 0)', 'transparent']);

/** backdrop-filter of an element ('none' when absent). */
async function backdrop(page: Page, selector: string): Promise<string> {
  return page.$eval(
    selector,
    (el) => getComputedStyle(el).backdropFilter || getComputedStyle(el).webkitBackdropFilter || 'none',
  );
}

/** background-color of an element. */
async function fill(page: Page, selector: string): Promise<string> {
  return page.$eval(selector, (el) => getComputedStyle(el).backgroundColor);
}

/** Commit John 3:16 — puts the operator into the working state (queue, transport, presenter). */
async function commitPassage(page: Page) {
  const search = page.locator('input[type="text"], input:not([type])').first();
  await search.fill('John 3:16');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Next passage (→)' })).toBeVisible({ timeout: 10_000 });
}

async function passOnboarding(page: Page, theme: 'dark' | 'light') {
  await page.addInitScript(
    ([key, t]) => {
      localStorage.setItem(key!, 'true');
      localStorage.setItem('theme', t!);
    },
    [ONBOARDING_KEY, theme] as [string, string],
  );
}

for (const theme of ['dark', 'light'] as const) {
  test.describe(`liquid glass — ${theme}`, () => {
    test.beforeEach(async ({ page }) => {
      await passOnboarding(page, theme);
      await page.goto('/', { waitUntil: 'networkidle' });
      await expect(page.locator('header')).toBeVisible();
    });

    test('buttons carry the liquid-glass material', async ({ page }) => {
      // Commit a passage — this drives the operator into the working state.
      await commitPassage(page);

      // A second commit to a DIFFERENT chapter pushes history, enabling Undo
      // (disabled buttons ignore pointer events, so hover needs it enabled).
      const search = page.locator('input[type="text"], input:not([type])').first();
      await search.fill('John 2:1');
      await page.keyboard.press('Enter');
      const undo = page.locator('header button', { hasText: 'Undo' });
      await expect(undo).toBeEnabled({ timeout: 10_000 });

      // Default variant (btn-glass + accent): "Project Now", reachable by
      // engaging the presenter lock. It carries the paprika-tinted glass.
      await page.getByRole('button', { name: 'Lock', exact: true }).click();
      const projectNow = page.getByRole('button', { name: 'Project Now' });
      await expect(projectNow).toBeVisible({ timeout: 5_000 });
      expect(await backdrop(page, 'button:has-text("Project Now")')).toContain('blur');

      // Outline variant: the presenter lock chip itself (now "Unlock").
      expect(await backdrop(page, 'button:has-text("Unlock")')).toContain('blur');

      // Ghost variant: header Undo — transparent until hover, then quiet fill.
      expect(TRANSPARENT.has(await fill(page, 'header button:has-text("Undo")'))).toBe(true);
      await undo.hover();
      await expect
        .poll(async () => fill(page, 'header button:has-text("Undo")'), { timeout: 2_000 })
        .not.toBe('rgba(0, 0, 0, 0)');

      // Secondary variant: Browse → drill Genesis → 1 → the hunter
      // "Load Full Chapter" chip (rendered only at the verses level).
      await page.getByRole('button', { name: 'Browse', exact: true }).click();
      await page.getByRole('button', { name: 'Genesis', exact: true }).click();
      await page.getByRole('button', { name: '1', exact: true }).first().click();
      const loadChapter = page.getByRole('button', { name: 'Load Full Chapter' });
      await expect(loadChapter).toBeVisible({ timeout: 5_000 });
      expect(await backdrop(page, 'button:has-text("Load Full Chapter")')).toContain('blur');
    });

    test('tab switches: active glass fill, quiet hover on inactive', async ({ page }) => {
      // Active tab wears the selected fill; inactive stays transparent.
      expect(TRANSPARENT.has(await fill(page, 'button:has-text("Browse")'))).toBe(true);

      // The tab's ONLY paprika voice is the bottom underline: the selected
      // recipe's inset ring (spread 0 0 0 1px) must NOT wrap the other three
      // sides — that read as an orange box around the active tab. Polled, not
      // one-shot: a read racing the stylesheet/mount must retry, not fail.
      await expect
        .poll(
          async () =>
            page.$eval('button:has-text("Search")', (el) => getComputedStyle(el).boxShadow),
          { timeout: 5_000 },
        )
        .not.toContain('0px 0px 0px 1px');

      await page.getByRole('button', { name: 'Browse', exact: true }).click();
      await expect
        .poll(async () => fill(page, 'button:has-text("Browse")'), { timeout: 5_000 })
        .not.toBe('rgba(0, 0, 0, 0)');

      // The previously-active tab went quiet again.
      await expect
        .poll(async () => fill(page, 'button:has-text("Search")'), { timeout: 5_000 })
        .toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    });

    test('the translation Select trigger and its dropdown items are glass', async ({ page }) => {
      // Trigger (btn-glass via the shared primitive).
      const trigger = page.locator('header [role="combobox"]');
      await expect(trigger).toBeVisible();
      expect(await backdrop(page, 'header [role="combobox"]')).toContain('blur');

      // Open it: panel is glass-strong (blurred), items fill on focus.
      await trigger.click();
      const panel = page.locator('[data-radix-popper-content-wrapper] [role="listbox"]');
      await expect(panel).toBeVisible();
      expect(await backdrop(page, '[role="listbox"]')).toContain('blur');

      // Keyboard focus (Radix focus-moves the highlighted option) lights it.
      // The race to avoid: Radix may auto-highlight the first option on open
      // AND move on the ArrowDown, so a fixed-index probe can sample the
      // moment the highlight has moved past it. The invariant is that SOME
      // option carries the glass fill — assert over all of them.
      await page.keyboard.press('ArrowDown');
      await expect
        .poll(
          async () => {
            const n = await page.locator('[role="option"]').count();
            let lit = 0;
            for (let i = 0; i < n; i++) {
              const c = await page.locator('[role="option"]').nth(i);
              if (!TRANSPARENT.has(await c.evaluate((el) => getComputedStyle(el).backgroundColor))) lit++;
            }
            return lit;
          },
          { timeout: 10_000 },
        )
        .toBeGreaterThanOrEqual(1);
    });

    test('passage-navigator transport chips are glass', async ({ page }) => {
      // Commit a passage so the on-air chip (and its four transport buttons)
      // appears — the same flow the offline spec drives.
      await page.locator('input[type="text"], input:not([type])').first().fill('John 3:16');
      await page.keyboard.press('Enter');
      const nextVerse = page.getByRole('button', { name: 'Next passage (→)' });
      await expect(nextVerse).toBeVisible({ timeout: 10_000 });
      expect(await backdrop(page, 'button[title="Next passage (→)"]')).toContain('blur');
      expect(await backdrop(page, 'button[title="Previous passage (←)"]')).toContain('blur');
    });

    test('browse tiles carry glass and a persistent selected state', async ({ page }) => {
      await page.getByRole('button', { name: 'Browse', exact: true }).click();
      const genesis = page.getByRole('button', { name: 'Genesis', exact: true });
      await expect(genesis).toBeVisible({ timeout: 5_000 });
      expect(await backdrop(page, 'button:has-text("Genesis")')).toContain('blur');

      // Select Genesis → chapters. The breadcrumb is the back control; from
      // chapters it reads "Genesis" — clicking it returns to books, where the
      // tile must STILL wear the selected fill (goBack no longer clears it).
      await genesis.click();
      await page.locator('button:has-text("Genesis")').first().click();
      const genesisSelected = page.locator('button.glass-item-selected', { hasText: 'Genesis' });
      await expect(genesisSelected).toBeVisible();

      // Re-enter chapters to inspect the chapter tiles.
      await page.getByRole('button', { name: 'Genesis', exact: true }).click();
      const chapter1 = page.getByRole('button', { name: '1', exact: true }).first();
      await expect(chapter1).toBeVisible();
      expect(await backdrop(page, 'button:has-text("1")')).toContain('blur');
    });

    test('Settings menu items are glass items', async ({ page }) => {
      // The Settings & More trigger lives in the sidebar footer.
      const settingsTrigger = page.locator('button:has-text("Settings & More")');
      await settingsTrigger.click();
      const menuItem = page.locator('[role="menuitem"]', { hasText: 'Display Settings' });
      await expect(menuItem).toBeVisible();
      // Rows are transparent until hovered (fill-only recipe).
      expect(TRANSPARENT.has(await fill(page, '[role="menuitem"]:has-text("Display Settings")'))).toBe(true);
      await menuItem.hover();
      await expect
        .poll(async () => fill(page, '[role="menuitem"]:has-text("Display Settings")'), { timeout: 2_000 })
        .not.toBe('rgba(0, 0, 0, 0)');
    });
  });
}

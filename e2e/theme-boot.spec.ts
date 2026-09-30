import { expect, test, type Page } from '@playwright/test';

/**
 * No-flash theme boot (public/theme-boot.js + next-themes system default).
 *
 * The trap in proving "no flash" is that by the time a normal boot finishes,
 * next-themes has applied the class anyway — a flash would be invisible to
 * any post-boot assertion. So these tests ABORT the hashed app bundle
 * (/assets/index-*.js): React never mounts, next-themes never hydrates, and
 * whatever class <html> carries can only have come from theme-boot.js, which
 * runs as a blocking script in <head> BEFORE first paint. CSS still loads,
 * so the body's computed ground color proves the stylesheet already matched
 * the theme at that moment — the first paint is the right theme by
 * construction. (A flash would show up here as a missing/wrong class or a
 * light ground while dark was persisted.)
 *
 * Matrix: persisted dark, persisted light, and the SYSTEM default (no stored
 * choice) following the emulated OS preference both ways — the automatic
 * selection the toggle promises.
 */

/** Read the body's resolved background-color ("rgb(r, g, b)"). */
async function groundRgb(page: Page): Promise<[number, number, number]> {
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) throw new Error(`Unexpected background-color: ${bg}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

test.describe('no-flash theme boot', () => {
  // Abort the app bundle only — CSS and theme-boot.js still load. With the
  // framework gone, domcontentloaded guarantees the boot script has run and
  // simultaneously proves next-themes did NOT (it lives in that bundle).
  test.beforeEach(async ({ context }) => {
    await context.route(/\/assets\/index-[\w-]+\.js$/, (route) => route.abort());
  });

  test('persisted dark is on <html> before first paint', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.classList.contains('light'))).toBe(false);

    // The ground resolved through the dark tokens: #08090a-family, not white.
    const [r, g, b] = await groundRgb(page);
    expect(Math.max(r, g, b)).toBeLessThan(30);
  });

  test('persisted light is on <html> before first paint', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('theme', 'light'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // The explicit 'light' class is the boot script's signature: with no
    // class at all the CSS light default would still paint light, so only
    // the class proves the script actually chose.
    expect(await page.evaluate(() => document.documentElement.classList.contains('light'))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(false);

    const [r, g, b] = await groundRgb(page);
    expect(Math.min(r, g, b)).toBeGreaterThan(200);
  });

  test('no stored choice follows the OS — dark device', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
    const [r, g, b] = await groundRgb(page);
    expect(Math.max(r, g, b)).toBeLessThan(30);
  });

  test('no stored choice follows the OS — light device', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    expect(await page.evaluate(() => document.documentElement.classList.contains('light'))).toBe(true);
    const [r, g, b] = await groundRgb(page);
    expect(Math.min(r, g, b)).toBeGreaterThan(200);
  });

  test("an explicit 'system' choice tracks the OS too", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('theme', 'system'));
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
  });
});

test.describe('live system follow (event-driven)', () => {
  // Different mechanism from the boot script above: with the app RUNNING and
  // 'system' selected, next-themes listens to the matchMedia 'change' event
  // and must re-apply the theme WITHOUT a reload. The flip to light here can
  // only be delivered by that event — the boot script has already run.
  test('flipping the OS scheme while System is selected re-themes live', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveClass(/dark/, { timeout: 15_000 });

    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveClass(/light/, { timeout: 5_000 });

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveClass(/dark/, { timeout: 5_000 });
  });
});

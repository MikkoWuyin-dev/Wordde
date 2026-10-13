import { expect, test, type Page } from '@playwright/test';

/**
 * Real-browser proof for the two P0 fixes that jsdom cannot verify
 * (audit §3.1 and §3.2), because both are properties of the *browser*, not of
 * the component tree:
 *
 * 1. Object-URL revocation (§3.1). The leak was a stale closure: the revoke
 *    loop closed over the initial `{}` and could never see a non-empty map.
 *    Proving it needs a real IndexedDB with real Blobs, real `URL.createObjectURL`
 *    calls, and a real `BroadcastChannel`. This spec counts creates and revokes
 *    from inside the page and asserts the live set stays bounded across
 *    repeated reloads. Before the fix, `revokes` stayed 0 and `live` grew by one
 *    full asset set per reload.
 *
 * 2. Error-boundary containment (§3.2). The claim has two halves, so the test
 *    drives two real windows at once: the projection route is handed a
 *    persisted Passage that parses but throws during render, and the operator
 *    route — sharing the same poisoned localStorage — must keep working. Before
 *    the fix, the throw unmounted the whole React tree to a blank page.
 *
 * Both run against the PRODUCTION build via the shared `webServer` (see
 * playwright.config.ts), so the SW, the real bundle and real IndexedDB are all
 * in play.
 */

const CHANNEL = 'bible-projection-sync';
/** Must match `PROTOCOL_VERSION` in src/core/broadcastSync.ts — a receiver
 *  drops mismatched messages, so an unversioned post would be silently ignored
 *  and the reloads would never happen. */
const PROTOCOL_VERSION = 1;

const ASSET_DB = 'bible_projection_assets';

/** The projection window's asset map keys. Two seeded records ⇒ two object
 *  URLs; `loadAllAssets` also emits `logo`/`softBackground` as EMPTY STRINGS
 *  and those never reach `createObjectURL`. */
const ASSET_IDS = ['logo', 'bg:e2e-fixture'];

interface BlobStats {
  creates: number;
  revokes: number;
  live: number;
  maxLive: number;
}

/**
 * Patch `URL.createObjectURL`/`revokeObjectURL` BEFORE any application code
 * runs, so the window's own mount-time load is counted too. Kept self-contained
 * (no closure over module scope) — Playwright serialises this function into the
 * page, where outer variables do not exist.
 */
async function installBlobProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe = { creates: 0, revokes: 0, live: [] as string[], maxLive: 0 };
    (window as unknown as { __blobProbe: typeof probe }).__blobProbe = probe;

    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);

    URL.createObjectURL = ((blob: Blob) => {
      const url = create(blob);
      probe.creates += 1;
      probe.live.push(url);
      if (probe.live.length > probe.maxLive) probe.maxLive = probe.live.length;
      return url;
    }) as typeof URL.createObjectURL;

    // Only revocations of URLs THIS document created are counted, so unrelated
    // browser-internal revokes cannot flatter the numbers.
    URL.revokeObjectURL = ((url: string) => {
      const i = probe.live.indexOf(url);
      if (i !== -1) {
        probe.revokes += 1;
        probe.live.splice(i, 1);
      }
      revoke(url);
    }) as typeof URL.revokeObjectURL;
  });
}

async function blobStats(page: Page): Promise<BlobStats> {
  return page.evaluate(() => {
    const p = (
      window as unknown as {
        __blobProbe?: { creates: number; revokes: number; live: string[]; maxLive: number };
      }
    ).__blobProbe;
    // -1 everywhere means the probe never installed — a loud failure rather
    // than a silently-passing zero.
    if (!p) return { creates: -1, revokes: -1, live: -1, maxLive: -1 };
    return { creates: p.creates, revokes: p.revokes, live: p.live.length, maxLive: p.maxLive };
  });
}

/**
 * Write real image blobs into the app's asset store on the app origin, using
 * the same DB name/version/keyPath as src/core/assetStorage.ts. Without seeded
 * assets `loadAllAssets()` returns only empty strings and creates no URLs at
 * all — the test would then prove nothing while appearing to pass.
 */
async function seedAssets(page: Page): Promise<void> {
  await page.evaluate(
    async ({ dbName, ids }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains('assets')) {
            d.createObjectStore('assets', { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('assets', 'readwrite');
        const store = tx.objectStore('assets');
        for (const id of ids) {
          store.put({
            id,
            file: new Blob([`e2e-fixture-${id}`], { type: 'image/png' }),
            createdAt: Date.now(),
          });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      db.close();
    },
    { dbName: ASSET_DB, ids: ASSET_IDS },
  );
}

/** Post `RELOAD_ASSETS` exactly as the operator does (versioned envelope). */
async function broadcastReloadAssets(page: Page): Promise<void> {
  await page.evaluate(
    ({ channel, version }) => {
      const ch = new BroadcastChannel(channel);
      ch.postMessage({ type: 'RELOAD_ASSETS', version });
      ch.close();
    },
    { channel: CHANNEL, version: PROTOCOL_VERSION },
  );
}

test.describe('projection window revokes replaced object URLs (audit §3.1)', () => {
  test('repeated asset reloads revoke the previous set instead of orphaning it', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('bible-projection-onboarded', 'true'));
    await installBlobProbe(page);

    // Seed on the app origin first; the probe restarts on the next navigation,
    // so the projection window's own mount load is what it counts.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await seedAssets(page);

    await page.goto('/projection', { waitUntil: 'domcontentloaded' });

    // Mount load: one object URL per seeded asset.
    await expect.poll(async () => (await blobStats(page)).live, { timeout: 20_000 }).toBe(ASSET_IDS.length);
    const initial = await blobStats(page);
    expect(initial.creates).toBe(ASSET_IDS.length);
    expect(initial.revokes).toBe(0);

    const RELOADS = 5;
    for (let i = 1; i <= RELOADS; i++) {
      await broadcastReloadAssets(page);
      // Wait for THIS reload to be fully installed before firing the next, so
      // the loads cannot interleave and the revoke arithmetic stays exact.
      await expect
        .poll(async () => (await blobStats(page)).creates, { timeout: 15_000 })
        .toBe(ASSET_IDS.length * (i + 1));
    }

    const after = await blobStats(page);

    // 6 loads × 2 assets = 12 URLs created in total.
    expect(after.creates).toBe(ASSET_IDS.length * (RELOADS + 1));
    // The 5 replaced sets were revoked. THIS is the fix: before it, revokes
    // stayed at 0 and every reload orphaned its blobs until the document died.
    expect(after.revokes).toBe(ASSET_IDS.length * RELOADS);
    // Steady state holds exactly one set — it does not grow with reload count.
    expect(after.live).toBe(ASSET_IDS.length);
    // Peak is one replaced set plus the new one (create-then-revoke ordering),
    // never one set per reload.
    expect(after.maxLive).toBe(ASSET_IDS.length * 2);
  });
});

/**
 * A persisted Passage that JSON-parses but throws during render: `verses` is
 * null and `AutoFitVerse` calls `passage.verses.map(...)`. This is the audit's
 * §3.2 scenario — malformed data restored from storage, not a contrived throw.
 */
const MALFORMED_PASSAGE = JSON.stringify({
  reference: { book: 'John', chapter: '3', verseStart: '16', translation: 'KJV' },
  displayReference: 'John 3:16',
  text: 'malformed fixture — never rendered',
  verses: null,
});

test.describe('error boundary contains a render-time crash (audit §3.2)', () => {
  test('the projection route falls back while the operator route keeps serving', async ({ context }) => {
    await context.addInitScript(
      (malformed) => {
        localStorage.setItem('bible-projection-onboarded', 'true');
        localStorage.setItem('currentProjection', malformed);
      },
      MALFORMED_PASSAGE,
    );

    const projection = await context.newPage();
    const projectionConsole: string[] = [];
    projection.on('console', (msg) => projectionConsole.push(msg.text()));

    const operator = await context.newPage();

    await projection.goto('/projection', { waitUntil: 'domcontentloaded' });

    // 1. The boundary caught it — asserted from the boundary's own log, so a
    //    crash "handled" by some other path would not satisfy this.
    await expect
      .poll(() => projectionConsole.some((l) => l.includes('[ErrorBoundary] Render error caught')), {
        timeout: 20_000,
      })
      .toBe(true);

    // 2. The projection route shows its fallback...
    await expect(projection.getByRole('alert')).toBeVisible();
    await expect(projection.getByText('Projection stopped')).toBeVisible();
    await expect(projection.getByRole('button', { name: 'Reload' })).toBeVisible();

    // ...and React did NOT unmount the tree. Pre-fix this length was 0 — the
    // blank white page PRODUCT.md principles 2 & 4 forbid.
    const mountedLength = await projection.locator('#root').evaluate((el) => el.innerHTML.length);
    expect(mountedLength).toBeGreaterThan(100);

    // 3. The other window, sharing the same poisoned localStorage, is fine.
    await operator.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(operator.getByPlaceholder(/search by reference or keyword/i)).toBeVisible({
      timeout: 120_000, // cold decode of all five translations
    });
    // The operator's own boundary never tripped.
    await expect(operator.getByText('Something went wrong')).toHaveCount(0);
  });
});

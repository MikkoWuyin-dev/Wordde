/*
 * Wordde service worker — offline delivery layer.
 *
 * Wordde's runtime has always been offline-first (all Bible data ships as
 * static ZIPs in /data/), but until now a sanctuary with no internet could
 * not even LOAD the app: the first page load required the network. This
 * service worker closes that gap by precaching the entire app shell, the
 * self-hosted fonts, and every Bible data asset on first visit with
 * connectivity. After that, everything — including cold starts in an
 * offline building — is served cache-first.
 *
 * Strategy:
 *   • Precache-on-install: every asset below is fetched during `install`
 *     (all-or-nothing, so a broken deploy cannot half-populate the cache).
 *   • Cache-first, then network: right for an immutable-per-version asset
 *     set. Anything fetched from the network at runtime is opportunistically
 *     cached so late-discovered same-origin assets also survive offline.
 *   • Navigation fallback: `/` is served when a navigation fails offline
 *     (covers deep links like /projection on a cold offline start).
 *   • Self-maintaining cache version: CACHE_VERSION is REPLACED at build
 *     time by the `wordde:sw-precache-inject` Vite plugin with a hash of the
 *     full precache manifest (every precached URL + its file contents). Any
 *     content change — app code, Bible data, fonts, this worker's own asset
 *     list — automatically produces a new version; there is nothing to bump
 *     by hand. The old worker keeps serving until every client reloads, so a
 *     mid-service deploy never yanks assets out from under a live window
 *     (RI-059).
 */

// Placeholder — overwritten at build time with `wordde-<content hash>`.
// The plugin matches this exact declaration; do not rename or move it.
const CACHE_VERSION = 'wordde-dev';

/**
 * Built (hashed) assets — /assets/index-*.js, *.css, icons, manifest — are
 * injected here at build time by the `wordde:sw-precache-inject` Vite plugin
 * (vite.config.ts), which replaces this token with the real list read from
 * dist/index.html. Hashed filenames change per build, so they cannot be
 * listed statically. Without these, an offline reload would serve the cached
 * HTML shell but fail to fetch the JS bundle (the very first page load races
 * SW installation, so opportunistic caching cannot be relied on).
 */
const BUILD_ASSETS = self.__WORDDE_PRECACHE__ || [];

/**
 * Match options for all cache reads. `ignoreVary` matters: the SW caches
 * responses it fetched WITHOUT an Origin header, but the page fetches fonts
 * crossorigin (Origin present). If the server sent `Vary: Origin`, a strict
 * match would miss and fall through to the network — breaking fonts (and
 * anything else Vary'd) offline. URLs are immutable per cache version in
 * this app, so ignoring Vary is safe here.
 */
const MATCH_OPTS = { ignoreVary: true, ignoreSearch: true };

/** Static app shell + self-hosted fonts + Bible data (public/ → dist/ verbatim). */
const PRECACHE_URLS = [
  '/',
  '/projection',
  '/manifest.webmanifest',
  '/theme-boot.js',
  '/fonts/Autography.otf',
  '/fonts/PlayfairDisplay-Regular.ttf',
  '/fonts/Poppins-Bold.ttf',
  '/fonts/Poppins-Light.ttf',
  '/fonts/Poppins-Medium.ttf',
  '/fonts/Poppins-Regular.ttf',
  '/fonts/Poppins-SemiBold.ttf',
  '/data/KJV_Bible_JSON.zip',
  '/data/NIV_Bible_JSON.zip',
  '/data/NKJV.zip',
  '/data/NLT.zip',
  '/data/AMP.zip',
  '/data/semanticIndex.json',
  ...BUILD_ASSETS,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await cache.addAll(PRECACHE_URLS);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Delete every cache that is not the current version.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Cache-first applies to same-origin GETs only. BroadcastChannel sync and
  // the operator/projection message protocol are unaffected by this worker.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // Navigations: try network (fresh HTML), fall back to the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(CACHE_VERSION);
          return (
            (await cache.match(request, MATCH_OPTS)) ||
            (await cache.match('/', MATCH_OPTS)) ||
            new Response('Offline and page not cached.', { status: 503, statusText: 'Offline' })
          );
        }
      })(),
    );
    return;
  }

  // Everything else: cache-first, then network, then opportunistically cache.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(request, MATCH_OPTS);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          // put() clones internally-safe: clone BEFORE consuming.
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        return new Response('Offline and asset not cached.', { status: 503, statusText: 'Offline' });
      }
    })(),
  );
});

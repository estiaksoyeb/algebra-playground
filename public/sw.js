/* Algebra Playground service worker.
 *
 * Strategy:
 *  - Precache the app shell (index.html, manifest, icons) and every hashed build asset.
 *  - Navigation requests: network first (so a new deploy is picked up), falling back to
 *    the cached index.html when offline. Hash routes never hit the network as paths.
 *  - Assets: cache first (they are content-hashed by Vite), then network.
 *  - CACHE_VERSION changes whenever the build changes, so old caches are deleted on activate.
 *
 * The app has no API calls and no telemetry; only same-origin GET requests are handled.
 */
const CACHE_VERSION = '__CACHE_VERSION__';
const CACHE_NAME = `algebra-playground-${CACHE_VERSION}`;
const PRECACHE = __PRECACHE_MANIFEST__; // injected at build time: absolute paths
const SHELL = __SHELL_URL__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Store assets as plain string URLs on purpose. `new Request(url)` defaulted the
      // entries to `no-cors` mode and `omit` credentials, and `cache.match(pageRequest)`
      // does not match across those modes or credentials. The cache then *looked* complete
      // (69 entries) while every real request missed it, so the app showed its boot screen
      // forever when offline. A string key is stored with `mode: 'cors'`,
      // `credentials: 'same-origin'`, which is what a same-origin page request uses.
      await cache.addAll(PRECACHE);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('algebra-playground-') && k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put(SHELL, fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          const cached = (await cache.match(SHELL)) || (await cache.match(req, { ignoreSearch: true }));
          if (cached) return cached;
          return new Response('<!doctype html><meta charset="utf-8"><title>Offline</title><p style="font-family:system-ui;padding:24px">Algebra Playground is not available offline yet. Visit once while connected to install it.</p>', {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
            status: 503,
          });
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Compare on the URL only: `cache.match(request)` also compares request mode and
      // credentials, so a match can miss for reasons that do not affect the content.
      const hit = (await cache.match(req)) || (await cache.match(url.pathname + url.search));
      if (hit) return hit;
      try {
        const fresh = await fetch(req);
        if (fresh.ok && fresh.type === 'basic') cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return new Response('', { status: 504, statusText: 'Offline and not cached' });
      }
    })(),
  );
});

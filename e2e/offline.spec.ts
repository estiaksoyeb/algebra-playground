import { test, expect, open, whileOffline } from './fixtures';

/**
 * Offline behaviour of the shipped service worker: after one visit the app shell, CSS,
 * JS and KaTeX chunks are cached, so a full reload with the network gone still works.
 */
test.describe('offline', () => {
  // Installs the worker, waits for the precache, then goes offline and reloads: slower than
  // a normal page test, so opt into a larger budget than the suite default.
  test.slow();

  test('works offline after the first visit, including a full reload', async ({ freshPage: page }) => {
    await open(page, '#/learn');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Wait until the worker controls this page.
    await page.waitForFunction(
      async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        return Boolean(reg?.active && navigator.serviceWorker.controller);
      },
      undefined,
      { timeout: 30_000 },
    );

    // The worker may have activated before `cache.addAll` finished populating it. Wait for
    // a complete cache. Values come back as primitives and a JSON string: a raw array
    // returned from a nested async evaluate has been observed arriving empty on this
    // mobile context, which made a correct app look broken.
    const readCache = () =>
      page.evaluate(async () => {
        const all = await caches.keys();
        const names = all.filter((k) => k.startsWith('algebra-playground'));
        const cache = names.length ? await caches.open(names[names.length - 1]) : null;
        const requests = cache ? await cache.keys() : [];
        const urls = requests.map((r) => r.url);
        return {
          count: names.length,
          list: JSON.stringify(names),
          hasJs: urls.some((u) => u.endsWith('.js')),
          hasCss: urls.some((u) => u.endsWith('.css')),
          hasIndex: urls.some((u) => u.endsWith('/index.html')),
          hasManifest: urls.some((u) => u.endsWith('/manifest.webmanifest')),
          total: urls.length,
        };
      });

    await expect
      .poll(
        async () => {
          const r = await readCache();
          if (r.count !== 1) return `caches=${r.count} ${r.list}`;
          const missing = [!r.hasJs && 'js', !r.hasCss && 'css', !r.hasIndex && 'index', !r.hasManifest && 'manifest'].filter(Boolean);
          return missing.length ? `missing=${missing.join(',')} total=${r.total}` : 'ready';
        },
        { timeout: 30_000 },
      )
      .toBe('ready');

    // A brand-new page while offline: the shell, route and styles all come from cache.
    await whileOffline(page, async () => {
      const offlinePage = await page.context().newPage();
      await offlinePage.goto(page.url());
      await expect(offlinePage.getByRole('heading', { level: 1 })).toBeVisible();
      // The mobile project shows the bottom bar and hides the desktop rail with CSS, so
      // match on the visible one on each viewport.
      await expect(offlinePage.locator('.bottom-nav:visible, .desktop-nav:visible').first()).toBeVisible();
      await offlinePage.close();

      // Client-side navigation still works with no network at all.
      await page.goto(`${page.url().split('#')[0]}#/playground/graph`);
      await expect(page.getByTestId('save-experiment')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Graph explorer');
    });
  });

  test('the worker version matches the deployed precache list', async ({ freshPage: page, request }) => {
    await open(page, '#/');
    const href = await page.getAttribute('link[rel="manifest"]', 'href');
    const manifestUrl = new URL(href!, page.url());
    const manifest = await (await request.get(manifestUrl.toString())).json();
    expect(manifest.name).toContain('Algebra');
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.display).toBe('standalone');
    for (const icon of manifest.icons) {
      const res = await request.get(new URL(icon.src, manifestUrl).toString());
      expect(res.status(), icon.src).toBe(200);
      expect((await res.body()).length).toBeGreaterThan(100);
    }

    // The launcher icon must actually be a legible letter. It once shipped with the crossbar
    // fused into the apex, so the counter (the triangular hole in the "A") was closed and the
    // icon read as a triangle. Size and status checks cannot see that, so decode the PNG and
    // assert the glyph is hollow above the crossbar: at mid-height there must be two separate
    // white runs (the legs), with a gap between them.
    const large = manifest.icons.find((i: { sizes: string }) => i.sizes === '512x512');
    expect(large, 'manifest should advertise a 512x512 icon').toBeTruthy();
    const png = await (await request.get(new URL(large.src, manifestUrl).toString())).body();
    const runs = await page.evaluate(async (bytes) => {
      const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      const isWhite = (x: number, y: number) => {
        const i = (y * width + x) * 4;
        return data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200 && data[i + 3] > 200;
      };
      // Count contiguous white runs across the middle row of the glyph's bounding box.
      let top = height, bottom = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (isWhite(x, y)) { top = Math.min(top, y); bottom = Math.max(bottom, y); break; }
        }
      }
      const y = Math.round((top + bottom) / 2);
      const segments: Array<[number, number]> = [];
      let start = -1;
      for (let x = 0; x < width; x++) {
        if (isWhite(x, y)) { if (start < 0) start = x; }
        else if (start >= 0) { segments.push([start, x - 1]); start = -1; }
      }
      if (start >= 0) segments.push([start, width - 1]);
      return segments;
    }, Array.from(png));
    expect(runs.length, `mid-height of the icon should show two legs, got ${JSON.stringify(runs)}`).toBe(2);
    expect(runs[1][0] - runs[0][1], 'the letter counter should be open').toBeGreaterThan(5);

    // Read the version from the worker itself: it is the single source of truth for which
    // cache a deployed build uses, and `sw-version.txt` is only a copy for humans.
    const sw = await (await request.get(new URL('sw.js', page.url()).toString())).text();
    const version = /const CACHE_VERSION = '([0-9a-f]{12})'/.exec(sw)?.[1];
    expect(version, 'sw.js should embed a 12-hex-character cache version').toBeTruthy();
    // The cache name is built from that constant at runtime, not interpolated at build time.
    expect(sw).toContain('const CACHE_NAME = `algebra-playground-${CACHE_VERSION}`');
    expect(sw).not.toContain('__PRECACHE_MANIFEST__');
    expect(sw).not.toContain('__CACHE_VERSION__');
    // The precache list must live under the app's own base (a GitHub Pages subpath), so
    // every entry has to start with that prefix rather than the filesystem root.
    const base = new URL('.', page.url()).pathname;
    const list = /const PRECACHE = (\[[^\]]*\])/.exec(sw)?.[1];
    expect(list, 'sw.js should embed a precache list').toBeTruthy();
    const urls = JSON.parse(list!) as string[];
    expect(urls.length).toBeGreaterThan(3);
    for (const u of urls) expect(u.startsWith(base), `${u} should start with ${base}`).toBe(true);
  });
});

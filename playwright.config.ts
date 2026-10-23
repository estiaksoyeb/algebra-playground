import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * End-to-end tests run against a production build served by `vite preview`, because
 * the service worker (offline test) must be exercised exactly as it ships.
 *
 * Each test gets a fresh browser context (see `e2e/fixtures.ts`), so stored progress
 * never leaks between tests.
 *
 * Subpath builds (GitHub Pages): E2E_BASE_PATH=/algebra-playground/ npx playwright test
 */
const basePath = process.env.E2E_BASE_PATH ?? '/';
const port = Number(process.env.E2E_PORT ?? 4179);
const origin = `http://127.0.0.1:${port}${basePath}`;

/**
 * Guards the `E2E_SKIP_BUILD` shortcut. Reusing an existing `dist/` is only valid when that
 * build was made for the same base path: a subpath build served at `/` (or the reverse)
 * leaves every asset 404ing, the app never mounts, and each test fails only after its full
 * `expect` timeout -- minutes of output that looks like a hang. Checking one asset path at
 * config load turns that into an immediate, self-explanatory error.
 */
function assertExistingBuildMatchesBase(): void {
  if (!process.env.E2E_SKIP_BUILD) return;
  const indexPath = path.resolve(process.cwd(), 'dist/index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error(
      `E2E_SKIP_BUILD is set but ${indexPath} does not exist. Run "npx vite build" first.`,
    );
  }
  const html = fs.readFileSync(indexPath, 'utf8');
  const scripts = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => m[1]);
  const expectedPrefix = basePath;
  const mismatched = scripts.filter((src) => !src.startsWith(expectedPrefix));
  if (mismatched.length > 0) {
    throw new Error(
      `dist/index.html does not match E2E_BASE_PATH.\n` +
        `  E2E_BASE_PATH: ${basePath}\n` +
        `  found assets:  ${mismatched.slice(0, 3).join(', ')}\n` +
        `Rebuild with matching BASE_PATH, or unset E2E_SKIP_BUILD to let Playwright build it.`,
    );
  }
}

assertExistingBuildMatchesBase();

export default defineConfig({
  testDir: './e2e',
  // Most tests are a page load plus a few assertions. The service-worker test is the only
  // genuinely slow one and opts into a longer budget locally, so a short default keeps a
  // broken build from turning into minutes of stacked 60s timeouts.
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: origin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    // Build separately from `preview`, so the timeout below only covers starting the
    // server. Set `E2E_SKIP_BUILD=1` when the caller has already produced `dist/` (the
    // deploy workflow builds once and reuses it for both E2E and the Pages artifact).
    //
    // `--host 127.0.0.1` is required, not cosmetic. Without it Vite binds the resolved
    // `localhost`, and on runners whose /etc/hosts maps `localhost` to `::1` first (GitHub's
    // ubuntu-latest does) it listens on IPv6 only. The probe URL above is the IPv4 literal,
    // so Playwright gets ECONNREFUSED for the whole timeout and reports a "webServer" failure
    // even though the server is running. Pinning both ends to 127.0.0.1 removes the resolver
    // from the equation. See docs/testing.md.
    command: `${process.env.E2E_SKIP_BUILD ? '' : 'npx vite build && '}npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: origin,
    reuseExistingServer: !process.env.CI,
    // Fail fast: a healthy server is reachable in well under a second, so waiting minutes
    // only delays the error message.
    timeout: 60_000,
    // Playwright discards the server's stdout by default, which turns any startup problem
    // into a bare timeout message. Keep both streams so the reason is in the CI log.
    stdout: 'pipe',
    stderr: 'pipe',
    env: { BASE_PATH: basePath },
  },
});

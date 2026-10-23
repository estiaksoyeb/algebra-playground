import { defineConfig, devices } from '@playwright/test';

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

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
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
    command: `npx vite build && npx vite preview --port ${port} --strictPort`,
    url: origin,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { BASE_PATH: basePath },
  },
});

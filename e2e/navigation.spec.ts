import { expect, test, open } from './fixtures';

const ROUTES = [
  ['#/', 'Home'],
  ['#/learn', 'Learn'],
  ['#/learn/w1-l1-counting', 'Counting & number representation'],
  ['#/playground', 'Playground'],
  ['#/playground/numberline', 'Number line'],
  ['#/playground/mystery', 'Mystery number'],
  ['#/playground/balance', 'Equation balance'],
  ['#/playground/tiles', 'Algebra tiles'],
  ['#/playground/evaluator', 'Expression evaluator'],
  ['#/playground/simplify', 'Simplify & compare'],
  ['#/playground/area', 'Area model'],
  ['#/playground/graph', 'Graph explorer'],
  ['#/progress', 'Progress'],
  ['#/progress/review', 'Review'],
  ['#/settings', 'Settings'],
  ['#/help', 'Help'],
] as const;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test.describe('navigation and layout', () => {
  test('every route renders with the right title and never logs an error', async ({ freshPage: page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    for (const [hash, title] of ROUTES) {
      await open(page, hash);
      const h1 = await page.locator('h1').first().innerText();
      expect(h1.trim().length, hash).toBeGreaterThan(0);
      expect(h1, hash).not.toMatch(/^(Loading|Error|Something went wrong)/);
      await expect(page).toHaveTitle(new RegExp(`^${escape(title)} · Algebra Playground$`));
      await expect(page.getByRole('main')).toHaveCount(1);
    }
    expect(errors).toEqual([]);
  });

  test('unknown routes show an honest not-found page with a way back', async ({ freshPage: page }) => {
    await open(page, '#/does-not-exist');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/does not exist/i);
    const home = page.locator('main a[href="#/"]').first();
    await expect(home).toBeVisible();
    await home.click();
    await expect(page).toHaveURL(/#\/$/);
  });

  test('unknown tool ids and unknown tabs are not found, not crashes', async ({ freshPage: page }) => {
    await open(page, '#/playground/not-a-tool');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/does not exist/i);
    await open(page, '#/progress/not-a-tab');
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('hash links navigate without a full page load', async ({ freshPage: page }) => {
    await open(page, '#/');
    await page.evaluate(() => ((window as unknown as { __noReload?: boolean }).__noReload = true));
    await page.locator('nav a[href="#/learn"]:visible').first().click();
    await expect(page).toHaveURL(/#\/learn$/);
    await expect(page.getByRole('heading', { level: 1, name: /learning path/i })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
  });

  test('the browser back button follows the hash history', async ({ freshPage: page }) => {
    await open(page, '#/');
    await page.locator('nav a[href="#/learn"]:visible').first().click();
    await expect(page).toHaveURL(/#\/learn$/);
    await page.goBack();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test.describe('mobile navigation', () => {
    test.skip(({ viewport }) => (viewport?.width ?? 0) >= 960, 'the bottom bar is for narrow screens');

    test('the bottom bar is pinned to the bottom and marks the current section', async ({ freshPage: page }) => {
      await open(page, '#/learn');
      const nav = page.locator('.bottom-nav');
      await expect(nav).toBeVisible();
      const box = (await nav.boundingBox())!;
      const viewport = page.viewportSize()!;
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
      await expect(nav.locator('a[href="#/learn"]')).toHaveAttribute('aria-current', 'page');
    });
  });

  test.describe('desktop navigation', () => {
    test.skip(({ viewport }) => (viewport?.width ?? 0) < 960, 'the side navigation is for wide screens');

    test('the side navigation is visible and marks the current section', async ({ freshPage: page }) => {
      await open(page, '#/playground');
      await expect(page.locator('.desktop-nav')).toBeVisible();
      await expect(page.locator('.bottom-nav')).toBeHidden();
      await expect(page.locator('.desktop-nav a[href="#/playground"]')).toHaveAttribute('aria-current', 'page');
    });
  });
});

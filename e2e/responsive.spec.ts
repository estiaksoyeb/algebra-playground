import { test, expect, open, reachPractice, expectNoHorizontalOverflow, expectMinTouchTargets } from './fixtures';

/**
 * Responsive sweep: every screen, at real device widths, must not scroll sideways
 * and (on touch-sized screens) must keep interactive controls at least 44px tall.
 */
const WIDTHS = [360, 390, 414, 768, 1280, 1440];

const ROUTES = [
  '#/',
  '#/learn',
  '#/learn/w1-l1-counting',
  '#/playground',
  '#/playground/numberline',
  '#/playground/mystery',
  '#/playground/balance',
  '#/playground/tiles',
  '#/playground/evaluator',
  '#/playground/simplify',
  '#/playground/area',
  '#/playground/graph',
  '#/progress',
  '#/progress/review',
  '#/settings',
  '#/help',
];

test.describe('responsive layout', () => {
  for (const width of WIDTHS) {
    test(`no horizontal overflow${width < 960 ? ' or tiny touch targets' : ''} at ${width}px`, async ({ freshPage: page }) => {
      await page.setViewportSize({ width, height: 900 });
      const problems: string[] = [];
      for (const hash of ROUTES) {
        await open(page, hash);
        try {
          await expectNoHorizontalOverflow(page);
        } catch (err) {
          problems.push(`${hash}: ${(err as Error).message.split('\n')[0]}`);
        }
        if (width < 960) {
          try {
            await expectMinTouchTargets(page);
          } catch (err) {
            problems.push(`${hash}: ${(err as Error).message}`);
          }
          const nav = page.locator('.bottom-nav');
          await expect(nav, hash).toBeVisible();
          const box = (await nav.boundingBox())!;
          expect(Math.abs(box.y + box.height - 900), hash).toBeLessThanOrEqual(2);
        }
      }
      expect(problems).toEqual([]);
    });
  }

  test('the lesson player fits after answering an exercise', async ({ freshPage: page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await reachPractice(page);
    await page.getByTestId('answer-input').fill('5');
    await page.getByTestId('submit-answer').click();
    await expect(page.getByTestId('tutor-feedback')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectMinTouchTargets(page);
  });

  // A block-level decoration (background, radius, padding, overflow) painted on an inline box
  // is drawn once per line fragment. When a display formula wrapped, that produced empty
  // rounded strips above and below the maths -- stray "pills" inside the exercise card. The
  // element must therefore be a single block box, which `getClientRects()` exposes directly:
  // an inline element that wraps reports several rects for one element.
  test('display maths is one block box, not one fragment per line', async ({ freshPage: page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await reachPractice(page, 'w1-l2-place-value');
    await expect(page.getByTestId('exercise-w1-l2-e1')).toBeVisible();

    const maths = page.locator('[data-testid="exercise-w1-l2-e1"] .math-block');
    await expect(maths).toHaveCount(1);
    const metrics = await maths.evaluate((el) => {
      const style = getComputedStyle(el);
      const rects = Array.from(el.getClientRects()).map((r) => ({ w: Math.round(r.width), h: Math.round(r.height) }));
      return { display: style.display, frags: rects.length, rects };
    });
    expect(metrics.display, 'math-block must be a block box').toBe('block');
    expect(metrics.frags, `one element must paint one box, got ${JSON.stringify(metrics.rects)}`).toBe(1);
    // A stray fragment was only ~48px tall; the real panel is comfortably taller.
    expect(metrics.rects[0].h).toBeGreaterThan(60);
  });

  test('mobile shows the bottom bar, desktop shows the side navigation', async ({ freshPage: page }) => {    await open(page, '#/learn');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.bottom-nav')).toBeVisible();
    await expect(page.locator('.desktop-nav')).toBeHidden();
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.locator('.desktop-nav')).toBeVisible();
    await expect(page.locator('.bottom-nav')).toBeHidden();
  });

  test('reduced motion is respected', async ({ freshPage: page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, '#/playground/graph');
    const ms = await page.evaluate(() => {
      const btn = document.querySelector('button');
      return btn ? getComputedStyle(btn).transitionDuration : '';
    });
    expect(ms === '' || parseFloat(ms) <= 0.02).toBe(true);
  });
});

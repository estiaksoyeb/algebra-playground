import { test, expect, open, expectNoHorizontalOverflow } from './fixtures';

/**
 * The learning path on a phone. These are presentation guarantees a screenshot cannot keep
 * honest: icons are drawn (not identifier text), long world titles wrap instead of pushing the
 * page sideways, and each world expands on its own without moving the page under the learner.
 *
 * The viewport is set per test because the project's `isMobile` flag (Pixel 5) wins over a
 * describe-level `test.use({ viewport })`.
 */
const MOBILE = { width: 390, height: 844 }; // Pixel-class phone, same as the fixtures

async function openMap(page: Parameters<typeof open>[0]) {
  await page.setViewportSize(MOBILE);
  await open(page, '#/learn');
}

test.describe('learning path layout', () => {
  test('world icons are drawn symbols and no identifier leaks as text', async ({ freshPage: page }) => {
    await openMap(page);
    const badges = page.locator('[data-testid^="world-icon-"]');
    await expect(badges).toHaveCount(7);
    const report = await badges.evaluateAll((els) =>
      els.map((el) => ({
        id: el.getAttribute('data-testid'),
        svgs: el.querySelectorAll('svg').length,
        text: (el.textContent ?? '').trim(),
        w: Math.round(el.getBoundingClientRect().width),
        h: Math.round(el.getBoundingClientRect().height),
        // Does the drawn icon stay inside its badge?
        overflow: Array.from(el.querySelectorAll('svg')).some((s) => {
          const r = s.getBoundingClientRect();
          const b = el.getBoundingClientRect();
          return r.left < b.left - 0.5 || r.right > b.right + 0.5 || r.top < b.top - 0.5 || r.bottom > b.bottom + 0.5;
        }),
      })),
    );
    for (const b of report) {
      expect(b.text, `${b.id} shows text instead of an icon`).toBe('');
      expect(b.svgs, `${b.id} has no svg`).toBeGreaterThan(0);
      expect(b.overflow, `${b.id} icon is clipped`).toBe(false);
      expect(b.w, `${b.id} width`).toBeGreaterThanOrEqual(40);
      expect(b.h, `${b.id} height`).toBeGreaterThanOrEqual(40);
    }
    // The identifiers are data, not copy: none may be printed as a word.
    const bodyText = (await page.locator('.page').first().innerText()).toLowerCase();
    for (const word of ['blocks', 'plusminus']) expect(bodyText).not.toMatch(new RegExp(`\\b${word}\\b`));
  });

  test('long world titles wrap without horizontal overflow', async ({ freshPage: page }) => {
    await openMap(page);
    // World 2 has the longest title and is collapsed by default: test the open state too.
    const world2 = page.getByTestId('world-negatives');
    await world2.getByRole('button', { name: /show lessons/i }).click();
    const heading = world2.getByRole('heading', { level: 2 });
    await expect(heading).toBeVisible();
    const box = (await heading.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(MOBILE.width + 1);
    // The title shares a row with the icon without colliding with it.
    const badge = (await world2.locator('[data-testid^="world-icon-"]').boundingBox())!;
    expect(box.x, 'title must not overlap the icon').toBeGreaterThanOrEqual(badge.x + badge.width - 0.5);
    await expectNoHorizontalOverflow(page);
  });

  test('a lesson card keeps title and metadata on separate lines', async ({ freshPage: page }) => {
    await openMap(page);
    const card = page.getByTestId('lesson-w1-l1-counting');
    await expect(card).toBeVisible();
    const title = card.locator('.lesson-card-title');
    const meta = card.locator('.lesson-card-meta');
    await expect(title).toHaveText(/counting/i);
    await expect(meta).toHaveText(/\d+\s*min/);
    const t = (await title.boundingBox())!;
    const m = (await meta.boundingBox())!;
    expect(m.y, 'metadata must start on a line below the title').toBeGreaterThanOrEqual(t.y + t.height - 1);
    await expectNoHorizontalOverflow(page);
  });

  test('two worlds expand together and stay independent', async ({ freshPage: page }) => {
    await openMap(page);
    const w1 = page.getByTestId('world-numbers');
    const w2 = page.getByTestId('world-negatives');
    const t1 = w1.getByRole('button', { name: /(show|hide) lessons/i });
    const t2 = w2.getByRole('button', { name: /(show|hide) lessons/i });

    // World 1 starts open (the next lesson lives there); opening World 2 must not close it.
    await expect(t1).toHaveAttribute('aria-expanded', 'true');
    await t2.click();
    await expect(t2).toHaveAttribute('aria-expanded', 'true');
    await expect(t1).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#world-list-numbers')).toBeVisible();
    await expect(page.locator('#world-list-negatives')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // Closing World 2 leaves World 1 exactly as it was.
    await t2.click();
    await expect(t2).toHaveAttribute('aria-expanded', 'false');
    await expect(t1).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#world-list-negatives')).toHaveCount(0);
  });

  test('expanding a world keeps the page where it was and does not navigate', async ({ freshPage: page }) => {
    await openMap(page);
    const w2Toggle = page.getByTestId('world-negatives').getByRole('button', { name: /show lessons/i });
    await w2Toggle.scrollIntoViewIfNeeded();
    const read = () =>
      page.evaluate(() => ({
        hash: location.hash,
        y: window.scrollY,
        top: document.querySelector('[data-testid="world-negatives"]')!.getBoundingClientRect().top,
      }));
    const before = await read();
    await w2Toggle.click();
    await expect(page.getByTestId('world-negatives')).toHaveAttribute('data-expanded', 'true');
    const after = await read();
    expect(after.hash).toBe(before.hash);
    // The clicked world stays put on screen (its own content grows below it).
    expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(4);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(4);
  });

  test('lesson links still navigate from an expanded world', async ({ freshPage: page }) => {
    await openMap(page);
    await page.getByTestId('lesson-w1-l1-counting').click();
    await expect(page).toHaveURL(/#\/learn\/w1-l1-counting$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/counting/i);
  });
});

test.describe('learning path on desktop', () => {
  test('two worlds expand together and nothing overflows', async ({ freshPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, '#/learn');
    const w2 = page.getByTestId('world-negatives');
    const w4 = page.getByTestId('world-equality');
    await w2.getByRole('button', { name: /show lessons/i }).click();
    await w4.getByRole('button', { name: /show lessons/i }).click();
    await expect(page.locator('#world-list-negatives')).toBeVisible();
    await expect(page.locator('#world-list-equality')).toBeVisible();
    await expect(page.locator('#world-list-numbers')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

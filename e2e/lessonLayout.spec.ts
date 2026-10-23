import { test, expect, open } from './fixtures';

/**
 * The lesson action bar is docked above the bottom navigation on phones. Two bugs are
 * locked out here:
 *  - the bar overlapped the content it sat over (the "Position" block and the maths above
 *    it), and showed a translucent background with no edge;
 *  - in practice, the three buttons squeezed "Next exercise" and "Skip for now" onto two
 *    lines while the answer input was hidden underneath the bar.
 */
test.describe('lesson action bar', () => {
  const coveredText = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const foot = document.querySelector('.lesson-footer')!.getBoundingClientRect();
      const nav = document.querySelector('.bottom-nav')!.getBoundingClientRect();
      const nodes = [...document.querySelectorAll('.lesson-step h2, .lesson-step p, .lesson-step li, .tool-label, .tool-stat, h2, h3, h4')];
      return nodes
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ el, r }) => el.textContent?.trim() && r.height > 0 && r.top < nav.top && r.bottom > foot.top)
        .map(({ el }) => (el.textContent ?? '').trim().slice(0, 40));
    });

  /**
   * The equation strip is sticky with its own z-index, and it slides *under* the docked
   * bar. That overlap is only a layering question: the bar must be the one on top.
   */
  const stripLayering = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const strip = document.querySelector<HTMLElement>('.equation-strip');
      const foot = document.querySelector<HTMLElement>('.lesson-footer')!;
      if (!strip) return null;
      const r = strip.getBoundingClientRect();
      const f = foot.getBoundingClientRect();
      const overlaps = r.bottom > f.top && r.top < f.bottom;
      const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(Math.min(r.bottom - 6, f.top + 12)));
      return {
        overlapsBar: overlaps,
        stripZ: Number(getComputedStyle(strip).zIndex),
        barZ: Number(getComputedStyle(foot).zIndex),
        topmostIsBar: foot.contains(hit),
      };
    });

  test('teaching steps: nothing readable sits under the bar', async ({ freshPage: page }) => {
    await open(page, '#/learn/w1-l1-counting');
    await page.getByTestId('next-step').click();
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(400);

    const mobile = (await page.viewportSize())!.width < 960;
    const bar = await page.evaluate(() => {
      const foot = document.querySelector<HTMLElement>('.lesson-footer')!;
      const nav = document.querySelector<HTMLElement>('.bottom-nav')!;
      const cs = getComputedStyle(foot);
      const r = foot.getBoundingClientRect();
      return {
        position: cs.position,
        background: cs.backgroundColor,
        borderTop: parseFloat(cs.borderTopWidth),
        bottom: Math.round(r.bottom),
        navTop: Math.round(nav.getBoundingClientRect().top),
      };
    });

    expect(await coveredText(page), 'no lesson text may sit under the action bar').toEqual([]);
    if (mobile) {
      // Docked over content: it must be opaque and edged, or the maths shows through it.
      expect(bar.background, 'the bar is opaque, not see-through').toMatch(/^rgb\(/);
      expect(bar.position, 'the bar is docked on phones').toBe('fixed');
      expect(bar.borderTop).toBeGreaterThan(0);

      // Content that is itself sticky (the number-line equation strip) must stay *under*
      // the bar. When the bar had a lower z-index, the "POSITION" block painted on top.
      const layering = await stripLayering(page);
      console.log('STACKING', JSON.stringify(layering));
      if (layering && layering.overlapsBar) {
        expect(layering.barZ, 'the bar must outrank in-card sticky content').toBeGreaterThan(layering.stripZ);
        expect(layering.topmostIsBar, 'the bar must paint above the equation strip').toBe(true);
      }
    } else {
      // Desktop keeps the shared sticky footer, which stays inside the card with a seam.
      expect(bar.position, 'desktop keeps the bar in the card flow').toBe('sticky');
      expect(bar.borderTop).toBeGreaterThan(0);
    }
  });

  test('practice: the answer input is reachable and the labels fit on one line', async ({ freshPage: page }) => {
    await open(page, '#/learn/w1-l1-counting');
    for (let i = 0; i < 3; i++) await page.getByTestId('next-step').click();
    await expect(page.getByTestId('answer-input')).toBeVisible();
    // First paint: the bar must already be docked, not sitting mid-screen over the input.
    const atLoad = await page.evaluate(() => {
      const input = document.querySelector('[data-testid="answer-input"]')!.getBoundingClientRect();
      const foot = document.querySelector('.lesson-footer')!.getBoundingClientRect();
      return { inputBottom: Math.round(input.bottom), footerTop: Math.round(foot.top), footerBottom: Math.round(foot.bottom), vh: window.innerHeight };
    });
    console.log('AT_LOAD', JSON.stringify(atLoad));
    expect(atLoad.inputBottom, 'the bar must not cover the answer input before any scrolling').toBeLessThanOrEqual(atLoad.footerTop + 1);
    if ((await page.viewportSize())!.width < 960) {
      expect(Math.abs(atLoad.vh - atLoad.footerBottom), 'the bar is docked on first paint').toBeLessThanOrEqual(1);
    }

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(400);

    const geom = await page.evaluate(() => {
      const input = document.querySelector('[data-testid="answer-input"]')!.getBoundingClientRect();
      const foot = document.querySelector('.lesson-footer')!.getBoundingClientRect();
      return { inputBottom: Math.round(input.bottom), footerTop: Math.round(foot.top) };
    });
    expect(geom.inputBottom, 'the bar must not cover the answer input').toBeLessThanOrEqual(geom.footerTop + 1);
    expect(await coveredText(page), 'no exercise text may sit under the bar').toEqual([]);

    const buttons = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.lesson-footer .btn')].map((b) => {
        const cs = getComputedStyle(b);
        const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
        const inner = b.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        return { text: (b.textContent ?? '').trim(), lines: Math.round(inner / line), width: Math.round(b.getBoundingClientRect().width) };
      }),
    );
    for (const b of buttons) {
      expect(b.lines, `"${b.text}" must stay on one line`).toBeLessThanOrEqual(1);
      expect(b.width, `"${b.text}" must be a comfortable target`).toBeGreaterThan(72);
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'no horizontal overflow at phone widths').toBeLessThanOrEqual(1);
  });

  test('the practice bar docks flush at the bottom edge', async ({ freshPage: page }) => {
    // In practice / check the nav steps aside on phones so the action bar can own the bottom
    // edge — flush, never floating over the input and never hidden behind a nav.
    await open(page, '#/learn/w1-l1-counting');
    for (let i = 0; i < 3; i++) await page.getByTestId('next-step').click();
    await expect(page.getByTestId('answer-input')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const m = await page.evaluate(() => {
      const foot = document.querySelector('.lesson-footer')!.getBoundingClientRect();
      const nav = document.querySelector<HTMLElement>('.bottom-nav')!;
      return {
        gapFromEdge: Math.round(window.innerHeight - foot.bottom),
        navDisplay: getComputedStyle(nav).display,
      };
    });
    console.log('PRACTICE_DOCK', JSON.stringify(m));
    if ((await page.viewportSize())!.width < 960) {
      expect(m.navDisplay, 'the nav steps aside in practice on phones').toBe('none');
      expect(Math.abs(m.gapFromEdge), 'the practice bar is flush with the bottom edge').toBeLessThanOrEqual(1);
    }
  });

  test('the teaching bar sits flush on the nav', async ({ freshPage: page }) => {
    // Teaching steps keep the nav (it is the way out of the lesson) and the fixed bar rests
    // directly on it — the same flush surface, no floating sliver.
    await open(page, '#/learn/w1-l1-counting');
    await page.getByTestId('next-step').click();
    await page.waitForTimeout(300);

    const m = await page.evaluate(() => {
      const foot = document.querySelector('.lesson-footer')!.getBoundingClientRect();
      const nav = document.querySelector<HTMLElement>('.bottom-nav')!;
      return {
        gapAboveNav: Math.round(nav.getBoundingClientRect().top - foot.bottom),
        navDisplay: getComputedStyle(nav).display,
      };
    });
    console.log('TEACH_DOCK', JSON.stringify(m));
    if ((await page.viewportSize())!.width < 960) {
      expect(m.navDisplay, 'the nav stays visible while teaching').not.toBe('none');
      expect(Math.abs(m.gapAboveNav), 'the teaching bar sits flush on the nav').toBeLessThanOrEqual(1);
    }
  });
});

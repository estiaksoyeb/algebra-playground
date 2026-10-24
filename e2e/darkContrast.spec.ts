import { test, expect, open, expectNoHorizontalOverflow } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Dark-mode contrast and tool spacing, measured in a real browser.
 *
 * The regression this guards was invisible to unit tests: one dark-theme rule painted every
 * button label #0d1218 on a #1c242e surface (1.2:1). These tests compute the *rendered* colour
 * of real controls and the contrast ratio against the surface behind them.
 */

/** Start a page in a given theme (the app reads this localStorage mirror before first paint). */
async function startIn(page: Page, theme: 'dark' | 'light', hash: string) {
  await page.addInitScript((t) => localStorage.setItem('algebra-playground:theme', t), theme);
  await open(page, hash);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

/**
 * Contrast of an element's own colour against the first ancestor background that is not
 * transparent. Resolved in the page so inherited/currentColor values are the real ones.
 */
function contrastOf(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => {
    const parse = (c: string): [number, number, number, number] | null => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(/[,/]/).map((v) => parseFloat(v.trim()));
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    };
    const lum = ([r, g, b]: [number, number, number, number]) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const fg = parse(getComputedStyle(el).color)!;
    let node: Element | null = el;
    let bg: [number, number, number, number] | null = null;
    while (node) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && c[3] > 0.01) {
        bg = c;
        break;
      }
      node = node.parentElement;
    }
    bg ??= [247, 246, 242, 1];
    const l1 = lum(fg);
    const l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    return { ratio, color: getComputedStyle(el).color, bg: `rgb(${bg.slice(0, 3).join(', ')})` };
  });
}

const PHONE = { width: 390, height: 844 };
const SMALL_PHONE = { width: 360, height: 740 };

test.describe('dark-mode contrast', () => {
  test('every button on the number-line tool is readable in dark mode', async ({ freshPage: page }) => {
    await page.setViewportSize(PHONE);
    await startIn(page, 'dark', '#/playground/numberline');
    const selectors = [
      '[data-testid="undo"]',
      '[data-testid="reset-tool"]',
      '.btn-secondary:visible',
      '.btn-ghost:visible',
      '.tool-tabs button',
      '.stepper button',
      'a[aria-label="Settings"]',
    ];
    for (const sel of selectors) {
      const r = await contrastOf(page, sel);
      expect(r.ratio, `${sel} contrast ${r.ratio.toFixed(2)} (${r.color} on ${r.bg})`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('the header icon control is visible in dark mode', async ({ freshPage: page }) => {
    await page.setViewportSize(PHONE);
    await startIn(page, 'dark', '#/learn');
    const settings = page.locator('a[aria-label="Settings"]');
    await expect(settings).toBeVisible();
    const r = await contrastOf(page, 'a[aria-label="Settings"]');
    expect(r.ratio).toBeGreaterThanOrEqual(4.5);
    // The SVG inherits the button colour; it must not be a hard-coded dark stroke.
    const stroke = await settings.locator('svg').evaluate((el) => getComputedStyle(el).stroke);
    const parent = await settings.evaluate((el) => getComputedStyle(el).color);
    expect(stroke).toBe(parent);
    // And it is a comfortable, square tap target.
    const box = (await settings.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test('"All lessons", Undo/Redo and Reset are readable in the lesson player', async ({ freshPage: page }) => {
    await page.setViewportSize(PHONE);
    await startIn(page, 'dark', '#/learn/w1-l1-counting');
    await expect(page.getByTestId('prev-step')).toHaveText(/all lessons/i);
    const allLessons = await contrastOf(page, '[data-testid="prev-step"]');
    expect(allLessons.ratio, `All lessons ${allLessons.color} on ${allLessons.bg}`).toBeGreaterThanOrEqual(4.5);
    const bar = page.locator('.embedded-tool-bar');
    await expect(bar).toBeVisible();
    for (const label of ['Undo', 'Redo', 'Reset']) {
      // Undo/Redo name themselves with aria-label="Undo"/"Redo"; Reset has no label.
      const btn = bar.getByRole('button', { name: new RegExp(`^${label}`) });
      const r = await btn.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { color: cs.color, opacity: cs.opacity };
      });
      expect(r.color, `${label} must not be near-black in dark mode`).not.toMatch(/rgb\(13, 18, 24\)/);
      // Disabled Undo/Redo keep full opacity and a muted-but-legible colour.
      expect(r.opacity).toBe('1');
    }
  });

  test('disabled controls stay distinguishable and legible', async ({ freshPage: page }) => {
    await page.setViewportSize(PHONE);
    await startIn(page, 'dark', '#/playground/numberline');
    const undo = page.getByTestId('undo');
    await expect(undo).toBeDisabled();
    const r = await contrastOf(page, '[data-testid="undo"]');
    expect(r.ratio, `disabled Undo ${r.color} on ${r.bg}`).toBeGreaterThanOrEqual(4.5);
    // Still visibly disabled: it does not look like the fresh (enabled) Reset beside it.
    const enabledColor = (await contrastOf(page, '[data-testid="reset-tool"]')).color;
    expect(r.color).not.toBe(enabledColor);
  });

  test('outlined and ghost buttons are readable in dark mode', async ({ freshPage: page }) => {
    await page.setViewportSize(PHONE);
    await startIn(page, 'dark', '#/playground/numberline');
    // Accessible names, not visible text: the step buttons carry an aria-label ("Step left").
    for (const label of ['Step left', 'Mark here', 'Zoom in']) {
      const r = await page
        .getByRole('button', { name: label, exact: true })
        .evaluate((el) => {
          const parse = (c: string) => c.match(/\d+/g)!.slice(0, 3).map(Number);
          const lum = (rgb: number[]) => {
            const f = (v: number) => {
              const s = v / 255;
              return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            };
            return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
          };
          const cs = getComputedStyle(el);
          const fg = parse(cs.color);
          const bgEl = cs.backgroundColor === 'rgba(0, 0, 0, 0)' ? el.parentElement! : el;
          const bg = parse(getComputedStyle(bgEl).backgroundColor);
          const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
          return { ratio: (a + 0.05) / (b + 0.05), color: cs.color };
        });
      expect(r.ratio, `${label} contrast ${r.ratio.toFixed(2)} (${r.color})`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('light mode stays readable (no regression)', async ({ freshPage: page }) => {
    await page.setViewportSize(PHONE);
    await startIn(page, 'light', '#/playground/numberline');
    for (const sel of ['[data-testid="reset-tool"]', '.btn-secondary:visible', 'a[aria-label="Settings"]']) {
      const r = await contrastOf(page, sel);
      expect(r.ratio, `${sel} ${r.color} on ${r.bg}`).toBeGreaterThanOrEqual(4.5);
    }
    const primary = await contrastOf(page, 'a[aria-label="Settings"]');
    expect(primary.ratio).toBeGreaterThanOrEqual(4.5);
  });
});

test.describe('tool spacing on phones', () => {
  for (const vp of [PHONE, SMALL_PHONE]) {
    test(`tool controls fit their card at ${vp.width}px without overflow`, async ({ freshPage: page }) => {
      await page.setViewportSize(vp);
      await startIn(page, 'light', '#/playground/numberline');
      await expectNoHorizontalOverflow(page);
      // Every button row stays inside its own card.
      const report = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('.tool-tabs, .btn-row, .stepper'));
        return rows.map((row) => {
          const r = row.getBoundingClientRect();
          const card = row.closest('.card, .tool-canvas, .embedded-tool');
          const c = card ? card.getBoundingClientRect() : null;
          return { w: r.width, right: r.right, cardRight: c ? c.right : null };
        });
      });
      for (const r of report) {
        expect(r.w).toBeGreaterThan(0);
        if (r.cardRight !== null) expect(r.right).toBeLessThanOrEqual(r.cardRight + 1);
        expect(r.right).toBeLessThanOrEqual(vp.width + 1);
      }
    });
  }

  test('the inline lesson tool separates its parts instead of stacking them flush', async ({ freshPage: page }) => {
    await page.setViewportSize(PHONE);
    await startIn(page, 'light', '#/learn/w1-l1-counting');
    const tool = page.locator('.embedded-tool');
    await expect(tool).toBeVisible();
    const gaps = await tool.evaluate((el) => {
      const cs = getComputedStyle(el);
      const note = el.querySelector('.embedded-tool-note')!;
      const noteCs = getComputedStyle(note);
      const canvas = el.querySelector('.tool-canvas')!;
      const canvasCs = getComputedStyle(canvas);
      return {
        rowGap: parseFloat(cs.rowGap || cs.gap || '0'),
        notePaddingTop: parseFloat(noteCs.paddingTop),
        notePaddingLeft: parseFloat(noteCs.paddingLeft),
        canvasPadding: parseFloat(canvasCs.paddingTop),
      };
    });
    expect(gaps.rowGap, 'inline tool children need a real gap').toBeGreaterThanOrEqual(12);
    expect(gaps.notePaddingTop, '"Try it here" needs padding').toBeGreaterThanOrEqual(8);
    expect(gaps.notePaddingLeft, '"Try it here" needs padding').toBeGreaterThanOrEqual(12);
    expect(gaps.canvasPadding, 'visualisation needs internal padding').toBeGreaterThanOrEqual(8);
  });

  test('the heading, description and visualisation do not touch', async ({ freshPage: page }) => {
    await page.setViewportSize(PHONE);
    await startIn(page, 'light', '#/playground/numberline');
    const desc = page.locator('header p').first();
    const canvas = page.locator('.tool-canvas').first();
    const eq = page.locator('.equation-strip').first();
    const [d, c, e] = [(await desc.boundingBox())!, (await canvas.boundingBox())!, (await eq.boundingBox())!];
    expect(e.y, 'equation strip must clear the description').toBeGreaterThanOrEqual(d.y + d.height);
    expect(c.y, 'canvas must clear the equation strip').toBeGreaterThanOrEqual(e.y + e.height);
    // And the text is not glued to the canvas edge either.
    const inner = await page.locator('.tool-canvas svg').first().boundingBox();
    if (inner) {
      expect(inner.x - c.x).toBeGreaterThanOrEqual(8);
    }
  });

  test('the green Tip card is separated from the tool above it', async ({ freshPage: page }) => {
    await page.setViewportSize(PHONE);
    await startIn(page, 'light', '#/learn/w1-l1-counting');
    const tip = page.locator('.callout-tip').first();
    await expect(tip).toBeVisible();
    const note = page.locator('.embedded-tool-note').first();
    const [n, t] = [(await note.boundingBox())!, (await tip.boundingBox())!];
    expect(t.y, 'the Tip card must not touch the "Try it here" panel').toBeGreaterThanOrEqual(n.y + n.height);
  });
});

import { test as base, expect, Page, BrowserContextOptions } from '@playwright/test';

/**
 * End-to-end fixtures.
 *
 * Every test starts in a *fresh browser context*: new IndexedDB, new service worker
 * registration. Sharing a context would leak saved lessons between tests, and a page's
 * keep-alive IndexedDB connection can block a clean wipe. A new context is the only
 * honest "first visit".
 */

export const OVERFLOW_LEAK = 1; // sub-pixel rounding tolerance

const MOBILE: BrowserContextOptions = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2.75,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
};

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const result = await page.evaluate(() => {
    const de = document.documentElement;
    const offenders: string[] = [];
    if (de.scrollWidth > window.innerWidth + 1) {
      for (const el of Array.from(document.querySelectorAll('body *'))) {
        const r = el.getBoundingClientRect();
        if (r.right > window.innerWidth + 1 && r.width > 0) {
          if (getComputedStyle(el).position === 'fixed') continue;
          offenders.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 40)} right=${Math.round(r.right)}`);
        }
      }
    }
    return { scrollWidth: de.scrollWidth, innerWidth: window.innerWidth, offenders: offenders.slice(0, 8) };
  });
  expect(result.scrollWidth, `horizontal overflow; offenders: ${result.offenders.join(' | ')}`).toBeLessThanOrEqual(result.innerWidth + OVERFLOW_LEAK);
}

/** Open a hash route with a full page load, and wait until the page heading exists. */
export async function open(page: Page, hash: string): Promise<void> {
  await page.goto(`./${hash}`);
  await expect(page.locator('h1').first()).toBeVisible();
}

export async function expectMinTouchTargets(page: Page, selector = 'a, button, input, select, textarea, [role="tab"], label.choice'): Promise<void> {
  const small = await page.evaluate((sel) => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      // Radio/checkbox inputs are not the target: the surrounding label is.
      if (el instanceof HTMLInputElement && ['radio', 'checkbox'].includes(el.type)) continue;
      // The skip link is off-screen until focused.
      if ((el.getAttribute('href') ?? '').startsWith('#main')) continue;
      // Inline links inside running text are exempt (WCAG 2.5.8 exception).
      if (el.classList.contains('inline-link') || cs.display === 'inline') continue;
      if (r.height < 44 - 0.5) out.push(`${el.tagName.toLowerCase()}[${(el.textContent ?? '').trim().slice(0, 30)}] ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out.slice(0, 10);
  }, selector);
  if (small.length) throw new Error(`touch targets under 44px tall: ${small.join(' | ')}`);
}

export async function collectConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

/** Answer the exercise currently on screen (choice or typed). Waits for the verdict. */
export async function answerCurrentExercise(page: Page, answer: string, expectCorrect = true): Promise<void> {
  const choices = page.locator('.choice');
  if (await choices.count()) {
    const n = await choices.count();
    let clicked = false;
    for (let i = 0; i < n; i++) {
      if ((await choices.nth(i).innerText()).trim() === answer) {
        await choices.nth(i).click();
        clicked = true;
        break;
      }
    }
    if (!clicked) await choices.first().click();
  } else {
    await page.getByTestId('answer-input').fill(answer);
    await page.getByTestId('submit-answer').click();
  }
  if (expectCorrect) await expect(page.getByTestId('feedback-correct')).toBeVisible();
}

/** Run `fn` while the browser context is offline, then restore the connection. */
export async function whileOffline<T>(page: Page, fn: () => Promise<T>): Promise<T> {
  const context = page.context();
  await context.setOffline(true);
  try {
    return await fn();
  } finally {
    await context.setOffline(false);
  }
}

type Fixtures = {
  /** A page in a brand-new browser context (fresh IndexedDB + service worker). */
  freshPage: Page;
};

export const test = base.extend<Fixtures>({
  freshPage: async ({ browser, isMobile, baseURL }, use) => {
    const context = await browser.newContext(isMobile ? { ...MOBILE, baseURL } : { viewport: { width: 1280, height: 900 }, baseURL });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect };

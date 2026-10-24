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

/** The saved lesson-progress record for `lessonId`, read straight from IndexedDB. */
export function storedLessonState(page: Page, lessonId: string): Promise<Record<string, unknown> | undefined> {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('algebra-playground');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      const row = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
        const req = db.transaction('lessonStates', 'readonly').objectStore('lessonStates').get(id);
        req.onsuccess = () => resolve(req.result as Record<string, unknown> | undefined);
        req.onerror = () => reject(req.error);
      });
      // `get` returns a DataCloneError-free plain object; JSON keeps the assertion simple.
      return row ? (JSON.parse(JSON.stringify(row)) as Record<string, unknown>) : undefined;
    } finally {
      // Connections opened here would block a later reload's upgrade; close immediately.
      db.close();
    }
  }, lessonId);
}

/** Every row of a store, for tests that assert on attempts/history as a whole. */
export function storedRows(page: Page, store: string): Promise<Record<string, unknown>[]> {
  return page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('algebra-playground');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      const rows = await new Promise<unknown[]>((resolve, reject) => {
        const req = db.transaction(name, 'readonly').objectStore(name).getAll();
        req.onsuccess = () => resolve(req.result as unknown[]);
        req.onerror = () => reject(req.error);
      });
      return JSON.parse(JSON.stringify(rows)) as Record<string, unknown>[];
    } finally {
      db.close();
    }
  }, store);
}

declare global {
  interface Window {
    /** Set by `injectLessonSaveFailure`: while true, every lesson-progress write fails. */
    __failLessonSave?: boolean;
    /** How many lesson-progress writes the injector has made fail. */
    __failedLessonSaves?: number;
  }
}

/**
 * Make the next lesson-progress writes fail the way a full disk does.
 *
 * The `put` is issued on the real store and then the transaction is aborted before it can
 * commit, so the request itself is never answered: nothing is written and nothing reports
 * success. That is the failure the audit forced with a QuotaExceededError and the same
 * one a browser abort produces. Set `window.__failLessonSave = false` to let storage work.
 */
export async function injectLessonSaveFailure(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__failLessonSave = true;
    window.__failedLessonSaves = 0;
    const proto = IDBDatabase.prototype;
    const original = proto.transaction;
    proto.transaction = function (this: IDBDatabase, names: string | string[], mode?: IDBTransactionMode, options?: IDBTransactionOptions) {
      const tx = original.call(this, names, mode, options);
      const stores = typeof names === 'string' ? [names] : names;
      if (mode === 'readwrite' && stores.includes('lessonStates') && window.__failLessonSave) {
        const store = tx.objectStore('lessonStates');
        const put = store.put.bind(store);
        // Only writes are sabotaged; reads keep working so the page still loads.
        Object.defineProperty(store, 'put', {
          configurable: true,
          value: (...args: unknown[]) => {
            const request = (put as (...a: unknown[]) => IDBRequest)(...args);
            window.__failedLessonSaves = (window.__failedLessonSaves ?? 0) + 1;
            tx.abort();
            return request;
          },
        });
      }
      return tx;
    } as typeof proto.transaction;
  });
}

/** Let lesson-progress writes succeed again after `injectLessonSaveFailure`. */
export async function allowLessonSaves(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__failLessonSave = false;
  });
}

/** Wait until the lesson controls are live (the player has finished restoring). */
export async function expectLessonReady(page: Page): Promise<void> {
  await expect(page.getByTestId('next-step').or(page.getByTestId('prev-step')).or(page.getByTestId('lesson-complete')).first()).toBeVisible();
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

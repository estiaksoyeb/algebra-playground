import { test, expect, open, collectConsoleErrors } from './fixtures';

/**
 * Lesson flow for the first lesson: teaching steps → practice → mastery check →
 * completion, and what happens on reload, wrong answers and hints.
 */

/** Click through the teaching steps until the first practice exercise appears. */
async function reachPractice(page: import('@playwright/test').Page): Promise<void> {
  await open(page, '#/learn/w1-l1-counting');
  for (let i = 0; i < 10; i++) {
    if (await page.getByTestId('answer-input').count()) return;
    await page.getByTestId('next-step').click();
  }
  throw new Error('practice screen never appeared');
}

/** The four practice answers for w1-l1, in order. */
const PRACTICE = ['6', '7', '11', '10'];
/** The two mastery-check answers, in order. */
const CHECKS = ['5', '10'];

async function answerPractice(page: import('@playwright/test').Page, answers: string[]): Promise<void> {
  for (const answer of answers) {
    await expect(page.getByTestId('answer-input')).toBeVisible();
    await page.getByTestId('answer-input').fill(answer);
    await page.getByTestId('submit-answer').click();
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    await page.getByTestId('next-exercise').click();
  }
}

async function passChecks(page: import('@playwright/test').Page): Promise<void> {
  for (let i = 0; i < CHECKS.length; i++) {
    await expect(page.getByText('Mastery check')).toBeVisible();
    await page.getByTestId('answer-input').fill(CHECKS[i]);
    await page.getByTestId('submit-answer').click();
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    // Only the last question finishes; earlier ones advance.
    if (i < CHECKS.length - 1) await page.getByTestId('next-check').click();
  }
  await page.getByTestId('finish-lesson').click();
}

test.describe('completing a lesson', () => {
  test('practice → mastery check → completion, and the result survives a reload', async ({ freshPage: page }) => {
    const errors = await collectConsoleErrors(page);
    await reachPractice(page);
    await answerPractice(page, PRACTICE);
    await passChecks(page);

    await expect(page.getByTestId('lesson-complete')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('lesson-complete')).toBeVisible();

    // The learning path marks the lesson done, and progress counts its attempt.
    await open(page, '#/learn');
    await expect(page.getByTestId('lesson-w1-l1-counting').locator('.lesson-status')).toHaveAttribute('data-state', 'done');

    await open(page, '#/settings');
    const attempts = page.locator('.stat').filter({ hasText: 'attempts' }).first().locator('.stat-value');
    await expect(attempts).toHaveText('6'); // 4 practice + 2 check
    expect(errors).toEqual([]);
  });

  test('a wrong answer gets tutor feedback, stays editable, and does not count as solved', async ({ freshPage: page }) => {
    await reachPractice(page);
    await page.getByTestId('answer-input').fill('5');
    await page.getByTestId('submit-answer').click();
    await expect(page.getByTestId('tutor-feedback')).toBeVisible();
    await expect(page.getByTestId('feedback-correct')).toHaveCount(0);
    await expect(page.getByTestId('answer-input')).toBeEnabled();
    // Then the right answer works in the same card.
    await page.getByTestId('answer-input').fill('6');
    await page.getByTestId('submit-answer').click();
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
  });

  test('practice hints are free: they show one at a time and a hinted answer still counts', async ({ freshPage: page }) => {
    await reachPractice(page);
    await page.getByTestId('hint-button').click();
    await expect(page.getByTestId('static-hints')).toContainText(/Hint 1/);
    await page.getByTestId('hint-button').click();
    await expect(page.getByTestId('static-hints')).toContainText(/Hint 2/);
    await page.getByTestId('answer-input').fill('6');
    await page.getByTestId('submit-answer').click();
    await expect(page.getByTestId('feedback-correct')).toBeVisible();

    await open(page, '#/progress');
    await expect(page.getByText(/independent|across/i).first()).toBeVisible();
  });

  test('a mastery check offers no hints and cannot be finished with help', async ({ freshPage: page }) => {
    await reachPractice(page);
    await answerPractice(page, PRACTICE);

    await expect(page.getByText('Mastery check')).toBeVisible();
    // The promise on screen ("these questions come without hints") is the truth: there is
    // no hint control on a check, because the engine treats any recorded hint as proof
    // that the idea was not known unaided.
    await expect(page.getByTestId('hint-button')).toHaveCount(0);

    // Without answering, the lesson cannot be finished either.
    await expect(page.getByTestId('finish-lesson')).toHaveCount(0);
    await expect(page.getByText(/come without hints/i)).toBeVisible();
  });

  test('the lesson resumes on the same teaching step after a reload', async ({ freshPage: page }) => {
    await open(page, '#/learn/w1-l1-counting');
    await expect(page.getByTestId('next-step')).toBeVisible();
    await page.getByTestId('next-step').click();
    await expect(page.getByText(/Step 2 of/i)).toBeVisible();
    await expect.poll(async () => page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('algebra-playground');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const rows = await new Promise<Array<{ currentStep?: number }>>((resolve, reject) => {
        const req = db.transaction('lessonStates').objectStore('lessonStates').getAll();
        req.onsuccess = () => resolve(req.result as Array<{ currentStep?: number }>);
        req.onerror = () => reject(req.error);
      });
      return rows[0]?.currentStep;
    })).toBe(1);
    await page.reload();
    await expect(page.getByText(/Step 2 of/i)).toBeVisible();
  });

  test('a lesson opened directly while another is unfinished is still playable', async ({ freshPage: page }) => {
    await open(page, '#/learn/w1-l2-place-value');
    await expect(page.getByTestId('next-step')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/place value/i);
  });

  test('an unknown lesson id shows an honest message, not a crash', async ({ freshPage: page }) => {
    await open(page, '#/learn/not-a-real-lesson');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/does not exist/i);
    await expect(page.getByRole('link', { name: /back to learn|learning path/i })).toBeVisible();
  });
});

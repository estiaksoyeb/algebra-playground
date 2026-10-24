import {
  test,
  expect,
  open,
  collectConsoleErrors,
  storedLessonState,
  injectLessonSaveFailure,
  allowLessonSaves,
  reachPractice,
} from './fixtures';

/**
 * Lesson flow for the first lesson: teaching steps → practice → mastery check →
 * completion, and what happens on reload, wrong answers and hints.
 *
 * `reachPractice` lives in fixtures.ts: it walks the teaching steps without the click/
 * unmount race that used to time out here and in responsive.spec.ts.
 */

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
    await expect.poll(async () => (await storedLessonState(page, 'w1-l1-counting'))?.currentStep).toBe(1);
    await page.reload();
    // Exact position, not just "a step is showing": the old assertion also passed while
    // the player rendered Step 1 and held Step 2 in the database.
    await expect(page.getByTestId('step-indicator')).toHaveText(/^Step 2 of \d+ · /);
    // …and the reloaded page did not write its initial step over the saved one.
    expect((await storedLessonState(page, 'w1-l1-counting'))?.currentStep).toBe(1);
  });

  test('a reload in the middle of practice comes back to the same exercise', async ({ freshPage: page }) => {
    await reachPractice(page);
    await page.getByTestId('next-exercise').click();
    await expect(page.getByTestId('phase-indicator')).toHaveText('Practice 2 of 4');
    await expect.poll(async () => storedLessonState(page, 'w1-l1-counting')).toMatchObject({ phase: 'practice', index: 1, currentStep: 2 });

    await page.reload();
    await expect(page.getByTestId('phase-indicator')).toHaveText('Practice 2 of 4');
    expect(await storedLessonState(page, 'w1-l1-counting')).toMatchObject({ phase: 'practice', index: 1 });
  });

  test('a reload on the mastery check comes back to the same check question', async ({ freshPage: page }) => {
    await reachPractice(page);
    await answerPractice(page, PRACTICE);
    await expect(page.getByText('Mastery check')).toBeVisible();
    await expect.poll(async () => storedLessonState(page, 'w1-l1-counting')).toMatchObject({ phase: 'check', index: 0 });

    await page.reload();
    await expect(page.getByTestId('phase-indicator')).toHaveText('Check 1 of 2');
    await expect(page.getByText('Mastery check')).toBeVisible();
  });

  test('opening the saved lesson from its card (a fresh page load) lands on the saved step', async ({ freshPage: page }) => {
    // This is the URL the "Continue" card on the learning path links to. The resume test
    // above reloads an already-open lesson, which can be a different code path.
    await open(page, '#/learn/w1-l1-counting');
    await page.getByTestId('next-step').click();
    await page.getByTestId('next-step').click();
    await expect(page.getByTestId('step-indicator')).toHaveText(/^Step 3 of \d+ · /);
    await expect.poll(async () => (await storedLessonState(page, 'w1-l1-counting'))?.currentStep).toBe(2);

    await open(page, '#/learn/w1-l1-counting');
    await expect(page.getByTestId('step-indicator')).toHaveText(/^Step 3 of \d+ · /);
  });

  test('a failed save keeps the learner on the step, then Try again advances exactly once', async ({ freshPage: page }) => {
    await injectLessonSaveFailure(page);
    await open(page, '#/learn/w1-l1-counting');
    await expect(page.getByTestId('step-indicator')).toHaveText(/^Step 1 of \d+ · /);

    await page.getByTestId('next-step').click();
    // The write was refused, so the step must not change and the failure must be visible.
    await expect(page.getByTestId('save-error')).toBeVisible();
    await expect(page.getByTestId('step-indicator')).toHaveText(/^Step 1 of \d+ · /);
    expect(await storedLessonState(page, 'w1-l1-counting')).toBeUndefined();

    await allowLessonSaves(page);
    await page.getByTestId('retry-save').click();
    await expect(page.getByTestId('step-indicator')).toHaveText(/^Step 2 of \d+ · /);
    await expect(page.getByTestId('save-error')).toHaveCount(0);
    await expect.poll(async () => (await storedLessonState(page, 'w1-l1-counting'))?.currentStep).toBe(1);
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

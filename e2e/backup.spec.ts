import { test, expect, open } from './fixtures';

/** Count the real attempts in storage (what the learner's evidence actually is). */
async function storedAttempts(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('algebra-playground');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return new Promise<number>((resolve, reject) => {
      const req = db.transaction('attempts').objectStore('attempts').count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

const VALID_BACKUP = {
  format: 'algebra-playground-backup',
  formatVersion: 1,
  exportedAt: new Date().toISOString(),
  app: { schemaVersion: 3, contentVersion: 1 },
  data: {
    profile: {
      id: 'app',
      schemaVersion: 3,
      preferences: { theme: 'system' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    lessonStates: [
      {
        lessonId: 'w1-l1-counting',
        currentStep: 2,
        answers: {},
        hintCounts: {},
        completed: true,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    attempts: [
      {
        conceptId: 'counting',
        lessonId: 'w1-l1-counting',
        exerciseId: 'w1-l1-e1',
        answer: '6',
        correct: true,
        hintsUsed: 0,
        attemptNumber: 1,
        at: new Date().toISOString(),
      },
    ],
    mastery: [],
    experiments: [],
    history: [],
    reviews: [],
    reviewLogs: [],
  },
};

test.describe('settings: backup and restore', () => {
  test('export produces a real, re-importable backup of what is stored', async ({ freshPage: page }) => {
    await open(page, '#/learn/w1-l1-counting');
    await page.getByTestId('next-step').click();
    await expect.poll(() => storedAttempts(page)).toBe(0);

    await open(page, '#/settings');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-button').click()]);
    expect(download.suggestedFilename()).toMatch(/^algebra-playground-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const path = await download.path();
    expect(path).toBeTruthy();
    const fs = await import('node:fs/promises');
    const json = JSON.parse(await fs.readFile(path!, 'utf8'));
    expect(json.format).toBe('algebra-playground-backup');
    expect(json.formatVersion).toBe(1);
    expect(Array.isArray(json.data.lessonStates)).toBe(true);
    expect(json.data.lessonStates.some((l: { lessonId: string }) => l.lessonId === 'w1-l1-counting')).toBe(true);
    await expect(page.getByTestId('settings-notice')).toContainText(/Backup downloaded/i);

    // Feeding the exported file straight back in is accepted and changes nothing harmful.
    await page.getByTestId('import-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(json)) });
    await expect(page.getByTestId('import-choice')).toBeVisible();
    await page.getByRole('button', { name: /Replace everything/i }).click();
    await expect(page.getByTestId('settings-notice')).toContainText(/Imported \(replace\)/i);
    await open(page, '#/learn');
    await expect(page.getByText('Counting & number representation')).toBeVisible();
  });

  test('a foreign, malformed or truncated file is refused with a reason and nothing changes', async ({ freshPage: page }) => {
    await open(page, '#/settings');
    for (const body of ['{"hello":"world"}', '{not json', '[]', 'null']) {
      await page.getByTestId('import-file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(body) });
      await expect(page.getByTestId('settings-notice')).toContainText(/Import cancelled/i);
      await expect(page.getByTestId('import-choice')).toHaveCount(0);
    }
    expect(await storedAttempts(page)).toBe(0);
  });

  test('a newer backup format is refused instead of silently misread', async ({ freshPage: page }) => {
    await open(page, '#/settings');
    await page.getByTestId('import-file').setInputFiles({
      name: 'future.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ ...VALID_BACKUP, formatVersion: 99 })),
    });
    await expect(page.getByTestId('settings-notice')).toContainText(/Import cancelled/i);
    await expect(page.getByTestId('settings-notice')).toContainText(/newer|version/i);
  });

  test('a valid backup imports with replace, clears the rest, and shows in the app', async ({ freshPage: page }) => {
    // Existing progress that "replace" must remove.
    await open(page, '#/playground/mystery');
    await page.getByTestId('experiment-name').fill('Should be erased');
    await page.getByTestId('save-experiment').click();
    await expect(page.getByTestId('workspace-notice')).toContainText(/saved/i);

    await open(page, '#/settings');
    await page.getByTestId('import-file').setInputFiles({ name: 'good.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(VALID_BACKUP)) });
    await expect(page.getByTestId('import-choice')).toContainText(/1 lessons, 1 attempts/);
    await page.getByRole('button', { name: /Replace everything/i }).click();
    await expect(page.getByTestId('settings-notice')).toContainText(/Imported \(replace\)/i);

    // Storage really changed.
    expect(await storedAttempts(page)).toBe(1);
    await open(page, '#/learn');
    await expect(page.getByTestId('lesson-w1-l1-counting').locator('.lesson-status')).toHaveAttribute('data-state', 'done');
    await open(page, '#/playground');
    await expect(page.getByText('Should be erased')).toHaveCount(0);
    // Survives a reload (it was written to IndexedDB, not just React state).
    await page.reload();
    await expect(page.getByText('Should be erased')).toHaveCount(0);
  });

  test('merge keeps what is already here and adds the backup', async ({ freshPage: page }) => {
    await open(page, '#/playground/mystery');
    await page.getByTestId('experiment-name').fill('Keep me');
    await page.getByTestId('save-experiment').click();
    await expect(page.getByTestId('workspace-notice')).toContainText(/saved/i);

    await open(page, '#/settings');
    await page.getByTestId('import-file').setInputFiles({ name: 'good.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(VALID_BACKUP)) });
    await page.getByRole('button', { name: /Merge with my progress/i }).click();
    await expect(page.getByTestId('settings-notice')).toContainText(/Imported \(merge\)/i);

    expect(await storedAttempts(page)).toBe(1);
    await open(page, '#/playground');
    await expect(page.getByText('Keep me')).toBeVisible();
    await open(page, '#/learn');
    await expect(page.getByTestId('lesson-w1-l1-counting').locator('.lesson-status')).toHaveAttribute('data-state', 'done');
  });

  test('erasing everything needs confirmation, can be cancelled, and survives a reload', async ({ freshPage: page }) => {
    await open(page, '#/settings');
    await page.getByTestId('import-file').setInputFiles({ name: 'good.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(VALID_BACKUP)) });
    await expect(page.getByTestId('import-choice')).toBeVisible();
    await page.getByRole('button', { name: /Replace everything/i }).click();
    await expect(page.getByTestId('settings-notice')).toContainText(/Imported/);

    const attempts = page.locator('.stat').filter({ hasText: 'attempts' }).first().locator('.stat-value');
    await expect(attempts).toHaveText('1');

    await page.getByTestId('reset-button').click();
    await page.getByRole('button', { name: 'Keep my data' }).click();
    await expect(attempts).toHaveText('1'); // kept

    await page.getByTestId('reset-button').click();
    await page.getByTestId('reset-confirm').click();
    await expect(attempts).toHaveText('0');
    await page.reload();
    await expect(attempts).toHaveText('0');
    expect(await storedAttempts(page)).toBe(0);
  });

  test('the theme choice is applied immediately and remembered after a reload', async ({ freshPage: page }) => {
    await open(page, '#/settings');
    await page.getByRole('radio', { name: 'dark' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('radio', { name: 'light' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});

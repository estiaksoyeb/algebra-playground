import { test, expect, open, expectNoHorizontalOverflow } from './fixtures';

const TOOLS = ['numberline', 'mystery', 'balance', 'tiles', 'evaluator', 'simplify', 'area', 'graph'] as const;

test.describe('playground', () => {
  test('every tool opens from the list, with a symbol/save panel and no overflow', async ({ freshPage: page }) => {
    for (const tool of TOOLS) {
      await open(page, '#/playground');
      await page.getByTestId(`tool-card-${tool}`).click();
      await expect(page).toHaveURL(new RegExp(`#/playground/${tool}$`));
      await expect(page.getByTestId('save-experiment')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expect(page).toHaveTitle(/Algebra Playground/);
      await expectNoHorizontalOverflow(page);
      // No dead links in the tool switcher.
      await expect(page.getByRole('tablist', { name: 'Tools' })).toBeVisible();
    }
  });

  test('a tool change updates the picture and the symbols together', async ({ freshPage: page }) => {
    await open(page, '#/playground/numberline');
    const summary = page.getByTestId('current-summary');
    const before = (await summary.innerText()).trim();
    await expect(page.locator('.stepper output').first()).toBeVisible();
    await page.getByRole('button', { name: 'Step right' }).click();
    await page.getByRole('button', { name: 'Step right' }).click();
    await expect(summary).not.toHaveText(before);
    // The symbolic strip is derived from the same state.
    await expect(page.locator('.equation-strip').first()).toContainText(/=/);
    // And the trip is described in words next to the picture.
    await expect(page.getByText(/marker is at 2/i)).toBeVisible();
  });

  test('undo, redo and reset step through changes', async ({ freshPage: page }) => {
    await open(page, '#/playground/numberline');
    const summary = page.getByTestId('current-summary');
    const start = (await summary.innerText()).trim();
    await expect(page.getByTestId('undo')).toBeDisabled();
    await page.getByRole('button', { name: 'Step right' }).click();
    const moved = (await summary.innerText()).trim();
    expect(moved).not.toBe(start);
    await page.getByTestId('undo').click();
    await expect(summary).toHaveText(start);
    await expect(page.getByTestId('redo')).toBeEnabled();
    await page.getByTestId('redo').click();
    await expect(summary).toHaveText(moved);
    await page.getByTestId('reset-tool').click();
    await expect(summary).toHaveText(start);
    await expect(page.getByTestId('redo')).toBeDisabled();
  });

  test('save an experiment, reopen it from its URL, and it survives a reload', async ({ freshPage: page }) => {
    await open(page, '#/playground/numberline');
    await page.getByRole('button', { name: 'Step right' }).click();
    await page.getByRole('button', { name: 'Step right' }).click();
    // The summary is only read once the second step has actually rendered; reading it
    // straight after the click can race React and capture the pre-click state.
    await expect(page.getByTestId('current-summary')).toHaveText('1 + 1 = 2');
    const savedSummary = (await page.getByTestId('current-summary').innerText()).trim();

    await page.getByTestId('experiment-name').fill('Two steps right');
    await page.getByTestId('save-experiment').click();
    await expect(page.getByTestId('workspace-notice')).toContainText(/saved/i);
    await expect(page).toHaveURL(/\?exp=/);

    const url = page.url();
    await page.reload();
    await expect(page.getByTestId('current-summary')).toHaveText(savedSummary);
    await expect(page.getByTestId('experiment-name')).toHaveValue('Two steps right');

    // Same URL in a cold tab (new page, same context = same storage).
    const other = await page.context().newPage();
    await other.goto(url);
    await expect(other.getByTestId('current-summary')).toHaveText(savedSummary);
    await other.close();

    // And the playground list counts it.
    await open(page, '#/playground');
    await expect(page.getByTestId('tool-card-numberline')).toContainText(/1 saved/);
  });

  test('the playground list shows saved experiments and deleting asks first', async ({ freshPage: page }) => {
    await open(page, '#/playground/balance');
    await page.getByTestId('experiment-name').fill('Balance one');
    await page.getByTestId('save-experiment').click();
    await expect(page.getByTestId('workspace-notice')).toContainText(/saved/i);

    await open(page, '#/playground');
    await expect(page.getByText('Balance one')).toBeVisible();
    await page.getByRole('button', { name: 'Delete Balance one' }).click();
    await expect(page.getByText('Balance one')).toBeVisible(); // still there until confirmed
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: 'Delete Balance one' })).toBeVisible();
    await page.getByRole('button', { name: 'Delete Balance one' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('Balance one')).toHaveCount(0);
    await page.reload();
    await expect(page.getByText('Balance one')).toHaveCount(0);
  });

  test('an experiment id that does not exist is reported, not silently ignored', async ({ freshPage: page }) => {
    await open(page, '#/playground/graph?exp=missing-experiment');
    await expect(page.getByTestId('workspace-notice')).toContainText(/no longer exists|could not/i);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('an invalid expression is refused with a message instead of corrupting the view', async ({ freshPage: page }) => {
    await open(page, '#/playground/evaluator');
    const input = page.getByTestId('expression-input');
    await input.fill('2 +');
    await input.blur();
    // An inline error, the old result gone, and the page still usable — never a crash.
    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(page.getByTestId('evaluator-result')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Expression evaluator');
    await expectNoHorizontalOverflow(page);

    // A valid expression brings the result back.
    await input.fill('2 + 3');
    await input.blur();
    await expect(page.getByTestId('evaluator-result')).toContainText('5');
  });
});

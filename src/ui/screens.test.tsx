import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LessonPage } from './LessonPage';
import { SettingsPage } from './SettingsPage';
import { __resetSessionForTests } from './useAppSession';
import { __resetStorageMemoForTests } from './useSession';
import { getStorage } from '../storage/repositories';
import { Repos, resetStorage } from '../storage/repositories';
import { CURRICULUM } from '../content/curriculum';

/**
 * Integration tests for flows whose failure modes are invisible in a happy-path
 * screenshot: resumed lessons, honest save failures and import validation.
 */

let repos: Repos;

beforeEach(async () => {
  vi.restoreAllMocks();
  // Each test is a fresh page load (the session cache and storage are reset).
  __resetSessionForTests();
  // Also drop the storage singleton: another test file may have replaced or closed it,
  // and sharing a stale handle makes these tests depend on file execution order.
  resetStorage();
  __resetStorageMemoForTests();
  repos = await getStorage();
  await repos.clearAll();
});

async function renderLesson(id = 'w1-l1-counting') {
  const view = render(<LessonPage lessonId={id} />);
  await waitFor(() => expect(screen.queryByText(/Loading your lesson/i)).not.toBeInTheDocument());
  return view;
}

async function tapNextStep(times: number) {
  const user = userEvent.setup();
  for (let i = 0; i < times; i++) await user.click(await screen.findByTestId('next-step'));
}

describe('LessonPage', () => {
  it('starts on the saved step once stored data arrives (cold load resume)', async () => {
    const lesson = CURRICULUM.lessons.find((l) => l.id === 'w1-l1-counting')!;
    await repos.putLessonState({
      lessonId: lesson.id,
      currentStep: 2,
      answers: {},
      hintCounts: {},
      completed: false,
      updatedAt: new Date().toISOString(),
    });
    await renderLesson();
    await waitFor(() => expect(screen.getByText(/Step 3 of/i)).toBeInTheDocument());
  });

  it('a completed lesson opens on the completion panel', async () => {
    await repos.putLessonState({ lessonId: 'w1-l1-counting', currentStep: 2, answers: {}, hintCounts: {}, completed: true, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await renderLesson();
    expect(await screen.findByTestId('lesson-complete')).toBeInTheDocument();
  });

  it('a wrong practice answer shows tutor feedback and keeps the input editable', async () => {
    const user = userEvent.setup();
    await renderLesson();
    await tapNextStep(3);
    const input = await screen.findByTestId('answer-input');
    await user.type(input, '4');
    await user.click(screen.getByTestId('submit-answer'));
    expect(await screen.findByTestId('tutor-feedback')).toBeInTheDocument();
    expect(screen.queryByTestId('feedback-correct')).not.toBeInTheDocument();
    expect(input).toBeEnabled();
  });

  it('a correct answer records an independent attempt in storage', async () => {
    const user = userEvent.setup();
    await renderLesson();
    await tapNextStep(3);
    await user.type(await screen.findByTestId('answer-input'), '6');
    await user.click(screen.getByTestId('submit-answer'));
    expect(await screen.findByTestId('feedback-correct')).toBeInTheDocument();
    await waitFor(async () => {
      const attempts = await repos.allAttempts();
      expect(attempts).toHaveLength(1);
      expect(attempts[0]).toMatchObject({ exerciseId: 'w1-l1-e1', correct: true, hintsUsed: 0 });
    });
  });

  it('practice hints do not count as help', async () => {
    const user = userEvent.setup();
    await renderLesson();
    await tapNextStep(3);
    await user.click(await screen.findByTestId('hint-button'));
    expect(screen.getByTestId('static-hints')).toHaveTextContent(/Hint 1/);
    await user.type(screen.getByTestId('answer-input'), '6');
    await user.click(screen.getByTestId('submit-answer'));
    await waitFor(async () => {
      const attempts = await repos.allAttempts();
      expect(attempts[0].hintsUsed).toBe(0);
    });
  });

  it('reports honestly when progress cannot be saved', async () => {
    vi.spyOn(repos, 'putLessonState').mockRejectedValue(new Error('Quota exceeded'));
    await renderLesson();
    await tapNextStep(1);
    expect(await screen.findByText(/could not be saved/i)).toBeInTheDocument();
  });

  it('offers no hint on a mastery check, because a helped check cannot prove mastery', async () => {
    // Walk to the first check question: teaching steps → all four practice exercises.
    await renderLesson();
    const user = userEvent.setup();
    for (let i = 0; i < 10 && !screen.queryByTestId('answer-input'); i++) await tapNextStep(1);
    for (const answer of ['6', '7', '11', '10']) {
      await user.type(await screen.findByTestId('answer-input'), answer);
      await user.click(screen.getByTestId('submit-answer'));
      await user.click(await screen.findByTestId('next-exercise'));
    }
    expect(await screen.findByText(/come without hints/i)).toBeInTheDocument();
    expect(screen.queryByTestId('hint-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('finish-lesson')).not.toBeInTheDocument();
  });

  it('never claims storage is broken while it is saving normally', async () => {
    // Regression: at startup two session instances mount (StrictMode) and the facade could
    // adopt the one whose load effect never ran. That instance had no connection, so every
    // save reported "storage unavailable" even though the write succeeded.
    await renderLesson();
    await tapNextStep(1);
    await waitFor(async () => {
      const stored = await repos.getLessonState('w1-l1-counting');
      expect(stored?.currentStep).toBe(1);
    });
    expect(screen.queryByText(/could not be saved/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Storage is unavailable/i)).not.toBeInTheDocument();
  });

  it('shows an honest message for an unknown lesson id', () => {
    render(<LessonPage lessonId="nope" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/does not exist/i);
  });
});

describe('SettingsPage import', () => {
  // jsdom's File lacks Blob.text(); browsers have it, so give the test the browser API.
  if (typeof File !== 'undefined' && typeof Blob.prototype.text !== 'function') {
    Blob.prototype.text = function text(this: Blob): Promise<string> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(this);
      });
    };
  }

  function fileOf(content: string) {
    return new File([content], 'backup.json', { type: 'application/json' });
  }

  const valid = {
    format: 'algebra-playground-backup',
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    app: { schemaVersion: 3, contentVersion: 1 },
    data: { profile: null, lessonStates: [], attempts: [], mastery: [], experiments: [], history: [], reviews: [], reviewLogs: [] },
  };

  it('refuses a file that is not a backup and explains why', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    const input = (await screen.findByTestId('import-file')) as HTMLInputElement;
    await user.upload(input, fileOf('{"unrelated":true}'));
    await waitFor(() => expect(screen.getByTestId('settings-notice')).toHaveTextContent(/Import cancelled/i));
    expect(screen.queryByTestId('import-choice')).not.toBeInTheDocument();
  });

  it('refuses invalid JSON without throwing', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    const input = (await screen.findByTestId('import-file')) as HTMLInputElement;
    await user.upload(input, fileOf('{not json'));
    await waitFor(() => expect(screen.getByTestId('settings-notice')).toHaveTextContent(/Import cancelled/i));
  });

  it('refuses a newer backup format', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    const input = (await screen.findByTestId('import-file')) as HTMLInputElement;
    await user.upload(input, fileOf(JSON.stringify({ ...valid, formatVersion: 99 })));
    await waitFor(() => expect(screen.getByTestId('settings-notice')).toHaveTextContent(/Import cancelled/i));
  });

  it('asks before applying a valid backup and does not change anything on cancel', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    const input = (await screen.findByTestId('import-file')) as HTMLInputElement;
    await user.upload(input, fileOf(JSON.stringify(valid)));
    expect(await screen.findByTestId('import-choice')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(screen.queryByTestId('import-choice')).not.toBeInTheDocument();
    expect(await repos.allAttempts()).toHaveLength(0);
  });
});

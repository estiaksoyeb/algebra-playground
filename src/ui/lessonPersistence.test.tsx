import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LessonPage } from './LessonPage';
import { __resetSessionForTests } from './useAppSession';
import { __resetStorageMemoForTests, useSession } from './useSession';
import { IdbRepos, getStorage, resetStorage } from '../storage/repositories';
import { LessonStateRecord } from '../storage/repositories';
import { CURRICULUM } from '../content/curriculum';
import { resumePosition, positionRecord, storedPosition, samePosition, LessonShape } from './lessonResume';
import { LessonPosition } from './lessonResume';
import { createElement } from 'react';

/**
 * Regression tests for lesson persistence.
 *
 * Two defects shipped and were reproduced before these fixes:
 *  A. A reload could show "Step 1 of 3" while IndexedDB held `currentStep = 2`; the player
 *     rendered the initial default before storage resolved and a persistence effect wrote
 *     that default back, destroying the saved position.
 *  B. A progress write that failed at commit time still advanced the UI; the database kept
 *     the old step, and the next click then saved the step after the one that was skipped.
 *
 * Failures are injected through the real repository transaction (`IdbRepos.testHooks`)
 * rather than by mocking the repository, so the tests exercise actual IndexedDB behaviour.
 */

const LESSON = CURRICULUM.lessons.find((l) => l.id === 'w1-l1-counting')!;
const SHAPE: LessonShape = { steps: LESSON.steps.length, practice: 4, checks: 2 };

let repos: IdbRepos;

beforeEach(async () => {
  vi.restoreAllMocks();
  // Order matters: clear the session cache, drop the old connection AND the memo of the
  // old connection promise, then create the one instance every test (and the UI) shares.
  __resetSessionForTests();
  resetStorage();
  __resetStorageMemoForTests();
  repos = (await getStorage()) as IdbRepos;
  await repos.clearAll();
});

function state(over: Partial<LessonStateRecord> = {}): LessonStateRecord {
  return {
    lessonId: LESSON.id,
    currentStep: 0,
    answers: {},
    hintCounts: {},
    completed: false,
    updatedAt: new Date().toISOString(),
    ...over,
  };
}

/**
 * Wait until the saved position has been read and the real screen is up.
 *
 * The loader is waited on by its element, not by its copy: the loader text is translated
 * now, so matching English copy passes the instant the first render happens and returns
 * while the read is still resolving. Polling happens outside `act` (React applies its own
 * work lazily, so holding the macrotask queue inside `act` would starve the read), then one
 * `act` flush lands the post-hydration render that carries the translated labels.
 */
async function settleLesson() {
  await waitFor(() => expect(document.querySelector('.lesson-shell')).not.toBeNull(), { timeout: 3000 });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderLesson(id = LESSON.id) {
  const view = render(<LessonPage lessonId={id} />);
  await settleLesson();
  return view;
}

/**
 * What the learner actually sees, read from the same text the page renders. Test ids are
 * deliberately not required: the pre-fix player rendered the identical text without them,
 * so these assertions measure behaviour rather than markup.
 */
function visibleStepText(): string {
  const scopes = [...document.querySelectorAll('.lesson-step, .lesson-shell > .stack')];
  for (const scope of scopes) {
    for (const p of scope.querySelectorAll('p')) {
      const text = p.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const
        m = /^(Step \d+ of \d+ · \w+|Question \d+ of \d+)$/.exec(text);
      if (m) return m[1];
    }
  }
  if (document.querySelector('[data-testid="lesson-complete"]')) return 'Lesson complete';
  return '(nothing)';
}

function describePosition(p: LessonPosition): string {
  if (p.kind === 'teach') return `Step ${p.step + 1} of ${SHAPE.steps} · ${LESSON.steps[p.step].type === 'explore' ? 'Explore' : LESSON.steps[p.step].type === 'check' ? 'Notice' : 'Learn'}`;
  // Practise and check share one "Question X of Y" label; the phase pill above it says
  // which one is active, so the counter no longer repeats the phase name.
  if (p.kind === 'practice') return `Question ${p.index + 1} of ${SHAPE.practice}`;
  if (p.kind === 'check') return `Question ${p.index + 1} of ${SHAPE.checks}`;
  return 'Lesson complete';
}

async function storedState(): Promise<LessonStateRecord | undefined> {
  return repos.getLessonState(LESSON.id);
}

// ---------------------------------------------------------------------------
// Pure resume rules
// ---------------------------------------------------------------------------
describe('resumePosition (pure)', () => {
  it('starts a brand-new lesson on the first teaching step', () => {
    expect(resumePosition(undefined, SHAPE)).toEqual({ kind: 'teach', step: 0 });
  });

  it('restores a saved non-initial teaching step', () => {
    expect(resumePosition(state({ currentStep: 2 }), SHAPE)).toEqual({ kind: 'teach', step: 2 });
  });

  it('restores a saved practice position', () => {
    expect(resumePosition(state({ currentStep: 2, phase: 'practice', index: 3 }), SHAPE)).toEqual({ kind: 'practice', index: 3 });
  });

  it('restores a saved check position', () => {
    expect(resumePosition(state({ currentStep: 2, phase: 'check', index: 1 }), SHAPE)).toEqual({ kind: 'check', index: 1 });
  });

  it('restores the completion panel', () => {
    expect(resumePosition(state({ completed: true, phase: 'done' }), SHAPE)).toEqual({ kind: 'done' });
  });

  it('clamps an index from a longer version of the lesson instead of rendering nothing', () => {
    expect(resumePosition(state({ phase: 'check', index: 99 }), SHAPE)).toEqual({ kind: 'check', index: 1 });
  });

  it('falls back to the teaching step for a record with no stored phase (legacy/backup)', () => {
    expect(storedPosition(state({ currentStep: 1 }), SHAPE)).toEqual({ kind: 'teach', step: 1 });
    expect(resumePosition(state({ currentStep: 1 }), SHAPE)).toEqual({ kind: 'teach', step: 1 });
  });

  it('round-trips every position through the record that is saved', () => {
    const positions: LessonPosition[] = [
      { kind: 'teach', step: 2 },
      { kind: 'practice', index: 3 },
      { kind: 'check', index: 1 },
      { kind: 'done' },
    ];
    for (const p of positions) {
      // A 'done' position is only reachable once the lesson is stored as completed.
      const rec = state({ ...positionRecord(p), completed: p.kind === 'done' });
      expect(samePosition(resumePosition(rec, SHAPE), p), JSON.stringify(p)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// A. Restoration
// ---------------------------------------------------------------------------
describe('restoring a saved lesson position (defect A)', () => {
  it('a saved non-initial teaching step is what is shown after load', async () => {
    await repos.putLessonState(state({ currentStep: 2 }));
    await renderLesson();
    expect(visibleStepText()).toMatch(/^Step 3 of/);
    // And the stored record is untouched by opening the lesson.
    expect((await storedState())?.currentStep).toBe(2);
  });

  it('a saved practice position is restored (not the teaching step)', async () => {
    await repos.putLessonState(state({ currentStep: 2, phase: 'practice', index: 2 }));
    await renderLesson();
    await waitFor(() => expect(visibleStepText()).toBe(describePosition({ kind: 'practice', index: 2 })));
    expect(screen.getByTestId('answer-input')).toBeInTheDocument();
  });

  it('a saved mastery-check position is restored', async () => {
    await repos.putLessonState(state({ currentStep: 2, phase: 'check', index: 1 }));
    await renderLesson();
    await waitFor(() => expect(visibleStepText()).toBe(describePosition({ kind: 'check', index: 1 })));
  });

  it('opening a saved lesson never writes the default position over it', async () => {
    await repos.putLessonState(state({ currentStep: 2 }));
    const writes: number[] = [];
    repos.testHooks.beforeCommit = (kind) => {
      if (kind === 'lesson') writes.push(-1);
    };
    await renderLesson();
    expect(visibleStepText()).toMatch(/^Step 3 of/);
    expect(writes).toEqual([]);
    expect((await storedState())?.currentStep).toBe(2);
    repos.testHooks.beforeCommit = undefined;
  });

  it('a delayed load does not let the default step overwrite the saved one', async () => {
    await repos.putLessonState(state({ currentStep: 2 }));
    // Hold the lesson read open until the test releases it.
    const original = repos.allLessonStates.bind(repos);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.spyOn(repos, 'allLessonStates').mockImplementation(async () => {
      await gate;
      return original();
    });
    render(<LessonPage lessonId={LESSON.id} />);
    // While the read is pending the player must show the loader, never "Step 1".
    expect(document.querySelector('.loading-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('step-indicator')).not.toBeInTheDocument();
    release();
    await settleLesson();
    expect(visibleStepText()).toMatch(/^Step 3 of/);
    expect((await repos.getLessonState(LESSON.id))?.currentStep).toBe(2);
  });

  it('a genuinely new lesson starts at step 1 and records nothing until the learner moves', async () => {
    await renderLesson();
    expect(visibleStepText()).toMatch(/^Step 1 of/);
    expect(await storedState()).toBeUndefined();
  });

  it('a failed load is reported as a load failure, not as "no saved progress"', async () => {
    await repos.putLessonState(state({ currentStep: 2 }));
    vi.spyOn(repos, 'allLessonStates').mockRejectedValue(new Error('Quota exceeded'));
    render(<LessonPage lessonId={LESSON.id} />);
    await waitFor(() => expect(screen.getByText(/could not load your saved progress/i)).toBeInTheDocument());
    // No false "Step 1", no controls to advance, and the record is untouched.
    expect(screen.queryByTestId('step-indicator')).not.toBeInTheDocument();
    expect(screen.queryByTestId('next-step')).not.toBeInTheDocument();
    vi.restoreAllMocks();
    expect((await repos.getLessonState(LESSON.id))?.currentStep).toBe(2);
  });

  it('a pending load is not applied to a different lesson', async () => {
    const other = CURRICULUM.lessons.find((l) => l.id === 'w1-l2-place-value')!;
    await repos.putLessonState(state({ lessonId: other.id, currentStep: other.steps.length - 1, phase: 'teach' }));
    const view = render(<LessonPage lessonId={LESSON.id} />);
    // Navigating before the read resolves remounts for the other lesson (keyed by id).
    view.rerender(<LessonPage lessonId={other.id} />);
    await settleLesson();
    expect(screen.getByText(/Place value/i)).toBeInTheDocument();
    // The first lesson never gained a record from the abandoned render.
    expect(await repos.getLessonState(LESSON.id)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// B. Failed saves
// ---------------------------------------------------------------------------
describe('a progress write that fails (defect B)', () => {
  it('does not advance the screen and leaves the database unchanged', async () => {
    const user = userEvent.setup();
    await repos.putLessonState(state({ currentStep: 1 }));
    await renderLesson();
    expect(visibleStepText()).toMatch(/^Step 2 of/);

    repos.testHooks.beforeCommit = () => {
      throw new Error('QuotaExceededError');
    };
    await user.click(screen.getByTestId('next-step'));
    await waitFor(() => expect(screen.getByTestId('save-error')).toBeInTheDocument());
    expect(visibleStepText()).toMatch(/^Step 2 of/);
    expect((await storedState())?.currentStep).toBe(1);
    expect(screen.getByTestId('next-step')).toBeEnabled();
  });

  it('reports the failure and offers a retry that advances exactly once', async () => {
    const user = userEvent.setup();
    await repos.putLessonState(state({ currentStep: 1 }));
    await renderLesson();
    repos.testHooks.beforeCommit = () => {
      throw new Error('QuotaExceededError');
    };
    await user.click(screen.getByTestId('next-step'));
    await waitFor(() => expect(screen.getByTestId('save-error')).toBeInTheDocument());

    // Storage recovers; the retry commits the same move and it lands.
    repos.testHooks.beforeCommit = undefined;
    await user.click(screen.getByTestId('retry-save'));
    await waitFor(() => expect(visibleStepText()).toMatch(/^Step 3 of/));
    expect(screen.queryByTestId('save-error')).not.toBeInTheDocument();
    expect((await storedState())?.currentStep).toBe(2);
  });

  it('double-clicking next cannot skip a step', async () => {
    const user = userEvent.setup();
    await repos.putLessonState(state({ currentStep: 0 }));
    await renderLesson();
    const next = screen.getByTestId('next-step');
    await user.dblClick(next);
    await waitFor(() => expect(visibleStepText()).toMatch(/^Step 2 of/));
    expect(visibleStepText()).toMatch(/^Step 2 of/);
    expect((await storedState())?.currentStep).toBe(1);
  });

  it('a failed answer save neither records an attempt nor claims the answer was right', async () => {
    const user = userEvent.setup();
    await repos.putLessonState(state({ currentStep: 2, phase: 'practice', index: 0 }));
    await renderLesson();
    repos.testHooks.beforeCommit = (kind) => {
      if (kind === 'attempt') throw new Error('QuotaExceededError');
    };
    await user.type(await screen.findByTestId('answer-input'), '6');
    await user.click(screen.getByTestId('submit-answer'));
    await waitFor(() => expect(screen.getByTestId('save-error')).toBeInTheDocument());
    // The old card showed "Correct." and advanced the exercise before the write was
    // confirmed; nothing may read as accepted when the attempt was not stored.
    expect(screen.queryByTestId('feedback-correct')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Correct\./)).not.toBeInTheDocument();
    expect(await repos.allAttempts()).toHaveLength(0);
    // Still the same exercise, input usable again.
    expect(screen.getByTestId('answer-input')).toBeEnabled();
  });

  it('"Try again" after a failed answer writes no lesson record of its own', async () => {
    const user = userEvent.setup();
    await repos.putLessonState(state({ currentStep: 2, phase: 'practice', index: 0 }));
    await renderLesson();
    repos.testHooks.beforeCommit = (kind) => {
      if (kind === 'attempt') throw new Error('QuotaExceededError');
    };
    await user.type(await screen.findByTestId('answer-input'), '6');
    await user.click(screen.getByTestId('submit-answer'));
    await waitFor(() => expect(screen.getByTestId('save-error')).toBeInTheDocument());
    const before = await storedState();

    // "Try again" here only clears the message: probing by re-saving the current position
    // would write a record the learner never asked for.
    repos.testHooks.beforeCommit = undefined;
    await user.click(screen.getByTestId('retry-save'));
    await waitFor(() => expect(screen.queryByTestId('save-error')).not.toBeInTheDocument());
    expect(await storedState()).toEqual(before);
    expect(await repos.allAttempts()).toHaveLength(0);
  });

  it('a double-submitted answer records exactly one attempt', async () => {
    const user = userEvent.setup();
    await repos.putLessonState(state({ currentStep: 2, phase: 'practice', index: 0 }));
    await renderLesson();
    await user.type(await screen.findByTestId('answer-input'), '6');
    await user.dblClick(screen.getByTestId('submit-answer'));
    await waitFor(() => expect(screen.getByTestId('feedback-correct')).toBeInTheDocument());
    expect(await repos.allAttempts()).toHaveLength(1);
  });

  it('completion is not shown when the completion write fails', async () => {
    const user = userEvent.setup();
    // Every check answer already recorded correctly and unaided: Finish is available.
    await repos.putLessonState(state({ currentStep: 2, phase: 'check', index: 1 }));
    const now = new Date().toISOString();
    // seed with addAttempt (not commitAttempt): the seeded rows must not be swept by the
    // `attempt` commit hook installed below, which only guards the learner's next answer.
    for (const ex of LESSON.masteryCheck ?? []) {
      await repos.addAttempt({
        uid: `seed-${ex.id}`,
        conceptId: ex.conceptId,
        lessonId: LESSON.id,
        exerciseId: ex.id,
        answer: ex.answer as string,
        correct: true,
        hintsUsed: 0,
        attemptNumber: 1,
        at: now,
      });
    }
    const practice = LESSON.exercises.filter((e) => !(LESSON.masteryCheck ?? []).some((c) => c.id === e.id) && !(LESSON.reviewExercises ?? []).some((c) => c.id === e.id));
    expect(practice.length).toBeGreaterThanOrEqual(LESSON.mastery.minIndependent);
    for (const ex of practice.slice(0, LESSON.mastery.minIndependent)) {
      await repos.addAttempt({
        uid: `seed-p-${ex.id}`,
        conceptId: ex.conceptId,
        lessonId: LESSON.id,
        exerciseId: ex.id,
        answer: ex.answer as string,
        correct: true,
        hintsUsed: 0,
        attemptNumber: 1,
        at: now,
      });
    }
    await renderLesson();
    // Answer the last check so its Finish button appears.
    await user.type(await screen.findByTestId('answer-input'), String(LESSON.masteryCheck![1].answer));
    await user.click(screen.getByTestId('submit-answer'));
    const finish = await screen.findByTestId('finish-lesson');

    repos.testHooks.beforeCommit = (kind) => {
      if (kind === 'lesson') throw new Error('QuotaExceededError');
    };
    await user.click(finish);
    await waitFor(() => expect(screen.getByTestId('save-error')).toBeInTheDocument());
    expect(screen.queryByTestId('lesson-complete')).not.toBeInTheDocument();
    expect((await storedState())?.completed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Session API contract
// ---------------------------------------------------------------------------
describe('progressLesson contract', () => {
  it('does not report success before the write commits, and never mutates state on failure', async () => {
    await repos.putLessonState(state({ currentStep: 0 }));
    let latest: ReturnType<typeof useSession> | null = null;
    function Harness() {
      latest = useSession();
      return null;
    }
    await act(async () => {
      render(createElement(Harness));
    });
    await waitFor(() => expect(latest!.state.status).toBe('ready'));
    repos.testHooks.beforeCommit = () => {
      throw new Error('QuotaExceededError');
    };
    let ok: boolean | undefined;
    await act(async () => {
      ok = await latest!.progressLesson(LESSON.id, { currentStep: 1 });
    });
    expect(ok).toBe(false);
    expect(latest!.state.data.lessonStates[LESSON.id]?.currentStep).toBe(0);
    expect((await storedState())?.currentStep).toBe(0);

    repos.testHooks.beforeCommit = undefined;
    await act(async () => {
      ok = await latest!.progressLesson(LESSON.id, { currentStep: 1 });
    });
    expect(ok).toBe(true);
    expect(latest!.state.data.lessonStates[LESSON.id]?.currentStep).toBe(1);
    expect((await storedState())?.currentStep).toBe(1);
  });
});


import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LESSON_BY_ID, WORLD_BY_ID, nextLessonInOrder, prerequisitesMet } from '../content/curriculum';
import { Exercise, Lesson } from '../content/types';
import { ExerciseCard } from '../components/ExerciseCard';
import { MathView as Math } from '../components/MathComp';
import { CalmCallout, StepVisual } from '../components/StepVisual';
import { masteryLabel } from '../engine/mastery';
import { nextActionAfterLesson, masteryProgress, pickCheckQuestions, practiceExercises } from './lessonProgress';
import { LessonPosition, LessonShape, positionRecord, resumePosition } from './lessonResume';
import { navigate } from './router';
import { Page } from './Shell';
import { useAppSession } from './useAppSession';
import { EmptyState } from '../components/Sheet';
import { IconBook } from '../components/icons';

const num = {
  round: (n: number) => globalThis.Math.round(n),
  abs: (n: number) => globalThis.Math.abs(n),
  max: (a: number, b: number) => globalThis.Math.max(a, b),
  min: (a: number, b: number) => globalThis.Math.min(a, b),
};

type Phase = LessonPosition;

const PHASES = ['Learn', 'Practise', 'Check'] as const;

const SAVE_FAILED = 'Your progress could not be saved, so you are still on this step. Check storage in Settings, then tap Try again.';
const RETRY = 'Try again';
const RETRY_TEXT = 'Your progress could not be saved, so nothing changed on this screen. Check storage in Settings, then try again.';

export function LessonPage({ lessonId }: { lessonId: string }) {
  const lesson = LESSON_BY_ID[lessonId];
  const session = useAppSession();
  const data = session.state.data;
  if (!lesson) {
    return (
      <Page title="Lesson not found">
        <EmptyState level={1} icon={<IconBook />} title="That lesson does not exist">
          <p>It may have been renamed. Browse the full path instead.</p>
          <a className="btn" href="#/learn">
            Back to Learn
          </a>
        </EmptyState>
      </Page>
    );
  }
  return <LessonPlayer key={lesson.id} lesson={lesson} session={session} data={data} />;
}

type Session = ReturnType<typeof useAppSession>;

function LessonPlayer({ lesson, session, data }: { lesson: Lesson; session: Session; data: Session['state']['data'] }) {
  const record = data.lessonStates[lesson.id];
  const progress = masteryProgress(lesson, data.attempts, record);
  const practice = practiceExercises(lesson);
  const checks = useMemo(() => pickCheckQuestions(lesson), [lesson]);
  const shape: LessonShape = { steps: lesson.steps.length, practice: practice.length, checks: checks.length };
  const completed = new Set(
    Object.values(data.lessonStates)
      .filter((l) => l.completed)
      .map((l) => l.lessonId),
  );
  const locked = !prerequisitesMet(lesson.id, completed) && !record && lesson.prerequisites.length > 0;
  const status = session.state.status;

  /**
   * The rendered position. `null` until the saved lesson has been applied: the screen
   * shows the loading panel instead, because rendering a default "Step 1" while storage
   * is still loading is how a reload used to lose the learner's real position.
   */
  const [position, setPosition] = useState<Phase | null>(null);
  /**
   * True while a move is being committed. Every control that could advance, finish or
   * answer is disabled, so a double tap cannot queue two transitions or two attempts.
   */
  const [busy, setBusy] = useState(false);
  const [hints, setHints] = useState<Record<string, number>>({});
  const [wrongNow, setWrongNow] = useState<Record<string, number>>({});
  const [checkAnswers, setCheckAnswers] = useState<Record<string, boolean>>({});
  /**
   * Check questions answered correctly *without* help. The mastery check only counts an
   * answer taken unaided, so a helped-but-correct answer must not unlock "Finish".
   */
  const [checksCleared, setChecksCleared] = useState<Record<string, boolean>>({});
  /**
   * Pre-check rehearsal answers: a learner who is not ready for the check can rehearse a
   * similar question first. It is kept only for this screen (it can never record an
   * attempt or mastery evidence), which is why it was previously lost on every rerender.
   */
  const [rehearsal, setRehearsal] = useState<Record<string, { answer: string; at: string }>>({});
  const rehearsalRef = useRef(rehearsal);
  rehearsalRef.current = rehearsal;
  const [saveError, setSaveError] = useState<string | null>(null);
  /** A finish attempt whose write failed; only the Finish button retries this replay. */
  const failedFinish = useRef(false);
  /** The move that failed, replayed by "Try again" once storage works again. */
  const failedMove = useRef<{ to: Phase; patch: Parameters<Session['progressLesson']>[1] } | null>(null);
  /** A finish attempt the evidence did not support (e.g. a hint on a check). */
  const [checkNotProven, setCheckNotProven] = useState(false);
  const latest = useRef(session);
  latest.current = session;
  const liveRef = useRef<HTMLDivElement>(null);

  const busyNow = busy || session.pendingLessons.has(lesson.id);
  // Handlers that outlive a render (Finish runs after an await) must read the live values,
  // not the closure's copy: a stale guard once let "Finish" run against a lesson whose
  // answer was still being written.
  const busyRef = useRef(busyNow);
  busyRef.current = busyNow;

  // ---- Load → apply → ready -------------------------------------------------
  // One hydration per lesson instance. A failure leaves `position` null, so nothing can
  // be rendered, advanced or saved: a failed read is never treated as "no saved progress".
  useEffect(() => {
    if (status === 'loading' || position) return;
    if (status === 'unavailable') return;
    const restored = resumePosition(latest.current.state.data.lessonStates[lesson.id], shape);
    const saved = latest.current.state.data.lessonStates[lesson.id];
    setHints({ ...(saved?.hintCounts ?? {}) });
    setRehearsal({ ...(saved?.checkPractice ?? {}) });
    // Marking the screen ready is the same assignment: until `position` is set the player
    // renders only the loader, so no save can be built from a default "Step 1" state.
    setPosition(restored);
    // Only the first settled render may initialise; later data changes must not yank the
    // learner to another screen while they are working.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, lesson.id]);

  /**
   * Persist a move, then show it. Nothing on screen changes until the write is confirmed.
   *
   * Returns a promise that settles once the move is on screen. `patch` is replanned
   * against the freshest session data on every attempt, so a retry after another write
   * or a cross-tab change never resurfaces a stale snapshot.
   */
  const commitMove = useCallback(
    async (next: Phase | null, patch: Parameters<Session['progressLesson']>[1]): Promise<boolean> => {
      if (busyNow) return false;
      setBusy(true);
      setSaveError(null);
      failedFinish.current = false;
      try {
        const ok = await latest.current.progressLesson(lesson.id, patch);
        if (!ok) {
          setSaveError(SAVE_FAILED);
          // The screen did not change, so "Try again" must replay the move that was
          // refused (not re-save the screen the learner is already on).
          if (next) failedMove.current = { to: next, patch };
          return false;
        }
        failedMove.current = null;
        if (next) setPosition(next);
        return true;
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lesson.id, busyNow],
  );

  /** Patch for a destination screen, built from the current session snapshot. */
  const patchFor = (next: Phase): Parameters<Session['progressLesson']>[1] => positionRecord(next);

  const go = async (next: Phase, extra: Parameters<Session['progressLesson']>[1] = {}) => {
    const shown = await commitMove(next, { ...patchFor(next), ...extra });
    if (shown) requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    return shown;
  };

  const step = position?.kind === 'teach' ? lesson.steps[position.step] : null;

  const attemptCount = (exerciseId: string) => data.attempts.filter((a) => a.exerciseId === exerciseId).length + (wrongNow[exerciseId] ?? 0);

  /** Records an answer; resolves true only once storage confirmed the attempt. */
  const submit = async (ex: Exercise, input: { answer: string; correct: boolean; hintsUsed: number; misconception?: string }): Promise<boolean> => {
    if (busyNow) return false;
    setBusy(true);
    setSaveError(null);
    try {
      const res = await latest.current.recordAttempt({
        exercise: ex,
        lessonId: lesson.id,
        answer: input.answer,
        correct: input.correct,
        hintsUsed: input.hintsUsed,
        misconception: input.misconception,
      });
      if (!res.ok) {
        // Nothing was recorded, so the card must not claim the answer was accepted.
        setSaveError(RETRY_TEXT);
        return false;
      }
      if (input.correct) {
        setCheckAnswers((s) => ({ ...s, [ex.id]: true }));
        // Only an unaided correct answer clears the check (mirrors `checkPassedBy`).
        setChecksCleared((s) => ({ ...s, [ex.id]: input.hintsUsed === 0 }));
      } else {
        setWrongNow((w) => ({ ...w, [ex.id]: (w[ex.id] ?? 0) + 1 }));
        setCheckAnswers((s) => ({ ...s, [ex.id]: false }));
        setChecksCleared((s) => ({ ...s, [ex.id]: false }));
        // A wrong check answer revokes the check pass until it is answered correctly.
      }
      return true;
    } finally {
      setBusy(false);
    }
  };

  /**
   * A check question counts only when it was answered correctly without help. Checks no
   * longer offer hints, but an older attempt that recorded one still disqualifies the
   * question — the same rule as `checkPassedBy` in the engine.
   */
  const checkCleared = (exerciseId: string): boolean => {
    const helped = data.attempts.some((a) => a.exerciseId === exerciseId && a.hintsUsed > 0);
    return checksCleared[exerciseId] === true && !helped;
  };

  // Changing phase hides a stale "not proven" message.
  useEffect(() => {
    setCheckNotProven(false);
  }, [position]);

  // ---- Not ready yet --------------------------------------------------------
  if (status === 'loading' || (status === 'ready' && !position)) {
    return (
      <Page title="Lesson">
        <div className="loading-screen" role="status">
          <div className="spinner" aria-hidden="true" />
          <p>Loading your lesson…</p>
        </div>
      </Page>
    );
  }
  if (status === 'unavailable' || !position) {
    // Never show (or save) a default position when the saved one could not be read:
    // the learner's real progress might be exactly what failed to load.
    return (
      <Page title="Lesson">
        <div className="card stack" role="alert">
          <h1>We could not load your saved progress</h1>
          <p>Nothing has been changed or overwritten. Reload to try again; if it keeps happening, your browser may be blocking storage (see Settings).</p>
          {session.state.loadError && <p className="small muted">{session.state.loadError}</p>}
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              Reload
            </button>
            <a className="btn btn-secondary" href="#/settings">
              Open Settings
            </a>
          </div>
        </div>
      </Page>
    );
  }

  const world = WORLD_BY_ID[lesson.world];
  const teachCount = lesson.steps.length;
  const totalUnits = teachCount + practice.length + checks.length;
  const doneUnits =
    position.kind === 'teach'
      ? position.step
      : position.kind === 'practice'
        ? teachCount + position.index
        : position.kind === 'check'
          ? teachCount + practice.length + position.index
          : totalUnits;
  const phaseIndex = position.kind === 'teach' ? 0 : position.kind === 'practice' ? 1 : 2;

  return (
    <Page title={lesson.title}>
      {/* `data-docked-actions` tells the app shell to reserve room for the sticky lesson
          footer above the bottom navigation, so it never covers the last control. */}
      <div className="lesson-shell" data-docked-actions={position.kind === 'practice' || position.kind === 'check' ? '' : undefined}>
        <header className="lesson-header">
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <a href="#/learn">Learn</a>
            <span aria-hidden="true">/</span>
            <span>
              World {world.number}: {world.title}
            </span>
          </nav>
          <div>
            <h1 style={{ fontSize: 'var(--fs-2xl)', marginBottom: 4 }}>{lesson.title}</h1>
            <p className="muted mb-0">{lesson.summary}</p>
          </div>
          <div className="row-between small">
            <div className="stack-sm" style={{ gap: 6, flex: 1 }}>
              <div className="row" style={{ gap: 8 }}>
                {PHASES.map((p, i) => (
                  <span key={p} className={`pill ${i === phaseIndex ? 'pill-brand' : i < phaseIndex ? 'pill-success' : ''}`}>
                    {p}
                  </span>
                ))}
                {record?.completed && <span className="pill pill-success">Completed</span>}
              </div>
              <div
                className="progress-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={totalUnits}
                aria-valuenow={doneUnits}
                aria-label="Lesson progress"
              >
                <div style={{ width: `${num.round((doneUnits / totalUnits) * 100)}%` }} />
              </div>
            </div>
          </div>
          {locked && (
            <div className="callout callout-watch-out" role="note">
              <div>
                <strong>This lesson builds on earlier ones</strong>
                You can carry on — the hints will fill in any gaps, and each lesson links to its refresher.
              </div>
            </div>
          )}
          {saveError && (
            <div className="feedback feedback-error" role="alert" data-testid="save-error">
              {saveError}
              <div className="btn-row" style={{ marginTop: 8 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void retrySave()} disabled={busyNow} data-testid="retry-save">
                  {RETRY}
                </button>
              </div>
            </div>
          )}
        </header>

        <div ref={liveRef} aria-live="polite" className="sr-only">
          {position.kind === 'done' ? 'Lesson complete' : ''}
        </div>

        {position.kind === 'teach' && step && (
          <section className="card lesson-step" key={`s${position.step}`}>
            <p className="small muted mb-0" data-testid="step-indicator">
              Step {position.step + 1} of {teachCount} · {step.type === 'explore' ? 'Explore' : step.type === 'check' ? 'Notice' : 'Learn'}
            </p>
            <h2>{step.title}</h2>
            <p className="step-body">{step.body}</p>
            {step.math && (
              <div className="math-block">
                <Math tex={step.math} display label={step.title} />
              </div>
            )}
            {step.visual && <StepVisual visual={step.visual} />}
            {step.callout && <CalmCallout callout={step.callout} />}
            <div className="lesson-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => (position.step > 0 ? void go({ kind: 'teach', step: position.step - 1 }) : navigate('/learn'))}
                disabled={busyNow}
                data-testid="prev-step"
              >
                {position.step > 0 ? 'Back' : 'All lessons'}
              </button>
              <button
                type="button"
                className="btn btn-primary-next"
                onClick={() => (position.step < teachCount - 1 ? void go({ kind: 'teach', step: position.step + 1 }) : void go({ kind: 'practice', index: 0 }))}
                disabled={busyNow}
                data-testid="next-step"
              >
                {position.step < teachCount - 1 ? 'Next step' : `Start practising (${practice.length})`}
              </button>
            </div>
          </section>
        )}

        {position.kind === 'practice' && practice[position.index] && (
          <div className="stack" key={`p${position.index}`}>
            <div className="row-between">
              <p className="small muted mb-0" data-testid="phase-indicator">
                Practice {position.index + 1} of {practice.length}
              </p>
              {progress.evidenceReady && (
                <span className="pill pill-success">
                  Enough evidence · {progress.independent}/{num.max(progress.minIndependent, progress.independent)}
                </span>
              )}
            </div>
            <ExerciseCard
              key={practice[position.index].id}
              exercise={practice[position.index]}
              lesson={lesson}
              attemptsOnExercise={attemptCount(practice[position.index].id)}
              hintsShown={hints[practice[position.index].id] ?? 0}
              conceptAttempts={data.attempts.filter((a) => a.conceptId === practice[position.index].conceptId)}
              mastery={data.mastery[practice[position.index].conceptId]}
              busy={busyNow}
              onSubmit={(input) => submit(practice[position.index], input)}
              onHint={() =>
                void latest.current.progressLesson(lesson.id, { hintCounts: { [practice[position.index].id]: (hints[practice[position.index].id] ?? 0) + 1 } }).then((ok) => {
                  if (ok) setHints((h) => ({ ...h, [practice[position.index].id]: (h[practice[position.index].id] ?? 0) + 1 }));
                  else setSaveError('That hint could not be saved, so it was not shown. Try again.');
                })
              }
            />
            <div className="lesson-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => (position.index > 0 ? void go({ kind: 'practice', index: position.index - 1 }) : void go({ kind: 'teach', step: teachCount - 1 }))}
                disabled={busyNow}
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn-primary-next"
                onClick={() => (position.index < practice.length - 1 ? void go({ kind: 'practice', index: position.index + 1 }) : void go({ kind: 'check', index: 0 }))}
                disabled={busyNow}
                data-testid="next-exercise"
              >
                {position.index < practice.length - 1 ? 'Next exercise' : 'Go to the check'}
              </button>
              {/* Full-width secondary action on its own row, so the two main buttons keep
                  their natural size instead of squeezing labels onto two lines. */}
              <button
                type="button"
                className="btn btn-ghost lesson-footer-wide"
                onClick={() => (position.index < practice.length - 1 ? void go({ kind: 'practice', index: position.index + 1 }) : void go({ kind: 'check', index: 0 }))}
                disabled={busyNow}
              >
                Skip for now
              </button>
            </div>
          </div>
        )}

        {position.kind === 'check' && checks.length === 0 && (
          <section className="card stack">
            <h2>Ready to finish</h2>
            <p>This lesson has no separate check — your practice answers above are the evidence.</p>
            <button type="button" className="btn" onClick={() => void finishLesson()} disabled={busyNow} data-testid="finish-lesson">
              Mark lesson complete
            </button>
          </section>
        )}

        {position.kind === 'check' && checks[position.index] && (
          <div className="stack" key={`c${position.index}`}>
            <p className="small muted mb-0" data-testid="phase-indicator">
              Check {position.index + 1} of {checks.length}
            </p>
            <div className="callout callout-tip" role="note">
              <div>
                <strong>Mastery check</strong>
                These questions come without hints. Answer them yourself — that is what proves the idea has stuck.
              </div>
            </div>
            <ExerciseCard
              exercise={checks[position.index]}
              lesson={lesson}
              attemptsOnExercise={attemptCount(checks[position.index].id)}
              hintsShown={0}
              conceptAttempts={data.attempts.filter((a) => a.conceptId === checks[position.index].conceptId)}
              mastery={data.mastery[checks[position.index].conceptId]}
              busy={busyNow}
              onSubmit={(input) => submit(checks[position.index], input)}
              onHint={() => undefined}
              rehearse={{
                stored: rehearsal[checks[position.index].id],
                suggestion: rehearsalText(checks[position.index]),
                onAnswer: (answer) => {
                  // Rehearsal memory only: it is session state, never an attempt or mastery
                  // evidence, so a relieved learner cannot "prove" the idea to the engine.
                  const next = { ...rehearsalRef.current, [checks[position.index].id]: { answer, at: new Date().toISOString() } };
                  setRehearsal(next);
                  void latest.current.progressLesson(lesson.id, { checkPractice: next });
                },
              }}
              noHints
              submitLabel="Check"
            />
            {checkNotProven && (
              <div className="feedback feedback-hint" role="status" data-testid="check-not-proven">
                <strong role="status">Not quite proven yet.</strong> One of the check questions was answered with help, so it does not count as evidence. Answer
                both without a hint to finish, or come back to the check later.
              </div>
            )}
            {position.index === checks.length - 1 && checkAnswers[checks[position.index].id] && !checkCleared(checks[position.index].id) && (
              <div className="feedback feedback-hint" role="status" data-testid="check-not-proven">
                <strong role="status">Not quite proven yet.</strong> One of the check questions does not count as evidence yet. Answer
                both correctly, without help, to finish — or come back to the check after more practice.
              </div>
            )}
            <div className="lesson-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => (position.index > 0 ? void go({ kind: 'check', index: position.index - 1 }) : void go({ kind: 'practice', index: practice.length - 1 }))}
                disabled={busyNow}
              >
                Back
              </button>
              {!checkAnswers[checks[position.index].id] && (
                <button type="button" className="btn btn-ghost" onClick={() => void go({ kind: 'done' })} disabled={busyNow}>
                  Try the check later
                </button>
              )}
              {checkAnswers[checks[position.index].id] && checkCleared(checks[position.index].id) && (
                <button
                  type="button"
                  className="btn btn-primary-next"
                  onClick={() => (position.index < checks.length - 1 ? void go({ kind: 'check', index: position.index + 1 }) : void finishLesson())}
                  disabled={busyNow}
                  data-testid={position.index < checks.length - 1 ? 'next-check' : 'finish-lesson'}
                >
                  {position.index < checks.length - 1 ? 'Next question' : 'Finish lesson'}
                </button>
              )}
            </div>
          </div>
        )}

        {position.kind === 'done' && <CompletionPanel lesson={lesson} data={data} onReview={() => void go({ kind: 'practice', index: 0 })} disabled={busyNow} />}
      </div>
    </Page>
  );

  /** Verify the evidence, then mark complete in one transaction, then grant mastery. */
  async function finishLesson(): Promise<void> {
    if (busyRef.current) return;
    setBusy(true);
    setSaveError(null);
    try {
      // Re-read storage: the attempt just submitted must be included in the verdict.
      await latest.current.refresh();
      const fresh = masteryProgress(lesson, latest.current.state.data.attempts, latest.current.state.data.lessonStates[lesson.id]);
      if (!fresh.complete) {
        setCheckNotProven(true);
        return;
      }
      setCheckNotProven(false);
      const saved = await latest.current.progressLesson(lesson.id, { completed: true, currentStep: lesson.steps.length - 1, phase: 'done', index: 0 });
      if (!saved) {
        failedFinish.current = true;
        setSaveError(SAVE_FAILED);
        return;
      }
      const granted = await latest.current.passMasteryCheck(lesson.id);
      if (!granted) {
        // The lesson itself is saved; only the mastery decision failed. Say exactly that.
        setSaveError('Your lesson was saved. The mastery result could not be stored — Try again stores it from the answers already recorded.');
      }
      setPosition({ kind: 'done' });
    } finally {
      setBusy(false);
    }
  }

  /** Retry the last failed save exactly once per press, using fresh session data. */
  async function retrySave(): Promise<void> {
    if (busyRef.current) return;
    if (failedFinish.current) {
      failedFinish.current = false;
      await finishLesson();
      return;
    }
    const failed = failedMove.current;
    if (failed) {
      // Replan the same destination from the current session snapshot, so a change made in
      // another tab between the failure and the retry is merged rather than overwritten.
      failedMove.current = null;
      const shown = await go(failed.to, failed.patch);
      if (shown) setSaveError(null);
      return;
    }
    // A failed answer or hint has nothing to replay, and retrying must not write anything
    // by itself: probing with the current position would store a record the learner never
    // asked to change (and could overwrite a newer one from another tab). Clear the message
    // so the learner can redo the action; that write will report again if storage still fails.
    setSaveError(null);
  }
}

/**
 * A rehearsal prompt for a check question: the same idea with one number changed where
 * that is possible, otherwise a generic nudge. It deliberately never reveals the answer.
 */
export function rehearsalText(ex: Exercise): string {
  const n = /\d+/.exec(ex.prompt ?? '');
  if (n) {
    const v = Number(n[0]);
    return `Try the same question with a different number first, e.g. instead of ${v} use ${v + 1}. Nothing you type here is graded.`;
  }
  return 'Try one simpler version of this question first. Nothing you type here is graded or counts as evidence.';
}

function CompletionPanel({ lesson, data, onReview, disabled }: { lesson: Lesson; data: Session['state']['data']; onReview: () => void; disabled?: boolean }) {
  const action = nextActionAfterLesson({ lesson, attempts: data.attempts, nextLessonId: nextLessonInOrder(lesson.id)?.id });
  const ws = WORLD_BY_ID[lesson.world];
  const concepts = lesson.conceptIds.map((c) => ({ id: c, m: data.mastery[c] }));
  return (
    <section className="card stack" data-testid="lesson-complete">
      <div className="stack-sm">
        <span className="pill pill-success">Lesson complete</span>
        <h2 style={{ marginBottom: 0 }}>Nice work: {lesson.title}</h2>
        <p className="muted mb-0">{ws.title} · mastery is judged from evidence, not clicks.</p>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} className="stack-sm">
        {concepts.map((c) => (
          <li key={c.id} className="row-between small">
            <span>{c.id.replace(/-/g, ' ')}</span>
            <span className={`pill ${c.m?.state === 'established' ? 'pill-success' : c.m?.state === 'needs-review' ? 'pill-warning' : ''}`}>
              {c.m ? masteryLabel(c.m.state) : 'No evidence yet'}
            </span>
          </li>
        ))}
      </ul>
      <div className="feedback feedback-info" role="status">
        <strong>{action.label}</strong> {action.detail}
      </div>
      <div className="btn-row">
        {action.kind === 'continue-lesson' && action.lessonId && (
          <a className="btn" href={`#/learn/${action.lessonId}`} data-testid="next-lesson-link">
            {action.label}
          </a>
        )}
        <a className="btn btn-secondary" href="#/learn">
          Back to the path
        </a>
        <button type="button" className="btn btn-ghost" onClick={onReview} disabled={disabled}>
          Practise again
        </button>
        <a className="btn btn-ghost" href="#/progress">
          See progress
        </a>
      </div>{' '}
    </section>
  );
}

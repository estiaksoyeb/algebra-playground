import { useEffect, useMemo, useRef, useState } from 'react';
import { LESSON_BY_ID, WORLD_BY_ID, nextLessonInOrder, prerequisitesMet } from '../content/curriculum';
import { Exercise, Lesson } from '../content/types';
import { ExerciseCard } from '../components/ExerciseCard';
import { MathView as Math } from '../components/MathComp';
import { CalmCallout, StepVisual } from '../components/StepVisual';
import { masteryLabel } from '../engine/mastery';
import { nextActionAfterLesson, masteryProgress, pickCheckQuestions, practiceExercises } from './lessonProgress';
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

type Phase = { kind: 'teach'; step: number } | { kind: 'practice'; index: number } | { kind: 'check'; index: number } | { kind: 'done' };

const PHASES = ['Learn', 'Practise', 'Check'] as const;

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
  const completed = new Set(
    Object.values(data.lessonStates)
      .filter((l) => l.completed)
      .map((l) => l.lessonId),
  );
  const locked = !prerequisitesMet(lesson.id, completed) && !record && lesson.prerequisites.length > 0;

  const [phase, setPhase] = useState<Phase>(() => {
    if (record?.completed) return { kind: 'done' };
    return { kind: 'teach', step: num.min(record?.currentStep ?? 0, lesson.steps.length - 1) };
  });
  /** Until the learner moves, the saved position wins — including when stored data
   *  arrives after mount (cold load: the player renders before IndexedDB resolves). */
  const untouched = useRef(true);
  const [hints, setHints] = useState<Record<string, number>>(() => ({ ...(record?.hintCounts ?? {}) }));
  const [wrongNow, setWrongNow] = useState<Record<string, number>>({});
  const [checkAnswers, setCheckAnswers] = useState<Record<string, boolean>>({});
  /**
   * Check questions answered correctly *without* help. The mastery check only counts an
   * answer taken unaided, so a helped-but-correct answer must not unlock "Finish".
   */
  const [checksCleared, setChecksCleared] = useState<Record<string, boolean>>({});
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  /** A finish attempt that the evidence did not support (e.g. a hint on a check). */
  const [checkNotProven, setCheckNotProven] = useState(false);
  const latest = useRef(session);
  const status = session.state.status;
  latest.current = session;
  const liveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === 'loading' || !untouched.current) return;
    if (record?.completed) setPhase({ kind: 'done' });
    else if (record && record.currentStep !== null && record.currentStep !== undefined) {
      setPhase((p) =>
        p.kind === 'teach' && p.step === num.min(record.currentStep, lesson.steps.length - 1)
          ? p
          : { kind: 'teach', step: num.min(record.currentStep, lesson.steps.length - 1) },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, record?.completed, record?.currentStep, lesson.id]);

  // Persist the current step so "Continue" resumes in the right place.
  useEffect(() => {
    // Never save before storage has loaded. On a cold start the player briefly renders
    // Step 1, and writing that would overwrite the learner's real position with the
    // placeholder before the saved record has even been read.
    if (status === 'loading') return;
    // While the position is still the stored one, the load effect owns `phase`; once it
    // has applied the record, the effect re-runs with the correct step.
    if (untouched.current && record?.currentStep === (phase.kind === 'teach' ? phase.step : undefined)) return;
    if (phase.kind === 'teach' && record?.currentStep !== phase.step) {
      // Honest reporting: if the step cannot be stored, say so instead of pretending.
      void session.progressLesson(lesson.id, { currentStep: phase.step }).then((ok) => {
        if (!ok) setSavedMsg('Your progress could not be saved. Check storage in Settings — answers still count on this screen.');
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, lesson.id, status]);

  const step = phase.kind === 'teach' ? lesson.steps[phase.step] : null;

  const attemptCount = (exerciseId: string) => data.attempts.filter((a) => a.exerciseId === exerciseId).length + (wrongNow[exerciseId] ?? 0);

  const submit = async (ex: Exercise, input: { answer: string; correct: boolean; hintsUsed: number; misconception?: string }) => {
    const res = await session.recordAttempt({
      exercise: ex,
      lessonId: lesson.id,
      answer: input.answer,
      correct: input.correct,
      hintsUsed: input.hintsUsed,
      misconception: input.misconception,
    });
    if (!res.ok) setSavedMsg('Your progress could not be saved. Check storage in Settings — answers still count on this screen.');
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

  const go = (nextPhase: Phase) => {
    untouched.current = false;
    setPhase(nextPhase);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  };

  // Changing phase hides a stale "not proven" message.
  useEffect(() => {
    setCheckNotProven(false);
  }, [phase]);

  if (status === 'loading') {
    return (
      <Page title="Lesson">
        <div className="loading-screen" role="status">
          <div className="spinner" aria-hidden="true" />
          <p>Loading your lesson…</p>
        </div>
      </Page>
    );
  }

  const finish = async () => {
    // Re-read storage: the attempt just submitted must be included in the verdict.
    await session.refresh();
    const fresh = masteryProgress(lesson, latest.current.state.data.attempts, latest.current.state.data.lessonStates[lesson.id]);
    if (!fresh.complete) {
      setCheckNotProven(true);
      return;
    }
    setCheckNotProven(false);
    await session.progressLesson(lesson.id, { completed: true, currentStep: lesson.steps.length - 1 });
    await session.passMasteryCheck(lesson.id);
    go({ kind: 'done' });
  };

  const world = WORLD_BY_ID[lesson.world];
  const teachCount = lesson.steps.length;
  const totalUnits = teachCount + practice.length + checks.length;
  const doneUnits =
    phase.kind === 'teach'
      ? phase.step
      : phase.kind === 'practice'
        ? teachCount + phase.index
        : phase.kind === 'check'
          ? teachCount + practice.length + phase.index
          : totalUnits;
  const phaseIndex = phase.kind === 'teach' ? 0 : phase.kind === 'practice' ? 1 : 2;

  return (
    <Page title={lesson.title}>
      {/* `data-docked-actions` tells the app shell to reserve room for the sticky lesson
          footer above the bottom navigation, so it never covers the last control. */}
      <div className="lesson-shell" data-docked-actions={phase.kind === 'practice' || phase.kind === 'check' ? '' : undefined}>
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
          {savedMsg && (
            <div className="feedback feedback-error" role="alert">
              {savedMsg}
            </div>
          )}
        </header>

        <div ref={liveRef} aria-live="polite" className="sr-only">
          {phase.kind === 'done' ? 'Lesson complete' : ''}
        </div>

        {phase.kind === 'teach' && step && (
          <section className="card lesson-step" key={`s${phase.step}`}>
            <p className="small muted mb-0">
              Step {phase.step + 1} of {teachCount} · {step.type === 'explore' ? 'Explore' : step.type === 'check' ? 'Notice' : 'Learn'}
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
                onClick={() => (phase.step > 0 ? go({ kind: 'teach', step: phase.step - 1 }) : navigate('/learn'))}
                data-testid="prev-step"
              >
                {phase.step > 0 ? 'Back' : 'All lessons'}
              </button>
              <button
                type="button"
                className="btn btn-primary-next"
                onClick={() => (phase.step < teachCount - 1 ? go({ kind: 'teach', step: phase.step + 1 }) : go({ kind: 'practice', index: 0 }))}
                data-testid="next-step"
              >
                {phase.step < teachCount - 1 ? 'Next step' : `Start practising (${practice.length})`}
              </button>
            </div>
          </section>
        )}

        {phase.kind === 'practice' && practice[phase.index] && (
          <div className="stack" key={`p${phase.index}`}>
            <div className="row-between">
              <p className="small muted mb-0">
                Practice {phase.index + 1} of {practice.length}
              </p>
              {progress.evidenceReady && (
                <span className="pill pill-success">
                  Enough evidence · {progress.independent}/{num.max(progress.minIndependent, progress.independent)}
                </span>
              )}
            </div>
            <ExerciseCard
              key={practice[phase.index].id}
              exercise={practice[phase.index]}
              lesson={lesson}
              attemptsOnExercise={attemptCount(practice[phase.index].id)}
              hintsShown={hints[practice[phase.index].id] ?? 0}
              conceptAttempts={data.attempts.filter((a) => a.conceptId === practice[phase.index].conceptId)}
              mastery={data.mastery[practice[phase.index].conceptId]}
              onSubmit={(input) => void submit(practice[phase.index], input)}
              onHint={() => setHints((h) => ({ ...h, [practice[phase.index].id]: (h[practice[phase.index].id] ?? 0) + 1 }))}
            />
            <div className="lesson-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => (phase.index > 0 ? go({ kind: 'practice', index: phase.index - 1 }) : go({ kind: 'teach', step: teachCount - 1 }))}
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn-primary-next"
                onClick={() => (phase.index < practice.length - 1 ? go({ kind: 'practice', index: phase.index + 1 }) : go({ kind: 'check', index: 0 }))}
                data-testid="next-exercise"
              >
                {phase.index < practice.length - 1 ? 'Next exercise' : 'Go to the check'}
              </button>
              {/* Full-width secondary action on its own row, so the two main buttons keep
                  their natural size instead of squeezing labels onto two lines. */}
              <button
                type="button"
                className="btn btn-ghost lesson-footer-wide"
                onClick={() => (phase.index < practice.length - 1 ? go({ kind: 'practice', index: phase.index + 1 }) : go({ kind: 'check', index: 0 }))}
              >
                Skip for now
              </button>
            </div>
          </div>
        )}

        {phase.kind === 'check' && checks.length === 0 && (
          <section className="card stack">
            <h2>Ready to finish</h2>
            <p>This lesson has no separate check — your practice answers above are the evidence.</p>
            <button type="button" className="btn" onClick={() => void finish()}>
              Mark lesson complete
            </button>
          </section>
        )}

        {phase.kind === 'check' && checks[phase.index] && (
          <div className="stack" key={`c${phase.index}`}>
            <div className="callout callout-tip" role="note">
              <div>
                <strong>Mastery check</strong>
                These questions come without hints. Answer them yourself — that is what proves the idea has stuck.
              </div>
            </div>
            <ExerciseCard
              exercise={checks[phase.index]}
              lesson={lesson}
              attemptsOnExercise={attemptCount(checks[phase.index].id)}
              hintsShown={0}
              conceptAttempts={data.attempts.filter((a) => a.conceptId === checks[phase.index].conceptId)}
              mastery={data.mastery[checks[phase.index].conceptId]}
              onSubmit={(input) => void submit(checks[phase.index], input)}
              onHint={() => undefined}
              noHints
              submitLabel="Check"
            />
            {checkNotProven && (
              <div className="feedback feedback-hint" role="status" data-testid="check-not-proven">
                <strong role="status">Not quite proven yet.</strong> One of the check questions was answered with help, so it does not count as evidence. Answer
                both without a hint to finish, or come back to the check later.
              </div>
            )}
            {phase.index === checks.length - 1 && checkAnswers[checks[phase.index].id] && !checkCleared(checks[phase.index].id) && (
              <div className="feedback feedback-hint" role="status" data-testid="check-not-proven">
                <strong role="status">Not quite proven yet.</strong> One of the check questions does not count as evidence yet. Answer
                both correctly, without help, to finish — or come back to the check after more practice.
              </div>
            )}
            <div className="lesson-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => (phase.index > 0 ? go({ kind: 'check', index: phase.index - 1 }) : go({ kind: 'practice', index: practice.length - 1 }))}
              >
                Back
              </button>
              {!checkAnswers[checks[phase.index].id] && (
                <button type="button" className="btn btn-ghost" onClick={() => go({ kind: 'done' })}>
                  Try the check later
                </button>
              )}
              {checkAnswers[checks[phase.index].id] && checkCleared(checks[phase.index].id) && (
                <button
                  type="button"
                  className="btn btn-primary-next"
                  onClick={() => (phase.index < checks.length - 1 ? go({ kind: 'check', index: phase.index + 1 }) : void finish())}
                  data-testid={phase.index < checks.length - 1 ? 'next-check' : 'finish-lesson'}
                >
                  {phase.index < checks.length - 1 ? 'Next question' : 'Finish lesson'}
                </button>
              )}
            </div>
          </div>
        )}

        {phase.kind === 'done' && <CompletionPanel lesson={lesson} data={data} onReview={() => go({ kind: 'practice', index: 0 })} />}
      </div>
    </Page>
  );
}

function CompletionPanel({ lesson, data, onReview }: { lesson: Lesson; data: Session['state']['data']; onReview: () => void }) {
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
        <button type="button" className="btn btn-ghost" onClick={onReview}>
          Practise again
        </button>
        <a className="btn btn-ghost" href="#/progress">
          See progress
        </a>
      </div>{' '}
    </section>
  );
}

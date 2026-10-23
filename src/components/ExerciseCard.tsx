import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Exercise } from '../content/types';
import { Lesson } from '../content/types';
import { GradeResult, gradeAnswer } from '../engine/grading';
import { TutorContext, feedbackOnMistake, followUpQuestion, requestHint } from '../engine/tutor';
import { AttemptRecord, MasteryRecord } from '../storage/repositories';
import { MathView as Math } from './MathComp';

export interface ExerciseProps {
  exercise: Exercise;
  lesson?: Lesson;
  /** prior attempts on this exercise in this session (for escalation) */
  attemptsOnExercise: number;
  hintsShown: number;
  conceptAttempts: AttemptRecord[];
  mastery?: MasteryRecord;
  /** fires for every submitted answer; resolves to whether it could be saved */
  onSubmit: (input: { answer: string; correct: boolean; hintsUsed: number; misconception?: string }) => void;
  onHint: () => void;
  /** hide the input after the exercise was answered correctly */
  locked?: boolean;
  /**
   * A mastery check: no hints are offered at all, because the point is to show the idea
   * is known unaided. The engine treats any recorded hint as disqualifying, so offering
   * one would create a dead end.
   */
  noHints?: boolean;
  submitLabel?: string;
}

/** One exercise: answer input or choices, tutor hint ladder, feedback, solution. */
export function ExerciseCard({ exercise: ex, lesson, attemptsOnExercise, hintsShown, conceptAttempts, mastery, onSubmit, onHint, locked, noHints, submitLabel }: ExerciseProps) {
  const inputId = useId();
  const [raw, setRaw] = useState('');
  const [grade, setGrade] = useState<GradeResult | null>(null);
  const [solved, setSolved] = useState(Boolean(locked));
  const [tutor, setTutor] = useState<{ kind: string; text: string; steps?: string[]; prerequisite?: string } | null>(null);
  const [attemptsHere, setAttemptsHere] = useState(attemptsOnExercise);
  /** The attempt count this card last synced from the parent (persisted history). */
  const syncedAttempts = useRef(attemptsOnExercise);
  /** Hints are revealed one at a time without counting as "using a hint" until asked. */
  const [revealed, setRevealed] = useState(0);
  /** Hints are always free. A hint on the check records "helped": answered with
   * help it still teaches, but it does not prove the idea stuck. */
  const freeHints = submitLabel !== 'Check';
  const liveRef = useRef<HTMLDivElement>(null);

  // Reset only when the exercise itself changes (or is locked from outside).
  useEffect(() => {
    setRaw('');
    setGrade(null);
    setSolved(Boolean(locked));
    setTutor(null);
    setRevealed(0);
  }, [ex.id, locked]);

  // A new persisted attempt count (e.g. after a reload or a lesson re-entry) is
  // adopted without wiping the feedback currently on screen.
  useEffect(() => {
    if (syncedAttempts.current !== attemptsOnExercise) {
      syncedAttempts.current = attemptsOnExercise;
      setAttemptsHere(attemptsOnExercise);
    }
  }, [attemptsOnExercise]);

  useEffect(() => {
    if (tutor && liveRef.current) liveRef.current.focus({ preventScroll: true });
  }, [tutor]);

  const ctx = useMemo<TutorContext>(
    () => ({ exercise: ex, lesson, attemptsOnExercise: attemptsHere, conceptAttempts, mastery, hintsShown, lastGrade: grade ?? undefined }),
    [ex, lesson, attemptsHere, conceptAttempts, mastery, hintsShown, grade],
  );

  const submit = (value: string) => {
    const answer = ex.kind === 'choice' ? value : raw;
    if (!answer.trim()) return;
    // Hints are counted as they are taken. Practice hints are free nudges, and a check
    // offers no hint control at all, so an answer without hints is genuinely unaided.
    //
    // This used to force any non-practice answer to count as helped
    // (`Math.max(hintsShown, 1)`), which made every mastery check permanently unprovable
    // even when the learner answered it alone.
    const usedHelp = hintsShown;
    const result = gradeAnswer(ex, answer, { hintsUsed: usedHelp });
    setGrade(result);
    setTutor(null);
    onSubmit({ answer, correct: result.correct, hintsUsed: usedHelp, misconception: result.misconception });
    if (result.correct) {
      setSolved(true);
    } else {
      setAttemptsHere((n) => n + 1);
      const fb = feedbackOnMistake({ ...ctx, lastGrade: result });
      setTutor({ kind: fb.simpler ? 'simpler' : fb.switchModel ? 'switch' : 'hint', text: fb.text, prerequisite: fb.prerequisite });
    }
  };

  const hint = () => {
    if (freeHints && revealed < ex.hints.length) {
      setRevealed((n) => n + 1);
      return;
    }
    const h = requestHint(ctx, revealed);
    onHint();
    setTutor({ kind: h.kind, text: h.text, steps: h.workedSteps, prerequisite: h.prerequisite });
  };

  const hintButtonLabel = freeHints
    ? revealed === 0
      ? 'Show a hint'
      : revealed < ex.hints.length
        ? `Show hint ${revealed + 1} of ${ex.hints.length}`
        : 'Worked example'
    : hintsShown === 0
      ? 'Hint'
      : `Another hint (${hintsShown})`;

  const placeholder = ex.kind === 'equation' ? 'e.g. x = 4' : ex.kind === 'coordinate' ? 'e.g. (3, 2)' : ex.kind === 'expression' ? 'e.g. 2x + 3' : 'e.g. 7';

  return (
    <section className="exercise card" aria-labelledby={`${inputId}-prompt`} data-testid={`exercise-${ex.id}`}>
      <p className="exercise-prompt" id={`${inputId}-prompt`}>
        {ex.prompt}
      </p>
      {ex.math && (
        <div className="math-display">
          <Math tex={ex.math} display label={ex.prompt} />
        </div>
      )}
      {ex.kind === 'choice' && ex.choices ? (
        <div className="choice-list" role="group" aria-labelledby={`${inputId}-prompt`}>
          {ex.choices.map((c, i) => (
            <button
              key={c}
              type="button"
              className="choice"
              aria-pressed={grade?.correct ? false : undefined}
              disabled={solved}
              onClick={() => submit(c)}
              data-testid={`choice-${ex.id}-${i}`}
            >
              <span className="choice-key" aria-hidden="true">
                {String.fromCharCode(65 + i)}
              </span>
              <span className="math-inline">
                <Math tex={c} />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <form
          className="stack-sm"
          onSubmit={(e) => {
            e.preventDefault();
            submit(raw);
          }}
        >
          <label className="field-label" htmlFor={inputId}>
            Your answer
          </label>
          <input
            id={inputId}
            className="input answer-input"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            inputMode={ex.kind === 'numeric' || ex.kind === 'value-of-variable' ? 'decimal' : 'text'}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={placeholder}
            disabled={solved}
            aria-describedby={grade ? `${inputId}-feedback` : undefined}
            data-testid="answer-input"
          />
          <div className="btn-row">
            <button type="submit" className="btn" disabled={solved || !raw.trim()} data-testid="submit-answer">
              {submitLabel ?? 'Check answer'}
            </button>
            {!noHints && (
              <button type="button" className="btn btn-secondary" onClick={hint} data-testid="hint-button" disabled={solved}>
                {hintButtonLabel}
              </button>
            )}
          </div>
        </form>
      )}
      {ex.kind === 'choice' && !noHints && (
        <div className="btn-row">
          <button type="button" className="btn btn-secondary btn-sm" onClick={hint} disabled={solved}>
            {hintButtonLabel}
          </button>
        </div>
      )}
      <div ref={liveRef} tabIndex={-1} aria-live="polite" className="stack-sm">
        {grade?.correct && (
          <div className="feedback feedback-success" id={`${inputId}-feedback`} data-testid="feedback-correct" role="status">
            <strong>Correct.</strong> {ex.solution}
          </div>
        )}
        {revealed > 0 && (
          <div className="feedback feedback-hint" data-testid="static-hints">
            {ex.hints.slice(0, revealed).map((h, i) => (
              <div key={i}>
                <strong>
                  Hint {i + 1}
                  {ex.hints.length > 1 ? ` of ${ex.hints.length}` : ''}
                </strong>
                <span style={{ display: 'block' }}>{h}</span>
              </div>
            ))}
          </div>
        )}
        {tutor && (
          <div className={`feedback ${tutor.kind === 'switch' || tutor.kind === 'simpler' ? 'feedback-hint' : tutor.kind === 'hint' ? 'feedback-info' : 'feedback-hint'}`} data-testid="tutor-feedback">
            <strong>
              {tutor.kind === 'worked-example' ? 'Worked example' : tutor.kind === 'remediate' ? 'Try this first' : tutor.kind === 'switch' ? 'Let’s try another view' : tutor.kind === 'simpler' ? 'A simpler approach' : 'Hint'}
            </strong>
            <span style={{ display: 'block' }}>{tutor.text}</span>
            {tutor.steps && (
              <ol className="small" style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                {tutor.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            )}
            {tutor.prerequisite && (
              <a className="btn btn-secondary btn-sm mt-2" href={`#/learn/${tutor.prerequisite}`}>
                Open the refresher lesson
              </a>
            )}
            {!tutor.steps && tutor.kind === 'hint' && (
              <span className="small muted" style={{ display: 'block', marginTop: 6 }}>
                {followUpQuestion(grade?.misconception)}
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

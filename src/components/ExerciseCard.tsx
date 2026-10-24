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
  onHint: () => void;
  /** hide the input after the exercise was answered correctly */
  locked?: boolean;
  /**
   * A mastery check: no hints are offered at all, because the point is to show the idea
   * is known unaided. The engine treats any recorded hint as disqualifying, so offering
   * one would create a dead end.
   */
  noHints?: boolean;
  /**
   * A storage write for this card is in flight: freeze every control so a double tap
   * cannot submit twice or move on before the first answer has been saved.
   */
  busy?: boolean;
  /**
   * Pre-check rehearsal offered on a mastery check: practise a similar question first.
   * `onAnswer` only remembers the rehearsal for this screen; it is never graded or saved
   * as an attempt, so it cannot count towards mastery.
   */
  rehearse?: { stored?: { answer: string; at: string }; suggestion?: string; onAnswer: (answer: string) => void };
  /**
   * Resolves once the parent has confirmed the answer with storage. The verdict is only
   * shown after that: a card that says "Correct." while the attempt was never written
   * invites the learner to move on from an answer that does not exist.
   */
  onSubmit: (input: { answer: string; correct: boolean; hintsUsed: number; misconception?: string }) => boolean | Promise<boolean>;
  submitLabel?: string;
}

/** One exercise: answer input or choices, tutor hint ladder, feedback, solution. */
export function ExerciseCard({
  exercise: ex,
  lesson,
  attemptsOnExercise,
  hintsShown,
  conceptAttempts,
  mastery,
  onSubmit,
  onHint,
  locked,
  noHints,
  busy,
  rehearse,
  submitLabel,
}: ExerciseProps) {
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
  const [pending, setPending] = useState(false);
  const [rehearsing, setRehearsing] = useState(false);
  const [rehearsalRaw, setRehearsalRaw] = useState('');
  const liveRef = useRef<HTMLDivElement>(null);

  // Reset only when the exercise itself changes (or is locked from outside).
  useEffect(() => {
    setRaw('');
    setGrade(null);
    setSolved(Boolean(locked));
    setTutor(null);
    setRevealed(0);
    setRehearsing(false);
    setRehearsalRaw('');
    setPending(false);
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

  const submit = async (value: string) => {
    if (busy || pending) return;
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
    // Freeze the card until storage has accepted the attempt, so a second tap cannot post
    // the same answer twice and the verdict cannot appear before it was saved.
    setPending(true);
    let saved = false;
    try {
      saved = await onSubmit({ answer, correct: result.correct, hintsUsed: usedHelp, misconception: result.misconception });
    } finally {
      setPending(false);
    }
    // Not saved: the parent shows why, and the card stays exactly as it was so the
    // learner can try again without any "accepted" state having been shown.
    if (!saved) return;
    setGrade(result);
    setTutor(null);
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
          {/* No `label`: KaTeX output is marked aria-hidden, and the prompt above already
              states the maths in words ("Solve for x."). Labelling it with the prompt made a
              screen reader announce the whole question twice, and labelling it with the raw
              LaTeX would read backslashes and commands aloud. */}
          <Math tex={ex.math} display />
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
              disabled={solved || busy || pending}
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
            disabled={solved || busy || pending}
            aria-describedby={grade ? `${inputId}-feedback` : undefined}
            data-testid="answer-input"
          />
          <div className="btn-row">
            <button type="submit" className="btn" disabled={solved || busy || pending || !raw.trim()} data-testid="submit-answer">
              {submitLabel ?? 'Check answer'}
            </button>
            {!noHints && (
              <button type="button" className="btn btn-secondary" onClick={hint} data-testid="hint-button" disabled={solved || busy || pending}>
                {hintButtonLabel}
              </button>
            )}
          </div>
        </form>
      )}
      {ex.kind === 'choice' && !noHints && (
        <div className="btn-row">
          <button type="button" className="btn btn-secondary btn-sm" onClick={hint} disabled={solved || busy || pending}>
            {hintButtonLabel}
          </button>
        </div>
      )}
      {noHints && rehearse && !solved && (
        <div className="stack-sm" data-testid="check-rehearsal">
          {rehearse.stored && !rehearsing && (
            <p className="small muted mb-0" data-testid="check-rehearsal-stored">
              You practised this kind of question first: “{rehearse.stored.answer}”. Rehearsal does not count as evidence.
            </p>
          )}
          {!rehearsing ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setRehearsing(true);
                setRehearsalRaw('');
              }}
              disabled={busy}
              data-testid="check-rehearse"
            >
              Practise this kind of question first
            </button>
          ) : (
            <div className="feedback feedback-info" role="group" aria-label="Practice this kind of question first">
              <strong>Rehearsal (not counted)</strong>
              <span style={{ display: 'block' }}>
                {rehearse.suggestion ?? 'Try one simpler version of this question first. Nothing you type here is graded.'}
              </span>
              <label className="field-label" htmlFor={`${inputId}-rehearsal`}>
                Your rehearsal answer
              </label>
              <input
                id={`${inputId}-rehearsal`}
                className="input"
                value={rehearsalRaw}
                onChange={(e) => setRehearsalRaw(e.target.value)}
                disabled={busy}
                data-testid="check-rehearsal-input"
              />
              <div className="btn-row" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    if (rehearsalRaw.trim()) rehearse.onAnswer(rehearsalRaw.trim());
                    setRehearsing(false);
                  }}
                  disabled={busy || !rehearsalRaw.trim()}
                  data-testid="check-rehearsal-done"
                >
                  Done practising
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRehearsing(false)} disabled={busy} data-testid="check-rehearsal-cancel">
                  Close
                </button>
              </div>
            </div>
          )}
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
                {followUpQuestion(grade?.misconception, { exercise: ex })}
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

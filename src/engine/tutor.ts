/**
 * Deterministic tutor. Pure functions over attempts + exercise + mastery evidence.
 *
 * Produces: targeted hints (escalating), misconception-specific explanations, worked
 * examples, follow-up questions, difficulty decisions and next-action recommendations.
 * No randomness, no network, fully testable.
 */
import { AttemptRecord, MasteryRecord, MasteryState } from '../storage/repositories';
import { Exercise, Lesson } from '../content/types';
import { GradeResult } from './grading';
import { MASTERY_CONFIG } from './mastery';
import { daysUntilDue } from './review';
import type { ReviewRecord } from '../storage/repositories';

export interface TutorContext {
  exercise: Exercise;
  lesson?: Lesson;
  attemptsOnExercise: number;
  conceptAttempts: AttemptRecord[];
  mastery?: MasteryRecord;
  hintsShown: number;
  lastGrade?: GradeResult;
}

export interface HintResult {
  kind: 'hint' | 'worked-example' | 'remediate' | 'encourage';
  text: string;
  math?: string;
  workedSteps?: string[];
  /** concept to practise first if remediation is suggested */
  prerequisite?: string;
}

/** Escalation: hint 1 (nudge) → hint 2 (method) → worked example → prerequisite remediation.
 *  `freeHintsShown` are practice hints already revealed inline, so the tutor starts after them. */
export function requestHint(ctx: TutorContext, freeHintsShown = 0): HintResult {
  const { exercise } = ctx;
  const hints = exercise.hints;
  const hintsShown = ctx.hintsShown + freeHintsShown;

  if (hintsShown < hints.length) {
    return { kind: 'hint', text: hints[hintsShown] };
  }
  if (hints.length > 0 && hintsShown === hints.length) {
    return { kind: 'worked-example', text: 'Here is a full worked example using the same ideas.', workedSteps: workedExample(ctx) };
  }
  const prereq = ctx.lesson?.remediation;
  return {
    kind: 'remediate',
    text: prereq
      ? 'This is a tough one. Try a simpler example first — the idea is the same.'
      : 'Good effort. Read the worked example closely, then try again.',
    prerequisite: prereq,
    workedSteps: workedExample(ctx),
  };
}

/**
 * Whether the question actually contains a variable. The `math` string is LaTeX, so
 * single-letter commands such as `\quad` or `\text` would look like variables to a naive
 * character test. Math-mode letters that are commands are dropped; the rest is scanned.
 */
function variablesOfExercise(ex: Exercise): string[] {
  const maths = (ex.math ?? '')
    // Keep function names out of the way: f(x) is notation, not a value to substitute.
    .replace(/\b[a-z]\s*\(/g, ' ')
    // Drop backslash commands (`\quad`, `\text`, `\underbrace`): the command names are words.
    .replace(/\\[a-zA-Z]+/g, ' ');
  const plain = `${maths}\n${ex.prompt}\n${ex.solution}`;
  const found = new Set<string>();
  for (const m of plain.matchAll(/(^|[^a-zA-Z])([a-z])(?![a-zA-Z])/gi)) found.add(m[2].toLowerCase());
  return [...found];
}

/**
 * A worked example for an exercise the learner is stuck on.
 *
 * The first line must be a *nudge*, not the answer: the mastery rules judge an attempt by the
 * hints recorded on it, and the free practice hints already step through the method. Opening
 * with the worked solution (which used to be step 2, after "Start from: 6 + 7") gave the answer
 * away before the learner had read a single line of reasoning.
 */
export function workedExample(ctx: TutorContext): string[] {
  const ex = ctx.exercise;
  const steps: string[] = [];
  if (ex.kind === 'choice' && ex.choices) {
    steps.push('Read what the question asks for.');
    steps.push('Test each choice against the meaning of the expression.');
    steps.push(`The correct choice is ${ex.answer}. ${ex.solution}`);
    return steps;
  }
  if (ex.math) steps.push(`Start from: ${ex.math}`);
  // The solution goes last: "Start from" + the worked solution + the answer used to be this
  // list, so after spending every free hint the learner was handed the answer as line two.
  steps.push('Try the next step yourself before reading the solution below.');
  steps.push(ex.solution);
  if (ex.kind === 'numeric' && ex.math && !ex.math.includes('=')) {
    steps.push(`So the answer is ${ex.answer}.`);
  }
  // A check by substitution only makes sense when there is a variable to substitute.
  if (variablesOfExercise(ex).length > 0) {
    steps.push('Tip: re-check the answer by substituting it back into the original problem.');
  }
  return steps;
}

/**
 * Feedback after a wrong answer. Escalation order:
 * - first mistake: the grader's targeted sentence (+ the lesson's advice if the slip is diagnosed)
 * - the same diagnosed misconception (2+ times across the concept): a different explanation
 *   and a visual model
 * - a second attempt on this question, or 3+ mistakes on the concept: a simpler prerequisite
 */
export function feedbackOnMistake(ctx: TutorContext): { text: string; switchModel: boolean; simpler: boolean; prerequisite?: string; misconceptionText?: string } {
  const grade = ctx.lastGrade;
  const misconceptionId = grade?.misconception;
  const sameMistake = misconceptionId
    ? ctx.conceptAttempts.filter((a) => !a.correct && a.misconception === misconceptionId).length
    : 0;
  // "Repeated" only means the *same* mistake when the diagnosis is specific. `arithmetic` is
  // the generic bucket for "some number that is simply wrong"; two of those say nothing about
  // which idea is missing, so dressing them up as a repeat would be a guess presented as fact.
  const specificMistake = misconceptionId !== undefined && !GENERIC_DIAGNOSES.has(misconceptionId);
  const totalMistakes = ctx.conceptAttempts.filter((a) => !a.correct).length;

  const misconception = specificMistake ? ctx.lesson?.misconceptions.find((m) => m.id === misconceptionId) : undefined;

  // The documented escalation order, which the code used to skip:
  //   first mistake            → the grader's targeted sentence (+ advice if diagnosed)
  //   the same diagnosed slip  → a different explanation (the visual model)
  //   stuck on this question,
  //   or 3 mistakes on the concept → a simpler prerequisite
  // `attemptsOnExercise` counts persisted attempts *before* this one, so 1 means this is the
  // second attempt here. The old code required a *third* attempt (`>= 2`), so a learner retrying
  // the same question twice was still told "Not yet. Check each step's arithmetic." The
  // 3-mistake-across-the-concept branch is unchanged (and tested).
  const stuckOnThisQuestion = ctx.attemptsOnExercise >= 1;
  const repeatedDiagnosis = specificMistake && sameMistake >= 2 && misconception !== undefined;
  if (stuckOnThisQuestion || totalMistakes >= 3) {
    return {
      text: ctx.lesson?.remediation
        ? 'Let’s step back and try a simpler idea first. The same rule will make this easier.'
        : 'Let’s look at this a different way. Work through the example, then try a fresh version.',
      switchModel: true,
      simpler: true,
      prerequisite: ctx.lesson?.remediation,
      misconceptionText: misconception?.feedback,
    };
  }
  if (repeatedDiagnosis) {
    return {
      text: `It looks like the same idea tripped us up again (${misconception.description.toLowerCase()}). Try the visual model: ${misconception.feedback}`,
      switchModel: true,
      simpler: false,
      misconceptionText: misconception.feedback,
    };
  }
  // A diagnosed slip already has beginner-friendly advice in the lesson; show it with the
  // grader's sentence instead of leaving it silently in `misconceptionText`.
  if (misconception) {
    return {
      text: `${grade?.message ?? 'Not quite — try again.'} ${misconception.feedback}`,
      switchModel: false,
      simpler: false,
      misconceptionText: misconception.feedback,
    };
  }
  return {
    text: grade?.message ?? 'Not quite — try again.',
    switchModel: false,
    simpler: false,
    misconceptionText: undefined,
  };
}

/** Independent success streak ending at the most recent attempts. */
export function independentStreak(attempts: AttemptRecord[]): number {
  let n = 0;
  for (let i = attempts.length - 1; i >= 0; i--) {
    const a = attempts[i];
    if (a.correct && a.hintsUsed === 0) n++;
    else break;
  }
  return n;
}

export type Difficulty = 'easier' | 'same' | 'harder';

/**
 * Diagnoses that describe a *specific* error pattern. Everything else (`arithmetic`,
 * `off-by-one`, `not-solution`, …) means "wrong, cause unknown", so it must never be
 * treated as a repeat of an earlier mistake or explained with a misconception's advice.
 */
export const GENERIC_DIAGNOSES: ReadonlySet<string> = new Set([
  'arithmetic',
  'off-by-one',
  'not-equivalent',
  'not-solution',
  'unparseable',
  'form-mismatch',
  'unknown',
]);

export function nextDifficulty(mastery: MasteryRecord | undefined, conceptAttempts: AttemptRecord[], current: 1 | 2 | 3): Difficulty {
  const streak = independentStreak(conceptAttempts);
  const recent = conceptAttempts.slice(-3);
  const recentWrong = recent.filter((a) => !a.correct).length;
  if (recentWrong >= 2 || (mastery?.state === 'needs-review' && recentWrong >= 1)) return 'easier';
  if (streak >= 3 && current < 3) return 'harder';
  if (streak >= 2 && recentWrong === 0 && current === 1) return 'harder';
  return 'same';
}

export interface Recommendation {
  kind: 'review' | 'continue-lesson' | 'next-lesson' | 'mastery-check' | 'less-assistance' | 'playground';
  title: string;
  detail: string;
  lessonId?: string;
  conceptId?: string;
  urgency: number;
}

/**
 * Deterministically choose the next useful action from persisted state.
 * Pure; the caller supplies curriculum ordering.
 */
export function recommendNext(input: {
  dueReviews: ReviewRecord[];
  conceptsNeedingReview: MasteryState[];
  nextIncompleteLessonId?: string;
  lastLessonId?: string;
  provisionalConcepts: string[];
  hasAnyProgress: boolean;
  now?: Date;
}): Recommendation {
  const now = input.now ?? new Date();
  const due = [...input.dueReviews].sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  if (due.length > 0) {
    return {
      kind: 'review',
      title: `Review ${due.length} concept${due.length > 1 ? 's' : ''}`,
      detail: 'A short review now keeps these skills fresh.',
      conceptId: due[0].conceptId,
      urgency: 10,
    };
  }
  if (input.conceptsNeedingReview.length > 0) {
    return {
      kind: 'review',
      title: 'Strengthen a shaky concept',
      detail: 'Some concepts need a little reinforcement before moving on.',
      conceptId: input.conceptsNeedingReview[0],
      urgency: 8,
    };
  }
  if (input.provisionalConcepts.length > 0) {
    return {
      kind: 'mastery-check',
      title: 'Prove your mastery',
      detail: 'You are close on a concept — a short mastery check confirms it.',
      conceptId: input.provisionalConcepts[0],
      urgency: 6,
    };
  }
  if (input.nextIncompleteLessonId) {
    return {
      kind: 'continue-lesson',
      title: input.hasAnyProgress ? 'Continue learning' : 'Start your first lesson',
      detail: input.hasAnyProgress ? 'Pick up where you left off.' : 'The best first step: numbers and counting.',
      lessonId: input.nextIncompleteLessonId,
      urgency: 5,
    };
  }
  const upcomingReview = due[0];
  if (upcomingReview) void daysUntilDue(upcomingReview, now);
  return {
    kind: 'playground',
    title: 'Explore the playground',
    detail: 'Everything in the curriculum is done. Experiment freely!',
    urgency: 1,
  };
}

/** Follow-up question used to distinguish two plausible misconceptions. */
export function followUpQuestion(misconception?: string, ctx?: Pick<TutorContext, 'exercise'>): string {
  // A balance question only makes sense where there are two sides to keep equal. The same
  // misconception id (e.g. a lost minus sign) also occurs on plain arithmetic, where asking
  // "what did you change on the left side?" describes work the learner never did.
  const hasBalance = Boolean(ctx?.exercise.math?.includes('='));
  switch (misconception) {
    case 'sign-error':
      return 'Is the result positive or negative? Say it in words: “negative …”.';
    case 'combined-unlike-terms':
      return 'Which terms have exactly the same variable part? Circle only those.';
    case 'same-side-error':
      return hasBalance ? 'What did you change on the left side? Now change the right side the same way.' : 'What did you change? Now change the other side the same way.';
    case 'inverse-operation-error':
      return hasBalance
        ? 'How do you undo subtracting 3? With another subtraction, or with addition?'
        : 'Which operation would undo this one? Try its inverse.';
    case 'coefficient-error':
      return 'What number multiplies the variable? That number stays with the variable.';
    case 'false-equation':
      return hasBalance ? 'Substitute your answer into the original equation. Are the two sides equal?' : 'Substitute your answer into the original problem and check it.';
    case 'order-left-to-right':
      return 'Which operation comes first here: × and ÷, or + and −?';
    case 'exponent-as-multiply':
      return 'Is x² the same as 2x, or is it x · x? Try x = 3 in both.';
    case 'off-by-one':
      return 'Count the steps once more. Did you stop one before or one after the last one?';
    case 'partial-distribution':
      return 'Did you multiply by the term straight after the bracket’s plus or minus sign too?';
    case 'partial-factor':
      return 'Does your factor divide every term exactly?';
    case 'coordinate-order':
      return 'Which comes first, across (x) or up (y)?';
    case 'no-flip-negative':
      return 'You divided by a negative number. What happens to the inequality sign?';
    case 'line-without-check':
      return 'Put the x-value into the rule. Does the y-value match the point?';
    default:
      return 'Can you explain your first step in words?';
  }
}

export function masteryMessage(state: MasteryState | undefined): string {
  switch (state) {
    case 'established':
      return `Mastered — ${MASTERY_CONFIG.established.independent}+ independent correct answers.`;
    case 'provisional':
      return 'Almost there: a short mastery check will confirm this concept.';
    case 'needs-review':
      return 'This needs a review. It will come back soon.';
    case 'practicing':
      return 'Practising — keep going with less help.';
    default:
      return 'Starting this concept.';
  }
}

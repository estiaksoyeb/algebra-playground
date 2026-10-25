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
import { t } from '../i18n';

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
    return { kind: 'worked-example', text: t('tutor.workedExampleIntro'), workedSteps: workedExample(ctx) };
  }
  const prereq = ctx.lesson?.remediation;
  return {
    kind: 'remediate',
    text: prereq ? t('tutor.remediateWithPrereq') : t('tutor.remediate'),
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
      text: ctx.lesson?.remediation ? t('tutor.stepBackPrereq') : t('tutor.stepBack'),
      switchModel: true,
      simpler: true,
      prerequisite: ctx.lesson?.remediation,
      misconceptionText: misconception?.feedback,
    };
  }
  if (repeatedDiagnosis) {
    return {
      text: t('tutor.repeatedIdea', {
        description: misconception.description.toLowerCase(),
        feedback: misconception.feedback,
      }),
      switchModel: true,
      simpler: false,
      misconceptionText: misconception.feedback,
    };
  }
  // A diagnosed slip already has beginner-friendly advice in the lesson; show it with the
  // grader's sentence instead of leaving it silently in `misconceptionText`.
  if (misconception) {
    return {
      text: `${grade?.message ?? t('tutor.notQuite')} ${misconception.feedback}`,
      switchModel: false,
      simpler: false,
      misconceptionText: misconception.feedback,
    };
  }
  return {
    text: grade?.message ?? t('tutor.notQuite'),
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
      title: t('recommend.reviewCount', { count: due.length }),
      detail: t('recommend.reviewDetail'),
      conceptId: due[0].conceptId,
      urgency: 10,
    };
  }
  if (input.conceptsNeedingReview.length > 0) {
    return {
      kind: 'review',
      title: t('recommend.strengthen'),
      detail: t('recommend.strengthenDetail'),
      conceptId: input.conceptsNeedingReview[0],
      urgency: 8,
    };
  }
  if (input.provisionalConcepts.length > 0) {
    return {
      kind: 'mastery-check',
      title: t('recommend.prove'),
      detail: t('recommend.proveDetail'),
      conceptId: input.provisionalConcepts[0],
      urgency: 6,
    };
  }
  if (input.nextIncompleteLessonId) {
    return {
      kind: 'continue-lesson',
      title: input.hasAnyProgress ? t('recommend.continue') : t('recommend.firstLesson'),
      detail: input.hasAnyProgress ? t('recommend.continueDetail') : t('recommend.firstLessonDetail'),
      lessonId: input.nextIncompleteLessonId,
      urgency: 5,
    };
  }
  const upcomingReview = due[0];
  if (upcomingReview) void daysUntilDue(upcomingReview, now);
  return {
    kind: 'playground',
    title: t('recommend.playground'),
    detail: t('recommend.playgroundDetail'),
    urgency: 1,
  };
}

/** Follow-up question used to distinguish two plausible misconceptions. */
export function followUpQuestion(misconception?: string, ctx?: Pick<TutorContext, 'exercise'>): string {
  // A balance question only makes sense where there are two sides to keep equal. The same
  // misconception id (e.g. a lost minus sign) also occurs on plain arithmetic, where asking
  // "what did you change on the left side?" describes work the learner never did.
  const hasBalance = Boolean(ctx?.exercise.math?.includes('='));
  // Every sentence lives in the catalogue, so the question is translated in one place and
  // the English wording never has to be duplicated here.
  const key = followUpKey(misconception, hasBalance);
  return t(`tutor.followUp.${key}`);
}

function followUpKey(misconception: string | undefined, hasBalance: boolean): string {
  switch (misconception) {
    case 'sign-error':
      return 'sign';
    case 'combined-unlike-terms':
      return 'likeTerms';
    case 'same-side-error':
      return hasBalance ? 'sameSide' : 'sameSidePlain';
    case 'inverse-operation-error':
      return hasBalance ? 'inverse' : 'inversePlain';
    case 'coefficient-error':
      return 'coefficient';
    case 'false-equation':
      return hasBalance ? 'checkEquation' : 'checkPlain';
    case 'order-left-to-right':
      return 'order';
    case 'exponent-as-multiply':
      return 'exponent';
    case 'off-by-one':
      return 'offByOne';
    case 'partial-distribution':
      return 'distribution';
    case 'partial-factor':
      return 'factor';
    case 'coordinate-order':
      return 'coordinates';
    case 'no-flip-negative':
      return 'inequalityFlip';
    case 'line-without-check':
      return 'graphCheck';
    default:
      return 'generic';
  }
}

export function masteryMessage(state: MasteryState | undefined): string {
  const key =
    state === 'established'
      ? 'established'
      : state === 'provisional'
        ? 'provisional'
        : state === 'needs-review'
          ? 'needsReview'
          : state === 'practicing'
            ? 'practicing'
            : 'starting';
  if (key === 'established') {
    return t('tutor.mastery.established', { count: MASTERY_CONFIG.established.independent });
  }
  return t(`tutor.mastery.${key}`);
}

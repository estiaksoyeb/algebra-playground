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
  steps.push(ex.solution);
  if (ex.kind === 'numeric' && ex.math && !ex.math.includes('=')) {
    steps.push(`So the answer is ${ex.answer}.`);
  }
  steps.push('Tip: re-check the answer by substituting it back into the original problem.');
  return steps;
}

/**
 * Feedback after a wrong answer.
 * - 1st mistake on an exercise: short targeted hint (+ misconception explanation if diagnosed)
 * - repeated same misconception (2+ times across the concept): switch to a different
 *   explanation and recommend a visual model
 * - 3+ mistakes: simpler prerequisite example
 */
export function feedbackOnMistake(ctx: TutorContext): { text: string; switchModel: boolean; simpler: boolean; prerequisite?: string; misconceptionText?: string } {
  const grade = ctx.lastGrade;
  const misconceptionId = grade?.misconception;
  const sameMistake = misconceptionId
    ? ctx.conceptAttempts.filter((a) => !a.correct && a.misconception === misconceptionId).length
    : 0;
  const totalMistakes = ctx.conceptAttempts.filter((a) => !a.correct).length;

  const misconception = ctx.lesson?.misconceptions.find((m) => m.id === misconceptionId);

  if (ctx.attemptsOnExercise >= 2 || totalMistakes >= 3) {
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
  if (sameMistake >= 2 && misconception) {
    return {
      text: `It looks like the same idea tripped us up again (${misconception.description.toLowerCase()}). Try the visual model: ${misconception.feedback}`,
      switchModel: true,
      simpler: false,
      misconceptionText: misconception.feedback,
    };
  }
  return {
    text: grade?.message ?? 'Not quite — try again.',
    switchModel: false,
    simpler: false,
    misconceptionText: misconception?.feedback,
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
export function followUpQuestion(misconception?: string): string {
  switch (misconception) {
    case 'sign-error':
      return 'Is the result positive or negative? Say it in words: “negative …”.';
    case 'combined-unlike-terms':
      return 'Which terms have exactly the same variable part? Circle only those.';
    case 'same-side-error':
      return 'What did you change on the left side? Now change the right side the same way.';
    case 'inverse-operation-error':
      return 'How do you undo subtracting 3? With another subtraction, or with addition?';
    case 'coefficient-error':
      return 'What number multiplies the variable? That number stays with the variable.';
    case 'false-equation':
      return 'Substitute your answer into the original equation. Are the two sides equal?';
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

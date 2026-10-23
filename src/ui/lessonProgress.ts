/**
 * Pure lesson-runner logic (no React), so the lesson player's decisions are testable:
 * which exercises count as masterable, whether enough independent evidence exists,
 * which mastery-check questions to ask, and what to recommend next.
 */
import { Lesson, Exercise } from '../content/types';
import { AttemptRecord } from '../storage/repositories';

/** Succeeding on these = mastery evidence. Excludes remediation and checks. */
export function practiceExercises(lesson: Lesson): Exercise[] {
  const checkIds = new Set((lesson.masteryCheck ?? []).map((e) => e.id));
  const reviewIds = new Set((lesson.reviewExercises ?? []).map((e) => e.id));
  return lesson.exercises.filter((e) => !checkIds.has(e.id) && !reviewIds.has(e.id));
}

export function checkExercises(lesson: Lesson): Exercise[] {
  return lesson.masteryCheck ?? [];
}

export interface MasteryProgress {
  independent: number;
  varieties: string[];
  minIndependent: number;
  minVariety: number;
  evidenceReady: boolean;
  checkPassed: boolean;
  complete: boolean;
}

/** Free hints (shown inside practice) do not count as help when the answer is correct. */
function independentAttempt(a: AttemptRecord): boolean {
  return a.correct && a.hintsUsed === 0;
}

/**
 * The mastery check is answered without hints, so any recorded hint means the
 * question was seen with help — even if a later attempt had hintsUsed 0.
 */
function checkPassedBy(exerciseId: string, own: AttemptRecord[]): boolean {
  let anyCorrect = false;
  for (const a of own) {
    if (a.exerciseId !== exerciseId) continue;
    if (a.hintsUsed > 0) return false;
    if (a.correct) anyCorrect = true;
  }
  return anyCorrect;
}

/** Evidence uses the newest attempt per exercise; help on the check revokes independence. */
export function masteryProgress(lesson: Lesson, attempts: AttemptRecord[], lessonRecord?: { completed: boolean } | null): MasteryProgress {
  const own = attempts.filter((a) => a.lessonId === lesson.id);
  const byExercise = new Map<string, AttemptRecord>();
  for (const a of own) byExercise.set(a.exerciseId, a);
  let independent = 0;
  const varieties = new Set<string>();
  for (const ex of practiceExercises(lesson)) {
    const a = byExercise.get(ex.id);
    if (a && independentAttempt(a)) {
      independent++;
      varieties.add(ex.variety);
    }
  }
  const checks = checkExercises(lesson);
  const checkPassed = checks.length > 0 && checks.every((c) => checkPassedBy(c.id, own));
  const minIndependent = lesson.mastery.minIndependent;
  const minVariety = lesson.mastery.minVariety;
  const evidenceReady = independent >= minIndependent && varieties.size >= Math.min(minVariety, practiceExercises(lesson).length);
  const complete = Boolean(lessonRecord?.completed) || (evidenceReady && (!lesson.mastery.requiresCheck || checkPassed));
  return {
    independent,
    varieties: [...varieties],
    minIndependent,
    minVariety,
    evidenceReady,
    checkPassed,
    complete,
  };
}

/** Deterministically choose up to three check questions covering distinct varieties. */
export function pickCheckQuestions(lesson: Lesson, count = 3): Exercise[] {
  const pool = [...checkExercises(lesson)];
  if (pool.length === 0) return [];
  const out: Exercise[] = [];
  const seen = new Set<string>();
  for (const ex of pool) {
    if (!seen.has(ex.variety)) {
      out.push(ex);
      seen.add(ex.variety);
    }
    if (out.length >= count) return out;
  }
  for (const ex of pool) {
    if (out.length >= count) break;
    if (!out.includes(ex)) out.push(ex);
  }
  return out;
}

export type NextAction = { kind: 'remedy' | 'continue-lesson' | 'review' | 'practice' | 'done'; lessonId?: string; label: string; detail: string };

/** After a lesson: remediate if struggling, otherwise recommend the next step. */
export function nextActionAfterLesson(input: {
  lesson: Lesson;
  attempts: AttemptRecord[];
  nextLessonId?: string;
  neededSpace?: boolean;
}): NextAction {
  const own = input.attempts.filter((a) => a.lessonId === input.lesson.id);
  const wrong = own.filter((a) => !a.correct).length;
  const correct = own.filter((a) => a.correct).length;
  if (input.lesson.remediation && wrong > 0 && wrong >= correct) {
    return {
      kind: 'remedy',
      lessonId: input.lesson.remediation,
      label: 'Practise the basics first',
      detail: 'A short refresher on the idea this lesson builds on will make the next lesson easier.',
    };
  }
  if (input.neededSpace) {
    return {
      kind: 'practice',
      label: 'More practice',
      detail: 'Practise similar problems in a different form before moving on.',
    };
  }
  if (input.nextLessonId) {
    return {
      kind: 'continue-lesson',
      lessonId: input.nextLessonId,
      label: 'Next lesson',
      detail: 'Carry on with the next topic in the path.',
    };
  }
  return { kind: 'done', label: 'Path complete', detail: 'You have reached the end of this path. Try the playground or review to keep skills fresh.' };
}

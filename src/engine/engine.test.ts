import { describe, it, expect } from 'vitest';
import { gradeAnswer } from './grading';
import { applyAttempt, computeScore, decideMastery, emptyMastery, masteryLabel, MASTERY_CONFIG } from './mastery';
import { initialReview, scheduleReview, isDue, dueReviews, daysUntilDue, stepFromInterval, REVIEW_INTERVALS_DAYS } from './review';
import { feedbackOnMistake, nextDifficulty, recommendNext, requestHint, independentStreak, workedExample, followUpQuestion } from './tutor';
import { CURRICULUM, LESSON_BY_ID, getAllExercises } from '../content/curriculum';
import { AttemptRecord, MasteryRecord, ReviewRecord } from '../storage/repositories';
import { Exercise, Lesson } from '../content/types';
import { Rational } from '../math/rational';

const ex = (id: string) => CURRICULUM.lessons.flatMap((l) => l.exercises).find((e) => e.id === id)!;

const attempt = (over: Partial<AttemptRecord>): AttemptRecord => ({
  conceptId: 'c',
  lessonId: 'l',
  exerciseId: 'e',
  answer: '',
  correct: true,
  hintsUsed: 0,
  attemptNumber: 1,
  at: '2025-01-01T00:00:00Z',
  ...over,
});

describe('grading & misconception diagnosis', () => {
  it('detects sign errors', () => {
    const e = ex('w2-l2-e1'); // 3 + (-5) = -2
    const r = gradeAnswer(e, '2');
    expect(r.correct).toBe(false);
    expect(r.misconception).toBe('sign-error');
  });

  it('detects combining unlike terms', () => {
    const e = ex('w5-l1-e2'); // 6x - 2x + 3
    expect(gradeAnswer(e, '7x').misconception).toBe('combined-unlike-terms');
  });

  it('detects combined-side errors in equations', () => {
    const e = ex('w4-l2-e1'); // x + 4 = 10
    const r = gradeAnswer(e, 'x=14');
    expect(r.correct).toBe(false);
  });

  it('detects inverse operation errors with context', () => {
    const e = ex('w4-l2-e1'); // x + 4 = 10, solution 6
    const r = gradeAnswer(e, 'x=12', { variableValue: Rational.of(6) });
    expect(r.misconception).toBe('inverse-operation-error');
  });

  it('never claims equivalence from one point', () => {
    const e: Exercise = {
      id: 'x', conceptId: 'c', kind: 'expression', prompt: '', answer: 'x^2', solution: '',
      hints: [], difficulty: 1, variety: 'v',
    };
    expect(gradeAnswer(e, 'x').correct).toBe(false); // equal at x=1 only
  });

  it('rejects unsafe input as unparseable rather than executing', () => {
    const e = ex('w1-l3-e1');
    const r = gradeAnswer(e, 'constructor(1)');
    expect(r.correct).toBe(false);
    expect(r.misconception).toBe('unparseable');
  });

  it('empty answer handled', () => {
    expect(gradeAnswer(ex('w1-l3-e1'), '  ').error).toBe('empty');
  });
});

describe('mastery', () => {
  const concept = 'like-terms';

  it('does not award mastery for a single repeated exercise', () => {
    let rec = emptyMastery(concept);
    for (let i = 0; i < 6; i++) rec = applyAttempt(rec, { correct: true, hintsUsed: 0, variety: 'same', at: '2025-01-01' });
    const d = decideMastery(rec, Array.from({ length: 6 }, () => attempt({ correct: true, conceptId: concept })), { minIndependent: 3, minVariety: 3, requiresCheck: true });
    expect(d.state).toBe('practicing');
  });

  it('requires a mastery check before established', () => {
    let rec = emptyMastery(concept);
    const varieties = ['a', 'b', 'c', 'd'];
    const attempts: AttemptRecord[] = [];
    varieties.forEach((v) => {
      rec = applyAttempt(rec, { correct: true, hintsUsed: 0, variety: v, at: '2025-01-01' });
      attempts.push(attempt({ correct: true, conceptId: concept }));
    });
    const withoutCheck = decideMastery(rec, attempts, { minIndependent: 4, minVariety: 3, requiresCheck: true });
    expect(withoutCheck.state).toBe('provisional');
    const withCheck = decideMastery(rec, attempts, { minIndependent: 4, minVariety: 3, requiresCheck: true }, { checkPassed: true });
    expect(withCheck.state).toBe('established');
  });

  it('goes to needs-review after repeated recent mistakes', () => {
    let rec = applyAttempt(emptyMastery(concept), { correct: true, hintsUsed: 0, variety: 'a', at: '2025-01-01' });
    rec.state = 'established';
    const attempts = [
      attempt({ correct: false }),
      attempt({ correct: false }),
      attempt({ correct: true }),
      attempt({ correct: false }),
      attempt({ correct: false }),
    ];
    rec = attempts.reduce((r, a) => applyAttempt(r, { correct: a.correct, hintsUsed: 0, variety: 'a', at: a.at }), rec);
    const d = decideMastery(rec, attempts, undefined, { previousState: 'established' });
    expect(d.state).toBe('needs-review');
  });

  it('assisted successes do not count as independent', () => {
    const rec = applyAttempt(applyAttempt(emptyMastery(concept), { correct: true, hintsUsed: 2, variety: 'a', at: 'x' }), { correct: true, hintsUsed: 1, variety: 'b', at: 'x' });
    expect(rec.independentCorrect).toBe(0);
    expect(rec.assistedCorrect).toBe(2);
    expect(decideMastery(rec, [attempt({}), attempt({})], undefined).state).toBe('practicing');
  });

  it('scores deterministically and caps at 100', () => {
    expect(computeScore({ independentCorrect: 5, assistedCorrect: 0, incorrect: 0, distinctExerciseKinds: ['a', 'b', 'c'] })).toBe(100);
    expect(computeScore({ independentCorrect: 0, assistedCorrect: 0, incorrect: 0, distinctExerciseKinds: [] })).toBe(0);
    expect(masteryLabel('needs-review')).toBe('Needs review');
    expect(MASTERY_CONFIG.established.minAccuracy).toBeGreaterThan(0.5);
  });
});

describe('spaced review', () => {
  const now = new Date('2025-06-01T12:00:00Z');
  it('schedules first review one day out and marks due correctly', () => {
    const r = initialReview('c', now);
    expect(daysUntilDue(r, now)).toBe(1);
    expect(isDue(r, now)).toBe(false);
    expect(isDue(r, new Date('2025-06-02T12:00:01Z'))).toBe(true);
  });
  it('expands intervals on clean success and shrinks on failure', () => {
    let r = initialReview('c', now);
    r = scheduleReview(r, { correct: true, assisted: false }, now);
    expect(r.intervalDays).toBeGreaterThan(1);
    const afterGood = r.intervalDays;
    r = scheduleReview(r, { correct: false, assisted: false }, now);
    expect(r.intervalDays).toBeLessThan(afterGood);
    expect(r.lapses).toBe(1);
  });
  it('assisted success repeats the same step', () => {
    const r = initialReview('c', now);
    const r2 = scheduleReview(r, { correct: true, assisted: true }, now);
    expect(r2.intervalDays).toBe(stepFromInterval(1) === 0 ? Math.round(1 * r.ease * 10) / 10 : r2.intervalDays);
    expect(r2.reps).toBe(1);
  });
  it('is deterministic (same inputs, same output)', () => {
    const a = scheduleReview(initialReview('c', now), { correct: true, assisted: false }, now);
    const b = scheduleReview(initialReview('c', now), { correct: true, assisted: false }, now);
    expect(a).toEqual(b);
  });
  it('orders due reviews oldest first', () => {
    const reviews: ReviewRecord[] = [
      { ...initialReview('a', now), dueAt: '2025-05-30T00:00:00Z' },
      { ...initialReview('b', now), dueAt: '2025-05-20T00:00:00Z' },
      { ...initialReview('c', now), dueAt: '2025-07-01T00:00:00Z' },
    ];
    expect(dueReviews(reviews, now).map((r) => r.conceptId)).toEqual(['b', 'a']);
  });
  it('interval schedule is ascending', () => {
    for (let i = 1; i < REVIEW_INTERVALS_DAYS.length; i++) expect(REVIEW_INTERVALS_DAYS[i]).toBeGreaterThan(REVIEW_INTERVALS_DAYS[i - 1]);
  });
});

describe('tutor', () => {
  const lesson: Lesson = LESSON_BY_ID['w4-l3-two-step'];
  const exercise = lesson.exercises[0];

  const ctx = (over: Partial<Parameters<typeof requestHint>[0]> = {}) => ({
    exercise,
    lesson,
    attemptsOnExercise: 0,
    conceptAttempts: [] as AttemptRecord[],
    hintsShown: 0,
    ...over,
  });

  it('escalates hints then gives a worked example', () => {
    expect(requestHint(ctx({ hintsShown: 0 })).kind).toBe('hint');
    const last = requestHint(ctx({ hintsShown: exercise.hints.length - 1 }));
    expect(last.text).toBe(exercise.hints[exercise.hints.length - 1]);
    const worked = requestHint(ctx({ hintsShown: exercise.hints.length }));
    expect(worked.kind).toBe('worked-example');
    expect(worked.workedSteps!.length).toBeGreaterThan(1);
  });

  it('first mistake gets a targeted hint; repeated misconception switches to a visual model', () => {
    const grade = gradeAnswer(ex('w5-l2-e1'), '3x + 2'); // 3(x+2), partial distribution
    expect(grade.misconception).toBe('partial-distribution');
    const lesson2 = LESSON_BY_ID['w5-l2-distributive'];
    const exercise2 = lesson2.exercises[0];
    const ctx2 = (over: Partial<Parameters<typeof requestHint>[0]>) => ctx({ exercise: exercise2, lesson: lesson2, ...over });
    const first = feedbackOnMistake(ctx2({ attemptsOnExercise: 0, lastGrade: grade, conceptAttempts: [attempt({ correct: false, misconception: grade.misconception })] }));
    expect(first.switchModel).toBe(false);
    const repeated = feedbackOnMistake(
      ctx2({
        attemptsOnExercise: 1,
        lastGrade: grade,
        conceptAttempts: [attempt({ correct: false, misconception: grade.misconception }), attempt({ correct: false, misconception: grade.misconception })],
      }),
    );
    expect(repeated.switchModel).toBe(true);
    expect(repeated.text.length).toBeGreaterThan(10);
  });

  it('falls back to a simpler prerequisite after repeated difficulty', () => {
    const fb = feedbackOnMistake(ctx({ attemptsOnExercise: 3, conceptAttempts: [attempt({ correct: false }), attempt({ correct: false }), attempt({ correct: false })] }));
    expect(fb.simpler).toBe(true);
    expect(fb.prerequisite).toBe('w4-l2-one-step');
  });

  it('adjusts difficulty deterministically', () => {
    const hardWork = Array.from({ length: 3 }, () => attempt({ correct: true, hintsUsed: 0 }));
    expect(nextDifficulty(undefined, hardWork, 1)).toBe('harder');
    const struggling = [attempt({ correct: false }), attempt({ correct: false })];
    expect(nextDifficulty(undefined, struggling, 3)).toBe('easier');
    expect(nextDifficulty(undefined, [], 2)).toBe('same');
    expect(independentStreak(hardWork)).toBe(3);
    expect(independentStreak([...hardWork, attempt({ correct: true, hintsUsed: 1 })])).toBe(0);
  });

  it('works example includes the solution', () => {
    const steps = workedExample(ctx());
    expect(steps.some((s) => s.includes('x = 4'))).toBe(true);
  });

  it('produces a follow-up question for known misconceptions', () => {
    expect(followUpQuestion('sign-error')).toMatch(/positive or negative/i);
    expect(followUpQuestion()).toMatch(/first step/i);
  });

  it('recommends review before new content', () => {
    const due = [initialReview('c', new Date('2020-01-01'))];
    const rec = recommendNext({
      dueReviews: due,
      conceptsNeedingReview: [],
      nextIncompleteLessonId: 'w1-l1-counting',
      provisionalConcepts: [],
      hasAnyProgress: true,
    });
    expect(rec.kind).toBe('review');
    const fresh = recommendNext({ dueReviews: [], conceptsNeedingReview: [], nextIncompleteLessonId: 'w1-l1-counting', provisionalConcepts: [], hasAnyProgress: false });
    expect(fresh.kind).toBe('continue-lesson');
    expect(fresh.title).toMatch(/first lesson/i);
  });

  it('every tutor hint exists for every exercise', () => {
    for (const { exercise: e } of getAllExercises()) {
      expect(e.hints.length, e.id).toBeGreaterThan(0);
    }
  });
});

describe('mastery records stay consistent', () => {
  it('applyAttempt is pure', () => {
    const rec: MasteryRecord = emptyMastery('c');
    const next = applyAttempt(rec, { correct: true, hintsUsed: 0, variety: 'a', at: 't' });
    expect(rec.independentCorrect).toBe(0);
    expect(next.independentCorrect).toBe(1);
  });
});

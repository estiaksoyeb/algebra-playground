import { describe, it, expect } from 'vitest';
import { CURRICULUM, getAllExercises, LESSON_ORDER, LESSON_BY_ID, validateCurriculum } from '../content/curriculum';
import { MASTERY_CHECKS } from '../content/masteryChecks';
import { Lesson } from '../content/types';
import { gradeAnswer, normalizeMathematical } from '../engine/grading';
import { pickCheckQuestions } from '../ui/lessonProgress';

describe('curriculum structure', () => {
  it('has no structural errors', () => {
    const issues = validateCurriculum(CURRICULUM);
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('covers all seven worlds with real lessons', () => {
    expect(CURRICULUM.worlds).toHaveLength(7);
    for (const w of CURRICULUM.worlds) {
      expect(CURRICULUM.lessons.filter((l) => l.world === w.id).length).toBeGreaterThanOrEqual(1);
    }
    expect(CURRICULUM.lessons.length).toBeGreaterThanOrEqual(30);
    expect(new Set(LESSON_ORDER).size).toBe(CURRICULUM.lessons.length);
  });

  it('orders prerequisites before dependants', () => {
    const seen = new Set<string>();
    for (const id of LESSON_ORDER) {
      const lesson = LESSON_BY_ID[id];
      for (const p of lesson.prerequisites) expect(seen.has(p), `${id} needs ${p} first`).toBe(true);
      seen.add(id);
    }
  });

  it('every exercise is gradable: the stored answer grades as correct', () => {
    const { lesson, exercise } = getAllExercises()[0];
    void lesson;
    const failures: string[] = [];
    for (const { lesson: l, exercise: ex } of getAllExercises()) {
      const accepted = Array.isArray(ex.answer) ? ex.answer : [ex.answer];
      for (const a of accepted) {
        const r = gradeAnswer(ex, a);
        if (!r.correct) failures.push(`${l.id}/${ex.id}: answer "${a}" graded wrong (${r.message})`);
      }
    }
    expect(failures).toEqual([]);
    expect(exercise).toBeTruthy();
  });

  it('accepts equivalent alternative forms for expressions', () => {
    const ex = CURRICULUM.lessons.flatMap((l) => l.exercises).find((e) => e.id === 'w5-l2-e1')!;
    expect(gradeAnswer(ex, '3x+6').correct).toBe(true);
    expect(gradeAnswer(ex, '6 + 3x').correct).toBe(true);
    expect(gradeAnswer(ex, '3*x + 6').correct).toBe(true);
    expect(gradeAnswer(ex, '3x + 3').correct).toBe(false);
    expect(gradeAnswer(ex, '3x + 5').misconception).toBe('partial-distribution');
  });

  it('accepts equivalent numeric forms (fractions vs decimals) but not wrong values', () => {
    const ex = CURRICULUM.lessons.flatMap((l) => l.exercises).find((e) => e.id === 'w2-l6-e1')!;
    expect(gradeAnswer(ex, '0.7').correct).toBe(true);
    expect(gradeAnswer(ex, '7/10').correct).toBe(true);
    expect(gradeAnswer(ex, '0.07').correct).toBe(false);
  });

  it('accepts equations written with different side order or spacing', () => {
    const ex = CURRICULUM.lessons.flatMap((l) => l.exercises).find((e) => e.id === 'w4-l2-e1')!;
    expect(gradeAnswer(ex, 'x = 6').correct).toBe(true);
    expect(gradeAnswer(ex, 'x=6').correct).toBe(true);
    expect(gradeAnswer(ex, 'x=10').correct).toBe(false);
  });

  it('does not grade by string equality for choice answers', () => {
    const ex = CURRICULUM.lessons.flatMap((l) => l.exercises).find((e) => e.id === 'w4-l1-e1')!;
    expect(gradeAnswer(ex, '  8 = 5 + 3 ').correct).toBe(true);
    expect(gradeAnswer(ex, '8 = 5 + 2').correct).toBe(false);
  });

  it('flags unparseable mathematical answers', () => {
    const ex = CURRICULUM.lessons.flatMap((l) => l.exercises).find((e) => e.id === 'w1-l3-e1')!;
    expect(gradeAnswer(ex, 'thirteen').misconception).toBe('unparseable');
    expect(normalizeMathematical('13').type).toBe('number');
  });
});

describe('mastery checks', () => {
  const lessons: Lesson[] = CURRICULUM.lessons;

  it('the shipped curriculum really carries a check for every lesson (not just the authored data)', () => {
    const missing = lessons.filter((l) => (l.masteryCheck ?? []).length === 0 || pickCheckQuestions(l).length === 0).map((l) => l.id);
    expect(missing).toEqual([]);
    expect(Object.keys(MASTERY_CHECKS).sort()).toEqual(lessons.map((l) => l.id).sort());
    // requiresCheck:true is meaningless without a check to pass.
    for (const l of lessons) if (l.mastery.requiresCheck) expect((l.masteryCheck ?? []).length, l.id).toBeGreaterThan(0);
  });

  it('every check answer grades as correct', () => {
    const failures: string[] = [];
    for (const lesson of lessons) {
      for (const ex of lesson.masteryCheck ?? []) {
        for (const a of Array.isArray(ex.answer) ? ex.answer : [ex.answer]) {
          const r = gradeAnswer(ex, a);
          if (!r.correct) failures.push(`${lesson.id}/${ex.id}: answer "${a}" graded wrong (${r.message})`);
        }
        if (ex.hints.length > 0) failures.push(`${ex.id}: check questions should not carry hints`);
        if (!lesson.conceptIds.includes(ex.conceptId)) failures.push(`${ex.id}: concept not declared by lesson`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('asks two distinct varieties per check and never reuses a teaching exercise id', () => {
    for (const lesson of lessons) {
      const checks = lesson.masteryCheck ?? [];
      expect(checks.length, lesson.id).toBeGreaterThanOrEqual(2);
      expect(new Set(checks.map((c) => c.variety)).size, lesson.id).toBe(2);
      expect(new Set(checks.map((c) => c.id)).size, lesson.id).toBe(checks.length);
      for (const c of checks) expect(lesson.exercises.some((e) => e.id === c.id), c.id).toBe(false);
    }
  });

  it('the shipped curriculum passes the structural validator', () => {
    expect(validateCurriculum().filter((i) => i.severity === 'error')).toEqual([]);
  });
});

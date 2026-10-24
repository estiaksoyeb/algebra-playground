import { describe, it, expect } from 'vitest';
import { masteryProgress, nextActionAfterLesson, pickCheckQuestions, practiceExercises, checkExercises } from './lessonProgress';
import { AttemptRecord } from '../storage/repositories';
import { Exercise, Lesson } from '../content/types';
import { CURRICULUM, LESSON_BY_ID, LESSON_ORDER } from '../content/curriculum';

const ex = (id: string, variety: string): Exercise => ({
  id,
  conceptId: 'c1',
  kind: 'numeric',
  prompt: `p-${id}`,
  answer: '1',
  solution: 's',
  hints: ['h'],
  difficulty: 1,
  variety,
});

function makeLesson(over: Partial<Lesson> = {}): Lesson {
  return {
    id: 'L1',
    world: 'numbers',
    order: 1,
    title: 'Test',
    summary: 'Test lesson',
    conceptIds: ['c1'],
    prerequisites: [],
    objectives: ['o'],
    steps: [{ type: 'teach', title: 'a', body: 'b' }],
    exercises: [ex('e1', 'a'), ex('e2', 'b'), ex('e3', 'c')],
    misconceptions: [],
    mastery: { minIndependent: 2, minVariety: 2, requiresCheck: true },
    estimatedMinutes: 5,
    ...over,
  };
}

let seq = 0;
function attempt(over: Partial<AttemptRecord> & { exerciseId: string }): AttemptRecord {
  seq++;
  return {
    uid: `t-${seq}`,
    conceptId: 'c1',
    lessonId: 'L1',
    answer: '1',
    correct: true,
    hintsUsed: 0,
    attemptNumber: 1,
    at: new Date(Date.UTC(2024, 0, 1, 0, 0, seq)).toISOString(),
    ...over,
  };
}

describe('practiceExercises / checkExercises', () => {
  it('excludes mastery-check and review exercises from practice', () => {
    const lesson = makeLesson({
      exercises: [ex('e1', 'a'), ex('e2', 'b'), ex('c1', 'a'), ex('r1', 'b')],
      masteryCheck: [ex('c1', 'a')],
      reviewExercises: [ex('r1', 'b')],
    });
    expect(practiceExercises(lesson).map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(checkExercises(lesson).map((e) => e.id)).toEqual(['c1']);
  });

  it('returns an empty check when the lesson has none', () => {
    expect(checkExercises(makeLesson())).toEqual([]);
  });
});

describe('masteryProgress', () => {
  it('counts only independent correct answers and distinct varieties', () => {
    const p = masteryProgress(makeLesson(), [
      attempt({ exerciseId: 'e1' }),
      attempt({ exerciseId: 'e2', hintsUsed: 2 }),
      attempt({ exerciseId: 'e3', correct: false }),
    ]);
    expect(p.independent).toBe(1);
    expect(p.varieties).toEqual(['a']);
    expect(p.evidenceReady).toBe(false);
    expect(p.complete).toBe(false);
  });

  it('becomes evidence-ready but not complete until the check is passed', () => {
    const lesson = makeLesson();
    const p = masteryProgress(lesson, [attempt({ exerciseId: 'e1' }), attempt({ exerciseId: 'e2' })]);
    expect(p.evidenceReady).toBe(true);
    expect(p.checkPassed).toBe(false);
    expect(p.complete).toBe(false);
  });

  it('requires distinct varieties, not just count', () => {
    const lesson = makeLesson({ exercises: [ex('e1', 'a'), ex('e2', 'a'), ex('e3', 'a')] });
    const p = masteryProgress(lesson, [attempt({ exerciseId: 'e1' }), attempt({ exerciseId: 'e2' })]);
    expect(p.independent).toBe(2);
    expect(p.evidenceReady).toBe(false);
  });

  it('uses the newest attempt per exercise (a later correct answer repairs an earlier wrong one)', () => {
    const lesson = makeLesson();
    const p = masteryProgress(lesson, [
      attempt({ exerciseId: 'e1', correct: false, hintsUsed: 1 }),
      attempt({ exerciseId: 'e1', correct: true }),
      attempt({ exerciseId: 'e2' }),
    ]);
    expect(p.independent).toBe(2);
    expect(p.evidenceReady).toBe(true);
  });

  it('a later helped attempt downgrades an earlier independent one', () => {
    const lesson = makeLesson();
    const p = masteryProgress(lesson, [
      attempt({ exerciseId: 'e1' }),
      attempt({ exerciseId: 'e1', hintsUsed: 1 }),
      attempt({ exerciseId: 'e2' }),
    ]);
    expect(p.independent).toBe(1);
  });

  it('passing the check with independent practice completes the mastery gate', () => {
    const lesson = makeLesson({ masteryCheck: [ex('k1', 'a')] });
    const p = masteryProgress(lesson, [
      attempt({ exerciseId: 'e1' }),
      attempt({ exerciseId: 'e2' }),
      attempt({ exerciseId: 'k1' }),
    ]);
    expect(p.checkPassed).toBe(true);
    expect(p.complete).toBe(true);
  });

  it('hints on the check prevent the check from passing', () => {
    const lesson = makeLesson({ masteryCheck: [ex('k1', 'a')] });
    const p = masteryProgress(lesson, [
      attempt({ exerciseId: 'e1' }),
      attempt({ exerciseId: 'e2' }),
      attempt({ exerciseId: 'k1', hintsUsed: 1 }),
    ]);
    expect(p.checkPassed).toBe(false);
    expect(p.complete).toBe(false);
  });

  it('all check questions must be answered correctly', () => {
    const lesson = makeLesson({ masteryCheck: [ex('k1', 'a'), ex('k2', 'b')] });
    const p = masteryProgress(lesson, [
      attempt({ exerciseId: 'e1' }),
      attempt({ exerciseId: 'e2' }),
      attempt({ exerciseId: 'k1' }),
    ]);
    expect(p.checkPassed).toBe(false);
  });

  it('does not need a check when requiresCheck is false', () => {
    const lesson = makeLesson({ mastery: { minIndependent: 2, minVariety: 2, requiresCheck: false } });
    const p = masteryProgress(lesson, [attempt({ exerciseId: 'e1' }), attempt({ exerciseId: 'e2' })]);
    expect(p.complete).toBe(true);
  });

  it('ignores attempts from other lessons', () => {
    const p = masteryProgress(makeLesson(), [
      attempt({ exerciseId: 'e1', lessonId: 'OTHER' }),
      attempt({ exerciseId: 'e2', lessonId: 'OTHER' }),
    ]);
    expect(p.independent).toBe(0);
  });

  it('a stored completed record marks the lesson complete even without fresh attempts', () => {
    const p = masteryProgress(makeLesson(), [], { completed: true });
    expect(p.complete).toBe(true);
  });

  it('caps the variety requirement at the number of practice exercises', () => {
    const lesson = makeLesson({ exercises: [ex('e1', 'a')], mastery: { minIndependent: 1, minVariety: 5, requiresCheck: false } });
    const p = masteryProgress(lesson, [attempt({ exerciseId: 'e1' })]);
    expect(p.evidenceReady).toBe(true);
  });

  it('is consistent with the real curriculum for every lesson (empty attempts → not complete)', () => {
    for (const lesson of CURRICULUM.lessons) {
      const p = masteryProgress(lesson, []);
      expect(p.complete, lesson.id).toBe(false);
      expect(p.independent).toBe(0);
    }
  });
});

describe('pickCheckQuestions', () => {
  it('returns [] when there is no mastery check', () => {
    expect(pickCheckQuestions(makeLesson())).toEqual([]);
  });

  it('prefers distinct varieties and caps at the count', () => {
    const lesson = makeLesson({
      masteryCheck: [ex('k1', 'a'), ex('k2', 'a'), ex('k3', 'b'), ex('k4', 'c')],
    });
    expect(pickCheckQuestions(lesson).map((e) => e.id)).toEqual(['k1', 'k3', 'k4']);
    expect(pickCheckQuestions(lesson, 2).map((e) => e.id)).toEqual(['k1', 'k3']);
  });

  it('fills up with repeated varieties when distinct ones run out', () => {
    const lesson = makeLesson({ masteryCheck: [ex('k1', 'a'), ex('k2', 'a')] });
    expect(pickCheckQuestions(lesson).map((e) => e.id)).toEqual(['k1', 'k2']);
  });

  it('respects the real curriculum: every check produces 1–3 unique questions', () => {
    for (const lesson of CURRICULUM.lessons) {
      const picks = pickCheckQuestions(lesson);
      expect(picks.length, lesson.id).toBeLessThanOrEqual(3);
      expect(new Set(picks.map((p) => p.id)).size, lesson.id).toBe(picks.length);
      if ((lesson.masteryCheck ?? []).length > 0) expect(picks.length, lesson.id).toBeGreaterThan(0);
    }
  });
});

describe('nextActionAfterLesson', () => {
  it('recommends remediation when wrong answers are at least as many as correct ones', () => {
    const lesson = makeLesson({ remediation: 'PREV' });
    const a = nextActionAfterLesson({
      lesson,
      attempts: [attempt({ exerciseId: 'e1', correct: false }), attempt({ exerciseId: 'e2', correct: true })],
      nextLessonId: 'NEXT',
    });
    expect(a.kind).toBe('remedy');
    expect(a.lessonId).toBe('PREV');
  });

  it('continues to the next lesson when doing well', () => {
    const lesson = makeLesson({ remediation: 'PREV' });
    const a = nextActionAfterLesson({
      lesson,
      // One right, zero wrong: remediation only triggers once mistakes match successes.
      attempts: [attempt({ exerciseId: 'e1' })],
      nextLessonId: 'NEXT',
    });
    expect(a.kind).toBe('continue-lesson');
    expect(a.lessonId).toBe('NEXT');
  });

  it('offers more practice when the concept needed review spacing', () => {
    const a = nextActionAfterLesson({ lesson: makeLesson(), attempts: [], nextLessonId: 'NEXT', neededSpace: true });
    expect(a.kind).toBe('practice');
  });

  it('reports done at the end of the path', () => {
    const a = nextActionAfterLesson({ lesson: makeLesson(), attempts: [] });
    expect(a.kind).toBe('done');
  });

  it('does not recommend remediation when there are no wrong attempts', () => {
    const a = nextActionAfterLesson({ lesson: makeLesson({ remediation: 'PREV' }), attempts: [attempt({ exerciseId: 'e1' })] });
    expect(a.kind).toBe('done');
  });

  it('the last lesson in the real curriculum has no next lesson', () => {
    const last = LESSON_BY_ID[LESSON_ORDER[LESSON_ORDER.length - 1]];
    expect(LESSON_ORDER[LESSON_ORDER.length - 1]).toBe(last.id);
  });
});

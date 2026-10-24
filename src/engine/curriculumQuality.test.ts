import { describe, it, expect } from 'vitest';
import { CURRICULUM, LESSON_BY_ID } from '../content/curriculum';
import { Exercise, Lesson } from '../content/types';
import { gradeAnswer } from './grading';
import { feedbackOnMistake, followUpQuestion, requestHint, TutorContext } from './tutor';
import { AttemptRecord } from '../storage/repositories';
import { Rational } from '../math/rational';

/**
 * Curriculum and tutor quality guards.
 *
 * Each test below was written against a defect confirmed by hand while auditing the content,
 * and was observed failing on the pre-fix source before the fix. They cover the four things
 * the older suites never checked:
 *  - what the tutor says after a *repeated* mistake (engine.test.ts only checked the first);
 *  - that a diagnosed misconception is one the lesson that owns the question can explain;
 *  - that hints, worked examples and follow-ups do not contradict the question or give the
 *    answer away before any reasoning;
 *  - that the authored content is mathematically self-consistent.
 */

const exerciseOf = (id: string): Exercise => CURRICULUM.lessons.flatMap((l) => l.exercises).find((e) => e.id === id)!;
const lessonOf = (exercise: Exercise): Lesson =>
  Object.values(LESSON_BY_ID).find((l) => l.exercises.some((e) => e.id === exercise.id))!;

let seq = 0;
function attempt(over: Partial<AttemptRecord> & { conceptId: string }): AttemptRecord {
  seq++;
  return {
    uid: `g-${seq}`,
    lessonId: 'l',
    exerciseId: 'e',
    answer: '',
    correct: false,
    hintsUsed: 0,
    attemptNumber: 1,
    at: new Date(Date.UTC(2024, 0, 1, 0, 0, seq)).toISOString(),
    ...over,
  };
}

function context(exercise: Exercise, over: Partial<TutorContext> = {}): TutorContext {
  return { exercise, lesson: lessonOf(exercise), attemptsOnExercise: 0, conceptAttempts: [], hintsShown: 0, ...over };
}

// ---------------------------------------------------------------------------
// Grading: a wrong answer is never called right, and a diagnosis is explainable
// ---------------------------------------------------------------------------
describe('grading', () => {
  it('an equation answer that solves nothing is diagnosed with its own value', () => {
    // w4-l2-e1 is x + 4 = 10, so x = 6. The production call site used to omit
    // `variableValue`, which made every equation diagnosis "not-solution".
    const exercise = exerciseOf('w4-l2-e1');
    const value = Rational.of(6);
    // x + 4 = 10 answered x = 14: the 4 was added instead of subtracted.
    expect(gradeAnswer(exercise, 'x=14', { variableValue: value }).misconception).toBe('inverse-operation-error');
    // x = 12: the 6 was doubled.
    expect(gradeAnswer(exercise, 'x=12', { variableValue: value }).misconception).toBe('inverse-operation-error');
    // No value passed at all: the stored answer still provides it.
    expect(gradeAnswer(exercise, 'x=14').misconception).toBe('inverse-operation-error');
    expect(gradeAnswer(exercise, 'x=6', { variableValue: value }).correct).toBe(true);
    expect(gradeAnswer(exercise, 'x=6').correct).toBe(true);
  });

  it('a repeated-mistake diagnosis names a misconception the lesson can explain', () => {
    // The grader used to call 2 + 3 × 4 = 20 "arithmetic" while the lesson documents the slip
    // as order-left-to-right; the learner then never saw the lesson's own advice.
    const exercise = exerciseOf('w1-l7-e1');
    const lesson = lessonOf(exercise);
    const slip = gradeAnswer(exercise, '20');
    expect(slip.correct).toBe(false);
    expect(lesson.misconceptions.map((m) => m.id)).toContain(slip.misconception!);
  });

  it('recognises the two precedence slips the lessons name, and nothing else', () => {
    // 2 + 3 × 4 worked left to right.
    expect(gradeAnswer(exerciseOf('w1-l7-e1'), '20').misconception).toBe('order-left-to-right');
    // 20 − 10 ÷ 2 worked left to right.
    expect(gradeAnswer(exerciseOf('w1-l7-e3'), '5').misconception).toBe('order-left-to-right');
    // 2³ + 4 with 2³ read as 2 × 3.
    expect(gradeAnswer(exerciseOf('w1-l7-e5'), '10').misconception).toBe('exponent-as-multiply');
    // Brackets are a different slip, so the generic message is kept rather than a wrong label.
    expect(gradeAnswer(exerciseOf('w1-l7-e4'), '45').misconception).toBe('arithmetic');
    // A plain sum is never an order-of-operations slip.
    expect(gradeAnswer(exerciseOf('w1-l3-e1'), '15').misconception).toBe('arithmetic');
  });

  it('an answer one more than the amount to add is not an off-by-one counting slip', () => {
    // w4-l1-e3: 5 comes from adding 5 to one side (an unbalanced change) or adding the wrong
    // amount; neither is a miscount, so "re-count carefully" was misleading.
    const exercise = exerciseOf('w4-l1-e3');
    expect(gradeAnswer(exercise, '4').correct).toBe(true);
    expect(gradeAnswer(exercise, '5').misconception).not.toBe('off-by-one');
    expect(gradeAnswer(exercise, '5').misconception).toBe('arithmetic');
  });

  it('every numeric exercise rejects a wrong answer and gives a reason', () => {
    for (const lesson of CURRICULUM.lessons) {
      for (const exercise of lesson.exercises) {
        if (exercise.kind !== 'numeric') continue;
        const accepted = Array.isArray(exercise.answer) ? exercise.answer : [exercise.answer];
        // A value far from any sensible slip: never accidentally the right answer.
        const wrong = accepted.includes('987654') ? '987655' : '987654';
        const result = gradeAnswer(exercise, wrong);
        expect(result.correct, `${exercise.id} accepted ${wrong}`).toBe(false);
        expect(result.message.length, `${exercise.id} gave no message`).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// The tutor keeps its documented promise on repeated mistakes
// ---------------------------------------------------------------------------
describe('repeated mistakes get a different explanation, as the tutor documents', () => {
  it('two attempts on the same question escalate on the second', () => {
    // `attemptsOnExercise` counts the persisted attempts before this one, so 1 means "this is
    // the second go". The old rule required a *third* attempt (`>= 2`), so a learner who tried
    // the same question twice was still told "Not yet. Check each step's arithmetic."
    const exercise = exerciseOf('w1-l3-e1');
    const fb = feedbackOnMistake(
      context(exercise, {
        attemptsOnExercise: 1,
        conceptAttempts: [attempt({ conceptId: exercise.conceptId }), attempt({ conceptId: exercise.conceptId })],
      }),
    );
    expect(fb.simpler).toBe(true);
    expect(fb.text).not.toMatch(/^Not yet\./);
  });

  it('three mistakes across fresh questions still escalate', () => {
    // The documented "3+ mistakes → simpler prerequisite" rule must keep working even when each
    // attempt was a first attempt on its own exercise.
    const exercise = exerciseOf('w1-l3-e1');
    const conceptId = exercise.conceptId;
    const mistakes = [attempt({ conceptId }), attempt({ conceptId }), attempt({ conceptId })];
    const fb = feedbackOnMistake(context(exercise, { conceptAttempts: mistakes }));
    expect(fb.simpler).toBe(true);
    expect(fb.text).toMatch(/simpler idea|different way/i);
  });

  it('a documented slip is explained with the lesson’s own words on the first mistake', () => {
    const exercise = exerciseOf('w1-l7-e1');
    const result = gradeAnswer(exercise, '20');
    const fb = feedbackOnMistake(
      context(exercise, {
        lastGrade: result,
        conceptAttempts: [attempt({ conceptId: exercise.conceptId, misconception: result.misconception })],
      }),
    );
    const lesson = lessonOf(exercise);
    const advice = lesson.misconceptions.find((m) => m.id === result.misconception)!.feedback;
    expect(fb.misconceptionText).toBe(advice);
    // …and the learner actually sees it, not only the generic "check your arithmetic".
    expect(fb.text).toContain(advice);
  });

  it('a generic diagnosis is not dressed up as a repeated mistake', () => {
    const exercise = exerciseOf('w1-l3-e1'); // 6 + 7 = 13
    const generic = gradeAnswer(exercise, '9');
    expect(generic.misconception).toBe('arithmetic');
    const fb = feedbackOnMistake(
      context(exercise, {
        lastGrade: generic,
        conceptAttempts: [
          attempt({ conceptId: exercise.conceptId, misconception: 'sign-error' }),
          attempt({ conceptId: exercise.conceptId, misconception: 'sign-error' }),
        ],
      }),
    );
    expect(fb.text).not.toMatch(/same idea tripped us up/i);
    expect(fb.misconceptionText).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Hints and worked examples do not contradict themselves or give the answer away
// ---------------------------------------------------------------------------
describe('hints and worked examples', () => {
  it('the worked example opens with a nudge, not the finished solution', () => {
    const exercise = exerciseOf('w1-l3-e1'); // 6 + 7 = 13
    const worked = requestHint(context(exercise), exercise.hints.length);
    expect(worked.kind).toBe('worked-example');
    expect(worked.workedSteps!.length).toBeGreaterThan(1);
    // The solution used to be line two (right after "Start from: 6 + 7"), so the answer arrived
    // before a single line of reasoning. It must now come after at least one nudge.
    expect(worked.workedSteps!.slice(0, 2)).not.toContain(exercise.solution);
    expect(worked.workedSteps!.join(' ')).toContain(exercise.solution);
  });

  it('the "substitute it back" tip only appears when there is a variable to substitute', () => {
    const arithmetic = exerciseOf('w1-l3-e1');
    const plain = requestHint(context(arithmetic), arithmetic.hints.length);
    expect(plain.workedSteps!.join(' ')).not.toMatch(/substituting it back/i);
    // A question that evaluates an expression with a variable can be checked that way.
    const algebraic = exerciseOf('w3-l2-e1'); // 2x + 3 with x = 4
    const withVar = requestHint(context(algebraic), algebraic.hints.length);
    expect(withVar.workedSteps!.join(' ')).toMatch(/substitut/i);
  });

  it('a balance follow-up is not asked under plain arithmetic', () => {
    // Follow-ups are chosen by misconception id, which is global; asking "what did you change on
    // the left side?" under 6 + 7 describes work the learner never did.
    const arithmetic = exerciseOf('w1-l3-e1');
    const generic = gradeAnswer(arithmetic, '9');
    expect(followUpQuestion(generic.misconception, context(arithmetic))).not.toMatch(/both sides|left side|right side/i);
    const equation = exerciseOf('w4-l2-e1');
    const equationSlip = gradeAnswer(equation, 'x=14', { variableValue: Rational.of(6) });
    expect(followUpQuestion(equationSlip.misconception, context(equation))).toMatch(/undo/i);
  });

  it('every free hint is text the learner has not already been shown', () => {
    for (const lesson of CURRICULUM.lessons) {
      for (const exercise of lesson.exercises) {
        exercise.hints.forEach((hint, i) => {
          expect(hint.trim(), `${exercise.id} hint ${i} is empty`).not.toBe('');
          // A hint must not simply repeat the previous one.
          expect(exercise.hints.indexOf(hint), `${exercise.id} repeats a hint verbatim`).toBe(i);
        });
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Authored content is mathematically self-consistent
// ---------------------------------------------------------------------------
describe('authored content', () => {
  it('every numeric exercise accepts its own stored answer', () => {
    for (const lesson of CURRICULUM.lessons) {
      for (const exercise of lesson.exercises) {
        const accepted = Array.isArray(exercise.answer) ? exercise.answer : [exercise.answer];
        for (const answer of accepted) {
          expect(gradeAnswer(exercise, answer).correct, `${exercise.id} rejects its own answer ${answer}`).toBe(true);
        }
      }
    }
  });

  it('a numerator blank’s solution names the blank value, not the completed fraction', () => {
    // w2-l4-e2: "1/3 = ?/9". The solution ended "1/3 = 3/9", so a learner reading the last
    // "= number" was told the answer was 3/9 while the app wanted 3.
    const exercise = exerciseOf('w2-l4-e2');
    const firstSentence = exercise.solution.split(/(?<=\.)\s+/)[0];
    const lastEquation = [...firstSentence.matchAll(/=\s*(-?\d+(?:\s*\/\s*\d+)?)\s*\.?$/g)].pop();
    expect(lastEquation, 'the fixture solution shape changed').not.toBeUndefined();
    // The quoted result is the completed fraction (3/9), not the blank: the follow-up sentence
    // must therefore name the blank explicitly, and 3/9 must not be accepted as the answer.
    const claim = lastEquation![1].replace(/\s/g, '');
    expect(gradeAnswer(exercise, claim).correct).toBe(false);
    expect(exercise.solution).toContain('The blank is 3');
  });

  it('a balance question asks for the quantity to add, not for a sentence', () => {
    // "What must I do…?" invited "add 4 to the right side", which the numeric box cannot take;
    // the accepted answer is the amount, 4.
    const exercise = exerciseOf('w4-l1-e3');
    expect(exercise.answer).toBe('4');
    expect(exercise.prompt).toMatch(/how much must I add to the right side/i);
    expect(exercise.prompt).not.toMatch(/what must I do/i);
  });
});

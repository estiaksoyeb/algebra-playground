import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExerciseCard } from '../components/ExerciseCard';
import { insertFractionSlash, readFraction, wantsFractionInput } from '../components/fractionAnswer';
import { LESSON_BY_ID } from '../content/curriculum';
import { Exercise } from '../content/types';

afterEach(() => cleanup());

const exercise = (id: string): Exercise => {
  for (const lesson of Object.values(LESSON_BY_ID)) {
    const found = [...lesson.exercises, ...(lesson.reviewExercises ?? []), ...(lesson.masteryCheck ?? [])].find((e) => e.id === id);
    if (found) return found;
  }
  throw new Error(`no exercise ${id}`);
};

function renderCard(ex: Exercise) {
  const submitted: { answer: string; correct: boolean }[] = [];
  render(
    <ExerciseCard
      exercise={ex}
      attemptsOnExercise={0}
      hintsShown={0}
      conceptAttempts={[]}
      onHint={() => {}}
      onSubmit={(input) => {
        submitted.push({ answer: input.answer, correct: input.correct });
        return true;
      }}
    />,
  );
  return submitted;
}

describe('fraction answers are typeable', () => {
  it('asks for a text keyboard, not the slash-less decimal keypad, on every fraction exercise', () => {
    // The reported bug: "write your answer as a/b" but the phone keypad offers no "/".
    const fractionExercises = Object.values(LESSON_BY_ID)
      .flatMap((l) => [...l.exercises, ...(l.reviewExercises ?? []), ...(l.masteryCheck ?? [])])
      .filter((ex) => (Array.isArray(ex.answer) ? ex.answer : [ex.answer]).some((a) => String(a).includes('/')));
    expect(fractionExercises.length).toBeGreaterThan(0);
    for (const ex of fractionExercises) {
      expect(wantsFractionInput(ex), ex.id).toBe(true);
      renderCard(ex);
      const input = screen.getByTestId('answer-input');
      expect(input.getAttribute('inputmode'), ex.id).toBe('text');
      expect(screen.getByTestId('fraction-slash')).toBeInTheDocument();
      cleanup();
    }
  });

  it('the world 2 question can be answered with the on-screen fraction key', async () => {
    const user = userEvent.setup();
    const ex = exercise('w2-l4-e1');
    const submitted = renderCard(ex);
    const input = screen.getByTestId('answer-input');
    expect(input.getAttribute('inputmode')).toBe('text');
    expect(input).toHaveAttribute('placeholder', 'e.g. 3/4');

    await user.type(input, '3');
    // The key adds the "/" that a numeric keypad cannot type.
    await user.click(screen.getByTestId('fraction-slash'));
    expect(input).toHaveValue('3/');
    await user.type(input, '4');
    expect(input).toHaveValue('3/4');
    // A single fraction needs one slash only: the key steps aside afterwards.
    expect(screen.getByTestId('fraction-slash')).toBeDisabled();

    await user.click(screen.getByTestId('submit-answer'));
    expect(submitted).toEqual([{ answer: '3/4', correct: true }]);
  });

  it('a slash typed straight into the box still grades correctly', async () => {
    const user = userEvent.setup();
    const submitted = renderCard(exercise('w2-l4-e1'));
    await user.type(screen.getByTestId('answer-input'), '3/4');
    await user.click(screen.getByTestId('submit-answer'));
    expect(submitted[0]).toMatchObject({ correct: true });
  });

  it('leaves whole-number answers on the friendly decimal keypad without a fraction key', () => {
    renderCard(exercise('w1-l1-e1'));
    expect(screen.getByTestId('answer-input').getAttribute('inputmode')).toBe('decimal');
    expect(screen.queryByTestId('fraction-slash')).not.toBeInTheDocument();
  });

  it('offers fraction help when the answer contains a fraction, for equations too', () => {    // "2x = 3" is answered "x=3/2": the slash is part of the answer, so a numeric keypad fails here too.
    renderCard(exercise('w4-l5-e4'));
    expect(screen.getByTestId('answer-input').getAttribute('inputmode')).toBe('text');
    expect(screen.getByTestId('fraction-slash')).toBeInTheDocument();
  });

  it('keeps fraction help when the question shows a fraction but the answer is a whole number', () => {
    // "1/3 = ?/9" is answered "3": no fraction in the answer, so the decimal keypad stays.
    renderCard(exercise('w2-l4-e2'));
    expect(screen.getByTestId('answer-input').getAttribute('inputmode')).toBe('decimal');
    expect(screen.queryByTestId('fraction-slash')).not.toBeInTheDocument();
  });

  it('inserts the slash at the cursor and never allows two of them', () => {
    expect(insertFractionSlash('', null, null)).toBe('/');
    expect(insertFractionSlash('3', 1, 1)).toBe('3/');
    expect(insertFractionSlash('34', 1, 1)).toBe('3/4');
    expect(insertFractionSlash('3/4', 3, 3)).toBeNull();
    expect(insertFractionSlash('1/2', null, null)).toBeNull();
  });

  it('reads a typed fraction aloud as "3 over 4"', () => {
    expect(readFraction('3/4')).toBe('3 over 4');
    expect(readFraction('x=3/2')).toBe('x=3 over 2');
    expect(readFraction('3')).toBeNull();
  });
});

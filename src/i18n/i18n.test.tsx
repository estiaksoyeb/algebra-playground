import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { changeLanguage, i18n, LANGUAGE_STORAGE_KEY, formatDate, formatDateTime, numberLocale } from './index';
import { normalizeMathInput, hasBengaliNumerals } from './normalizeMathInput';
import { en } from './locales/en';
import { bn } from './locales/bn';
import { bnCurriculum } from './locales/bn/curriculum';
import { CURRICULUM, localizedLesson, localizedWorld, localizedConcept } from '../content/curriculum';
import { gradeAnswer } from '../engine/grading';
import { localizeLesson } from './curriculum';
import { AppHeader } from '../ui/Shell';
import { ExerciseCard } from '../components/ExerciseCard';

/** Every string leaf in an object, with its key path, for the ASCII-number guard. */
function leaves(value: unknown, path = ''): { path: string; text: string }[] {
  if (typeof value === 'string') return [{ path, text: value }];
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  }
  return [];
}

beforeEach(async () => {
  await changeLanguage('en');
});

afterEach(() => {
  cleanup();
});

describe('language switching', () => {
  it('starts in English so the rest of the suite is unaffected', () => {
    expect(i18n.language).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('switching to Bengali re-renders the header, updates <html lang> and persists the choice', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/';
    render(<AppHeader saveStatus="saved" />);

    expect(screen.getAllByRole('link', { name: 'Learn' }).length).toBeGreaterThan(0);
    const toggle = screen.getByTestId('language-toggle');
    expect(toggle).toHaveAttribute('data-lang', 'en');

    await user.click(toggle);

    await waitFor(() => expect(i18n.language).toBe('bn'));
    // The visible nav label changed to Bengali…
    expect(screen.getAllByRole('link', { name: 'শিখুন' }).length).toBeGreaterThan(0);
    // …the toggler now offers English…
    expect(screen.getByTestId('language-toggle')).toHaveAttribute('data-lang', 'bn');
    expect(screen.getByTestId('language-toggle')).toHaveTextContent('EN');
    // …and both the document and storage agree.
    expect(document.documentElement.lang).toBe('bn');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('bn');

    // Switching back restores English and the stored value.
    await user.click(screen.getByTestId('language-toggle'));
    await waitFor(() => expect(i18n.language).toBe('en'));
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
  });
});

describe('Bengali catalogue', () => {
  it('covers every English key so no Bengali screen falls back to a raw key path', () => {
    const enKeys = leaves(en).map((l) => l.path).sort();
    const bnKeys = new Set(leaves(bn).map((l) => l.path));
    const missing = enKeys.filter((k) => !bnKeys.has(k));
    expect(missing).toEqual([]);
  });

  it('never uses Bengali numerals in any UI string', () => {
    const offending = leaves(bn).filter((l) => hasBengaliNumerals(l.text));
    expect(offending.map((o) => o.path)).toEqual([]);
    const curriculumOffending = leaves(bnCurriculum).filter((l) => hasBengaliNumerals(l.text));
    expect(curriculumOffending.map((o) => o.path)).toEqual([]);
  });
});

describe('Bengali curriculum overlay', () => {
  const authored = CURRICULUM.lessons.filter((l) => /^w[1-7]-/.test(l.id));

  it('translates the prose of every World 1–7 lesson', () => {
    for (const source of authored) {
      const lesson = localizedLesson(source.id, 'bn');
      expect(lesson).toBeDefined();
      // Prose is Bengali…
      expect(lesson!.title).not.toBe(source.title);
      expect(/[\u0980-\u09FF]/.test(lesson!.title)).toBe(true);
      // …while identity and maths are untouched.
      expect(lesson!.id).toBe(source.id);
      expect(lesson!.exercises.map((e) => e.id)).toEqual(source.exercises.map((e) => e.id));
      for (const [i, ex] of lesson!.exercises.entries()) {
        expect(ex.math, `${source.id}/${ex.id}`).toBe(source.exercises[i].math);
        expect(ex.answer, `${source.id}/${ex.id}`).toBe(source.exercises[i].answer);
        expect(ex.kind, `${source.id}/${ex.id}`).toBe(source.exercises[i].kind);
      }
    }
  });

  it('contains no Bengali numerals in World 1–7 maths, steps or exercise mathematics', () => {
    for (const source of authored) {
      const lesson = localizedLesson(source.id, 'bn')!;
      const symbolic = [
        ...lesson.steps.flatMap((s) => [s.math ?? '', s.visual ? JSON.stringify(s.visual.initialState) : '']),
        ...lesson.exercises.flatMap((e) => [e.math ?? '', String(e.answer), ...(e.choices ?? [])]),
      ];
      for (const text of symbolic) {
        expect(hasBengaliNumerals(text), `${source.id}: ${text}`).toBe(false);
      }
    }
  });

  it('keeps Bengali prose numerals in ASCII form', () => {
    for (const source of authored) {
      const lesson = localizedLesson(source.id, 'bn')!;
      const prose = [
        lesson.title,
        lesson.summary,
        ...lesson.objectives,
        ...lesson.steps.flatMap((s) => [s.title, s.body, s.callout?.text ?? '']),
        ...[...lesson.exercises, ...(lesson.reviewExercises ?? []), ...(lesson.masteryCheck ?? [])].flatMap((e) => [
          e.prompt,
          e.solution,
          ...e.hints,
        ]),
        ...lesson.misconceptions.flatMap((m) => [m.description, m.feedback]),
      ];
      for (const text of prose) {
        expect(hasBengaliNumerals(text), `${source.id}: ${text}`).toBe(false);
      }
    }
  });

  it('names all seven worlds in Bengali without touching their ids or numbers', () => {
    const worlds = [...CURRICULUM.worlds].sort((a, b) => a.number - b.number);
    expect(worlds).toHaveLength(7);
    for (const source of worlds) {
      const world = localizedWorld(source, 'bn');
      expect(world.id).toBe(source.id);
      expect(world.number).toBe(source.number);
      expect(world.title).not.toBe(source.title);
      expect(hasBengaliNumerals(world.title)).toBe(false);
    }
  });

  it('falls back to English for a lesson with no Bengali prose at all', () => {
    // All 36 lessons are translated now, so the fallback is proved on a synthetic lesson
    // with the same shape. Falling back is what keeps a half-finished language usable.
    const base = CURRICULUM.lessons.find((l) => l.id === 'w7-l6-quadratic-graphs')!;
    const untranslated = { ...base, id: 'zz-untranslated-lesson' };
    const lesson = localizeLesson(untranslated, 'bn');
    expect(lesson.title).toBe(base.title);
    expect(lesson.summary).toBe(base.summary);
    expect(lesson.steps.map((s) => s.body)).toEqual(base.steps.map((s) => s.body));
    expect(lesson.exercises.map((e) => e.prompt)).toEqual(base.exercises.map((e) => e.prompt));
    // Nothing is invented and no key leaks: the source object comes back as it was.
    expect(lesson).toBe(untranslated);
  });

  it('translates concept names while keeping ids stable', () => {
    for (const concept of CURRICULUM.concepts) {
      const localized = localizedConcept(concept, 'bn');
      expect(localized.id).toBe(concept.id);
      expect(hasBengaliNumerals(localized.name)).toBe(false);
    }
  });

  it('translates the no-hint mastery check prompts of all seven worlds without touching their maths', () => {
    for (const source of authored) {
      const lesson = localizedLesson(source.id, 'bn')!;
      const sourceCheck = source.masteryCheck ?? [];
      expect(sourceCheck.length, source.id).toBeGreaterThan(0);
      for (const [i, check] of lesson.masteryCheck!.entries()) {
        expect(/[\u0980-\u09FF]/.test(check.prompt), `${source.id}: ${check.prompt}`).toBe(true);
        expect(check.math, `${source.id}/${check.id}`).toBe(sourceCheck[i].math);
        expect(check.answer, `${source.id}/${check.id}`).toBe(sourceCheck[i].answer);
        expect(hasBengaliNumerals([check.math ?? '', check.prompt, check.solution].join(' ')), check.id).toBe(false);
      }
    }
  });
});

describe('word-based choice options', () => {
  /** The World 3 lesson whose options are sentences, localized. */
  const choiceLesson = () => localizedLesson('w3-l1-variables', 'bn')!;
  const choiceExercise = () => choiceLesson().exercises.find((e) => e.id === 'w3-l1-e4')!;

  it('localizes the overlay without touching the canonical options the grader compares', () => {
    const ex = choiceExercise();
    const source = CURRICULUM.lessons.find((l) => l.id === 'w3-l1-variables')!.exercises.find((e) => e.id === 'w3-l1-e4')!;
    expect(ex.choices).toEqual(source.choices);
    expect(ex.answer).toBe(source.answer);
    // Every word option has a Bengali label; the labels are prose, the options are not.
    for (const choice of ex.choices!) {
      expect(ex.choiceLabels?.[choice], choice).toBeTruthy();
      expect(/[\u0980-\u09FF]/.test(ex.choiceLabels![choice]), choice).toBe(true);
    }
  });

  it('shows the Bengali label but submits the canonical English option for grading', async () => {
    await changeLanguage('bn');
    const user = userEvent.setup();
    const ex = choiceExercise();
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

    const correctIndex = ex.choices!.indexOf(ex.answer as string);
    const button = screen.getByTestId(`choice-${ex.id}-${correctIndex}`);
    // What the learner reads is Bengali…
    expect(button).toHaveTextContent(ex.choiceLabels![ex.answer as string]);
    expect(button.textContent ?? '').not.toContain(ex.answer as string);
    // …and the maths a wrong option mentions is still ASCII, never Bengali digits.
    expect(hasBengaliNumerals(button.textContent ?? '')).toBe(false);

    await user.click(button);
    await waitFor(() => expect(submitted).toHaveLength(1));
    // …but grading still receives the canonical option, so the answer is marked correct.
    expect(submitted[0].answer).toBe(ex.answer);
    expect(submitted[0].correct).toBe(true);
    expect(gradeAnswer(ex, submitted[0].answer).correct).toBe(true);
  });

  it('leaves pure maths options alone', () => {
    for (const [lessonId, exerciseId] of [
      ['w5-l2-distributive', 'w5-l2-e5'],
      ['w6-l4-slope', 'w6-l4-e3'],
      ['w7-l2-inequalities', 'w7-l2-e3'],
    ] as const) {
      const ex = localizedLesson(lessonId, 'bn')!.exercises.find((e) => e.id === exerciseId)!;
      expect(ex.kind).toBe('choice');
      expect(ex.choiceLabels, `${exerciseId} should have no labels`).toBeUndefined();
    }
  });
});

describe('dates keep ASCII digits', () => {
  const when = new Date('2026-03-09T18:04:00Z');

  it('formats Bengali dates and times with 0-9, never ০-৯', () => {
    for (const text of [formatDateTime(when, 'bn'), formatDate(when, 'bn'), formatDateTime(when, 'en')]) {
      expect(text.length).toBeGreaterThan(0);
      expect(hasBengaliNumerals(text), text).toBe(false);
      expect(/[0-9]/.test(text), text).toBe(true);
    }
  });

  it('pins Bengali to the Latin numbering system so digits can never localise', () => {
    expect(numberLocale('bn')).toBe('bn-BD-u-nu-latn');
    expect(numberLocale('en')).toBe('en');
    expect(numberLocale('fr')).toBe('en');
    // Whatever the month name, the digits in a Bengali date are the same ASCII digits.
    expect(formatDate(when, 'bn')).toContain('2026');
  });
});

describe('Bengali keyboard input', () => {
  it('normalizes Bengali digits to ASCII', () => {
    expect(normalizeMathInput('১৪')).toBe('14');
    expect(normalizeMathInput('০১২৩৪৫৬৭৮৯')).toBe('0123456789');
    // Variables and operators are untouched.
    expect(normalizeMathInput('২x + ৩')).toBe('2x + 3');
    expect(normalizeMathInput('')).toBe('');
  });

  it('grades a Bengali-typed answer as correct without changing displayed maths', () => {
    const exercise = {
      id: 'test-bn-digits',
      conceptId: 'counting',
      kind: 'numeric' as const,
      prompt: 'What is 9 + 5?',
      math: '9 + 5 = \\boxed{?}',
      answer: '14',
      solution: '9 + 5 = 14',
      hints: [],
      difficulty: 1 as const,
      variety: 'add',
    };
    const graded = gradeAnswer(exercise, '১৪');
    expect(graded.correct).toBe(true);
    // The exercise's own maths is still ASCII: normalisation only ever touches input.
    expect(hasBengaliNumerals(exercise.math)).toBe(false);
  });
});

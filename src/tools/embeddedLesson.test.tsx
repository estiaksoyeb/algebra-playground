import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EvaluatorPanel } from './panels/EvaluatorPanel';
import { TilesPanel } from './panels/TilesPanel';
import { ToolWorkspaceEmbedded } from './ToolWorkspaceEmbedded';
import { stateFromRaw, symbolicFor } from './toolState';
import { EvalState } from './expressions';
import { TilesState } from './tiles';
import { NumberLineState, numberLineModel } from './numberline';
import { CURRICULUM, LESSON_BY_ID } from '../content/curriculum';
import { LessonStep } from '../content/types';

/**
 * Batch A: lesson-embedded tools must teach the step they sit in.
 *
 * The reported defects were all "the tool disagrees with the lesson": a numbers example
 * asked for x = 4, a multiplication array was titled "Algebra tiles", and a number line
 * showed a different sum than the step's equation. These tests pin the fixes at the
 * component level, plus the exact equation for every retuned number-line step.
 */

const noop = () => {};
const evalState = (expression: string): EvalState => stateFromRaw('evaluator', { expression, x: 4 }) as EvalState;

describe('EvaluatorPanel in a numbers-only lesson step', () => {
  it('shows a Result, not a value at x, for 2 + 3 * 4', () => {
    render(<EvaluatorPanel embedded state={evalState('2 + 3 * 4')} onChange={noop} mode="evaluate" />);
    expect(screen.getByText('Result')).toBeTruthy();
    expect(screen.queryByText(/Value at x =/)).toBeNull();
    expect(screen.queryByText(/Substituting x =/)).toBeNull();
    expect(screen.queryByText('Value of x')).toBeNull();
    expect(screen.queryByRole('button', { name: /^x = / })).toBeNull();
    expect(screen.getByTestId('evaluator-result').textContent).toBe('Evaluating 2 + 3*4 gives 14.');
  });

  it('does not mention letters in the description, hint or example', () => {
    render(<EvaluatorPanel embedded state={evalState('2 + 3 * 4')} onChange={noop} mode="evaluate" />);
    const card = screen.getByTestId('evaluator-strip').closest('.stack')! as HTMLElement;
    expect(card.textContent).toContain('using the order of operations');
    expect(card.textContent).toContain('Use numbers, + − × ÷ ^ and brackets');
    // The single-letter example button belongs to letter lessons only.
    expect(screen.queryByRole('button', { name: /3\(x \+ 2\)/ })).toBeNull();
  });

  it('lets the learner compare 2 + 3 * 4 (14) with (2 + 3) * 4 (20)', async () => {
    const changes: EvalState[] = [];
    render(<EvaluatorPanel embedded state={evalState('2 + 3 * 4')} onChange={(s) => changes.push(s)} mode="evaluate" />);
    expect(screen.getByTestId('evaluator-without-brackets').getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(screen.getByTestId('evaluator-with-brackets'));
    expect(changes[changes.length - 1]?.expression).toBe('(2 + 3) * 4');
  });

  it('shows both results when re-rendered with each bracket arrangement', () => {
    const { unmount } = render(<EvaluatorPanel embedded state={evalState('2 + 3 * 4')} onChange={noop} mode="evaluate" />);
    expect(screen.getByTestId('evaluator-result').textContent).toContain('gives 14');
    unmount();
    render(<EvaluatorPanel embedded state={evalState('(2 + 3) * 4')} onChange={noop} mode="evaluate" />);
    expect(screen.getByTestId('evaluator-result').textContent).toContain('gives 20');
    expect(screen.getByText('Result')).toBeTruthy();
  });

  it('walks through the order of operations step by step', () => {
    render(<EvaluatorPanel embedded state={evalState('2 + 3 * 4')} onChange={noop} mode="evaluate" />);
    const steps = screen.getAllByTestId('evaluator-step').map((el) => el.textContent);
    expect(steps).toEqual(['3 × 4 = 12', '2 + 3 × 4 = 14']);
  });

  it('keeps the value-of-x controls when the expression really has a letter', () => {
    render(<EvaluatorPanel embedded state={evalState('2x + 3')} onChange={noop} mode="evaluate" />);
    expect(screen.getByText('Value of x')).toBeTruthy();
    expect(screen.getByText('Value at x = 4')).toBeTruthy();
    expect(screen.queryByTestId('evaluator-result')!.textContent).toMatch(/^Substituting x = 4/);
    expect(screen.queryByTestId('evaluator-without-brackets')).toBeNull();
  });

  it('drops the developer parser notes from the embedded panel but keeps them in the playground', () => {
    const { unmount } = render(<EvaluatorPanel embedded state={evalState('2 + 3 * 4')} onChange={noop} mode="evaluate" />);
    expect(screen.queryByText('How it works')).toBeNull();
    unmount();
    render(<EvaluatorPanel state={evalState('2 + 3 * 4')} onChange={noop} mode="evaluate" />);
    expect(screen.getByText('How it works')).toBeTruthy();
    const text = document.body.textContent ?? '';
    // Learner-friendly wording: no security talk, no "polynomial-style" restriction.
    expect(text).not.toMatch(/safe expression parser|never executed as code/i);
    expect(text).not.toMatch(/polynomial-style/i);
    expect(text).toMatch(/standard order of operations/);
    expect(text).toMatch(/exact fractions/);
  });
});

describe('TilesPanel in an embedded lesson', () => {
  const tiles = (layout: TilesState['layout']): TilesState => stateFromRaw('tiles', { layout }) as TilesState;

  it.each([
    ['array', 'Multiplication array', 'Rows and columns of unit squares'],
    ['groups', 'Equal groups', 'Items shared equally into groups'],
    ['fraction', 'Fraction bar', 'Equal parts of a whole bar'],
  ] as const)('titles the %s layout accurately and never exposes x', (layout, title, description) => {
    render(<TilesPanel embedded state={tiles(layout)} onChange={noop} />);
    const text = document.body.textContent ?? '';
    expect(text).toContain(title);
    expect(text).toContain(description);
    expect(text).not.toContain('Algebra tiles');
    expect(text).not.toMatch(/Long tiles/);
    // No layout switcher: a World 1/2 step stays on the layout it is teaching.
    expect(screen.queryByRole('tablist', { name: 'Tile layout' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Algebra tiles' })).toBeNull();
  });

  it('keeps the switcher and the tile explanation in the standalone playground', () => {
    render(<TilesPanel state={tiles('array')} onChange={noop} />);
    expect(screen.getByRole('tablist', { name: 'Tile layout' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Algebra tiles' })).toBeTruthy();
    expect(document.body.textContent).toContain('Multiplication array');
  });
});

describe('the embedded tool stays quiet', () => {
  it('has Undo/Redo/Reset and no raw state line or playground hand-off', () => {
    const start = stateFromRaw('numberline', { value: 12, min: 0, max: 20, addend: 5 });
    const { container } = render(<ToolWorkspaceEmbedded tool="numberline" initial={start} />);
    const bar = container.querySelector('.embedded-tool-bar')!;
    expect(bar.textContent).toContain('Undo');
    expect(bar.textContent).toContain('Redo');
    expect(bar.textContent).toContain('Reset');
    expect(container.querySelector('.embedded-tool-note')).toBeNull();
    expect(container.textContent).not.toMatch(/Open in the playground|Open this tool in the playground/);
    // The state summary is still available to assistive technology.
    expect(container.querySelector('[data-testid="embedded-tool-summary"]')!.textContent).toBeTruthy();
    // And the duplicate "Number line … The marker is at …" card is gone in a lesson.
    expect(container.textContent).not.toContain('The marker is at');
  });

  it('Reset returns the tool to the lesson starting state', async () => {
    const start = stateFromRaw('numberline', { value: 12, min: 0, max: 20, addend: 5 });
    const { container } = render(<ToolWorkspaceEmbedded tool="numberline" initial={start} />);
    const symbolic = () => container.querySelector('.equation-strip')?.textContent ?? '';
    expect(symbolic()).toContain('7+5=12');
    // One step changes the jump shown, so Reset has something real to undo.
    await userEvent.click(screen.getByRole('button', { name: 'Step right' }));
    expect(symbolic()).not.toContain('7+5=12');
    await userEvent.click(screen.getByRole('button', { name: 'Reset tool' }));
    expect(symbolic()).toContain('7+5=12');
  });
});

describe('retuned number-line lesson states', () => {
  /** Every visual of the given lesson, as the runner builds it. */
  const visuals = (lessonId: string) =>
    (LESSON_BY_ID[lessonId].steps as LessonStep[]).filter((s): s is LessonStep & { visual: NonNullable<LessonStep['visual']> } => Boolean(s.visual));

  /**
   * The step whose number line shows the lesson's equation (the world-1 addition lesson
   * has two, so the caller says which by its expected equation).
   */
  const equation = (lessonId: string, expected: string) => {
    const matching = visuals(lessonId)
      .filter((s) => s.visual.tool === 'numberline')
      .map((s) => stateFromRaw('numberline', s.visual.initialState ?? {}) as NumberLineState)
      .map((state) => symbolicFor('numberline', state).text);
    expect(matching, `${lessonId} must show ${expected}`).toContain(expected);
    return expected;
  };

  it.each([
    ['w1-l3-addition', '7 + 5 = 12'],
    ['w1-l3-addition', '5 + 7 = 12'],
    ['w1-l4-subtraction', '12 - 5 = 7'],
    ['w2-l2-adding-negatives', '5 + 3 = 8'],
    ['w2-l6-decimals', '0.7 + 0.5 = 1.2'],
  ] as const)('%s has a number line reading %s', (lessonId, expected) => {
    expect(equation(lessonId, expected)).toBe(expected);
  });

  it('gives the tens lesson a jump of 10 and marks 43 from 40', () => {
    const visual = visuals('w1-l2-place-value')[0].visual;
    const state = stateFromRaw('numberline', visual.initialState ?? {}) as NumberLineState;
    expect(state.jump?.toString()).toBe('10');
    expect(state.value.toString()).toBe('40');
    expect(state.mark?.toString()).toBe('43');
    // The lesson's own claim must match the button, not just the data.
    render(<ToolWorkspaceEmbedded tool="numberline" initial={state} />);
    expect(screen.getByTestId('jump-right').textContent).toContain('Jump +10');
    expect(screen.getByTestId('jump-left').textContent).toContain('Jump −10');
  });

  it('describes the reference marker button by its real label', () => {
    const state = stateFromRaw('numberline', { value: 3, min: 0, max: 10 }) as NumberLineState;
    expect(numberLineModel.describe(state).lines.join(' ')).toContain('Tap "Mark here"');
  });
});

describe('World 1 copy does not leak later-world variables', () => {
  it('keeps no letter-variable jargon in the World 1 misconception list', () => {
    const w1 = CURRICULUM.lessons.filter((l) => l.id.startsWith('w1-'));
    for (const lesson of w1) {
      for (const m of lesson.misconceptions ?? []) {
        expect(m.description, `${lesson.id}/${m.id}`).not.toMatch(/x²|\b2x\b/);
      }
    }
  });

  it('does not tell learners to drag a control that is not draggable', () => {
    for (const lesson of CURRICULUM.lessons) {
      for (const step of lesson.steps) {
        const text = `${step.body ?? ''} ${step.callout?.text ?? ''}`;
        if (step.visual?.tool === 'balance') expect(text, lesson.id).not.toMatch(/drag/i);
        if (step.visual?.tool === 'numberline') expect(text, lesson.id).not.toMatch(/drag/i);
      }
    }
  });
});

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CURRICULUM, LESSON_BY_ID } from '../content/curriculum';
import { LessonStep } from '../content/types';
import { StepVisual } from '../components/StepVisual';
import { stateFromRaw, symbolicFor } from '../tools/toolState';
import { ToolId } from '../tools/types';
import { AreaState, deriveAreaState } from '../tools/expressions';
import { GraphState, graphModel, quadraticRoots, quadraticVertex, systemSolution } from '../tools/graph';
import { MysteryState, mysteryModel, mysterySolved } from '../tools/mystery';
import { TOOL_META } from '../tools/registry';

/**
 * Batch B: every lesson picture must agree with the words next to it.
 *
 * These are the mismatches a static curriculum check cannot see, because both halves are
 * individually valid — the lesson says 6x + 9 and the picture shows 4x + 6; the lesson
 * says the lines cross at (3, 2) and the graph draws two parallel lines.
 */

type VisualStep = LessonStep & { visual: NonNullable<LessonStep['visual']> };

/** Every step in the curriculum that mounts a tool, with its lesson id. */
function visualSteps(): { lessonId: string; step: VisualStep }[] {
  const out: { lessonId: string; step: VisualStep }[] = [];
  for (const lesson of CURRICULUM.lessons) {
    for (const step of lesson.steps) {
      if (step.visual) out.push({ lessonId: lesson.id, step: step as VisualStep });
    }
  }
  return out;
}

/** The state the app actually builds for a step, through the same validated path as lessons. */
function stateOf(lessonId: string, stepIndex: number) {
  const step = LESSON_BY_ID[lessonId].steps[stepIndex] as VisualStep;
  expect(step.visual, `${lessonId} step ${stepIndex} must have a visual`).toBeTruthy();
  return { tool: step.visual.tool, raw: step.visual.initialState ?? {} };
}

const area = (lessonId: string, stepIndex: number) => {
  const { tool, raw } = stateOf(lessonId, stepIndex);
  expect(tool).toBe('area');
  const state = stateFromRaw('area', raw) as AreaState;
  return { state, derived: deriveAreaState(state), text: symbolicFor('area', state).text };
};

const graph = (lessonId: string, stepIndex: number) => {
  const { tool, raw } = stateOf(lessonId, stepIndex);
  expect(tool).toBe('graph');
  const state = stateFromRaw('graph', raw) as GraphState;
  return { state, text: graphModel.symbolic(state).text };
};

describe('World 5 area model matches the distributive property', () => {
  it.each([0, 1])('w5-l2 step %i shows 2(x + 3) = 2x + 6, not 2x + 4', (i) => {
    const { state, derived, text } = area('w5-l2-distributive', i);
    expect(state.mode).toBe('distribute');
    expect(text).toContain('2(x + 3)');
    expect(text).toContain('2x + 6');
    expect(text).not.toContain('2x + 4');
    expect(derived.cells.map((c) => c.product)).toEqual(['2x', '6']);
  });

  it('w5-l3 step 1 shows how 6x + 9 shares the height 3 (3(2x + 3))', () => {
    const { state, derived, text } = area('w5-l3-factoring', 0);
    expect(state.mode).toBe('distribute');
    expect(state.a).toBe('3');
    expect(text).toContain('3(2x + 3)');
    expect(text).toContain('6x + 9');
    expect(derived.cells.map((c) => c.product)).toEqual(['6x', '9']);
  });

  it('w5-l4 step 1 shows the four partial products of (x + 1)(x + 2)', () => {
    const { state, derived, text } = area('w5-l4-binomials', 0);
    expect(state.mode).toBe('binomial');
    expect(text).toContain('(x+1)(x+2)');
    expect(text).toContain('x^2 + 3x + 2');
    expect(derived.cells.map((c) => c.product)).toEqual(['x^2', '2x', 'x', '2']);
  });

  it('w7-l5 step 1 uses BOTH factors: (x + 2)(x + 3) = x² + 5x + 6', () => {
    const { state, text } = area('w7-l5-quadratics', 0);
    expect(state.b).toBe('x+3');
    expect(text).toContain('(x+2)(x+3)');
    expect(text).toContain('x^2 + 5x + 6');
    expect(text).not.toContain('x^2 + 4x + 4');
  });
});

describe('World 7 graphs match the equations in the text', () => {
  it.each([0, 1])('w7-l3 step %i draws lines crossing at (3, 2)', (i) => {
    const { state, text } = graph('w7-l3-simultaneous', i);
    expect(state.mode).toBe('system');
    expect(state.m).not.toBe(state.m2);
    expect(systemSolution(state)).toEqual({ x: 3, y: 2 });
    // y = -x + 5 and y = x - 1: the two lines of x + y = 5 and x - y = 1.
    expect(text).toContain('−x + 5');
    expect(text).toContain('x − 1');
  });

  it('w7-l6 step 1 shows y = x² with its vertex at (0, 0)', () => {
    const { state, text } = graph('w7-l6-quadratic-graphs', 0);
    expect(text).toBe('y = x²');
    expect(text).not.toContain('^2^2');
    expect(quadraticVertex(state)).toEqual({ x: 0, y: 0 });
    expect(state.m).toBe(0);
  });

  it('w7-l6 step 2 plots a parabola whose vertex is (2, 1)', () => {
    const { state, text } = graph('w7-l6-quadratic-graphs', 1);
    expect(text).toBe('y = x² − 4x + 5');
    expect(quadraticVertex(state)).toEqual({ x: 2, y: 1 });
    // The lesson writes the vertex form; the graph shows the equivalent standard form.
    expect(LESSON_BY_ID['w7-l6-quadratic-graphs'].steps[1].math).toContain('(x-2)^2 + 1');
  });

  it('w7-l6 step 3 shows the roots the text claims, x = −2 and x = 2', () => {
    const { state, text } = graph('w7-l6-quadratic-graphs', 2);
    expect(text).toBe('y = x² − 4');
    expect(quadraticRoots(state)).toEqual([-2, 2]);
  });
});

describe('quadratic formatting', () => {
  it.each([
    [{ a: 1, b: 0, c: 0 }, 'y = x²'],
    [{ a: -1, b: 0, c: 0 }, 'y = −x²'],
    [{ a: 2, b: 0, c: 0 }, 'y = 2x²'],
    [{ a: 1, b: -4, c: 5 }, 'y = x² − 4x + 5'],
    [{ a: 1, b: 0, c: -4 }, 'y = x² − 4'],
    [{ a: 1, b: 1, c: -1 }, 'y = x² + x − 1'],
  ] as const)('writes %o as %s', (raw, expected) => {
    const state = stateFromRaw('graph', { mode: 'quadratic', ...raw }) as GraphState;
    expect(graphModel.symbolic(state).text).toBe(expected);
    expect(graphModel.symbolic(state).text).not.toMatch(/^2\^|\^2\^|x\^2\^/);
  });

  it('never emits a coefficient of zero or one', () => {
    for (const raw of [{ a: 1, b: 0, c: 0 }, { a: 1, b: 0, c: 5 }, { a: 1, b: 3, c: 0 }]) {
      const state = stateFromRaw('graph', { mode: 'quadratic', ...raw }) as GraphState;
      const text = graphModel.symbolic(state).text;
      expect(text).not.toMatch(/\b0x\b|\b1x\b|1x²|\+\s*−|\+\s*\+/);
    }
  });
});

describe('World 3 mystery number starts as a puzzle, not an answer', () => {
  it('w3-l1 step 1 begins at x = 2 with target 7, so it is unsolved', () => {
    const { tool, raw } = stateOf('w3-l1-variables', 0);
    expect(tool).toBe('mystery');
    const state = stateFromRaw('mystery', raw) as MysteryState;
    expect(state.value).toBe(2);
    expect(state.target).toBe(7);
    expect(mysterySolved(state)).toBe(false);
  });

  it('does not leak the hidden value before it is revealed', () => {
    const hidden = stateFromRaw('mystery', { value: 4, copies: 2, extra: 3, target: 11 }) as MysteryState;
    expect(hidden.reveal).toBe(false);
    const text = mysteryModel.describe(hidden).lines.join(' ');
    expect(text).not.toContain('each holding the same 4');
    expect(text).toContain('unknown number x');

    const shown = stateFromRaw('mystery', { value: 4, copies: 2, extra: 3, target: 11, reveal: true }) as MysteryState;
    expect(mysteryModel.describe(shown).lines.join(' ')).toContain('same 4');
  });
});

describe('World 4 balance does not pre-show the solution', () => {
  it('w4-l1 step 2 no longer carries a dead operation key', () => {
    const { tool, raw } = stateOf('w4-l1-equality', 1);
    expect(tool).toBe('balance');
    expect(raw).not.toHaveProperty('operation');
  });
});

describe('every lesson visual in all 36 lessons initialises and renders', () => {
  it('covers all seven worlds and every tool type', () => {
    const steps = visualSteps();
    const lessons = new Set(steps.map((s) => s.lessonId));
    // Guards against the suite silently going vacuous if content is restructured.
    expect(lessons.size).toBeGreaterThanOrEqual(30);
    expect(steps.length).toBeGreaterThanOrEqual(50);
    const tools = new Set(steps.map((s) => s.step.visual.tool));
    for (const id of Object.keys(TOOL_META) as ToolId[]) expect(tools, `no lesson uses ${id}`).toContain(id);
  });

  it.each(visualSteps().map((v) => [v.lessonId, v.step.title, v.step] as const))(
    '%s: %s initialises and renders cleanly',
    (_lessonId, _title, step) => {
      const tool = step.visual.tool as ToolId;
      const raw = step.visual.initialState ?? {};
      expect(TOOL_META[tool], `unknown tool ${tool}`).toBeTruthy();

      // 1. The validated path produces a usable state and a symbolic summary.
      const state = stateFromRaw(tool, raw);
      expect(state, tool).toBeTruthy();
      const sym = symbolicFor(tool, state as never);
      expect(typeof sym.text).toBe('string');
      expect(sym.text.trim().length).toBeGreaterThan(0);

      // 2. No malformed powers from the old string-replace formatting.
      expect(sym.text).not.toMatch(/\^\d\^\d/);
      expect(sym.latex).not.toMatch(/\^\d\^\d/);

      // 3. The real component mounts without throwing, and shows some content.
      const { container, unmount } = render(<StepVisual visual={step.visual} />);
      expect(container.textContent!.trim().length).toBeGreaterThan(0);
      unmount();
    },
  );

  it('keeps every area model consistent with its own cell products', () => {
    for (const { lessonId, step } of visualSteps()) {
      if (step.visual.tool !== 'area') continue;
      const state = stateFromRaw('area', step.visual.initialState ?? {}) as AreaState;
      const d = deriveAreaState(state);
      expect(d.ok, `${lessonId}: ${d.error}`).toBe(true);
      // The total must be the sum of the drawn cells: a picture that does not add up is a lie.
      expect(`${lessonId}: ${symbolicFor('area', state).text}`).toContain(d.total.text);
    }
  });

  it('keeps every graph lesson consistent with the equation it teaches', () => {
    for (const { lessonId, step } of visualSteps()) {
      if (step.visual.tool !== 'graph') continue;
      const state = stateFromRaw('graph', step.visual.initialState ?? {}) as GraphState;
      // A system lesson must draw two lines that actually meet somewhere.
      if (state.mode === 'system') {
        const sol = systemSolution(state);
        expect(sol, `${lessonId} draws parallel lines`).not.toBeNull();
      }
      // A parabola lesson must not be a straight line.
      if (state.mode === 'quadratic') {
        expect(state.a, `${lessonId} has no x² term`).not.toBe(0);
        expect(quadraticVertex(state)).not.toBeNull();
      }
    }
  });
});

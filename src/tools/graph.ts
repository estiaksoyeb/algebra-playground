/**
 * Coordinate plane / line / parabola / system model.
 *
 * State holds parameters, not pixel positions. Points on the line, the table of
 * values and the symbolic equation are all derived, so dragging a point or moving
 * a slider updates every representation from the same numbers.
 */
import { Rational } from '../math/rational';
import { ToolModel } from './model';

export type GraphMode = 'explore' | 'line' | 'quadratic' | 'system';

export interface GraphState {
  mode: GraphMode;
  /** slope / a */
  m: number;
  /** intercept / c */
  b: number;
  /** second line (system mode) */
  m2: number;
  b2: number;
  /** quadratic x-offset for vertex form preview */
  a: number;
  range: number;
  point: { x: number; y: number };
  showTable: boolean;
  showSlope: boolean;
}

export function createGraph(init: Partial<GraphState> = {}): GraphState {
  return {
    mode: init.mode ?? 'explore',
    m: init.m ?? 1,
    b: init.b ?? 0,
    m2: init.m2 ?? 1,
    b2: init.b2 ?? 0,
    a: init.a ?? 1,
    range: init.range ?? 5,
    point: init.point ?? { x: 3, y: 2 },
    showTable: init.showTable ?? false,
    showSlope: init.showSlope ?? false,
  };
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function lineSegments(g: GraphState): Segment[] {
  const R = g.range;
  const segs: Segment[] = [{ x1: -R, y1: g.m * -R + g.b, x2: R, y2: g.m * R + g.b }];
  if (g.mode === 'system') segs.push({ x1: -R, y1: g.m2 * -R + g.b2, x2: R, y2: g.m2 * R + g.b2 });
  return segs;
}

export function parabolaPoints(g: GraphState, steps = 60): { x: number; y: number }[] {
  const R = g.range;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = -R + (2 * R * i) / steps;
    out.push({ x, y: g.a * x * x + g.b * x + g.m });
  }
  return out;
}

export function tableOfValues(g: GraphState, n = 5): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let x = 0; x <= n; x++) out.push({ x, y: g.m * x + g.b });
  return out;
}

/** Intercepts for the quadratic ax² + bx + c; returns real integer-friendly roots when they exist. */
export function quadraticRoots(g: GraphState): number[] {
  const a = g.a;
  const b = g.b;
  const c = g.m;
  if (a === 0) return b === 0 ? [] : [-c / b];
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  if (disc === 0) return [-b / (2 * a)];
  const s = Math.sqrt(disc);
  return [(-b - s) / (2 * a), (-b + s) / (2 * a)].sort((p, q) => p - q);
}

/** System solution (intersection of the two lines) if unique. */
export function systemSolution(g: GraphState): { x: number; y: number } | null {
  if (g.m === g.m2) return null;
  const x = (g.b2 - g.b) / (g.m - g.m2);
  return { x, y: g.m * x + g.b };
}

export function setPoint(g: GraphState, p: { x: number; y: number }): GraphState {
  const R = g.range;
  const c = (v: number) => Math.max(-R, Math.min(R, Math.round(v * 2) / 2));
  return { ...g, point: { x: c(p.x), y: c(p.y) } };
}

function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return Rational.of(n).toString();
}

/** LaTeX coefficient + x, omitting 1 (so y = x, not y = 1x). */
function xTerm(coeff: number): string {
  if (coeff === 1) return 'x';
  if (coeff === -1) return '-x';
  return `${fmt(coeff)}x`;
}

/** LaTeX for " + b" / " - b", omitting zero. */
function constTerm(c: number): string {
  if (c === 0) return '';
  if (c < 0) return ` - ${fmt(Math.abs(c))}`;
  return ` + ${fmt(c)}`;
}

export const graphModel: ToolModel<GraphState> = {
  id: 'graph',
  label: 'Graph',
  defaultState: () => createGraph({ mode: 'line', m: 1, b: 1 }),
  symbolic: (g) => {
    if (g.mode === 'system') {
      return {
        latex: `\\begin{cases} y = ${xTerm(g.m)}${constTerm(g.b)} \\\\ y = ${xTerm(g.m2)}${constTerm(g.b2)} \\end{cases}`,
        text: `y = ${xTerm(g.m)}${constTerm(g.b)} and y = ${xTerm(g.m2)}${constTerm(g.b2)}`.replace(/-/g, '−'),
      };
    }
    if (g.mode === 'quadratic') {
      const quad = `y = ${xTerm(g.a)}x^{2}${constTerm(g.b)}x${constTerm(g.m)}`.replace('xx', 'x^2');
      return {
        latex: quad,
        text: quad.replace(/\\/g, '').replace(/\^\{2\}/g, '^2').replace(/-/g, '−'),
      };
    }
    if (g.mode === 'line') {
      const line = `y = ${xTerm(g.m)}${constTerm(g.b)}`;
      return { latex: line, text: line.replace(/-/g, '−') };
    }
    return { latex: `(${fmt(g.point.x)},\\, ${fmt(g.point.y)})`, text: `Point (${fmt(g.point.x)}, ${fmt(g.point.y)})` };
  },
  describe: (g) => {
    if (g.mode === 'explore') {
      return { title: 'Coordinate plane', lines: [`The point is at (${fmt(g.point.x)}, ${fmt(g.point.y)}).`, 'x is horizontal, y is vertical. Move right for positive x, up for positive y.'] };
    }
    if (g.mode === 'line' || g.mode === 'system') {
      const lines = [`The line y = ${xTerm(g.m)}${constTerm(g.b)} has slope ${fmt(g.m)} and crosses the y-axis at ${fmt(g.b)}.`];
      if (g.mode === 'system') {
        const s = systemSolution(g);
        lines.push(s ? `The two lines cross at (${fmt(s.x)}, ${fmt(s.y)}) — that pair satisfies both equations.` : 'The lines are parallel, so there is no pair satisfying both.');
      }
      return { title: 'Straight line', lines };
    }
    const roots = quadraticRoots(g);
    return {
      title: 'Parabola',
      lines: [
        `y = ${`${xTerm(g.a)}x²${constTerm(g.b)}x${constTerm(g.m)}`.replace('xx', 'x²').replace(/-/g, '−')}.`,
        roots.length ? `It crosses the x-axis at x = ${roots.map(fmt).join(' and ')}.` : 'It does not cross the x-axis.',
        'A positive leading coefficient opens upward; a negative one opens downward.',
      ],
    };
  },
};

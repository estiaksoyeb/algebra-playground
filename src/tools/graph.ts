/**
 * Coordinate plane / line / parabola / system model.
 *
 * State holds parameters, not pixel positions. Points on the line, the table of
 * values and the symbolic equation are all derived, so dragging a point or moving
 * a slider updates every representation from the same numbers.
 */
import { Rational } from '../math/rational';
import { ToolModel } from './model';
import { t } from '../i18n';

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

/**
 * Table of values for the rule on screen. A parabola samples x = −n … n so the turning
 * point is visible; a line uses 0 … n.
 */
export function tableOfValues(g: GraphState, n = 5): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  if (g.mode === 'quadratic') {
    for (let x = -n; x <= n; x++) out.push({ x, y: g.a * x * x + g.b * x + g.m });
    return out;
  }
  for (let x = 0; x <= n; x++) out.push({ x, y: g.m * x + g.b });
  return out;
}

/** Turning point of the parabola ax² + bx + c, or null for a straight line (a = 0). */
export function quadraticVertex(g: GraphState): { x: number; y: number } | null {
  if (g.a === 0) return null;
  const x = normaliseZero(-g.b / (2 * g.a));
  return { x, y: g.a * x * x + g.b * x + g.m };
}

/** Intercepts for the quadratic ax² + bx + c; returns real integer-friendly roots when they exist. */
export function quadraticRoots(g: GraphState): number[] {
  const a = g.a;
  const b = g.b;
  const c = g.m;
  if (a === 0) return b === 0 ? [] : [-c / b];
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  if (disc === 0) return [normaliseZero(-b / (2 * a))];
  const s = Math.sqrt(disc);
  return [normaliseZero((-b - s) / (2 * a)), normaliseZero((-b + s) / (2 * a))].sort((p, q) => p - q);
}

/** -0 and 0 are the same root; printing "x = -0" reads as a different one. */
function normaliseZero(n: number): number {
  return n === 0 ? 0 : n;
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

/** LaTeX for the sq term ax², omitting 1 (never "1x^{2}"). */
function sqTerm(a: number): string {
  if (a === 1) return 'x^{2}';
  if (a === -1) return '-x^{2}';
  return `${fmt(a)}x^{2}`;
}

/**
 * Any term joined onto a running expression: drops it entirely when the coefficient is
 * zero, so "y = x^{2} + 0x + 0" can never appear.
 */
function appendTerm(prev: string, coeff: number, letter: 'x' | ''): string {
  if (coeff === 0) return prev;
  const body = letter === 'x' ? (Math.abs(coeff) === 1 ? 'x' : `${fmt(Math.abs(coeff))}x`) : fmt(Math.abs(coeff));
  return coeff < 0 ? `${prev} - ${body}` : `${prev} + ${body}`;
}

/** LaTeX for a quadratic in standard form: ax² + bx + c with zero terms omitted. */
function quadraticLatex(g: GraphState): string {
  const head = sqTerm(g.a);
  return appendTerm(appendTerm(`y = ${head}`, g.b, 'x'), g.m, '');
}

/** Plain text for a quadratic, using the learner's superscript and minus glyphs. */
function quadraticText(g: GraphState): string {
  const head = g.a === 1 ? 'x²' : g.a === -1 ? '-x²' : `${fmt(g.a)}x²`;
  let out = `y = ${head}`;
  if (g.b !== 0) {
    const size = Math.abs(g.b) === 1 ? '' : fmt(Math.abs(g.b));
    out += g.b < 0 ? ` - ${size}x` : ` + ${size}x`;
  }
  if (g.m !== 0) out += g.m < 0 ? ` - ${fmt(Math.abs(g.m))}` : ` + ${fmt(g.m)}`;
  return out.replace(/-/g, '−');
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
      return { latex: quadraticLatex(g), text: quadraticText(g) };
    }
    if (g.mode === 'line') {
      const line = `y = ${xTerm(g.m)}${constTerm(g.b)}`;
      return { latex: line, text: line.replace(/-/g, '−') };
    }
    return { latex: `(${fmt(g.point.x)},\\, ${fmt(g.point.y)})`, text: `Point (${fmt(g.point.x)}, ${fmt(g.point.y)})` };
  },
  describe: (g, locale) => {
    if (g.mode === 'explore') {
      return {
        title: t('tool.graph.describe.pointTitle', { lng: locale }),
        lines: [
          t('tool.graph.describe.pointAt', { lng: locale, x: fmt(g.point.x), y: fmt(g.point.y) }),
          t('tool.graph.describe.axes', { lng: locale }),
        ],
      };
    }
    if (g.mode === 'line' || g.mode === 'system') {
      const lines = [
        t('tool.graph.describe.lineSummary', {
          lng: locale,
          equation: `y = ${xTerm(g.m)}${constTerm(g.b)}`,
          slope: fmt(g.m),
          intercept: fmt(g.b),
        }),
      ];
      if (g.mode === 'system') {
        const s = systemSolution(g);
        lines.push(
          s
            ? t('tool.graph.describe.crossAt', { lng: locale, x: fmt(s.x), y: fmt(s.y) })
            : t('tool.graph.describe.parallel', { lng: locale }),
        );
      }
      return { title: t('tool.graph.describe.lineTitle', { lng: locale }), lines };
    }
    const roots = quadraticRoots(g);
    const vertex = quadraticVertex(g);
    return {
      title: t('tool.graph.describe.parabolaTitle', { lng: locale }),
      lines: [
        // The equation is maths: inserted verbatim, never translated.
        t('tool.graph.describe.equation', { lng: locale, equation: quadraticText(g) }),
        vertex
          ? t('tool.graph.describe.turningPoint', { lng: locale, x: fmt(vertex.x), y: fmt(vertex.y) })
          : t('tool.graph.describe.notParabola', { lng: locale }),
        roots.length
          ? t('tool.graph.describe.crosses', { lng: locale, roots: roots.map(fmt).join(', ') })
          : t('tool.graph.describe.neverCrosses', { lng: locale }),
        t('tool.graph.describe.opening', { lng: locale }),
      ],
    };
  },
};

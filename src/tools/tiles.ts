/**
 * Algebra tiles / counters / fraction-bar model.
 *
 * One state shape serves several visual interpretations:
 * - tiles: long tiles (x) and unit squares, with sign
 * - array: a rows × cols grid of counters (multiplication)
 * - groups: n groups of counters (division)
 * - fraction: pieces/shaded for fraction bars
 * Zero pairs (one +x and one −x, or a + unit and a − unit) are detected and can be
 * visually cancelled; the symbolic form is derived from the same counts.
 */
import { toPolynomial, polyToLatex, polyToText } from '../math/polynomial';
import { parseExpression } from '../math/expression';
import { ToolModel } from './model';

export interface TilesState {
  /** net counts are stored; individual signs are derived for display */
  xCount: number;
  unitCount: number;
  layout: 'tiles' | 'array' | 'groups' | 'fraction';
  rows: number;
  cols: number;
  groups: number;
  pieces: number;
  shaded: number;
}

const clampNonNeg = (n: number, fallback = 1) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback);

export function createTiles(init: Partial<TilesState> = {}): TilesState {
  return {
    xCount: Math.trunc(init.xCount ?? 0),
    unitCount: Math.trunc(init.unitCount ?? 0),
    layout: init.layout ?? 'tiles',
    rows: clampNonNeg(init.rows ?? 3, 3),
    cols: clampNonNeg(init.cols ?? 4, 4),
    groups: clampNonNeg(init.groups ?? 3, 3),
    pieces: clampNonNeg(init.pieces ?? 4, 4),
    shaded: Math.max(0, Math.min(init.shaded ?? 2, clampNonNeg(init.pieces ?? 4, 4))),
  };
}

export function addTiles(s: TilesState, dx: number, du: number): { ok: boolean; state?: TilesState; error?: string } {
  if (Math.abs(s.xCount + dx) > 30 || Math.abs(s.unitCount + du) > 100) {
    return { ok: false, error: 'That is too many tiles to show clearly. Try a smaller number.' };
  }
  return { ok: true, state: { ...s, xCount: s.xCount + dx, unitCount: s.unitCount + du } };
}

/** Explicit tile decomposition with signs, so zero pairs are visible. */
export interface SignedTiles {
  posX: number;
  negX: number;
  posU: number;
  negU: number;
}

export function signedTiles(s: TilesState): SignedTiles {
  return {
    posX: Math.max(0, s.xCount),
    negX: Math.max(0, -s.xCount),
    posU: Math.max(0, s.unitCount),
    negU: Math.max(0, -s.unitCount),
  };
}

export function tilesExpression(s: TilesState) {
  const terms: string[] = [];
  if (s.xCount !== 0) terms.push(`${s.xCount === 1 ? '' : s.xCount === -1 ? '-' : s.xCount}x`);
  if (s.unitCount !== 0 || s.xCount === 0) terms.push(String(s.unitCount));
  const text = terms.join(' + ').replace(/\+ -/g, '- ');
  const poly = toPolynomial(parseExpression(terms.length === 0 ? '0' : text));
  return { poly, latex: polyToLatex(poly), text: polyToText(poly) };
}

export function arrayTotal(s: TilesState): number {
  return s.rows * s.cols;
}

export const tilesModel: ToolModel<TilesState> = {
  id: 'tiles',
  label: 'Algebra tiles',
  defaultState: () => createTiles({ xCount: 2, unitCount: 3 }),
  symbolic: (s) => {
    if (s.layout === 'array') {
      const total = arrayTotal(s);
      return { latex: `${s.rows} \\times ${s.cols} = ${total}`, text: `${s.rows} × ${s.cols} = ${total}` };
    }
    if (s.layout === 'groups') {
      const total = s.unitCount;
      const size = s.groups > 0 ? total / s.groups : 0;
      const exact = Number.isInteger(size);
      return {
        latex: `${total} \\div ${s.groups} = ${exact ? size : `\\frac{${total}}{${s.groups}}`}`,
        text: `${total} ÷ ${s.groups} = ${exact ? size : `${total}/${s.groups}`}`,
      };
    }
    if (s.layout === 'fraction') {
      return { latex: `\\frac{${s.shaded}}{${s.pieces}}`, text: `${s.shaded}/${s.pieces}` };
    }
    const e = tilesExpression(s);
    return { latex: e.latex, text: e.text, expr: parseExpression(`${s.xCount}x + ${s.unitCount}`) };
  },
  describe: (s) => {
    if (s.layout === 'array') {
      return { title: 'Array', lines: [`${s.rows} rows of ${s.cols} counters makes ${s.rows * s.cols} in total.`, 'Turning the rectangle shows the other factor order — the product is the same.'] };
    }
    if (s.layout === 'groups') {
      return { title: 'Equal groups', lines: [`${s.unitCount} counters shared into ${s.groups} groups.`, s.unitCount % s.groups === 0 ? `Each group has ${s.unitCount / s.groups}.` : `Each group would get ${s.unitCount}/${s.groups} — not a whole number.`] };
    }
    if (s.layout === 'fraction') {
      return { title: 'Fraction bar', lines: [`The whole is cut into ${s.pieces} equal parts.`, `${s.shaded} of them are shaded, so the fraction is ${s.shaded}/${s.pieces}.`] };
    }
    return {
      title: 'Algebra tiles',
      lines: [
        `Long tiles: ${s.xCount} (each is one x).`,
        `Unit tiles: ${s.unitCount} (each is 1).`,
        `Together they show ${tilesExpression(s).text}. Long and unit tiles are different sizes, so they do not combine.`,
      ],
    };
  },
};

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
import { t } from '../i18n';

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
  describe: (s, locale) => {
    if (s.layout === 'array') {
      return {
        title: t('tool.tiles.describe.arrayTitle', { lng: locale }),
        lines: [
          t('tool.tiles.describe.arrayTotal', { lng: locale, rows: s.rows, cols: s.cols, total: s.rows * s.cols }),
          t('tool.tiles.describe.arrayTurn', { lng: locale }),
        ],
      };
    }
    if (s.layout === 'groups') {
      return {
        title: t('tool.tiles.describe.groupsTitle', { lng: locale }),
        lines: [
          t('tool.tiles.describe.groupsShared', { lng: locale, count: s.unitCount, groups: s.groups }),
          s.unitCount % s.groups === 0
            ? t('tool.tiles.describe.groupsEach', { lng: locale, each: s.unitCount / s.groups })
            : t('tool.tiles.describe.groupsRemainder', { lng: locale, count: s.unitCount, groups: s.groups }),
        ],
      };
    }
    if (s.layout === 'fraction') {
      return {
        title: t('tool.tiles.describe.fractionTitle', { lng: locale }),
        lines: [
          t('tool.tiles.describe.fractionParts', { lng: locale, pieces: s.pieces }),
          t('tool.tiles.describe.fractionShaded', { lng: locale, shaded: s.shaded, pieces: s.pieces }),
        ],
      };
    }
    return {
      title: t('tool.tiles.describe.tilesTitle', { lng: locale }),
      lines: [
        t('tool.tiles.describe.longTiles', { lng: locale, count: s.xCount }),
        t('tool.tiles.describe.unitTiles', { lng: locale, count: s.unitCount }),
        // The expression is maths and is inserted verbatim.
        t('tool.tiles.describe.together', { lng: locale, expression: tilesExpression(s).text }),
      ],
    };
  },
};

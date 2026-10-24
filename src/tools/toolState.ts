/**
 * Central adapters between the eight playground tools.
 *
 * Every tool keeps one pure state object. This module gives the tools a common
 * surface (default state, state from lesson `initialState`, symbolic form, sanitized
 * saved-experiment state) so the UI can host them without per-tool duplication and
 * so persisted experiments can be validated before they are loaded.
 */
import { ToolId } from './types';
import { NumberLineState, createNumberLine, numberLineModel } from './numberline';
import { Rational } from '../math/rational';
import { MysteryState, createMystery, mysteryModel } from './mystery';
import { BalanceState, Pile, balanceModel, parsePileSide } from './balance';
import { tryParse } from '../math/expression';
import { TilesState, createTiles, tilesModel } from './tiles';
import { AreaMode, AreaState, EvalState, createArea, createEval, deriveAreaState, deriveEval, deriveSimplify } from './expressions';
import { GraphMode, GraphState, createGraph, graphModel } from './graph';
import { SymbolicView } from './model';

export type ToolStateMap = {
  numberline: NumberLineState;
  mystery: MysteryState;
  balance: BalanceState;
  tiles: TilesState;
  evaluator: EvalState;
  simplify: { expression: string };
  area: AreaState;
  graph: GraphState;
};

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback: string): string =>
  // Lesson text writes plain numbers (a: 2); they are the same factor as "2".
  typeof v === 'number' && Number.isFinite(v) ? String(v) : typeof v === 'string' && v.length <= 200 ? v : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const clampNum = (v: number): number => Math.max(-200, Math.min(200, v));

function parsePileSideString(text: string): Pile | null {
  const r = tryParse(text);
  if (!r.ok) return null;
  const p = parsePileSide(r.expr);
  return p && p.x >= 0 ? p : null;
}
const int = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = Math.round(num(v, fallback));
  return Math.max(min, Math.min(max, n));
};

const rat = (v: unknown, fallback: number): Rational => {
  if (typeof v === 'number') return Number.isFinite(v) ? Rational.of(v) : Rational.of(fallback);
  return Rational.from(v) ?? Rational.of(fallback);
};

export function defaultStateFor(id: ToolId): ToolStateMap[ToolId] {
  switch (id) {
    case 'numberline':
      return createNumberLine({ value: 0 });
    case 'mystery':
      return createMystery();
    case 'balance':
      return balanceModel.defaultState();
    case 'tiles':
      return tilesModel.defaultState();
    case 'evaluator':
      return createEval();
    case 'simplify':
      return { expression: '2x + 3 + 4x' };
    case 'area':
      return createArea({ mode: 'distribute', a: '2', b: 'x', c: '3' });
    case 'graph':
      return graphModel.defaultState();
  }
}

/**
 * Reduce a live tool state to something safe to persist. `JSON.stringify` uses
 * each `Rational`'s `toJSON`, and `stateFromRaw` parses the result back, so a saved
 * experiment reloads through exactly the same validated path as lesson states.
 */
export function toRaw<S>(state: S): S {
  return JSON.parse(JSON.stringify(state)) as S;
}

/**
 * Build a tool state from lesson-authored plain numbers/strings and from saved
 * experiment data. Unknown keys are ignored; every field is clamped so a corrupted
 * import can never produce an unrenderable tool.
 */
export function stateFromRaw(id: ToolId, raw: unknown): ToolStateMap[ToolId] {
  const base = defaultStateFor(id);
  const o: Record<string, unknown> = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  switch (id) {
    case 'numberline': {
      // Rationals serialize as {n, d}; lesson content may give plain numbers.
      const min = rat(o.min, -10).toNumber();
      const max = rat(o.max, 10).toNumber();
      const lo = Math.min(min, max - 2);
      const hi = Math.max(max, lo + 2);
      const clamp = (v: number) => Math.max(lo, Math.min(hi, v));
      const addend = rat(o.addend, 0);
      return {
        value: Rational.of(clamp(rat(o.value, 0).toNumber())),
        min: Rational.of(lo),
        max: Rational.of(hi),
        step: rat(o.step, 1).abs().isZero() ? Rational.ONE : rat(o.step, 1).abs(),
        addend,
        jump: o.jump === undefined || o.jump === null ? null : rat(o.jump, 1).abs().isZero() ? Rational.ONE : rat(o.jump, 1).abs(),
        mark: o.mark === undefined || o.mark === null ? null : Rational.of(clamp(rat(o.mark, 0).toNumber())),
        revision: int(o.revision, 0, 0, 1e9),
      } as NumberLineState;
    }
    case 'mystery':
      return createMystery({
        value: int(o.value, 4, -50, 50),
        copies: int(o.copies, 1, 1, 6),
        extra: int(o.extra, 3, -20, 40),
        target: o.target === undefined || o.target === null ? undefined : int(o.target, 0, -200, 200),
        reveal: bool(o.reveal, o.target === undefined || o.target === null),
        min: int(o.min, 0, -50, 50),
        max: int(o.max, 10, -50, 50),
      });
    case 'balance': {
      const b = base as BalanceState;
      const pile = (p: unknown): Pile | null => {
        if (typeof p === 'number') return { x: 0, units: int(p, 0, -60, 60) };
        if (typeof p === 'string') {
          const parsed = parsePileSideString(p);
          return parsed;
        }
        if (p && typeof p === 'object') {
          const q = p as Record<string, unknown>;
          return { x: int(q.x, 0, 0, 20), units: int(q.units ?? q.n, 0, -60, 60) };
        }
        return null;
      };
      const left = pile(o.left) ?? b.left;
      const right = pile(o.right) ?? b.right;
      return { ...b, left, right, mistakes: [], revision: 0 };

    }
    case 'tiles':
      return createTiles({
        xCount: int(o.xCount, 0, -30, 30),
        unitCount: int(o.unitCount, 0, -100, 100),
        layout: o.layout === 'array' || o.layout === 'groups' || o.layout === 'fraction' || o.layout === 'tiles' ? o.layout : 'tiles',
        rows: int(o.rows, 3, 1, 12),
        cols: int(o.cols, 4, 1, 12),
        groups: int(o.groups, 3, 1, 12),
        pieces: int(o.pieces, 4, 1, 16),
        shaded: int(o.shaded, 2, 0, 16),
      });
    case 'evaluator':
      return createEval({ expression: str(o.expression, '2x + 3').slice(0, 120), x: int(o.x, 4, -50, 50) });
    case 'simplify':
      return { expression: str(o.expression, '2x + 3 + 4x').slice(0, 120) };
    case 'area': {
      // A lesson may name the mode; otherwise the keys it supplies say which picture it
      // means (c is only meaningful for a(b + c), so a step that sets c wants distribute).
      const mode: AreaMode =
        o.mode === 'binomial' || o.mode === 'distribute'
          ? o.mode
          : o.c !== undefined
            ? 'distribute'
            : o.b !== undefined
              ? 'binomial'
              : 'distribute';
      const base = createArea({ mode });
      return {
        mode,
        a: str(o.a, base.a).slice(0, 40),
        b: str(o.b, base.b).slice(0, 40),
        c: str(o.c, base.c).slice(0, 40),
      };
    }
    case 'graph': {
      const modes: GraphMode[] = ['explore', 'line', 'quadratic', 'system'];
      const point = o.point && typeof o.point === 'object' ? (o.point as Record<string, unknown>) : {};
      const mode: GraphMode = modes.includes(o.mode as GraphMode) ? (o.mode as GraphMode) : 'line';
      // A parabola is ax² + bx + c, so its constant term arrives as `c`; the field that
      // holds it is `m` (the model keeps one number for "how far the rule is raised").
      // Accept either key, and default to 0 so y = x² is not silently y = x² + 1.
      const quadraticConstant = mode === 'quadratic' ? clampNum(num(o.c ?? o.m, 0)) : clampNum(num(o.m, 1));
      return createGraph({
        mode,
        m: quadraticConstant,
        b: clampNum(num(o.b, 0)),
        m2: clampNum(num(o.m2, 1)),
        b2: clampNum(num(o.b2, 0)),
        a: clampNum(num(o.a, 1)),
        range: Math.max(2, Math.min(20, num(o.range, 5))),
        point: { x: clampNum(num(point.x, 3)), y: clampNum(num(point.y, 2)) },
        showTable: bool(o.showTable, false),
        showSlope: bool(o.showSlope, false),
      });
    }
  }
}

/** Symbolic form for every tool, always derived from the state. */
export function symbolicFor<S extends ToolId>(id: S, state: ToolStateMap[S]): SymbolicView {
  switch (id) {
    case 'numberline':
      return numberLineModel.symbolic(state as NumberLineState);
    case 'mystery':
      return mysteryModel.symbolic(state as MysteryState);
    case 'balance':
      return balanceModel.symbolic(state as BalanceState);
    case 'tiles':
      return tilesModel.symbolic(state as TilesState);
    case 'evaluator': {
      const d = deriveEval(state as EvalState);
      return d.ok ? { latex: d.latex ?? '', text: d.text ?? '' } : { latex: '', text: d.error ?? 'Invalid expression' };
    }
    case 'simplify': {
      const d = deriveSimplify(state as { expression: string });
      return { latex: d.latex ?? '', text: d.text ?? d.error ?? '' };
    }
    case 'area': {
      const a = state as AreaState;
      const d = deriveAreaState(a);
      const shown = a.mode === 'binomial' ? `(${a.a})(${a.b})` : `${a.a}(${a.b} + ${a.c})`;
      return { latex: '', text: d.ok ? `${shown} = ${d.total.text}` : shown };
    }
    case 'graph':
      return graphModel.symbolic(state as GraphState);
  }
}

/** Short human label for a state, used in experiment lists. */
export function describeFor(id: ToolId, state: ToolStateMap[ToolId]): string {
  try {
    const sym = symbolicFor(id, state as never);
    return sym.text || '';
  } catch {
    return '';
  }
}

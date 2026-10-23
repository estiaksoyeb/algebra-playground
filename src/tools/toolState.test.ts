import { describe, it, expect } from 'vitest';
import { defaultStateFor, describeFor, stateFromRaw, symbolicFor, toRaw } from './toolState';
import { Rational } from '../math/rational';
import { ToolId } from './types';
import { TOOL_META } from './registry';

const TOOL_IDS = Object.keys(TOOL_META) as ToolId[];
import { NumberLineState } from './numberline';
import { BalanceState } from './balance';
import { GraphState } from './graph';
import { MysteryState } from './mystery';
import { TilesState } from './tiles';

describe('defaultStateFor', () => {
  it('produces a default for every tool and a symbolic view for each', () => {
    for (const id of TOOL_IDS) {
      const state = defaultStateFor(id);
      expect(state, id).toBeTruthy();
      const sym = symbolicFor(id, state as never);
      expect(typeof sym.text, id).toBe('string');
      expect(() => describeFor(id, state), id).not.toThrow();
    }
  });
});

describe('stateFromRaw', () => {
  it('falls back to defaults for junk input', () => {
    for (const id of TOOL_IDS) {
      for (const junk of [null, undefined, 42, 'hello', [], true]) {
        const state = stateFromRaw(id, junk);
        expect(state, `${id}/${String(junk)}`).toBeTruthy();
      }
    }
  });

  it('number line accepts rational JSON from history round-trips', () => {
    const s = stateFromRaw('numberline', {
      value: { n: '3', d: '2' },
      min: { n: '-10', d: '1' },
      max: { n: '10', d: '1' },
      step: { n: '1', d: '2' },
      addend: { n: '3', d: '1' },
      mark: { n: '-2', d: '1' },
    }) as NumberLineState;
    expect(s.value.toString()).toBe('3/2');
    expect(s.addend.toString()).toBe('3');
    expect(s.step.toString()).toBe('1/2');
    expect(s.mark?.toString()).toBe('-2');
  });

  it('number line clamps values into range and rejects a zero step', () => {
    const s = stateFromRaw('numberline', { value: 999, min: -5, max: 5, step: 0 }) as NumberLineState;
    expect(s.value.toNumber()).toBeLessThanOrEqual(5);
    expect(s.step.isZero()).toBe(false);
    expect(s.mark).toBeNull();
  });

  it('number line keeps a valid span even when min >= max', () => {
    const s = stateFromRaw('numberline', { min: 5, max: 1, value: 3 }) as NumberLineState;
    expect(s.max.toNumber()).toBeGreaterThan(s.min.toNumber());
  });

  it('mystery boxes clamp integers and derive reveal from target when absent', () => {
    const hidden = stateFromRaw('mystery', { value: 999, copies: 0, extra: -999, target: 5 }) as MysteryState;
    expect(hidden.value).toBeLessThanOrEqual(50);
    expect(hidden.copies).toBe(1);
    expect(hidden.extra).toBeGreaterThanOrEqual(-20);
    expect(hidden.reveal).toBe(false);
    const open = stateFromRaw('mystery', { value: 3 }) as MysteryState;
    expect(open.reveal).toBe(true);
  });

  it('balance accepts numbers, strings and pile objects', () => {
    const fromNumbers = stateFromRaw('balance', { left: 3, right: -2 }) as BalanceState;
    expect(fromNumbers.left).toEqual({ x: 0, units: 3 });
    expect(fromNumbers.right).toEqual({ x: 0, units: -2 });

    const fromStrings = stateFromRaw('balance', { left: '2x + 4', right: '10' }) as BalanceState;
    expect(fromStrings.left.x).toBe(2);
    expect(fromStrings.left.units).toBe(4);
    expect(fromStrings.right.units).toBe(10);

    const fromObjects = stateFromRaw('balance', { left: { x: 1, units: 3 }, right: { x: 0, n: 8 } }) as BalanceState;
    expect(fromObjects.left).toEqual({ x: 1, units: 3 });
    expect(fromObjects.right).toEqual({ x: 0, units: 8 });
  });

  it('balance rejects unsafe or malformed piles and keeps the default side', () => {
    const base = defaultStateFor('balance') as BalanceState;
    const s = stateFromRaw('balance', { left: 'alert(1)', right: { x: -5, units: 1e9 } }) as BalanceState;
    expect(s.left).toEqual(base.left);
    expect(s.right.x).toBeGreaterThanOrEqual(0);
    expect(s.right.units).toBeLessThanOrEqual(60);
  });

  it('tiles clamp counts and validate layouts', () => {
    const s = stateFromRaw('tiles', { xCount: 999, unitCount: -9999, layout: 'nonsense', rows: 0, cols: 99 }) as TilesState;
    expect(s.xCount).toBeLessThanOrEqual(30);
    expect(s.unitCount).toBeGreaterThanOrEqual(-100);
    expect(['tiles', 'array', 'groups', 'fraction']).toContain(s.layout);
    expect(s.rows).toBeGreaterThanOrEqual(1);
    expect(s.cols).toBeLessThanOrEqual(12);
  });

  it('evaluator keeps a capped expression and integer x', () => {
    const s = stateFromRaw('evaluator', { expression: 'x'.repeat(500), x: 3.7 }) as { expression: string; x: number };
    expect(s.expression.length).toBeLessThanOrEqual(120);
    expect(s.x).toBe(4);
  });

  it('graph validates modes, clamps coefficients and the range', () => {
    const s = stateFromRaw('graph', { mode: 'unknown', m: 1e9, a: -1e9, range: 999, point: { x: 2, y: 3 } }) as GraphState;
    expect(['explore', 'line', 'quadratic', 'system']).toContain(s.mode);
    expect(Math.abs(s.m)).toBeLessThanOrEqual(200);
    expect(Math.abs(s.a)).toBeLessThanOrEqual(200);
    expect(s.range).toBeLessThanOrEqual(20);
    expect(s.point).toEqual({ x: 2, y: 3 });
    const sys = stateFromRaw('graph', { mode: 'system' }) as GraphState;
    expect(sys.mode).toBe('system');
  });

  it('round-trips a real tool state through JSON (history persistence)', () => {
    const start = defaultStateFor('numberline') as NumberLineState;
    const json = JSON.stringify(start);
    const back = stateFromRaw('numberline', JSON.parse(json)) as NumberLineState;
    expect(back.value.toString()).toBe(start.value.toString());
    expect(back.max.toString()).toBe(start.max.toString());
    expect(Rational.from(back.value)).not.toBeNull();
  });

  it('toRaw output is plain data that a saved experiment can reload', () => {
    // The regression: a live number line saved the way the UI used to save it
    // (Rational instances straight into IndexedDB) crashed on reopen.
    const start = { ...(defaultStateFor('numberline') as NumberLineState), value: Rational.of(3, 2), addend: Rational.of(3, 2) };
    const raw = toRaw(start);
    expect(typeof (raw.value as unknown as { n: string }).n).toBe('string');
    expect(JSON.parse(JSON.stringify(raw))).toEqual(raw);
    const back = stateFromRaw('numberline', raw) as NumberLineState;
    expect(back.value.toString()).toBe('3/2');
    expect(back.addend.toString()).toBe('3/2');
    expect(() => symbolicFor('numberline', back)).not.toThrow();
  });

  it('every tool survives toRaw -> stateFromRaw with live state (save and reopen)', () => {
    for (const id of TOOL_IDS) {
      const live = defaultStateFor(id);
      const back = stateFromRaw(id, JSON.parse(JSON.stringify(toRaw(live))));
      expect(() => symbolicFor(id, back), id).not.toThrow();
      expect(() => describeFor(id, back), id).not.toThrow();
    }
  });

  it('describeFor never throws on corrupted state', () => {
    const bad = { expression: 42 } as unknown as { expression: string };
    expect(() => describeFor('simplify', bad)).not.toThrow();
  });
});

describe('symbolicFor', () => {
  it('derives the symbolic view from the same state used by the visual', () => {
    const mystery = stateFromRaw('mystery', { value: 4, copies: 2, extra: 3, target: 11 }) as MysteryState;
    const sym = symbolicFor('mystery', mystery);
    expect(sym.text.replace(/\s+/g, '')).toContain('2');
  });

  it('shows the area model as a product of the two factors', () => {
    const sym = symbolicFor('area', { a: 'x + 1', b: 'x', c: '2' });
    expect(sym.text).toContain('x + 1');
  });

  it('reports invalid expressions instead of throwing', () => {
    const sym = symbolicFor('evaluator', { expression: '2x +', x: 1 } as never);
    expect(sym.text.length).toBeGreaterThan(0);
    expect(sym.latex).toBe('');
  });
});

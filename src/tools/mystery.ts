/**
 * Mystery-number model: a hidden value x, a number of copies, and extra addends.
 * The expression and its total are derived from the same numbers.
 */
import { ToolModel } from './model';

export interface MysteryState {
  value: number;
  copies: number;
  extra: number;
  /** optional target total (e.g. box + 3 = 7) */
  target?: number;
  min: number;
  max: number;
  /** show the number inside each box (hidden while hunting for a target) */
  reveal: boolean;
}

export function createMystery(init: Partial<MysteryState> = {}): MysteryState {
  return {
    value: init.value ?? 4,
    copies: Math.max(1, Math.min(6, Math.floor(init.copies ?? 1))),
    extra: Math.trunc(init.extra ?? 3),
    target: init.target,
    min: init.min ?? 0,
    max: init.max ?? 10,
    reveal: init.reveal ?? init.target === undefined,
  };
}

export function mysteryTotal(s: MysteryState): number {
  return s.value * s.copies + s.extra;
}

export function mysterySolved(s: MysteryState): boolean {
  return s.target !== undefined && mysteryTotal(s) === s.target;
}

export const mysteryModel: ToolModel<MysteryState> = {
  id: 'mystery',
  label: 'Mystery number',
  defaultState: () => createMystery(),
  symbolic: (s) => {
    const x = s.value.toFixed(0);
    const coeff = s.copies === 1 ? 'x' : `${s.copies}x`;
    const extra = s.extra === 0 ? '' : s.extra > 0 ? ` + ${s.extra}` : ` - ${Math.abs(s.extra)}`;
    const latexExpr = `${coeff}${extra}`;
    const total = mysteryTotal(s);
    const latex = s.target !== undefined ? `${latexExpr} = ${s.target}` : `${latexExpr} = ${total}`;
    return {
      latex,
      text: s.target !== undefined ? `${coeff}${extra.replace(/ /g, ' ')} = ${s.target} (x = ${x} gives ${total})` : `${coeff}${extra} = ${total}`,
    };
  },
  describe: (s) => {
    const total = mysteryTotal(s);
    return {
      title: 'Mystery number',
      lines: [
        s.reveal ? `The box (x) holds ${s.value}.` : 'The box (x) hides a number you have to find.',
        s.copies === 1 ? 'There is one box.' : `There are ${s.copies} identical boxes, each holding the same ${s.value}.`,
        `${s.copies} × ${s.value}${s.extra ? ` ${s.extra > 0 ? '+' : '−'} ${Math.abs(s.extra)}` : ''} = ${total}.`,
        s.target !== undefined ? (total === s.target ? `The total matches the target ${s.target}. x = ${s.value}.` : `The total ${total} does not match the target ${s.target} yet.`) : 'Change x and watch the total change.',
      ],
    };
  },
};

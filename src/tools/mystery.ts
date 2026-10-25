/**
 * Mystery-number model: a hidden value x, a number of copies, and extra addends.
 * The expression and its total are derived from the same numbers.
 */
import { ToolModel } from './model';
import { t } from '../i18n';

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
  describe: (s, locale) => {
    const total = mysteryTotal(s);
    // The expression itself is maths, so it is built once and never translated.
    const expression = `${s.copies === 1 ? 'x' : `${s.copies}x`}${s.extra ? ` ${s.extra > 0 ? '+' : '−'} ${Math.abs(s.extra)}` : ''}`;
    return {
      title: t('tool.mystery.title', { lng: locale }),
      lines: [
        // Before the reveal nothing may state the hidden value: the boxes are the puzzle.
        s.reveal
          ? t('tool.mystery.holds', { lng: locale, value: s.value })
          : t('tool.mystery.hides', { lng: locale }),
        s.copies === 1
          ? t('tool.mystery.oneBox', { lng: locale })
          : s.reveal
            ? t('tool.mystery.manyBoxesValue', { lng: locale, count: s.copies, value: s.value })
            : t('tool.mystery.manyBoxes', { lng: locale, count: s.copies }),
        s.reveal
          ? `${s.copies} × ${s.value}${s.extra ? ` ${s.extra > 0 ? '+' : '−'} ${Math.abs(s.extra)}` : ''} = ${total}.`
          : t('tool.mystery.expressionNow', { lng: locale, expression, total }),
        s.target !== undefined
          ? total === s.target
            ? t('tool.mystery.matches', { lng: locale, target: s.target, value: s.value })
            : t('tool.mystery.doesNotMatch', { lng: locale, total, target: s.target })
          : t('tool.mystery.changeX', { lng: locale }),
      ],
    };
  },
};

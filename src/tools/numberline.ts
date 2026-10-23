/**
 * Number line model: a position plus optional "journeys" (addends) and a comparison
 * marker. Supports fractional steps and zoom.
 *
 * State: value (marker), min/max (window), step (increment), addend (how far the last
 * jump moved; kept so the equation shows the movement), mark (a second marker for
 * comparisons/opposites), history of jumps for animation.
 */
import { Rational } from '../math/rational';
import { ToolModel } from './model';

export interface NumberLineState {
  value: Rational;
  min: Rational;
  max: Rational;
  step: Rational;
  /** last jump size; 0 means "no current jump shown" */
  addend: Rational;
  /** optional reference marker */
  mark: Rational | null;
  /** monotone counter so views can animate the last change */
  revision: number;
}

export interface NumberLineOpResult {
  ok: boolean;
  state?: NumberLineState;
  error?: string;
}

const R = (v: number) => Rational.of(v);

export function createNumberLine(init: Partial<Record<'value' | 'min' | 'max' | 'step' | 'addend' | 'mark', number>> = {}): NumberLineState {
  const min = R(init.min ?? -10);
  const max = R(init.max ?? 10);
  const step = R(init.step ?? 1);
  const value = clamp(R(init.value ?? 0), min, max);
  return {
    value,
    min,
    max,
    step: step.isZero() ? R(1) : step.abs(),
    addend: R(init.addend ?? 0),
    mark: init.mark === undefined ? null : clamp(R(init.mark), min, max),
    revision: 0,
  };
}

function clamp(v: Rational, min: Rational, max: Rational): Rational {
  if (v.cmp(min) < 0) return min;
  if (v.cmp(max) > 0) return max;
  return v;
}

export function setNumberLineValue(s: NumberLineState, value: Rational): NumberLineOpResult {
  return { ok: true, state: { ...s, value: clamp(value, s.min, s.max), addend: Rational.ZERO, revision: s.revision + 1 } };
}

export function jump(s: NumberLineState, delta: Rational): NumberLineOpResult {
  const next = s.value.add(delta);
  if (next.cmp(s.min) < 0 || next.cmp(s.max) > 0) {
    return { ok: false, error: `That jump leaves the visible number line (${s.min.toString()} to ${s.max.toString()}). Zoom out or jump in smaller steps.` };
  }
  return { ok: true, state: { ...s, value: next, addend: delta, revision: s.revision + 1 } };
}

export function stepBy(s: NumberLineState, direction: 1 | -1): NumberLineOpResult {
  return jump(s, s.step.mul(R(direction)));
}

export function zoom(s: NumberLineState, factor: number): NumberLineState {
  const center = s.value;
  const half = s.max.sub(s.min).div(R(2 * factor));
  const min = center.sub(half);
  const max = center.add(half);
  const step = s.step.div(R(factor));
  return { ...s, min, max, step: step.isZero() ? R(1) : step, addend: Rational.ZERO, mark: s.mark ? clamp(s.mark, min, max) : null, revision: s.revision + 1 };
}

export function setMark(s: NumberLineState, ok: boolean): NumberLineState {
  if (!ok) return { ...s, mark: null, revision: s.revision + 1 };
  return { ...s, mark: s.value, revision: s.revision + 1 };
}

export function ticks(s: NumberLineState): Rational[] {
  const span = s.max.sub(s.min);
  const count = 10;
  const step = span.div(R(count));
  const out: Rational[] = [];
  for (let i = 0; i <= count; i++) out.push(s.min.add(step.mul(R(i))));
  return out;
}

export const numberLineModel: ToolModel<NumberLineState> = {
  id: 'numberline',
  label: 'Number line',
  defaultState: () => createNumberLine({ value: 0 }),
  symbolic: (s) => {
    const valueText = displayNum(s.value);
    if (s.addend.isZero()) {
      return { latex: `\\text{position} = ${s.value.toLatex()}`, text: `Position ${valueText}` };
    }
    const start = s.value.sub(s.addend);
    const sign = s.addend.isNegative() ? '-' : '+';
    const size = s.addend.abs();
    return {
      latex: `${start.toLatex()} ${sign} ${size.toLatex()} = ${s.value.toLatex()}`,
      text: `${displayNum(start)} ${sign} ${displayNum(size)} = ${displayNum(s.value)}`,
    };
  },
  describe: (s) => ({
    title: 'Number line',
    lines: [
      `The marker is at ${displayNum(s.value)}.`,
      `Visible range ${displayNum(s.min)} to ${displayNum(s.max)}, steps of ${displayNum(s.step)}.`,
      s.mark ? `A reference marker is at ${displayNum(s.mark)}.` : 'Tap "Mark" to drop a reference marker.',
    ],
  }),
};

export function displayNum(r: Rational): string {
  if (r.isInteger()) return r.toString();
  const dec = r.toDecimal();
  if (dec.exact && Math.abs(r.toNumber()) < 1000) return dec.text;
  return r.toString();
}

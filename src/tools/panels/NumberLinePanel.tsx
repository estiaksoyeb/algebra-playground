import { Rational } from '../../math/rational';
import { NumberLineState, jump, numberLineModel, setMark, setNumberLineValue, stepBy, zoom } from '../numberline';
import { NumberLineView } from '../views/NumberLineView';
import { DescriptionList, EquationStrip, Stepper, ToolControls, ToolHeader } from './shared';
import { MathView as Math } from '../../components/MathComp';
import { displayNum } from '../numberline';

const num = { round: (n: number) => globalThis.Math.round(n), abs: (n: number) => globalThis.Math.abs(n), max: (a: number, b: number) => globalThis.Math.max(a, b), min: (a: number, b: number) => globalThis.Math.min(a, b) };

export interface PanelProps<S> {
  state: S;
  onChange: (s: S) => void;
  onProblem?: (message: string) => void;
}

export function NumberLinePanel({ state, onChange, onProblem, level }: PanelProps<NumberLineState> & { level?: 1 | 2 }) {
  const setValue = (v: Rational) => {
    const r = setNumberLineValue(state, v);
    if (r.ok && r.state) onChange(r.state);
    else if (r.error) onProblem?.(r.error);
  };
  const doJump = (delta: Rational) => {
    const r = jump(state, delta);
    if (r.ok && r.state) onChange(r.state);
    else if (r.error) onProblem?.(r.error);
  };
  const step = (dir: 1 | -1) => {
    const r = stepBy(state, dir);
    if (r.ok && r.state) onChange(r.state);
    else if (r.error) onProblem?.(r.error);
  };
  const sym = numberLineModel.symbolic(state);
  const desc = numberLineModel.describe(state);
  const jumpAmount = Number(state.step.toNumber() > 0 ? num.max(1, num.round(state.step.toNumber())) : 1);

  return (
    <div className="stack">
      <ToolHeader level={level} title="Number line" description="Tap or drag the line, or use the buttons. The equation always matches the marker." />
      <EquationStrip label="Position" latex={<Math tex={sym.latex} label={sym.text} />} />
      <div className="tool-canvas">
        <NumberLineView state={state} onChange={setValue} idPrefix="nl" />
      </div>
      <ToolControls>
        <div className="btn-row">
          <button type="button" className="btn btn-secondary" onClick={() => step(-1)} aria-label="Step left">
            ← {displayNum(state.step)}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => step(1)} aria-label="Step right">
            {displayNum(state.step)} →
          </button>
          <div style={{ width: 8 }} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => doJump(Rational.of(-jumpAmount))} data-testid="jump-left">
            Jump −{jumpAmount}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => doJump(Rational.of(jumpAmount))} data-testid="jump-right">
            Jump +{jumpAmount}
          </button>
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(setMark(state, true))}>
            Mark here
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(setMark(state, false))}>
            Clear mark
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(zoom(state, 2))}>
            Zoom in
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(zoom(state, 0.5))}>
            Zoom out
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ ...state, value: state.min, addend: Rational.ZERO, revision: state.revision + 1 })}>
            To start
          </button>
        </div>
        <Stepper
          label="Position"
          value={state.value.toNumber()}
          step={state.step.toNumber() || 1}
          min={state.min.toNumber()}
          max={state.max.toNumber()}
          onChange={(v) => setValue(Rational.of(v))}
        />
      </ToolControls>
      <DescriptionList title={desc.title} lines={desc.lines} />
    </div>
  );
}

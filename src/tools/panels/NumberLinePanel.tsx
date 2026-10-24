import { Rational } from '../../math/rational';
import { NumberLineState, jump, jumpSize, numberLineModel, setMark, setNumberLineValue, stepBy, zoom } from '../numberline';
import { NumberLineView } from '../views/NumberLineView';
import { DescriptionList, EquationStrip, Stepper, ToolControls, ToolHeader } from './shared';
import { MathView as Math } from '../../components/MathComp';
import { displayNum } from '../numberline';

export interface PanelProps<S> {
  state: S;
  onChange: (s: S) => void;
  onProblem?: (message: string) => void;
}

export function NumberLinePanel({ state, onChange, onProblem, level, embedded }: PanelProps<NumberLineState> & { level?: 1 | 2; embedded?: boolean }) {
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

  return (
    <div className="stack">
      <ToolHeader level={level} title="Number line" description="Tap the line or use the buttons below. The equation always matches the marker." />
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
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => doJump(jumpSize(state).neg())} data-testid="jump-left">
            Jump −{displayNum(jumpSize(state))}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => doJump(jumpSize(state))} data-testid="jump-right">
            Jump +{displayNum(jumpSize(state))}
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
      {/* Lesson steps show the lesson's own explanation; the card only repeats state. */}
      {!embedded && <DescriptionList title={desc.title} lines={desc.lines} />}
    </div>
  );
}

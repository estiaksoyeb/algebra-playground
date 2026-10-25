import { Rational } from '../../math/rational';
import { NumberLineState, jump, jumpSize, numberLineModel, setMark, setNumberLineValue, stepBy, zoom } from '../numberline';
import { NumberLineView } from '../views/NumberLineView';
import { DescriptionList, EquationStrip, Stepper, ToolControls, ToolHeader } from './shared';
import { MathView as Math } from '../../components/MathComp';
import { displayNum } from '../numberline';
import { useTranslation } from 'react-i18next';

export interface PanelProps<S> {
  state: S;
  onChange: (s: S) => void;
  onProblem?: (message: string) => void;
}

export function NumberLinePanel({ state, onChange, onProblem, level, embedded }: PanelProps<NumberLineState> & { level?: 1 | 2; embedded?: boolean }) {
  const { t, i18n } = useTranslation();
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
  const desc = numberLineModel.describe(state, i18n.language);

  return (
    <div className="stack">
      <ToolHeader
        level={level}
        title={t('tool.numberline.title')}
        description={t('tool.numberline.help')}
      />
      <EquationStrip label={t('tool.position')} latex={<Math tex={sym.latex} label={sym.text} />} />
      <div className="tool-canvas">
        <NumberLineView state={state} onChange={setValue} idPrefix="nl" />
      </div>
      <ToolControls>
        <div className="btn-row">
          <button type="button" className="btn btn-secondary" onClick={() => step(-1)} aria-label={t('tool.stepLeft')}>
            ← {displayNum(state.step)}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => step(1)} aria-label={t('tool.stepRight')}>
            {displayNum(state.step)} →
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => doJump(jumpSize(state).neg())} data-testid="jump-left">
            {t('tool.jumpMinus', { amount: displayNum(jumpSize(state)) })}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => doJump(jumpSize(state))} data-testid="jump-right">
            {t('tool.jumpPlus', { amount: displayNum(jumpSize(state)) })}
          </button>
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(setMark(state, true))}>
            {t('tool.markHere')}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(setMark(state, false))}>
            {t('tool.clearMark')}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(zoom(state, 2))}>
            {t('tool.zoomIn')}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(zoom(state, 0.5))}>
            {t('tool.zoomOut')}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ ...state, value: state.min, addend: Rational.ZERO, revision: state.revision + 1 })}>
            {t('tool.toStart')}
          </button>
        </div>
        <Stepper
          label={t('tool.position')}
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

import { useEffect, useState } from 'react';
import { MysteryState, createMystery, mysteryModel, mysterySolved, mysteryTotal } from '../mystery';
import { MysteryView } from '../views/MysteryView';
import { DescriptionList, EquationStrip, Stepper, ToolControls, ToolHeader } from './shared';
import { MathView as Math } from '../../components/MathComp';
import { useTranslation } from 'react-i18next';
import { normalizeMathInput } from '../../i18n/normalizeMathInput';

const num = { round: (n: number) => globalThis.Math.round(n), abs: (n: number) => globalThis.Math.abs(n), max: (a: number, b: number) => globalThis.Math.max(a, b), min: (a: number, b: number) => globalThis.Math.min(a, b) };

export interface MysteryPanelProps {
  /** Heading level for the panel title: 2 when embedded under a lesson h1. */
  level?: 1 | 2;
  state: MysteryState;
  onChange: (s: MysteryState) => void;
  onProblem?: (message: string) => void;
  /** True inside a lesson step: the state-description card is left out. */
  embedded?: boolean;
}

/** Hidden number x, copies of it and extra ones. Everything is derived from the state. */
export function MysteryPanel({ state, onChange, level, embedded }: MysteryPanelProps) {
  const { t, i18n } = useTranslation();
  const sym = mysteryModel.symbolic(state);
  const desc = mysteryModel.describe(state, i18n.language);
  const [targetInput, setTargetInput] = useState(state.target === undefined ? '' : String(state.target));

  useEffect(() => {
    setTargetInput(state.target === undefined ? '' : String(state.target));
  }, [state.target]);

  const total = mysteryTotal(state);
  const solved = mysterySolved(state);

  const applyTarget = () => {
    const trimmed = targetInput.trim();
    if (trimmed === '') {
      onChange({ ...state, target: undefined, reveal: true });
      return;
    }
    // Bengali keyboard digits are still the number the learner meant.
    const n = Number(normalizeMathInput(trimmed));
    if (!Number.isFinite(n) || !Number.isInteger(n) || num.abs(n) > 200) {
      return;
    }
    onChange({ ...state, target: n });
  };

  return (
    <div className="stack">
      <ToolHeader
        level={level}
        title={t('tool.mystery.title')}
        description={t('tool.mystery.help')}
      />
      <EquationStrip label={state.target !== undefined ? t('tool.target') : t('tool.expression')} latex={<Math tex={sym.latex} label={sym.text} />}>
        <span className={`pill ${solved ? 'pill-success' : 'pill-brand'}`} data-testid="mystery-total">
          {t('tool.total')} {total}
          {state.target !== undefined ? ` / ${state.target}` : ''}
        </span>
      </EquationStrip>
      <div className="tool-canvas">
        <MysteryView state={state} />
      </div>
      <ToolControls>
        <Stepper
          label={t('tool.mystery.xLabel')}
          value={state.value}
          min={state.min}
          max={state.max}
          onChange={(v) => onChange({ ...state, value: num.round(v) })}
        />
        <Stepper label={t('tool.mystery.boxes')} value={state.copies} min={1} max={6} onChange={(v) => onChange({ ...state, copies: num.max(1, num.min(6, num.round(v))) })} />
        <Stepper label={t('tool.mystery.extra')} value={state.extra} min={-10} max={20} onChange={(v) => onChange({ ...state, extra: num.round(v) })} />
        <div className="row">
          <label className="field-label" htmlFor="mystery-target" style={{ margin: 0, flex: 1 }}>
            {t('tool.mystery.targetLabel')}
          </label>
          <input
            id="mystery-target"
            className="input"
            style={{ maxWidth: 110 }}
            inputMode="numeric"
            value={targetInput}
            onChange={(e) => setTargetInput(normalizeMathInput(e.target.value).replace(/[^\d-]/g, '').slice(0, 4))}
            onBlur={applyTarget}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyTarget();
            }}
          />
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(createMystery({ copies: 2, extra: 3, target: 11, value: 0, min: 0, max: 12 }))} data-testid="mystery-puzzle">
            {t('tool.mystery.loadPuzzle')}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" aria-pressed={!state.reveal} onClick={() => onChange({ ...state, reveal: !state.reveal })}>
            {state.reveal ? t('tool.mystery.hideValue') : t('tool.mystery.showValue')}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onChange({ ...state, value: 0, target: undefined, extra: 3, copies: 1 })}
          >
            {t('tool.mystery.resetFree')}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onChange({ ...state, value: 3, target: state.target, extra: 0, copies: 1 })}
          >
            {t('tool.mystery.startOver')}
          </button>
        </div>
        {solved && (
          <div className="feedback feedback-success" role="status" data-testid="mystery-solved">
            {t('tool.mystery.solved', {
              value: state.value,
              target: state.target ?? '',
              copies: state.copies,
              extra:
                state.extra && state.extra > 0
                  ? ` + ${num.abs(state.extra)}`
                  : state.extra
                    ? ` − ${num.abs(state.extra)}`
                    : '',
              total,
            })}
          </div>
        )}
        {state.target !== undefined && !solved && (
          <p className="small muted mb-0" role="status">
            {t('tool.mystery.notYet', { total, target: state.target })}
          </p>
        )}
      </ToolControls>
      {!embedded && <DescriptionList title={desc.title} lines={desc.lines} />}
    </div>
  );
}

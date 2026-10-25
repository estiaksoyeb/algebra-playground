import { useState } from 'react';
import { AreaState, compareExpressions, createArea, deriveAreaState } from '../expressions';
import { AreaView } from '../views/AreaView';
import { ToolControls, ToolHeader } from './shared';
import { MathView as Math } from '../../components/MathComp';
import { tryParse } from '../../math/expression';
import { useTranslation } from 'react-i18next';
import { normalizeMathInput } from '../../i18n/normalizeMathInput';

export interface AreaPanelProps {
  /** Heading level for the panel title: 2 when embedded under a lesson h1. */
  level?: 1 | 2;
  state: AreaState;
  onChange: (s: AreaState) => void;
  /** True inside a lesson step: the taught model is locked and the self-quiz is left out. */
  embedded?: boolean;
}

/** Rectangle models for distribution (a(b + c)) and binomial products (p + q)(r + s). */
export function AreaPanel({ state, onChange, level, embedded }: AreaPanelProps) {
  const { t, i18n } = useTranslation();
  const [compare, setCompare] = useState('');
  const derived = deriveAreaState(state);
  const copy = {
    title: t(`tool.area.mode.${state.mode}.title`),
    description: t(`tool.area.mode.${state.mode}.description`),
  };

  const field = (key: 'a' | 'b' | 'c', label: string) => {
    const id = `area-${key}`;
    const parsed = tryParse(state[key]);
    return (
      <div>
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        <input
          id={id}
          className="input"
          value={state[key]}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          aria-invalid={parsed.ok ? undefined : true}
          onChange={(e) => onChange({ ...state, [key]: normalizeMathInput(e.target.value) })}
          data-testid={`area-input-${key}`}
        />
      </div>
    );
  };

  // The strip shows the product as the learner would write it: a(b + c) or (p)(r + s).
  const strip =
    state.mode === 'binomial'
      ? `\\left(${state.a}\\right)\\left(${state.b}\\right) = ${derived.total.latex || '?'}`
      : `${state.a}\\left(${state.b} + ${state.c}\\right) = ${derived.total.latex || '?'}`;

  const verdict = compare.trim() ? compareExpressions(derived.total.text, compare, i18n.language) : null;

  return (
    <div className="stack">
      <ToolHeader level={level} title={copy.title} description={copy.description} />
      {/* The lesson step fixes the model; only the Playground offers both kinds. */}
      {!embedded && (
        <div className="tool-tabs" role="tablist" aria-label={t('tool.area.typeLabel')}>
          <button
            type="button"
            role="tab"
            aria-selected={state.mode === 'binomial'}
            onClick={() => onChange({ ...state, mode: 'binomial', a: 'x + 1', b: 'x + 2' })}
          >
            (x + 1)(x + 2)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={state.mode === 'distribute'}
            onClick={() => onChange({ ...state, mode: 'distribute', a: '3', b: 'x', c: '2' })}
          >
            a(b + c)
          </button>
        </div>
      )}
      <div className="equation-strip" aria-live="polite">
        <div className="stack-sm" style={{ gap: 0, minWidth: 0, flex: 1 }}>
          <span className="equation-strip-label">{state.mode === 'binomial' ? t('tool.product') : t('tool.totalArea')}</span>
          <div className="math-display" style={{ padding: 0 }}>
            <Math tex={strip} label={derived.total.text || 'unknown'} />
          </div>
        </div>
      </div>
      <div className="tool-canvas">
        <AreaView derived={derived} />
      </div>
      <ToolControls>
        {state.mode === 'binomial' ? (
          <div className="tile-grid" style={{ gap: 'var(--sp-3)' }}>
            {field('a', t('tool.area.firstFactor'))}
            {field('b', t('tool.area.secondFactor'))}
          </div>
        ) : (
          <div className="tile-grid" style={{ gap: 'var(--sp-3)' }}>
            {field('a', t('tool.area.outsideFactor'))}
            {field('b', t('tool.area.firstTerm'))}
            {field('c', t('tool.area.secondTerm'))}
          </div>
        )}
        {!embedded && (
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onChange(createArea({ mode: 'binomial', a: 'x + 1', b: 'x + 2' }))}
            >
              {t('tool.area.exampleBinomial')}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onChange(createArea({ mode: 'distribute', a: '3', b: 'x', c: '2' }))}
            >
              {t('tool.area.exampleDistribute')}
            </button>
            {state.mode === 'binomial' && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ ...state, a: 'x - 1' })}>
                {t('tool.area.tryMinus')}
              </button>
            )}
          </div>
        )}
        {derived.ok && (
          <div className="feedback feedback-info" role="status" data-testid="area-total">
            {state.mode === 'binomial' ? t('tool.area.addFour') : t('tool.area.addTwo')}: {derived.cells.map((c) => c.product).join(' + ')} ={' '}
            <strong>{derived.total.text}</strong>.
          </div>
        )}
        {/* A self-quiz only makes sense in a product lesson the learner drives themselves. */}
        {state.mode === 'binomial' && !embedded && (
          <div>
            <label className="field-label" htmlFor="area-compare">
              {t('tool.area.checkOwn')}
            </label>
            <input
              id="area-compare"
              className="input"
              value={compare}
              placeholder={t('tool.area.comparePlaceholder')}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              onChange={(e) => setCompare(normalizeMathInput(e.target.value))}
              data-testid="area-compare-input"
            />
            {verdict && (
              <div className={`feedback mt-2 ${verdict.result === 'yes' ? 'feedback-success' : verdict.result === 'no' ? 'feedback-error' : 'feedback-hint'}`} role="status" data-testid="area-compare-result">
                {verdict.message}
              </div>
            )}
          </div>
        )}
      </ToolControls>
    </div>
  );
}

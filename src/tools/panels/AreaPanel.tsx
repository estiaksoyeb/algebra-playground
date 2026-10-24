import { useState } from 'react';
import { AreaMode, AreaState, compareExpressions, createArea, deriveAreaState } from '../expressions';
import { AreaView } from '../views/AreaView';
import { ToolControls, ToolHeader } from './shared';
import { MathView as Math } from '../../components/MathComp';
import { tryParse } from '../../math/expression';

export interface AreaPanelProps {
  /** Heading level for the panel title: 2 when embedded under a lesson h1. */
  level?: 1 | 2;
  state: AreaState;
  onChange: (s: AreaState) => void;
  /** True inside a lesson step: the taught model is locked and the self-quiz is left out. */
  embedded?: boolean;
}

const MODE_COPY: Record<AreaMode, { title: string; description: string }> = {
  distribute: {
    title: 'Area model: a(b + c)',
    description: 'One side is a single factor. Split the other side into b and c, and the rectangle splits into two parts — one product each.',
  },
  binomial: {
    title: 'Area model: two factors',
    description: 'Split each side into parts and the rectangle splits into four — each cell is one product.',
  },
};

/** Rectangle models for distribution (a(b + c)) and binomial products (p + q)(r + s). */
export function AreaPanel({ state, onChange, level, embedded }: AreaPanelProps) {
  const [compare, setCompare] = useState('');
  const derived = deriveAreaState(state);
  const copy = MODE_COPY[state.mode];

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
          onChange={(e) => onChange({ ...state, [key]: e.target.value })}
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

  const verdict = compare.trim() ? compareExpressions(derived.total.text, compare) : null;

  return (
    <div className="stack">
      <ToolHeader level={level} title={copy.title} description={copy.description} />
      {/* The lesson step fixes the model; only the Playground offers both kinds. */}
      {!embedded && (
        <div className="tool-tabs" role="tablist" aria-label="Area model type">
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
          <span className="equation-strip-label">{state.mode === 'binomial' ? 'Product' : 'Total area'}</span>
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
            {field('a', 'First factor (p + q)')}
            {field('b', 'Second factor (r + s)')}
          </div>
        ) : (
          <div className="tile-grid" style={{ gap: 'var(--sp-3)' }}>
            {field('a', 'Outside factor a')}
            {field('b', 'First term inside b')}
            {field('c', 'Second term inside c')}
          </div>
        )}
        {!embedded && (
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onChange(createArea({ mode: 'binomial', a: 'x + 1', b: 'x + 2' }))}
            >
              Example: (x + 1)(x + 2)
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onChange(createArea({ mode: 'distribute', a: '3', b: 'x', c: '2' }))}
            >
              Example: 3(x + 2)
            </button>
            {state.mode === 'binomial' && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ ...state, a: 'x - 1' })}>
                Try a minus: x − 1
              </button>
            )}
          </div>
        )}
        {derived.ok && (
          <div className="feedback feedback-info" role="status" data-testid="area-total">
            {state.mode === 'binomial' ? 'Add the four cell areas' : 'Add the two cell areas'}: {derived.cells.map((c) => c.product).join(' + ')} ={' '}
            <strong>{derived.total.text}</strong>.
          </div>
        )}
        {/* A self-quiz only makes sense in a product lesson the learner drives themselves. */}
        {state.mode === 'binomial' && !embedded && (
          <div>
            <label className="field-label" htmlFor="area-compare">
              Check your own simplification
            </label>
            <input
              id="area-compare"
              className="input"
              value={compare}
              placeholder="e.g. x^2 + 3x + 2"
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              onChange={(e) => setCompare(e.target.value)}
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

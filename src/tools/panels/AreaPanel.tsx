import { useState } from 'react';
import { AreaState, compareExpressions, createArea, deriveArea, deriveBinomialArea } from '../expressions';
import { AreaView } from '../views/AreaView';
import { ToolControls, ToolHeader } from './shared';
import { MathView as Math } from '../../components/MathComp';
import { tryParse } from '../../math/expression';

export interface AreaPanelProps {
  /** Heading level for the panel title: 2 when embedded under a lesson h1. */
  level?: 1 | 2;
  state: AreaState;
  onChange: (s: AreaState) => void;
}

/** Rectangle models for distribution (a(b + c)) and binomial products (p + q)(r + s). */
export function AreaPanel({ state, onChange, level }: AreaPanelProps) {
  const [mode, setMode] = useState<'distribute' | 'binomial'>('binomial');
  const [b2, setB2] = useState('x + 2');
  const [compare, setCompare] = useState('');
  const dist = deriveArea(state);
  const binom = deriveBinomialArea(state.a, b2);
  const derived = mode === 'distribute' ? dist : binom;

  const field = (key: keyof AreaState, label: string) => {
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

  const verdict = compare.trim() ? compareExpressions(binom.total.text, compare) : null;

  return (
    <div className="stack">
      <ToolHeader level={level} title="Area model" description="A product is a rectangle. Split each side into parts and the rectangle splits into smaller rectangles — each cell is one product." />
      <div className="tool-tabs" role="tablist" aria-label="Area model type">
        <button type="button" role="tab" aria-selected={mode === 'binomial'} onClick={() => setMode('binomial')}>
          (x + 1)(x + 2)
        </button>
        <button type="button" role="tab" aria-selected={mode === 'distribute'} onClick={() => setMode('distribute')}>
          a(b + c)
        </button>
      </div>
      <div className="equation-strip" aria-live="polite">
        <div className="stack-sm" style={{ gap: 0, minWidth: 0, flex: 1 }}>
          <span className="equation-strip-label">{mode === 'binomial' ? 'Product' : 'Total area'}</span>
          <div className="math-display" style={{ padding: 0 }}>
            <Math
              tex={`\\left(${mode === 'binomial' ? state.a : state.a}\\right)\\left(${mode === 'binomial' ? b2 : `${state.b} + ${state.c}`}\\right) = ${derived.total.latex || '?'}`}
              label={`Total ${derived.total.text || 'unknown'}`}
            />
          </div>
        </div>
      </div>
      <div className="tool-canvas">
        <AreaView derived={derived} />
      </div>
      <ToolControls>
        {mode === 'binomial' ? (
          <div className="tile-grid" style={{ gap: 'var(--sp-3)' }}>
            {field('a', 'First factor (p + q)')}
            <div>
              <label className="field-label" htmlFor="area-second">
                Second factor (r + s)
              </label>
              <input
                id="area-second"
                className="input"
                value={b2}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                onChange={(e) => setB2(e.target.value)}
                data-testid="area-input-second"
              />
            </div>
          </div>
        ) : (
          <div className="tile-grid" style={{ gap: 'var(--sp-3)' }}>
            {field('a', 'Outside factor a')}
            {field('b', 'First term inside b')}
            {field('c', 'Second term inside c')}
          </div>
        )}
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setMode('binomial');
              onChange({ ...createArea(), a: 'x + 1' });
              setB2('x + 2');
            }}
          >
            Example: (x + 1)(x + 2)
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setMode('distribute');
              onChange({ a: '3', b: 'x', c: '2' });
            }}
          >
            Example: 3(x + 2)
          </button>
          {mode === 'binomial' && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ ...state, a: 'x - 1' })}>
              Try a minus: x − 1
            </button>
          )}
        </div>
        {derived.ok && (
          <div className="feedback feedback-info" role="status">
            Add the four cell areas: {derived.cells.map((c) => c.product).join(' + ')} = <strong>{derived.total.text}</strong>.
          </div>
        )}
        {mode === 'binomial' && (
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

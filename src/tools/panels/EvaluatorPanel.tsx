import { useState } from 'react';
import { EvalState, compareExpressions, createEval, deriveEval, deriveSimplify } from '../expressions';
import { DescriptionList, Stepper, ToolControls, ToolHeader } from './shared';
import { MathView as Math } from '../../components/MathComp';
import { toLatex } from '../../math/evaluate';
import { tryParse } from '../../math/expression';

const num = { round: (n: number) => globalThis.Math.round(n), abs: (n: number) => globalThis.Math.abs(n), max: (a: number, b: number) => globalThis.Math.max(a, b), min: (a: number, b: number) => globalThis.Math.min(a, b) };

export interface EvaluatorPanelProps {
  /** Heading level for the panel title: 2 when embedded under a lesson h1. */
  level?: 1 | 2;
  state: EvalState;
  onChange: (s: EvalState) => void;
  mode?: 'evaluate' | 'simplify';
}

/** One expression tool with two focused modes: evaluate at a value, or simplify. */
export function EvaluatorPanel({ state, onChange, mode = 'evaluate', level }: EvaluatorPanelProps) {
  const [draft, setDraft] = useState(state.expression);
  const [error, setError] = useState<string | null>(null);
  const d = deriveEval(state);
  const s = deriveSimplify(state);
  const parsed = tryParse(draft);
  // Results are only shown for the text in the box. While the box holds something
  // unreadable, the previous model's result must not be presented as this input's.
  const draftMatchesModel = draft === state.expression;

  const commit = (raw: string) => {
    setDraft(raw);
    const check = tryParse(raw);
    if (!check.ok) {
      // Keep the last valid model; show the parse error honestly.
      setError(check.error.message);
      return;
    }
    setError(null);
    onChange({ ...state, expression: raw });
  };

  const inputId = `expr-input-${mode}`;
  return (
    <div className="stack">
      <ToolHeader
        level={level}
        title={mode === 'evaluate' ? 'Expression evaluator' : 'Simplify an expression'}
        description={
          mode === 'evaluate'
            ? 'Type an expression using x, then choose a value for x. Results are exact when possible.'
            : 'Type a polynomial expression (with x) and see it expanded and collected. The original expression is never changed.'
        }
      />
      <div className="equation-strip" aria-live="polite" data-testid="evaluator-strip">
        <div className="stack-sm" style={{ gap: 0, minWidth: 0, flex: 1 }}>
          <span className="equation-strip-label">{mode === 'evaluate' ? `Value at x = ${state.x}` : 'Simplified'}</span>
          <div className="math-display" style={{ padding: 0 }}>
            {mode === 'evaluate' ? (
              d.ok ? (
                <Math tex={`${d.latex} = ${d.numeric ?? '?'}`} label={`${d.text} = ${d.numeric}`} />
              ) : (
                <span className="muted">{d.error}</span>
              )
            ) : s.ok ? (
              <Math tex={s.latex ?? ''} label={s.text} />
            ) : (
              <span className="muted">{s.text ? <Math tex={s.latex ?? ''} label={s.text} /> : s.error}</span>
            )}
          </div>
        </div>
      </div>
      <ToolControls>
        <div>
          <label className="field-label" htmlFor={inputId}>
            Expression
          </label>
          <input
            id={inputId}
            className="input answer-input"
            value={draft}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            inputMode="text"
            placeholder="e.g. 3(x + 2) - x"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-error` : undefined}
            onChange={(e) => commit(e.target.value)}
            data-testid="expression-input"
          />
          {error && (
            <p className="field-error" id={`${inputId}-error`} role="alert">
              {error}
            </p>
          )}
          <p className="xsmall muted mt-2 mb-0">
            Use numbers, single letters (x, y), + − × ÷ ^ and brackets. Typed with a keyboard: 2x, 3(x+1), x^2.
          </p>
        </div>
        {parsed.ok && (
          <div className="feedback feedback-info" role="status" data-testid="expression-latex">
            Read as <Math tex={toLatex(parsed.expr)} label="parsed expression" />
          </div>
        )}
        {mode === 'evaluate' ? (
          <>
            <Stepper label="Value of x" value={state.x} min={-20} max={20} onChange={(v) => onChange({ ...state, x: num.round(v) })} />
            <div className="btn-row">
              {[-2, -1, 0, 1, 2, 3].map((v) => (
                <button key={v} type="button" className="btn btn-secondary btn-sm" onClick={() => onChange({ ...state, x: v })} aria-pressed={state.x === v}>
                  x = {v}
                </button>
              ))}
            </div>
            {d.ok && draftMatchesModel && (
              <div className={`feedback ${d.numeric?.includes('approx') ? 'feedback-hint' : 'feedback-success'}`} role="status" data-testid="evaluator-result">
                Substituting x = {state.x} into the expression gives {d.numeric}.
              </div>
            )}
          </>
        ) : (
          <>
            {!s.ok && s.error && draftMatchesModel && (
              <div className="feedback feedback-error" role="alert" data-testid="simplify-error">
                {s.error}
              </div>
            )}
            {s.ok && draftMatchesModel && (
              <div className="feedback feedback-success" role="status" data-testid="simplify-result">
                The simplified form is <Math tex={s.latex ?? ''} label={s.text} />. It gives the same value for every value of x.
              </div>
            )}
          </>
        )}
        <div className="btn-row">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => commit(createEval(mode === 'simplify' ? { expression: '3(x + 2) - x' } : {}).expression)}>
            Example: 3(x + 2) − x
          </button>
        </div>
      </ToolControls>
      <DescriptionList
        title="How it works"
        lines={[
          'The input is parsed by a small, safe expression parser — never executed as code.',
          'Substitution uses exact fractions, so 1/3 + 1/6 is shown as 1/2 rather than a rounded decimal.',
          mode === 'simplify'
            ? 'Simplification expands products and collects like terms using exact arithmetic.'
            : 'Only polynomial-style expressions with one or more letter variables are supported.',
        ]}
      />
    </div>
  );
}

export interface SimplifyPanelProps {
  state: { expression: string };
  onChange: (s: { expression: string }) => void;
}

/** Compare mode: two expressions, equivalence verdict with explicit uncertainty. */
export function ComparePanel({ a, b }: { a: string; b: string }) {
  const res = compareExpressions(a, b);
  return (
    <div className={`feedback ${res.result === 'yes' ? 'feedback-success' : res.result === 'no' ? 'feedback-error' : 'feedback-hint'}`} role="status" data-testid="compare-result">
      {res.message}
    </div>
  );
}

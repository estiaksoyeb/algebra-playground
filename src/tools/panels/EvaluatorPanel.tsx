import { useState } from 'react';
import { EvalState, compareExpressions, createEval, deriveEval, deriveSimplify } from '../expressions';
import { DescriptionList, Stepper, ToolControls, ToolHeader } from './shared';
import { MathView as Math } from '../../components/MathComp';
import { toLatex } from '../../math/evaluate';
import { tryParse, evaluationSteps } from '../../math/expression';

const num = { round: (n: number) => globalThis.Math.round(n), abs: (n: number) => globalThis.Math.abs(n), max: (a: number, b: number) => globalThis.Math.max(a, b), min: (a: number, b: number) => globalThis.Math.min(a, b) };

export interface EvaluatorPanelProps {
  /** Heading level for the panel title: 2 when embedded under a lesson h1. */
  level?: 1 | 2;
  /** True when the panel is embedded in a lesson step (no developer explanations). */
  embedded?: boolean;
  state: EvalState;
  onChange: (s: EvalState) => void;
  mode?: 'evaluate' | 'simplify';
}

const NUMERIC_HINT = 'Use numbers, + − × ÷ ^ and brackets, e.g. 2 + 3 * 4 or (2 + 3) * 4.';
const VARIABLE_HINT = 'Use numbers, single letters (x, y), + − × ÷ ^ and brackets. Typed with a keyboard: 2x, 3(x+1), x^2.';
const NUMERIC_DESCRIPTION = 'Type a numeric expression to evaluate it step by step using the order of operations.';

/** `2 + 3 * 4` → `(2 + 3) * 4`: brackets around the whole sum that is being multiplied. */
function bracketTheSum(expression: string): string {
  const parsed = tryParse(expression);
  if (parsed.ok && parsed.expr.type === 'add') return `(${expression}) * 4`;
  return '(2 + 3) * 4';
}

/** One expression tool with two focused modes: evaluate at a value, or simplify. */
export function EvaluatorPanel({ state, onChange, mode = 'evaluate', level, embedded }: EvaluatorPanelProps) {
  const [draft, setDraft] = useState(state.expression);
  const [error, setError] = useState<string | null>(null);
  const showSteps = embedded;
  const d = deriveEval(state);
  const s = deriveSimplify(state);
  const parsed = tryParse(draft);
  // Results are only shown for the text in the box. While the box holds something
  // unreadable, the previous model's result must not be presented as this input's.
  const draftMatchesModel = draft === state.expression;
  // A variable-free expression ("2 + 3 * 4") gets the arithmetic wording and no x controls.
  const numeric = d.ok && (d.vars ?? []).length === 0;

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
  const steps = embedded && mode === 'evaluate' && numeric && draftMatchesModel ? evaluationSteps(d.expr!) : [];
  return (
    <div className="stack">
      <ToolHeader
        level={level}
        title={mode === 'evaluate' ? 'Expression evaluator' : 'Simplify an expression'}
        description={
          mode === 'evaluate'
            ? numeric
              ? embedded
                ? NUMERIC_DESCRIPTION
                : 'Type a calculation and see its exact value. Use numbers, or a letter like x.'
              : 'Type an expression using x, then choose a value for x. Results are exact when possible.'
            : 'Type a polynomial expression (with x) and see it expanded and collected. The original expression is never changed.'
        }
      />
      <div className="equation-strip" aria-live="polite" data-testid="evaluator-strip">
        <div className="stack-sm" style={{ gap: 0, minWidth: 0, flex: 1 }}>
          <span className="equation-strip-label">{mode === 'simplify' ? 'Simplified' : numeric ? 'Result' : `Value at x = ${state.x}`}</span>
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
            placeholder={numeric ? 'e.g. 2 + 3 * 4' : 'e.g. 3(x + 2) - x'}
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
          <p className="xsmall muted mt-2 mb-0">{numeric ? NUMERIC_HINT : VARIABLE_HINT}</p>
        </div>
        {parsed.ok && (
          <div className="feedback feedback-info" role="status" data-testid="expression-latex">
            Read as <Math tex={toLatex(parsed.expr)} label="parsed expression" />
          </div>
        )}
        {mode === 'evaluate' ? (
          <>
            {/* x only exists in the UI when the expression actually contains a variable. */}
            {!numeric && (
              <>
                <Stepper label="Value of x" value={state.x} min={-20} max={20} onChange={(v) => onChange({ ...state, x: num.round(v) })} />
                <div className="btn-row">
                  {[-2, -1, 0, 1, 2, 3].map((v) => (
                    <button key={v} type="button" className="btn btn-secondary btn-sm" onClick={() => onChange({ ...state, x: v })} aria-pressed={state.x === v}>
                      x = {v}
                    </button>
                  ))}
                </div>
              </>
            )}
            {numeric && embedded && (
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => commit('2 + 3 * 4')}
                  aria-pressed={state.expression === '2 + 3 * 4'}
                  data-testid="evaluator-without-brackets"
                >
                  Without brackets: 2 + 3 * 4
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => commit('(2 + 3) * 4')}
                  aria-pressed={state.expression === '(2 + 3) * 4'}
                  data-testid="evaluator-with-brackets"
                >
                  With brackets: (2 + 3) * 4
                </button>
              </div>
            )}
            {d.ok && draftMatchesModel && (
              <div className={`feedback ${d.numeric?.includes('approx') ? 'feedback-hint' : 'feedback-success'}`} role="status" data-testid="evaluator-result">
                {numeric ? `Evaluating ${d.text} gives ${d.numeric}.` : `Substituting x = ${state.x} into the expression gives ${d.numeric}.`}
              </div>
            )}
            {showSteps && steps.length > 0 && (
              <section className="card stack-sm" aria-label="Steps" data-testid="evaluator-steps">
                <span className="field-label" style={{ margin: 0 }}>
                  Order of operations
                </span>
                <ol style={{ margin: 0, paddingLeft: 22 }} className="small">
                  {steps.map((st, i) => (
                    <li key={i} data-testid="evaluator-step">
                      {st.text}
                    </li>
                  ))}
                </ol>
              </section>
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
        {/* The example is about letters, so it never appears in a numbers-only lesson step. */}
        {(!embedded || !numeric) && (
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => commit(createEval(mode === 'simplify' ? { expression: '3(x + 2) - x' } : {}).expression)}
            >
              Example: 3(x + 2) − x
            </button>
            {numeric && !embedded && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => commit(bracketTheSum(state.expression))}>
                Try with brackets
              </button>
            )}
          </div>
        )}
      </ToolControls>
      {/* Developer-facing notes ("safe parser", "polynomial-style") stay in the Playground. */}
      {!embedded && (
        <DescriptionList
          title="How it works"
          lines={[
            'Expressions follow the standard order of operations: brackets first, then powers, then multiplication and division, then addition and subtraction.',
            'Substitution uses exact fractions, so 1/3 + 1/6 is shown as 1/2 rather than a rounded decimal.',
            mode === 'simplify'
              ? 'Simplification expands products and collects like terms using exact arithmetic.'
              : 'You can evaluate numeric calculations or algebraic expressions with a variable like x.',
          ]}
        />
      )}
    </div>
  );
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

import { useMemo, useState } from 'react';
import { BalanceState, applyOperation, balanceEquation, balanceModel, solutionOf, verify } from '../balance';
import { BalanceView } from '../views/BalanceView';
import { DescriptionList, EquationStrip, Stepper, ToolControls, ToolHeader } from './shared';
import { MathView as Math } from '../../components/MathComp';
import { checkSolution, equationText } from '../../math/equation';
import type { HistoryState } from '../types';

export interface BalancePanelProps {
  /** Heading level for the panel title: 2 when embedded under a lesson h1. */
  level?: 1 | 2;
  history: HistoryState<BalanceState>;
  onChange: (h: HistoryState<BalanceState>) => void;
  onProblem?: (message: string) => void;
  /** True inside a lesson step: the state-description card is left out. */
  embedded?: boolean;
}

/**
 * Balance workspace. The displayed equation, the scale and the "check" result are all
 * derived from the same BalanceState via the math engine.
 */
export function BalancePanel({ history, onChange, onProblem, level, embedded }: BalancePanelProps) {
  const state = history.present;
  const [amount, setAmount] = useState(3);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [checked, setChecked] = useState<{ ok: boolean; text: string } | null>(null);
  const sym = balanceModel.symbolic(state);
  const desc = balanceModel.describe(state);
  const sol = solutionOf(state);
  const eq = useMemo(() => balanceEquation(state), [state]);

  const run = (rule: 'add' | 'subtract') => {
    const res = applyOperation(state, { rule, amount });
    if (!res.ok || !res.state) {
      setFeedback({ kind: 'error', text: res.error ?? 'That operation is not valid.' });
      onProblem?.(res.error ?? 'Operation not allowed');
      return;
    }
    onChange({ past: [...history.past, state].slice(-50), present: res.state, future: [] });
    setFeedback({ kind: 'ok', text: res.explanation ?? 'Done.' });
    setChecked(null);
  };

  const check = () => {
    if (!sol) {
      setChecked({ ok: false, text: 'There is no value of x that makes both sides equal.' });
      return;
    }
    const res = checkSolution(eq, 'x', sol);
    setChecked({
      ok: res.holds,
      text: res.error
        ? res.error
        : `Substitute x = ${sol.toString()}: left = ${res.left.value.toString()}, right = ${res.right.value.toString()}. ${res.holds ? 'Both sides match, so it is the solution.' : 'They differ.'}`,
    });
  };

  const plain = equationText(eq);
  /**
   * In a lesson the answer must not be handed over before the work: x is shown only
   * once the equation is down to "x = number" (one x-block on one side, units only on
   * the other), or after the learner asks for "Check the solution". The Playground
   * always shows it, because there the pill is a readout, not an answer key.
   */
  const isolated = state.left.x === 1 && state.right.x === 0 && state.left.units === 0
    ? true
    : state.right.x === 1 && state.left.x === 0 && state.right.units === 0;
  const showSolution = !embedded || isolated || checked !== null;
  return (
    <div className="stack">
      <ToolHeader level={level} title="Equation balance" description="Both sides must stay equal. Add or subtract the same amount on each side and watch the equation change with the scale." />
      <EquationStrip
        label="Equation"
        latex={<Math tex={sym.latex} label={sym.text} />}
      >
        {showSolution && (
          <span className="pill" data-testid="solution-pill">
            {sol ? `x = ${sol.toString()}` : 'no solution'}
          </span>
        )}
      </EquationStrip>
      <div className="tool-canvas">
        <BalanceView state={state} />
      </div>
      <ToolControls>
        <Stepper label="Amount" value={amount} min={0} max={20} onChange={setAmount} />
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => run('add')} data-testid="btn-add-both">
            Add {amount} to both sides
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => run('subtract')}
            data-testid="btn-subtract-both"
            disabled={amount <= 0}
          >
            Subtract {amount} from both sides
          </button>
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            data-testid="btn-check"
            onClick={check}
            disabled={!sol}
          >
            Check the solution
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const v = verify(state);
              setFeedback(v ? { kind: v.ok ? 'ok' : 'error', text: v.text } : { kind: 'info', text: 'No single solution to verify.' });
            }}
          >
            Substitute back
          </button>
        </div>
        {feedback && (
          <div className={`feedback ${feedback.kind === 'ok' ? 'feedback-success' : feedback.kind === 'error' ? 'feedback-error' : 'feedback-info'}`} role="status" data-testid="balance-feedback">
            {feedback.text}
          </div>
        )}
        {checked && (
          <div className={`feedback ${checked.ok ? 'feedback-success' : 'feedback-error'}`} role="status" data-testid="balance-check">
            {checked.text}
          </div>
        )}
      </ToolControls>
      {!embedded && <DescriptionList title={desc.title} lines={[...desc.lines, `Symbolically: ${plain}.`]} />}
    </div>
  );
}

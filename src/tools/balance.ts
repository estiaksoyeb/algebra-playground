/**
 * Balance-scale equation model.
 *
 * State is an equation (left/right as algebra "piles": x-count and unit-count) plus a
 * transformation history so the explanation and undo/redo are consistent with the visual.
 *
 * Operations are validated by the equation rules in math/equation.ts; the visual weights
 * are derived from the same expression, so a wrong operation can never change only one
 * representation. Piles are the visual interpretation for the beginner lessons.
 */
import { Expr, parseExpression } from '../math/expression';
import { Rational } from '../math/rational';
import { evaluateExact, toLatex, toPlainText } from '../math/evaluate';
import { checkSolution, equationLatex, equationText, solveLinear, applyTransform, TransformRule } from '../math/equation';
import { ToolModel } from './model';
import { t } from '../i18n';

export interface Pile {
  x: number;
  units: number;
}

export interface BalanceState {
  left: Pile;
  right: Pile;
  /** rule used in the last successful move, for narration */
  lastOperation?: { rule: TransformRule | 'set'; amount: number; text: string };
  /** wrong attempts are kept for tutor feedback, not applied */
  mistakes: string[];
  revision: number;
}

const P = (x: number, units: number): Pile => ({ x, units });

export function createBalance(init: { left?: Pile; right?: Pile } = {}): BalanceState {
  return {
    left: init.left ?? P(1, 3),
    right: init.right ?? P(0, 7),
    mistakes: [],
    revision: 0,
  };
}

export function pileExpr(p: Pile): Expr {
  const terms: Expr[] = [];
  if (p.x !== 0) {
    const coeff = p.x === 1 ? { type: 'var', name: 'x' } as Expr : { type: 'mul', factors: [{ type: 'num', value: Rational.of(p.x) }, { type: 'var', name: 'x' }] } as Expr;
    terms.push(coeff);
  }
  if (p.units !== 0 || p.x === 0) terms.push({ type: 'num', value: Rational.of(p.units) });
  if (terms.length === 0) return { type: 'num', value: Rational.ZERO };
  return terms.length === 1 ? terms[0] : { type: 'add', terms };
}

/** Convert a simple pile expression back to piles (only linear single-variable forms). */
export function parsePileSide(e: Expr): Pile | null {
  // Normalize to a x + b by evaluating structure
  const polyLike = collect(e);
  if (!polyLike) return null;
  return polyLike;
}

function collect(e: Expr): Pile | null {
  switch (e.type) {
    case 'num':
      if (!e.value.isInteger()) return null;
      return P(0, Number(e.value.n));
    case 'var':
      return e.name === 'x' ? P(1, 0) : null;
    case 'add': {
      const parts = e.terms.map(collect);
      if (parts.some((p) => p === null)) return null;
      return parts.reduce<Pile>((acc, p) => P(acc.x + p!.x, acc.units + p!.units), P(0, 0));
    }
    case 'mul': {
      const parts = e.factors.map(collect);
      if (parts.some((p) => p === null)) return null;
      // allow number × x only
      const unitFactors = parts.filter((p) => p!.x === 0 && p!.units >= 0);
      if (unitFactors.length === parts.length - 1) {
        const coeff = unitFactors.reduce((a, p) => a * p!.units, 1);
        return P(coeff, 0);
      }
      return null;
    }
    default:
      return null;
  }
}

export function balanceEquation(s: BalanceState) {
  return { left: pileExpr(s.left), right: pileExpr(s.right) };
}

export function isBalanced(s: BalanceState): boolean {
  const eq = balanceEquation(s);
  const sol = solveLinear(eq, 'x');
  if (sol.solution !== undefined) return true; // value exists making it true
  return false;
}

export function solutionOf(s: BalanceState): Rational | null {
  return solveLinear(balanceEquation(s), 'x').solution ?? null;
}

/** The operation a beginner would likely perform: amount to cancel from both sides. */
export function applyOperation(
  s: BalanceState,
  op: { rule: TransformRule; amount: number },
  locale?: string,
): { ok: boolean; state?: BalanceState; error?: string; explanation?: string } {
  if (!Number.isInteger(op.amount)) {
    return { ok: false, error: t('tool.balance.wholeNumberError', { lng: locale }) };
  }
  if (op.rule === 'multiply' || op.rule === 'divide') {
    // Visual weight then does not correspond to piles; refuse to avoid a false picture.
    return { ok: false, error: t('tool.balance.multiplyError', { lng: locale }) };
  }
  const eq = balanceEquation(s);
  const operand = parseExpression(String(Math.abs(op.amount)));
  if (op.rule === 'subtract' && op.amount < 0) {
    return { ok: false, error: t('tool.balance.positiveError', { lng: locale }) };
  }
  const result = applyTransform(eq, { rule: op.rule, operand });
  if (!result.ok || !result.equation) {
    return { ok: false, error: result.error ?? t('tool.balance.invalidError', { lng: locale }) };
  }
  const left = parsePileSide(result.equation.left);
  const right = parsePileSide(result.equation.right);
  if (!left || !right) {
    return { ok: false, error: t('tool.balance.complexError', { lng: locale }) };
  }
  return {
    ok: true,
    state: {
      ...s,
      left,
      right,
      lastOperation: {
        rule: op.rule,
        amount: op.amount,
        text:
          op.rule === 'add'
            ? t('tool.balance.addedBoth', { lng: locale, amount: op.amount })
            : t('tool.balance.subtractedBoth', { lng: locale, amount: op.amount }),
      },
      revision: s.revision + 1,
    },
    explanation: t(op.rule === 'add' ? 'tool.balance.addedExplanation' : 'tool.balance.removedExplanation', {
      lng: locale,
      // Both sides are maths: they stay in the language-independent plain notation.
      left: toPlainText(result.equation.left),
      right: toPlainText(result.equation.right),
    }),
  };
}

export type BalanceStep = { kind: 'subtract' | 'divide'; amount: number };

/** Tutoring script for a simple ax + b = c equation. */
export function balanceSteps(s: BalanceState): BalanceStep[] {
  const steps: BalanceStep[] = [];
  if (s.left.x === 1 && s.right.x === 0) {
    if (s.left.units !== 0) steps.push({ kind: 'subtract', amount: Math.abs(s.left.units) });
  } else if (s.left.x > 1 && s.left.units !== 0) {
    steps.push({ kind: 'subtract', amount: Math.abs(s.left.units) });
    steps.push({ kind: 'divide', amount: s.left.x });
  } else if (s.left.x > 1) {
    steps.push({ kind: 'divide', amount: s.left.x });
  }
  return steps;
}

export function verify(s: BalanceState, locale?: string): { ok: boolean; text: string } | null {
  const sol = solutionOf(s);
  if (!sol) return null;
  return nullSafeVerify(balanceEquation(s), sol, locale);
}

function nullSafeVerify(eq: { left: Expr; right: Expr }, sol: Rational, locale?: string): { ok: boolean; text: string } {
  const res = checkSolution(eq, 'x', sol);
  return {
    ok: res.holds,
    text: res.holds
      ? t('tool.balance.verifyOk', { lng: locale, left: toPlainText(eq.left), right: toPlainText(eq.right), value: sol.toString() })
      : t('tool.balance.verifyNo', { lng: locale, value: sol.toString() }),
  };
}

export function evaluateSide(e: Expr, x: Rational): string {
  try {
    return evaluateExact(e, { x }).value.toString();
  } catch {
    return '?';
  }
}

export const balanceModel: ToolModel<BalanceState> = {
  id: 'balance',
  label: 'Balance scale',
  defaultState: () => createBalance(),
  symbolic: (s) => {
    const eq = balanceEquation(s);
    return { latex: equationLatex(eq), text: equationText(eq), expr: eq.left };
  },
  describe: (s, locale) => {
    const sol = solutionOf(s);
    const eq = balanceEquation(s);
    const plural = (n: number) => (Math.abs(n) === 1 ? 'one' : 'many');
    return {
      title: t('tool.balance.title', { lng: locale }),
      lines: [
        t('tool.balance.leftSide', {
          lng: locale,
          x: s.left.x,
          xForm: plural(s.left.x),
          units: s.left.units,
          unitForm: plural(s.left.units),
        }),
        t('tool.balance.rightSide', {
          lng: locale,
          x: s.right.x,
          xForm: plural(s.right.x),
          units: s.right.units,
          unitForm: plural(s.right.units),
        }),
        sol
          ? t('tool.balance.balancesAt', { lng: locale, value: sol.toString(), left: toLatex(eq.left), right: toLatex(eq.right) })
          : t('tool.balance.neverBalances', { lng: locale }),
      ],
    };
  },
};

// Re-export helpers used by the view
export { pileExpr as sideToExpr };

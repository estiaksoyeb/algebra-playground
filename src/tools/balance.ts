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
): { ok: boolean; state?: BalanceState; error?: string; explanation?: string } {
  if (!Number.isInteger(op.amount)) return { ok: false, error: 'Use a whole number for the visual balance.' };
  if (op.rule === 'multiply' || op.rule === 'divide') {
    // Visual weight then does not correspond to piles; refuse to avoid a false picture.
    return { ok: false, error: 'Multiplication and division change the number of x-blocks, which the pile picture cannot show honestly. Use the symbolic step instead, or try adding/subtracting — those keep the scale picture correct.' };
  }
  const eq = balanceEquation(s);
  const operand = parseExpression(String(Math.abs(op.amount)));
  if (op.rule === 'subtract' && op.amount < 0) return { ok: false, error: 'Subtract a positive amount.' };
  const result = applyTransform(eq, { rule: op.rule, operand });
  if (!result.ok || !result.equation) return { ok: false, error: result.error ?? 'Invalid operation.' };
  const left = parsePileSide(result.equation.left);
  const right = parsePileSide(result.equation.right);
  if (!left || !right) {
    return { ok: false, error: 'That operation makes the picture too complex to show with blocks.' };
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
            ? `Added ${op.amount} to both sides.`
            : `Subtracted ${op.amount} from both sides.`,
      },
      revision: s.revision + 1,
    },
    explanation:
      op.rule === 'add'
        ? `Adding the same weight to both pans keeps the scale level. Check: ${toPlainText(result.equation.left)} = ${toPlainText(result.equation.right)}.`
        : `Removing the same weight from both pans keeps the scale level. Check: ${toPlainText(result.equation.left)} = ${toPlainText(result.equation.right)}.`,
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

export function verify(s: BalanceState): { ok: boolean; text: string } | null {
  const sol = solutionOf(s);
  if (!sol) return null;
  return nullSafeVerify(balanceEquation(s), sol);
}

function nullSafeVerify(eq: { left: Expr; right: Expr }, sol: Rational): { ok: boolean; text: string } {
  const res = checkSolution(eq, 'x', sol);
  return {
    ok: res.holds,
    text: res.holds
      ? `Check: ${toPlainText(eq.left)} = ${toPlainText(eq.right)} when x = ${sol.toString()}. ✓`
      : `The two sides do not match for x = ${sol.toString()}.`,
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
  describe: (s) => {
    const sol = solutionOf(s);
    const eq = balanceEquation(s);
    return {
      title: 'Balance scale',
      lines: [
        `Left side: ${s.left.x} x-block${s.left.x === 1 ? '' : 's'} and ${s.left.units} unit${Math.abs(s.left.units) === 1 ? '' : 's'}.`,
        `Right side: ${s.right.x} x-block${s.right.x === 1 ? '' : 's'} and ${s.right.units} unit${Math.abs(s.right.units) === 1 ? '' : 's'}.`,
        sol
          ? `The scale balances when x = ${sol.toString()}. Check: ${toLatex(eq.left)} = ${toLatex(eq.right)}.`
          : 'This scale cannot balance: the x-blocks never match.',
      ],
    };
  },
};

// Re-export helpers used by the view
export { pileExpr as sideToExpr };

/**
 * Equation model and validated transformations.
 *
 * An equation is stored as two parsed expression trees (left, right). Every
 * transformation records a rule and validates preconditions before mutating.
 * Invalid transformations return an error and leave the equation untouched.
 */
import { Expr, ParseError, parseExpression, exprEquals } from './expression';
import { EvalError, evaluateExact, EvalResult, Env, toLatex, toPlainText } from './evaluate';
import { Polynomial, toPolynomial, UnsupportedExpressionError } from './polynomial';
import { Rational } from './rational';

export type Equation = { left: Expr; right: Expr };

export function parseEquation(input: string): Equation {
  const parts = splitEquation(input);
  return { left: parseExpression(parts.left), right: parseExpression(parts.right) };
}

export function tryParseEquation(input: string): { ok: true; equation: Equation } | { ok: false; error: ParseError } {
  try {
    return { ok: true, equation: parseEquation(input) };
  } catch (e) {
    return { ok: false, error: e instanceof ParseError ? e : new ParseError(e instanceof Error ? e.message : 'Invalid equation') };
  }
}

export function splitEquation(input: string): { left: string; right: string } {
  const parts = input.split('=');
  if (parts.length !== 2) {
    throw new ParseError(parts.length < 2 ? 'An equation needs an equals sign, like x + 3 = 7' : 'An equation can only have one equals sign');
  }
  return { left: parts[0], right: parts[1] };
}

export function equationLatex(eq: Equation): string {
  return `${toLatex(eq.left)} = ${toLatex(eq.right)}`;
}

export function equationText(eq: Equation): string {
  return `${toPlainText(eq.left)} = ${toPlainText(eq.right)}`;
}

/** Substitute a candidate value for one variable and check both sides. */
export function checkSolution(eq: Equation, variableName: string, value: Rational): { holds: boolean; left: EvalResult; right: EvalResult; error?: string } {
  const env: Env = { [variableName]: value };
  try {
    const left = evaluateExact(eq.left, env);
    const right = evaluateExact(eq.right, env);
    return { holds: left.value.eq(right.value), left, right };
  } catch (err) {
    return {
      holds: false,
      left: { value: Rational.ZERO, exact: false },
      right: { value: Rational.ZERO, exact: false },
      error: err instanceof EvalError ? err.message : 'Could not evaluate the equation',
    };
  }
}

export type TransformRule = 'add' | 'subtract' | 'multiply' | 'divide';

export interface TransformRequest {
  rule: TransformRule;
  /** Quantity applied to both sides (parsed expression). */
  operand: Expr;
  variableName?: string;
}

export interface TransformResult {
  ok: boolean;
  equation?: Equation;
  error?: string;
  explanation?: string;
  warning?: string;
}

/** True when the operand could be zero for some value of the variables (unsupported constructs treated conservatively). */
function mayBeZero(operand: Expr, variableNames: string[]): boolean {
  if (variableNames.length === 0) {
    try {
      return evaluateExact(operand, {}).value.isZero();
    } catch {
      return true;
    }
  }
  try {
    toPolynomial(operand);
    // Any expression containing variables might equal zero for some input.
    return true;
  } catch {
    return true;
  }
}

export function applyTransform(eq: Equation, req: TransformRequest): TransformResult {
  const operand = req.operand;
  const opLatex = toLatex(operand);
  const side = (s: Expr): Expr => {
    switch (req.rule) {
      case 'add':
        return { type: 'add', terms: [s, operand] };
      case 'subtract':
        return { type: 'add', terms: [s, { type: 'mul', factors: [{ type: 'num', value: Rational.of(-1) }, operand] }] };
      case 'multiply':
        return { type: 'mul', factors: [s, operand] };
      case 'divide':
        return { type: 'mul', factors: [s, { type: 'pow', base: operand, exp: -1 }] };
    }
  };
  const next: Equation = { left: side(eq.left), right: side(eq.right) };

  switch (req.rule) {
    case 'add':
      return { ok: true, equation: next, explanation: `Added ${opLatex} to both sides. Equality is preserved.` };
    case 'subtract':
      return { ok: true, equation: next, explanation: `Subtracted ${opLatex} from both sides. Equality is preserved.` };
    case 'multiply':
      if (mayBeZero(operand, Object.keys(collectVariables(eq)))) {
        return {
          ok: false,
          error: `Multiplying both sides by ${toPlainText(operand)} is not allowed here because it could be zero, which can add or destroy solutions. Use a nonzero number.`,
        };
      }
      return { ok: true, equation: next, explanation: `Multiplied both sides by ${opLatex}. Equality is preserved.` };
    case 'divide': {
      if (mayBeZero(operand, Object.keys(collectVariables(eq)))) {
        return {
          ok: false,
          error: `Cannot divide by ${toPlainText(operand)}: division by zero is undefined. Use a nonzero number.`,
        };
      }
      return { ok: true, equation: next, explanation: `Divided both sides by ${opLatex}. Equality is preserved.` };
    }
  }
}

function collectVariables(eq: Equation): Set<string> {
  const set = new Set<string>();
  for (const side of [eq.left, eq.right]) walk(side, (v) => set.add(v));
  return set;
}

function walk(e: Expr, f: (name: string) => void): void {
  if (e.type === 'var') f(e.name);
  else if (e.type === 'add') e.terms.forEach((t) => walk(t, f));
  else if (e.type === 'mul') e.factors.forEach((t) => walk(t, f));
  else if (e.type === 'pow') walk(e.base, f);
  else if (e.type === 'func') walk(e.arg, f);
}

/** Compare equations by solution set over supported polynomial equations (both sides). */
export function equationsEquivalent(a: Equation, b: Equation): 'yes' | 'no' | 'unsupported' {
  try {
    const diffA = toPolynomial(a.left).sub(toPolynomial(a.right));
    const diffB = toPolynomial(b.left).sub(toPolynomial(b.right));
    // Equivalent if one difference is a nonzero constant multiple of the other.
    if (diffA.isZero() && diffB.isZero()) return 'yes';
    if (diffA.isZero() || diffB.isZero()) return 'no';
    if (diffA.terms.length !== diffB.terms.length) return 'no';
    const ratio = diffB.terms[0].coeff.div(diffA.terms[0].coeff);
    if (ratio.isZero()) return 'no';
    const scaled = new Polynomial(diffA.terms.map((t) => ({ exps: t.exps, coeff: t.coeff.mul(ratio) })));
    return scaled.equals(diffB) ? 'yes' : 'no';
  } catch (err) {
    if (err instanceof UnsupportedExpressionError) return 'unsupported';
    return 'unsupported';
  }
}

/**
 * Check whether an equation is of the simple solvable form a·v = b or a·v + c = b
 * with numeric a,c,b; returns the solution and the sequence of steps for the tutor.
 */
export function solveLinear(eq: Equation, variableName: string): { solution?: Rational; error?: string; steps?: { text: string; latex: string }[] } {
  try {
    const left = toPolynomial(eq.left);
    const right = toPolynomial(eq.right);
    const coeffOf = (p: Polynomial, v: string): Rational => p.terms.find((t) => Object.keys(t.exps).length === 1 && t.exps[v] === 1)?.coeff ?? Rational.ZERO;
    const constOf = (p: Polynomial): Rational => p.terms.find((t) => Object.keys(t.exps).length === 0)?.coeff ?? Rational.ZERO;
    for (const p of [left, right]) {
      const other = p.terms.find((t) => Object.keys(t.exps).some((v) => v !== variableName));
      if (other) return { error: `This equation has more variables than just ${variableName}.` };
    }
    const a = coeffOf(left, variableName).sub(coeffOf(right, variableName));
    const b = constOf(right).sub(constOf(left));
    if (a.isZero()) {
      return b.isZero() ? { error: 'This is an identity: every value works.' } : { error: 'This equation has no solution.' };
    }
    const solution = b.div(a);
    const steps = buildLinearSteps(left, right, variableName, solution);
    return { solution, steps };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not solve' };
  }
}

function buildLinearSteps(left: Polynomial, right: Polynomial, v: string, solution: Rational): { text: string; latex: string }[] {
  const steps: { text: string; latex: string }[] = [];
    const cL = left.terms.find((t) => Object.keys(t.exps).length === 0)?.coeff ?? Rational.ZERO;
    const aL = left.terms.find((t) => Object.keys(t.exps).join() === v)?.coeff ?? Rational.ZERO;
    const rightConst = right.terms.find((t) => Object.keys(t.exps).length === 0)?.coeff ?? Rational.ZERO;
    if (!cL.isZero()) {
      steps.push({
        text: `Subtract ${cL.abs().toString()} from both sides to isolate the ${v} part.`,
        latex: `-${cL.abs().toLatex()}`,
      });
      steps.push({ text: 'Both sides are still equal.', latex: `${aL.mul(solution).toLatex()} = ${rightConst.sub(cL).toLatex()}` });
    }
    if (!aL.eq(Rational.ONE)) {
      steps.push({ text: `Divide both sides by ${aL.toString()}.`, latex: `\\div ${aL.toLatex()}` });
    }
    steps.push({ text: 'So the unknown takes this value.', latex: `${v} = ${solution.toLatex()}` });
    return steps;
  if (!aL.eq(Rational.ONE)) {
    steps.push({ text: `Divide both sides by ${aL.toString()}.`, latex: `\\div ${aL.toLatex()}` });
  }
  steps.push({ text: 'So the unknown takes this value.', latex: `${v} = ${solution.toLatex()}` });
  return steps;
}

export { exprEquals };

/**
 * Exact evaluation and LaTeX rendering of parsed expressions.
 * Evaluation is exact (Rational) for +, -, *, /, integer powers and abs;
 * sqrt is exact when the radicand is a perfect square of a rational,
 * otherwise a numerically approximated value is returned with an `exact` flag.
 */
import { Expr } from './expression';
import { Rational } from './rational';

export interface EvalResult {
  value: Rational;
  exact: boolean;
}

export type Env = Record<string, Rational>;

export class EvalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvalError';
  }
}

export function evaluateExact(e: Expr, env: Env): EvalResult {
  switch (e.type) {
    case 'num':
      return { value: e.value, exact: true };
    case 'var': {
      const v = env[e.name];
      if (!v) throw new EvalError(`No value given for ${e.name}`);
      return { value: v, exact: true };
    }
    case 'add': {
      let value = Rational.ZERO;
      let exact = true;
      for (const t of e.terms) {
        const r = evaluateExact(t, env);
        value = value.add(r.value);
        exact = exact && r.exact;
      }
      return { value, exact };
    }
    case 'mul': {
      let value = Rational.ONE;
      let exact = true;
      for (const t of e.factors) {
        const r = evaluateExact(t, env);
        value = value.mul(r.value);
        exact = exact && r.exact;
      }
      return { value, exact };
    }
    case 'pow': {
      const r = evaluateExact(e.base, env);
      if (e.exp < 0 && r.value.isZero()) throw new EvalError('Division by zero');
      return { value: r.value.pow(e.exp), exact: r.exact };
    }
    case 'func': {
      const r = evaluateExact(e.arg, env);
      if (e.name === 'abs') return { value: r.value.abs(), exact: r.exact };
      // sqrt: exact if perfect square of rational
      if (r.value.isNegative()) throw new EvalError('Cannot take the square root of a negative number');
      const n = r.value.n;
      const d = r.value.d;
      const sn = bigintSqrt(n);
      const sd = bigintSqrt(d);
      if (sn !== null && sd !== null) return { value: Rational.of(sn, sd), exact: true };
      return { value: Rational.of(Math.sqrt(r.value.toNumber())), exact: false };
    }
  }
}

function bigintSqrt(n: bigint): bigint | null {
  if (n < 0n) return null;
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x * x === n ? x : null;
}

export interface NumericEvaluation {
  /** undefined when some variable is unbound or evaluation failed */
  value?: number;
  error?: string;
}

export function evaluateNumeric(e: Expr, env: Record<string, number>): NumericEvaluation {
  try {
    const r = evaluateExact(
      e,
      Object.fromEntries(Object.entries(env).map(([k, v]) => [k, Rational.of(v)])),
    );
    return { value: r.value.toNumber() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Evaluation failed' };
  }
}

const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
};

export function toUnicodePow(base: string, exp: number): string {
  return exp === 1 ? base : `${base}${String(exp).split('').map((c) => SUP[c] ?? `^${c}`).join('')}`;
}

/** Render an expression to LaTeX. Parentheses added based on precedence. */
export function toLatex(e: Expr, needsParens = 0): string {
  switch (e.type) {
    case 'num':
      return e.value.toLatex();
    case 'var':
      return e.name;
    case 'add': {
      const parts: string[] = [];
      e.terms.forEach((t, i) => {
        const isNeg = isNegativeTerm(t);
        const inner = isNeg ? negateTerm(t) : t;
        const s = toLatex(inner, 2);
        if (i === 0) parts.push(isNeg ? `-${s}` : s);
        else parts.push(`${isNeg ? '-' : '+'}${s}`);
      });
      const body = parts.join('');
      return needsParens >= 2 ? `\\left(${body}\\right)` : body;
    }
    case 'mul': {
      const body = e.factors.map((f, i) => {
        const s = toLatex(f, 3);
        if (i === 0) return s;
        return /^\\frac|^\\sqrt|^\\left\(/.test(s) || isNumeric(f) ? `\\cdot ${s}` : `\\,${s}`;
      }).join('');
      return needsParens >= 3 ? `\\left(${body}\\right)` : body;
    }
    case 'pow': {
      const base = toLatex(e.base, 4);
      const wrapped = e.base.type === 'add' || e.base.type === 'mul' ? `\\left(${toLatex(e.base, 0)}\\right)` : base;
      if (e.exp < 0) return `\\frac{1}{${wrapped}^{${-e.exp}}}`;
      return e.exp === 1 ? wrapped : `${wrapped}^{${e.exp}}`;
    }
    case 'func':
      return e.name === 'sqrt' ? `\\sqrt{${toLatex(e.arg, 0)}}` : `\\left|${toLatex(e.arg, 0)}\\right|`;
  }
}

function isNumeric(e: Expr): boolean {
  return e.type === 'num';
}

function isNegativeTerm(e: Expr): boolean {
  if (e.type === 'num') return e.value.isNegative();
  if (e.type === 'mul' && e.factors.length > 0 && e.factors[0].type === 'num') return e.factors[0].value.isNegative();
  return false;
}

function negateTerm(e: Expr): Expr {
  if (e.type === 'num') return { type: 'num', value: e.value.neg() };
  if (e.type === 'mul' && e.factors[0].type === 'num') {
    return { type: 'mul', factors: [{ type: 'num', value: e.factors[0].value.neg() }, ...e.factors.slice(1)] };
  }
  return { type: 'mul', factors: [{ type: 'num', value: Rational.of(-1) }, e] };
}

/** Best plain-text form (for diagnostics, history entries, aria labels). */
export function toPlainText(e: Expr): string {
  switch (e.type) {
    case 'num':
      return e.value.toString();
    case 'var':
      return e.name;
    case 'add':
      return e.terms
        .map((t, i) => {
          const s = toPlainText(t);
          return i === 0 ? s : s.startsWith('-') ? ` - ${s.slice(1)}` : ` + ${s}`;
        })
        .join('');
    case 'mul':
      return e.factors.map((f) => (f.type === 'add' ? `(${toPlainText(f)})` : toPlainText(f))).join('*');
    case 'pow':
      return e.exp < 0 ? `1/${toPlainText(e.base)}^${-e.exp}` : `${e.base.type === 'add' ? `(${toPlainText(e.base)})` : toPlainText(e.base)}^${e.exp}`;
    case 'func':
      return `${e.name}(${toPlainText(e.arg)})`;
  }
}

/**
 * Expression tools: eval / simplify / area model. One pure parse-and-derive core,
 * with explicit unsupported cases (division by variables, non-polynomial functions).
 */
import { tryParse, parseExpression, Expr } from '../math/expression';
import { evaluateExact, toLatex, toPlainText } from '../math/evaluate';
import { polynomialEquivalence, polyToLatex, polyToText, toPolynomial } from '../math/polynomial';
import { Rational } from '../math/rational';

export interface EvalState {
  expression: string;
  x: number;
}

export function createEval(init: Partial<EvalState> = {}): EvalState {
  return { expression: init.expression ?? '2x + 3', x: init.x ?? 4 };
}

export interface Derived {
  ok: boolean;
  latex?: string;
  text?: string;
  error?: string;
  numeric?: string;
  expr?: Expr;
}

export function deriveEval(s: EvalState): Derived {
  const parsed = tryParse(s.expression);
  if (!parsed.ok) return { ok: false, error: parsed.error.message };
  const latex = toLatex(parsed.expr);
  let numeric: string | undefined;
  try {
    const r = evaluateExact(parsed.expr, { x: Rational.of(s.x), y: Rational.of(s.x), a: Rational.of(s.x), b: Rational.of(s.x) });
    numeric = r.exact ? r.value.toString() : `${r.value.toNumber().toFixed(4)} (approx.)`;
  } catch (err) {
    numeric = undefined;
    void err;
  }
  return { ok: true, latex, text: toPlainText(parsed.expr), numeric, expr: parsed.expr };
}

export function deriveSimplify(s: { expression: string }): Derived & { substituted?: string } {
  const parsed = tryParse(s.expression);
  if (!parsed.ok) return { ok: false, error: parsed.error.message };
  try {
    const p = toPolynomial(parsed.expr);
    return { ok: true, latex: polyToLatex(p), text: polyToText(p), expr: parsed.expr };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error && /division|not a polynomial/i.test(err.message)
          ? 'This playground simplifies polynomial expressions only (no division by variables or roots). The expression was not changed.'
          : 'This expression is outside the supported algebra. It was not changed.',
      latex: toLatex(parsed.expr),
      text: toPlainText(parsed.expr),
    };
  }
}

export interface AreaState {
  a: string;
  b: string;
  c: string;
}

export function createArea(init: Partial<AreaState> = {}): AreaState {
  return { a: init.a ?? '2', b: init.b ?? 'x', c: init.c ?? '3' };
}

export interface AreaCell {
  row: string;
  col: string;
  product: string;
  latex: string;
}

export interface AreaDerived {
  ok: boolean;
  error?: string;
  rows: string[];
  cols: string[];
  cells: AreaCell[];
  total: { latex: string; text: string };
}

const coef = (s: string): number | null => {
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

function termProduct(r: string, c: string): { text: string; latex: string } | null {
  const p = tryParse(`(${r})*(${c})`);
  if (!p.ok) return null;
  try {
    const poly = toPolynomial(p.expr);
    return { text: polyToText(poly), latex: polyToLatex(poly) };
  } catch {
    return null;
  }
}

/** Area model for (a)(b + c) with a numeric, b and c simple terms. */
export function deriveArea(s: AreaState): AreaDerived {
  const rows = [s.b, s.c];
  const cols = [s.a];
  const cells: AreaCell[] = [];
  for (const r of rows) {
    for (const c of cols) {
      const product = termProduct(r, c);
      if (!product) {
        return { ok: false, error: `Cannot draw the product of ${r} and ${c} with the area model.`, rows, cols, cells: [], total: { latex: '', text: '' } };
      }
      cells.push({ row: r, col: c, product: product.text, latex: product.latex });
    }
  }
  const total = termProduct(`(${s.a})`, `(${s.b})+(${s.c})`);
  if (!total) return { ok: false, error: 'Cannot simplify the total area.', rows, cols, cells, total: { latex: '', text: '' } };
  return { ok: true, rows, cols, cells, total: { latex: total.latex, text: total.text } };
}

/**
 * Area model for products of two binomials: (p + q)(r + s).
 * Used when the "a" field contains a binomial.
 */
export function deriveBinomialArea(first: string, second: string): AreaDerived {
  const p = tryParse(first);
  const q = tryParse(second);
  if (!p.ok || !q.ok) {
    return { ok: false, error: 'Enter two binomials like (x + 1) and (x + 2).', rows: [], cols: [], cells: [], total: { latex: '', text: '' } };
  }
  const split = (e: Expr): string[] | null => {
    if (e.type === 'add') {
      return e.terms.map((t) => {
        const poly = safePoly(t);
        return poly ? polyToText(poly) : null;
      }).filter((x): x is string => x !== null);
    }
    const poly = safePoly(e);
    return poly ? [polyToText(poly)] : null;
  };
  const rows = split(p.expr);
  const cols = split(q.expr);
  if (!rows || !cols) return { ok: false, error: 'Could not split those factors into rectangle parts.', rows: [], cols: [], cells: [], total: { latex: '', text: '' } };
  const cells: AreaCell[] = [];
  for (const r of rows) {
    for (const c of cols) {
      const product = termProduct(r, c);
      if (!product) return { ok: false, error: 'Unsupported product.', rows, cols, cells: [], total: { latex: '', text: '' } };
      cells.push({ row: r, col: c, product: product.text, latex: product.latex });
    }
  }
  try {
    const total = toPolynomial(p.expr).mul(toPolynomial(q.expr));
    return { ok: true, rows, cols, cells, total: { latex: polyToLatex(total), text: polyToText(total) } };
  } catch {
    return { ok: false, error: 'Unsupported product.', rows, cols, cells, total: { latex: '', text: '' } };
  }
}

function safePoly(e: Expr) {
  try {
    return toPolynomial(e);
  } catch {
    return null;
  }
}

export function compareExpressions(a: string, b: string): { result: 'yes' | 'no' | 'unsupported' | 'error'; message: string } {
  const pa = tryParse(a);
  const pb = tryParse(b);
  if (!pa.ok) return { result: 'error', message: `First expression: ${pa.error.message}` };
  if (!pb.ok) return { result: 'error', message: `Second expression: ${pb.error.message}` };
  const eq = polynomialEquivalence(pa.expr, pb.expr);
  if (eq.result === 'unsupported') return { result: 'unsupported', message: eq.reason ?? 'Cannot verify symbolically.' };
  return eq.result === 'yes'
    ? { result: 'yes', message: 'Yes — they are equivalent for every value of the variables.' }
    : { result: 'no', message: 'No — they differ. Try substituting a value or simplify one of them step by step.' };
}

export { coef, parseExpression };

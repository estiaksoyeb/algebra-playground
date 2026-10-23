/**
 * Exact multivariate polynomial arithmetic over Rational coefficients.
 *
 * Used for:
 * - simplification (canonical form: combined like terms, descending degree)
 * - equivalence checking by canonical comparison (sound for polynomial equality)
 * - like-term diagnostics (which terms can be combined)
 *
 * Only polynomial expressions (+, -, *, non-negative integer powers, numeric constants)
 * are representable. Non-polynomial parts (sqrt/abs/division by variables) are reported
 * as unsupported rather than coerced.
 */
import { Expr } from './expression';
import { Rational } from './rational';

/** Sorted variable names, e.g. [{x:2},{x:1,y:1},{}] */
export type Monomial = { exps: Record<string, number>; coeff: Rational };

export class Polynomial {
  readonly terms: Monomial[];

  constructor(terms: Monomial[] = []) {
    this.terms = normalizeTerms(terms);
  }

  static constant(r: Rational): Polynomial {
    return new Polynomial([{ exps: {}, coeff: r }]);
  }
  static variable(name: string): Polynomial {
    return new Polynomial([{ exps: { [name]: 1 }, coeff: Rational.ONE }]);
  }
  static zero(): Polynomial {
    return new Polynomial([]);
  }

  isZero(): boolean {
    return this.terms.length === 0;
  }
  isConstant(): boolean {
    return this.terms.every((t) => Object.keys(t.exps).length === 0);
  }
  constantValue(): Rational | null {
    return this.isConstant() ? (this.terms[0]?.coeff ?? Rational.ZERO) : null;
  }
  variables(): string[] {
    const s = new Set<string>();
    this.terms.forEach((t) => Object.keys(t.exps).forEach((v) => s.add(v)));
    return [...s].sort();
  }
  degree(): number {
    return this.terms.reduce((m, t) => Math.max(m, totalDegree(t.exps)), 0);
  }

  add(o: Polynomial): Polynomial {
    return new Polynomial([...this.terms, ...o.terms]);
  }
  sub(o: Polynomial): Polynomial {
    return new Polynomial([...this.terms, ...o.terms.map((t) => ({ exps: t.exps, coeff: t.coeff.neg() }))]);
  }
  neg(): Polynomial {
    return new Polynomial(this.terms.map((t) => ({ exps: t.exps, coeff: t.coeff.neg() })));
  }
  mul(o: Polynomial): Polynomial {
    if (this.isZero() || o.isZero()) return Polynomial.zero();
    const out: Monomial[] = [];
    for (const a of this.terms) {
      for (const b of o.terms) {
        const exps: Record<string, number> = { ...a.exps };
        for (const [v, k] of Object.entries(b.exps)) exps[v] = (exps[v] ?? 0) + k;
        out.push({ exps, coeff: a.coeff.mul(b.coeff) });
      }
    }
    return new Polynomial(out);
  }
  pow(k: number): Polynomial {
    if (!Number.isInteger(k) || k < 0) throw new Error('Polynomial power must be a non-negative integer');
    let result = Polynomial.constant(Rational.ONE);
    for (let i = 0; i < k; i++) result = result.mul(this);
    return result;
  }

  equals(o: Polynomial): boolean {
    if (this.terms.length !== o.terms.length) return false;
    return this.terms.every((t, i) => sameExps(t.exps, o.terms[i].exps) && t.coeff.eq(o.terms[i].coeff));
  }

  evaluate(env: Record<string, Rational>): Rational {
    let sum = Rational.ZERO;
    for (const t of this.terms) {
      let v = t.coeff;
      for (const [name, k] of Object.entries(t.exps)) {
        const x = env[name];
        if (!x) throw new Error(`Missing value for ${name}`);
        v = v.mul(x.pow(k));
      }
      sum = sum.add(v);
    }
    return sum;
  }

  /** Parse a plain-text polynomial-like expression from the library (x^2, 2x*y, 3/4). */
  static parseText(text: string): Polynomial {
    const parser = new TextPolyParser(text);
    return parser.parse();
  }
}

export function totalDegree(exps: Record<string, number>): number {
  return Object.values(exps).reduce((a, b) => a + b, 0);
}

export function expsKey(exps: Record<string, number>): string {
  return Object.keys(exps)
    .filter((k) => exps[k] !== 0)
    .sort()
    .map((k) => `${k}^${exps[k]}`)
    .join('*');
}

function sameExps(a: Record<string, number>, b: Record<string, number>): boolean {
  return expsKey(a) === expsKey(b);
}

function normalizeTerms(terms: Monomial[]): Monomial[] {
  const map = new Map<string, Rational>();
  for (const t of terms) {
    if (t.coeff.isZero()) continue;
    const key = expsKey(t.exps);
    const prev = map.get(key);
    map.set(key, prev ? prev.add(t.coeff) : t.coeff);
    if (map.get(key)?.isZero()) map.delete(key);
  }
  const out: Monomial[] = [];
  for (const [key, coeff] of map) {
    const exps: Record<string, number> = {};
    if (key) for (const part of key.split('*')) {
      const [v, k] = part.split('^');
      exps[v] = Number(k);
    }
    out.push({ exps, coeff });
  }
  // Sort: by total degree desc, then lexicographic by variable exponents (x before y, higher x first)
  out.sort((a, b) => {
    const da = totalDegree(a.exps);
    const db = totalDegree(b.exps);
    if (da !== db) return db - da;
    const vars = [...new Set([...Object.keys(a.exps), ...Object.keys(b.exps)])].sort();
    for (const v of vars) {
      const diff = (b.exps[v] ?? 0) - (a.exps[v] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  });
  return out;
}

export class UnsupportedExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedExpressionError';
  }
}

/** Convert an Expr tree into a Polynomial. Throws UnsupportedExpressionError for non-polynomials. */
export function toPolynomial(e: Expr): Polynomial {
  switch (e.type) {
    case 'num':
      return Polynomial.constant(e.value);
    case 'var':
      return Polynomial.variable(e.name);
    case 'add':
      return e.terms.reduce<Polynomial>((acc, t) => acc.add(toPolynomial(t)), Polynomial.zero());
    case 'mul':
      return e.factors.reduce<Polynomial>((acc, t) => acc.mul(toPolynomial(t)), Polynomial.constant(Rational.ONE));
    case 'pow': {
      const base = toPolynomial(e.base);
      if (base.isZero()) {
        if (e.exp < 0) throw new UnsupportedExpressionError('Division by zero');
        return Polynomial.zero();
      }
      if (base.isConstant()) return Polynomial.constant(base.constantValue()!.pow(e.exp));
      if (e.exp < 0) throw new UnsupportedExpressionError('Expressions with division by a variable are not supported here.');
      return base.pow(e.exp);
    }
    case 'func':
      throw new UnsupportedExpressionError(`The function "${e.name}" is not a polynomial, so algebraic equivalence cannot be checked symbolically.`);
  }
}

function monomialText(t: Monomial): string {
  const parts: string[] = [];
  for (const v of Object.keys(t.exps).sort()) {
    const k = t.exps[v];
    if (k === 1) parts.push(v);
    else if (k > 0) parts.push(`${v}^${k}`);
  }
  return parts.join('*');
}

/** Canonical plain-text form, e.g. "2x^2 - 3x + 1". */
export function polyToText(p: Polynomial): string {
  if (p.isZero()) return '0';
  return p.terms
    .map((t, i) => {
      const mono = monomialText(t);
      const abs = t.coeff.abs();
      let coeffStr = '';
      if (!mono) coeffStr = abs.toString();
      else if (abs.eq(Rational.ONE)) coeffStr = '';
      else coeffStr = abs.toString();
      const piece = `${coeffStr}${mono}`;
      if (i === 0) return t.coeff.isNegative() ? `-${piece}` : piece;
      return t.coeff.isNegative() ? ` - ${piece}` : ` + ${piece}`;
    })
    .join('');
}

/** LaTeX canonical form. */
export function polyToLatex(p: Polynomial): string {
  if (p.isZero()) return '0';
  return p.terms
    .map((t, i) => {
      const monoParts: string[] = [];
      for (const v of Object.keys(t.exps).sort()) {
        const k = t.exps[v];
        if (k === 1) monoParts.push(v);
        else if (k > 0) monoParts.push(`${v}^{${k}}`);
      }
      const mono = monoParts.join('');
      const abs = t.coeff.abs();
      let coeffStr = '';
      if (!mono) coeffStr = abs.toLatex();
      else if (!abs.eq(Rational.ONE)) coeffStr = abs.toLatex();
      const piece = `${coeffStr}${mono}`;
      if (i === 0) return t.coeff.isNegative() ? `-${piece}` : piece;
      return t.coeff.isNegative() ? `-${piece}` : `+${piece}`;
    })
    .join(' ');
}

/**
 * Determine whether two parsed expressions are equivalent polynomials.
 * Returns 'yes' | 'no' | 'unsupported' (with reason).
 */
export function polynomialEquivalence(
  a: Expr,
  b: Expr,
): { result: 'yes' | 'no' | 'unsupported'; reason?: string; pa?: Polynomial; pb?: Polynomial } {
  try {
    const pa = toPolynomial(a);
    const pb = toPolynomial(b);
    return { result: pa.equals(pb) ? 'yes' : 'no', pa, pb };
  } catch (err) {
    return { result: 'unsupported', reason: err instanceof Error ? err.message : String(err) };
  }
}

// ---------- Small text parser for polynomial library content ----------
class TextPolyParser {
  private i = 0;
  constructor(private readonly s: string) {}
  parse(): Polynomial {
    const p = this.expr();
    this.ws();
    if (this.i < this.s.length) throw new Error(`Unexpected "${this.s[this.i]}" in "${this.s}"`);
    return p;
  }
  private ws() {
    while (this.i < this.s.length && this.s[this.i] === ' ') this.i++;
  }
  private expr(): Polynomial {
    let p = this.term();
    for (;;) {
      this.ws();
      if (this.s[this.i] === '+') {
        this.i++;
        p = p.add(this.term());
      } else if (this.s[this.i] === '-') {
        this.i++;
        p = p.sub(this.term());
      } else return p;
    }
  }
  private term(): Polynomial {
    let p = this.unary();
    for (;;) {
      this.ws();
      if (this.s[this.i] === '*') {
        this.i++;
        p = p.mul(this.unary());
      } else if (this.i < this.s.length && /[a-z0-9(]/.test(this.s[this.i])) {
        p = p.mul(this.unary());
      } else return p;
    }
  }
  private unary(): Polynomial {
    this.ws();
    if (this.s[this.i] === '-') {
      this.i++;
      return this.unary().neg();
    }
    return this.power();
  }
  private power(): Polynomial {
    const base = this.primary();
    this.ws();
    if (this.s[this.i] === '^') {
      this.i++;
      const start = this.i;
      while (this.i < this.s.length && /[0-9]/.test(this.s[this.i])) this.i++;
      const k = Number(this.s.slice(start, this.i));
      return base.pow(k);
    }
    return base;
  }
  private primary(): Polynomial {
    this.ws();
    const c = this.s[this.i];
    if (c === '(') {
      this.i++;
      const p = this.expr();
      this.ws();
      if (this.s[this.i] !== ')') throw new Error('Missing )');
      this.i++;
      return p;
    }
    if (/[0-9.]/.test(c)) {
      const start = this.i;
      while (this.i < this.s.length && /[0-9.]/.test(this.s[this.i])) this.i++;
      return Polynomial.constant(Rational.parse(this.s.slice(start, this.i)));
    }
    if (/[a-z]/.test(c)) {
      const start = this.i;
      while (this.i < this.s.length && /[a-z]/.test(this.s[this.i])) this.i++;
      const name = this.s.slice(start, this.i);
      if (name.length > 1) throw new Error(`Variables must be single letters, got "${name}"`);
      return Polynomial.variable(name);
    }
    throw new Error(`Unexpected "${c ?? 'end'}" in "${this.s}"`);
  }
}

/**
 * Exact rational arithmetic (bigint numerator/denominator, always normalized).
 * Used for fractions in lessons, exercises, answer checking and transforms so we
 * never depend on floating point for exactness.
 */
export class Rational {
  readonly n: bigint;
  readonly d: bigint;

  private constructor(n: bigint, d: bigint) {
    this.n = n;
    this.d = d;
  }

  static of(n: number | bigint, d: number | bigint = 1): Rational {
    if (typeof n === 'bigint' && typeof d === 'bigint') return Rational.make(n, d);
    if (!Number.isFinite(Number(n)) || !Number.isFinite(Number(d))) {
      throw new Error(`Rational.of: non-finite input (${String(n)}/${String(d)})`);
    }
    if (!Number.isInteger(Number(n)) || !Number.isInteger(Number(d))) {
      // Convert finite decimals exactly (e.g. 0.25 -> 1/4).
      const a = decimalToFraction(Number(n));
      const b = decimalToFraction(Number(d));
      return Rational.make(a.n * b.d, a.d * b.n);
    }
    return Rational.make(BigInt(n), BigInt(d));
  }

  static readonly ZERO = Rational.make(0n, 1n);
  static readonly ONE = Rational.make(1n, 1n);

  /**
   * Accept the serialized shape `{ n: bigint, d: bigint }` (JSON turns bigints into
   * strings, so both are accepted). Used when reloading persisted tool states.
   */
  static from(x: unknown): Rational | null {
    if (!x || typeof x !== 'object') return null;
    const o = x as { n?: unknown; d?: unknown };
    try {
      const n = typeof o.n === 'bigint' ? o.n : BigInt(String(o.n));
      const d = typeof o.d === 'bigint' ? o.d : BigInt(String(o.d));
      return Rational.make(n, d);
    } catch {
      return null;
    }
  }

  /** JSON-safe representation (bigints become decimal strings). */
  toJSON(): { n: string; d: string } {
    return { n: this.n.toString(), d: this.d.toString() };
  }

  static make(n: bigint, d: bigint): Rational {
    if (d === 0n) throw new Error('Division by zero');
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d);
    return new Rational(n / g, d / g);
  }

  static parse(text: string): Rational {
    const s = text.trim();
    const m = /^(-?\d+)\s*\/\s*(-?\d+)$/.exec(s);
    if (m) return Rational.make(BigInt(m[1]), BigInt(m[2]));
    if (/^-?\d+$/.test(s)) return Rational.make(BigInt(s), 1n);
    if (/^-?(\d+\.\d+|\d+)$/.test(s)) {
      const f = decimalToFraction(Number(s));
      return f;
    }
    throw new Error(`Invalid rational: ${text}`);
  }

  add(o: Rational): Rational {
    return Rational.make(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  sub(o: Rational): Rational {
    return Rational.make(this.n * o.d - o.n * this.d, this.d * o.d);
  }
  mul(o: Rational): Rational {
    return Rational.make(this.n * o.n, this.d * o.d);
  }
  div(o: Rational): Rational {
    if (o.isZero()) throw new Error('Division by zero');
    return Rational.make(this.n * o.d, this.d * o.n);
  }
  neg(): Rational {
    return Rational.make(-this.n, this.d);
  }
  abs(): Rational {
    return this.n < 0n ? this.neg() : this;
  }
  cmp(o: Rational): number {
    const a = this.n * o.d;
    const b = o.n * this.d;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  eq(o: Rational): boolean {
    return this.n === o.n && this.d === o.d;
  }
  isZero(): boolean {
    return this.n === 0n;
  }
  isInteger(): boolean {
    return this.d === 1n;
  }
  isPositive(): boolean {
    return this.n > 0n;
  }
  isNegative(): boolean {
    return this.n < 0n;
  }
  toNumber(): number {
    return Number(this.n) / Number(this.d);
  }
  /** Exact decimal string if terminating within 12 places, else available=false. */
  toDecimal(): { text: string; exact: boolean } {
    const asNum = Number(this.n) / Number(this.d);
    if (this.isInteger()) return { text: this.n.toString(), exact: true };
    // Check for terminating decimal: denominator factorized only in 2s and 5s.
    let d = this.d;
    let twos = 0;
    let fives = 0;
    while (d % 2n === 0n) {
      d /= 2n;
      twos++;
    }
    while (d % 5n === 0n) {
      d /= 5n;
      fives++;
    }
    if (d === 1n) {
      const places = Math.max(twos, fives);
      return { text: trimNum(asNum.toFixed(Math.min(places, 20))), exact: true };
    }
    return { text: trimNum(asNum.toFixed(6)), exact: false };
  }
  pow(k: number): Rational {
    if (!Number.isInteger(k)) throw new Error('pow: integer exponent only');
    if (k < 0) return Rational.ONE.div(this.pow(-k));
    let result = Rational.ONE;
    for (let i = 0; i < k; i++) result = result.mul(this);
    return result;
  }
  /** Human readable: integers as "3", fractions as "3/4", mixed numbers never (unambiguous). */
  toString(): string {
    return this.isInteger() ? this.n.toString() : `${this.n}/${this.d}`;
  }
  /** LaTeX: \frac{3}{4} or -3. */
  toLatex(): string {
    if (this.isInteger()) return this.n.toString();
    const sign = this.n < 0n ? '-' : '';
    const n = (this.n < 0n ? -this.n : this.n).toString();
    return `${sign}\\frac{${n}}{${this.d}}`;
  }
  valueOf(): number {
    return this.toNumber();
  }
}

function trimNum(s: string): string {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a === 0n ? 1n : a;
}

function decimalToFraction(x: number): Rational {
  if (!Number.isFinite(x)) throw new Error('Non-finite');
  const s = x.toString();
  if (!s.includes('e') && !s.includes('E')) {
    const neg = s.startsWith('-');
    const [ip, fp = ''] = (neg ? s.slice(1) : s).split('.');
    const den = 10n ** BigInt(fp.length);
    const num = BigInt((ip || '0') + fp) * (neg ? -1n : 1n);
    return Rational.make(num, den);
  }
  // Scientific notation (very large/small): scale conservatively.
  const [mant, expStr] = s.toLowerCase().split('e');
  const exp = parseInt(expStr, 10);
  const base = decimalToFraction(Number(mant));
  if (exp >= 0) return base.mul(Rational.of(10).pow(exp));
  return base.div(Rational.of(10).pow(-exp));
}

/** Format an exponent as LaTeX superscript. */
export function latexPow(base: string, exp: number): string {
  return exp === 1 ? base : `${base}^{${exp}}`;
}

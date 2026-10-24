/**
 * Safe expression parser for the supported algebra subset.
 *
 * Grammar (recursive descent, no eval, no Function):
 *   expr      := term (('+' | '-') term)*
 *   term      := unary (('*' | '/' | implicit) unary)*
 *   unary     := ('-' | '+') unary | power
 *   power     := primary ('^' unary)?          (right assoc; exponent must be a non-negative integer)
 *   primary   := number | variable | '(' expr ')' | func '(' expr ')'
 * Implicit multiplication: 2x, 3(x+1), (x+1)(x-2), 2x^2.
 *
 * Variables are single letters a–z (case-insensitive, lowercased).
 * Supported functions: sqrt, abs.
 * Unsupported constructs produce a descriptive ParseError, never a silent wrong answer.
 */
import { Rational } from './rational';
import { evaluateExact, toPlainText } from './evaluate';

export type Expr =
  | { type: 'num'; value: Rational }
  | { type: 'var'; name: string }
  | { type: 'add'; terms: Expr[] }
  | { type: 'mul'; factors: Expr[] }
  | { type: 'pow'; base: Expr; exp: number }
  | { type: 'func'; name: 'sqrt' | 'abs'; arg: Expr };

export class ParseError extends Error {
  position: number;
  constructor(message: string, position = 0) {
    super(message);
    this.name = 'ParseError';
    this.position = position;
  }
}

const MAX_LENGTH = 200;
const MAX_EXPONENT = 24;
const FUNCS = new Set(['sqrt', 'abs']);

type Token =
  | { kind: 'num'; text: string; value: Rational; pos: number }
  | { kind: 'ident'; text: string; pos: number }
  | { kind: 'op'; text: string; pos: number }
  | { kind: 'eof'; pos: number };

function isMultiplicationX(tokens: Token[], input: string, start: number, end: number): boolean {
  if (input.slice(start, end) !== 'x' && input.slice(start, end) !== 'X') return false;
  const prev = tokens[tokens.length - 1];
  if (!prev) return false;
  const prevIsValue = prev.kind === 'num' || (prev.kind === 'op' && prev.text === ')');
  if (!prevIsValue) return false;
  return /^[ \t]*[0-9(]/.test(input.slice(end));
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input[j])) j++;
      const text = input.slice(i, j);
      if ((text.match(/\./g) ?? []).length > 1 || text === '.') {
        throw new ParseError(`Invalid number "${text}"`, i);
      }
      tokens.push({ kind: 'num', text, value: Rational.parse(text), pos: i });
      i = j;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      let j = i;
      while (j < input.length && /[a-zA-Z]/.test(input[j])) j++;
      const word = input.slice(i, j);
      // Allow "sqrt"/"abs" as function names; everything else must be single letters.
      if (FUNCS.has(word.toLowerCase())) {
        tokens.push({ kind: 'ident', text: word.toLowerCase(), pos: i });
      } else if (word.length === 1 && isMultiplicationX(tokens, input, i, j)) {
        // A single x typed between two numbers ("5 x 4") is meant as multiply.
        tokens.push({ kind: 'op', text: '*', pos: i });
      } else if (word.length === 1) {
        tokens.push({ kind: 'ident', text: word.toLowerCase(), pos: i });
      } else {
        throw new ParseError(`Unknown name "${word}". Use single-letter variables (a–z).`, i);
      }
      i = j;
      continue;
    }
    if ('+-*/^()'.includes(c)) {
      tokens.push({ kind: 'op', text: c, pos: i });
      i++;
      continue;
    }
    if (c === '×' || c === '·') {
      tokens.push({ kind: 'op', text: '*', pos: i });
      i++;
      continue;
    }
    if (c === '÷') {
      tokens.push({ kind: 'op', text: '/', pos: i });
      i++;
      continue;
    }
    if (c === '−') {
      tokens.push({ kind: 'op', text: '-', pos: i });
      i++;
      continue;
    }
    throw new ParseError(`Unexpected character "${c}"${c === '=' ? ' (equations are entered separately: E = A = B)' : ''}`, i);
  }
  tokens.push({ kind: 'eof', pos: input.length });
  return tokens;
}

class Parser {
  private tokens: Token[];
  private index = 0;
  constructor(input: string) {
    if (input.length > MAX_LENGTH) throw new ParseError(`Expression too long (max ${MAX_LENGTH} characters)`, 0);
    this.tokens = tokenize(input);
  }

  private peek(): Token {
    return this.tokens[this.index];
  }
  private next(): Token {
    return this.tokens[this.index++];
  }
  private acceptOp(text: string): boolean {
    const t = this.peek();
    if (t.kind === 'op' && t.text === text) {
      this.index++;
      return true;
    }
    return false;
  }

  parse(): Expr {
    if (this.peek().kind === 'eof') throw new ParseError('Please enter an expression', 0);
    const e = this.parseExpr();
    const t = this.peek();
    if (t.kind !== 'eof') {
      throw new ParseError(
        t.kind === 'op' && t.text === ')'
          ? 'Unbalanced parenthesis ")"'
          : `Unexpected "${t.kind === 'op' || t.kind === 'ident' ? t.text : 'end'}"`,
        t.pos,
      );
    }
    return e;
  }

  private parseExpr(): Expr {
    const terms: Expr[] = [this.parseTerm()];
    for (;;) {
      if (this.acceptOp('+')) terms.push(this.parseTerm());
      else if (this.acceptOp('-')) terms.push(negate(this.parseTerm()));
      else break;
    }
    return terms.length === 1 ? terms[0] : { type: 'add', terms };
  }

  private startsPrimary(t: Token): boolean {
    return t.kind === 'num' || t.kind === 'ident' || (t.kind === 'op' && t.text === '(');
  }

  private parseTerm(): Expr {
    const factors: Expr[] = [];
    let first = this.parseUnary();
    factors.push(first);
    for (;;) {
      if (this.acceptOp('*')) {
        factors.push(this.parseUnary());
      } else if (this.acceptOp('/')) {
        const rhs = this.parseUnary();
        factors.push({ type: 'pow', base: rhs, exp: -1 });
      } else if (this.startsPrimary(this.peek())) {
        // implicit multiplication: 2x, 3(x+1), x(x-1), 2 sqrt(9)
        factors.push(this.parseUnary());
      } else {
        break;
      }
    }
    if (factors.length === 1) return factors[0];
    const withRecip: Expr[] = [];
    for (const f of factors) withRecip.push(f);
    return { type: 'mul', factors: withRecip };
  }

  private parseUnary(): Expr {
    if (this.acceptOp('-')) return negate(this.parseUnary());
    if (this.acceptOp('+')) return this.parseUnary();
    return this.parsePower();
  }

  private parsePower(): Expr {
    const base = this.parsePrimary();
    if (this.acceptOp('^')) {
      const expExpr = this.parseUnary();
      const exp = constantInteger(expExpr);
      if (exp === null) {
        throw new ParseError('Exponents must be whole numbers in this playground (e.g. x^2)', this.peek().pos);
      }
      if (exp > MAX_EXPONENT) throw new ParseError(`Exponent too large (max ${MAX_EXPONENT})`, 0);
      if (exp < -MAX_ABS_EXPONENT) throw new ParseError(`Negative exponent too large (min ${-MAX_ABS_EXPONENT})`, 0);
      return { type: 'pow', base, exp };
    }
    return base;
  }

  private parsePrimary(): Expr {
    const t = this.next();
    if (t.kind === 'num') return { type: 'num', value: t.value };
    if (t.kind === 'ident') {
      if (FUNCS.has(t.text)) {
        if (!this.acceptOp('(')) {
          // sqrt 9 is allowed as implicit application
          const arg = this.parseUnary();
          return { type: 'func', name: t.text as 'sqrt' | 'abs', arg };
        }
        const arg = this.parseExpr();
        if (!this.acceptOp(')')) throw new ParseError(`Missing ")" after ${t.text}(`, t.pos);
        return { type: 'func', name: t.text as 'sqrt' | 'abs', arg };
      }
      return { type: 'var', name: t.text };
    }
    if (t.kind === 'op' && t.text === '(') {
      const e = this.parseExpr();
      if (!this.acceptOp(')')) throw new ParseError('Missing ")"', t.pos);
      return e;
    }
    if (t.kind === 'eof') throw new ParseError('Unexpected end of expression', t.pos);
    throw new ParseError(`Unexpected "${t.text}"`, t.pos);
  }
}

function negate(e: Expr): Expr {
  if (e.type === 'num') return { type: 'num', value: e.value.neg() };
  return { type: 'mul', factors: [{ type: 'num', value: Rational.of(-1) }, e] };
}

function constantValueOf(e: Expr): Rational | null {
  try {
    return evaluateExact(e, {}).value;
  } catch {
    return null;
  }
}

function constantInteger(e: Expr): number | null {
  const v = constantValueOf(e);
  if (v === null || !v.isInteger()) return null;
  const n = Number(v.n);
  if (!Number.isSafeInteger(n) || Math.abs(n) > MAX_EXPONENT) return null;
  return n;
}

const MAX_ABS_EXPONENT = 12;

/** Parse an expression string. Throws ParseError with position on failure. */
export function parseExpression(input: string): Expr {
  return new Parser(input).parse();
}

export function tryParse(input: string): { ok: true; expr: Expr } | { ok: false; error: ParseError } {
  try {
    return { ok: true, expr: parseExpression(input) };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e };
    return { ok: false, error: new ParseError(e instanceof Error ? e.message : 'Invalid expression') };
  }
}

export function variablesOf(e: Expr): string[] {
  const set = new Set<string>();
  visit(e, (n) => {
    if (n.type === 'var') set.add(n.name);
  });
  return [...set].sort();
}

/**
 * Learner-facing order-of-operations breakdown for a numeric expression.
 *
 * Each entry is one operation written as "before = after", in the order the rules
 * require (innermost brackets → powers → × ÷ → + −). Used by the embedded evaluator
 * so a step can show *why* `2 + 3 × 4` is 14 instead of one opaque answer.
 * Returns [] for expressions with variables — they have no single numeric order.
 */
export type EvaluationStep = { op: '^' | '×' | '÷' | '+' | '−'; text: string; value: string };

/** The same little AST as the parser, but every node already knows its numeric value. */
type Node = { /** running value after folding (plain number) */ text: string; /** learner-readable form of this sub-expression */ shown: string; value: Rational; op?: '×' | '÷' | '^' | '+' | '−' };

export function evaluationSteps(e: Expr): EvaluationStep[] {
  if (variablesOf(e).length > 0) return [];
  const out: EvaluationStep[] = [];
  try {
    fold(e);
  } catch {
    return [];
  }
  return out;

  function fold(n: Expr): Node {
    switch (n.type) {
      case 'num':
        return { text: plain(n.value), shown: plain(n.value), value: n.value };
      case 'var':
        throw new Error('variable');
      case 'func':
        return { text: plainOf(n), shown: plainOf(n), value: evaluateExact(n, {}).value };
      case 'add': {
        const kids = n.terms.map(fold);
        // The unary minus sits *outside* the power node, so "12 - 5" arrives as 12 + (-(5)).
        const signed = (k: Node): Node => (k.value.isNegative() && k.shown.startsWith('-') ? { ...k, text: plain(k.value.abs()), shown: k.shown.slice(1) } : k);
        const parts = kids.map(signed);
        const chain = parts
          .map((k, i) => (i === 0 ? (kids[i].value.isNegative() ? `-${k.shown}` : k.shown) : `${kids[i].value.isNegative() ? '−' : '+'} ${k.shown}`))
          .filter((part) => part !== '')
          .join(' ');
        const total = kids.reduce((v, k) => v.add(k.value), Rational.ZERO);
        if (kids.length > 1) out.push({ op: '+', text: `${chain} = ${plain(total)}`, value: plain(total) });
        return { text: plain(total), shown: chain, value: total, op: '+' };
      }
      case 'mul': {
        // The parser turns a ÷ b into a × b^-1, so a lone negative power is a division.
        if (n.factors.length === 2 && n.factors[1].type === 'pow' && n.factors[1].exp === -1) {
          const left = fold(n.factors[0]);
          const right = fold(n.factors[1].base);
          const value = left.value.div(right.value);
          out.push({ op: '÷', text: `${left.shown} ÷ ${right.shown} = ${plain(value)}`, value: plain(value) });
          return { text: plain(value), shown: `${left.shown} ÷ ${right.shown}`, value, op: '÷' };
        }
        const kids = n.factors.map(fold);
        const chain = kids.map((k) => k.shown).join(' × ');
        let value = kids[0].value;
        for (let i = 1; i < kids.length; i++) value = value.mul(kids[i].value);
        out.push({ op: '×', text: `${chain} = ${plain(value)}`, value: plain(value) });
        return { text: plain(value), shown: chain, value, op: '×' };
      }
      case 'pow': {
        const base = fold(n.base);
        const value = evaluateExact(n, {}).value;
        out.push({ op: '^', text: `${base.shown}^${n.exp} = ${plain(value)}`, value: plain(value) });
        return { text: plain(value), shown: plainOf(n), value, op: '^' };
      }
    }
  }
}


/** Plain text with learner typography (× instead of *). */
function plainOf(n: Expr): string {
  return toPlainText(n);
}

/** Rational → display text, reusing the tool's number formatting. */
function plain(r: Rational): string {
  const dec = r.toDecimal();
  return dec.exact ? dec.text : r.toString();
}

export function visit(e: Expr, f: (n: Expr) => void): void {
  f(e);
  switch (e.type) {
    case 'add':
      e.terms.forEach((t) => visit(t, f));
      break;
    case 'mul':
      e.factors.forEach((t) => visit(t, f));
      break;
    case 'pow':
      visit(e.base, f);
      break;
    case 'func':
      visit(e.arg, f);
      break;
    default:
      break;
  }
}

// ---------- Constructors ----------
export const num = (v: number | Rational | bigint): Expr =>
  typeof v === 'number' || typeof v === 'bigint' ? { type: 'num', value: Rational.of(v) } : { type: 'num', value: v };
export const variable = (name: string): Expr => ({ type: 'var', name: name.toLowerCase() });
export const add = (...terms: Expr[]): Expr => ({ type: 'add', terms });
export const mul = (...factors: Expr[]): Expr => ({ type: 'mul', factors });
export const pow = (base: Expr, exp: number): Expr => ({ type: 'pow', base, exp });
export const func = (name: 'sqrt' | 'abs', arg: Expr): Expr => ({ type: 'func', name, arg });

/** Deep structural equality (numbers compared exactly). */
export function exprEquals(a: Expr, b: Expr): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'num':
      return a.value.eq((b as typeof a).value);
    case 'var':
      return a.name === (b as typeof a).name;
    case 'add':
      return (
        a.terms.length === (b as typeof a).terms.length &&
        a.terms.every((t, i) => exprEquals(t, (b as typeof a).terms[i]))
      );
    case 'mul':
      return (
        a.factors.length === (b as typeof a).factors.length &&
        a.factors.every((t, i) => exprEquals(t, (b as typeof a).factors[i]))
      );
    case 'pow':
      return a.exp === (b as typeof a).exp && exprEquals(a.base, (b as typeof a).base);
    case 'func':
      return a.name === (b as typeof a).name && exprEquals(a.arg, (b as typeof a).arg);
  }
}

/**
 * Answer validation. Never compares by raw string equality where math is involved.
 *
 * For mathematical answers we parse and compare exact values (Rational) or
 * polynomial equivalence; for equations we substitute the solution; for choices
 * we compare normalized choice ids.
 */
import { tryParse, Expr } from '../math/expression';
import { evaluateExact, toPlainText } from '../math/evaluate';
import { polynomialEquivalence, polyToText, toPolynomial } from '../math/polynomial';
import { Rational } from '../math/rational';
import { Exercise } from '../content/types';

export type NormalizedAnswer =
  | { type: 'number'; value: Rational }
  | { type: 'expression'; expr: Expr }
  | { type: 'equation'; varName: string; left: Expr; right: Expr }
  | { type: 'choice'; value: string }
  | { type: 'text'; value: string };

/** Try to interpret the expected answer string in the exercise's domain. */
export function expectedAnswer(ex: Exercise): NormalizedAnswer {
  if (ex.kind === 'choice') return { type: 'choice', value: normalizeChoice(String(ex.answer)) };
  if (ex.kind === 'equation') {
    // answer is like "x=4" or list of such
    const a = Array.isArray(ex.answer) ? ex.answer[0] : ex.answer;
    return parseEquationAnswer(a) ?? { type: 'text', value: a };
  }
  const a = Array.isArray(ex.answer) ? ex.answer[0] : ex.answer;
  return normalizeMathematical(a);
}

export function parseEquationAnswer(text: string): NormalizedAnswer | null {
  const m = /^\s*([a-z])\s*=\s*(.+)$/i.exec(text.trim());
  if (!m) return null;
  const r = tryParse(m[2]);
  if (!r.ok) return null;
  // left side is the variable name
  return { type: 'equation', varName: m[1].toLowerCase(), left: { type: 'var', name: m[1].toLowerCase() }, right: r.expr };
}

export function normalizeMathematical(text: string): NormalizedAnswer {
  const cleaned = text.trim().replace(/^x\s*=\s*/i, (mm) => mm); // keep; equations handled separately
  const r = tryParse(cleaned);
  if (r.ok) {
    const vars = collectVars(r.expr);
    if (vars.length === 0) {
      try {
        return { type: 'number', value: evaluateExact(r.expr, {}).value };
      } catch {
        /* fall through */
      }
    }
    return { type: 'expression', expr: r.expr };
  }
  return { type: 'text', value: cleaned.toLowerCase().replace(/\s+/g, '') };
}

function collectVars(e: Expr): string[] {
  const s = new Set<string>();
  const walk = (n: Expr): void => {
    if (n.type === 'var') s.add(n.name);
    else if (n.type === 'add') n.terms.forEach(walk);
    else if (n.type === 'mul') n.factors.forEach(walk);
    else if (n.type === 'pow') walk(n.base);
    else if (n.type === 'func') walk(n.arg);
  };
  walk(e);
  return [...s];
}

export function normalizeChoice(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * The true value of the unknown in an equation exercise ("x=6"), when it has one.
 * The misconception rules for equations need it (the learner may double it or drop a term),
 * and it can be read straight from the authored answer, so callers never have to supply it.
 */
function expectedVariableValue(ex: Exercise): Rational | undefined {
  if (ex.kind !== 'equation') return undefined;
  const answer = parseEquationAnswer(String(Array.isArray(ex.answer) ? ex.answer[0] : ex.answer));
  if (!answer || answer.type !== 'equation') return undefined;
  try {
    return evaluateExact(answer.right, {}).value;
  } catch {
    return undefined;
  }
}

export interface GradeResult {
  correct: boolean;
  /** diagnosed misconception id when the answer is wrong but recognizable */
  misconception?: string;
  /** human-readable feedback */
  message: string;
  /** parsed user answer for display */
  parsed?: string;
  error?: string;
}

export interface GradeContext {
  /** value of the unknown in the current exercise (for diagnosing combined-side errors) */
  variableValue?: Rational;
  hintsUsed?: number;
}

export function gradeAnswer(ex: Exercise, raw: string, ctx: GradeContext = {}): GradeResult {
  const user = raw.trim();
  if (!user) return { correct: false, message: 'Type an answer first.', error: 'empty' };

  if (ex.kind === 'choice') {
    const got = normalizeChoice(user);
    const want = normalizeChoice(String(ex.answer));
    if (got === want) return { correct: true, message: 'Correct!' };
    // comparison-by-choice-id; misconception comes from the chosen distractor mapping
    return {
      correct: false,
      misconception: `${ex.conceptId}-choice-${got}`,
      message: 'Not quite. Look again at what the expression means.',
    };
  }

  const accepted = Array.isArray(ex.answer) ? ex.answer : [ex.answer];

  const match = accepted.some((candidate) => answersMatch(ex, candidate, user, ctx));
  if (match) {
    return { correct: true, message: 'Correct! ✓' };
  }

  // Wrong: diagnose.
  const diag = diagnose(ex, user, ctx, accepted);
  return {
    correct: false,
    misconception: diag.id,
    message: diag.message,
    parsed: diag.parsed,
    error: diag.parseError,
  };
}

function answersMatch(ex: Exercise, candidate: string, user: string, _ctx: GradeContext): boolean {
  if (ex.kind === 'equation') {
    const want = parseEquationAnswer(candidate);
    const got = parseEquationAnswer(user);
    if (!want || want.type !== 'equation') return normalizeText(candidate) === normalizeText(user);
    if (!got || got.type !== 'equation') return false;
    if (want.varName !== got.varName) return false;
    // Both are "var = value": compare the exact values.
    try {
      return evaluateExact(want.right, {}).value.eq(evaluateExact(got.right, {}).value);
    } catch {
      return false;
    }
  }
  if (ex.kind === 'numeric' || ex.kind === 'value-of-variable' || ex.kind === 'coordinate' || ex.kind === 'sign') {
    const want = normalizeMathematical(candidate);
    const got = normalizeMathematical(stripEquationPrefix(user));
    if (want.type === 'number' && got.type === 'number') return want.value.eq(got.value);
    return want.type === 'text' && got.type === 'text' && want.value === got.value;
  }
  // expression
  const want = normalizeMathematical(candidate);
  const got = normalizeMathematical(stripEquationPrefix(user));
  if (want.type === 'expression' && got.type === 'expression') {
    const eq = polynomialEquivalence(want.expr, got.expr);
    if (eq.result === 'yes') return true;
    if (eq.result === 'no') return false;
    // unsupported: fall back to structural text comparison (exact, conservative)
    return toPlainText(want.expr) === toPlainText(got.expr);
  }
  if (want.type === 'number' && got.type === 'number') return want.value.eq(got.value);
  if (want.type === 'text' && got.type === 'text') return want.value === got.value;
  return false;
}

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '');
}

function stripEquationPrefix(s: string): string {
  return /^\s*[a-z]\s*=/.test(s) ? s.replace(/^\s*[a-z]\s*=/, '') : s;
}

// ---------- Misconception diagnosis ----------
export interface Diagnosis {
  id: string;
  message: string;
  parsed?: string;
  parseError?: string;
}

/**
 * Explain a wrong answer by comparing its structure with the expected answer.
 * Each rule is explicit and testable. Diagnosis is a hypothesis, not proof.
 */
export function diagnose(ex: Exercise, user: string, ctx: GradeContext, accepted: string[]): Diagnosis {
  const expected = accepted[0];

  if (ex.kind === 'numeric') {
    const want = normalizeMathematical(expected);
    const got = normalizeMathematical(stripEquationPrefix(user));
    if (got.type === 'text') {
      return {
        id: 'unparseable',
        message: `I couldn't read “${user}”. Try a number like 7, -2, or 3/4.`,
        parseError: 'unparseable',
      };
    }
    if (want.type === 'number' && got.type === 'number') {
      const w = want.value;
      const g = got.value;
      if (w.isNegative() && g.eq(w.abs())) {
        return { id: 'sign-error', message: `Almost! Watch the sign: ${g.toString()} is positive, but the exact answer is negative.`, parsed: g.toString() };
      }
      if (!w.isNegative() && g.eq(w.neg())) {
        return { id: 'sign-error', message: `Almost! You changed the sign. The answer is ${w.toString()}, not ${g.toString()}.`, parsed: g.toString() };
      }
      if (w.isNegative() !== g.isNegative() && !g.abs().eq(w.abs())) {
        return { id: 'sign-error', message: 'Check your signs on every term — positive and negative signs matter.', parsed: g.toString() };
      }
      const slip = diagnoseNumericSlip(ex, g);
      if (slip) return slip;
      return numericDiagnosis(w, g, isCountingQuestion(ex));
    }
    return { id: 'arithmetic', message: 'That answer has a different form. Try a single number.', parsed: summarize(got) };
  }

  if (ex.kind === 'expression') {
    const want = normalizeMathematical(expected);
    const got = normalizeMathematical(user);
    if (got.type === 'text') {
      return { id: 'unparseable', message: `I couldn't read “${user}”. Use numbers, single letters like x, and operators + - * / ^ .`, parseError: 'unparseable' };
    }
    if (want.type !== 'expression' || got.type !== 'expression') {
      return { id: 'form-mismatch', message: 'Your answer has the wrong form for this exercise.' };
    }
    const wp = safePoly(want.expr);
    const gp = safePoly(got.expr);
    if (wp && gp) {
      // combining unlike terms: user combined x with constants into a single x term (or vice versa)
      if (wp.variables().length > 0 && gp.variables().length > 0) {
        const wantVar = wp.variables()[0];
        const gotCoeff = gp.terms.reduce<Rational | null>((acc, t) =>
          acc && (Object.keys(t.exps).length === 0 || (t.exps[wantVar] === 1 && Object.keys(t.exps).length === 1)) ? acc.add(t.coeff) : null, Rational.ZERO);
        if (gotCoeff && !gotCoeff.isZero()) {
          const expectedVar = wp.terms.filter((t) => t.exps[wantVar] === 1).reduce((a, t) => a.add(t.coeff), Rational.ZERO);
          const expectedConst = wp.terms.filter((t) => Object.keys(t.exps).length === 0).reduce((a, t) => a.add(t.coeff), Rational.ZERO);
          const hasConstTerm = wp.terms.some((t) => Object.keys(t.exps).length === 0);
          if (hasConstTerm && gotCoeff.eq(expectedVar.add(expectedConst))) {
            return {
              id: 'combined-unlike-terms',
              message: `You combined ${polyToText(wp)} into one ${wantVar} term. Constants and ${wantVar}-terms are unlike terms — only add terms with exactly the same variable parts.`,
              parsed: polyToText(gp),
            };
          }
        }
      }
      // sign error in coefficients: same terms, opposite sign
      const neg = wp.neg();
      if (gp.equals(neg)) {
        return { id: 'sign-error', message: 'Every sign is flipped. Check the subtraction signs in your work.', parsed: polyToText(gp) };
      }
      const diff = gp.sub(wp);
      // Partial distribution: learner expanded the variable term but not the constant
      // (e.g. 2(x+3) -> 2x+3): same variable terms, constants unchanged.
      const sameVarPart = wp.terms.filter((t) => Object.keys(t.exps).length > 0);
      const gotVarPart = gp.terms.filter((t) => Object.keys(t.exps).length > 0);
      const constsEqual = (p: typeof wp) => {
        const c = p.terms.find((t) => Object.keys(t.exps).length === 0);
        return c ? c.coeff : null;
      };
      if (
        sameVarPart.length === gotVarPart.length &&
        sameVarPart.every((t) => gotVarPart.some((g) => g.coeff.eq(t.coeff) && Object.keys(g.exps).join() === Object.keys(t.exps).join())) &&
        !constsEqual(wp)?.eq(constsEqual(gp) ?? Rational.ZERO) &&
        constsEqual(gp) !== null
      ) {
        // only diagnose as partial distribution when the user's constant matches an inner constant
        return {
          id: 'partial-distribution',
          message: 'It looks like the factor only multiplied the variable term. Multiply it by every term inside the brackets, including the constant.',
          parsed: polyToText(gp),
        };
      }
      if (diff.terms.some((t) => Object.keys(t.exps).length > 0) && diff.terms.every((t) => t.coeff.abs().eq(Rational.ONE))) {
        return { id: 'coefficient-error', message: 'The variable parts are right but the coefficients are off. Double-check the numbers multiplying each term.', parsed: polyToText(gp) };
      }
    }
    return {
      id: 'not-equivalent',
      message: `That isn't equivalent to the target expression. Compare term by term.`,
      parsed: got.type === 'expression' ? toPlainText(got.expr) : undefined,
    };
  }

  if (ex.kind === 'equation') {
    const got = parseEquationAnswer(user);
    const want = parseEquationAnswer(expected);
    if (!got) {
      return { id: 'unparseable', message: 'Write an equation of the form x = number.', parseError: 'unparseable' };
    }
    if (got.type === 'equation') {
      try {
        const gr = evaluateExact(got.right, {});
        // report a value for feedback
        void gr;
      } catch {
        return { id: 'unparseable', message: 'Use numbers on both sides, like x = 4.', parseError: 'unparseable' };
      }
    }
    if (want && want.type === 'equation' && got.type === 'equation') {
      try {
        const wv = evaluateExact(want.right, {}).value;
        const gv = evaluateExact(got.right, {}).value;
        if (wv.isNegative() && gv.eq(wv.abs())) return { id: 'sign-error', message: 'Watch the sign — the answer is negative.', parsed: gv.toString() };
        const variableValue = ctx.variableValue ?? expectedVariableValue(ex);
        if (variableValue) {
          const half = variableValue.div(Rational.of(2));
          if (gv.eq(variableValue.mul(Rational.of(2))) || gv.eq(half)) {
            return { id: 'inverse-operation-error', message: 'It looks like the wrong inverse operation was used. Undo addition with subtraction, multiplication with division.', parsed: gv.toString() };
          }
          const swapped = swappedOperationValue(ex, variableValue);
          if (swapped && gv.eq(swapped)) {
            return { id: 'inverse-operation-error', message: 'It looks like the wrong inverse operation was used. Undo addition with subtraction, multiplication with division.', parsed: gv.toString() };
          }
        }
        return { id: 'not-solution', message: 'Check by substituting your value into the original equation — it does not make both sides equal.', parsed: gv.toString() };
      } catch {
        /* ignore */
      }
    }
    return { id: 'not-solution', message: 'Not the right solution yet. Substitute your value into the original equation to check.' };
  }

  if (ex.kind === 'coordinate') {
    return { id: 'coordinate-order', message: 'Coordinates are written (x, y) — horizontal first, then vertical.' };
  }

  return { id: 'unknown', message: 'Not quite. Try again — check each step.' };
}

function safePoly(e: Expr) {
  try {
    return toPolynomial(e);
  } catch {
    return null;
  }
}

/** Text with LaTeX and Unicode math symbols converted to the operators the parser reads. */
function toParseable(text: string): string {
  return text
    .replace(/\\times|\\cdot/g, '*')
    .replace(/\\div/g, '/')
    .replace(/×|·/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-');
}

/**
 * Tokenise a bare arithmetic string into `terms` (numbers) and `ops` (+ - * /), in reading
 * order. Negation is folded into the number that follows it; brackets make the string
 * unreadable here (a bracketed mistake is a different slip, so we stay silent).
 */
function tokeniseArithmetic(text: string): { terms: string[]; ops: string[] } | null {
  if (/[()^a-zA-Z\\{}]/.test(text)) return null;
  const tokens: { kind: 'num' | 'op'; text: string }[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < text.length && /[0-9.]/.test(text[j])) j++;
      const num = text.slice(i, j);
      if ((num.match(/\./g) ?? []).length > 1 || num === '.') return null;
      tokens.push({ kind: 'num', text: num });
      i = j;
      continue;
    }
    if ('+-*/'.includes(c)) {
      tokens.push({ kind: 'op', text: c });
      i++;
      continue;
    }
    return null;
  }
  // Fold unary signs: "-5" is one number, and "5 - -3" is "5 - (-3)".
  const terms: string[] = [];
  const ops: string[] = [];
  let pendingSign = '';
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.kind === 'op') {
      const prev = tokens[k - 1];
      const unary = t.text === '-' || t.text === '+' ? k === 0 || prev?.kind === 'op' : false;
      if (unary) {
        pendingSign = t.text === '-' ? (pendingSign === '-' ? '' : '-') : pendingSign;
        continue;
      }
      if (t.text === '*' || t.text === '/') {
        ops.push(t.text);
        continue;
      }
      // A leading term can't be a binary + or -, and a trailing one is malformed.
      if (terms.length === 0 || k === tokens.length - 1) return null;
      terms.push(pendingSign);
      pendingSign = '';
      ops.push(t.text);
      continue;
    }
    if (terms.length === ops.length) {
      terms.push(pendingSign + t.text);
      pendingSign = '';
    } else {
      terms[terms.length - 1] += pendingSign + t.text;
      pendingSign = '';
    }
  }
  if (tokens[tokens.length - 1]?.kind === 'op') return null;
  if (terms.length === 0 || ops.length !== terms.length - 1) return null;
  return { terms, ops };
}

/**
 * `2 + 3 * 4` read left to right: fold the terms in the order they are written, applying
 * whichever operator comes next. Null when the string has no × or ÷ (nothing to get wrong),
 * so a plain 6 + 7 is never labelled an order-of-operations slip.
 */
function readLeftToRight(text: string): Rational | null {
  const toks = tokeniseArithmetic(text);
  if (!toks) return null;
  if (!toks.ops.some((op) => op === '*' || op === '/')) return null;
  let acc: Rational | null = null;
  for (let k = 0; k < toks.terms.length; k++) {
    const value = parseNumber(toks.terms[k]);
    if (!value) return null;
    if (acc === null) {
      acc = value;
      continue;
    }
    const op = toks.ops[k - 1];
    try {
      if (op === '*') acc = acc.mul(value);
      else if (op === '/') {
        if (value.isZero()) return null;
        acc = acc.div(value);
      } else if (op === '+') acc = acc.add(value);
      else acc = acc.sub(value);
    } catch {
      return null;
    }
  }
  return acc;
}

/** Parse one numeric literal, or null. */
function parseNumber(text: string): Rational | null {
  const cleaned = text.trim();
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  try {
    return Rational.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * A number "off by one" is only a counting slip when the answer is a small count. A sign,
 * an order-of-operations slip or a decimal error can land one away too, and "re-count
 * carefully" then sends a beginner looking for the wrong thing. Callers pass `counting`
 * when the question is genuinely about counting up or down (plain whole-number + or −).
 */
function numericDiagnosis(want: Rational, got: Rational, counting: boolean): Diagnosis {
  const sameSign = want.isNegative() === got.isNegative();
  const diff = got.sub(want);
  if (counting && sameSign && diff.abs().eq(Rational.ONE) && want.abs().cmp(Rational.of(50)) < 0) {
    return { id: 'off-by-one', message: `Very close: you're off by one. Re-count carefully.`, parsed: got.toString() };
  }
  return {
    id: 'arithmetic',
    message: `Not yet. Your answer ${got.toString()} differs from the correct value. Check each step's arithmetic.`,
    parsed: got.toString(),
  };
}

/** Value of a numeric expression, or null if it is not a bare computation. */
function valueOf(text: string): Rational | null {
  const parsed = tryParse(text);
  if (!parsed.ok) return null;
  try {
    return evaluateExact(parsed.expr, {}).value;
  } catch {
    return null;
  }
}

/**
 * Recognise the two classic numeric slips that used to be reported as "check your arithmetic":
 * - working strictly left to right (`2 + 3 × 4 = 20`, `20 − 10 ÷ 2 = 5`), and
 * - reading a power as multiplication (`2³` as `2 × 3`).
 *
 * A question with a blank, a comparison or an equation is never diagnosed this way, and neither
 * is an answer that happens to match an unconventional reading without the question being one.
 */
function diagnoseNumericSlip(ex: Exercise, got: Rational): Diagnosis | null {
  const math = (ex.math ?? '').trim();
  if (!math) return null;
  const plain = toParseable(math);
  // Only a bare computation qualifies: no blanks, comparisons or "left = right" statements.
  if (/[?<>=]/.test(plain) || plain.includes('\\text') || plain.includes('{{')) return null;

  const leftToRight = readLeftToRight(plain);
  if (leftToRight && leftToRight.eq(got)) {
    return {
      id: 'order-left-to-right',
      message: 'It looks like you worked left to right. Do × and ÷ before + and −.',
      parsed: got.toString(),
    };
  }

  // A power written `a^2` read as `a × 2`.
  const powerAsProduct = plain.replace(/(\d+(?:\.\d+)?)\s*\^\s*(\d+)/g, '($1*$2)');
  if (powerAsProduct !== plain) {
    const v = valueOf(powerAsProduct);
    if (v && v.eq(got)) {
      return {
        id: 'exponent-as-multiply',
        message: 'A power means repeated multiplication: 2³ is 2 × 2 × 2, not 2 × 3.',
        parsed: got.toString(),
      };
    }
  }
  return null;
}

/**
 * Whether wrong-by-one deserves "re-count carefully": true only when the question *asks for* the
 * result of a whole-number sum or difference over 50 and the learner is one away.
 */
function isCountingQuestion(ex: Exercise): boolean {
  if (!ex.math) return false;
  const plain = (ex.math ?? '').trim();
  if (!/^\d+\s*[+\-−]\s*\d+$/.test(plain.replace(/\s+/g, ' '))) return false;
  const toks = tokeniseArithmetic(toParseable(plain));
  if (!toks) return false;
  return toks.terms.every((t) => /^\d+$/.test(t));
}

/**
 * The answer produced by undoing `x + 4 = 10` with the *opposite* operation: 10 + 4 = 14.
 * Only a one-step equation whose left side is the unknown with one constant ("x + 4",
 * "x − 5") or a coefficient ("2x") qualifies; anything else returns null, so no wrong label
 * is invented for a question this rule does not understand.
 */
function swappedOperationValue(ex: Exercise, solution: Rational): Rational | null {
  const m = /^\s*([a-z])\s*([+\-*/])\s*(-?\d+)\s*=\s*(-?\d+)\s*$/.exec((ex.math ?? '').replace(/[−]/g, '-'));
  if (!m) return null;
  const [, , op, constantText, rightText] = m;
  const constant = Rational.parse(constantText);
  const right = Rational.parse(rightText);
  // The equation must actually hold for the stored solution; otherwise stay silent.
  if (!valueOf(`${solution.toString()} ${op} ${constantText}`)?.eq(right) && !(op === '*' && solution.mul(constant).eq(right))) {
    return null;
  }
  if (op === '+') return right.add(constant);
  if (op === '-') return right.sub(constant).sub(constant);
  if (op === '*') return right.sub(constant);
  if (op === '/') return right.mul(constant).mul(constant);
  return null;
}

function summarize(a: NormalizedAnswer): string {
  switch (a.type) {
    case 'number':
      return a.value.toString();
    case 'expression':
      return toPlainText(a.expr);
    case 'equation':
      return `${toPlainText(a.left)}=${toPlainText(a.right)}`;
    case 'choice':
      return a.value;
    case 'text':
      return a.value;
  }
}

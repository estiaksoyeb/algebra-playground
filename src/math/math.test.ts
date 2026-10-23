import { describe, it, expect } from 'vitest';
import { Rational } from './rational';
import { parseExpression, tryParse, ParseError } from './expression';
import { evaluateExact, toLatex, toPlainText } from './evaluate';
import { toPolynomial, polyToText, polynomialEquivalence } from './polynomial';
import {
  parseEquation,
  tryParseEquation,
  applyTransform,
  equationsEquivalent,
  checkSolution,
  solveLinear,
} from './equation';

const R = (n: number, d = 1) => Rational.of(n, d);
const val = (src: string, env: Record<string, number> = {}) =>
  evaluateExact(parseExpression(src), Object.fromEntries(Object.entries(env).map(([k, v]) => [k, R(v)]))).value;

describe('Rational', () => {
  it('normalizes and computes exactly', () => {
    expect(R(2, 4).toString()).toBe('1/2');
    expect(R(1, 3).add(R(2, 3)).toString()).toBe('1');
    expect(R(1, 3).sub(R(1, 2)).toString()).toBe('-1/6');
    expect(R(-2, -4).toString()).toBe('1/2');
    expect(R(3, 4).mul(R(8, 9)).toString()).toBe('2/3');
    expect(R(1, 2).div(R(1, 4)).toString()).toBe('2');
    expect(R(1, 2).pow(3).toString()).toBe('1/8');
    expect(R(2).pow(-2).toString()).toBe('1/4');
    expect(() => R(1, 0)).toThrow();
  });
  it('parses decimals exactly', () => {
    expect(Rational.of(0.25).toString()).toBe('1/4');
    expect(Rational.of(-0.5).toString()).toBe('-1/2');
    expect(Rational.parse('3/7').toString()).toBe('3/7');
    expect(Rational.of(1).div(R(3)).toDecimal()).toEqual({ text: '0.333333', exact: false });
    expect(R(1, 4).toDecimal()).toEqual({ text: '0.25', exact: true });
  });
  it('renders latex fractions', () => {
    expect(R(-3, 4).toLatex()).toBe('-\\frac{3}{4}');
    expect(R(-3).toLatex()).toBe('-3');
  });
  it('compares exactly (no float error)', () => {
    const a = R(1, 10).add(R(2, 10));
    expect(a.eq(R(3, 10))).toBe(true);
    expect(0.1 + 0.2 === 0.3).toBe(false); // sanity: float comparison would fail
  });
});

describe('parsing and evaluation', () => {
  it('respects order of operations', () => {
    expect(val('2+3*4').toString()).toBe('14');
    expect(val('(2+3)*4').toString()).toBe('20');
    expect(val('2^3^2').toString()).toBe('512');
    expect(val('-3^2').toString()).toBe('-9');
    expect(val('(-3)^2').toString()).toBe('9');
    expect(val('10-2-3').toString()).toBe('5');
    expect(val('12/3/2').toString()).toBe('2');
    expect(val('8/(2+2)').toString()).toBe('2');
  });
  it('handles implicit multiplication', () => {
    expect(val('2x', { x: 5 }).toString()).toBe('10');
    expect(val('3(x+1)', { x: 2 }).toString()).toBe('9');
    expect(val('(x+1)(x-1)', { x: 3 }).toString()).toBe('8');
    expect(val('2x^2', { x: 3 }).toString()).toBe('18');
  });
  it('handles negatives and unicode operators', () => {
    expect(val('-4 + -2').toString()).toBe('-6');
    expect(val('−5 − 3').toString()).toBe('-8');
    expect(val('3 × 4').toString()).toBe('12');
    expect(val('12 ÷ 4').toString()).toBe('3');
    expect(val('--5').toString()).toBe('5');
  });
  it('computes fractions exactly', () => {
    expect(val('1/3 + 1/6').toString()).toBe('1/2');
    expect(val('(2/3)*(3/4)').toString()).toBe('1/2');
    expect(val('(1/2)^2').toString()).toBe('1/4');
  });
  it('supports sqrt and abs with exact squares', () => {
    expect(evaluateExact(parseExpression('sqrt(9/4)'), {})).toEqual({ value: R(3, 2), exact: true });
    expect(val('abs(-7)').toString()).toBe('7');
    expect(evaluateExact(parseExpression('sqrt(2)'), {}).exact).toBe(false);
  });
  it('rejects malicious or unsupported input without evaluating code', () => {
    for (const bad of [
      'alert(1)',
      'process.exit(1)',
      'constructor',
      'x = 5',
      '2 ** 3',
      'foo(2)',
      '(2+3',
      '2+3)',
      'x^y',
      'x^0.5',
      '1.2.3',
      'this.constructor',
      '__proto__',
      'x;y',
      'eval("1")',
      '[]',
      '`1`',
    ]) {
      const r = tryParse(bad);
      expect(r.ok, `should reject ${bad}`).toBe(false);
      if (!r.ok) expect(r.error).toBeInstanceOf(ParseError);
    }
  });
  it('rejects division by zero', () => {
    expect(() => val('1/0')).toThrow();
    expect(() => val('5/(3-3)')).toThrow();
  });
  it('limits size', () => {
    expect(tryParse('1+'.repeat(200) + '1').ok).toBe(false);
    expect(tryParse('2^100').ok).toBe(false);
  });
  it('renders readable latex and text', () => {
    expect(toLatex(parseExpression('2x+3'))).toBe('2\\,x+3');
    expect(toLatex(parseExpression('x^2 - 5'))).toBe('x^{2}-5');
    expect(toLatex(parseExpression('(x+1)/(x-1)'))).toContain('\\frac');
    expect(toPlainText(parseExpression('2(x+3)'))).toBe('2*(x + 3)');
  });
});

describe('polynomials and equivalence', () => {
  const poly = (src: string) => toPolynomial(parseExpression(src));
  it('combines like terms', () => {
    expect(polyToText(poly('2x + 3x + 4 - 1'))).toBe('5x + 3');
    expect(polyToText(poly('x + x'))).toBe('2x');
    expect(polyToText(poly('x - x'))).toBe('0');
    expect(polyToText(poly('3x + 2y - x + y'))).toBe('2x + 3y');
  });
  it('keeps unlike terms apart (does not combine 3x + 2 into 5x)', () => {
    expect(polyToText(poly('3x + 2'))).toBe('3x + 2');
  });
  it('expands products', () => {
    expect(polyToText(poly('2(x+3)'))).toBe('2x + 6');
    expect(polyToText(poly('(x+1)(x+2)'))).toBe('x^2 + 3x + 2');
    expect(polyToText(poly('(x-3)^2'))).toBe('x^2 - 6x + 9');
  });
  it('checks equivalence soundly', () => {
    expect(polynomialEquivalence(parseExpression('x+x'), parseExpression('2x')).result).toBe('yes');
    expect(polynomialEquivalence(parseExpression('2(x+3)'), parseExpression('2x+6')).result).toBe('yes');
    expect(polynomialEquivalence(parseExpression('x+x'), parseExpression('x^2')).result).toBe('no');
    expect(polynomialEquivalence(parseExpression('3x+2'), parseExpression('5x')).result).toBe('no');
    // equal at x=1 for both, but not equivalent: catches single-point traps
    expect(polynomialEquivalence(parseExpression('x^2'), parseExpression('x')).result).toBe('no');
    expect(polynomialEquivalence(parseExpression('sqrt(x)'), parseExpression('x')).result).toBe('unsupported');
  });
  it('parses library text polynomials', () => {
    expect(polyToText(toPolynomial(parseExpression('x*y')))).toBe('x*y');
    expect(polyToText(toPolynomial(parseExpression('x^2 - 4')))).toBe('x^2 - 4');
  });
});

describe('equations and transformations', () => {
  it('parses equations, rejecting missing/extra equals', () => {
    expect(tryParseEquation('x+3=7').ok).toBe(true);
    expect(tryParseEquation('x+3').ok).toBe(false);
    expect(tryParseEquation('x=3=4').ok).toBe(false);
  });
  it('checks solutions by substitution', () => {
    const eq = parseEquation('2x+3=11');
    expect(checkSolution(eq, 'x', R(4)).holds).toBe(true);
    expect(checkSolution(eq, 'x', R(5)).holds).toBe(false);
    expect(checkSolution(parseEquation('x/2 = 3'), 'x', R(6)).holds).toBe(true);
  });
  it('subtracts on both sides and keeps equality', () => {
    const eq = parseEquation('x+3=7');
    const r = applyTransform(eq, { rule: 'subtract', operand: parseExpression('3') });
    expect(r.ok).toBe(true);
    expect(polyToText(toPolynomial(r.equation!.left))).toBe('x');
    expect(polyToText(toPolynomial(r.equation!.right))).toBe('4');
    expect(equationsEquivalent(eq, r.equation!)).toBe('yes');
  });
  it('divides both sides', () => {
    const eq = parseEquation('2x=8');
    const r = applyTransform(eq, { rule: 'divide', operand: parseExpression('2') });
    expect(r.ok).toBe(true);
    expect(solveLinear(r.equation!, 'x').solution?.toString()).toBe('4');
  });
  it('denies operations with zero as the operand', () => {
    const eq = parseEquation('2x=8');
    expect(applyTransform(eq, { rule: 'divide', operand: parseExpression('0') }).ok).toBe(false);
    expect(applyTransform(eq, { rule: 'multiply', operand: parseExpression('0') }).ok).toBe(false);
    // variable operand may be zero -> refused with explanation
    expect(applyTransform(eq, { rule: 'divide', operand: parseExpression('x') }).ok).toBe(false);
  });
  it('does not mutate the original equation', () => {
    const eq = parseEquation('x+3=7');
    const before = polyToText(toPolynomial(eq.left));
    applyTransform(eq, { rule: 'add', operand: parseExpression('5') });
    expect(polyToText(toPolynomial(eq.left))).toBe(before);
  });
  it('detects inequivalent transformations', () => {
    const eq = parseEquation('x+3=7');
    const bad = { left: eq.left, right: parseExpression('8') };
    expect(equationsEquivalent(eq, bad)).toBe('no'); // x+3=7 and x+3=8 are not equivalent
    const reallyBad = { left: parseExpression('x'), right: parseExpression('8') };
    expect(equationsEquivalent(eq, reallyBad)).toBe('no');
  });
  it('solves one- and two-step equations exactly, including fractions', () => {
    expect(solveLinear(parseEquation('x+3=7'), 'x').solution?.toString()).toBe('4');
    expect(solveLinear(parseEquation('2x+3=11'), 'x').solution?.toString()).toBe('4');
    expect(solveLinear(parseEquation('3x-5=10'), 'x').solution?.toString()).toBe('5');
    expect(solveLinear(parseEquation('x/2 + 1 = 4'), 'x').solution?.toString()).toBe('6');
    expect(solveLinear(parseEquation('-2x + 1 = 9'), 'x').solution?.toString()).toBe('-4');
    expect(solveLinear(parseEquation('x-7 = -3'), 'x').solution?.toString()).toBe('4');
    expect(solveLinear(parseEquation('0.2x = 1'), 'x').solution?.toString()).toBe('5');
  });
  it('reports special equations', () => {
    expect(solveLinear(parseEquation('x = x'), 'x').error).toMatch(/identity/i);
    expect(solveLinear(parseEquation('x = x + 1'), 'x').error).toMatch(/no solution/i);
  });
});

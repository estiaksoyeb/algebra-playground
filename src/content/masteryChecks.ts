/**
 * Mastery checks, one set per lesson.
 *
 * These are short, unassisted questions asked after practice. They live apart from
 * the teaching exercises (which keep their hints and worked steps) because a check
 * is evidence: two questions, two different varieties, no hints needed.
 *
 * Everything here is plain data. `curriculum.test.ts` grades every stored answer,
 * so a typo in a check is caught by the test suite rather than by a learner.
 */
import { Exercise, Lesson } from './types';

type CheckSpec = Omit<Exercise, 'id' | 'conceptId' | 'kind' | 'hints' | 'difficulty'> & {
  kind?: Exercise['kind'];
  hints?: string[];
};

const check = (lessonId: string, n: number, conceptId: string, spec: CheckSpec): Exercise => ({
  conceptId,
  kind: 'numeric',
  difficulty: 2,
  hints: [],
  ...spec,
  id: `${lessonId}-k${n}`,
});

function forLesson(
  lessonId: string,
  conceptId: string,
  a: CheckSpec,
  b: CheckSpec,
): Exercise[] {
  return [check(lessonId, 1, conceptId, a), check(lessonId, 2, conceptId, b)];
}

export const MASTERY_CHECKS: Record<string, Exercise[]> = {
  'w1-l1-counting': forLesson(
    'w1-l1-counting',
    'counting',
    {
      prompt: 'How many counters are shown in this group?',
      math: '\\underbrace{\\bullet\\bullet\\bullet\\bullet\\bullet}_{?}',
      answer: '5',
      solution: 'Count each counter carefully: 1, 2, 3, 4, 5.',
      variety: 'count-objects',
    },
    {
      prompt: 'If you start at 6 on the number line and step 4 places to the right, which number do you land on?',
      math: '6 \\; \\rightarrow \\; ?',
      answer: '10',
      solution: 'Stepping 4 units right from 6: 7, 8, 9, 10. You reach 10.',
      variety: 'numberline-move',
    },
  ),
  'w1-l2-place-value': forLesson(
    'w1-l2-place-value',
    'place-value',
    {
      prompt: 'Combine these place values: what is 70 + 4?',
      math: '70 + 4',
      answer: '74',
      solution: '7 tens (70) and 4 ones (4) combine to make 74.',
      variety: 'expanded-form',
    },
    {
      prompt: 'In the number 29, what is the value of the digit 2?',
      math: '29',
      answer: '20',
      solution: 'The 2 sits in the tens place, so it is worth 2 × 10 = 20.',
      variety: 'tens-value',
    },
  ),
  'w1-l3-addition': forLesson(
    'w1-l3-addition',
    'addition',
    {
      prompt: 'Find the sum of 8 and 5:',
      math: '8 + 5',
      answer: '13',
      solution: 'Starting at 8 and stepping forward 5 places brings you to 13.',
      variety: 'sum-small',
    },
    {
      prompt: 'Add these two-digit numbers:',
      math: '31 + 24',
      answer: '55',
      solution: 'Add tens and ones: 30 + 20 = 50, and 1 + 4 = 5. Together, they equal 55.',
      variety: 'sum-two-digit',
    },
  ),
  'w1-l4-subtraction': forLesson(
    'w1-l4-subtraction',
    'subtraction',
    {
      prompt: 'Subtract 4 from 9:',
      math: '9 - 4',
      answer: '5',
      solution: 'Starting at 9 and stepping back 4 places brings you to 5.',
      variety: 'diff-small',
    },
    {
      prompt: 'Find the difference: 52 − 17',
      math: '52 - 17',
      answer: '35',
      solution: 'Subtract 10 first to get 42, then subtract the remaining 7 to reach 35.',
      variety: 'two-digit-diff',
    },
  ),
  'w1-l5-multiplication': forLesson(
    'w1-l5-multiplication',
    'multiplication',
    {
      prompt: 'Multiply 4 by 6:',
      math: '4 \\times 6',
      answer: '24',
      solution: 'Four groups of 6 (or six groups of 4) total 24.',
      variety: 'product-small',
    },
    {
      prompt: 'A rectangular grid is 3 tiles wide and 5 tiles tall. How many tiles does it contain in total?',
      math: '3 \\times 5',
      answer: '15',
      solution: 'An array measuring 3 by 5 covers 3 × 5 = 15 tiles in total.',
      variety: 'array',
    },
  ),
  'w1-l6-division': forLesson(
    'w1-l6-division',
    'division',
    {
      prompt: 'If 12 treats are shared equally among 4 friends, how many does each person receive?',
      math: '12 \\div 4',
      answer: '3',
      solution: '12 shared equally into 4 groups gives 3 in each group.',
      variety: 'share',
    },
    {
      prompt: 'Divide 35 by 5:',
      math: '35 \\div 5',
      answer: '7',
      solution: 'Since 5 × 7 = 35, dividing 35 by 5 yields 7.',
      variety: 'fact',
    },
  ),
  'w1-l7-order-of-operations': forLesson(
    'w1-l7-order-of-operations',
    'order-of-operations',
    {
      prompt: 'Work out the value of this expression following the order of operations:',
      math: '2 + 3 \\times 4',
      answer: '14',
      solution: 'Multiply first: 3 × 4 = 12. Then add 2 to get 14.',
      variety: 'precedence',
    },
    {
      prompt: 'Evaluate this expression with brackets:',
      math: '(2 + 3) \\times 4',
      answer: '20',
      solution: 'Brackets first: 2 + 3 = 5. Then 5 × 4 = 20.',
      variety: 'brackets',
    },
  ),

  'w2-l1-negatives': forLesson(
    'w2-l1-negatives',
    'negative-numbers',
    {
      prompt: 'What number is the opposite of 7 across zero?',
      answer: '-7',
      solution: 'The opposite of 7 is −7, located at the same distance on the negative side of 0.',
      variety: 'opposite',
    },
    {
      prompt: 'Between −4 and −1, which number is larger?',
      math: '-4 \\quad \\text{or} \\quad -1',
      answer: '-1',
      solution: 'On the number line, −1 lies to the right of −4, making −1 the larger number.',
      variety: 'compare-negative',
    },
  ),
  'w2-l2-adding-negatives': forLesson(
    'w2-l2-adding-negatives',
    'adding-negatives',
    {
      prompt: 'Find the sum: −3 + 8',
      math: '-3 + 8',
      answer: '5',
      solution: 'Starting at −3 and stepping 8 units to the right brings you to 5.',
      variety: 'add-negative',
    },
    {
      prompt: 'Evaluate the difference: 4 − (−6)',
      math: '4 - (-6)',
      answer: '10',
      solution: 'Subtracting a negative is equivalent to addition: 4 + 6 = 10.',
      variety: 'double-negative',
    },
  ),
  'w2-l3-sign-rules': forLesson(
    'w2-l3-sign-rules',
    'sign-rules',
    {
      prompt: 'Multiply a negative by a positive: −4 × 3',
      math: '-4 \\times 3',
      answer: '-12',
      solution: 'A negative times a positive yields a negative result: −4 × 3 = −12.',
      variety: 'mixed-sign',
    },
    {
      prompt: 'Find the product of two negatives: −5 × (−2)',
      math: '-5 \\times (-2)',
      answer: '10',
      solution: 'Multiplying two negative numbers yields a positive product: −5 × (−2) = 10.',
      variety: 'same-sign',
    },
  ),
  'w2-l4-fractions': forLesson(
    'w2-l4-fractions',
    'fractions',
    {
      prompt: 'Simplify 6/8 to its lowest terms:',
      math: '\\frac{6}{8}',
      answer: '3/4',
      solution: 'Divide both numerator and denominator by 2 to get 3/4.',
      variety: 'simplify',
    },
    {
      prompt: 'Which fraction with denominator 8 is equivalent to 1/2? Write it as a fraction:',
      math: '\\frac{1}{2} = \\frac{?}{8}',
      answer: '4/8',
      solution: 'Multiply both numerator and denominator by 4: 1/2 = 4/8.',
      variety: 'equivalence',
    },
  ),
  'w2-l5-fraction-arithmetic': forLesson(
    'w2-l5-fraction-arithmetic',
    'fraction-arithmetic',
    {
      prompt: 'Add these fractions with matching denominators: 1/5 + 2/5',
      math: '\\frac{1}{5} + \\frac{2}{5}',
      answer: '3/5',
      solution: 'The denominators are identical, so add the numerators: 1 + 2 = 3, giving 3/5.',
      variety: 'like-denominators',
    },
    {
      prompt: 'Add these fractions by finding a common denominator: 1/2 + 1/4',
      math: '\\frac{1}{2} + \\frac{1}{4}',
      answer: '3/4',
      solution: 'Convert 1/2 to 2/4. Then 2/4 + 1/4 = 3/4.',
      variety: 'unlike-denominators',
    },
  ),
  'w2-l6-decimals': forLesson(
    'w2-l6-decimals',
    'decimals',
    {
      prompt: 'Express 3/4 in decimal form:',
      math: '\\frac{3}{4}',
      answer: '0.75',
      solution: 'Dividing 3 by 4 gives 0.75 (or 75 hundredths).',
      variety: 'fraction-to-decimal',
    },
    {
      prompt: 'Find the sum by lining up the decimal points: 1.2 + 0.35',
      math: '1.2 + 0.35',
      answer: '1.55',
      solution: 'Align the decimal places as 1.20 + 0.35 to get 1.55.',
      variety: 'add-decimals',
    },
  ),

  'w3-l1-variables': forLesson(
    'w3-l1-variables',
    'variables',
    {
      prompt: 'If the variable x equals 4, find the value of x + 5:',
      math: 'x + 5',
      answer: '9',
      solution: 'Substitute 4 for x: 4 + 5 = 9.',
      variety: 'substitute',
    },
    {
      prompt: 'If a = 3, what is the value of 2a?',
      math: '2a',
      answer: '6',
      solution: '2a means 2 × a; multiplying 2 by 3 gives 6.',
      variety: 'double',
    },
  ),
  'w3-l2-expressions': forLesson(
    'w3-l2-expressions',
    'expressions',
    {
      prompt: 'Evaluate the expression 3x + 1 when x = 2:',
      math: '3x + 1',
      answer: '7',
      solution: 'Substitute 2 for x: 3 × 2 = 6, and 6 + 1 = 7.',
      variety: 'evaluate-positive',
    },
    {
      prompt: 'Evaluate the expression 10 − n when n = 5:',
      math: '10 - n',
      answer: '5',
      solution: 'Substitute 5 for n: 10 − 5 = 5.',
      variety: 'evaluate-subtract',
    },
  ),
  'w3-l3-terms': forLesson(
    'w3-l3-terms',
    'terms-coefficients',
    {
      prompt: 'What is the coefficient of x in the term 7x?',
      math: '7x',
      answer: '7',
      solution: 'The coefficient is the multiplying factor attached to x: 7.',
      variety: 'coefficient',
    },
    {
      prompt: 'How many terms are in the expression 3x + 2y − 5?',
      math: '3x + 2y - 5',
      answer: '3',
      solution: 'The separate terms are 3x, 2y, and −5, giving a total of 3 terms.',
      variety: 'count-terms',
    },
  ),

  'w4-l1-equality': forLesson(
    'w4-l1-equality',
    'equality',
    {
      prompt: 'Solve the equation.',
      math: 'x + 3 = 10',
      kind: 'equation',
      answer: 'x = 7',
      solution: 'Subtract 3 from both sides: x = 7.',
      variety: 'solve-simple',
    },
    {
      prompt: 'Solve the equation.',
      math: 'x + 6 = 6',
      kind: 'equation',
      answer: 'x = 0',
      solution: 'Subtract 6 from both sides: x = 0.',
      variety: 'balance-rule',
    },
  ),
  'w4-l2-one-step': forLesson(
    'w4-l2-one-step',
    'one-step-equations',
    {
      prompt: 'Solve.',
      math: 'x + 9 = 15',
      kind: 'equation',
      answer: 'x = 6',
      solution: 'Subtract 9 from both sides: x = 6.',
      variety: 'add',
    },
    {
      prompt: 'Solve.',
      math: '4x = 20',
      kind: 'equation',
      answer: 'x = 5',
      solution: 'Divide both sides by 4: x = 5.',
      variety: 'multiply',
    },
  ),
  'w4-l3-two-step': forLesson(
    'w4-l3-two-step',
    'two-step-equations',
    {
      prompt: 'Solve.',
      math: '2x + 3 = 11',
      kind: 'equation',
      answer: 'x = 4',
      solution: 'Subtract 3: 2x = 8. Divide by 2: x = 4.',
      variety: 'two-step-add',
    },
    {
      prompt: 'Solve.',
      math: '3x - 4 = 8',
      kind: 'equation',
      answer: 'x = 4',
      solution: 'Add 4: 3x = 12. Divide by 3: x = 4.',
      variety: 'two-step-subtract',
    },
  ),
  'w4-l4-negative-equations': forLesson(
    'w4-l4-negative-equations',
    'equation-signs',
    {
      prompt: 'Solve.',
      math: '-3x = 12',
      kind: 'equation',
      answer: 'x = -4',
      solution: 'Divide both sides by −3: x = −4. Check: −3 × (−4) = 12.',
      variety: 'negative-coefficient',
    },
    {
      prompt: 'Solve.',
      math: '2x + 7 = 1',
      kind: 'equation',
      answer: 'x = -3',
      solution: 'Subtract 7: 2x = −6. Divide by 2: x = −3.',
      variety: 'negative-result',
    },
  ),
  'w4-l5-fraction-equations': forLesson(
    'w4-l5-fraction-equations',
    'equation-fractions',
    {
      prompt: 'Solve.',
      math: '\\frac{x}{2} = 5',
      kind: 'equation',
      answer: 'x = 10',
      solution: 'Multiply both sides by 2: x = 10.',
      variety: 'clear-denominator',
    },
    {
      prompt: 'Solve.',
      math: '\\frac{x}{3} + 1 = 4',
      kind: 'equation',
      answer: 'x = 9',
      solution: 'Subtract 1: x/3 = 3. Multiply by 3: x = 9.',
      variety: 'fraction-two-step',
    },
  ),

  'w5-l1-like-terms': forLesson(
    'w5-l1-like-terms',
    'like-terms',
    {
      prompt: 'Simplify by combining like terms.',
      math: '3x + 4x',
      kind: 'expression',
      answer: '7x',
      solution: 'Both terms are x-terms: 3 + 4 = 7, so 7x.',
      variety: 'same-term',
    },
    {
      prompt: 'Simplify by combining like terms.',
      math: '5x + 2 - 3x',
      kind: 'expression',
      answer: '2x + 2',
      solution: '5x − 3x = 2x, and the 2 stays: 2x + 2.',
      variety: 'mixed',
    },
  ),
  'w5-l2-distributive': forLesson(
    'w5-l2-distributive',
    'distributive',
    {
      prompt: 'Expand.',
      math: '3(x + 2)',
      kind: 'expression',
      answer: '3x + 6',
      solution: 'Multiply each term inside by 3: 3x + 6.',
      variety: 'expand-positive',
    },
    {
      prompt: 'Expand.',
      math: '-2(x - 4)',
      kind: 'expression',
      answer: '-2x + 8',
      solution: '−2 × x = −2x and −2 × (−4) = +8.',
      variety: 'expand-negative',
    },
  ),
  'w5-l3-factoring': forLesson(
    'w5-l3-factoring',
    'factoring',
    {
      prompt: 'Factor out the common number.',
      math: '6x + 9',
      kind: 'expression',
      answer: '3(2x + 3)',
      solution: 'The common factor is 3: 6x ÷ 3 = 2x and 9 ÷ 3 = 3.',
      variety: 'number-factor',
    },
    {
      prompt: 'Factor out the common factor.',
      math: 'x^2 + 4x',
      kind: 'expression',
      answer: 'x(x + 4)',
      solution: 'Both terms contain x: x² ÷ x = x and 4x ÷ x = 4.',
      variety: 'variable-factor',
    },
  ),
  'w5-l4-binomials': forLesson(
    'w5-l4-binomials',
    'binomial-products',
    {
      prompt: 'Expand.',
      math: '(x + 2)(x + 3)',
      kind: 'expression',
      answer: 'x^2 + 5x + 6',
      solution: 'Each part of the first bracket multiplies each part of the second: x² + 3x + 2x + 6 = x² + 5x + 6.',
      variety: 'expand-basic',
    },
    {
      prompt: 'Expand.',
      math: '(x - 4)(x + 1)',
      kind: 'expression',
      answer: 'x^2 - 3x - 4',
      solution: 'x² + x − 4x − 4 = x² − 3x − 4.',
      variety: 'mixed-signs',
    },
  ),

  'w6-l1-coordinates': forLesson(
    'w6-l1-coordinates',
    'coordinates',
    {
      prompt: 'In the point (5, 2), what is the x-coordinate?',
      math: '(5, 2)',
      answer: '5',
      solution: 'The first number is the x-coordinate: 5.',
      variety: 'read-x',
    },
    {
      prompt: 'In the point (−3, 4), what is the y-coordinate?',
      math: '(-3, 4)',
      answer: '4',
      solution: 'The second number is the y-coordinate: 4.',
      variety: 'read-y',
    },
  ),
  'w6-l2-tables': forLesson(
    'w6-l2-tables',
    'tables-of-values',
    {
      prompt: 'If y = 2x + 1, what is y when x = 3?',
      math: 'y = 2x + 1',
      answer: '7',
      solution: '2 × 3 + 1 = 7.',
      variety: 'table-entry',
    },
    {
      prompt: 'If y = 3x, what is y when x = 4?',
      math: 'y = 3x',
      answer: '12',
      solution: '3 × 4 = 12.',
      variety: 'table-rule',
    },
  ),
  'w6-l3-lines': forLesson(
    'w6-l3-lines',
    'linear-graphs',
    {
      prompt: 'If y = 2x − 1, what is y when x = 4?',
      math: 'y = 2x - 1',
      answer: '7',
      solution: '2 × 4 − 1 = 7.',
      variety: 'evaluate-line',
    },
    {
      prompt: 'Where does the line cross the y-axis? Give the y-value.',
      math: 'y = 2x - 5',
      answer: '-5',
      solution: 'At the y-axis x = 0, so y = 2 × 0 − 5 = −5.',
      variety: 'y-intercept',
    },
  ),
  'w6-l4-slope': forLesson(
    'w6-l4-slope',
    'slope-intercept',
    {
      prompt: 'What is the slope of the line?',
      math: 'y = 4x + 1',
      answer: '4',
      solution: 'In y = mx + b the slope is the number multiplying x: 4.',
      variety: 'slope-from-equation',
    },
    {
      prompt: 'What is the slope of the line through (1, 2) and (3, 8)?',
      math: '(1, 2) \\text{ and } (3, 8)',
      answer: '3',
      solution: 'Slope = change in y ÷ change in x = (8 − 2) ÷ (3 − 1) = 6 ÷ 2 = 3.',
      variety: 'slope-from-points',
    },
  ),
  'w6-l5-functions': forLesson(
    'w6-l5-functions',
    'functions',
    {
      prompt: 'If f(x) = 2x + 3, what is f(4)?',
      math: 'f(x) = 2x + 3',
      answer: '11',
      solution: 'Put 4 where x is: 2 × 4 + 3 = 11.',
      variety: 'evaluate-function',
    },
    {
      prompt: 'If f(x) = x² − 1, what is f(3)?',
      math: 'f(x) = x^2 - 1',
      answer: '8',
      solution: '3² = 9, and 9 − 1 = 8.',
      variety: 'evaluate-quadratic',
    },
  ),

  'w7-l1-exponents': forLesson(
    'w7-l1-exponents',
    'exponents',
    {
      prompt: 'Evaluate.',
      math: '3^3',
      answer: '27',
      solution: '3 · 3 · 3 = 27.',
      variety: 'evaluate-power',
    },
    {
      prompt: 'Simplify.',
      math: 'x^4 \\cdot x^2',
      kind: 'expression',
      answer: 'x^6',
      solution: 'Same base: add the exponents, 4 + 2 = 6.',
      variety: 'power-rule',
    },
  ),
  'w7-l2-inequalities': forLesson(
    'w7-l2-inequalities',
    'inequalities',
    {
      prompt: 'Solve. Type an inequality such as x < 5.',
      math: 'x + 3 < 7',
      kind: 'expression',
      answer: 'x < 4',
      solution: 'Subtract 3 from both sides: x < 4.',
      variety: 'solve-linear',
    },
    {
      prompt: 'Solve.',
      math: '-2x > 6',
      kind: 'expression',
      answer: 'x < -3',
      solution: 'Divide both sides by −2 and flip the sign: x < −3.',
      variety: 'flip-sign',
    },
  ),
  'w7-l3-simultaneous': forLesson(
    'w7-l3-simultaneous',
    'simultaneous',
    {
      prompt: 'The equations x + y = 7 and x − y = 1 are both true. What is x?',
      math: '\\begin{cases} x + y = 7 \\\\ x - y = 1 \\end{cases}',
      answer: '4',
      solution: 'Add the equations: 2x = 8, so x = 4.',
      variety: 'eliminate-add',
    },
    {
      prompt: 'If y = 2x and x + y = 9, what is x?',
      math: '\\begin{cases} y = 2x \\\\ x + y = 9 \\end{cases}',
      answer: '3',
      solution: 'Substitute: x + 2x = 9, so 3x = 9 and x = 3.',
      variety: 'substitution',
    },
  ),
  'w7-l4-polynomials': forLesson(
    'w7-l4-polynomials',
    'polynomials',
    {
      prompt: 'What is the degree of the polynomial?',
      math: '4x^3 + 2x - 1',
      answer: '3',
      solution: 'The degree is the highest power of x: 3.',
      variety: 'degree',
    },
    {
      prompt: 'What is the leading coefficient?',
      math: '-2x^2 + 5x + 1',
      answer: '-2',
      solution: 'The leading coefficient is the number multiplying the highest power: −2.',
      variety: 'leading-coefficient',
    },
  ),
  'w7-l5-quadratics': forLesson(
    'w7-l5-quadratics',
    'quadratics',
    {
      prompt: 'Factor.',
      math: 'x^2 + 5x + 6',
      kind: 'expression',
      answer: '(x + 2)(x + 3)',
      solution: 'Two numbers that multiply to 6 and add to 5: 2 and 3.',
      variety: 'factor-monic',
    },
    {
      prompt: 'What is the positive solution of the equation?',
      math: 'x^2 - 9 = 0',
      answer: '3',
      solution: '(x − 3)(x + 3) = 0, so x = 3 or x = −3. The positive solution is 3.',
      variety: 'solve-factored',
    },
  ),
  'w7-l6-quadratic-graphs': forLesson(
    'w7-l6-quadratic-graphs',
    'quadratic-graphs',
    {
      prompt: 'If y = x², what is y when x = −3?',
      math: 'y = x^2',
      answer: '9',
      solution: '(−3)² = 9. Squaring a negative gives a positive.',
      variety: 'evaluate-parabola',
    },
    {
      prompt: 'For y = (x − 2)², what is the x-coordinate of the vertex?',
      math: 'y = (x - 2)^2',
      answer: '2',
      solution: 'The vertex of y = (x − h)² is at x = h, so x = 2.',
      variety: 'vertex',
    },
  ),
};

/** Attach the authored check to its lesson. Applied to every lesson by `curriculum.ts`. */
export function withMasteryChecks(lesson: Lesson): Lesson {
  return { ...lesson, masteryCheck: MASTERY_CHECKS[lesson.id] ?? lesson.masteryCheck };
}

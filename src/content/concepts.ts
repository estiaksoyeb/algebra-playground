import { Concept, World } from './types';

export const WORLDS: World[] = [
  {
    id: 'numbers',
    number: 1,
    title: 'Numbers & Operations',
    tagline: 'Build number sense from zero',
    description: 'Count, place value, add, subtract, multiply and divide with visual models.',
    colorVar: 'world-numbers',
    icon: 'blocks',
  },
  {
    id: 'negatives',
    number: 2,
    title: 'Negative Numbers & Fractions',
    tagline: 'Numbers below zero and parts of a whole',
    description: 'Meet opposites, learn sign rules, and split numbers into fractions.',
    colorVar: 'world-negatives',
    icon: 'plusminus',
  },
  {
    id: 'variables',
    number: 3,
    title: 'Discovering Variables',
    tagline: 'Give the unknown a name',
    description: 'Use letters for unknown numbers and build expressions.',
    colorVar: 'world-variables',
    icon: 'box',
  },
  {
    id: 'equality',
    number: 4,
    title: 'Equality & Equations',
    tagline: 'Keep both sides balanced',
    description: 'Solve equations by doing the same thing to both sides.',
    colorVar: 'world-equality',
    icon: 'balance',
  },
  {
    id: 'expressions',
    number: 5,
    title: 'Expressions & Algebra Tiles',
    tagline: 'Combine, expand and factor',
    description: 'Like terms, the distributive property, and area models.',
    colorVar: 'world-expressions',
    icon: 'tiles',
  },
  {
    id: 'graphs',
    number: 6,
    title: 'Graphs & Functions',
    tagline: 'See relationships as pictures',
    description: 'Coordinates, tables, lines, slope and functions.',
    colorVar: 'world-graphs',
    icon: 'graph',
  },
  {
    id: 'further',
    number: 7,
    title: 'Further Algebra',
    tagline: 'Powers, inequalities, systems',
    description: 'Exponents, inequalities, simultaneous equations and quadratics.',
    colorVar: 'world-further',
    icon: 'star',
  },
];

export const CONCEPTS: Concept[] = [
  // World 1
  { id: 'place-value', name: 'Place value', shortName: 'Place value', world: 'numbers', description: 'Each digit’s position decides its value.', prerequisites: ['counting'] },
  { id: 'counting', name: 'Counting & numbers', shortName: 'Numbers', world: 'numbers', description: 'Count objects and compare small numbers.', prerequisites: [] },
  { id: 'addition', name: 'Addition', shortName: 'Addition', world: 'numbers', description: 'Combine quantities and use a number line.', prerequisites: ['counting'] },
  { id: 'subtraction', name: 'Subtraction & number line', shortName: 'Subtraction', world: 'numbers', description: 'Take away and move left on a number line.', prerequisites: ['addition'] },
  { id: 'multiplication', name: 'Multiplication (arrays)', shortName: 'Multiplication', world: 'numbers', description: 'Repeated equal groups and arrays.', prerequisites: ['addition'] },
  { id: 'division', name: 'Division (sharing)', shortName: 'Division', world: 'numbers', description: 'Split into equal groups.', prerequisites: ['multiplication'] },
  { id: 'order-of-operations', name: 'Order of operations', shortName: 'Order of ops', world: 'numbers', description: 'Brackets, then powers, then × ÷, then + −.', prerequisites: ['multiplication', 'division'] },

  // World 2
  { id: 'negative-numbers', name: 'Negative numbers & opposites', shortName: 'Negatives', world: 'negatives', description: 'Numbers less than zero, and opposites.', prerequisites: ['subtraction'] },
  { id: 'adding-negatives', name: 'Adding & subtracting negatives', shortName: 'Add negatives', world: 'negatives', description: 'Move left and right on the number line.', prerequisites: ['negative-numbers'] },
  { id: 'sign-rules', name: 'Multiplying & dividing signs', shortName: 'Sign rules', world: 'negatives', description: 'Two negatives make a positive when multiplying.', prerequisites: ['adding-negatives', 'multiplication'] },
  { id: 'fractions', name: 'Fractions & equivalence', shortName: 'Fractions', world: 'negatives', description: 'Parts of a whole; equal fractions.', prerequisites: ['division'] },
  { id: 'fraction-arithmetic', name: 'Adding fractions', shortName: 'Add fractions', world: 'negatives', description: 'Common denominators.', prerequisites: ['fractions', 'addition'] },
  { id: 'decimals', name: 'Decimals', shortName: 'Decimals', world: 'negatives', description: 'Decimal numbers and their fraction form.', prerequisites: ['fractions', 'place-value'] },

  // World 3
  { id: 'variables', name: 'Variables as unknowns', shortName: 'Variables', world: 'variables', description: 'A letter stands for a number we do not know yet.', prerequisites: ['addition'] },
  { id: 'expressions', name: 'Expressions & evaluating', shortName: 'Expressions', world: 'variables', description: 'Build expressions and substitute values.', prerequisites: ['variables'] },
  { id: 'terms-coefficients', name: 'Terms, coefficients & constants', shortName: 'Terms', world: 'variables', description: 'Identify parts of an expression.', prerequisites: ['expressions'] },

  // World 4
  { id: 'equality', name: 'Meaning of equality', shortName: 'Equality', world: 'equality', description: 'Both sides have the same value.', prerequisites: ['addition', 'subtraction'] },
  { id: 'one-step-equations', name: 'One-step equations', shortName: 'One-step', world: 'equality', description: 'Undo one operation to find the unknown.', prerequisites: ['equality', 'variables'] },
  { id: 'two-step-equations', name: 'Two-step equations', shortName: 'Two-step', world: 'equality', description: 'Undo two operations in reverse order.', prerequisites: ['one-step-equations'] },
  { id: 'equation-signs', name: 'Equations with negatives', shortName: 'Negative eq.', world: 'equality', description: 'Keep signs straight while balancing.', prerequisites: ['two-step-equations', 'sign-rules'] },
  { id: 'equation-fractions', name: 'Equations with fractions', shortName: 'Fraction eq.', world: 'equality', description: 'Multiply both sides to clear a denominator.', prerequisites: ['two-step-equations', 'fractions'] },

  // World 5
  { id: 'like-terms', name: 'Combining like terms', shortName: 'Like terms', world: 'expressions', description: 'Only identical variable parts combine.', prerequisites: ['terms-coefficients'] },
  { id: 'distributive', name: 'Distributive property', shortName: 'Distribute', world: 'expressions', description: 'Multiply across a bracket.', prerequisites: ['like-terms', 'multiplication'] },
  { id: 'factoring', name: 'Factoring simple expressions', shortName: 'Factoring', world: 'expressions', description: 'Take out a common factor.', prerequisites: ['distributive'] },
  { id: 'binomial-products', name: 'Multiplying binomials', shortName: 'Binomials', world: 'expressions', description: 'Area model for (x+a)(x+b).', prerequisites: ['distributive'] },

  // World 6
  { id: 'coordinates', name: 'Coordinates', shortName: 'Coordinates', world: 'graphs', description: 'Read and plot (x, y) points.', prerequisites: ['negative-numbers'] },
  { id: 'tables-of-values', name: 'Tables of values', shortName: 'Tables', world: 'graphs', description: 'Generate points from a rule.', prerequisites: ['coordinates', 'expressions'] },
  { id: 'linear-graphs', name: 'Graphing lines', shortName: 'Lines', world: 'graphs', description: 'Graph y = mx + b.', prerequisites: ['tables-of-values'] },
  { id: 'slope-intercept', name: 'Slope & intercepts', shortName: 'Slope', world: 'graphs', description: 'What m and b mean visually.', prerequisites: ['linear-graphs'] },
  { id: 'functions', name: 'Functions', shortName: 'Functions', world: 'graphs', description: 'Input → output machines.', prerequisites: ['tables-of-values'] },

  // World 7
  { id: 'exponents', name: 'Exponents', shortName: 'Exponents', world: 'further', description: 'Repeated multiplication; x² means x·x.', prerequisites: ['multiplication'] },
  { id: 'inequalities', name: 'Inequalities', shortName: 'Inequalities', world: 'further', description: 'Solve like equations, flip when dividing by a negative.', prerequisites: ['one-step-equations', 'negative-numbers'] },
  { id: 'simultaneous', name: 'Simultaneous equations', shortName: 'Systems', world: 'further', description: 'Two equations, two unknowns.', prerequisites: ['two-step-equations'] },
  { id: 'polynomials', name: 'Polynomials', shortName: 'Polynomials', world: 'further', description: 'Sums of powers with coefficients.', prerequisites: ['like-terms'] },
  { id: 'quadratics', name: 'Quadratic equations', shortName: 'Quadratics', world: 'further', description: 'Factor and solve x² + bx + c = 0.', prerequisites: ['factoring', 'binomial-products'] },
  { id: 'quadratic-graphs', name: 'Quadratic graphs', shortName: 'Parabolas', world: 'further', description: 'The U-shape and its turning point.', prerequisites: ['quadratics', 'linear-graphs'] },
];

import { ToolId, ToolMeta } from './types';

export const TOOL_META: Record<ToolId, ToolMeta> = {
  numberline: {
    id: 'numberline',
    name: 'Number line',
    short: 'Number line',
    description: 'Move a marker along a line. See addition, subtraction and negatives as movement.',
    relatedConcepts: ['counting', 'addition', 'subtraction', 'negative-numbers', 'adding-negatives'],
    relatedLessons: ['w1-l3-addition', 'w2-l2-adding-negatives'],
  },
  mystery: {
    id: 'mystery',
    name: 'Mystery number',
    short: 'Mystery box',
    description: 'An unknown number hides in a box. Change it and watch the expression change.',
    relatedConcepts: ['variables', 'expressions'],
    relatedLessons: ['w3-l1-variables'],
  },
  balance: {
    id: 'balance',
    name: 'Equation balance',
    short: 'Balance',
    description: 'Weigh both sides of an equation. Do the same to each side to keep it balanced.',
    relatedConcepts: ['equality', 'one-step-equations', 'two-step-equations', 'equation-signs'],
    relatedLessons: ['w4-l1-equality', 'w4-l3-two-step'],
  },
  tiles: {
    id: 'tiles',
    name: 'Algebra tiles',
    short: 'Tiles',
    description: 'Long tiles are x, small squares are 1. Combine only like tiles.',
    relatedConcepts: ['terms-coefficients', 'like-terms'],
    relatedLessons: ['w5-l1-like-terms'],
  },
  evaluator: {
    id: 'evaluator',
    name: 'Expression evaluator',
    short: 'Evaluator',
    description: 'Type an expression, choose a value for x, and see the exact result.',
    relatedConcepts: ['expressions', 'functions'],
    relatedLessons: ['w3-l2-expressions'],
  },
  simplify: {
    id: 'simplify',
    name: 'Simplify & compare',
    short: 'Simplify',
    description: 'Expand and simplify polynomial expressions, or check whether two are equivalent.',
    relatedConcepts: ['like-terms', 'distributive'],
    relatedLessons: ['w5-l2-distributive'],
  },
  area: {
    id: 'area',
    name: 'Area model',
    short: 'Area',
    description: 'See distribution and binomial products as rectangles split into smaller rectangles.',
    relatedConcepts: ['distributive', 'binomial-products', 'factoring'],
    relatedLessons: ['w5-l2-distributive', 'w5-l4-binomials'],
  },
  graph: {
    id: 'graph',
    name: 'Graph explorer',
    short: 'Graph',
    description: 'Plot points, lines, parabolas and systems on a coordinate plane.',
    relatedConcepts: ['coordinates', 'linear-graphs', 'slope-intercept', 'quadratic-graphs'],
    relatedLessons: ['w6-l3-lines', 'w6-l4-slope'],
  },
};

export const TOOL_LIST: ToolMeta[] = Object.values(TOOL_META);

export function isToolId(v: string): v is ToolId {
  return v in TOOL_META;
}

/* ------------------------------------------------------------------ localisation
 * The catalogue above is the English source of truth (tests and lesson links read it
 * directly). Screens call these helpers so a tool's name and description follow the UI
 * language; they fall back to the English text, then to the raw id, so nothing renders a
 * missing-key path.
 */
import { t } from '../i18n';

export function toolText(tool: ToolId, field: 'name' | 'short' | 'description'): string {
  const meta = TOOL_META[tool];
  if (!meta) return tool;
  return t(`toolName.${tool}.${field}`, { defaultValue: meta[field] });
}

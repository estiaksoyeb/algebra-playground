/**
 * Deterministic exercise variants. Every library exercise gets stable variants so
 * learners see varied practice (not a repeated answer) while all grading stays local.
 */
import { Exercise } from '../content/types';
import { Rational } from '../math/rational';

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic pseudo-random in [0,1) based on seed string. */
export function seededRand(seed: string): number {
  const h = hashString(seed);
  return ((h * 2654435761) % 2 ** 32) / 2 ** 32;
}

export function seededInt(seed: string, min: number, max: number): number {
  return min + Math.floor(seededRand(seed) * (max - min + 1));
}

export interface VariantSeed {
  exerciseId: string;
  /** increment to get a different (but still deterministic) variant */
  n: number;
}

/**
 * Produce a variant of a library exercise.
 * Only exercises whose `math` contains an integer placeholder parameter (a number
 * indicated with `{{p}}` in the answer) are varied. No placeholder => unchanged.
 */
export function variantOf(ex: Exercise, n: number, difficulty: 1 | 2 | 3 = ex.difficulty): Exercise {
  if (!ex.math || !/\{\{\w+\}\}/.test(ex.math) || n === 0) return { ...ex, difficulty };
  const templates = [...ex.math.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  if (templates.length === 0) return { ...ex, difficulty };

  const replaceNum = (s: string, re: RegExp, map: (v: number) => string): string => s.replace(re, (full: string, raw: string) => {
    const v = Number(raw);
    if (!Number.isFinite(v)) return full;
    return map(v);
  });

  // Shift by a deterministic offset within a safe range.
  const shift = seededInt(`${ex.id}-${n}`, -4, 4) || 1;
  const math = replaceNum(ex.math, /(-?)\{\{(\w+)\}\}/g, (v: number) => String(v + shift));
  // Replace any remaining placeholders with the shifted seed
  const mathFinal = math.replace(/\{\{\w+\}\}/g, String(seededInt(`${ex.id}-${n}`, 2, 9)));
  const answer = String(ex.answer).replace(/-?\d+(?=\D*$)/, (m) => String(Number(m) + shift));
  return { ...ex, math: mathFinal, answer, difficulty };
}

export interface NumericExerciseSpec {
  id: string;
  conceptId: string;
  template: (a: number, b: number) => { prompt: string; math: string; answer: Rational; solution: string };
  difficulty: 1 | 2 | 3;
  variety: string;
  hints: string[];
}

/**
 * Deterministic arithmetic exercise generator (used for review and extra practice).
 */
export function generateArithmetic(spec: NumericExerciseSpec, seed: string): Exercise {
  const range = spec.difficulty === 1 ? 9 : spec.difficulty === 2 ? 20 : 50;
  const a = seededInt(`${seed}-a`, 1, range);
  const b = seededInt(`${seed}-b`, 1, range);
  const gen = spec.template(a, b);
  return {
    id: `${spec.id}:${seed}`,
    conceptId: spec.conceptId,
    kind: 'numeric',
    prompt: gen.prompt,
    math: gen.math,
    answer: gen.answer.toString(),
    solution: gen.solution,
    hints: spec.hints,
    difficulty: spec.difficulty,
    variety: spec.variety,
  };
}

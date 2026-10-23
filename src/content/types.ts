/**
 * Curriculum content types. Lessons are pure data (TS objects) so adding topics
 * never requires architectural changes.
 */
import { ToolId } from '../tools/types';

export type WorldId = 'numbers' | 'negatives' | 'variables' | 'equality' | 'expressions' | 'graphs' | 'further';

export interface Concept {
  id: string;
  name: string;
  shortName: string;
  world: WorldId;
  description: string;
  prerequisites: string[];
}

export interface LessonStep {
  type: 'teach' | 'explore' | 'check';
  title: string;
  body: string;
  /** KaTeX shown prominently with the step. */
  math?: string;
  /** Optional visual tool embedded with initial state. */
  visual?: { tool: ToolId; initialState?: Record<string, unknown> };
  /** Optional callout: 'tip' | 'why' | 'watch-out'. */
  callout?: { kind: 'tip' | 'why' | 'watch-out'; text: string };
}

export type ExerciseKind = 'numeric' | 'expression' | 'equation' | 'choice' | 'value-of-variable' | 'coordinate' | 'sign';

export interface Exercise {
  id: string;
  conceptId: string;
  kind: ExerciseKind;
  prompt: string;
  /** Extra LaTeX context. */
  math?: string;
  /** for choice */
  choices?: string[];
  /** correct answer(s). For numeric: exact string (rational like "3/4" or decimal). */
  answer: string | string[];
  /** Deterministic solution explanation shown after finishing. */
  solution: string;
  hints: string[];
  difficulty: 1 | 2 | 3;
  /** Used by the mastery system to require variety (e.g. 'sign', 'two-step'). */
  variety: string;
  misconception?: string;
}

export interface MasteryCriteria {
  /** independent correct answers required on varied exercises */
  minIndependent: number;
  /** distinct variety tags required */
  minVariety: number;
  /** must pass a mastery check */
  requiresCheck: boolean;
}

export interface Lesson {
  id: string;
  world: WorldId;
  order: number;
  title: string;
  summary: string;
  conceptIds: string[];
  prerequisites: string[];
  objectives: string[];
  steps: LessonStep[];
  exercises: Exercise[];
  reviewExercises?: Exercise[];
  /** Short unassisted check; passing it confirms mastery (see mastery.requiresCheck). */
  masteryCheck?: Exercise[];
  misconceptions: { id: string; description: string; feedback: string }[];
  mastery: MasteryCriteria;
  /** related lesson ids after failure remediation */
  remediation?: string;
  estimatedMinutes: number;
  /** optional extra tag shown in the map */
  badge?: string;
}

export interface World {
  id: WorldId;
  number: number;
  title: string;
  tagline: string;
  description: string;
  colorVar: string;
  icon: string;
}

export interface Curriculum {
  contentVersion: number;
  worlds: World[];
  lessons: Lesson[];
  concepts: Concept[];
}

export const CONTENT_VERSION = 1;

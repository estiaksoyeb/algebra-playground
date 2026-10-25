/**
 * Shape of the Bengali curriculum overlay.
 *
 * Only human prose lives in the overlay. Ids, `math`, `answer`, `choices` and
 * `visual.initialState` stay in the content files, so a translation can never change what
 * the app marks right. Every field is optional: a missing field falls back to English
 * field by field, so a half-translated lesson still reads and still works.
 *
 * Numbers are always ASCII 0-9 and variables are always Latin (x, y, a, b) — even inside
 * a Bengali sentence. Write "7 + 5 = 12"; never spell numbers with the Bengali digits
 * (the test suite scans these files for them).
 */

export interface ConceptProse {
  name: string;
  shortName: string;
  description: string;
}

export interface StepProse {
  title?: string;
  body?: string;
  /** Body plus a sentence naming the tool's own buttons, where the buttons need naming. */
  examples?: string;
  callout?: string;
}

export interface ExerciseProse {
  prompt?: string;
  /** The worked solution shown after an answer. Matched to the exercise's `solution`. */
  solution?: string;
  /** Hints are matched by position, so a translation always belongs to its own rung. */
  hints?: string[];
  /**
   * Display-only Bengali labels for word-based options of a `choice` exercise, keyed by
   * the canonical English option string.
   *
   * The choice strings themselves stay English in the content files because the grader
   * compares them verbatim; `ExerciseCard` shows the label here but still submits the
   * canonical option, so a translation can never change what counts as correct.
   * Options made only of maths (`'2x + 6'`, `'(3, 2)'`) need no label and are never added.
   */
  choiceLabels?: Record<string, string>;
}

export interface MisconceptionProse {
  description?: string;
  feedback?: string;
}

export interface LessonProse {
  title?: string;
  summary?: string;
  objectives?: string[];
  steps?: StepProse[];
  /** Keyed by exercise id, covering practice, review and mastery-check exercises alike. */
  exercises?: Record<string, ExerciseProse>;
  misconceptions?: Record<string, MisconceptionProse>;
}

export type WorldKey = 'numbers' | 'negatives' | 'variables' | 'equality' | 'expressions' | 'graphs' | 'further';

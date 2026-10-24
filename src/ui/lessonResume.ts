/**
 * Where a lesson run resumes, derived from what was stored about it.
 *
 * The lesson player has four screens (teaching steps, practice, the mastery check and the
 * completion panel) but only `currentStep` was ever persisted, so a reload in practice or
 * the check came back to a teaching step. These helpers are pure so the resume rules are
 * tested directly, without rendering anything.
 */
import { LessonStateRecord, LessonPhase } from '../storage/repositories';

export type LessonPosition =
  | { kind: 'teach'; step: number }
  | { kind: 'practice'; index: number }
  | { kind: 'check'; index: number }
  | { kind: 'done' };

export interface LessonShape {
  /** Number of teaching steps. */
  steps: number;
  /** Number of practice exercises. */
  practice: number;
  /** Number of mastery-check questions. */
  checks: number;
}

const clamp = (n: number, max: number): number => (Number.isFinite(n) ? Math.min(Math.max(0, Math.floor(n)), Math.max(0, max)) : 0);
/**
 * The position to open on, given the stored record (or none).
 *
 * - No record: the first teaching step. This is not "restoration" and must never be saved
 *   back as if it were progress.
 * - Completed: the completion panel, wherever the learner left it.
 * - `phase`/`index` present: that screen, with indices clamped to the lesson's real size
 *   (a backup from a longer version of a lesson must not open an empty page).
 * - Absent (records and backups from before phases were stored): the teaching step in
 *   `currentStep`, exactly the previous behaviour.
 */
export function resumePosition(record: LessonStateRecord | undefined | null, shape: LessonShape): LessonPosition {
  if (!record) return { kind: 'teach', step: 0 };
  if (record.completed) return { kind: 'done' };
  const lastTeach = Math.max(0, shape.steps - 1);
  const phase: LessonPhase | undefined = record.phase;
  const savedIndex = record.index ?? 0;
  if (phase === 'practice' && shape.practice > 0) return { kind: 'practice', index: clamp(savedIndex, shape.practice - 1) };
  if (phase === 'check' && shape.checks > 0) return { kind: 'check', index: clamp(savedIndex, shape.checks - 1) };
  // 'done' without `completed`, or a phase this version of the lesson no longer has:
  // fall back to the teaching step, which is always a valid screen.
  return { kind: 'teach', step: clamp(record.currentStep, lastTeach) };
}

/** What a save should store for a position. Teaching steps keep `currentStep` authoritative. */
export function positionRecord(position: LessonPosition): { phase: LessonPhase; currentStep?: number; index?: number } {
  switch (position.kind) {
    case 'teach':
      return { phase: 'teach', currentStep: position.step, index: 0 };
    case 'practice':
      return { phase: 'practice', index: position.index };
    case 'check':
      return { phase: 'check', index: position.index };
    case 'done':
      return { phase: 'done', index: 0 };
  }
}

/** True when two positions are the same screen in the same place. */
export function samePosition(a: LessonPosition, b: LessonPosition): boolean {
  if (a.kind === 'teach' && b.kind === 'teach') return a.step === b.step;
  if (a.kind === 'practice' && b.kind === 'practice') return a.index === b.index;
  if (a.kind === 'check' && b.kind === 'check') return a.index === b.index;
  return a.kind === b.kind;
}

/**
 * The position a stored record describes, or `null` when the record carries no screen
 * information at all (so there is nothing to restore).
 */
export function storedPosition(record: LessonStateRecord | undefined | null, shape: LessonShape): LessonPosition | null {
  if (!record) return null;
  if (!record.completed && record.phase === undefined) {
    // Legacy record: only a teaching step was ever stored.
    return { kind: 'teach', step: clamp(record.currentStep, Math.max(0, shape.steps - 1)) };
  }
  return resumePosition(record, shape);
}

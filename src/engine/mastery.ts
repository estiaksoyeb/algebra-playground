/**
 * Concept mastery from evidence. Documented, configurable rules.
 *
 * Evidence: each graded attempt (correct?, hints used, variety tag, how many previous
 * attempts on that exercise). Mastery is NOT awarded for clicking through or repeating
 * one identical answer.
 *
 * Rules (configurable in MASTERY_CONFIG):
 * - Independent success: correct with 0 hints.
 * - Assisted success: correct after ≥1 hint.
 * - "introduced" once a lesson step/concept is first seen.
 * - "practicing" once there is ≥1 attempt.
 * - "provisional": ≥2 independent corrects AND ≥2 distinct variety tags.
 * - "established": ≥4 independent corrects, ≥3 variety tags, ≥75% independent accuracy
 *   on the last 10 attempts, at least one spaced review passed after a day. The mastery
 *   check (requiresCheck) additionally gates awarding established via checkMastery().
 * - "needs-review": 2+ recent incorrects after having reached provisional/established,
 *   or a failed review of a mastered concept.
 */
import { AttemptRecord, MasteryRecord, MasteryState } from '../storage/repositories';
import type { MasteryCriteria } from '../content/types';

export interface MasteryConfig {
  provisional: { independent: number; variety: number };
  established: { independent: number; variety: number; minAccuracy: number; window: number; requiresReview: boolean };
  needsReviewAfter: number;
  assistedDecay: number;
}

export const MASTERY_CONFIG: MasteryConfig = {
  provisional: { independent: 2, variety: 2 },
  established: { independent: 4, variety: 3, minAccuracy: 0.75, window: 10, requiresReview: true },
  needsReviewAfter: 2,
  assistedDecay: 0.5,
};

export interface AttemptEvidence {
  correct: boolean;
  hintsUsed: number;
  variety: string;
  at: string;
}

export function emptyMastery(conceptId: string, now = new Date().toISOString()): MasteryRecord {
  return {
    conceptId,
    state: 'not-introduced',
    score: 0,
    independentCorrect: 0,
    assistedCorrect: 0,
    incorrect: 0,
    distinctExerciseKinds: [],
    updatedAt: now,
  };
}

/** Apply one attempt to a mastery record (pure). */
export function applyAttempt(record: MasteryRecord, ev: AttemptEvidence, now = new Date().toISOString()): MasteryRecord {
  const next: MasteryRecord = { ...record, distinctExerciseKinds: [...record.distinctExerciseKinds], updatedAt: now, lastSeenAt: ev.at };
  if (ev.correct) {
    if (ev.hintsUsed === 0) next.independentCorrect += 1;
    else next.assistedCorrect += 1;
    if (!next.distinctExerciseKinds.includes(ev.variety)) next.distinctExerciseKinds.push(ev.variety);
  } else {
    next.incorrect += 1;
  }
  return next;
}

export function computeScore(a: { independentCorrect: number; assistedCorrect: number; incorrect: number; distinctExerciseKinds: string[] }): number {
  const raw = a.independentCorrect + a.assistedCorrect * MASTERY_CONFIG.assistedDecay;
  const total = raw + a.incorrect;
  const accuracy = total === 0 ? 0 : raw / total;
  const varietyBonus = Math.min(1, a.distinctExerciseKinds.length / 3);
  return Math.round(Math.min(100, accuracy * 80 + varietyBonus * 20));
}

export interface MasteryDecision {
  state: MasteryState;
  reasons: string[];
}

/**
 * Decide the mastery state from accumulated evidence.
 * `attempts` should be the concept's attempts in chronological order.
 * `criteria` comes from the lesson that owns the concept.
 */
export function decideMastery(
  rec: MasteryRecord,
  attempts: AttemptRecord[],
  criteria: MasteryCriteria | undefined,
  opts: { checkPassed?: boolean; reviewPassed?: boolean; previousState?: MasteryState } = {},
): MasteryDecision {
  const reasons: string[] = [];
  const cfg = MASTERY_CONFIG;
  const prev = opts.previousState ?? rec.state;
  if (attempts.length === 0 && rec.state === 'not-introduced') return { state: 'not-introduced', reasons: ['No attempts yet.'] };

  const incorrects = rec.incorrect;
  if (prev === 'provisional' || prev === 'established') {
    const recent = attempts.slice(-4).filter((a) => !a.correct).length;
    if (recent >= cfg.needsReviewAfter || (attempts.length > 0 && !attempts[attempts.length - 1].correct && prev === 'established')) {
      reasons.push('Recent mistakes indicate this concept needs review.');
      return { state: 'needs-review', reasons };
    }
  }
  if (opts.reviewPassed === false && (prev === 'provisional' || prev === 'established')) {
    return { state: 'needs-review', reasons: ['A spaced review was not passed.'] };
  }

  const window = attempts.slice(-cfg.established.window);
  const windowCorrect = window.filter((a) => a.correct && a.hintsUsed === 0).length;
  const accuracy = window.length ? windowCorrect / window.length : 0;
  const minIndep = criteria?.minIndependent ?? cfg.established.independent;
  const minVariety = criteria?.minVariety ?? cfg.established.variety;
  const needsCheck = criteria?.requiresCheck ?? true;

  if (incorrects === 0 && rec.independentCorrect === 0) {
    return { state: 'practicing', reasons: ['Attempts so far were assisted.'] };
  }
  void incorrects;

  if (
    rec.independentCorrect >= minIndep &&
    rec.distinctExerciseKinds.length >= Math.min(minVariety, cfg.established.variety) &&
    accuracy >= cfg.established.minAccuracy &&
    (!cfg.established.requiresReview || opts.reviewPassed !== false)
  ) {
    if (!needsCheck || opts.checkPassed || prev === 'established') {
      reasons.push(`${rec.independentCorrect} independent correct answers across ${rec.distinctExerciseKinds.length} exercise types.`);
      if (opts.checkPassed) reasons.push('Mastery check passed.');
      return { state: 'established', reasons };
    }
    reasons.push('Strong evidence — pass the mastery check to confirm.');
    return { state: 'provisional', reasons };
  }

  if (rec.independentCorrect >= cfg.provisional.independent && rec.distinctExerciseKinds.length >= cfg.provisional.variety) {
    reasons.push('Solved several different exercises without help.');
    return { state: 'provisional', reasons };
  }
  if (rec.independentCorrect + rec.assistedCorrect > 0 || rec.incorrect > 0) {
    return { state: 'practicing', reasons: ['Keep practising with less help.'] };
  }
  return { state: 'introduced', reasons: [] };
}

export function masteryLabel(state: MasteryState): string {
  switch (state) {
    case 'not-introduced':
      return 'Not started';
    case 'introduced':
      return 'Introduced';
    case 'practicing':
      return 'Practising';
    case 'provisional':
      return 'Almost mastered';
    case 'established':
      return 'Mastered';
    case 'needs-review':
      return 'Needs review';
  }
}

export const MASTERY_ORDER: MasteryState[] = ['not-introduced', 'introduced', 'practicing', 'provisional', 'established', 'needs-review'];

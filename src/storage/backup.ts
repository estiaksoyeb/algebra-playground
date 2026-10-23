/**
 * Versioned JSON backup format.
 *
 * Format (v1):
 * {
 *   format: "algebra-playground-backup",
 *   formatVersion: 1,
 *   exportedAt: ISO string,
 *   app: { schemaVersion, contentVersion },
 *   data: {
 *     profile?, lessonStates[], attempts[], mastery[], experiments[],
 *     history[], reviews[], reviewLogs[]
 *   }
 * }
 *
 * Import is validated field-by-field. Invalid documents are rejected before any
 * write happens, so existing progress cannot be corrupted by a bad file.
 */
import { DB_VERSION } from './db';
import {
  Repos,
  StoredProfile,
  LessonStateRecord,
  AttemptRecord,
  MasteryRecord,
  ExperimentRecord,
  HistoryRecord,
  ReviewRecord,
  ReviewLogRecord,
  MasteryState,
} from './repositories';

export const BACKUP_FORMAT = 'algebra-playground-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const CONTENT_VERSION = 1;

export interface BackupData {
  profile?: StoredProfile;
  lessonStates: LessonStateRecord[];
  attempts: AttemptRecord[];
  mastery: MasteryRecord[];
  experiments: ExperimentRecord[];
  history: HistoryRecord[];
  reviews: ReviewRecord[];
  reviewLogs: ReviewLogRecord[];
}

export interface Backup {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  exportedAt: string;
  app: { schemaVersion: number; contentVersion: number };
  data: BackupData;
}

export async function createBackup(repos: Repos): Promise<Backup> {
  const [profile, lessonStates, attempts, mastery, experiments, history, reviews, reviewLogs] = await Promise.all([
    repos.getProfile(),
    repos.allLessonStates(),
    repos.allAttempts(),
    repos.allMastery(),
    repos.allExperiments(),
    repos.allHistory(),
    repos.allReviews(),
    repos.allReviewLogs(),
  ]);
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    app: { schemaVersion: DB_VERSION, contentVersion: CONTENT_VERSION },
    data: { profile, lessonStates, attempts, mastery, experiments, history, reviews, reviewLogs },
  };
}

export function backupToJson(b: Backup): string {
  return JSON.stringify(b, null, 2);
}

// ---------- validation ----------
export interface ValidationResult {
  ok: boolean;
  backup?: Backup;
  errors: string[];
  warnings: string[];
  stats?: { lessonStates: number; attempts: number; mastery: number; experiments: number };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isIso = (v: unknown): boolean => isStr(v) && !Number.isNaN(Date.parse(v));

const MASTERY_STATES: MasteryState[] = ['not-introduced', 'introduced', 'practicing', 'provisional', 'established', 'needs-review'];

function sanitizeText(v: unknown, max = 4000): string {
  // Strip control chars and cap length; content is rendered as text (never HTML).
  return (isStr(v) ? v : '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max);
}

function cleanStringRecord(v: unknown, max = 500): Record<string, string> {
  const out: Record<string, string> = {};
  if (isObj(v)) for (const [k, val] of Object.entries(v)) out[sanitizeText(k, 80)] = sanitizeText(val, max);
  return out;
}

function cleanNumberRecord(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (isObj(v)) for (const [k, val] of Object.entries(v)) if (isNum(val)) out[sanitizeText(k, 80)] = Math.max(0, Math.floor(val));
  return out;
}

export function validateBackup(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['The file is not a JSON object.'], warnings };
  if (raw.format !== BACKUP_FORMAT) {
    return { ok: false, errors: ['This is not an Algebra Playground backup (missing format marker).'], warnings };
  }
  if (!isNum(raw.formatVersion) || raw.formatVersion < 1) {
    return { ok: false, errors: ['Backup format version is missing or invalid.'], warnings };
  }
  if (raw.formatVersion > BACKUP_FORMAT_VERSION) {
    return { ok: false, errors: [`This backup was made by a newer version (format ${raw.formatVersion}). Update the app first.`], warnings };
  }
  if (!isObj(raw.data)) return { ok: false, errors: ['Backup is missing its data section.'], warnings };
  const d = raw.data;
  const arr = (k: string): unknown[] => {
    const v = d[k];
    if (v === undefined) return [];
    if (!Array.isArray(v)) {
      errors.push(`"${k}" must be a list.`);
      return [];
    }
    return v;
  };

  const lessonStates: LessonStateRecord[] = [];
  for (const item of arr('lessonStates')) {
    if (!isObj(item) || !isStr(item.lessonId)) {
      warnings.push('Skipped a lesson state without an id.');
      continue;
    }
    lessonStates.push({
      lessonId: sanitizeText(item.lessonId, 120),
      currentStep: isNum(item.currentStep) ? Math.max(0, Math.floor(item.currentStep)) : 0,
      answers: cleanStringRecord(item.answers),
      hintCounts: cleanNumberRecord(item.hintCounts),
      completed: item.completed === true,
      completedAt: isIso(item.completedAt) ? (item.completedAt as string) : undefined,
      updatedAt: isIso(item.updatedAt) ? (item.updatedAt as string) : new Date(0).toISOString(),
    });
  }

  const attempts: AttemptRecord[] = [];
  for (const item of arr('attempts')) {
    if (!isObj(item) || !isStr(item.conceptId) || !isStr(item.exerciseId)) {
      warnings.push('Skipped an attempt without a concept or exercise id.');
      continue;
    }
    attempts.push({
      conceptId: sanitizeText(item.conceptId, 120),
      lessonId: sanitizeText(item.lessonId, 120),
      exerciseId: sanitizeText(item.exerciseId, 120),
      answer: sanitizeText(item.answer, 300),
      correct: item.correct === true,
      hintsUsed: isNum(item.hintsUsed) ? Math.max(0, Math.floor(item.hintsUsed)) : 0,
      attemptNumber: isNum(item.attemptNumber) ? Math.max(1, Math.floor(item.attemptNumber)) : 1,
      misconception: isStr(item.misconception) ? sanitizeText(item.misconception, 120) : undefined,
      at: isIso(item.at) ? (item.at as string) : new Date().toISOString(),
    });
  }

  const mastery: MasteryRecord[] = [];
  for (const item of arr('mastery')) {
    if (!isObj(item) || !isStr(item.conceptId)) {
      warnings.push('Skipped a mastery record without a concept id.');
      continue;
    }
    const state = MASTERY_STATES.includes(item.state as MasteryState) ? (item.state as MasteryState) : 'introduced';
    if (state !== item.state) warnings.push(`Unknown mastery state replaced with "introduced" for ${sanitizeText(item.conceptId, 60)}.`);
    mastery.push({
      conceptId: sanitizeText(item.conceptId, 120),
      state,
      score: isNum(item.score) ? Math.min(100, Math.max(0, item.score)) : 0,
      independentCorrect: isNum(item.independentCorrect) ? Math.max(0, Math.floor(item.independentCorrect)) : 0,
      assistedCorrect: isNum(item.assistedCorrect) ? Math.max(0, Math.floor(item.assistedCorrect)) : 0,
      incorrect: isNum(item.incorrect) ? Math.max(0, Math.floor(item.incorrect)) : 0,
      distinctExerciseKinds: Array.isArray(item.distinctExerciseKinds)
        ? item.distinctExerciseKinds.filter(isStr).map((s) => sanitizeText(s, 80))
        : [],
      lastSeenAt: isIso(item.lastSeenAt) ? (item.lastSeenAt as string) : undefined,
      lastReviewedAt: isIso(item.lastReviewedAt) ? (item.lastReviewedAt as string) : undefined,
      updatedAt: isIso(item.updatedAt) ? (item.updatedAt as string) : new Date(0).toISOString(),
    });
  }

  const experiments: ExperimentRecord[] = [];
  for (const item of arr('experiments')) {
    if (!isObj(item) || !isStr(item.id) || !isStr(item.tool)) {
      warnings.push('Skipped an experiment missing its id or tool.');
      continue;
    }
    experiments.push({
      id: sanitizeText(item.id, 120),
      name: sanitizeText(item.name, 120) || 'Untitled experiment',
      tool: sanitizeText(item.tool, 60),
      state: item.state,
      createdAt: isIso(item.createdAt) ? (item.createdAt as string) : new Date().toISOString(),
      updatedAt: isIso(item.updatedAt) ? (item.updatedAt as string) : new Date().toISOString(),
    });
  }

  const history: HistoryRecord[] = [];
  for (const item of arr('history')) {
    if (!isObj(item) || !isStr(item.kind)) continue;
    history.push({
      kind: sanitizeText(item.kind, 60) as HistoryRecord['kind'],
      lessonId: isStr(item.lessonId) ? sanitizeText(item.lessonId, 120) : undefined,
      conceptId: isStr(item.conceptId) ? sanitizeText(item.conceptId, 120) : undefined,
      detail: sanitizeText(item.detail),
      at: isIso(item.at) ? (item.at as string) : new Date().toISOString(),
    });
  }

  const reviews: ReviewRecord[] = [];
  for (const item of arr('reviews')) {
    if (!isObj(item) || !isStr(item.conceptId)) continue;
    reviews.push({
      conceptId: sanitizeText(item.conceptId, 120),
      dueAt: isIso(item.dueAt) ? (item.dueAt as string) : new Date().toISOString(),
      intervalDays: isNum(item.intervalDays) ? Math.max(0, item.intervalDays) : 1,
      ease: isNum(item.ease) ? Math.min(4, Math.max(1, item.ease)) : 2.3,
      reps: isNum(item.reps) ? Math.max(0, Math.floor(item.reps)) : 0,
      lapses: isNum(item.lapses) ? Math.max(0, Math.floor(item.lapses)) : 0,
      lastResult: item.lastResult === 'correct' || item.lastResult === 'incorrect' ? item.lastResult : undefined,
      updatedAt: isIso(item.updatedAt) ? (item.updatedAt as string) : new Date().toISOString(),
    });
  }

  const reviewLogs: ReviewLogRecord[] = [];
  for (const item of arr('reviewLogs')) {
    if (!isObj(item) || !isStr(item.conceptId)) continue;
    reviewLogs.push({
      conceptId: sanitizeText(item.conceptId, 120),
      at: isIso(item.at) ? (item.at as string) : new Date().toISOString(),
      result: item.result === 'correct' ? 'correct' : 'incorrect',
      assisted: item.assisted === true,
    });
  }

  let profile: StoredProfile | undefined;
  if (isObj(d.profile) && (d.profile as Record<string, unknown>).id === 'app') {
    const p = d.profile as Record<string, unknown>;
    profile = {
      id: 'app',
      schemaVersion: isNum(p.schemaVersion) ? p.schemaVersion : DB_VERSION,
      preferences: isObj(p.preferences) ? (p.preferences as Record<string, unknown>) : {},
      createdAt: isIso(p.createdAt) ? (p.createdAt as string) : new Date().toISOString(),
      updatedAt: isIso(p.updatedAt) ? (p.updatedAt as string) : new Date().toISOString(),
    };
  }

  if (errors.length) return { ok: false, errors, warnings };

  return {
    ok: true,
    errors,
    warnings,
    backup: {
      format: BACKUP_FORMAT,
      formatVersion: raw.formatVersion as number,
      exportedAt: isIso(raw.exportedAt) ? (raw.exportedAt as string) : new Date().toISOString(),
      app: isObj(raw.app)
        ? {
            schemaVersion: isNum(raw.app.schemaVersion) ? raw.app.schemaVersion : DB_VERSION,
            contentVersion: isNum(raw.app.contentVersion) ? raw.app.contentVersion : CONTENT_VERSION,
          }
        : { schemaVersion: DB_VERSION, contentVersion: CONTENT_VERSION },
      data: { profile, lessonStates, attempts, mastery, experiments, history, reviews, reviewLogs },
    },
    stats: {
      lessonStates: lessonStates.length,
      attempts: attempts.length,
      mastery: mastery.length,
      experiments: experiments.length,
    },
  };
}

export function parseBackupJson(text: string): ValidationResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['The file is not valid JSON.'], warnings: [] };
  }
  return validateBackup(raw);
}

export type ImportMode = 'merge' | 'replace';

export interface ImportResult {
  mode: ImportMode;
  imported: { lessonStates: number; attempts: number; mastery: number; experiments: number; reviews: number };
  warnings: string[];
}

const newest = (a: string | undefined, b: string | undefined): string | undefined => {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
};

/**
 * Apply a validated backup. Never partially applies: replace runs in one transaction
 * after clearing; merge upserts per record (newest updatedAt wins for single-record stores).
 */
export async function applyBackup(repos: Repos, backup: Backup, mode: ImportMode): Promise<ImportResult> {
  const warnings: string[] = [];
  const d = backup.data;
  const before = {
    profile: await repos.getProfile(),
    mastery: new Map((await repos.allMastery()).map((m) => [m.conceptId, m])),
    reviews: new Map((await repos.allReviews()).map((r) => [r.conceptId, r])),
    experiments: new Map((await repos.allExperiments()).map((e) => [e.id, e])),
    lessonStates: new Map((await repos.allLessonStates()).map((l) => [l.lessonId, l])),
  };

  const to = mergeInto(d, before, mode, warnings);
  if (mode === 'replace') {
    await repos.replaceAll(to);
  } else {
    for (const ls of to.lessonStates) await repos.putLessonState(ls);
    for (const m of to.mastery) await repos.putMastery(m);
    for (const e of to.experiments) await repos.putExperiment(e);
    for (const r of to.reviews) await repos.putReview(r);
    if (to.profile) await repos.putProfile(to.profile);
    await repos.appendAll({ attempts: to.attempts, history: to.history, reviewLogs: to.reviewLogs });
  }
  await repos.addHistory({
    kind: 'import',
    detail: `Imported backup (${mode}) with ${d.attempts.length} attempts.`,
    at: new Date().toISOString(),
  });

  return {
    mode,
    imported: {
      lessonStates: d.lessonStates.length,
      attempts: d.attempts.length,
      mastery: d.mastery.length,
      experiments: d.experiments.length,
      reviews: d.reviews.length,
    },
    warnings,
  };
}

type Snapshot = {
  profile?: StoredProfile;
  mastery: Map<string, MasteryRecord>;
  reviews: Map<string, ReviewRecord>;
  experiments: Map<string, ExperimentRecord>;
  lessonStates: Map<string, LessonStateRecord>;
};

/** Pure merge decision (exported for tests). Newest-updated record wins per key. */
export function mergeInto(d: BackupData, existing: Snapshot, mode: ImportMode, warnings: string[]): BackupData {
  if (mode === 'replace') {
    return {
      profile: d.profile,
      lessonStates: d.lessonStates,
      attempts: d.attempts,
      mastery: d.mastery,
      experiments: d.experiments,
      history: d.history,
      reviews: d.reviews,
      reviewLogs: d.reviewLogs,
    };
  }
  const newestBy = <T extends { updatedAt: string }>(
    local: Map<string, T>,
    incoming: T[],
    key: (x: T) => string,
    label: string,
  ): T[] =>
    incoming.map((rec) => {
      const prev = local.get(key(rec));
      if (prev && Date.parse(prev.updatedAt) > Date.parse(rec.updatedAt)) {
        warnings.push(`Kept newer local ${label}.`);
        return prev;
      }
      return rec;
    });

  const lessonStates = newestBy(existing.lessonStates, d.lessonStates, (l) => l.lessonId, 'lesson progress');
  const mastery = newestBy(existing.mastery, d.mastery, (m) => m.conceptId, 'mastery record');
  const reviews = newestBy(existing.reviews, d.reviews, (r) => r.conceptId, 'review schedule');
  const experiments = newestBy(existing.experiments, d.experiments, (e) => e.id, 'experiment');
  const useProfile =
    d.profile && (!existing.profile || Date.parse(d.profile.updatedAt) > Date.parse(existing.profile.updatedAt))
      ? d.profile
      : undefined;

  return {
    profile: useProfile ?? existing.profile,
    lessonStates: [...existing.lessonStates.values()].filter((l) => !lessonStates.some((n) => n.lessonId === l.lessonId)).concat(lessonStates),
    attempts: d.attempts,
    mastery: [...existing.mastery.values()].filter((m) => !mastery.some((n) => n.conceptId === m.conceptId)).concat(mastery),
    experiments: [...existing.experiments.values()].filter((e) => !experiments.some((n) => n.id === e.id)).concat(experiments),
    history: d.history,
    reviews: [...existing.reviews.values()].filter((r) => !reviews.some((n) => n.conceptId === r.conceptId)).concat(reviews),
    reviewLogs: d.reviewLogs,
  };
}

export { newest };

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
 *
 * RECORD IDENTITY
 * Append-only records (attempts, history, reviewLogs) carry a `uid`: an opaque string
 * assigned once at creation and exported verbatim. Merge imports skip a row whose uid is
 * already stored, so importing the same backup twice changes nothing. Backups written
 * before uids existed are given a deterministic legacy uid derived from the full row
 * content (plus its occurrence number within the file) -- see `legacyUid`.
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
  MergePlan,
  createUid,
  isValidUid,
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

/**
 * Deterministic identity for an append-only row from a backup that has no `uid`.
 *
 * The hash covers every persisted field (not just the answer or the timestamp), so two
 * legitimate records that differ at all stay distinct, while the same legacy file imported
 * twice yields the same uid and is deduplicated. `occurrence` separates byte-identical
 * rows *within one file*: those are distinct records written in the same millisecond, and
 * they must all survive.
 */
export function legacyUid(kind: string, fields: unknown[], occurrence: number): string {
  const text = JSON.stringify([kind, ...fields]);
  // FNV-1a, 32-bit, twice with different offsets -> 64 bits of stable hex.
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000197) >>> 0;
  }
  return `legacy:${kind}:${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}:${occurrence}`;
}

/** Assign identities to one validated array, keeping each duplicate *within the file* distinct. */
function assignUids<T extends object>(
  rows: T[],
  kind: string,
  fieldsOf: (row: T) => unknown[],
  validUid: (row: T, index: number) => string | undefined,
): (T & { uid: string })[] {
  const seen = new Set<string>();
  const occurrences = new Map<string, number>();
  return rows.map((row, index) => {
    let uid = validUid(row, index);
    if (!uid) {
      const base = legacyUid(kind, fieldsOf(row), 0);
      const n = occurrences.get(base) ?? 0;
      occurrences.set(base, n + 1);
      uid = legacyUid(kind, fieldsOf(row), n);
    }
    if (seen.has(uid)) {
      // A file that repeats a uid cannot have come from this app; keep both records.
      let n = 1;
      let candidate = `${uid}~${n}`;
      while (seen.has(candidate)) candidate = `${uid}~${++n}`;
      uid = candidate;
    }
    seen.add(uid);
    return { ...row, uid };
  });
}

const rawUid = (item: Record<string, unknown>): string | undefined => (isValidUid(item.uid) ? item.uid : undefined);

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
    const currentPhase = item.phase;
    lessonStates.push({
      lessonId: sanitizeText(item.lessonId, 120),
      currentStep: isNum(item.currentStep) ? Math.max(0, Math.floor(item.currentStep)) : 0,
      answers: cleanStringRecord(item.answers),
      hintCounts: cleanNumberRecord(item.hintCounts),
      completed: item.completed === true,
      completedAt: isIso(item.completedAt) ? (item.completedAt as string) : undefined,
      updatedAt: isIso(item.updatedAt) ? (item.updatedAt as string) : new Date(0).toISOString(),
      // Unknown stages are dropped rather than guessed: the app then resumes on the saved
      // teaching step, which is what a backup written before stages existed does too.
      ...(currentPhase === 'teach' || currentPhase === 'practice' || currentPhase === 'check' || currentPhase === 'done' ? { phase: currentPhase } : {}),
      ...(isNum(item.index) ? { index: Math.max(0, Math.floor(item.index)) } : {}),
    });
  }

  const attemptsIn: Omit<AttemptRecord, 'uid'>[] = [];
  const attemptUids: (string | undefined)[] = [];
  for (const item of arr('attempts')) {
    if (!isObj(item) || !isStr(item.conceptId) || !isStr(item.exerciseId)) {
      warnings.push('Skipped an attempt without a concept or exercise id.');
      continue;
    }
    attemptUids.push(rawUid(item));
    attemptsIn.push({
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
  const attempts: AttemptRecord[] = assignUids<Omit<AttemptRecord, 'uid'>>(
    attemptsIn,
    'attempt',
    (a) => [a.conceptId, a.lessonId, a.exerciseId, a.answer, a.correct, a.hintsUsed, a.attemptNumber, a.misconception ?? null, a.at],
    (_row, i) => attemptUids[i],
  );
  // Only a *supplied* uid that had to be changed deserves a warning; a legacy file with no
  // uids at all is handled silently by the documented compatibility strategy.
  if (attempts.some((a, i) => attemptUids[i] !== undefined && a.uid !== attemptUids[i])) {
    warnings.push('Some attempt identities were repeated in the file; the records were kept with distinct identities.');
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

  const historyIn: Omit<HistoryRecord, 'uid'>[] = [];
  const historyUids: (string | undefined)[] = [];
  for (const item of arr('history')) {
    if (!isObj(item) || !isStr(item.kind)) continue;
    historyUids.push(rawUid(item));
    historyIn.push({
      kind: sanitizeText(item.kind, 60) as HistoryRecord['kind'],
      lessonId: isStr(item.lessonId) ? sanitizeText(item.lessonId, 120) : undefined,
      conceptId: isStr(item.conceptId) ? sanitizeText(item.conceptId, 120) : undefined,
      detail: sanitizeText(item.detail),
      at: isIso(item.at) ? (item.at as string) : new Date().toISOString(),
    });
  }
  const history: HistoryRecord[] = assignUids<Omit<HistoryRecord, 'uid'>>(
    historyIn,
    'history',
    (h) => [h.kind, h.lessonId ?? null, h.conceptId ?? null, h.detail, h.at],
    (_row, i) => historyUids[i],
  );

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

  const reviewLogsIn: Omit<ReviewLogRecord, 'uid'>[] = [];
  const reviewLogUids: (string | undefined)[] = [];
  for (const item of arr('reviewLogs')) {
    if (!isObj(item) || !isStr(item.conceptId)) continue;
    reviewLogUids.push(rawUid(item));
    reviewLogsIn.push({
      conceptId: sanitizeText(item.conceptId, 120),
      at: isIso(item.at) ? (item.at as string) : new Date().toISOString(),
      result: item.result === 'correct' ? 'correct' : 'incorrect',
      assisted: item.assisted === true,
    });
  }
  const reviewLogs: ReviewLogRecord[] = assignUids<Omit<ReviewLogRecord, 'uid'>>(
    reviewLogsIn,
    'reviewLog',
    (l) => [l.conceptId, l.at, l.result, l.assisted],
    (_row, i) => reviewLogUids[i],
  );

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
  /** What the backup contains (the summary shown in Settings). */
  imported: { lessonStates: number; attempts: number; mastery: number; experiments: number; reviews: number };
  /** What actually changed the database: rows already present (same uid) were skipped. */
  applied: { attempts: number; history: number; reviewLogs: number; skipped: number };
  warnings: string[];
}

const newest = (a: string | undefined, b: string | undefined): string | undefined => {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
};

/**
 * Apply a validated backup.
 *
 * Both modes commit in exactly one IndexedDB transaction (`replaceAll` clears first;
 * `mergeAll` writes everything together). A failure at any point leaves every store
 * exactly as it was, and the rejection is passed to the caller to report honestly.
 */
export async function applyBackup(repos: Repos, backup: Backup, mode: ImportMode): Promise<ImportResult> {
  const warnings: string[] = [];
  const d = backup.data;
  const audit: HistoryRecord = {
    uid: createUid(),
    kind: 'import',
    detail: `Imported backup (${mode}) with ${d.attempts.length} attempts.`,
    at: new Date().toISOString(),
  };

  let applied: ImportResult['applied'];
  if (mode === 'replace') {
    await repos.replaceAll({ ...d, history: [...d.history, audit] });
    applied = { attempts: d.attempts.length, history: d.history.length + 1, reviewLogs: d.reviewLogs.length, skipped: 0 };
  } else {
    const before = {
      profile: await repos.getProfile(),
      mastery: new Map((await repos.allMastery()).map((m) => [m.conceptId, m])),
      reviews: new Map((await repos.allReviews()).map((r) => [r.conceptId, r])),
      experiments: new Map((await repos.allExperiments()).map((e) => [e.id, e])),
      lessonStates: new Map((await repos.allLessonStates()).map((l) => [l.lessonId, l])),
    };
    const plan = mergePlan(d, before, warnings, audit);
    const report = await repos.mergeAll(plan);
    applied = {
      attempts: plan.attempts.length - report.skipped.attempts,
      history: plan.history.length - report.skipped.history,
      reviewLogs: plan.reviewLogs.length - report.skipped.reviewLogs,
      skipped: report.skipped.attempts + report.skipped.history + report.skipped.reviewLogs,
    };
    if (applied.skipped > 0) warnings.push(`${applied.skipped} record(s) were already on this device and were not imported again.`);
  }

  return {
    mode,
    imported: {
      lessonStates: d.lessonStates.length,
      attempts: d.attempts.length,
      mastery: d.mastery.length,
      experiments: d.experiments.length,
      reviews: d.reviews.length,
    },
    applied,
    warnings,
  };
}

export type Snapshot = {
  profile?: StoredProfile;
  mastery: Map<string, MasteryRecord>;
  reviews: Map<string, ReviewRecord>;
  experiments: Map<string, ExperimentRecord>;
  lessonStates: Map<string, LessonStateRecord>;
};

/**
 * Decide what a merge writes. Keyed stores keep their documented rule (newest updatedAt
 * wins); append-only stores carry every incoming row and let the storage transaction drop
 * the ones whose uid is already present. The import audit entry is part of the same plan,
 * so it commits (or fails) with the rest.
 */
export function mergePlan(d: BackupData, existing: Snapshot, warnings: string[], audit: HistoryRecord): MergePlan {
  const updated = <T extends { updatedAt: string }>(local: T | undefined, incoming: T, label: string): T => {
    if (local && Date.parse(local.updatedAt) > Date.parse(incoming.updatedAt)) {
      warnings.push(`Kept newer local ${label}.`);
      return local;
    }
    return incoming;
  };
  return {
    profile: d.profile ? updated(existing.profile, d.profile, 'profile') : existing.profile,
    lessonStates: d.lessonStates.map((l) => updated(existing.lessonStates.get(l.lessonId), l, 'lesson progress')),
    mastery: d.mastery.map((m) => updated(existing.mastery.get(m.conceptId), m, 'mastery record')),
    reviews: d.reviews.map((r) => updated(existing.reviews.get(r.conceptId), r, 'review schedule')),
    experiments: d.experiments.map((e) => updated(existing.experiments.get(e.id), e, 'experiment')),
    attempts: d.attempts,
    history: [...d.history, audit],
    reviewLogs: d.reviewLogs,
  };
}

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
  const plan = mergePlan(d, existing, warnings, {
    uid: 'merge-into:audit',
    kind: 'import',
    detail: '',
    at: new Date(0).toISOString(),
  });
  return {
    profile: plan.profile,
    lessonStates: plan.lessonStates,
    attempts: plan.attempts,
    mastery: plan.mastery,
    experiments: plan.experiments,
    history: d.history,
    reviews: plan.reviews,
    reviewLogs: plan.reviewLogs,
  };
}

export { newest };

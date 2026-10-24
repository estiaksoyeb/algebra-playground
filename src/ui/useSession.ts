/**
 * Application session state: loads persisted learning data once, records attempts
 * (attempt + mastery + review scheduling + history), and exposes save status.
 *
 * All persistence goes through the Repos abstraction. Every meaningful change is
 * awaited and failures set saveStatus='error' with a message — the UI never claims
 * data was saved before the write resolves.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  Repos,
  StoredProfile,
  LessonStateRecord,
  LessonPhase,
  CheckPracticeRecord,
  AttemptRecord,
  MasteryRecord,
  HistoryRecord,
  ReviewRecord,
  ExperimentRecord,
} from '../storage/repositories';
import { createUid, getStorage } from '../storage/repositories';
import { DB_VERSION, wrapError } from '../storage/db';
import { applyAttempt, computeScore, decideMastery, emptyMastery } from '../engine/mastery';
import { scheduleReview, scheduleAfterLesson, initialReview } from '../engine/review';
import { Exercise } from '../content/types';
import { LESSON_BY_ID } from '../content/curriculum';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface SessionData {
  profile?: StoredProfile;
  lessonStates: Record<string, LessonStateRecord>;
  mastery: Record<string, MasteryRecord>;
  reviews: Record<string, ReviewRecord>;
  experiments: ExperimentRecord[];
  history: HistoryRecord[];
  attempts: AttemptRecord[];
}

export interface SessionState {
  /** `unavailable` = the initial load failed; nothing is known about saved progress. */
  status: 'loading' | 'ready' | 'unavailable';
  saveStatus: SaveStatus;
  saveError?: string;
  /** Set when the initial load failed, so a read failure is never reported as "no progress". */
  loadError?: string;
  lastSavedAt?: string;
  storageAvailable: boolean;
  data: SessionData;
}

type MergeAction = { type: 'merge'; field: string; update: (data: SessionData) => Partial<SessionData> };

type Action =
  | MergeAction
  | { type: 'loaded'; data: SessionData }
  | { type: 'load-failed'; error: string }
  | { type: 'saving' }
  | { type: 'saved'; at: string }
  | { type: 'save-failed'; error: string }
  | { type: 'reload'; data: SessionData };

/** A merge step, tagged with the field it replaces so tests can assert it keeps data. */
const mergeMarker = (_latest: SessionData, field: string, update: (d: SessionData) => Partial<SessionData>): MergeAction =>
  ({ type: 'merge', field, update });

const emptyData = (): SessionData => ({ lessonStates: {}, mastery: {}, reviews: {}, experiments: [], history: [], attempts: [] });

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'loaded':
      return { ...state, status: 'ready', data: action.data, storageAvailable: true };
    case 'load-failed':
      return { ...state, status: 'unavailable', storageAvailable: false, loadError: action.error, saveError: action.error, saveStatus: 'error' };
    case 'saving':
      return { ...state, saveStatus: 'saving' };
    case 'saved':
      return { ...state, saveStatus: 'saved', lastSavedAt: action.at, saveError: undefined };
    case 'save-failed':
      return { ...state, saveStatus: 'error', saveError: action.error };
    case 'merge':
      return { ...state, data: { ...state.data, ...action.update(state.data) } };
    case 'reload':
      return { ...state, status: 'ready', data: action.data, saveStatus: 'idle', saveError: undefined };
  }
}

export async function loadSessionData(repos: Repos): Promise<SessionData> {
  const [profile, lessonStates, mastery, reviews, experiments, history, attempts] = await Promise.all([
    repos.getProfile(),
    repos.allLessonStates(),
    repos.allMastery(),
    repos.allReviews(),
    repos.allExperiments(),
    repos.allHistory(),
    repos.allAttempts(),
  ]);
  return {
    profile,
    lessonStates: Object.fromEntries(lessonStates.map((l) => [l.lessonId, l])),
    mastery: Object.fromEntries(mastery.map((m) => [m.conceptId, m])),
    reviews: Object.fromEntries(reviews.map((r) => [r.conceptId, r])),
    experiments: experiments.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    history: history.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
    attempts,
  };
}

export interface LessonProgressPatch {
  currentStep?: number;
  answers?: Record<string, string>;
  hintCounts?: Record<string, number>;
  completed?: boolean;
  /** Where the learner was, so practice and check positions resume too. */
  phase?: LessonPhase;
  index?: number;
  checkPractice?: Record<string, CheckPracticeRecord>;
}

export interface RecordAttemptInput {
  exercise: Exercise;
  lessonId: string;
  answer: string;
  correct: boolean;
  hintsUsed: number;
  misconception?: string;
}

export interface SessionApi {
  state: SessionState;
  progressLesson(lessonId: string, patch: LessonProgressPatch): Promise<boolean>;
  /**
   * Lesson ids whose progress write has been issued but not yet confirmed by storage.
   * The lesson runner uses this to lock its controls and to ignore stale data.
   */
  pendingLessons: ReadonlySet<string>;
  recordAttempt(input: RecordAttemptInput): Promise<{ ok: boolean; mastery: MasteryRecord | null }>;
  passMasteryCheck(lessonId: string): Promise<boolean>;
  recordReviewResult(conceptId: string, result: { correct: boolean; assisted: boolean }): Promise<boolean>;
  saveExperiment(exp: { id?: string; name: string; tool: string; state: unknown }): Promise<ExperimentRecord | null>;
  getExperiment(id: string): Promise<ExperimentRecord | null>;
  /** Storage handle for backup/export/import; null when storage is unavailable. */
  getRepos(): Promise<Repos | null>;
  deleteExperiment(id: string): Promise<boolean>;
  addHistory(kind: HistoryRecord['kind'], detail: string, extra?: Partial<HistoryRecord>): Promise<void>;
  setPreference(key: string, value: unknown): Promise<void>;
  refresh(): Promise<void>;
  reloadAfterImport(): Promise<void>;
  clearSaveError(): void;
  resetAll(): Promise<void>;
}

/**
 * The storage promise is started once per page load. React StrictMode mounts effects
 * twice in development; sharing one promise guarantees the second mount reuses the
 * same connection and sees the same data instead of racing a second open/load.
 */
let sharedRepos: Promise<Repos> | null = null;
function storagePromise(): Promise<Repos> {
  if (!sharedRepos) {
    sharedRepos = getStorage().catch((err) => {
      sharedRepos = null;
      throw err;
    });
  }
  return sharedRepos;
}

/** Test-only: forget the cached connection after `resetStorage()` replaces the database. */
export function __resetStorageMemoForTests(): void {
  sharedRepos = null;
}

export function useSession(reposPromise?: Promise<Repos>): SessionApi {
  const [state, dispatch] = useReducer(reducer, {
    status: 'loading',
    saveStatus: 'idle',
    storageAvailable: true,
    data: emptyData(),
  });
  // Lesson ids with a progress write in flight. Exposed to the UI so it can lock the
  // controls and refuse to act on data it knows is already stale.
  const [pendingLessons, setPendingLessons] = useState<ReadonlySet<string>>(() => new Set());
  const markPending = useCallback((lessonId: string, pending: boolean) => {
    setPendingLessons((prev) => {
      if (prev.has(lessonId) === pending) return prev;
      const next = new Set(prev);
      if (pending) next.add(lessonId);
      else next.delete(lessonId);
      return next;
    });
  }, []);
  const reposRef = useRef<Repos | null>(null);
  // Resolves with the repository connection; waits for the initial load to settle so a
  // screen that opens a saved experiment on a fresh page never races the load.
  const readyRef = useRef<Promise<Repos> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  // Handed to merge markers: this is the data the reducer is about to merge into.
  const latestDataRef = useRef(state.data);
  latestDataRef.current = state.data;

  // Load exactly once per instance. The effect must not cancel itself: in development
  // React StrictMode runs the "unmount" of a render it then keeps, and calling the
  // cleanup last would discard the very load that this instance needs.
  const loadStarted = useRef(false);
  useEffect(() => {
    if (loadStarted.current) return;
    loadStarted.current = true;
    // Attach the handler before anything can reject, so a failed open is reported once.
    const connection = reposPromise ?? storagePromise();
    connection.catch(() => {
      dispatch({ type: 'load-failed', error: 'Storage is unavailable. Progress is not being saved.' });
    });
    readyRef.current = (async () => {
      // Only the connection itself decides whether storage is available. A failure to
      // *read* afterwards is reported as a read error, not as "storage unavailable".
      const repos = await connection;
      // Set the connection for this instance too. Each useSession() instance has its own
      // effect, and the one the facade adopts may not be the one that started the load;
      // without this, that instance's saves would fail with a false "storage unavailable".
      reposRef.current = repos;
      try {
        dispatch({ type: 'loaded', data: await loadSessionData(repos) });
      } catch (err) {
        dispatch({ type: 'load-failed', error: wrapError(err).message });
      }
      return repos;
    })();
    // reposPromise intentionally captured once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSave = useCallback(async (fn: (repos: Repos) => Promise<void>): Promise<boolean> => {
    // Fall back to the shared connection when this instance's own effect has not set
    // `reposRef` yet. Storage is a page-level singleton, so the connection is the same
    // one every instance would use; refusing to save here would report "storage
    // unavailable" while the database is perfectly healthy.
    let repos = reposRef.current;
    if (!repos) {
      try {
        repos = await (reposPromise ?? storagePromise());
        reposRef.current = repos;
      } catch {
        dispatch({ type: 'save-failed', error: 'Storage is unavailable. Progress is not being saved.' });
        return false;
      }
    }
    dispatch({ type: 'saving' });
    try {
      await fn(repos);
      dispatch({ type: 'saved', at: new Date().toISOString() });
      return true;
    } catch (err) {
      dispatch({ type: 'save-failed', error: wrapError(err).message });
      return false;
    }
  }, [reposPromise]);

  const progressLesson = useCallback(
    async (lessonId: string, patch: LessonProgressPatch): Promise<boolean> => {
      // Storage has not been read yet (or the read failed): writing now would replace the
      // learner's real saved position with whatever the screen happens to show.
      if (stateRef.current.status !== 'ready') {
        dispatch({ type: 'save-failed', error: 'Your saved progress has not loaded yet, so nothing was changed.' });
        return false;
      }
      const prev = stateRef.current.data.lessonStates[lessonId];
      const now = new Date().toISOString();
      const next: LessonStateRecord = {
        lessonId,
        currentStep: patch.currentStep ?? prev?.currentStep ?? 0,
        answers: { ...(prev?.answers ?? {}), ...(patch.answers ?? {}) },
        hintCounts: { ...(prev?.hintCounts ?? {}), ...(patch.hintCounts ?? {}) },
        completed: patch.completed ?? prev?.completed ?? false,
        completedAt: patch.completed ? (prev?.completedAt ?? now) : prev?.completedAt,
        updatedAt: now,
        ...(patch.phase !== undefined ? { phase: patch.phase } : prev?.phase !== undefined ? { phase: prev.phase } : {}),
        ...(patch.index !== undefined ? { index: patch.index } : prev?.index !== undefined ? { index: prev.index } : {}),
        ...(patch.checkPractice !== undefined ? { checkPractice: patch.checkPractice } : prev?.checkPractice !== undefined ? { checkPractice: prev.checkPractice } : {}),
      };
      // Completion is special: it also appends a history row, schedules the lesson's
      // concept reviews and introduces their mastery records. All of it commits in ONE
      // transaction, so a lesson can never read "complete" on screen while the database
      // still says otherwise.
      const justCompleted = Boolean(patch.completed) && !prev?.completed;
      const lesson = LESSON_BY_ID[lessonId];
      const history: HistoryRecord[] = [];
      const reviews: ReviewRecord[] = [];
      const mastery: MasteryRecord[] = [];
      if (justCompleted) {
        history.push({ uid: createUid(), kind: 'lesson-complete', lessonId, detail: lesson?.title ?? lessonId, at: now });
        for (const conceptId of lesson?.conceptIds ?? []) {
          const existing = stateRef.current.data.reviews[conceptId];
          reviews.push(existing ?? scheduleAfterLesson(conceptId, new Date(now)));
          const m = stateRef.current.data.mastery[conceptId] ?? emptyMastery(conceptId, now);
          if (m.state === 'not-introduced') mastery.push({ ...m, state: 'introduced' as const, updatedAt: now });
        }
      }
      markPending(lessonId, true);
      let ok: boolean;
      try {
        // The state is NOT dispatched first: nothing on screen may claim the new position
        // until IndexedDB has confirmed the write.
        ok = await runSave(async (repos) => {
          await repos.commitLesson({ state: next, lessonCompleted: justCompleted, history, mastery, reviews });
        });
      } finally {
        markPending(lessonId, false);
      }
      if (!ok) return false;
      dispatch(
        mergeMarker(latestDataRef.current, 'lessonStates', (d) => ({
          lessonStates: { ...d.lessonStates, [lessonId]: next },
          ...(history.length ? { history: [...d.history, ...history] } : {}),
          ...(reviews.length ? { reviews: { ...d.reviews, ...Object.fromEntries(reviews.map((r) => [r.conceptId, r])) } } : {}),
          ...(mastery.length ? { mastery: { ...d.mastery, ...Object.fromEntries(mastery.map((m) => [m.conceptId, m])) } } : {}),
        })),
      );
      return true;
    },
    [runSave, markPending],
  );

  const recordAttempt = useCallback(
    async (input: RecordAttemptInput): Promise<{ ok: boolean; mastery: MasteryRecord | null }> => {
      const now = new Date().toISOString();
      const conceptId = input.exercise.conceptId;
      const currentAttempts = stateRef.current.data.attempts.filter((a) => a.exerciseId === input.exercise.id);
      const attemptRecord: AttemptRecord = {
        uid: createUid(),
        conceptId,
        lessonId: input.lessonId,
        exerciseId: input.exercise.id,
        answer: input.answer.slice(0, 300),
        correct: input.correct,
        hintsUsed: input.hintsUsed,
        attemptNumber: currentAttempts.length + 1,
        misconception: input.misconception,
        at: now,
      };
      const conceptAttempts = [...stateRef.current.data.attempts.filter((a) => a.conceptId === conceptId), attemptRecord];
      const baseMastery = stateRef.current.data.mastery[conceptId] ?? emptyMastery(conceptId, now);
      const withEvidence = applyAttempt(baseMastery, { correct: input.correct, hintsUsed: input.hintsUsed, variety: input.exercise.variety, at: now }, now);
      const lesson = LESSON_BY_ID[input.lessonId];
      const decision = decideMastery(withEvidence, conceptAttempts, lesson?.mastery, { previousState: baseMastery.state });
      const nextMastery: MasteryRecord = { ...withEvidence, state: decision.state, score: computeScore(withEvidence), updatedAt: now };

      // The attempt and its mastery record commit together. The attempt only enters the
      // session state (and the "already answered" UI) once storage has accepted it.
      let id = 0;
      const ok = await runSave(async (repos) => {
        id = await repos.commitAttempt(attemptRecord, nextMastery);
      });
      if (!ok) return { ok: false, mastery: null };
      dispatch(
        mergeMarker(latestDataRef.current, 'attempts', (d) => ({
          attempts: [...d.attempts, { ...attemptRecord, id }],
          mastery: { ...d.mastery, [conceptId]: nextMastery },
        })),
      );
      return { ok: true, mastery: nextMastery };
    },
    [runSave],
  );

  const passMasteryCheck = useCallback(
    async (lessonId: string): Promise<boolean> => {
      const lesson = LESSON_BY_ID[lessonId];
      if (!lesson) return true;
      const now = new Date().toISOString();
      const nextMastery: MasteryRecord[] = [];
      for (const conceptId of lesson.conceptIds) {
        const prev = stateRef.current.data.mastery[conceptId] ?? emptyMastery(conceptId, now);
        const conceptAttempts = stateRef.current.data.attempts.filter((a) => a.conceptId === conceptId);
        const decision = decideMastery(prev, conceptAttempts, lesson.mastery, { checkPassed: true, previousState: prev.state });
        nextMastery.push({ ...prev, state: decision.state, updatedAt: now });
      }
      const ok = await runSave(async (repos) => {
        for (const next of nextMastery) await repos.putMastery(next);
        for (const next of nextMastery) {
          const prev = stateRef.current.data.mastery[next.conceptId];
          if (prev?.state !== 'established' && next.state === 'established') {
            await repos.addHistory({ uid: createUid(), kind: 'mastery', conceptId: next.conceptId, lessonId, detail: `Mastered ${next.conceptId}`, at: now });
          }
        }
      });
      if (ok) {
        dispatch(
          mergeMarker(latestDataRef.current, 'mastery', (d) => ({
            mastery: { ...d.mastery, ...Object.fromEntries(nextMastery.map((m) => [m.conceptId, m])) },
          })),
        );
      }
      return ok;
    },
    [runSave],
  );

  const recordReviewResult = useCallback(
    async (conceptId: string, result: { correct: boolean; assisted: boolean }): Promise<boolean> => {
      const now = new Date();
      const prev = stateRef.current.data.reviews[conceptId] ?? initialReview(conceptId, now);
      const next = scheduleReview(prev, result, now);
      const mastery = stateRef.current.data.mastery[conceptId];
      let updated: MasteryRecord | undefined;
      if (mastery) {
        updated = {
          ...mastery,
          lastReviewedAt: now.toISOString(),
          state:
            !result.correct && (mastery.state === 'established' || mastery.state === 'provisional')
              ? 'needs-review'
              : result.correct && mastery.state === 'needs-review' && !result.assisted
                ? mastery.independentCorrect >= 3
                  ? 'established'
                  : 'practicing'
                : mastery.state,
          updatedAt: now.toISOString(),
        };
      }
      const history: HistoryRecord = { uid: createUid(), kind: 'review', conceptId, detail: result.correct ? 'Review answered correctly' : 'Review needs more work', at: now.toISOString() };
      const ok = await runSave(async (repos) => {
        await repos.commitReview({
          review: next,
          log: { uid: createUid(), conceptId, at: now.toISOString(), result: result.correct ? 'correct' : 'incorrect', assisted: result.assisted },
          mastery: updated,
          history,
        });
      });
      if (!ok) return false;
      dispatch(
        mergeMarker(latestDataRef.current, 'reviews', (d) => ({
          reviews: { ...d.reviews, [conceptId]: next },
          history: [...d.history, history],
          ...(updated ? { mastery: { ...d.mastery, [conceptId]: updated } } : {}),
        })),
      );
      return true;
    },
    [runSave],
  );

  const saveExperiment = useCallback(
    async (exp: { id?: string; name: string; tool: string; state: unknown }): Promise<ExperimentRecord | null> => {
      const now = new Date().toISOString();
      const existing = exp.id ? stateRef.current.data.experiments.find((e) => e.id === exp.id) : undefined;
      const record: ExperimentRecord = {
        id: exp.id ?? `exp-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
        name: exp.name.trim().slice(0, 120) || 'Untitled experiment',
        tool: exp.tool,
        state: exp.state,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      const ok = await runSave(async (repos) => {
        await repos.putExperiment(record);
        await repos.addHistory({ uid: createUid(), kind: 'experiment-saved', detail: record.name, at: now });
      });
      if (!ok) return null;
      dispatch(mergeMarker(latestDataRef.current, 'experiments', (d) => ({ experiments: [record, ...d.experiments.filter((e) => e.id !== record.id)] })));
      return record;
    },
    [runSave],
  );

  const getExperiment = useCallback(async (id: string): Promise<ExperimentRecord | null> => {
    const local = stateRef.current.data.experiments.find((e) => e.id === id);
    if (local) return local;
    const repos = await (readyRef.current ?? Promise.resolve(reposRef.current));
    if (repos) {
      const found = await repos.getExperiment(id);
      if (found) return found;
    }
    // Either this instance has no connection yet, or its own snapshot was taken before
    // the record was written. Fall back to a fresh connection instead of claiming the
    // experiment is gone.
    try {
      return (await (await storagePromise()).getExperiment(id)) ?? null;
    } catch {
      return null;
    }
  }, []);

  const getRepos = useCallback(async (): Promise<Repos | null> => {
    if (reposRef.current) return reposRef.current;
    try {
      const repos = await storagePromise();
      reposRef.current = repos;
      return repos;
    } catch {
      return null;
    }
  }, []);

  const deleteExperiment = useCallback(
    async (id: string): Promise<boolean> => {
      const ok = await runSave(async (repos) => {
        await repos.deleteExperiment(id);
      });
      if (ok) dispatch(mergeMarker(latestDataRef.current, 'experiments', (d) => ({ experiments: d.experiments.filter((e) => e.id !== id) })));
      return ok;
    },
    [runSave],
  );

  const addHistory = useCallback(
    async (kind: HistoryRecord['kind'], detail: string, extra?: Partial<HistoryRecord>): Promise<void> => {
      const rec: HistoryRecord = { uid: createUid(), kind, detail, at: new Date().toISOString(), ...extra };
      await runSave(async (repos) => {
        await repos.addHistory(rec);
      });
      dispatch(mergeMarker(latestDataRef.current, 'history', (d) => ({ history: [...d.history, rec] })));
    },
    [runSave],
  );

  const setPreference = useCallback(
    async (key: string, value: unknown): Promise<void> => {
      const now = new Date().toISOString();
      const base: StoredProfile =
        stateRef.current.data.profile ?? { id: 'app', schemaVersion: DB_VERSION, preferences: {}, createdAt: now, updatedAt: now };
      const next: StoredProfile = { ...base, schemaVersion: DB_VERSION, preferences: { ...base.preferences, [key]: value }, updatedAt: now };
      dispatch(mergeMarker(latestDataRef.current, 'profile', () => ({ profile: next })));
      await runSave(async (repos) => {
        await repos.putProfile(next);
      });
    },
    [runSave],
  );

  const refresh = useCallback(async () => {
    // Same reasoning as `runSave`: this instance may not have run its load effect, and
    // silently doing nothing would leave the screen showing data the database no longer has.
    let repos = reposRef.current;
    if (!repos) {
      try {
        repos = await (reposPromise ?? storagePromise());
        reposRef.current = repos;
      } catch {
        dispatch({ type: 'save-failed', error: 'Storage is unavailable. Progress is not being saved.' });
        return;
      }
    }
    try {
      dispatch({ type: 'reload', data: await loadSessionData(repos) });
    } catch (err) {
      dispatch({ type: 'save-failed', error: wrapError(err).message });
    }
  }, [reposPromise]);

  const resetAll = useCallback(async () => {
    const repos = reposRef.current;
    if (!repos) {
      dispatch({ type: 'save-failed', error: 'Storage is unavailable, so there is nothing stored to erase.' });
      return;
    }
    dispatch({ type: 'saving' });
    try {
      await repos.clearAll();
      dispatch({ type: 'reload', data: emptyData() });
      dispatch({ type: 'saved', at: new Date().toISOString() });
    } catch (err) {
      dispatch({ type: 'save-failed', error: wrapError(err).message });
    }
  }, []);

  const clearSaveError = useCallback(() => dispatch({ type: 'saved', at: stateRef.current.lastSavedAt ?? new Date().toISOString() }), []);

  return useMemo(
    () => ({
      state,
      progressLesson,
      pendingLessons,
      recordAttempt,
      passMasteryCheck,
      recordReviewResult,
      saveExperiment,
      getExperiment,
      getRepos,
      deleteExperiment,
      addHistory,
      setPreference,
      refresh,
      reloadAfterImport: refresh,
      clearSaveError,
      resetAll,
    }),
    [state, pendingLessons, progressLesson, recordAttempt, passMasteryCheck, recordReviewResult, saveExperiment, getExperiment, getRepos, deleteExperiment, addHistory, setPreference, refresh, clearSaveError, resetAll],
  );
}

/** Derived learning summary used by Home and Progress screens (pure). */
export function summarizeProgress(data: SessionData, lessonOrder: string[]) {
  const completed = new Set(Object.values(data.lessonStates).filter((l) => l.completed).map((l) => l.lessonId));
  const started = Object.values(data.lessonStates).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const nextIncomplete = lessonOrder.find((id) => !completed.has(id));
  const lastStarted = started[0]?.lessonId;
  const masteryCounts: Record<string, number> = {};
  for (const m of Object.values(data.mastery)) masteryCounts[m.state] = (masteryCounts[m.state] ?? 0) + 1;
  const streakDays = computeStreak(data.history.map((h) => h.at));
  return { completed, nextIncomplete, lastStarted, masteryCounts, streakDays };
}

/** Number of consecutive calendar days (local) with any activity, ending today or yesterday. */
export function computeStreak(timestamps: string[], now = new Date()): number {
  const days = new Set(
    timestamps
      .map((t) => new Date(t))
      .filter((d) => !Number.isNaN(d.getTime()))
      .map((d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`),
  );
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  let streak = 0;
  const cursor = new Date(now);
  if (!days.has(key(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(key(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

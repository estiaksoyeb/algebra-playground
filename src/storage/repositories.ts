/**
 * Typed repositories over IndexedDB. UI never touches IndexedDB directly.
 * Every write awaits transaction completion; failures surface to callers so the
 * app can display an honest "not saved" indicator.
 */
import { openDatabase, STORES, StoreName, wrapError, StorageUnavailableError, OpenOptions } from './db';

export type StoredProfile = {
  id: 'app';
  schemaVersion: number;
  preferences: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

/**
 * A resumable rank within the lesson runner, persisted alongside `currentStep`.
 *
 * `currentStep` only describes the teaching (Learn) steps, so a learner in practice, the
 * mastery check or the completion panel used to come back to a teaching step. `phase` and
 * `index` record what was actually on screen. They are optional: records written before
 * they existed (and backups without them) resume exactly as they always did.
 */
export type LessonPhase = 'teach' | 'practice' | 'check' | 'done';

/**
 * A pre-check rehearsal answer ("practise this kind of question first"). It is session
 * memory, not learning evidence: it never becomes an attempt or a mastery signal.
 */
export type CheckPracticeRecord = { answer: string; at: string };

export type LessonStateRecord = {
  lessonId: string;
  currentStep: number;
  answers: Record<string, string>;
  hintCounts: Record<string, number>;
  completed: boolean;
  completedAt?: string;
  updatedAt: string;
  /** Screen the learner was on; absent means "the teaching step in `currentStep`". */
  phase?: LessonPhase;
  /** Exercise position within `practice` or `check`; absent means 0. */
  index?: number;
  /** Pre-check rehearsal answers, keyed by exercise id. Never learning evidence. */
  checkPractice?: Record<string, CheckPracticeRecord>;
};

/** Everything a replanned lesson save writes; one transaction covers all of it. */
export interface LessonCommitPlan {
  state: LessonStateRecord;
  lessonCompleted: boolean;
  mastery: MasteryRecord[];
  history: HistoryRecord[];
  reviews: ReviewRecord[];
}

/**
 * Stable logical identity for append-only records (attempts, history, review log).
 *
 * The numeric `id` is a physical auto-increment key that is reassigned on every import;
 * it cannot survive export → import. `uid` is assigned once when the record is created and
 * travels with it through JSON, so "have I already imported this row?" is answerable.
 */
export type RecordUid = string;

export type AttemptRecord = {
  id?: number;
  uid: RecordUid;
  conceptId: string;
  lessonId: string;
  exerciseId: string;
  answer: string;
  correct: boolean;
  hintsUsed: number;
  attemptNumber: number;
  misconception?: string;
  at: string;
};

export type MasteryState = 'not-introduced' | 'introduced' | 'practicing' | 'provisional' | 'established' | 'needs-review';

export type MasteryRecord = {
  conceptId: string;
  state: MasteryState;
  score: number;
  independentCorrect: number;
  assistedCorrect: number;
  incorrect: number;
  distinctExerciseKinds: string[];
  lastSeenAt?: string;
  lastReviewedAt?: string;
  updatedAt: string;
};

export type ExperimentRecord = {
  id: string;
  name: string;
  tool: string;
  state: unknown;
  createdAt: string;
  updatedAt: string;
};

export type HistoryRecord = {
  id?: number;
  uid: RecordUid;
  kind: 'lesson-complete' | 'lesson-start' | 'exercise' | 'review' | 'experiment-saved' | 'import' | 'reset' | 'mastery';
  lessonId?: string;
  conceptId?: string;
  detail: string;
  at: string;
};

export type ReviewRecord = {
  conceptId: string;
  dueAt: string;
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
  lastResult?: 'correct' | 'incorrect';
  updatedAt: string;
};

export type ReviewLogRecord = {
  id?: number;
  uid: RecordUid;
  conceptId: string;
  at: string;
  result: 'correct' | 'incorrect';
  assisted: boolean;
};

export type MetaRecord = { key: string; value: unknown };

export interface Repos {
  close(): void;
  getProfile(): Promise<StoredProfile | undefined>;
  putProfile(p: StoredProfile): Promise<void>;
  getLessonState(lessonId: string): Promise<LessonStateRecord | undefined>;
  putLessonState(r: LessonStateRecord): Promise<void>;
  /**
   * Write a lesson's progress, its completion record, mastery and schedule changes in ONE
   * transaction, so a failed save cannot leave the lesson marked complete on screen while
   * the database still says otherwise. Resolves only after IndexedDB commits.
   */
  commitLesson(plan: LessonCommitPlan): Promise<void>;
  allLessonStates(): Promise<LessonStateRecord[]>;
  deleteLessonState(lessonId: string): Promise<void>;
  addAttempt(a: AttemptRecord): Promise<number>;
  /** An attempt and its mastery record, in one committed transaction. */
  commitAttempt(attempt: AttemptRecord, mastery: MasteryRecord): Promise<number>;
  allAttempts(): Promise<AttemptRecord[]>;
  attemptsByConcept(conceptId: string): Promise<AttemptRecord[]>;
  clearAttempts(): Promise<void>;
  putMastery(m: MasteryRecord): Promise<void>;
  getMastery(conceptId: string): Promise<MasteryRecord | undefined>;
  allMastery(): Promise<MasteryRecord[]>;
  clearMastery(): Promise<void>;
  putExperiment(e: ExperimentRecord): Promise<void>;
  getExperiment(id: string): Promise<ExperimentRecord | undefined>;
  allExperiments(): Promise<ExperimentRecord[]>;
  deleteExperiment(id: string): Promise<void>;
  clearExperiments(): Promise<void>;
  addHistory(h: HistoryRecord): Promise<number>;
  allHistory(): Promise<HistoryRecord[]>;
  clearHistory(): Promise<void>;
  putReview(r: ReviewRecord): Promise<void>;
  getReview(conceptId: string): Promise<ReviewRecord | undefined>;
  allReviews(): Promise<ReviewRecord[]>;
  clearReviews(): Promise<void>;
  addReviewLog(r: ReviewLogRecord): Promise<number>;
  /** A review result: schedule, log, mastery and history in one committed transaction. */
  commitReview(plan: { review: ReviewRecord; log: ReviewLogRecord; mastery?: MasteryRecord; history: HistoryRecord }): Promise<void>;
  allReviewLogs(): Promise<ReviewLogRecord[]>;
  clearReviewLogs(): Promise<void>;
  getMeta(key: string): Promise<unknown>;
  putMeta(key: string, value: unknown): Promise<void>;
  replaceAll(data: ImportData): Promise<void>;
  /**
   * Apply a merge import in ONE read-write transaction across every affected store.
   * Resolves only after IndexedDB reports completion; any failure (including a request
   * error injected by a test seam) aborts the whole transaction and rejects.
   */
  mergeAll(plan: MergePlan): Promise<MergeReport>;
  testHooks?: StorageTestHooks;
  clearAll(): Promise<void>;
}

/**
 * What `mergeAll` should write. Append-only rows are added only when their `uid` is not
 * already stored; keyed rows are written as given (the caller already decided the winner).
 */
export interface MergePlan {
  profile?: StoredProfile;
  lessonStates: LessonStateRecord[];
  mastery: MasteryRecord[];
  experiments: ExperimentRecord[];
  reviews: ReviewRecord[];
  attempts: AttemptRecord[];
  history: HistoryRecord[];
  reviewLogs: ReviewLogRecord[];
}

export interface MergeReport {
  /** False for an append row whose uid already existed (already imported). */
  skipped: { attempts: number; history: number; reviewLogs: number };
}

/**
 * Test seam for fault injection at the real transaction boundary: the hook runs inside
 * the merge transaction, immediately before the indexed requests are issued. Throwing
 * (or letting the next request fail) must leave every store untouched.
 */
export interface StorageTestHooks {
  beforeMergeWrite?: (tx: IDBTransaction) => void;
  /**
   * Runs inside a lesson-progress transaction after every request is issued but before
   * IndexedDB commits it. Throwing aborts the commit: the requests themselves already
   * "succeeded", so this reproduces a failure at commit time (quota or disk full), not a
   * rejected API call. `kind` names the operation.
   */
  beforeCommit?: (kind: LessonWriteKind) => void;
}

export type LessonWriteKind = 'lesson' | 'attempt' | 'review';

const UID_RE = /^[\w.:@~-]{1,120}$/;

/** True for a uid this app could have produced (or accepted from a backup). */
export function isValidUid(v: unknown): v is string {
  return typeof v === 'string' && UID_RE.test(v);
}

/**
 * Mint a durable record identity. `crypto.randomUUID` exists in every browser we support
 * and in Node >= 19; the fallback keeps older test/CI runtimes working.
 */
export function createUid(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return `uid-${hex}`;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(wrapError(r.error));
  });
}

/** Auto-increment stores get fresh keys; incoming ids would collide with existing rows. */
function stripId<T extends { id?: number }>(record: T): Omit<T, 'id'> {
  const { id, ...rest } = record;
  void id;
  return rest;
}

export interface ImportData {
  profile?: StoredProfile;
  lessonStates: LessonStateRecord[];
  attempts: AttemptRecord[];
  mastery: MasteryRecord[];
  experiments: ExperimentRecord[];
  history: HistoryRecord[];
  reviews: ReviewRecord[];
  reviewLogs: ReviewLogRecord[];
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    // addEventListener, not on* properties: this promise is created before the caller's
    // error handler, and assigning `tx.onerror` would silently replace this one and leave
    // the promise pending forever (every failure would look like a hang).
    tx.addEventListener('complete', () => resolve(), { once: true });
    tx.addEventListener('error', () => reject(wrapError(tx.error)), { once: true });
    tx.addEventListener('abort', () => reject(wrapError(tx.error ?? new Error('Transaction aborted'))), { once: true });
  });
}

/**
 * Test-only: make `beforeCommit` fire at the point a transaction commits.
 *
 * The seam hangs off the LAST request queued on the transaction: inside its success
 * event every request has already succeeded, nothing else is pending, and IndexedDB is
 * about to commit. A throwing hook aborts that commit, reproducing "the call succeeded
 * but the disk refused the write" (quota / disk full) rather than an early API rejection.
 */
class CommitSeam {
  private last: IDBRequest | null = null;
  /** Mark `r` as the so-far last request; the hook is attached when the batch finishes. */
  mark(r: IDBRequest): void {
    this.last = r;
  }
  attach(hook: StorageTestHooks['beforeCommit'], kind: LessonWriteKind): void {
    const last = this.last;
    if (!hook || !last) return;
    last.onsuccess = () => hook(kind);
  }
}

export class IdbRepos implements Repos {
  testHooks: StorageTestHooks = {};

  private constructor(private db: IDBDatabase) {}

  static async open(opts: OpenOptions = {}): Promise<IdbRepos> {
    const db = await openDatabase(opts);
    return new IdbRepos(db);
  }

  close(): void {
    this.db.close();
  }

  /**
   * Run `fn` against one transaction and resolve only after it commits.
   *
   * `fn` receives a `CommitSeam`: write operations that opt into the test hook mark their
   * last request there, and the hook is attached once `fn` has queued everything.
   */
  private async tx<T>(
    names: StoreName[],
    mode: IDBTransactionMode,
    fn: (t: IDBTransaction, seam: CommitSeam) => Promise<T> | T,
    opts: { durability?: IDBTransactionDurability } = {},
  ): Promise<T> {
    let tx: IDBTransaction;
    try {
      // `durability: 'strict'` asks the browser to flush to disk before reporting success.
      // IndexedDB otherwise reports a committed transaction as soon as it reaches the OS,
      // which is enough for a reload but not for a crash or power loss. Lesson writes only.
      tx = opts.durability ? this.db.transaction(names, mode, { durability: opts.durability }) : this.db.transaction(names, mode);
    } catch (err) {
      throw new StorageUnavailableError('Local database connection was closed (perhaps another tab upgraded it). Refresh to reconnect.', err);
    }
    const completed = done(tx);
    try {
      const result = await fn(tx, new CommitSeam());
      await completed;
      return result;
    } catch (err) {
      try {
        tx.abort();
      } catch {
        /* already aborted */
      }
      await completed.catch(() => undefined);
      throw wrapError(err);
    }
  }

  private get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    return this.tx([store], 'readonly', (t) => req(t.objectStore(store).get(key)) as Promise<T | undefined>);
  }
  private put(store: StoreName, value: unknown): Promise<void> {
    return this.tx([store], 'readwrite', async (t) => {
      await req(t.objectStore(store).put(value));
    });
  }
  private all<T>(store: StoreName): Promise<T[]> {
    return this.tx([store], 'readonly', (t) => req(t.objectStore(store).getAll()) as Promise<T[]>);
  }
  private del(store: StoreName, key: IDBValidKey): Promise<void> {
    return this.tx([store], 'readwrite', async (t) => {
      await req(t.objectStore(store).delete(key));
    });
  }
  private clear(store: StoreName): Promise<void> {
    return this.tx([store], 'readwrite', async (t) => {
      await req(t.objectStore(store).clear());
    });
  }

  /** Clear and restore many stores in a single transaction (atomic import/reset). */
  async replaceAll(data: ImportData): Promise<void> {
    const stores: StoreName[] = [
      STORES.profile,
      STORES.lessonStates,
      STORES.attempts,
      STORES.mastery,
      STORES.experiments,
      STORES.history,
      STORES.review,
      STORES.reviewLog,
    ];
    await this.tx(stores, 'readwrite', (t) => {
      // All requests must be issued synchronously within the callback; awaiting between
      // requests would let the transaction auto-commit.
      for (const s of stores) t.objectStore(s).clear();
      if (data.profile) t.objectStore(STORES.profile).put(data.profile);
      for (const x of data.lessonStates) t.objectStore(STORES.lessonStates).put(x);
      for (const x of data.attempts) t.objectStore(STORES.attempts).add(stripId(x));
      for (const x of data.mastery) t.objectStore(STORES.mastery).put(x);
      for (const x of data.experiments) t.objectStore(STORES.experiments).put(x);
      for (const x of data.history) t.objectStore(STORES.history).add(stripId(x));
      for (const x of data.reviews) t.objectStore(STORES.review).put(x);
      for (const x of data.reviewLogs) t.objectStore(STORES.reviewLog).add(stripId(x));
    });
  }

  getProfile = () => this.get<StoredProfile>(STORES.profile, 'app');
  putProfile = (p: StoredProfile) => this.put(STORES.profile, p);
  getLessonState = (id: string) => this.get<LessonStateRecord>(STORES.lessonStates, id);
  putLessonState = (r: LessonStateRecord) => this.put(STORES.lessonStates, r);
  allLessonStates = () => this.all<LessonStateRecord>(STORES.lessonStates);
  deleteLessonState = (id: string) => this.del(STORES.lessonStates, id);

  /**
   * The whole effect of advancing a lesson (or finishing it) in one transaction:
   * progress row, completion history, concept reviews and mastery introduction.
   * Either all of it commits or none of it does.
   */
  commitLesson = (plan: LessonCommitPlan): Promise<void> =>
    this.tx(
      [STORES.lessonStates, STORES.history, STORES.review, STORES.mastery],
      'readwrite',
      (t, seam) => {
        seam.mark(t.objectStore(STORES.lessonStates).put(plan.state));
        for (const h of plan.history) seam.mark(t.objectStore(STORES.history).add(stripId(h)));
        for (const r of plan.reviews) seam.mark(t.objectStore(STORES.review).put(r));
        for (const m of plan.mastery) seam.mark(t.objectStore(STORES.mastery).put(m));
        seam.attach(this.testHooks.beforeCommit, 'lesson');
      },
      { durability: 'strict' },
    );

  addAttempt = (a: AttemptRecord) => this.tx([STORES.attempts], 'readwrite', (t) => req(t.objectStore(STORES.attempts).add(a)) as Promise<number>);
  /**
   * An attempt and the mastery record it changes, committed together. Recording one
   * without the other would count evidence the engine never sees (or the reverse).
   */
  commitAttempt = (attempt: AttemptRecord, mastery: MasteryRecord): Promise<number> =>
    this.tx(
      [STORES.attempts, STORES.mastery],
      'readwrite',
      (t, seam) => {
        const id = req(t.objectStore(STORES.attempts).add(attempt)) as Promise<number>;
        const put = t.objectStore(STORES.mastery).put(mastery);
        // The mastery put is the last request; the attempt's success only supplies the id.
        seam.mark(put);
        seam.attach(this.testHooks.beforeCommit, 'attempt');
        return id;
      },
      { durability: 'strict' },
    );
  allAttempts = () => this.all<AttemptRecord>(STORES.attempts);
  attemptsByConcept = (conceptId: string) =>
    this.tx([STORES.attempts], 'readonly', (t) => req(t.objectStore(STORES.attempts).index('conceptId').getAll(conceptId)) as Promise<AttemptRecord[]>);
  clearAttempts = () => this.clear(STORES.attempts);
  putMastery = (m: MasteryRecord) => this.put(STORES.mastery, m);
  getMastery = (id: string) => this.get<MasteryRecord>(STORES.mastery, id);
  allMastery = () => this.all<MasteryRecord>(STORES.mastery);
  clearMastery = () => this.clear(STORES.mastery);
  putExperiment = (e: ExperimentRecord) => this.put(STORES.experiments, e);
  getExperiment = (id: string) => this.get<ExperimentRecord>(STORES.experiments, id);
  allExperiments = () => this.all<ExperimentRecord>(STORES.experiments);
  deleteExperiment = (id: string) => this.del(STORES.experiments, id);
  clearExperiments = () => this.clear(STORES.experiments);
  addHistory = (h: HistoryRecord) => this.tx([STORES.history], 'readwrite', (t) => req(t.objectStore(STORES.history).add(h)) as Promise<number>);
  allHistory = () => this.all<HistoryRecord>(STORES.history);
  clearHistory = () => this.clear(STORES.history);
  putReview = (r: ReviewRecord) => this.put(STORES.review, r);
  getReview = (id: string) => this.get<ReviewRecord>(STORES.review, id);
  allReviews = () => this.all<ReviewRecord>(STORES.review);
  clearReviews = () => this.clear(STORES.review);
  addReviewLog = (r: ReviewLogRecord) => this.tx([STORES.reviewLog], 'readwrite', (t) => req(t.objectStore(STORES.reviewLog).add(r)) as Promise<number>);
  /** A review result: schedule, log, mastery and history move together or not at all. */
  commitReview = (plan: { review: ReviewRecord; log: ReviewLogRecord; mastery?: MasteryRecord; history: HistoryRecord }): Promise<void> =>
    this.tx(
      [STORES.review, STORES.reviewLog, STORES.mastery, STORES.history],
      'readwrite',
      (t, seam) => {
        seam.mark(t.objectStore(STORES.review).put(plan.review));
        seam.mark(t.objectStore(STORES.reviewLog).add(stripId(plan.log)));
        if (plan.mastery) seam.mark(t.objectStore(STORES.mastery).put(plan.mastery));
        seam.mark(t.objectStore(STORES.history).add(stripId(plan.history)));
        seam.attach(this.testHooks.beforeCommit, 'review');
      },
      { durability: 'strict' },
    );
  allReviewLogs = () => this.all<ReviewLogRecord>(STORES.reviewLog);
  clearReviewLogs = () => this.clear(STORES.reviewLog);
  getMeta = async (key: string): Promise<unknown> => (await this.get<MetaRecord>(STORES.meta, key))?.value;
  putMeta = (key: string, value: unknown) => this.put(STORES.meta, { key, value });

  /**
   * One read-write transaction for a whole merge import.
   *
   * The merge decision for keyed stores is precomputed (pure) from a snapshot, but the
   * rows the transaction has to *skip* are decided here, inside the transaction, by
   * looking up each append record's `uid`. Every request is issued synchronously from the
   * callback of the first lookups -- nothing is awaited between requests, so the
   * transaction cannot go inactive, and a single failed request aborts all of it.
   */
  async mergeAll(plan: MergePlan): Promise<MergeReport> {
    const stores: StoreName[] = [
      STORES.profile,
      STORES.lessonStates,
      STORES.attempts,
      STORES.mastery,
      STORES.experiments,
      STORES.history,
      STORES.review,
      STORES.reviewLog,
    ];
    return this.tx(stores, 'readwrite', (t) => {
      // Membership lookups grouped per store, in the same order as the rows.
      const groups = [
        { store: t.objectStore(STORES.attempts), rows: plan.attempts, key: 'attempts' as const },
        { store: t.objectStore(STORES.history), rows: plan.history, key: 'history' as const },
        { store: t.objectStore(STORES.reviewLog), rows: plan.reviewLogs, key: 'reviewLogs' as const },
      ].map((g) => ({ ...g, lookups: g.rows.map((row) => g.store.index('uid').getKey(row.uid)) }));
      const lookups = groups.flatMap((g) => g.lookups);

      return new Promise<MergeReport>((resolve, reject) => {
        const write = (): void => {
          try {
            this.testHooks.beforeMergeWrite?.(t);
            if (plan.profile) t.objectStore(STORES.profile).put(plan.profile);
            for (const x of plan.lessonStates) t.objectStore(STORES.lessonStates).put(x);
            for (const x of plan.mastery) t.objectStore(STORES.mastery).put(x);
            for (const x of plan.experiments) t.objectStore(STORES.experiments).put(x);
            for (const x of plan.reviews) t.objectStore(STORES.review).put(x);
            const skipped: MergeReport['skipped'] = { attempts: 0, history: 0, reviewLogs: 0 };
            for (const g of groups) {
              g.rows.forEach((row, i) => {
                if (g.lookups[i].result !== undefined) skipped[g.key]++;
                else g.store.add(stripId(row));
              });
            }
            // `add` (or any request) failures abort the transaction and reject via `done()`.
            resolve({ skipped });
          } catch (err) {
            t.abort();
            reject(err);
          }
        };
        if (lookups.length === 0) {
          write();
          return;
        }
        // Wait for every lookup to finish, then issue the writes from the last callback.
        // Attaching the writer to a single lookup would fire it while the others are still
        // pending; those requests cannot be answered while a pending getKey is blocking
        // them, the transaction goes inactive, and the import would never settle.
        let pending = lookups.length;
        for (const lookup of lookups) {
          lookup.onsuccess = () => {
            if (--pending === 0) write();
          };
        }
      });
    });
  }

  async clearAll(): Promise<void> {
    const stores: StoreName[] = [
      STORES.lessonStates,
      STORES.attempts,
      STORES.mastery,
      STORES.experiments,
      STORES.history,
      STORES.review,
      STORES.reviewLog,
      STORES.profile,
    ];
    await this.tx([...stores], 'readwrite', (t) => {
      for (const s of stores) t.objectStore(s).clear();
    });
  }
}

// ---------- Durable singleton ----------
let instancePromise: Promise<Repos> | null = null;
let overrideFactory: IDBFactory | null = null;

export function setStorageFactory(factory: IDBFactory | null): void {
  overrideFactory = factory;
  instancePromise = null;
}

export function getStorage(): Promise<Repos> {
  if (!instancePromise) {
    instancePromise = IdbRepos.open(overrideFactory ? { factory: overrideFactory } : {}).catch((err) => {
      instancePromise = null;
      throw err;
    });
  }
  return instancePromise;
}

/** Reset singleton (tests / after reset / after connection loss). */
export function resetStorage(): void {
  instancePromise?.then((r) => r.close()).catch(() => undefined);
  instancePromise = null;
}

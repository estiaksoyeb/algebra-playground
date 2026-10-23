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

export type LessonStateRecord = {
  lessonId: string;
  currentStep: number;
  answers: Record<string, string>;
  hintCounts: Record<string, number>;
  completed: boolean;
  completedAt?: string;
  updatedAt: string;
};

export type AttemptRecord = {
  id?: number;
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
  allLessonStates(): Promise<LessonStateRecord[]>;
  deleteLessonState(lessonId: string): Promise<void>;
  addAttempt(a: AttemptRecord): Promise<number>;
  allAttempts(): Promise<AttemptRecord[]>;
  attemptsByConcept(conceptId: string): Promise<AttemptRecord[]>;  clearAttempts(): Promise<void>;
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
  allReviewLogs(): Promise<ReviewLogRecord[]>;
  clearReviewLogs(): Promise<void>;
  getMeta(key: string): Promise<unknown>;
  putMeta(key: string, value: unknown): Promise<void>;
  replaceAll(data: ImportData): Promise<void>;
  appendAll(data: Pick<ImportData, 'attempts' | 'history' | 'reviewLogs'>): Promise<void>;
  clearAll(): Promise<void>;
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
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(wrapError(tx.error));
    tx.onabort = () => reject(wrapError(tx.error ?? new Error('Transaction aborted')));
  });
}

export class IdbRepos implements Repos {
  private constructor(private db: IDBDatabase) {}

  static async open(opts: OpenOptions = {}): Promise<IdbRepos> {
    const db = await openDatabase(opts);
    return new IdbRepos(db);
  }

  close(): void {
    this.db.close();
  }

  private async tx<T>(names: StoreName[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => Promise<T> | T): Promise<T> {
    let tx: IDBTransaction;
    try {
      tx = this.db.transaction(names, mode);
    } catch (err) {
      throw new StorageUnavailableError('Local database connection was closed (perhaps another tab upgraded it). Refresh to reconnect.', err);
    }
    const completed = done(tx);
    try {
      const result = await fn(tx);
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
  addAttempt = (a: AttemptRecord) => this.tx([STORES.attempts], 'readwrite', (t) => req(t.objectStore(STORES.attempts).add(a)) as Promise<number>);
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
  allReviewLogs = () => this.all<ReviewLogRecord>(STORES.reviewLog);
  clearReviewLogs = () => this.clear(STORES.reviewLog);
  getMeta = async (key: string): Promise<unknown> => (await this.get<MetaRecord>(STORES.meta, key))?.value;
  putMeta = (key: string, value: unknown) => this.put(STORES.meta, { key, value });

  /** Append many records, letting the database assign ids. */
  async appendAll(data: Pick<ImportData, 'attempts' | 'history' | 'reviewLogs'>): Promise<void> {
    await this.tx([STORES.attempts, STORES.history, STORES.reviewLog], 'readwrite', (t) => {
      for (const a of data.attempts) t.objectStore(STORES.attempts).add(stripId(a));
      for (const h of data.history) t.objectStore(STORES.history).add(stripId(h));
      for (const l of data.reviewLogs) t.objectStore(STORES.reviewLog).add(stripId(l));
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

/**
 * IndexedDB schema + low-level open/migrate. Kept separate from repositories so
 * migrations can be tested independently against fake-indexeddb.
 *
 * SCHEMA VERSION HISTORY
 * 1: initial: profile, lessons, attempts, mastery, experiments, history, review, meta
 * 2: add lessonStates store (resumable per-lesson progress) and index on attempts.topic
 * 3: add reviewLog store
 * 4: add unique `uid` index to attempts, history, reviewLog (stable import identity);
 *    backfill a uid on existing rows so no historical data is lost or left unidentifiable
 */
export const DB_NAME = 'algebra-playground';
export const DB_VERSION = 4;

export const STORES = {
  /** kv: single document app profile / preferences (id = 'app') */
  profile: 'profile',
  /** per-lesson state keyed by lessonId: { lessonId, currentStep, answers, completedAt, ... } */
  lessonStates: 'lessonStates',
  /** individual exercise attempts keyed by auto id, indexed by conceptId */
  attempts: 'attempts',
  /** concept mastery keyed by conceptId */
  mastery: 'mastery',
  /** saved playground experiments keyed by id */
  experiments: 'experiments',
  /** chronological learning history events keyed by auto id */
  history: 'history',
  /** spaced-review scheduling keyed by conceptId */
  review: 'review',
  /** append-only review activation log */
  reviewLog: 'reviewLog',
  /** schema/content version metadata */
  meta: 'meta',
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

export class StorageUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

export class StorageQuotaError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'StorageQuotaError';
  }
}

export type Migration = (db: IDBDatabase, tx: IDBTransaction) => void;

/** Migration steps: index i runs when upgrading from version i to i+1. */
export const MIGRATIONS: Record<number, Migration> = {
  1: (db) => {
    db.createObjectStore(STORES.profile, { keyPath: 'id' });
    db.createObjectStore(STORES.attempts, { keyPath: 'id', autoIncrement: true }).createIndex('conceptId', 'conceptId');
    const mastery = db.createObjectStore(STORES.mastery, { keyPath: 'conceptId' });
    mastery.createIndex('state', 'state');
    db.createObjectStore(STORES.experiments, { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
    db.createObjectStore(STORES.history, { keyPath: 'id', autoIncrement: true }).createIndex('at', 'at');
    db.createObjectStore(STORES.review, { keyPath: 'conceptId' }).createIndex('dueAt', 'dueAt');
    db.createObjectStore(STORES.meta, { keyPath: 'key' });
  },
  2: (db, tx) => {
    const lessonStates = db.createObjectStore(STORES.lessonStates, { keyPath: 'lessonId' });
    lessonStates.createIndex('updatedAt', 'updatedAt');
    const attempts = tx.objectStore(STORES.attempts);
    if (!attempts.indexNames.contains('lessonId')) attempts.createIndex('lessonId', 'lessonId');
  },
  3: (db) => {
    db.createObjectStore(STORES.reviewLog, { keyPath: 'id', autoIncrement: true }).createIndex('conceptId', 'conceptId');
  },
  4: (_db, tx) => {
    // Append-only stores gain a unique logical identity. Existing rows are backfilled by
    // `backfillUids` (below, from `repairSchema`), so a later export carries a uid and a
    // re-import of that export cannot duplicate them.
    for (const store of [STORES.attempts, STORES.history, STORES.reviewLog]) ensureUidIndex(tx.objectStore(store));
  },
};

/**
 * Create the unique `uid` index. Row backfill happens separately in `backfillUids`.
 *
 * The two are split because the index must exist before the upgrade transaction commits
 * (a `createIndex` issued from a request callback is unreliable across IndexedDB
 * implementations), while the backfill needs a read request to know which rows are old.
 */
function ensureUidIndex(store: IDBObjectStore): void {
  if (!store.indexNames.contains('uid')) store.createIndex('uid', 'uid', { unique: true });
}

/** Give every pre-existing append-only row a uid. Must run inside the upgrade transaction. */
function backfillUids(tx: IDBTransaction): void {
  for (const name of [STORES.attempts, STORES.history, STORES.reviewLog]) {
    const store = tx.objectStore(name);
    if (store.keyPath !== 'id') continue;
    const rowsReq = store.getAll();
    rowsReq.onsuccess = () => {
      for (const row of rowsReq.result as Record<string, unknown>[]) {
        if (typeof row.uid === 'string' && row.uid !== '') continue;
        // These stores use in-line keys: the key must travel inside the value only (passing
        // it as the second argument is a DataError), and `row.id` is present in the
        // returned records because it is part of the stored value. The primary key is
        // already unique within the store, so `migrated:<id>` is too.
        store.put({ ...row, uid: `migrated:${String(row.id)}` });
      }
    };
  }
}

/** Ensure every expected store/index exists even if a migration was interrupted (defensive repair). */
function repairSchema(db: IDBDatabase, tx: IDBTransaction): void {
  const names = Array.from(db.objectStoreNames);
  const need = (name: string, keyPath: string, autoIncrement = false): IDBObjectStore | null => {
    if (names.includes(name)) return tx.objectStore(name);
    return db.createObjectStore(name, { keyPath, autoIncrement });
  };
  // Indexes on a store that already exists must be created through the upgrade
  // transaction; the store handle returned above is that same live store.
  const ensureIndex = (store: IDBObjectStore | null, name: string, keyPath: string, opts?: IDBIndexParameters): void => {
    if (store && !store.indexNames.contains(name)) store.createIndex(name, keyPath, opts);
  };
  need(STORES.profile, 'id');
  const attempts = need(STORES.attempts, 'id', true);
  ensureIndex(attempts, 'conceptId', 'conceptId');
  const mastery = need(STORES.mastery, 'conceptId');
  ensureIndex(mastery, 'state', 'state');
  const experiments = need(STORES.experiments, 'id');
  ensureIndex(experiments, 'updatedAt', 'updatedAt');
  const history = need(STORES.history, 'id', true);
  ensureIndex(history, 'at', 'at');
  const review = need(STORES.review, 'conceptId');
  ensureIndex(review, 'dueAt', 'dueAt');
  need(STORES.meta, 'key');
  const lessonStates = need(STORES.lessonStates, 'lessonId');
  ensureIndex(lessonStates, 'updatedAt', 'updatedAt');
  ensureIndex(attempts, 'lessonId', 'lessonId');
  const reviewLog = need(STORES.reviewLog, 'id', true);
  ensureIndex(reviewLog, 'conceptId', 'conceptId');
  for (const store of [attempts, history, reviewLog]) if (store) ensureUidIndex(store);
  backfillUids(tx);
}

export interface OpenOptions {
  factory?: IDBFactory;
  name?: string;
  version?: number;
  /** Called before a destructive upgrade (not used by this app: upgrades are additive). */
  onBlocked?: () => void;
}

export function openDatabase(opts: OpenOptions = {}): Promise<IDBDatabase> {
  const factory = opts.factory ?? (typeof indexedDB !== 'undefined' ? indexedDB : undefined);
  if (!factory) {
    return Promise.reject(new StorageUnavailableError('This browser does not provide IndexedDB, so progress cannot be saved.'));
  }
  const name = opts.name ?? DB_NAME;
  const version = opts.version ?? DB_VERSION;
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = factory.open(name, version);
    } catch (err) {
      reject(new StorageUnavailableError('IndexedDB could not be opened. Private browsing may block storage.', err));
      return;
    }
    let blockedTimer: ReturnType<typeof setTimeout> | undefined;
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction!;
      const from = event.oldVersion;
      try {
        for (let v = from + 1; v <= version; v++) {
          const mig = MIGRATIONS[v];
          if (mig) mig(db, tx);
        }
        repairSchema(db, tx);
        tx.objectStore(STORES.meta).put({ key: 'schemaVersion', value: version, upgradedAt: new Date().toISOString() });
      } catch (err) {
        tx.abort();
        reject(new StorageUnavailableError('Database upgrade failed; existing data was left untouched.', err));
      }
    };
    req.onblocked = () => {
      opts.onBlocked?.();
      blockedTimer = setTimeout(() => {
        reject(new StorageUnavailableError('Another tab is using an older version of the app. Close other tabs and refresh.'));
      }, 4000);
    };
    req.onerror = () => {
      const err = req.error;
      if (err?.name === 'QuotaExceededError') reject(new StorageQuotaError('Browser storage is full.', err));
      else reject(new StorageUnavailableError(err?.message ?? 'Could not open local storage.', err));
    };
    req.onsuccess = () => {
      if (blockedTimer) clearTimeout(blockedTimer);
      const db = req.result;
      // Another tab requests an upgrade: close so it can proceed.
      db.onversionchange = () => db.close();
      db.onclose = () => resolve(db); // db closes are handled by callers via getDatabase retry
      resolve(db);
    };
  });
}

export function isQuotaError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'QuotaExceededError' || /quota/i.test(err.message));
}

export function wrapError(err: unknown): Error {
  if (isQuotaError(err)) return new StorageQuotaError('Browser storage is full. Export a backup, then free space.', err);
  if (err instanceof StorageUnavailableError || err instanceof StorageQuotaError) return err;
  return new StorageUnavailableError(err instanceof Error ? err.message : 'Storage error', err);
}

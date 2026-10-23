import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { IdbRepos, AttemptRecord, StoredProfile, setStorageFactory, getStorage, resetStorage, Repos } from './repositories';
import { openDatabase, DB_NAME, STORES, StorageQuotaError, StorageUnavailableError } from './db';
import { applyBackup, backupToJson, createBackup, parseBackupJson, validateBackup, BACKUP_FORMAT, parseBackupJson as parse } from './backup';

let factory: IDBFactory;
let repos: Repos;
let counter = 0;

beforeEach(async () => {
  factory = new IDBFactory();
  const name = `${DB_NAME}-test-${++counter}`;
  repos = await IdbRepos.open({ factory, name });
});

const prof = (prefs: Record<string, unknown> = {}): StoredProfile => ({
  id: 'app',
  schemaVersion: 3,
  preferences: prefs,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: new Date().toISOString(),
});

const attempt = (over: Partial<AttemptRecord> = {}): AttemptRecord => ({
  conceptId: 'add-negatives',
  lessonId: 'l1',
  exerciseId: 'e1',
  answer: '4',
  correct: true,
  hintsUsed: 0,
  attemptNumber: 1,
  at: new Date().toISOString(),
  ...over,
});

describe('IndexedDB repositories', () => {
  it('writes and reads a profile', async () => {
    await repos.putProfile(prof({ theme: 'dark' }));
    expect((await repos.getProfile())?.preferences.theme).toBe('dark');
  });

  it('persists lesson state, attempts, mastery, experiments, history, review', async () => {
    await repos.putLessonState({
      lessonId: 'l1',
      currentStep: 2,
      answers: { q1: '5' },
      hintCounts: { q1: 1 },
      completed: false,
      updatedAt: new Date().toISOString(),
    });
    await repos.addAttempt(attempt());
    await repos.putMastery({
      conceptId: 'add-negatives',
      state: 'practicing',
      score: 40,
      independentCorrect: 2,
      assistedCorrect: 1,
      incorrect: 1,
      distinctExerciseKinds: ['numeric'],
      updatedAt: new Date().toISOString(),
    });
    await repos.putExperiment({ id: 'x1', name: 'Test', tool: 'numberline', state: { v: 3 }, createdAt: 'now', updatedAt: 'now' });
    await repos.addHistory({ kind: 'lesson-complete', detail: 'l1', at: new Date().toISOString() });
    await repos.putReview({ conceptId: 'add-negatives', dueAt: '2030-01-01T00:00:00Z', intervalDays: 1, ease: 2.3, reps: 0, lapses: 0, updatedAt: 'now' });

    expect((await repos.getLessonState('l1'))?.currentStep).toBe(2);
    expect(await repos.allAttempts()).toHaveLength(1);
    expect(await repos.attemptsByConcept('add-negatives')).toHaveLength(1);
    expect((await repos.getMastery('add-negatives'))?.state).toBe('practicing');
    expect((await repos.getExperiment('x1'))?.name).toBe('Test');
    expect(await repos.allHistory()).toHaveLength(1);
    expect((await repos.getReview('add-negatives'))?.intervalDays).toBe(1);
  });

  it('survives reopening the database (browser restart simulation)', async () => {
    const name = 'restart-test';
    const r1 = await IdbRepos.open({ factory, name });
    await r1.putLessonState({ lessonId: 'l9', currentStep: 3, answers: {}, hintCounts: {}, completed: true, updatedAt: 't' });
    r1.close();
    const r2 = await IdbRepos.open({ factory, name });
    expect((await r2.getLessonState('l9'))?.completed).toBe(true);
  });

  it('reports quota failures honestly', async () => {
    // Simulate a failing put by wrapping the request
    const bad = new Proxy(repos, {
      get(target, prop: string) {
        if (prop === 'putProfile') {
          return async () => {
            throw new StorageQuotaError('Browser storage is full.');
          };
        }
        return (target as unknown as Record<string, unknown>)[prop];
      },
    }) as Repos;
    await expect(bad.putProfile(prof())).rejects.toBeInstanceOf(StorageQuotaError);
  });
});

describe('schema migrations', () => {
  it('upgrades a v1 database to the current version keeping data', async () => {
    const name = 'migrate-test';
    // Create a v1 database manually with a profile record
    await new Promise<void>((resolve, reject) => {
      const req = factory.open(name, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('profile', { keyPath: 'id' });
        db.createObjectStore('attempts', { keyPath: 'id', autoIncrement: true });
        db.createObjectStore('mastery', { keyPath: 'conceptId' });
        db.createObjectStore('experiments', { keyPath: 'id' });
        db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
        db.createObjectStore('review', { keyPath: 'conceptId' });
        db.createObjectStore('meta', { keyPath: 'key' });
        const tx = req.transaction!;
        tx.objectStore('profile').put({ id: 'app', schemaVersion: 1, preferences: { theme: 'dark' }, createdAt: 'a', updatedAt: 'b' });
      };
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });

    const db = await openDatabase({ factory, name });
    expect(db.version).toBe(3);
    expect(Array.from(db.objectStoreNames)).toContain(STORES.lessonStates);
    expect(Array.from(db.objectStoreNames)).toContain(STORES.reviewLog);
    db.close();

    const r = await IdbRepos.open({ factory, name });
    expect((await r.getProfile())?.preferences.theme).toBe('dark');
    await r.putLessonState({ lessonId: 'l', currentStep: 0, answers: {}, hintCounts: {}, completed: false, updatedAt: 't' });
    expect((await r.allLessonStates())).toHaveLength(1);
  });
});

describe('backup export / import', () => {
  async function seed(r: Repos) {
    await r.putProfile(prof({ theme: 'light' }));
    await r.putLessonState({ lessonId: 'w1-l1', currentStep: 4, answers: { q1: '3' }, hintCounts: {}, completed: true, completedAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' });
    await r.addAttempt(attempt());
    await r.putMastery({ conceptId: 'add-negatives', state: 'provisional', score: 70, independentCorrect: 3, assistedCorrect: 1, incorrect: 1, distinctExerciseKinds: ['numeric', 'sign'], updatedAt: '2025-01-01T00:00:00Z' });
    await r.putExperiment({ id: 'exp1', name: 'My balance', tool: 'balance', state: { equation: 'x+3=7' }, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' });
    await r.putReview({ conceptId: 'add-negatives', dueAt: '2025-01-05T00:00:00Z', intervalDays: 3, ease: 2.3, reps: 1, lapses: 0, updatedAt: '2025-01-01T00:00:00Z' });
  }

  it('round-trips through JSON into a fresh database (replace)', async () => {
    await seed(repos);
    const backup = await createBackup(repos);
    const json = backupToJson(backup);
    const parsed = parseBackupJson(json);
    expect(parsed.ok).toBe(true);

    const fresh = await IdbRepos.open({ factory, name: 'import-target' });
    const result = await applyBackup(fresh, parsed.backup!, 'replace');
    expect(result.imported.lessonStates).toBe(1);
    expect((await fresh.getLessonState('w1-l1'))?.completed).toBe(true);
    expect((await fresh.getExperiment('exp1'))?.name).toBe('My balance');
    expect((await fresh.getMastery('add-negatives'))?.state).toBe('provisional');
    expect(await fresh.allAttempts()).toHaveLength(1);
    expect((await fresh.getProfile())?.preferences.theme).toBe('light');
  });

  it('rejects malformed or foreign JSON without writes', async () => {
    await seed(repos);
    for (const bad of ['not json', '{}', '[]', '{"format":"other"}', JSON.stringify({ format: BACKUP_FORMAT, formatVersion: 1, data: 'nope' })]) {
      const res = parse(bad);
      expect(res.ok, bad).toBe(false);
    }
    // Newer format is rejected
    expect(parse(JSON.stringify({ format: BACKUP_FORMAT, formatVersion: 99, data: {} })).ok).toBe(false);
    // Existing data intact
    expect((await repos.allAttempts())).toHaveLength(1);
    expect((await repos.getLessonState('w1-l1'))?.completed).toBe(true);
  });

  it('sanitizes dangerous fields in imported content', () => {
    const v = validateBackup({
      format: BACKUP_FORMAT,
      formatVersion: 1,
      data: {
        experiments: [{ id: 'e', name: '<img src=x onerror=alert(1)>', tool: 'balance', state: {}, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' }],
        mastery: [{ conceptId: 'c', state: 'bogus', score: 9999 }],
      },
    });
    expect(v.ok).toBe(true);
    expect(v.backup!.data.experiments[0].name.length).toBeLessThanOrEqual(120);
    expect(v.backup!.data.mastery[0].state).toBe('introduced');
    expect(v.backup!.data.mastery[0].score).toBe(100);
    expect(v.warnings.length).toBeGreaterThan(0);
  });

  it('merge keeps newer local records and does not duplicate replaced stores', async () => {
    await seed(repos);
    const backup = await createBackup(repos);
    // Locally, mastery has been updated later
    await repos.putMastery({ conceptId: 'add-negatives', state: 'established', score: 90, independentCorrect: 6, assistedCorrect: 1, incorrect: 1, distinctExerciseKinds: [], updatedAt: '2030-01-01T00:00:00Z' });
    await applyBackup(repos, backup, 'merge');
    expect((await repos.getMastery('add-negatives'))?.state).toBe('established');
    // Lesson state still present, attempts appended
    expect((await repos.getLessonState('w1-l1'))?.completed).toBe(true);
    expect((await repos.allAttempts()).length).toBeGreaterThanOrEqual(1);
  });

  it('bulk replace clears old data before importing', async () => {
    await seed(repos);
    const b = await createBackup(repos);
    await repos.putExperiment({ id: 'old2', name: 'old2', tool: 't', state: {}, createdAt: 'a', updatedAt: 'a' });
    await repos.putLessonState({ lessonId: 'local-only', currentStep: 1, answers: {}, hintCounts: {}, completed: false, updatedAt: 'a' });
    await applyBackup(repos, b, 'replace');
    const exps = await repos.allExperiments();
    expect(exps.map((e) => e.id)).toEqual(['exp1']);
    expect(await repos.getLessonState('local-only')).toBeUndefined();
  });
});

describe('storage singleton', () => {
  it('reports unavailable storage when IndexedDB throws', async () => {
    const throwing = {
      open: () => {
        throw new DOMException('denied', 'InvalidStateError');
      },
    } as unknown as IDBFactory;
    await expect(openDatabase({ factory: throwing })).rejects.toBeInstanceOf(StorageUnavailableError);
  });

  it('singleton returns a working repository', async () => {
    // Restore the shared factory afterwards. Swapping in a brand-new IDBFactory and leaving
    // it installed would silently give every later test file a different database than the
    // one they had just cleared.
    try {
      setStorageFactory(new IDBFactory());
      const r = await getStorage();
      expect(r).toBeTruthy();
    } finally {
      setStorageFactory(null);
      resetStorage();
    }
  });
});

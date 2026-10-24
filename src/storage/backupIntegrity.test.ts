/**
 * Remediation batch 1 — backup integrity.
 *
 * Regression tests for the two audit defects:
 *   A. re-importing the same backup must not duplicate attempts / history / review logs;
 *   B. a merge must commit everything or nothing.
 *
 * Fault injection uses the real storage seam (`IdbRepos.testHooks`), so the failure
 * happens inside the actual IndexedDB transaction, not in a mocked repository.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { IdbRepos, AttemptRecord, HistoryRecord, Repos, StoredProfile } from './repositories';
import { DB_NAME, MIGRATIONS, openDatabase, STORES } from './db';
import { applyBackup, backupToJson, createBackup, parseBackupJson, Backup, BACKUP_FORMAT, legacyUid } from './backup';

let factory: IDBFactory;
let seq = 0;
let name = '';

beforeEach(() => {
  factory = new IDBFactory();
  name = `${DB_NAME}-integrity-${++seq}`;
});

async function freshRepo(n = name): Promise<IdbRepos> {
  return IdbRepos.open({ factory, name: n });
}

const at = (min: number) => new Date(Date.UTC(2025, 0, 1, 0, min)).toISOString();

const attempt = (over: Partial<AttemptRecord> = {}): AttemptRecord => ({
  uid: `att-${++seq}`,
  conceptId: 'add-negatives',
  lessonId: 'l1',
  exerciseId: 'e1',
  answer: '4',
  correct: true,
  hintsUsed: 0,
  attemptNumber: 1,
  at: at(1),
  ...over,
});

const history = (over: Partial<HistoryRecord> = {}): HistoryRecord => ({
  uid: `hist-${++seq}`,
  kind: 'lesson-complete',
  lessonId: 'l1',
  detail: 'lesson done',
  at: at(2),
  ...over,
});

const profile = (over: Partial<StoredProfile> = {}): StoredProfile => ({
  id: 'app',
  schemaVersion: 4,
  preferences: { theme: 'light' },
  createdAt: at(0),
  updatedAt: at(0),
  ...over,
});

async function emptyBackup(over: Partial<Backup['data']> = {}): Promise<Backup> {
  const r = await freshRepo();
  const b = await createBackup(r);
  r.close();
  return { ...b, data: { ...b.data, ...over } };
}

/** The state that matters for "importing twice == importing once". */
async function snapshot(r: Repos) {
  const [lessons, attempts, mastery, experiments, hist, reviews, logs, prof] = await Promise.all([
    r.allLessonStates(),
    r.allAttempts(),
    r.allMastery(),
    r.allExperiments(),
    r.allHistory(),
    r.allReviews(),
    r.allReviewLogs(),
    r.getProfile(),
  ]);
  return { lessons, attempts, mastery, experiments, reviews, logs, prof, hist };
}

const withoutIds = <T extends { id?: number }>(rows: T[]) => rows.map(({ id: _id, ...rest }) => rest);

describe('A. merge import is idempotent', () => {
  it('merging the same backup twice does not duplicate attempts, history or review logs', async () => {
    const source = await freshRepo();
    await source.putProfile(profile());
    await source.addAttempt(attempt({ uid: 'a1', answer: '3' }));
    await source.addAttempt(attempt({ uid: 'a2', answer: '5', correct: false, at: at(2) }));
    await source.addHistory(history({ uid: 'h1' }));
    await source.addHistory(history({ uid: 'h2', kind: 'review', conceptId: 'add-negatives', detail: 'reviewed', at: at(3) }));
    await source.addReviewLog({ uid: 'r1', conceptId: 'add-negatives', at: at(4), result: 'correct', assisted: false });
    const backup = parseBackupJson(backupToJson(await createBackup(source))).backup!;
    source.close();

    const target = await freshRepo('idempotent-target');
    await applyBackup(target, backup, 'merge');
    const once = await snapshot(target);
    await applyBackup(target, backup, 'merge');
    const twice = await snapshot(target);
    await applyBackup(target, backup, 'merge');
    const thrice = await snapshot(target);

    // Two source attempts, two source history rows, one review log — imported exactly once.
    expect(withoutIds(once.attempts).map((a) => a.uid).sort()).toEqual(['a1', 'a2']);
    expect(withoutIds(twice.attempts)).toEqual(withoutIds(once.attempts));
    expect(withoutIds(thrice.attempts)).toEqual(withoutIds(once.attempts));
    // History additionally gets one 'import' audit row per import; the imported rows don't repeat.
    expect(twice.hist.filter((h) => h.uid === 'h1')).toHaveLength(1);
    expect(twice.hist.filter((h) => h.uid === 'h2')).toHaveLength(1);
    expect(thrice.hist.filter((h) => h.uid === 'h1')).toHaveLength(1);
    expect(thrice.logs).toHaveLength(1);
    expect(twice.lessons).toEqual(once.lessons);
    expect(twice.mastery).toEqual(once.mastery);
    expect(twice.reviews).toEqual(once.reviews);
  });

  it('reports honestly how many records were actually applied', async () => {
    const backup = await emptyBackup({ attempts: [attempt({ uid: 'x1' }), attempt({ uid: 'x2' })] });
    const target = await freshRepo();
    const first = await applyBackup(target, backup, 'merge');
    expect(first.applied.attempts).toBe(2);
    expect(first.applied.skipped).toBe(0);
    const second = await applyBackup(target, backup, 'merge');
    expect(second.applied.attempts).toBe(0);
    expect(second.applied.skipped).toBe(2);
    expect(second.warnings.join(' ')).toMatch(/already on this device/);
    // The audit row is the only new history entry, and it is not deduplicated.
    expect((await target.allHistory()).filter((h) => h.kind === 'import')).toHaveLength(2);
  });

  it('merges into a non-empty database with overlapping and distinct records', async () => {
    const local = await freshRepo('overlap-target');
    await local.putProfile(profile({ updatedAt: at(10), preferences: { theme: 'dark' } }));
    await local.addAttempt(attempt({ uid: 'shared-att', answer: '9' }));
    await local.addHistory(history({ uid: 'shared-hist', detail: 'local' }));
    await local.addReviewLog({ uid: 'shared-log', conceptId: 'x', at: at(5), result: 'incorrect', assisted: true });
    await local.putLessonState({ lessonId: 'l1', currentStep: 4, answers: {}, hintCounts: {}, completed: true, updatedAt: at(20) });
    await local.putMastery({ conceptId: 'add-negatives', state: 'established', score: 90, independentCorrect: 5, assistedCorrect: 0, incorrect: 1, distinctExerciseKinds: [], updatedAt: at(20) });

    const backup = await emptyBackup({
      profile: profile({ updatedAt: at(1), preferences: { theme: 'light' } }),
      lessonStates: [{ lessonId: 'l1', currentStep: 1, answers: {}, hintCounts: {}, completed: false, updatedAt: at(1) }],
      mastery: [{ conceptId: 'add-negatives', state: 'practicing', score: 20, independentCorrect: 1, assistedCorrect: 0, incorrect: 0, distinctExerciseKinds: [], updatedAt: at(1) }],
      attempts: [attempt({ uid: 'shared-att', answer: '9' }), attempt({ uid: 'new-att', answer: '7' })],
      history: [history({ uid: 'shared-hist', detail: 'from backup' }), history({ uid: 'new-hist' })],
      reviewLogs: [{ uid: 'shared-log', conceptId: 'x', at: at(5), result: 'incorrect', assisted: true }],
    });
    await applyBackup(local, backup, 'merge');
    await applyBackup(local, backup, 'merge');

    const uids = (await local.allAttempts()).map((a) => a.uid).sort();
    expect(uids).toEqual(['new-att', 'shared-att']);
    expect((await local.allHistory()).filter((h) => h.uid === 'shared-hist')).toHaveLength(1);
    expect((await local.allHistory()).filter((h) => h.uid === 'new-hist')).toHaveLength(1);
    expect(await local.allReviewLogs()).toHaveLength(1);
    // Keyed stores keep the documented rule: the newer local record survives.
    expect((await local.getProfile())?.preferences.theme).toBe('dark');
    expect((await local.getLessonState('l1'))?.currentStep).toBe(4);
    expect((await local.getMastery('add-negatives'))?.state).toBe('established');
  });

  it('keeps two legitimate distinct attempts that share an answer and timestamp', async () => {
    const sameTime = at(7);
    const backup = await emptyBackup({
      attempts: [
        attempt({ uid: 'distinct-1', answer: '3', at: sameTime, exerciseId: 'e1' }),
        attempt({ uid: 'distinct-2', answer: '3', at: sameTime, exerciseId: 'e2' }),
      ],
    });
    const target = await freshRepo();
    await applyBackup(target, backup, 'merge');
    await applyBackup(target, backup, 'merge');
    const rows = await target.allAttempts();
    expect(rows.map((r) => r.uid).sort()).toEqual(['distinct-1', 'distinct-2']);
  });

  it('survives export → import → export → import without duplication', async () => {
    const a = await freshRepo('roundtrip-a');
    await a.addAttempt(attempt({ answer: '2' }));
    await a.addAttempt(attempt({ answer: '2', at: at(3), attemptNumber: 2 }));
    await a.addHistory(history());
    await a.addReviewLog({ uid: 'log-1', conceptId: 'add-negatives', at: at(4), result: 'correct', assisted: false });

    const b = await freshRepo('roundtrip-b');
    const firstJson = backupToJson(await createBackup(a));
    await applyBackup(b, parseBackupJson(firstJson).backup!, 'merge');
    const secondJson = backupToJson(await createBackup(b));
    const countAfterOne = (await b.allAttempts()).length;

    const c = await freshRepo('roundtrip-c');
    await applyBackup(c, parseBackupJson(secondJson).backup!, 'merge');
    await applyBackup(c, parseBackupJson(firstJson).backup!, 'merge');

    expect(countAfterOne).toBe(2);
    expect((await c.allAttempts())).toHaveLength(2);
    expect((await c.allHistory()).filter((h) => h.kind === 'lesson-complete')).toHaveLength(1);
    expect((await c.allReviewLogs())).toHaveLength(1);
    // The uid survives the round trip unchanged.
    const exported = JSON.parse(secondJson);
    expect(exported.data.attempts.every((x: { uid?: string }) => typeof x.uid === 'string')).toBe(true);
  });

  it('handles a legacy backup without uids: identical re-imports dedupe, identical rows within one file stay distinct', async () => {
    const legacy = {
      format: BACKUP_FORMAT,
      formatVersion: 1,
      exportedAt: at(0),
      app: { schemaVersion: 3, contentVersion: 1 },
      data: {
        attempts: [
          { conceptId: 'c', lessonId: 'l', exerciseId: 'e', answer: '1', correct: true, hintsUsed: 0, attemptNumber: 1, at: at(1) },
          { conceptId: 'c', lessonId: 'l', exerciseId: 'e', answer: '1', correct: true, hintsUsed: 0, attemptNumber: 1, at: at(1) },
        ],
        history: [{ kind: 'lesson-complete', lessonId: 'l', detail: 'done', at: at(2) }],
        reviewLogs: [{ conceptId: 'c', at: at(3), result: 'correct', assisted: false }],
      },
    };
    const parsed = parseBackupJson(JSON.stringify(legacy));
    expect(parsed.ok).toBe(true);
    const uids = parsed.backup!.data.attempts.map((x) => x.uid);
    expect(new Set(uids).size).toBe(2);
    // Deterministic: parsing the same file again yields the same identities.
    expect(parseBackupJson(JSON.stringify(legacy)).backup!.data.attempts.map((x) => x.uid)).toEqual(uids);
    expect(uids[0]).toBe(legacyUid('attempt', ['c', 'l', 'e', '1', true, 0, 1, null, at(1)], 0));

    const target = await freshRepo();
    await applyBackup(target, parsed.backup!, 'merge');
    await applyBackup(target, parsed.backup!, 'merge');
    expect(await target.allAttempts()).toHaveLength(2);
    expect((await target.allHistory()).filter((h) => h.kind === 'lesson-complete')).toHaveLength(1);
    expect(await target.allReviewLogs()).toHaveLength(1);
  });

  it('keeps duplicate uids inside one file instead of dropping a record', () => {
    const parsed = parseBackupJson(
      JSON.stringify({
        format: BACKUP_FORMAT,
        formatVersion: 1,
        data: {
          attempts: [
            { uid: 'dup', conceptId: 'c', lessonId: 'l', exerciseId: 'e', answer: '1', correct: true, hintsUsed: 0, attemptNumber: 1, at: at(1) },
            { uid: 'dup', conceptId: 'c', lessonId: 'l', exerciseId: 'e', answer: '2', correct: false, hintsUsed: 0, attemptNumber: 2, at: at(2) },
          ],
        },
      }),
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.backup!.data.attempts.map((a) => a.uid)).toEqual(['dup', 'dup~1']);
    expect(parsed.warnings.join(' ')).toMatch(/repeated/);
  });

  it('keeps attempt numbering and progress statistics stable across repeated imports', async () => {
    const source = await freshRepo('stats-source');
    await source.putLessonState({ lessonId: 'l1', currentStep: 3, answers: { q1: '1' }, hintCounts: {}, completed: true, completedAt: at(5), updatedAt: at(5) });
    await source.addAttempt(attempt({ uid: 's1', answer: '1' }));
    await source.addAttempt(attempt({ uid: 's2', answer: '2', correct: false, at: at(2) }));
    await source.addAttempt(attempt({ uid: 's3', answer: '3', hintsUsed: 1, at: at(3) }));
    await source.putMastery({ conceptId: 'add-negatives', state: 'practicing', score: 50, independentCorrect: 2, assistedCorrect: 1, incorrect: 1, distinctExerciseKinds: ['numeric'], updatedAt: at(3) });
    const backup = parseBackupJson(backupToJson(await createBackup(source))).backup!;

    const target = await freshRepo('stats-target');
    const measure = async () => {
      const attempts = await target.allAttempts();
      return {
        attempts: attempts.length,
        answered: attempts.length,
        correct: attempts.filter((a) => a.correct).length,
        independent: attempts.filter((a) => a.correct && a.hintsUsed === 0).length,
        perExercise: attempts.filter((a) => a.exerciseId === 'e1').length,
        completedLessons: (await target.allLessonStates()).filter((l) => l.completed).length,
      };
    };
    await applyBackup(target, backup, 'merge');
    const once = await measure();
    await applyBackup(target, backup, 'merge');
    await applyBackup(target, backup, 'merge');
    expect(await measure()).toEqual(once);
    expect(once).toMatchObject({ attempts: 3, correct: 2, independent: 1, perExercise: 3, completedLessons: 1 });
  });
});

describe('B. merge import is atomic', () => {
  /** Local data that must be left byte-for-byte untouched by a failed merge. */
  async function seedLocal(r: Repos) {
    await r.putProfile(profile({ updatedAt: at(50), preferences: { theme: 'dark' } }));
    await r.putLessonState({ lessonId: 'local', currentStep: 2, answers: {}, hintCounts: {}, completed: false, updatedAt: at(50) });
    await r.addAttempt(attempt({ uid: 'local-att' }));
    await r.putMastery({ conceptId: 'add-negatives', state: 'practicing', score: 30, independentCorrect: 1, assistedCorrect: 0, incorrect: 0, distinctExerciseKinds: [], updatedAt: at(50) });
    await r.putReview({ conceptId: 'add-negatives', dueAt: at(60), intervalDays: 1, ease: 2.3, reps: 0, lapses: 0, updatedAt: at(50) });
    await r.addHistory(history({ uid: 'local-hist' }));
    await r.addReviewLog({ uid: 'local-log', conceptId: 'add-negatives', at: at(50), result: 'correct', assisted: false });
  }

  const incoming = () => ({
    profile: profile({ updatedAt: at(70), preferences: { theme: 'light' } }),
    lessonStates: [{ lessonId: 'incoming', currentStep: 9, answers: {}, hintCounts: {}, completed: true, updatedAt: at(70) }],
    mastery: [{ conceptId: 'add-negatives', state: 'established' as const, score: 99, independentCorrect: 9, assistedCorrect: 0, incorrect: 0, distinctExerciseKinds: [], updatedAt: at(70) }],
    experiments: [{ id: 'incoming-exp', name: 'New', tool: 'balance', state: {}, createdAt: at(70), updatedAt: at(70) }],
    reviews: [{ conceptId: 'add-negatives', dueAt: at(80), intervalDays: 3, ease: 2.5, reps: 1, lapses: 0, updatedAt: at(70) }],
    attempts: [attempt({ uid: 'incoming-att', at: at(70) })],
    history: [history({ uid: 'incoming-hist', at: at(70) })],
    reviewLogs: [{ uid: 'incoming-log', conceptId: 'add-negatives' as const, at: at(70), result: 'incorrect' as const, assisted: false }],
  });

  it('leaves every store unchanged when the merge transaction fails', async () => {
    const target = await freshRepo('atomic-target');
    await seedLocal(target);
    const before = await snapshot(target);
    const backup = await emptyBackup(incoming());

    target.testHooks.beforeMergeWrite = () => {
      throw new Error('injected failure before any merge write');
    };
    await expect(applyBackup(target, backup, 'merge')).rejects.toThrow(/injected failure/);
    expect(await snapshot(target)).toEqual(before);

    // A failing *request* (not a thrown hook) must also abort the transaction in full:
    // a duplicate key on the unique uid index for an untouched-uid row.
    target.testHooks = {
      beforeMergeWrite: (tx) => {
        tx.objectStore(STORES.attempts).add({ ...attempt({ uid: 'local-att' }), conceptId: 'x' } as AttemptRecord);
      },
    };
    // Allow the request's error event to propagate rather than the hook throwing.
    await expect(applyBackup(target, backup, 'merge')).rejects.toBeTruthy();
    expect(await snapshot(target)).toEqual(before);
  });

  it('does not leave keyed writes behind when append writes fail', async () => {
    const target = await freshRepo('atomic-keyed');
    await seedLocal(target);
    const before = await snapshot(target);
    const backup = await emptyBackup(incoming());
    target.testHooks = {
      beforeMergeWrite: (tx) => {
        // Mastery is written first; make the attempt insert collide so the transaction aborts
        // after keyed puts have been queued.
        tx.objectStore(STORES.attempts).add({ ...attempt({ uid: 'local-att' }), conceptId: 'x' } as AttemptRecord);
        tx.objectStore(STORES.lessonStates).put({ lessonId: 'local', currentStep: 99, answers: {}, hintCounts: {}, completed: true, updatedAt: at(99) });
      },
    };
    await expect(applyBackup(target, backup, 'merge')).rejects.toBeTruthy();
    expect(await snapshot(target)).toEqual(before);
    expect((await target.getLessonState('local'))?.currentStep).toBe(2);
    expect((await target.getMastery('add-negatives'))?.state).toBe('practicing');
  });

  it('still imports normally on the same repository once the failure is gone', async () => {
    const target = await freshRepo('atomic-recover');
    await seedLocal(target);
    const backup = await emptyBackup(incoming());
    target.testHooks.beforeMergeWrite = () => {
      throw new Error('fail once');
    };
    await expect(applyBackup(target, backup, 'merge')).rejects.toThrow();
    delete target.testHooks.beforeMergeWrite;
    const result = await applyBackup(target, backup, 'merge');
    expect(result.applied.attempts).toBe(1);
    expect(await target.allAttempts()).toHaveLength(2);
    expect((await target.getLessonState('incoming'))?.completed).toBe(true);
  });
});

describe('C. replace mode is unchanged', () => {
  it('replaces everything in one transaction, keeping uids', async () => {
    const target = await freshRepo('replace-target');
    await target.addAttempt(attempt({ uid: 'old' }));
    const backup = await emptyBackup({ attempts: [attempt({ uid: 'r1' }), attempt({ uid: 'r2' })] });
    await applyBackup(target, backup, 'replace');
    expect((await target.allAttempts()).map((a) => a.uid)).toEqual(['r1', 'r2']);
    expect((await target.allHistory()).filter((h) => h.kind === 'import')).toHaveLength(1);
  });
});

describe('D. schema migration to v4', () => {
  it('backfills uids on existing rows and adds a unique uid index', async () => {
    const legacyName = `${name}-v3`;
    // Build a v3 database with the app's real v1 schema (fake-indexeddb requires the v1
    // store/index set before later versions are applied), then seed pre-uid rows the way
    // the v3 code wrote them.
    await new Promise<void>((resolve, reject) => {
      const request = factory.open(legacyName, 3);
      request.onupgradeneeded = () => {
        const db = request.result;
        const tx = request.transaction!;
        for (let v = 1; v <= 3; v++) MIGRATIONS[v](db, tx);
        tx.objectStore('attempts').add({ conceptId: 'c', lessonId: 'l', exerciseId: 'e', answer: '1', correct: true, hintsUsed: 0, attemptNumber: 1, at: at(1) });
        tx.objectStore('attempts').add({ conceptId: 'c', lessonId: 'l', exerciseId: 'e', answer: '1', correct: true, hintsUsed: 0, attemptNumber: 1, at: at(1) });
        tx.objectStore('history').add({ kind: 'lesson-complete', detail: 'old', at: at(2) });
        tx.objectStore('reviewLog').add({ conceptId: 'c', at: at(3), result: 'correct', assisted: false });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    const db = await openDatabase({ factory, name: legacyName });
    expect(db.version).toBe(4);
    for (const store of [STORES.attempts, STORES.history, STORES.reviewLog]) {
      const tx = db.transaction(store);
      expect(tx.objectStore(store).indexNames.contains('uid')).toBe(true);
    }
    db.close();

    const r = await freshRepo(legacyName);
    const attempts = await r.allAttempts();
    expect(attempts).toHaveLength(2);
    expect(attempts.every((a) => typeof a.uid === 'string' && a.uid.length > 0)).toBe(true);
    expect(new Set(attempts.map((a) => a.uid)).size).toBe(2);
    expect((await r.allHistory())[0].uid).toBeTruthy();
    expect((await r.allReviewLogs())[0].uid).toBeTruthy();
  });
});

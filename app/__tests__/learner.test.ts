/**
 * The learner store and the content layer, run on a real SQLite engine
 * (sql.js) so the schema, the P2 migration and every query are executed
 * rather than pattern-matched.
 */

import { importPackages } from '../src/content/importer';
import { PACKAGES } from '../src/content/packages';
import { getExercises, getLesson, listLessons } from '../src/content/service';
import { computeProgress } from '../src/learner/progress';
import {
  DEV_STORAGE_TABLE,
  ensureLearnerSchema,
  listAttempts,
  listLearners,
  listReveals,
  normaliseCode,
  recordAttempt,
  recordReveal,
  startSession,
  touchLearner,
} from '../src/learner/store';

const { makeSqlDb } = require('../jest/sqljs-db');

type SqlDb = Awaited<ReturnType<typeof makeSqlDb>>;

describe('content layer on real SQLite', () => {
  let db: SqlDb;
  beforeAll(async () => {
    db = await makeSqlDb();
  });
  afterAll(() => db.close());

  it('imports the package and reads it back through the service', async () => {
    const reports = await importPackages(db, PACKAGES);
    expect(reports[0]).toMatchObject({ action: 'imported', lessons: 1, examples: 2, exercises: 5 });
    const lessons = await listLessons(db);
    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({ id: 'rw-s6-am.u1.l07', exerciseCount: 5, reviewStatus: 'developer-test' });
    const lesson = await getLesson(db, lessons[0].id);
    expect(lesson?.blocks.length).toBeGreaterThan(5);
    const exercises = await getExercises(db, lessons[0].id);
    expect(exercises.map(q => q.id)).toEqual(lesson?.exercises);
    expect(exercises[0].answer.expected).toBe('5 + 3*I');
    expect(exercises[0].hints).toHaveLength(3);
    const again = await importPackages(db, PACKAGES);
    expect(again[0].action).toBe('up-to-date');
  });
});

describe('learner schema', () => {
  it('creates the four tables on an empty database', async () => {
    const db = await makeSqlDb();
    const r = await ensureLearnerSchema(db);
    expect(r.migratedDevTable).toBe(false);
    const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).rows.map(
      (x: { name: string }) => x.name,
    );
    expect(tables).toEqual(expect.arrayContaining(['learners', 'sessions', 'attempts', 'reveals']));
    expect(tables).not.toContain(DEV_STORAGE_TABLE);
    db.close();
  });

  it('renames the P2 developer attempts table and keeps its rows', async () => {
    const db = await makeSqlDb();
    await db.execute(
      `CREATE TABLE attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, learner TEXT NOT NULL, probe TEXT NOT NULL,
         answer TEXT, correct INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    );
    await db.execute("INSERT INTO attempts (learner, probe, answer, correct) VALUES ('dev-A', 'cx-01', '11 - 10i', 1)");
    const first = await ensureLearnerSchema(db);
    expect(first.migratedDevTable).toBe(true);
    const kept = await db.execute(`SELECT COUNT(*) AS n FROM ${DEV_STORAGE_TABLE}`);
    expect(kept.rows[0].n).toBe(1);
    const cols = (await db.execute('PRAGMA table_info(attempts)')).rows.map((c: { name: string }) => c.name);
    expect(cols).toContain('exercise_id');
    expect(cols).not.toContain('probe');
    const second = await ensureLearnerSchema(db);
    expect(second.migratedDevTable).toBe(false);
    db.close();
  });
});

describe('learner codes', () => {
  it.each([
    ['a1', 'A1'],
    [' b 2 ', 'B-2'],
    ['learner-07', 'LEARNER-07'],
  ])('normalises %s to %s', (raw, want) => {
    expect(normaliseCode(raw)).toBe(want);
  });
  it.each(['', '   ', 'a code that is far too long', 'ab@c', 'nziza aime pacifique'])('rejects %s', raw => {
    expect(normaliseCode(raw)).toBeNull();
  });
});

describe('learner records', () => {
  let db: SqlDb;
  beforeAll(async () => {
    db = await makeSqlDb();
    await ensureLearnerSchema(db);
  });
  afterAll(() => db.close());

  it('creates a learner once and lists the most recent first', async () => {
    const a = await touchLearner(db, 'A1');
    expect(a.code).toBe('A1');
    await touchLearner(db, 'B2');
    await touchLearner(db, 'A1');
    const list = await listLearners(db);
    expect(list.map(l => l.code)).toEqual(['A1', 'B2'].sort());
    expect(list).toHaveLength(2);
  });

  it('keeps attempts and reveals apart by learner code', async () => {
    const sA = await startSession(db, 'A1', 'rw-s6-am.u1@0.1.0');
    const sB = await startSession(db, 'B2', 'rw-s6-am.u1@0.1.0');
    expect(sB).toBeGreaterThan(sA);
    const base = { lessonId: 'rw-s6-am.u1.l07', exerciseId: 'rw-s6-am.u1.q.001' };
    await recordAttempt(db, { ...base, learnerCode: 'A1', sessionId: sA, answer: '5 - 3i', verdict: 'wrong', hintsSeen: 0 });
    await recordReveal(db, { ...base, learnerCode: 'A1', sessionId: sA, kind: 'hint', hintIndex: 0 });
    await recordAttempt(db, { ...base, learnerCode: 'A1', sessionId: sA, answer: '5 + 3i', verdict: 'correct', hintsSeen: 1 });
    await recordAttempt(db, { ...base, learnerCode: 'B2', sessionId: sB, answer: 'x', verdict: 'unsupported', hintsSeen: 0 });

    const a = await listAttempts(db, 'A1');
    expect(a.map(x => x.verdict)).toEqual(['wrong', 'correct']);
    expect(a[1]).toMatchObject({ learnerCode: 'A1', sessionId: sA, answer: '5 + 3i', hintsSeen: 1 });
    expect(a[1].createdAt).toMatch(/^\d{4}-\d{2}-\d{2} /);
    const b = await listAttempts(db, 'B2');
    expect(b.map(x => x.verdict)).toEqual(['unsupported']);
    expect(await listReveals(db, 'B2')).toEqual([]);
    const rA = await listReveals(db, 'A1');
    expect(rA).toHaveLength(1);
    expect(rA[0]).toMatchObject({ kind: 'hint', hintIndex: 0 });
  });

  it('feeds the progress engine from stored rows', async () => {
    const lesson = PACKAGES[0].lessons[0];
    const exercises = PACKAGES[0].exercises.map(q => ({ id: q.id, label: q.source_label }));
    const lessons = [{ id: lesson.id, title: lesson.title, exerciseIds: lesson.exercises }];
    const pA = computeProgress(lessons, exercises, await listAttempts(db, 'A1'), await listReveals(db, 'A1'))[0];
    expect(pA).toMatchObject({ total: 5, attempted: 1, correct: 1, attempts: 2, hints: 1, status: 'in-progress' });
    expect(pA.next.exerciseId).toBe('rw-s6-am.u1.q.002');
    const pB = computeProgress(lessons, exercises, await listAttempts(db, 'B2'), await listReveals(db, 'B2'))[0];
    expect(pB).toMatchObject({ attempted: 1, correct: 0, status: 'in-progress' });
    const pC = computeProgress(lessons, exercises, await listAttempts(db, 'C3'), await listReveals(db, 'C3'))[0];
    expect(pC.status).toBe('not-started');
  });
});

/**
 * Progress passed between tablets: the summary file a student tablet
 * builds, the checks the teacher's tablet makes before trusting it, how two
 * tablets' records of one learner combine, and how imports are kept.
 */

import { importPackages } from '../src/content/importer';
import { PACKAGES } from '../src/content/packages';
import { getContentVersions, listLessons } from '../src/content/service';
import { ensureGuidanceSchema, recordGuidance } from '../src/guidance/log';
import { parseSqliteUtc } from '../src/learner/time';
import { openSession } from '../src/learner/session';
import { ensureLearnerSchema, recordAttempt, recordReveal } from '../src/learner/store';
import { buildSummaryFile, ensureSharingSchema, lessonRefs, listReceived, removeReceived, saveReceived } from '../src/sharing/store';
import {
  mergeLearners,
  parseSummary,
  progressFromSummary,
  summaryFileName,
  SUMMARY_FORMAT,
  type LearnerSummary,
  type SummaryFile,
} from '../src/sharing/summary';

const { makeSqlDb } = require('../jest/sqljs-db');

const u1 = PACKAGES[0];
const tablet = (id: string, label: string) => ({ id, label, deviceModel: 'ATMPC IT-801B', appVersion: '1.2.0' });

async function tabletDb() {
  const db = await makeSqlDb();
  await ensureLearnerSchema(db);
  await ensureGuidanceSchema(db);
  await ensureSharingSchema(db);
  await importPackages(db, PACKAGES);
  return { db, versions: await getContentVersions(db), lessons: await listLessons(db) };
}

describe('the summary a student tablet sends', () => {
  it('holds counts per exercise and nothing a learner typed or the tutor wrote', async () => {
    const { db, versions, lessons } = await tabletDb();
    const s = await openSession(db, 'S6-07', versions);
    const q = u1.exercises[0];
    await recordAttempt(db, { learnerCode: 'S6-07', sessionId: s.sessionId, lessonId: q.lesson, exerciseId: q.id, answer: 'SECRET-ANSWER 5-3i', verdict: 'wrong', hintsSeen: 0 });
    await recordAttempt(db, { learnerCode: 'S6-07', sessionId: s.sessionId, lessonId: q.lesson, exerciseId: q.id, answer: '5+3i', verdict: 'correct', hintsSeen: 1 });
    await recordReveal(db, { learnerCode: 'S6-07', sessionId: s.sessionId, lessonId: q.lesson, exerciseId: q.id, kind: 'hint', hintIndex: 0 });
    await recordGuidance(db, {
      learnerCode: 'S6-07', sessionId: s.sessionId, lessonId: q.lesson, exerciseId: null, question: 'TUTOR-QUESTION', outcome: 'generated',
      text: 'TUTOR-TEXT', promptTokens: 1, generatedTokens: 9, firstTokenMs: 500, totalMs: 9000,
    });
    const file = await buildSummaryFile(db, lessons, versions, tablet('a1b2c3d4', 'Tablet A1B2'), new Date(Date.UTC(2026, 9, 20, 8, 0, 0)));
    const text = JSON.stringify(file);
    expect(text).not.toMatch(/SECRET-ANSWER|5\+3i|TUTOR-QUESTION|TUTOR-TEXT/);
    expect(file.learners).toHaveLength(1);
    const l = file.learners[0];
    expect(l).toMatchObject({ code: 'S6-07', aiRequests: 1 });
    const stat = l.lessons.find(x => x.lessonId === q.lesson)!.exercises.find(e => e.id === q.id);
    expect(stat).toEqual({ id: q.id, attempts: 2, wrong: 1, correct: true, hintsSeen: 1, solutionSeen: false });

    const back = parseSummary(text);
    expect(back.ok).toBe(true);
    expect(back.ok && back.summary).toEqual(file);
    expect(summaryFileName('Tablet A1B2', new Date(2026, 9, 20, 10, 42))).toBe('OfflineTutor-progress-Tablet-A1B2-20261020-1042.txt');
    db.close();
  });
});

describe('parseSummary (what the teacher tablet accepts)', () => {
  const good: SummaryFile = {
    format: SUMMARY_FORMAT,
    version: 1,
    tablet: tablet('t-1', 'Tablet 0001'),
    exportedAt: '2026-10-20T08:00:00.000Z',
    content: [{ packageId: 'rw-s6-am.u1', version: '0.2.0' }],
    learners: [
      {
        code: 'S6-01',
        lastSeenAt: '2026-10-20 07:59:00',
        aiRequests: 0,
        lessons: [{ lessonId: 'rw-s6-am.u1.l07', lastActivity: null, exercises: [{ id: 'rw-s6-am.u1.q.001', attempts: 1, wrong: 0, correct: true, hintsSeen: 0, solutionSeen: false }] }],
      },
    ],
  };
  const withLearner = (patch: Partial<LearnerSummary>) => JSON.stringify({ ...good, learners: [{ ...good.learners[0], ...patch }] });

  it('accepts a well-formed file', () => {
    expect(parseSummary(JSON.stringify(good)).ok).toBe(true);
  });

  it.each([
    ['plain text', 'hello teacher', /not a progress file/],
    ['another JSON file', JSON.stringify({ format: 'something-else' }), /not a progress file/],
    ['a newer format', JSON.stringify({ ...good, version: 2 }), /different version of the app/],
    ['a bad learner code', withLearner({ code: 'not a code!' }), /damaged/],
    ['a negative count', withLearner({ aiRequests: -1 }), /damaged/],
    ['a learner twice', JSON.stringify({ ...good, learners: [good.learners[0], good.learners[0]] }), /appears twice/],
    ['a missing tablet', JSON.stringify({ ...good, tablet: undefined }), /damaged/],
    ['a huge file', ' '.repeat(2_000_001), /too large/],
  ])('refuses %s with a plain reason', (_what, text, reason) => {
    const r = parseSummary(text as string);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(reason as RegExp);
  });
});

describe('one class from several tablets', () => {
  const ex = (id: string, attempts: number, wrong: number, correct: boolean, hintsSeen = 0) => ({ id, attempts, wrong, correct, hintsSeen, solutionSeen: false });
  const L = 'rw-s6-am.u1.l07';
  const [q1, q2] = u1.exercises.map(q => q.id);

  it('adds up a learner who used two tablets, and keeps the latest activity', () => {
    const a: LearnerSummary = { code: 'S6-07', lastSeenAt: '2026-10-19 09:00:00', aiRequests: 1, lessons: [{ lessonId: L, lastActivity: '2026-10-19 09:00:00', exercises: [ex(q1, 2, 2, false, 1)] }] };
    const b: LearnerSummary = { code: 'S6-07', lastSeenAt: '2026-10-20 09:00:00', aiRequests: 2, lessons: [{ lessonId: L, lastActivity: '2026-10-20 09:00:00', exercises: [ex(q1, 1, 0, true, 2), ex(q2, 1, 1, false)] }] };
    const other: LearnerSummary = { code: 'S6-08', lastSeenAt: '2026-10-18 09:00:00', aiRequests: 0, lessons: [] };
    const merged = mergeLearners([{ label: 'Tablet A', learners: [a, other] }, { label: 'Tablet B', learners: [b] }]);
    expect(merged.map(m => m.code)).toEqual(['S6-07', 'S6-08']);
    const m = merged[0];
    expect(m.sources).toEqual(['Tablet A', 'Tablet B']);
    expect(m.lastSeenAt).toBe('2026-10-20 09:00:00');
    expect(m.aiRequests).toBe(3);
    expect(m.lessons[0].lastActivity).toBe('2026-10-20 09:00:00');
    expect(m.lessons[0].exercises).toEqual([ex(q1, 3, 2, true, 2), ex(q2, 1, 1, false)]);
    // The inputs are not changed by merging.
    expect(a.lessons[0].exercises[0].attempts).toBe(2);
  });

  it('rebuilds progress against this tablet\'s lessons, and counts exercises it does not have', async () => {
    const { db, lessons } = await tabletDb();
    const refs = await lessonRefs(db, lessons);
    const l: LearnerSummary = {
      code: 'S6-07',
      lastSeenAt: '2026-10-20 09:00:00',
      aiRequests: 0,
      lessons: [{ lessonId: L, lastActivity: '2026-10-20 09:00:00', exercises: [ex(q1, 1, 0, true), ex('rw-s6-am.u1.q.099', 4, 4, false)] }],
    };
    const { progress, unknown } = progressFromSummary(l, refs);
    expect(unknown).toBe(1);
    const unit1 = progress.find(p => p.lessonId === L)!;
    expect(unit1).toMatchObject({ correct: 1, total: 5, attempts: 1, status: 'in-progress', mastery: 0.2 });
    expect(progress.find(p => p.lessonId === PACKAGES[1].lessons[0].id)).toMatchObject({ status: 'not-started', correct: 0 });
    db.close();
  });
});

describe('received progress on the teacher tablet', () => {
  it('adds, ignores repeats and older files, takes newer ones, refuses its own, and removes', async () => {
    const { db } = await tabletDb();
    const file = (exportedAt: string, codes: string[]): SummaryFile => ({
      format: SUMMARY_FORMAT,
      version: 1,
      tablet: tablet('student-tablet', 'Tablet 5EED'),
      exportedAt,
      content: [],
      learners: codes.map(code => ({ code, lastSeenAt: '2026-10-20 08:00:00', aiRequests: 0, lessons: [] })),
    });
    expect(await saveReceived(db, file('2026-10-20T08:00:00.000Z', ['S6-01']), 'teacher-tablet')).toBe('added');
    expect(await saveReceived(db, file('2026-10-20T08:00:00.000Z', ['S6-01']), 'teacher-tablet')).toBe('same');
    expect(await saveReceived(db, file('2026-10-20T07:00:00.000Z', []), 'teacher-tablet')).toBe('older');
    expect(await saveReceived(db, file('2026-10-20T09:00:00.000Z', ['S6-01', 'S6-02']), 'teacher-tablet')).toBe('updated');
    expect(await saveReceived(db, file('2026-10-20T10:00:00.000Z', []), 'student-tablet')).toBe('own');
    const rows = await listReceived(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'student-tablet', label: 'Tablet 5EED', exportedAt: '2026-10-20T09:00:00.000Z' });
    expect(rows[0].summary.learners.map(l => l.code)).toEqual(['S6-01', 'S6-02']);
    await removeReceived(db, 'student-tablet');
    expect(await listReceived(db)).toEqual([]);
    db.close();
  });

  it('reads the ISO times other tablets write as well as SQLite times', () => {
    expect(parseSqliteUtc('2026-10-20T08:42:05.123Z')?.toISOString()).toBe('2026-10-20T08:42:05.000Z');
    expect(parseSqliteUtc('2026-10-20 08:42:05')?.toISOString()).toBe('2026-10-20T08:42:05.000Z');
    expect(parseSqliteUtc('yesterday')).toBeNull();
  });
});

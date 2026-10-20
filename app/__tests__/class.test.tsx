/**
 * Class progress in Teacher tools, on real SQLite: the figures for every
 * learner and every unit, the screen that shows them, and a learner's own
 * progress opened from it, read-only.
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { importPackages } from '../src/content/importer';
import { PACKAGES } from '../src/content/packages';
import { getContentVersions, listLessons } from '../src/content/service';
import { tabletLabel } from '../src/device/device';
import { ensureGuidanceSchema, recordGuidance } from '../src/guidance/log';
import { openSession } from '../src/learner/session';
import { ensureLearnerSchema, recordAttempt, recordReveal } from '../src/learner/store';
import { ClassScreen } from '../src/screens/ClassScreen';
import { ProgressScreen } from '../src/screens/ProgressScreen';
import { buildSummaryFile, ensureSharingSchema, saveReceived } from '../src/sharing/store';
import { loadClassProgress } from '../src/teacher/classProgress';

const { makeSqlDb } = require('../jest/sqljs-db');

const flush = () =>
  act(async () => {
    await new Promise<void>(r => setTimeout(() => r(), 0));
  });

function texts(root: ReactTestRenderer.ReactTestInstance): string {
  return root
    .findAllByType(require('react-native').Text)
    .map(t => (Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children ?? '')))
    .join('\n');
}

const [u1, u4] = PACKAGES;

/**
 * T1 masters Unit 1 and gets one Unit 4 exercise wrong twice (stuck);
 * T2 answers one Unit 1 exercise wrong once and asks the tutor; T3 only
 * opens the app.
 */
async function seeded() {
  const db = await makeSqlDb();
  await ensureLearnerSchema(db);
  await ensureGuidanceSchema(db);
  await ensureSharingSchema(db);
  await importPackages(db, PACKAGES);
  const versions = await getContentVersions(db);
  const lessons = await listLessons(db);
  const t1 = await openSession(db, 'T1', versions);
  for (const q of u1.exercises) {
    await recordAttempt(db, { learnerCode: 'T1', sessionId: t1.sessionId, lessonId: q.lesson, exerciseId: q.id, answer: 'ok', verdict: 'correct', hintsSeen: 0 });
  }
  const hard = u4.exercises[4];
  for (let k = 0; k < 2; k += 1) {
    await recordAttempt(db, { learnerCode: 'T1', sessionId: t1.sessionId, lessonId: hard.lesson, exerciseId: hard.id, answer: '15', verdict: 'wrong', hintsSeen: 1 });
  }
  await recordReveal(db, { learnerCode: 'T1', sessionId: t1.sessionId, lessonId: hard.lesson, exerciseId: hard.id, kind: 'hint', hintIndex: 0 });
  const t2 = await openSession(db, 'T2', versions);
  await recordAttempt(db, { learnerCode: 'T2', sessionId: t2.sessionId, lessonId: u1.exercises[0].lesson, exerciseId: u1.exercises[0].id, answer: '5-3i', verdict: 'wrong', hintsSeen: 0 });
  await recordGuidance(db, {
    learnerCode: 'T2', sessionId: t2.sessionId, lessonId: u1.lessons[0].id, exerciseId: null, question: 'how do I add?', outcome: 'generated',
    text: '1. Add the real parts.', promptTokens: 13, generatedTokens: 40, firstTokenMs: 15000, totalMs: 40000,
  });
  await recordGuidance(db, {
    learnerCode: 'T2', sessionId: t2.sessionId, lessonId: null, exerciseId: null, question: 'photosynthesis', outcome: 'declined',
    text: 'Not covered', promptTokens: null, generatedTokens: null, firstTokenMs: null, totalMs: null,
  });
  await openSession(db, 'T3', versions);
  return { db, lessons };
}

describe('loadClassProgress', () => {
  it('sums every learner and every unit from the saved records', async () => {
    const { db, lessons } = await seeded();
    const c = await loadClassProgress(db, lessons);
    expect(c.learners).toBe(3);
    expect(c.attempts).toBe(5 + 2 + 1);
    expect(c.hints).toBe(1);
    expect(c.aiRequests).toBe(1); // the declined question never ran the model

    const t1 = c.rows.find(r => r.code === 'T1')!;
    expect(t1.correct).toBe(5);
    expect(t1.total).toBe(20);
    expect(t1.units.find(u => u.lessonId === u1.lessons[0].id)).toMatchObject({ correct: 5, total: 5, status: 'mastered' });
    expect(t1.stuckOn).toEqual([u4.exercises[4].source_label]);
    const t3 = c.rows.find(r => r.code === 'T3')!;
    expect(t3).toMatchObject({ correct: 0, attempts: 0, aiRequests: 0, stuckOn: [] });

    const unit1 = c.units.find(u => u.lessonId === u1.lessons[0].id)!;
    expect(unit1).toMatchObject({ learners: 3, started: 2, mastered: 1 });
    expect(unit1.averageMastery).toBeCloseTo((1 + 0) / 2, 9);
    expect(unit1.hardest).toEqual({ label: u1.exercises[0].source_label, wrong: 1, stuck: 0 });
    const unit4 = c.units.find(u => u.lessonId === u4.lessons[0].id)!;
    expect(unit4).toMatchObject({ started: 1, mastered: 0, averageMastery: 0 });
    expect(unit4.hardest).toEqual({ label: u4.exercises[4].source_label, wrong: 2, stuck: 1 });
    const untouched = c.units.find(u => u.lessonId === PACKAGES[3].lessons[0].id)!;
    expect(untouched).toMatchObject({ started: 0, mastered: 0, averageMastery: null, hardest: null });
    db.close();
  });

  it('is empty, not an error, before anyone has used the tablet', async () => {
    const db = await makeSqlDb();
    await ensureLearnerSchema(db);
    await ensureGuidanceSchema(db);
    await ensureSharingSchema(db);
    await importPackages(db, PACKAGES);
    const c = await loadClassProgress(db, await listLessons(db));
    expect(c).toMatchObject({ learners: 0, attempts: 0, rows: [], units: [], unknownExercises: 0 });
    expect(c.tablets).toEqual([{ id: 'development', label: tabletLabel(), learners: 0, local: true, exportedAt: null, receivedAt: null }]);
    db.close();
  });
});

describe('ClassScreen', () => {
  it('shows the class, the units and who needs help, and opens a learner', async () => {
    const { db, lessons } = await seeded();
    const onLearner = jest.fn();
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      r = ReactTestRenderer.create(<ClassScreen db={db} lessons={lessons} onLearner={onLearner} />);
    });
    await flush();
    const t = texts(r.root);
    expect(t).toContain('3 learners · 8 answers checked · 1 hints · 1 AI tutor requests');
    expect(t).toContain('Started by 2 of 3 · mastered by 1 · average 50% for those who started');
    expect(t).toContain(`Most wrong answers: ${u4.exercises[4].source_label} (2 wrong; 1 learner stuck)`);
    expect(t).toContain('needs help');
    expect(t).toContain(`Stuck on: ${u4.exercises[4].source_label}`);
    expect(t).toContain('U1 5/5');
    expect(t).toContain('U9 0/5');
    const row = r.root.findAllByProps({ testID: 'class-learner-T2' }).find(n => n.props.onPress);
    await act(async () => row!.props.onPress());
    expect(onLearner).toHaveBeenCalledWith('T2');
    db.close();
  });

  it('says so when no learner has used the tablet', async () => {
    const db = await makeSqlDb();
    await ensureLearnerSchema(db);
    await ensureGuidanceSchema(db);
    await ensureSharingSchema(db);
    await importPackages(db, PACKAGES);
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      r = ReactTestRenderer.create(<ClassScreen db={db} lessons={await listLessons(db)} onLearner={() => {}} />);
    });
    await flush();
    expect(texts(r.root)).toContain('No learner has used this tablet yet.');
    db.close();
  });
});

describe('a learner opened from the class view', () => {
  it('is read-only: their progress without the practise button', async () => {
    const { db, lessons } = await seeded();
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      r = ReactTestRenderer.create(<ProgressScreen db={db} learnerCode="T1" lessons={lessons} />);
    });
    await flush();
    const t = texts(r.root);
    expect(t).toContain('Progress for T1');
    expect(t).toContain('Viewed from Teacher tools');
    expect(t).toContain('5 of 5 exercises correct');
    expect(r.root.findAllByProps({ testID: 'progress-practice' })).toHaveLength(0);
    db.close();
  });
});

/**
 * A second tablet: S6-09 solves the first Unit 9 exercise there, and T1
 * (who also used the teacher's tablet) answers the first Unit 4 exercise.
 */
async function otherTablet() {
  const db = await makeSqlDb();
  await ensureLearnerSchema(db);
  await ensureGuidanceSchema(db);
  await ensureSharingSchema(db);
  await importPackages(db, PACKAGES);
  const versions = await getContentVersions(db);
  const lessons = await listLessons(db);
  const s9 = await openSession(db, 'S6-09', versions);
  const q9 = PACKAGES[3].exercises[0];
  await recordAttempt(db, { learnerCode: 'S6-09', sessionId: s9.sessionId, lessonId: q9.lesson, exerciseId: q9.id, answer: '1.9', verdict: 'correct', hintsSeen: 0 });
  const t1 = await openSession(db, 'T1', versions);
  const q4 = u4.exercises[0];
  await recordAttempt(db, { learnerCode: 'T1', sessionId: t1.sessionId, lessonId: q4.lesson, exerciseId: q4.id, answer: '9/2', verdict: 'correct', hintsSeen: 0 });
  const file = await buildSummaryFile(db, lessons, versions, { id: 'second-tablet', label: 'Tablet 2222', deviceModel: 'ATMPC IT-801B', appVersion: '1.2.0' });
  db.close();
  return file;
}

describe('a class spread over two tablets', () => {
  it('merges the received tablet into the class, by learner code', async () => {
    const { db, lessons } = await seeded();
    expect(await saveReceived(db, await otherTablet(), 'development')).toBe('added');
    const c = await loadClassProgress(db, lessons);
    expect(c.learners).toBe(4);
    expect(c.tablets.map(t => [t.label, t.learners, t.local])).toEqual([
      [tabletLabel(), 3, true],
      ['Tablet 2222', 2, false],
    ]);
    const t1 = c.rows.find(r => r.code === 'T1')!;
    expect(t1.sources).toEqual([tabletLabel(), 'Tablet 2222']);
    expect(t1.correct).toBe(6); // Unit 1 here, plus the Unit 4 exercise on the other tablet
    expect(t1.units.find(u => u.lessonId === u4.lessons[0].id)).toMatchObject({ correct: 1 });
    expect(t1.stuckOn).toEqual([u4.exercises[4].source_label]);
    const s9 = c.rows.find(r => r.code === 'S6-09')!;
    expect(s9.sources).toEqual(['Tablet 2222']);
    expect(c.units.find(u => u.lessonId === PACKAGES[3].lessons[0].id)).toMatchObject({ started: 1, learners: 4 });
    db.close();
  });

  it('shows where each learner worked, and removes a tablet after a second tap', async () => {
    const { db, lessons } = await seeded();
    await saveReceived(db, await otherTablet(), 'development');
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      r = ReactTestRenderer.create(<ClassScreen db={db} lessons={lessons} onLearner={() => {}} />);
    });
    await flush();
    let t = texts(r.root);
    expect(t).toContain(`${tabletLabel()} (this tablet) · 3 learners`);
    expect(t).toContain('Tablet 2222 · 2 learners');
    expect(t).toContain(`on ${tabletLabel()} and Tablet 2222`);
    expect(t).toContain('4 learners');
    const removeButton = () => r.root.findAllByProps({ testID: 'class-remove-Tablet 2222' }).find(n => n.props.onPress);
    await act(async () => removeButton()!.props.onPress());
    expect(texts(r.root)).toContain('Tap again to remove');
    await act(async () => removeButton()!.props.onPress());
    await flush();
    t = texts(r.root);
    expect(t).not.toContain('Tablet 2222');
    expect(t).toContain('3 learners');
    db.close();
  });
});

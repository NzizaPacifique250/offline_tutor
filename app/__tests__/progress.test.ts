/**
 * The progress engine and the practice state machine: the rules the
 * architecture fixes (hint order, solution after hints, repeated-mistake
 * recommendations), tested without a database or a screen.
 */

import type { CheckResult } from '../src/checker/check';
import { computeProgress, REPEATED_MISTAKES } from '../src/learner/progress';
import type { AttemptRecord, RevealRecord } from '../src/learner/store';
import { canCheck, canShowHint, canShowSolution, initialPractice, reduce } from '../src/study/practice';

const lessons = [{ id: 'L', title: 'Lesson', exerciseIds: ['q1', 'q2', 'q3'] }];
const exercises = [
  { id: 'q1', label: 'Q1' },
  { id: 'q2', label: 'Q2' },
  { id: 'q3', label: 'Q3' },
];

let n = 0;
function attempt(exerciseId: string, verdict: AttemptRecord['verdict']): AttemptRecord {
  n += 1;
  return {
    id: n,
    learnerCode: 'A',
    sessionId: 1,
    lessonId: 'L',
    exerciseId,
    answer: '?',
    verdict,
    hintsSeen: 0,
    createdAt: `2026-09-28 10:00:${String(n).padStart(2, '0')}`,
  };
}
function reveal(exerciseId: string, kind: RevealRecord['kind'], hintIndex: number | null = null): RevealRecord {
  n += 1;
  return { id: n, learnerCode: 'A', sessionId: 1, lessonId: 'L', exerciseId, kind, hintIndex, createdAt: `2026-09-28 10:01:${String(n).padStart(2, '0')}` };
}

describe('computeProgress', () => {
  it('starts empty and recommends the first exercise', () => {
    const p = computeProgress(lessons, exercises, [], [])[0];
    expect(p).toMatchObject({ status: 'not-started', mastery: 0, correct: 0, attempted: 0, lastActivity: null });
    expect(p.next).toEqual({ exerciseId: 'q1', reason: 'Start with Q1.', reviewExample: false });
  });

  it('counts a correct exercise once however many attempts it took', () => {
    const p = computeProgress(lessons, exercises, [attempt('q1', 'wrong'), attempt('q1', 'correct'), attempt('q1', 'correct')], [])[0];
    expect(p).toMatchObject({ status: 'in-progress', correct: 1, attempted: 1, attempts: 3 });
    expect(p.mastery).toBeCloseTo(1 / 3);
    expect(p.next).toMatchObject({ exerciseId: 'q2', reason: 'Next: Q2.' });
  });

  it('sends the learner back to the worked example after repeated mistakes', () => {
    const wrongs = Array.from({ length: REPEATED_MISTAKES }, () => attempt('q2', 'wrong'));
    const p = computeProgress(lessons, exercises, [attempt('q1', 'correct'), ...wrongs], [])[0];
    expect(p.next.exerciseId).toBe('q2');
    expect(p.next.reviewExample).toBe(true);
    expect(p.next.reason).toContain('worked example');
  });

  it('is mastered when every exercise has a correct attempt', () => {
    const p = computeProgress(lessons, exercises, [attempt('q1', 'correct'), attempt('q2', 'correct'), attempt('q3', 'correct')], [])[0];
    expect(p.status).toBe('mastered');
    expect(p.mastery).toBe(1);
    expect(p.next.exerciseId).toBeNull();
  });

  it('counts hints and solutions and dates the last activity', () => {
    const p = computeProgress(lessons, exercises, [attempt('q1', 'wrong')], [reveal('q1', 'hint', 0), reveal('q1', 'hint', 0), reveal('q1', 'hint', 1), reveal('q1', 'solution')])[0];
    expect(p.hints).toBe(3);
    expect(p.solutions).toBe(1);
    expect(p.exercises[0]).toMatchObject({ hintsSeen: 2, solutionSeen: true, wrong: 1 });
    expect(p.lastActivity).toMatch(/^2026-09-28 10:01/);
    expect(p.status).toBe('in-progress');
  });

  it('treats unsupported and empty verdicts as neither correct nor wrong', () => {
    const p = computeProgress(lessons, exercises, [attempt('q1', 'unsupported')], [])[0];
    expect(p.exercises[0]).toMatchObject({ attempts: 1, wrong: 0, correct: false });
    expect(p.next.reviewExample).toBe(false);
  });
});

describe('practice state machine', () => {
  const result = (verdict: CheckResult['verdict'], input = 'x'): CheckResult => ({ verdict, input });

  it('reveals hints one at a time in order and then stops', () => {
    let s = initialPractice('q1', 2);
    expect(canShowHint(s)).toBe(true);
    expect(canShowSolution(s)).toBe(false);
    let r = reduce(s, { type: 'hint' });
    expect(r.effects).toEqual([{ type: 'record-reveal', kind: 'hint', hintIndex: 0 }]);
    s = r.state;
    r = reduce(s, { type: 'hint' });
    expect(r.effects).toEqual([{ type: 'record-reveal', kind: 'hint', hintIndex: 1 }]);
    s = r.state;
    expect(s.hintsShown).toBe(2);
    expect(canShowHint(s)).toBe(false);
    r = reduce(s, { type: 'hint' });
    expect(r.effects).toEqual([]);
    expect(r.state).toBe(s);
  });

  it('keeps the solution closed until the hints are exhausted', () => {
    let s = initialPractice('q1', 2);
    expect(reduce(s, { type: 'solution' }).effects).toEqual([]);
    s = reduce(s, { type: 'hint' }).state;
    expect(canShowSolution(s)).toBe(false);
    s = reduce(s, { type: 'hint' }).state;
    expect(canShowSolution(s)).toBe(true);
    const r = reduce(s, { type: 'solution' });
    expect(r.effects).toEqual([{ type: 'record-reveal', kind: 'solution' }]);
    expect(r.state.solutionShown).toBe(true);
    expect(canShowSolution(r.state)).toBe(false);
  });

  it('opens the solution after a correct answer without any hint', () => {
    const s = reduce(initialPractice('q1', 3), { type: 'check', result: result('correct', '5 + 3i') }).state;
    expect(s.solved).toBe(true);
    expect(canShowSolution(s)).toBe(true);
    expect(s.feedback).toEqual({ tone: 'ok', text: 'Correct.' });
  });

  it('records every non-empty check as an attempt with the hints seen so far', () => {
    let s = initialPractice('q1', 3);
    s = reduce(s, { type: 'hint' }).state;
    const r = reduce(s, { type: 'check', result: result('wrong', '5 - 3i') });
    expect(r.effects).toEqual([{ type: 'record-attempt', input: '5 - 3i', verdict: 'wrong', hintsSeen: 1 }]);
    const e = reduce(r.state, { type: 'check', result: result('empty', '') });
    expect(e.effects).toEqual([]);
    expect(e.state.attempts).toHaveLength(1);
    expect(e.state.feedback?.text).toBe('Type an answer first.');
  });

  it('escalates feedback with repeated wrong answers', () => {
    let s = initialPractice('q1', 3);
    s = reduce(s, { type: 'check', result: result('wrong') }).state;
    expect(s.feedback?.tone).toBe('warn');
    expect(s.feedback?.text).toMatch(/Not quite/);
    s = reduce(s, { type: 'check', result: result('wrong') }).state;
    expect(s.feedback?.text).toMatch(/hint may help/);
    s = reduce(s, { type: 'check', result: result('wrong') }).state;
    expect(s.feedback?.tone).toBe('bad');
    expect(s.feedback?.text).toMatch(/worked example/);
    s = reduce(s, { type: 'check', result: result('correct') }).state;
    expect(s.feedback?.text).toBe('Correct, after 4 tries.');
  });

  it('stops checking once the solution is open or the exercise is solved', () => {
    let s = initialPractice('q1', 1);
    s = reduce(s, { type: 'hint' }).state;
    s = reduce(s, { type: 'solution' }).state;
    expect(canCheck(s)).toBe(false);
    const r = reduce(s, { type: 'check', result: result('correct', '5 + 3i') });
    expect(r.effects).toEqual([]);
    expect(r.state.solved).toBe(false);
    const solved = reduce(initialPractice('q2', 1), { type: 'check', result: result('correct') }).state;
    expect(canCheck(solved)).toBe(false);
    expect(reduce(solved, { type: 'check', result: result('wrong') }).effects).toEqual([]);
  });

  it('explains an unsupported input instead of grading it', () => {
    const s = reduce(initialPractice('q1', 3), { type: 'check', result: result('unsupported', 'sqrt(2)') }).state;
    expect(s.solved).toBe(false);
    expect(s.feedback?.tone).toBe('info');
    expect(s.feedback?.text).toMatch(/could not be checked automatically/);
    expect(s.attempts).toEqual([{ input: 'sqrt(2)', verdict: 'unsupported' }]);
  });
});

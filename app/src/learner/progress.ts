/**
 * The progress engine (ARCHITECTURE.md): explainable progress computed from
 * saved attempts, never stored. A lesson's mastery is the share of its
 * exercises the learner has answered correctly at least once. The next
 * activity is chosen from the same record: the first exercise not yet
 * correct, or, after repeated mistakes on one exercise, the worked example.
 *
 * Pure: no database, no React.
 */

import type { AttemptRecord, RevealRecord } from './store';

export type LessonRef = { id: string; title: string; exerciseIds: string[] };
export type ExerciseRef = { id: string; label: string };

export type ExerciseProgress = {
  exerciseId: string;
  label: string;
  attempts: number;
  wrong: number;
  correct: boolean;
  hintsSeen: number;
  solutionSeen: boolean;
};

export type LessonStatus = 'not-started' | 'in-progress' | 'mastered';

export type Recommendation = {
  exerciseId: string | null;
  /** Why this exercise: shown to the learner in plain words. */
  reason: string;
  /** True after two or more wrong answers on the recommended exercise. */
  reviewExample: boolean;
};

export type LessonProgress = {
  lessonId: string;
  title: string;
  total: number;
  attempted: number;
  correct: number;
  attempts: number;
  hints: number;
  solutions: number;
  /** correct / total, 0..1 */
  mastery: number;
  status: LessonStatus;
  lastActivity: string | null;
  exercises: ExerciseProgress[];
  next: Recommendation;
};

/** Wrong answers on one exercise before the learner is sent back to the example. */
export const REPEATED_MISTAKES = 2;

function exerciseProgress(
  ex: ExerciseRef,
  attempts: AttemptRecord[],
  reveals: RevealRecord[],
): ExerciseProgress {
  const mine = attempts.filter(a => a.exerciseId === ex.id);
  const revealsMine = reveals.filter(r => r.exerciseId === ex.id);
  return {
    exerciseId: ex.id,
    label: ex.label,
    attempts: mine.length,
    wrong: mine.filter(a => a.verdict === 'wrong').length,
    correct: mine.some(a => a.verdict === 'correct'),
    hintsSeen: new Set(revealsMine.filter(r => r.kind === 'hint').map(r => r.hintIndex)).size,
    solutionSeen: revealsMine.some(r => r.kind === 'solution'),
  };
}

export function recommend(exercises: ExerciseProgress[]): Recommendation {
  const open = exercises.filter(e => !e.correct);
  if (exercises.length === 0) {
    return { exerciseId: null, reason: 'This lesson has no exercises yet.', reviewExample: false };
  }
  if (open.length === 0) {
    return { exerciseId: null, reason: 'Every exercise answered correctly. Well done.', reviewExample: false };
  }
  const struggling = open.find(e => e.wrong >= REPEATED_MISTAKES);
  if (struggling) {
    return {
      exerciseId: struggling.exerciseId,
      reason: `${struggling.label} has ${struggling.wrong} wrong answers. Re-read the worked example in the lesson, then try it again.`,
      reviewExample: true,
    };
  }
  const first = open[0];
  const started = exercises.some(e => e.attempts > 0);
  return {
    exerciseId: first.exerciseId,
    reason: started ? `Next: ${first.label}.` : `Start with ${first.label}.`,
    reviewExample: false,
  };
}

export function lessonProgress(
  lesson: LessonRef,
  exercisesById: Map<string, ExerciseRef>,
  attempts: AttemptRecord[],
  reveals: RevealRecord[],
): LessonProgress {
  const mineA = attempts.filter(a => a.lessonId === lesson.id);
  const mineR = reveals.filter(r => r.lessonId === lesson.id);
  const exercises = lesson.exerciseIds
    .map(id => exercisesById.get(id) ?? { id, label: id })
    .map(ex => exerciseProgress(ex, mineA, mineR));
  const correct = exercises.filter(e => e.correct).length;
  const attempted = exercises.filter(e => e.attempts > 0).length;
  const total = exercises.length;
  const status: LessonStatus =
    total > 0 && correct === total ? 'mastered' : attempted > 0 || mineR.length > 0 ? 'in-progress' : 'not-started';
  const stamps = [...mineA.map(a => a.createdAt), ...mineR.map(r => r.createdAt)].sort();
  return {
    lessonId: lesson.id,
    title: lesson.title,
    total,
    attempted,
    correct,
    attempts: mineA.length,
    hints: mineR.filter(r => r.kind === 'hint').length,
    solutions: mineR.filter(r => r.kind === 'solution').length,
    mastery: total === 0 ? 0 : correct / total,
    status,
    lastActivity: stamps.length ? stamps[stamps.length - 1] : null,
    exercises,
    next: recommend(exercises),
  };
}

export function computeProgress(
  lessons: LessonRef[],
  exercises: ExerciseRef[],
  attempts: AttemptRecord[],
  reveals: RevealRecord[],
): LessonProgress[] {
  const byId = new Map(exercises.map(e => [e.id, e]));
  return lessons.map(l => lessonProgress(l, byId, attempts, reveals));
}

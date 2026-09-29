/**
 * The active study session: which learner code is in use and the session row
 * their attempts are filed under. Opened when a learner code is chosen.
 */

import type { LessonSummary } from '../content/service';
import { getExercises, type ContentVersion } from '../content/service';
import { computeProgress, type LessonProgress } from './progress';
import { listAttempts, listReveals, startSession, touchLearner, type Executor } from './store';

export type ActiveSession = { learnerCode: string; sessionId: number };

export function versionsLabel(versions: ContentVersion[]): string {
  return versions.map(v => `${v.packageId}@${v.version}`).join(',');
}

export async function openSession(db: Executor, code: string, versions: ContentVersion[]): Promise<ActiveSession> {
  await touchLearner(db, code);
  const sessionId = await startSession(db, code, versionsLabel(versions));
  return { learnerCode: code, sessionId };
}

/** Progress for every lesson, from the learner's stored attempts and reveals. */
export async function loadProgress(db: Executor, learnerCode: string, lessons: LessonSummary[]): Promise<LessonProgress[]> {
  const exercises = (await Promise.all(lessons.map(l => getExercises(db, l.id)))).flat();
  const [attempts, reveals] = await Promise.all([listAttempts(db, learnerCode), listReveals(db, learnerCode)]);
  return computeProgress(
    lessons.map(l => ({ id: l.id, title: l.title, exerciseIds: exercises.filter(q => q.lesson === l.id).map(q => q.id) })),
    exercises.map(q => ({ id: q.id, label: q.source_label })),
    attempts,
    reveals,
  );
}

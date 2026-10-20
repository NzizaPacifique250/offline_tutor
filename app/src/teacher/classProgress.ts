/**
 * The class view in Teacher tools: every learner code on this tablet and
 * on the tablets that sent their progress (sharing/), with their progress
 * in each unit, and each unit's progress across the class. Everything is
 * computed on the tablet when the screen opens, from this tablet's records
 * and the summaries received; nothing needs a connection.
 *
 * classSummary is pure; loadClassProgress reads the database.
 */

import type { LessonSummary } from '../content/service';
import { deviceInfo, tabletLabel } from '../device/device';
import { REPEATED_MISTAKES, type LessonProgress, type LessonStatus } from '../learner/progress';
import type { Executor } from '../learner/store';
import { lessonRefs, listReceived, localSummaries } from '../sharing/store';
import { mergeLearners, progressFromSummary } from '../sharing/summary';

export type LearnerInput = {
  code: string;
  lastSeenAt: string;
  progress: LessonProgress[];
  /** Requests that ran the model: generated, cancelled, timed out or failed. */
  aiRequests: number;
  /** The tablets the learner used, by name. */
  sources: string[];
};

export type LearnerRow = {
  code: string;
  lastSeenAt: string;
  units: { lessonId: string; correct: number; total: number; status: LessonStatus }[];
  correct: number;
  total: number;
  attempts: number;
  hints: number;
  solutions: number;
  aiRequests: number;
  /** Exercises still open after REPEATED_MISTAKES or more wrong answers, where the learner may need a teacher. */
  stuckOn: string[];
  sources: string[];
};

export type UnitRow = {
  lessonId: string;
  title: string;
  learners: number;
  started: number;
  mastered: number;
  /** Mean mastery of the learners who started the unit, 0..1; null when none has. */
  averageMastery: number | null;
  /** The exercise with the most wrong answers across the class, if any. */
  hardest: { label: string; wrong: number; stuck: number } | null;
};

export type TabletRow = {
  id: string;
  label: string;
  learners: number;
  /** This tablet's own records, as opposed to a summary another tablet sent. */
  local: boolean;
  exportedAt: string | null;
  receivedAt: string | null;
};

export type ClassSummary = {
  learners: number;
  attempts: number;
  hints: number;
  aiRequests: number;
  rows: LearnerRow[];
  units: UnitRow[];
  tablets: TabletRow[];
  /** Exercises named in received summaries that this tablet's content does not have. */
  unknownExercises: number;
};

export function classSummary(learners: LearnerInput[], tablets: TabletRow[] = [], unknownExercises = 0): ClassSummary {
  const rows: LearnerRow[] = learners.map(l => ({
    code: l.code,
    lastSeenAt: l.lastSeenAt,
    units: l.progress.map(p => ({ lessonId: p.lessonId, correct: p.correct, total: p.total, status: p.status })),
    correct: l.progress.reduce((n, p) => n + p.correct, 0),
    total: l.progress.reduce((n, p) => n + p.total, 0),
    attempts: l.progress.reduce((n, p) => n + p.attempts, 0),
    hints: l.progress.reduce((n, p) => n + p.hints, 0),
    solutions: l.progress.reduce((n, p) => n + p.solutions, 0),
    aiRequests: l.aiRequests,
    stuckOn: l.progress.flatMap(p => p.exercises.filter(e => !e.correct && e.wrong >= REPEATED_MISTAKES).map(e => e.label)),
    sources: l.sources,
  }));

  const lessonIds = learners[0]?.progress.map(p => p.lessonId) ?? [];
  const units: UnitRow[] = lessonIds.map(id => {
    const per = learners.map(l => l.progress.find(p => p.lessonId === id)).filter((p): p is LessonProgress => !!p);
    const started = per.filter(p => p.status !== 'not-started');
    const wrong = new Map<string, { label: string; wrong: number; stuck: number }>();
    for (const p of per) {
      for (const e of p.exercises) {
        const w = wrong.get(e.exerciseId) ?? { label: e.label, wrong: 0, stuck: 0 };
        w.wrong += e.wrong;
        w.stuck += !e.correct && e.wrong >= REPEATED_MISTAKES ? 1 : 0;
        wrong.set(e.exerciseId, w);
      }
    }
    const hardest = [...wrong.values()].filter(w => w.wrong > 0).sort((a, b) => b.wrong - a.wrong || b.stuck - a.stuck)[0] ?? null;
    return {
      lessonId: id,
      title: per[0]?.title ?? id,
      learners: per.length,
      started: started.length,
      mastered: per.filter(p => p.status === 'mastered').length,
      averageMastery: started.length ? started.reduce((n, p) => n + p.mastery, 0) / started.length : null,
      hardest,
    };
  });

  return {
    learners: rows.length,
    attempts: rows.reduce((n, r) => n + r.attempts, 0),
    hints: rows.reduce((n, r) => n + r.hints, 0),
    aiRequests: rows.reduce((n, r) => n + r.aiRequests, 0),
    rows,
    units,
    tablets,
    unknownExercises,
  };
}

/**
 * The class: this tablet's learners and those of every tablet that has
 * sent its progress, merged by learner code, most recently seen first.
 */
export async function loadClassProgress(db: Executor, lessons: LessonSummary[]): Promise<ClassSummary> {
  const here = tabletLabel();
  const [local, received, refs] = await Promise.all([localSummaries(db, lessons), listReceived(db), lessonRefs(db, lessons)]);
  const merged = mergeLearners([{ label: here, learners: local }, ...received.map(r => ({ label: r.label, learners: r.summary.learners }))]);
  let unknown = 0;
  const inputs: LearnerInput[] = merged.map(m => {
    const { progress, unknown: u } = progressFromSummary(m, refs);
    unknown += u;
    return { code: m.code, lastSeenAt: m.lastSeenAt, progress, aiRequests: m.aiRequests, sources: m.sources };
  });
  const tablets: TabletRow[] = [
    { id: deviceInfo().installId, label: here, learners: local.length, local: true, exportedAt: null, receivedAt: null },
    ...received.map(r => ({ id: r.id, label: r.label, learners: r.summary.learners.length, local: false, exportedAt: r.exportedAt, receivedAt: r.receivedAt })),
  ];
  return classSummary(inputs, tablets, unknown);
}

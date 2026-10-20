/**
 * Progress summaries passed from tablet to tablet, so that a teacher can
 * see a class whose students use different tablets with no network: each
 * student tablet shares one file through Android's share menu (Bluetooth,
 * Quick Share) or a memory card, and the teacher's tablet imports it.
 *
 * A summary carries, per learner code, only counts per exercise (attempts,
 * wrong answers, solved, hints seen, solution opened), the last activity
 * and the number of AI tutor requests: never a typed answer, a tutor's
 * text or a name. This is the "progress summary only" scope decided for
 * synchronization (docs/DECISIONS_AND_RISKS.md); a later sync can send the
 * same document over a network.
 *
 * Pure: no database, no React.
 */

import { recommend, type ExerciseProgress, type LessonProgress, type LessonStatus } from '../learner/progress';

export const SUMMARY_FORMAT = 'offline-tutor-progress';
export const SUMMARY_VERSION = 1;
/** Far above a real class (500 learners × 20 exercises is about 600 kB). */
export const MAX_SUMMARY_BYTES = 2_000_000;

export type ExerciseStat = { id: string; attempts: number; wrong: number; correct: boolean; hintsSeen: number; solutionSeen: boolean };
export type LessonStat = { lessonId: string; lastActivity: string | null; exercises: ExerciseStat[] };
export type LearnerSummary = { code: string; lastSeenAt: string; aiRequests: number; lessons: LessonStat[] };

export type SummaryFile = {
  format: typeof SUMMARY_FORMAT;
  version: typeof SUMMARY_VERSION;
  tablet: { id: string; label: string; deviceModel: string; appVersion: string };
  exportedAt: string;
  content: { packageId: string; version: string }[];
  learners: LearnerSummary[];
};

export function learnerSummary(code: string, lastSeenAt: string, progress: LessonProgress[], aiRequests: number): LearnerSummary {
  return {
    code,
    lastSeenAt,
    aiRequests,
    lessons: progress.map(p => ({
      lessonId: p.lessonId,
      lastActivity: p.lastActivity,
      exercises: p.exercises.map(e => ({
        id: e.exerciseId,
        attempts: e.attempts,
        wrong: e.wrong,
        correct: e.correct,
        hintsSeen: e.hintsSeen,
        solutionSeen: e.solutionSeen,
      })),
    })),
  };
}

/** "OfflineTutor-progress-Tablet-7F3A-20261020-1042.txt": plain text, which every Bluetooth receiver accepts. */
export function summaryFileName(label: string, now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
  return `OfflineTutor-progress-${label.replace(/\s+/g, '-')}-${stamp}.txt`;
}

// ---------------------------------------------------------------------------
// Reading a file another tablet sent: everything is checked, nothing trusted.
// ---------------------------------------------------------------------------

export type ParseResult = { ok: true; summary: SummaryFile } | { ok: false; reason: string };

const CODE = /^[A-Z0-9-]{1,12}$/;
const ID = /^[a-z0-9][a-z0-9.-]{0,63}$/;
const STAMP = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?$/;

class Invalid extends Error {}

function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new Invalid(`${what} is not an object`);
  }
  return v as Record<string, unknown>;
}

function arr(v: unknown, what: string, max: number): unknown[] {
  if (!Array.isArray(v)) {
    throw new Invalid(`${what} is not a list`);
  }
  if (v.length > max) {
    throw new Invalid(`${what} has more than ${max} entries`);
  }
  return v;
}

function str(v: unknown, what: string, max: number, pattern?: RegExp): string {
  if (typeof v !== 'string' || v.length > max || (pattern && !pattern.test(v))) {
    throw new Invalid(`${what} is not valid`);
  }
  return v;
}

function count(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 1_000_000) {
    throw new Invalid(`${what} is not a count`);
  }
  return v;
}

function bool(v: unknown, what: string): boolean {
  if (typeof v !== 'boolean') {
    throw new Invalid(`${what} is not true or false`);
  }
  return v;
}

export function parseSummary(text: string): ParseResult {
  if (text.length > MAX_SUMMARY_BYTES) {
    return { ok: false, reason: 'the file is too large to be a progress file' };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not a progress file from Offline Tutor' };
  }
  try {
    const top = obj(raw, 'the file');
    if (top.format !== SUMMARY_FORMAT) {
      return { ok: false, reason: 'not a progress file from Offline Tutor' };
    }
    if (top.version !== SUMMARY_VERSION) {
      return { ok: false, reason: `made by a different version of the app (format ${String(top.version)}); update both tablets` };
    }
    const t = obj(top.tablet, 'tablet');
    const tablet = {
      id: str(t.id, 'tablet id', 64),
      label: str(t.label, 'tablet name', 40),
      deviceModel: str(t.deviceModel, 'device model', 80),
      appVersion: str(t.appVersion, 'app version', 20),
    };
    if (!tablet.id) {
      throw new Invalid('tablet id is empty');
    }
    const exportedAt = str(top.exportedAt, 'export time', 40, STAMP);
    const content = arr(top.content, 'content', 50).map((c, i) => {
      const o = obj(c, `content ${i + 1}`);
      return { packageId: str(o.packageId, 'package id', 64, ID), version: str(o.version, 'package version', 20) };
    });
    const seen = new Set<string>();
    const learners = arr(top.learners, 'learners', 2000).map((l, i) => {
      const o = obj(l, `learner ${i + 1}`);
      const code = str(o.code, `learner ${i + 1} code`, 12, CODE);
      if (seen.has(code)) {
        throw new Invalid(`learner ${code} appears twice`);
      }
      seen.add(code);
      return {
        code,
        lastSeenAt: str(o.lastSeenAt, `${code} last seen`, 40, STAMP),
        aiRequests: count(o.aiRequests, `${code} tutor requests`),
        lessons: arr(o.lessons, `${code} lessons`, 200).map(ls => {
          const lo = obj(ls, `${code} lesson`);
          return {
            lessonId: str(lo.lessonId, `${code} lesson id`, 64, ID),
            lastActivity: lo.lastActivity === null ? null : str(lo.lastActivity, `${code} last activity`, 40, STAMP),
            exercises: arr(lo.exercises, `${code} exercises`, 500).map(e => {
              const eo = obj(e, `${code} exercise`);
              return {
                id: str(eo.id, `${code} exercise id`, 64, ID),
                attempts: count(eo.attempts, `${code} attempts`),
                wrong: count(eo.wrong, `${code} wrong answers`),
                correct: bool(eo.correct, `${code} solved`),
                hintsSeen: count(eo.hintsSeen, `${code} hints`),
                solutionSeen: bool(eo.solutionSeen, `${code} solution seen`),
              };
            }),
          };
        }),
      };
    });
    return { ok: true, summary: { format: SUMMARY_FORMAT, version: SUMMARY_VERSION, tablet, exportedAt, content, learners } };
  } catch (e) {
    if (e instanceof Invalid) {
      return { ok: false, reason: `the file is damaged: ${e.message}` };
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// One class from several tablets.
// ---------------------------------------------------------------------------

export type SourcedLearner = LearnerSummary & { sources: string[] };

const later = (a: string | null, b: string | null): string | null => (a === null ? b : b === null ? a : a > b ? a : b);

/**
 * The same code on two tablets is the same student who changed tablets:
 * attempts and wrong answers add up, an exercise solved on either tablet
 * is solved, and the latest activity wins.
 */
export function mergeLearners(groups: { label: string; learners: LearnerSummary[] }[]): SourcedLearner[] {
  const byCode = new Map<string, SourcedLearner>();
  for (const g of groups) {
    for (const l of g.learners) {
      const cur = byCode.get(l.code);
      if (!cur) {
        byCode.set(l.code, { ...l, lessons: l.lessons.map(x => ({ ...x, exercises: x.exercises.map(e => ({ ...e })) })), sources: [g.label] });
        continue;
      }
      cur.lastSeenAt = later(cur.lastSeenAt, l.lastSeenAt) as string;
      cur.aiRequests += l.aiRequests;
      if (!cur.sources.includes(g.label)) {
        cur.sources.push(g.label);
      }
      for (const ls of l.lessons) {
        const mine = cur.lessons.find(x => x.lessonId === ls.lessonId);
        if (!mine) {
          cur.lessons.push({ ...ls, exercises: ls.exercises.map(e => ({ ...e })) });
          continue;
        }
        mine.lastActivity = later(mine.lastActivity, ls.lastActivity);
        for (const e of ls.exercises) {
          const me = mine.exercises.find(x => x.id === e.id);
          if (!me) {
            mine.exercises.push({ ...e });
            continue;
          }
          me.attempts += e.attempts;
          me.wrong += e.wrong;
          me.correct = me.correct || e.correct;
          me.hintsSeen = Math.max(me.hintsSeen, e.hintsSeen);
          me.solutionSeen = me.solutionSeen || e.solutionSeen;
        }
      }
    }
  }
  return [...byCode.values()].sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : a.lastSeenAt > b.lastSeenAt ? -1 : a.code.localeCompare(b.code)));
}

export type LessonRefs = { id: string; title: string; exercises: { id: string; label: string }[] }[];

/**
 * A learner's progress in this tablet's lessons, rebuilt from a summary.
 * Exercises the summary names but this tablet's content does not have
 * (another content version) are counted in `unknown` and left out.
 */
export function progressFromSummary(l: LearnerSummary, lessons: LessonRefs): { progress: LessonProgress[]; unknown: number } {
  const known = new Set(lessons.flatMap(x => x.exercises.map(e => e.id)));
  const unknown = l.lessons.flatMap(x => x.exercises).filter(e => !known.has(e.id)).length;
  const progress = lessons.map(lesson => {
    const stat = l.lessons.find(x => x.lessonId === lesson.id);
    const exercises: ExerciseProgress[] = lesson.exercises.map(ex => {
      const e = stat?.exercises.find(x => x.id === ex.id);
      return {
        exerciseId: ex.id,
        label: ex.label,
        attempts: e?.attempts ?? 0,
        wrong: e?.wrong ?? 0,
        correct: e?.correct ?? false,
        hintsSeen: e?.hintsSeen ?? 0,
        solutionSeen: e?.solutionSeen ?? false,
      };
    });
    const correct = exercises.filter(e => e.correct).length;
    const attempted = exercises.filter(e => e.attempts > 0).length;
    const hints = exercises.reduce((n, e) => n + e.hintsSeen, 0);
    const solutions = exercises.filter(e => e.solutionSeen).length;
    const total = exercises.length;
    const status: LessonStatus =
      total > 0 && correct === total ? 'mastered' : attempted > 0 || hints > 0 || solutions > 0 ? 'in-progress' : 'not-started';
    return {
      lessonId: lesson.id,
      title: lesson.title,
      total,
      attempted,
      correct,
      attempts: exercises.reduce((n, e) => n + e.attempts, 0),
      hints,
      solutions,
      mastery: total === 0 ? 0 : correct / total,
      status,
      lastActivity: stat?.lastActivity ?? null,
      exercises,
      next: recommend(exercises),
    };
  });
  return { progress, unknown };
}

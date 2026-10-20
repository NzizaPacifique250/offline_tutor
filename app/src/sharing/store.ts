/**
 * The teacher's tablet keeps the newest summary each other tablet sent, one
 * row per tablet, so importing the same file twice changes nothing and an
 * older file never replaces a newer one. This tablet's own learners are
 * summarised from its records on demand, never stored as a summary.
 */

import type { ContentVersion, LessonSummary } from '../content/service';
import { getExercises } from '../content/service';
import { countOutcomes } from '../guidance/log';
import { loadProgress } from '../learner/session';
import { listLearners, type Executor } from '../learner/store';
import {
  learnerSummary,
  SUMMARY_FORMAT,
  SUMMARY_VERSION,
  type LearnerSummary,
  type LessonRefs,
  type SummaryFile,
} from './summary';

export const SHARING_SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS received_progress (
     tablet_id    TEXT PRIMARY KEY,
     tablet_label TEXT NOT NULL,
     exported_at  TEXT NOT NULL,
     received_at  TEXT NOT NULL DEFAULT (datetime('now')),
     learners     INTEGER NOT NULL,
     payload      TEXT NOT NULL
   )`,
];

export async function ensureSharingSchema(db: Executor): Promise<void> {
  for (const sql of SHARING_SCHEMA) {
    await db.execute(sql);
  }
}

/** Every learner on this tablet as a summary, most recently seen first. */
export async function localSummaries(db: Executor, lessons: LessonSummary[]): Promise<LearnerSummary[]> {
  const out: LearnerSummary[] = [];
  for (const l of await listLearners(db)) {
    const [progress, outcomes] = await Promise.all([loadProgress(db, l.code, lessons), countOutcomes(db, l.code)]);
    out.push(learnerSummary(l.code, l.lastSeenAt, progress, outcomes.generated + outcomes.cancelled + outcomes['timed-out'] + outcomes.failed));
  }
  return out;
}

export async function buildSummaryFile(
  db: Executor,
  lessons: LessonSummary[],
  versions: ContentVersion[],
  tablet: SummaryFile['tablet'],
  now = new Date(),
): Promise<SummaryFile> {
  return {
    format: SUMMARY_FORMAT,
    version: SUMMARY_VERSION,
    tablet,
    exportedAt: now.toISOString(),
    content: versions.map(v => ({ packageId: v.packageId, version: v.version })),
    learners: await localSummaries(db, lessons),
  };
}

/** This tablet's lessons and their exercises, to rebuild progress from summaries. */
export async function lessonRefs(db: Executor, lessons: LessonSummary[]): Promise<LessonRefs> {
  const out: LessonRefs = [];
  for (const l of lessons) {
    const qs = await getExercises(db, l.id);
    out.push({ id: l.id, title: l.title, exercises: qs.map(q => ({ id: q.id, label: q.source_label })) });
  }
  return out;
}

export type SaveOutcome = 'added' | 'updated' | 'same' | 'older' | 'own';

export async function saveReceived(db: Executor, s: SummaryFile, ownInstallId: string): Promise<SaveOutcome> {
  if (s.tablet.id === ownInstallId) {
    return 'own';
  }
  const res = await db.execute('SELECT exported_at FROM received_progress WHERE tablet_id = ?', [s.tablet.id]);
  const prev = res.rows[0] ? String(res.rows[0].exported_at) : null;
  if (prev !== null && prev === s.exportedAt) {
    return 'same';
  }
  if (prev !== null && prev > s.exportedAt) {
    return 'older';
  }
  await db.execute(
    `INSERT INTO received_progress (tablet_id, tablet_label, exported_at, learners, payload)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(tablet_id) DO UPDATE SET
       tablet_label = excluded.tablet_label, exported_at = excluded.exported_at,
       received_at = datetime('now'), learners = excluded.learners, payload = excluded.payload`,
    [s.tablet.id, s.tablet.label, s.exportedAt, s.learners.length, JSON.stringify(s)],
  );
  return prev === null ? 'added' : 'updated';
}

export type ReceivedTablet = { id: string; label: string; exportedAt: string; receivedAt: string; summary: SummaryFile };

export async function listReceived(db: Executor): Promise<ReceivedTablet[]> {
  const res = await db.execute('SELECT tablet_id, tablet_label, exported_at, received_at, payload FROM received_progress ORDER BY tablet_label');
  const out: ReceivedTablet[] = [];
  for (const r of res.rows) {
    try {
      out.push({
        id: String(r.tablet_id),
        label: String(r.tablet_label),
        exportedAt: String(r.exported_at),
        receivedAt: String(r.received_at),
        summary: JSON.parse(String(r.payload)) as SummaryFile,
      });
    } catch {
      // A row this app wrote itself cannot be malformed; skip it rather than fail the class view.
    }
  }
  return out;
}

export async function removeReceived(db: Executor, tabletId: string): Promise<void> {
  await db.execute('DELETE FROM received_progress WHERE tablet_id = ?', [tabletId]);
}

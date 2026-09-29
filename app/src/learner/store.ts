/**
 * Learner records: the learner-profile manager's storage (ARCHITECTURE.md).
 *
 * Everything a study session produces is written here, in the same SQLite
 * database as the content: which learner code is active, one session per
 * launch, every attempt with its verdict, and every hint or solution reveal.
 * Progress is never stored; it is computed from these rows (progress.ts), so
 * there is nothing to get out of step.
 *
 * A learner code is a short label such as "A1", not a name. The pilot stores
 * no personal data.
 *
 * P2 left a developer table called `attempts` with a different shape. It is
 * renamed on first run so that its rows, and the storage regression check
 * that counts them, survive.
 */

import type { DB } from '@op-engineering/op-sqlite';
import type { Verdict } from '../checker/check';

export type Executor = { execute: DB['execute'] };

export const LEARNER_SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS learners (
     code         TEXT PRIMARY KEY,
     created_at   TEXT NOT NULL DEFAULT (datetime('now')),
     last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE TABLE IF NOT EXISTS sessions (
     id               INTEGER PRIMARY KEY AUTOINCREMENT,
     learner_code     TEXT NOT NULL,
     content_versions TEXT NOT NULL,
     started_at       TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE TABLE IF NOT EXISTS attempts (
     id           INTEGER PRIMARY KEY AUTOINCREMENT,
     learner_code TEXT NOT NULL,
     session_id   INTEGER NOT NULL,
     lesson_id    TEXT NOT NULL,
     exercise_id  TEXT NOT NULL,
     answer       TEXT NOT NULL,
     verdict      TEXT NOT NULL,
     hints_seen   INTEGER NOT NULL,
     created_at   TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE TABLE IF NOT EXISTS reveals (
     id           INTEGER PRIMARY KEY AUTOINCREMENT,
     learner_code TEXT NOT NULL,
     session_id   INTEGER NOT NULL,
     lesson_id    TEXT NOT NULL,
     exercise_id  TEXT NOT NULL,
     kind         TEXT NOT NULL,
     hint_index   INTEGER,
     created_at   TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  'CREATE INDEX IF NOT EXISTS idx_attempts_learner ON attempts(learner_code, id)',
  'CREATE INDEX IF NOT EXISTS idx_reveals_learner ON reveals(learner_code, id)',
];

/** The P2 developer table, renamed out of the way. storage.ts reads it. */
export const DEV_STORAGE_TABLE = 'dev_storage_check';

async function columns(db: Executor, table: string): Promise<string[]> {
  const res = await db.execute(`PRAGMA table_info(${table})`);
  return res.rows.map(r => String(r.name));
}

export async function ensureLearnerSchema(db: Executor): Promise<{ migratedDevTable: boolean }> {
  let migratedDevTable = false;
  const legacy = await columns(db, 'attempts');
  if (legacy.includes('probe')) {
    await db.execute(`ALTER TABLE attempts RENAME TO ${DEV_STORAGE_TABLE}`);
    migratedDevTable = true;
  }
  for (const statement of LEARNER_SCHEMA) {
    await db.execute(statement);
  }
  return { migratedDevTable };
}

export type Learner = { code: string; createdAt: string; lastSeenAt: string };

/** Upper-case letters, digits and hyphens, 1 to 12 characters. */
export function normaliseCode(raw: string): string | null {
  const code = raw.trim().toUpperCase().replace(/\s+/g, '-');
  return /^[A-Z0-9-]{1,12}$/.test(code) ? code : null;
}

export async function listLearners(db: Executor): Promise<Learner[]> {
  const res = await db.execute('SELECT code, created_at, last_seen_at FROM learners ORDER BY last_seen_at DESC, code');
  return res.rows.map(r => ({ code: String(r.code), createdAt: String(r.created_at), lastSeenAt: String(r.last_seen_at) }));
}

/** Create the learner if new; otherwise mark them seen now. */
export async function touchLearner(db: Executor, code: string): Promise<Learner> {
  await db.execute(
    `INSERT INTO learners (code) VALUES (?)
     ON CONFLICT(code) DO UPDATE SET last_seen_at = datetime('now')`,
    [code],
  );
  const res = await db.execute('SELECT code, created_at, last_seen_at FROM learners WHERE code = ?', [code]);
  const r = res.rows[0];
  return { code: String(r.code), createdAt: String(r.created_at), lastSeenAt: String(r.last_seen_at) };
}

export async function startSession(db: Executor, code: string, contentVersions: string): Promise<number> {
  const res = await db.execute('INSERT INTO sessions (learner_code, content_versions) VALUES (?, ?)', [code, contentVersions]);
  return Number(res.insertId);
}

export type AttemptRecord = {
  id: number;
  learnerCode: string;
  sessionId: number;
  lessonId: string;
  exerciseId: string;
  answer: string;
  verdict: Verdict;
  hintsSeen: number;
  createdAt: string;
};

export type NewAttempt = Omit<AttemptRecord, 'id' | 'createdAt'>;

export async function recordAttempt(db: Executor, a: NewAttempt): Promise<number> {
  const res = await db.execute(
    `INSERT INTO attempts (learner_code, session_id, lesson_id, exercise_id, answer, verdict, hints_seen)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [a.learnerCode, a.sessionId, a.lessonId, a.exerciseId, a.answer, a.verdict, a.hintsSeen],
  );
  return Number(res.insertId);
}

export async function listAttempts(db: Executor, code: string): Promise<AttemptRecord[]> {
  const res = await db.execute('SELECT * FROM attempts WHERE learner_code = ? ORDER BY id', [code]);
  return res.rows.map(r => ({
    id: Number(r.id),
    learnerCode: String(r.learner_code),
    sessionId: Number(r.session_id),
    lessonId: String(r.lesson_id),
    exerciseId: String(r.exercise_id),
    answer: String(r.answer),
    verdict: String(r.verdict) as Verdict,
    hintsSeen: Number(r.hints_seen),
    createdAt: String(r.created_at),
  }));
}

export type RevealKind = 'hint' | 'solution';

export type RevealRecord = {
  id: number;
  learnerCode: string;
  sessionId: number;
  lessonId: string;
  exerciseId: string;
  kind: RevealKind;
  hintIndex: number | null;
  createdAt: string;
};

export type NewReveal = Omit<RevealRecord, 'id' | 'createdAt'>;

export async function recordReveal(db: Executor, r: NewReveal): Promise<number> {
  const res = await db.execute(
    `INSERT INTO reveals (learner_code, session_id, lesson_id, exercise_id, kind, hint_index)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [r.learnerCode, r.sessionId, r.lessonId, r.exerciseId, r.kind, r.hintIndex],
  );
  return Number(res.insertId);
}

export async function listReveals(db: Executor, code: string): Promise<RevealRecord[]> {
  const res = await db.execute('SELECT * FROM reveals WHERE learner_code = ? ORDER BY id', [code]);
  return res.rows.map(r => ({
    id: Number(r.id),
    learnerCode: String(r.learner_code),
    sessionId: Number(r.session_id),
    lessonId: String(r.lesson_id),
    exerciseId: String(r.exercise_id),
    kind: String(r.kind) as RevealKind,
    hintIndex: r.hint_index === null || r.hint_index === undefined ? null : Number(r.hint_index),
    createdAt: String(r.created_at),
  }));
}

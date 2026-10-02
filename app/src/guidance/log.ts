/**
 * Every guidance request is recorded with its outcome, kept apart from
 * attempts and reveals so that generated, stored, declined, cancelled,
 * timed-out, failed and no-model outcomes can be counted separately
 * (ARCHITECTURE.md, control flow step 6).
 */

import type { Executor } from '../learner/store';

export type GuidanceOutcome = 'generated' | 'stored' | 'declined' | 'cancelled' | 'timed-out' | 'failed' | 'no-model';

export const GUIDANCE_OUTCOMES: GuidanceOutcome[] = ['generated', 'stored', 'declined', 'cancelled', 'timed-out', 'failed', 'no-model'];

export const GUIDANCE_SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS guidance_events (
     id               INTEGER PRIMARY KEY AUTOINCREMENT,
     learner_code     TEXT NOT NULL,
     session_id       INTEGER NOT NULL,
     lesson_id        TEXT,
     exercise_id      TEXT,
     question         TEXT NOT NULL,
     outcome          TEXT NOT NULL,
     text             TEXT NOT NULL,
     prompt_tokens    INTEGER,
     generated_tokens INTEGER,
     first_token_ms   INTEGER,
     total_ms         INTEGER,
     created_at       TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  'CREATE INDEX IF NOT EXISTS idx_guidance_learner ON guidance_events(learner_code, id)',
];

export async function ensureGuidanceSchema(db: Executor): Promise<void> {
  for (const s of GUIDANCE_SCHEMA) {
    await db.execute(s);
  }
}

export type GuidanceEvent = {
  id: number;
  learnerCode: string;
  sessionId: number;
  lessonId: string | null;
  exerciseId: string | null;
  question: string;
  outcome: GuidanceOutcome;
  text: string;
  promptTokens: number | null;
  generatedTokens: number | null;
  firstTokenMs: number | null;
  totalMs: number | null;
  createdAt: string;
};

export type NewGuidanceEvent = Omit<GuidanceEvent, 'id' | 'createdAt'>;

export async function recordGuidance(db: Executor, e: NewGuidanceEvent): Promise<number> {
  const res = await db.execute(
    `INSERT INTO guidance_events (learner_code, session_id, lesson_id, exercise_id, question, outcome, text,
                                  prompt_tokens, generated_tokens, first_token_ms, total_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [e.learnerCode, e.sessionId, e.lessonId, e.exerciseId, e.question, e.outcome, e.text, e.promptTokens, e.generatedTokens, e.firstTokenMs, e.totalMs],
  );
  return Number(res.insertId);
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function listGuidance(db: Executor, learnerCode: string): Promise<GuidanceEvent[]> {
  const res = await db.execute('SELECT * FROM guidance_events WHERE learner_code = ? ORDER BY id', [learnerCode]);
  return res.rows.map(r => ({
    id: Number(r.id),
    learnerCode: String(r.learner_code),
    sessionId: Number(r.session_id),
    lessonId: r.lesson_id === null || r.lesson_id === undefined ? null : String(r.lesson_id),
    exerciseId: r.exercise_id === null || r.exercise_id === undefined ? null : String(r.exercise_id),
    question: String(r.question),
    outcome: String(r.outcome) as GuidanceOutcome,
    text: String(r.text),
    promptTokens: num(r.prompt_tokens),
    generatedTokens: num(r.generated_tokens),
    firstTokenMs: num(r.first_token_ms),
    totalMs: num(r.total_ms),
    createdAt: String(r.created_at),
  }));
}

export type OutcomeCounts = Record<GuidanceOutcome, number>;

export async function countOutcomes(db: Executor, learnerCode: string): Promise<OutcomeCounts> {
  const res = await db.execute('SELECT outcome, COUNT(*) AS n FROM guidance_events WHERE learner_code = ? GROUP BY outcome', [learnerCode]);
  const counts = Object.fromEntries(GUIDANCE_OUTCOMES.map(o => [o, 0])) as OutcomeCounts;
  for (const r of res.rows) {
    const o = String(r.outcome) as GuidanceOutcome;
    if (o in counts) {
      counts[o] = Number(r.n);
    }
  }
  return counts;
}

/** "2 generated, 1 stored, 1 declined" with zero counts left out. */
export function summariseOutcomes(c: OutcomeCounts): string {
  const parts = GUIDANCE_OUTCOMES.filter(o => c[o] > 0).map(o => `${c[o]} ${o.replace('-', ' ')}`);
  return parts.length ? parts.join(', ') : 'none yet';
}

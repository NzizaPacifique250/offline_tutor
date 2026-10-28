/**
 * The sync engine: copies each account's learner records from this tablet's
 * SQLite to Supabase when there is a connection.
 *
 * The tablet stays the source of truth and never waits for the network.
 * Rows are upserted by (device_id, local_id), so a row sent twice changes
 * nothing; per account and table, sync_marks holds the highest local id
 * already sent, so each run sends only what is new. A learner row is sent
 * whole every time, because its last_seen_at changes. Only accounts whose
 * sync switch is on are synced, and only the rows filed under their own
 * learner code. Any failure leaves the marks where they were, so the next
 * run sends the same rows again.
 *
 * The remote side is an interface (sync/supabase.ts implements it).
 */

import { getMark, listAccounts, recordSync, setMark, setRefreshToken, type Account } from '../account/store';
import type { Executor } from '../learner/store';
import { SYNC_BATCH } from './config';

export type SyncRemote = {
  /** Resume an account's session; resolves with its user id and the rotated refresh token. */
  resume(refreshToken: string): Promise<{ userId: string; refreshToken: string }>;
  upsert(table: string, rows: Record<string, unknown>[], onConflict: string): Promise<void>;
};

export type Device = { id: string; label: string; model: string; appVersion: string; content: string };

export type SyncReport = { userId: string; email: string; sent: Record<string, number>; error: string | null };

/** SQLite's datetime('now') text, which is UTC, as an ISO timestamp. */
export function isoUtc(sqlite: unknown): string {
  const s = String(sqlite);
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? `${s.replace(' ', 'T')}Z` : s;
}

type Mapper = (r: Record<string, unknown>) => Record<string, unknown>;

/** The append-only tables, in the order they are sent, and how a row maps to Supabase. */
const EVENT_TABLES: { table: string; columns: string; map: Mapper }[] = [
  {
    table: 'sessions',
    columns: 'id, learner_code, content_versions, started_at',
    map: r => ({ learner_code: r.learner_code, content_versions: r.content_versions, started_at: isoUtc(r.started_at) }),
  },
  {
    table: 'attempts',
    columns: 'id, learner_code, session_id, lesson_id, exercise_id, answer, verdict, hints_seen, created_at',
    map: r => ({
      learner_code: r.learner_code,
      session_id: Number(r.session_id),
      lesson_id: r.lesson_id,
      exercise_id: r.exercise_id,
      answer: r.answer,
      verdict: r.verdict,
      hints_seen: Number(r.hints_seen),
      created_at: isoUtc(r.created_at),
    }),
  },
  {
    table: 'reveals',
    columns: 'id, learner_code, session_id, lesson_id, exercise_id, kind, hint_index, created_at',
    map: r => ({
      learner_code: r.learner_code,
      session_id: Number(r.session_id),
      lesson_id: r.lesson_id,
      exercise_id: r.exercise_id,
      kind: r.kind,
      hint_index: r.hint_index === null || r.hint_index === undefined ? null : Number(r.hint_index),
      created_at: isoUtc(r.created_at),
    }),
  },
  {
    table: 'guidance_events',
    columns:
      'id, learner_code, session_id, lesson_id, exercise_id, question, outcome, text, prompt_tokens, generated_tokens, first_token_ms, total_ms, created_at',
    map: r => {
      const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
      return {
        learner_code: r.learner_code,
        session_id: Number(r.session_id),
        lesson_id: r.lesson_id ?? null,
        exercise_id: r.exercise_id ?? null,
        question: r.question,
        outcome: r.outcome,
        text: r.text,
        prompt_tokens: n(r.prompt_tokens),
        generated_tokens: n(r.generated_tokens),
        first_token_ms: n(r.first_token_ms),
        total_ms: n(r.total_ms),
        created_at: isoUtc(r.created_at),
      };
    },
  },
];

export async function syncAccount(db: Executor, remote: SyncRemote, device: Device, account: Account): Promise<SyncReport> {
  const sent: Record<string, number> = {};
  const report = (error: string | null): SyncReport => ({ userId: account.userId, email: account.email, sent, error });
  if (!account.refreshToken) {
    const error = 'Sign in online once to sync this account.';
    await recordSync(db, account.userId, error);
    return report(error);
  }
  const s = await remote.resume(account.refreshToken);
  await setRefreshToken(db, account.userId, s.refreshToken);
  const userId = s.userId;

  await remote.upsert(
    'devices',
    [{ id: device.id, label: device.label, model: device.model, app_version: device.appVersion, content: device.content, last_sync_at: new Date().toISOString(), last_user: userId }],
    'id',
  );

  const learners = await db.execute('SELECT code, created_at, last_seen_at FROM learners WHERE code = ?', [account.learnerCode]);
  if (learners.rows.length) {
    await remote.upsert(
      'learners',
      learners.rows.map(r => ({ device_id: device.id, code: r.code, user_id: userId, created_at: isoUtc(r.created_at), last_seen_at: isoUtc(r.last_seen_at) })),
      'device_id,code',
    );
    sent.learners = learners.rows.length;
  }

  for (const t of EVENT_TABLES) {
    let mark = await getMark(db, account.userId, t.table);
    sent[t.table] = 0;
    for (;;) {
      const res = await db.execute(`SELECT ${t.columns} FROM ${t.table} WHERE learner_code = ? AND id > ? ORDER BY id LIMIT ?`, [
        account.learnerCode,
        mark,
        SYNC_BATCH,
      ]);
      if (!res.rows.length) {
        break;
      }
      await remote.upsert(
        t.table,
        res.rows.map(r => ({ device_id: device.id, local_id: Number(r.id), user_id: userId, ...t.map(r) })),
        'device_id,local_id',
      );
      mark = Number(res.rows[res.rows.length - 1].id);
      await setMark(db, account.userId, t.table, mark);
      sent[t.table] += res.rows.length;
    }
  }
  await recordSync(db, account.userId, null);
  return report(null);
}

/** Sync every account on this tablet that has switched sync on, one after another. */
export async function syncAll(db: Executor, remote: SyncRemote, device: Device): Promise<SyncReport[]> {
  const reports: SyncReport[] = [];
  for (const account of (await listAccounts(db)).filter(a => a.syncEnabled)) {
    try {
      reports.push(await syncAccount(db, remote, device, account));
    } catch (e) {
      const error = (e as Error).message || String(e);
      await recordSync(db, account.userId, error);
      reports.push({ userId: account.userId, email: account.email, sent: {}, error });
    }
  }
  return reports;
}

/**
 * Accounts that have signed in on this tablet, and how far each one's
 * records have been synced.
 *
 * An account row is written when the account signs in online and holds what
 * the tablet needs afterwards with no internet: the role and learner code
 * from its profile, the offline password hash (account/password.ts), and the
 * refresh token the sync engine resumes the account's session with. The
 * token sits in the app's private storage, like the learner records; the
 * records themselves are not encrypted either (RELEASE_V1.md, known issues).
 */

import type { Executor } from '../learner/store';

export type Role = 'student' | 'teacher' | 'admin';

export type Account = {
  userId: string;
  email: string;
  fullName: string;
  role: Role;
  requestedRole: 'student' | 'teacher';
  learnerCode: string;
  passwordHash: string;
  refreshToken: string | null;
  syncEnabled: boolean;
  lastOnlineAt: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
};

export const ACCOUNT_SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS accounts (
     user_id         TEXT PRIMARY KEY,
     email           TEXT NOT NULL UNIQUE,
     full_name       TEXT NOT NULL,
     role            TEXT NOT NULL,
     requested_role  TEXT NOT NULL,
     learner_code    TEXT NOT NULL,
     password_hash   TEXT NOT NULL,
     refresh_token   TEXT,
     sync_enabled    INTEGER NOT NULL DEFAULT 0,
     last_online_at  TEXT,
     last_sync_at    TEXT,
     last_sync_error TEXT
   )`,
  // The highest local id of each table already sent for each account.
  `CREATE TABLE IF NOT EXISTS sync_marks (
     user_id       TEXT NOT NULL,
     table_name    TEXT NOT NULL,
     last_local_id INTEGER NOT NULL,
     PRIMARY KEY (user_id, table_name)
   )`,
];

export async function ensureAccountSchema(db: Executor): Promise<void> {
  for (const sql of ACCOUNT_SCHEMA) {
    await db.execute(sql);
  }
}

export function isStaff(a: Pick<Account, 'role'> | null | undefined): boolean {
  return a?.role === 'teacher' || a?.role === 'admin';
}

function toAccount(r: Record<string, unknown>): Account {
  const text = (v: unknown) => (v === null || v === undefined ? null : String(v));
  return {
    userId: String(r.user_id),
    email: String(r.email),
    fullName: String(r.full_name),
    role: String(r.role) as Role,
    requestedRole: String(r.requested_role) as Account['requestedRole'],
    learnerCode: String(r.learner_code),
    passwordHash: String(r.password_hash),
    refreshToken: text(r.refresh_token),
    syncEnabled: Number(r.sync_enabled) === 1,
    lastOnlineAt: text(r.last_online_at),
    lastSyncAt: text(r.last_sync_at),
    lastSyncError: text(r.last_sync_error),
  };
}

/** Insert or refresh an account after an online sign-in; the sync switch is kept. */
export async function saveAccount(
  db: Executor,
  a: Omit<Account, 'syncEnabled' | 'lastOnlineAt' | 'lastSyncAt' | 'lastSyncError'>,
): Promise<Account> {
  await db.execute(
    `INSERT INTO accounts (user_id, email, full_name, role, requested_role, learner_code, password_hash, refresh_token, last_online_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       email = excluded.email, full_name = excluded.full_name, role = excluded.role,
       requested_role = excluded.requested_role, learner_code = excluded.learner_code,
       password_hash = excluded.password_hash, refresh_token = excluded.refresh_token,
       last_online_at = excluded.last_online_at`,
    [a.userId, a.email.toLowerCase(), a.fullName, a.role, a.requestedRole, a.learnerCode, a.passwordHash, a.refreshToken],
  );
  return (await getAccount(db, a.userId))!;
}

export async function getAccount(db: Executor, userId: string): Promise<Account | null> {
  const res = await db.execute('SELECT * FROM accounts WHERE user_id = ?', [userId]);
  return res.rows.length ? toAccount(res.rows[0]) : null;
}

export async function findAccountByEmail(db: Executor, email: string): Promise<Account | null> {
  const res = await db.execute('SELECT * FROM accounts WHERE email = ?', [email.trim().toLowerCase()]);
  return res.rows.length ? toAccount(res.rows[0]) : null;
}

/** Accounts used on this tablet, most recently online first. */
export async function listAccounts(db: Executor): Promise<Account[]> {
  const res = await db.execute('SELECT * FROM accounts ORDER BY last_online_at DESC, email');
  return res.rows.map(toAccount);
}

export async function setSyncEnabled(db: Executor, userId: string, on: boolean): Promise<void> {
  await db.execute('UPDATE accounts SET sync_enabled = ? WHERE user_id = ?', [on ? 1 : 0, userId]);
}

export async function setRefreshToken(db: Executor, userId: string, token: string | null): Promise<void> {
  await db.execute('UPDATE accounts SET refresh_token = ? WHERE user_id = ?', [token, userId]);
}

export async function recordSync(db: Executor, userId: string, error: string | null): Promise<void> {
  if (error) {
    await db.execute('UPDATE accounts SET last_sync_error = ? WHERE user_id = ?', [error, userId]);
  } else {
    await db.execute("UPDATE accounts SET last_sync_at = datetime('now'), last_sync_error = NULL WHERE user_id = ?", [userId]);
  }
}

export async function getMark(db: Executor, userId: string, table: string): Promise<number> {
  const res = await db.execute('SELECT last_local_id FROM sync_marks WHERE user_id = ? AND table_name = ?', [userId, table]);
  return res.rows.length ? Number(res.rows[0].last_local_id) : 0;
}

export async function setMark(db: Executor, userId: string, table: string, lastLocalId: number): Promise<void> {
  await db.execute(
    `INSERT INTO sync_marks (user_id, table_name, last_local_id) VALUES (?, ?, ?)
     ON CONFLICT(user_id, table_name) DO UPDATE SET last_local_id = excluded.last_local_id`,
    [userId, table, lastLocalId],
  );
}

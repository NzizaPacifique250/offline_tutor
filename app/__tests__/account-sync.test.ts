/**
 * Accounts and sync without a network: sign-in online and then offline from
 * the tablet's hash, account creation, and the sync engine sending each
 * account's rows once, mapped to the Supabase columns, over real SQLite
 * (sql.js) with fake servers.
 */

import { AuthError, OfflineError, codeFor, signIn, signUp, type AuthRemote } from '../src/account/auth';
import { hashPassword, verifyPassword } from '../src/account/password';
import { ensureAccountSchema, getAccount, getMark, listAccounts, setSyncEnabled } from '../src/account/store';
import { ensureGuidanceSchema, recordGuidance } from '../src/guidance/log';
import { ensureLearnerSchema, recordAttempt, recordReveal, startSession, touchLearner } from '../src/learner/store';
import { isoUtc, syncAll, type Device, type SyncRemote } from '../src/sync/engine';

const { makeSqlDb } = require('../jest/sqljs-db');

const USER = '0a1b2c3d-4e5f-6789-abcd-ef0123456789';
const CODE = 'S-0A1B2C';
const device: Device = { id: 'install-1', label: 'Tablet 1A2B', model: 'IT-801B', appVersion: '1.3.0', content: 'rw-s6-am.u1 v0.2.0' };

function fakeAuth(over: Partial<AuthRemote> = {}): AuthRemote & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async signUp(email, _p, meta) {
      calls.push(`signUp ${email} ${meta.requestedRole}`);
      return { userId: USER, refreshToken: 'r0' };
    },
    async signIn(email, password) {
      calls.push(`signIn ${email}`);
      if (password !== 'correct horse') {
        throw new AuthError('Wrong email or password.');
      }
      return { userId: USER, refreshToken: 'r1' };
    },
    async profile() {
      return { role: 'student', requestedRole: 'student', fullName: 'Aline', learnerCode: CODE };
    },
    ...over,
  };
}

const offlineAuth = (): AuthRemote =>
  fakeAuth({
    async signIn() {
      throw new OfflineError('No internet connection.');
    },
    async signUp() {
      throw new OfflineError('No internet connection.');
    },
  });

async function freshDb() {
  const db = await makeSqlDb();
  await ensureLearnerSchema(db);
  await ensureGuidanceSchema(db);
  await ensureAccountSchema(db);
  return db;
}

describe('offline password check', () => {
  it('accepts the right password only, and never stores it', () => {
    const stored = hashPassword('correct horse', 'abc123', 50);
    expect(stored).toMatch(/^pbkdf2-sha256\$50\$abc123\$[0-9a-f]{64}$/);
    expect(stored).not.toContain('correct horse');
    expect(verifyPassword('correct horse', stored)).toBe(true);
    expect(verifyPassword('correct horsf', stored)).toBe(false);
    expect(verifyPassword('correct horse', 'garbage')).toBe(false);
  });

  it('gives two hashes of one password different salts', () => {
    expect(hashPassword('pw', undefined, 10)).not.toBe(hashPassword('pw', undefined, 10));
  });
});

describe('sign-in', () => {
  it('signs in online, keeps the profile, and then signs in offline from the tablet', async () => {
    const db = await freshDb();
    const first = await signIn(db, fakeAuth(), '  Aline@Example.com ', 'correct horse');
    expect(first.online).toBe(true);
    expect(first.account).toMatchObject({ userId: USER, email: 'aline@example.com', learnerCode: CODE, role: 'student', refreshToken: 'r1', syncEnabled: false });

    const later = await signIn(db, offlineAuth(), 'aline@example.com', 'correct horse');
    expect(later).toMatchObject({ online: false, account: { userId: USER } });
    await expect(signIn(db, offlineAuth(), 'aline@example.com', 'wrong')).rejects.toThrow('Wrong email or password.');
    db.close();
  });

  it('refuses an account never seen on this tablet while offline', async () => {
    const db = await freshDb();
    await expect(signIn(db, offlineAuth(), 'new@example.com', 'whatever1')).rejects.toThrow('has not signed in on this tablet before');
    db.close();
  });

  it('passes on a wrong password from the server without trying the tablet', async () => {
    const db = await freshDb();
    await signIn(db, fakeAuth(), 'aline@example.com', 'correct horse');
    await expect(signIn(db, fakeAuth(), 'aline@example.com', 'nope')).rejects.toThrow('Wrong email or password.');
    db.close();
  });

  it('falls back to the server trigger code when the profile cannot be read', async () => {
    const db = await freshDb();
    const r = await signIn(db, fakeAuth({ profile: async () => null }), 'aline@example.com', 'correct horse');
    expect(r.account.learnerCode).toBe(codeFor(USER, 'student'));
    expect(codeFor(USER, 'teacher')).toBe('T-0A1B2C');
    db.close();
  });
});

describe('creating an account', () => {
  it('checks the form before asking the server', async () => {
    const db = await freshDb();
    const auth = fakeAuth();
    await expect(signUp(db, auth, { email: 'a@b.co', password: 'short', fullName: 'A', requestedRole: 'student' })).rejects.toThrow('at least 8');
    await expect(signUp(db, auth, { email: 'not-an-email', password: 'long enough', fullName: 'A', requestedRole: 'student' })).rejects.toThrow('valid email');
    await expect(signUp(db, auth, { email: 'a@b.co', password: 'long enough', fullName: ' ', requestedRole: 'student' })).rejects.toThrow('your name');
    expect(auth.calls).toEqual([]);
    db.close();
  });

  it('keeps a new account, or reports that the email must be confirmed first', async () => {
    const db = await freshDb();
    const r = await signUp(db, fakeAuth(), { email: 'aline@example.com', password: 'correct horse', fullName: 'Aline', requestedRole: 'teacher' });
    expect(r.kind).toBe('signed-in');
    const waiting = await signUp(db, fakeAuth({ signUp: async () => ({ userId: USER, refreshToken: null }) }), {
      email: 'b@example.com',
      password: 'correct horse',
      fullName: 'B',
      requestedRole: 'student',
    });
    expect(waiting).toEqual({ kind: 'confirm-email' });
    db.close();
  });
});

function fakeSync(): SyncRemote & { sent: { table: string; rows: Record<string, unknown>[]; onConflict: string }[]; down: boolean } {
  const f = {
    sent: [] as { table: string; rows: Record<string, unknown>[]; onConflict: string }[],
    down: false,
    async resume(token: string) {
      if (f.down) {
        throw new OfflineError('No internet connection.');
      }
      return { userId: USER, refreshToken: `${token}+` };
    },
    async upsert(table: string, rows: Record<string, unknown>[], onConflict: string) {
      if (f.down) {
        throw new OfflineError('No internet connection.');
      }
      f.sent.push({ table, rows, onConflict });
    },
  };
  return f;
}

async function studyAs(db: Awaited<ReturnType<typeof freshDb>>, code: string) {
  await touchLearner(db, code);
  const sessionId = await startSession(db, code, 'rw-s6-am.u1 v0.2.0');
  await recordAttempt(db, { learnerCode: code, sessionId, lessonId: 'L1', exerciseId: 'E1', answer: '5+3i', verdict: 'correct', hintsSeen: 1 });
  await recordReveal(db, { learnerCode: code, sessionId, lessonId: 'L1', exerciseId: 'E1', kind: 'hint', hintIndex: 0 });
  await recordGuidance(db, {
    learnerCode: code,
    sessionId,
    lessonId: 'L1',
    exerciseId: null,
    question: 'How do I add?',
    outcome: 'generated',
    text: '1. Add the real parts.',
    promptTokens: 200,
    generatedTokens: 40,
    firstTokenMs: 23000,
    totalMs: 61000,
  });
  return sessionId;
}

describe('sync engine', () => {
  it('sends nothing until the account switches sync on', async () => {
    const db = await freshDb();
    await signIn(db, fakeAuth(), 'aline@example.com', 'correct horse');
    await studyAs(db, CODE);
    const remote = fakeSync();
    expect(await syncAll(db, remote, device)).toEqual([]);
    expect(remote.sent).toEqual([]);
    db.close();
  });

  it("sends the account's rows once, mapped to Supabase, and only its own", async () => {
    const db = await freshDb();
    await signIn(db, fakeAuth(), 'aline@example.com', 'correct horse');
    await setSyncEnabled(db, USER, true);
    await studyAs(db, CODE);
    await studyAs(db, 'OTHER-1'); // another learner on the tablet, never sent under this account
    const remote = fakeSync();

    const [report] = await syncAll(db, remote, device);
    expect(report.error).toBeNull();
    expect(report.sent).toEqual({ learners: 1, sessions: 1, attempts: 1, reveals: 1, guidance_events: 1 });
    expect(remote.sent.map(s => s.table)).toEqual(['devices', 'learners', 'sessions', 'attempts', 'reveals', 'guidance_events']);
    expect(remote.sent[0].rows[0]).toMatchObject({ id: 'install-1', label: 'Tablet 1A2B', app_version: '1.3.0', last_user: USER });
    const attempt = remote.sent.find(s => s.table === 'attempts')!;
    expect(attempt.onConflict).toBe('device_id,local_id');
    expect(attempt.rows[0]).toMatchObject({ device_id: 'install-1', local_id: 1, user_id: USER, learner_code: CODE, answer: '5+3i', verdict: 'correct', hints_seen: 1 });
    expect(String(attempt.rows[0].created_at)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    const tutor = remote.sent.find(s => s.table === 'guidance_events')!.rows[0];
    expect(tutor).toMatchObject({ question: 'How do I add?', outcome: 'generated', first_token_ms: 23000, total_ms: 61000, exercise_id: null });
    for (const s of remote.sent.slice(1)) {
      expect(s.rows.every(r => r.learner_code === undefined || r.learner_code === CODE)).toBe(true);
    }
    // The rotated refresh token is kept, and the run is recorded.
    expect(await getAccount(db, USER)).toMatchObject({ refreshToken: 'r1+', lastSyncError: null });
    expect((await getAccount(db, USER))!.lastSyncAt).not.toBeNull();

    // A second run sends only what is new.
    remote.sent.length = 0;
    await studyAs(db, CODE);
    const [again] = await syncAll(db, remote, device);
    expect(again.sent).toEqual({ learners: 1, sessions: 1, attempts: 1, reveals: 1, guidance_events: 1 });
    expect(remote.sent.find(s => s.table === 'attempts')!.rows.map(r => r.local_id)).toEqual([3]);
    db.close();
  });

  it('keeps its place when the connection drops, and sends the rows on the next run', async () => {
    const db = await freshDb();
    await signIn(db, fakeAuth(), 'aline@example.com', 'correct horse');
    await setSyncEnabled(db, USER, true);
    await studyAs(db, CODE);
    const remote = fakeSync();
    remote.down = true;
    const [failed] = await syncAll(db, remote, device);
    expect(failed.error).toBe('No internet connection.');
    expect(await getMark(db, USER, 'attempts')).toBe(0);
    expect((await listAccounts(db))[0].lastSyncError).toBe('No internet connection.');

    remote.down = false;
    const [ok] = await syncAll(db, remote, device);
    expect(ok.error).toBeNull();
    expect(ok.sent.attempts).toBe(1);
    expect(await getMark(db, USER, 'attempts')).toBe(1);
    db.close();
  });

  it('reads SQLite timestamps as UTC', () => {
    expect(isoUtc('2026-10-28 14:05:09')).toBe('2026-10-28T14:05:09Z');
    expect(isoUtc('2026-10-28T14:05:09Z')).toBe('2026-10-28T14:05:09Z');
  });
});

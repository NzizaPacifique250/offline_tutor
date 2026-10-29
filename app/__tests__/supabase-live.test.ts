/**
 * The app's own sign-in and sync code against the live Supabase project,
 * over real SQLite (sql.js). It needs the internet and the tables of
 * supabase/migrations, so it runs only when asked:
 *
 *   SUPABASE_LIVE=1 npx jest __tests__/supabase-live.test.ts
 *
 * Each run creates two accounts named "Integration test" on the reserved
 * example.com domain (a student and a teacher request) and registers a
 * tablet called "Tablet TEST". docs/ACCOUNTS_AND_SYNC.md (Removing test
 * data) has the SQL that removes them afterwards.
 */

import { createClient } from '@supabase/supabase-js';
import { OfflineError, signIn, signUp, type AuthRemote } from '../src/account/auth';
import { ensureAccountSchema, getAccount, setSyncEnabled } from '../src/account/store';
import { ensureGuidanceSchema, recordGuidance } from '../src/guidance/log';
import { ensureLearnerSchema, recordAttempt, recordReveal, startSession, touchLearner } from '../src/learner/store';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../src/sync/config';
import { syncAll } from '../src/sync/engine';
import { supabaseAuth, supabaseSync } from '../src/sync/supabase';

const { makeSqlDb } = require('../jest/sqljs-db');

// supabase-js wants a WebSocket, which Node 20 lacks; the tablet's React Native has one.
(globalThis as { WebSocket?: unknown }).WebSocket ??= require('ws');

// The app's TypeScript has no Node types; Jest runs on Node, so process is there.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const live = env.SUPABASE_LIVE === '1' ? describe : describe.skip;
jest.setTimeout(60000);

const stamp = Date.now();
const PASSWORD = `it-${stamp}-pass`;
const device = { id: `it-device-${stamp}`, label: 'Tablet TEST', model: 'jest', appVersion: '1.3.0 (7)', content: 'rw-s6-am.u1 v0.2.0' };

const offline: AuthRemote = {
  ...supabaseAuth,
  async signIn() {
    throw new OfflineError('No internet connection.');
  },
};

live('live Supabase', () => {
  it('creates a student, studies offline, syncs, and reads the records back as that account', async () => {
    const db = await makeSqlDb();
    await ensureLearnerSchema(db);
    await ensureGuidanceSchema(db);
    await ensureAccountSchema(db);

    const email = `it-student-${stamp}@example.com`;
    const created = await signUp(db, supabaseAuth, { email, password: PASSWORD, fullName: 'Integration test student', requestedRole: 'student' });
    expect(created.kind).toBe('signed-in');
    const { account } = await signIn(db, supabaseAuth, email, PASSWORD);
    expect(account.role).toBe('student');
    expect(account.learnerCode).toMatch(/^S-[0-9A-F]{6}$/);

    // The same account signs in again with no internet.
    expect((await signIn(db, offline, email, PASSWORD)).online).toBe(false);

    // Study under the account's code, then switch sync on and sync.
    const code = account.learnerCode;
    await touchLearner(db, code);
    const sessionId = await startSession(db, code, device.content);
    await recordAttempt(db, { learnerCode: code, sessionId, lessonId: 'rw-s6-am.u1.l07', exerciseId: 'rw-s6-am.u1.q.001', answer: '5+3i', verdict: 'correct', hintsSeen: 1 });
    await recordReveal(db, { learnerCode: code, sessionId, lessonId: 'rw-s6-am.u1.l07', exerciseId: 'rw-s6-am.u1.q.001', kind: 'hint', hintIndex: 0 });
    await recordGuidance(db, {
      learnerCode: code,
      sessionId,
      lessonId: 'rw-s6-am.u1.l07',
      exerciseId: null,
      question: 'How do I add two complex numbers?',
      outcome: 'generated',
      text: '1. Add the real parts.',
      promptTokens: 210,
      generatedTokens: 60,
      firstTokenMs: 23000,
      totalMs: 76000,
    });
    await setSyncEnabled(db, account.userId, true);
    const [report] = await syncAll(db, supabaseSync, device);
    expect(report.error).toBeNull();
    expect(report.sent).toEqual({ learners: 1, sessions: 1, attempts: 1, reveals: 1, guidance_events: 1 });

    // A second sync sends nothing new.
    const [again] = await syncAll(db, supabaseSync, device);
    expect(again.sent).toEqual({ learners: 1, sessions: 0, attempts: 0, reveals: 0, guidance_events: 0 });
    expect((await getAccount(db, account.userId))!.lastSyncAt).not.toBeNull();

    // What the server holds, read as the student: its own rows only.
    const reader = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    await reader.auth.signInWithPassword({ email, password: PASSWORD });
    const attempts = await reader.from('attempts').select('device_id, local_id, learner_code, answer, verdict, user_id');
    expect(attempts.error).toBeNull();
    expect(attempts.data).toEqual([{ device_id: device.id, local_id: 1, learner_code: code, answer: '5+3i', verdict: 'correct', user_id: account.userId }]);
    const tutor = await reader.from('guidance_events').select('first_token_ms, total_ms, outcome');
    expect(tutor.data).toEqual([{ first_token_ms: 23000, total_ms: 76000, outcome: 'generated' }]);
    const overview = await reader.from('learner_overview').select('learner_code, attempts, exercises_correct, tutor_requests');
    expect(overview.data).toEqual([{ learner_code: code, attempts: 1, exercises_correct: 1, tutor_requests: 1 }]);

    // Nobody signed in reads nothing.
    const anon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    expect((await anon.from('attempts').select('local_id')).data).toEqual([]);
    db.close();
  });

  it('keeps a teacher request a student, unable to read other accounts, until an admin approves it', async () => {
    const db = await makeSqlDb();
    await ensureLearnerSchema(db);
    await ensureAccountSchema(db);
    const email = `it-teacher-${stamp}@example.com`;
    const r = await signUp(db, supabaseAuth, { email, password: PASSWORD, fullName: 'Integration test teacher', requestedRole: 'teacher' });
    expect(r.kind).toBe('signed-in');
    const { account } = await signIn(db, supabaseAuth, email, PASSWORD);
    expect(account).toMatchObject({ role: 'student', requestedRole: 'teacher' });
    expect(account.learnerCode).toMatch(/^T-[0-9A-F]{6}$/);

    const reader = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    await reader.auth.signInWithPassword({ email, password: PASSWORD });
    expect((await reader.from('attempts').select('local_id')).data).toEqual([]);
    const selfPromote = await reader.rpc('set_role', { target: account.userId, new_role: 'teacher' });
    expect(selfPromote.error?.message).toContain('only an admin');
    const direct = await reader.from('profiles').update({ role: 'admin' }).eq('id', account.userId);
    expect(direct.error).not.toBeNull();
    db.close();
  });
});

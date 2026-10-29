// Checks the row-level security of supabase/migrations against an in-process
// Postgres (PGlite), with stand-ins for the auth schema Supabase provides.
// Run: cd supabase/tests && npm install && npm test
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
// pgcrypto ships in PGlite as a bundle without a wrapper; Supabase has it in
// the extensions schema, where 0004's admin_set_password calls it.
const pgcrypto = { name: 'pgcrypto', setup: async () => ({ bundlePath: new URL('./node_modules/@electric-sql/pglite/dist/pgcrypto.tar.gz', import.meta.url) }) };
const db = new PGlite({ extensions: { pgcrypto } });
// Stand-ins for what Supabase provides.
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb,
    encrypted_password text, updated_at timestamptz);
  create schema extensions; create extension pgcrypto schema extensions;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`);
// The accounts are created after 0001 to 0003 and before the later
// migrations, as on the live project, so 0004's backfill is tested too.
const dir = new URL('../migrations/', import.meta.url);
const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
const apply = async list => { for (const f of list) { await db.exec(readFileSync(new URL(f, dir), 'utf8')); console.log('applied', f); } };
await apply(files.filter(f => f < '0004'));
const S1 = '11111111-1111-1111-1111-111111111111', S2 = '22222222-2222-2222-2222-222222222222', A = '33333333-3333-3333-3333-333333333333';
const S3 = '44444444-4444-4444-4444-444444444444';
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('${S1}', 's1@x', '{"full_name":"Student One","requested_role":"student"}'),
  ('${S2}', 's2@x', '{"full_name":"Wants Teacher","requested_role":"teacher"}'),
  ('${A}',  'a@x',  '{"full_name":"Admin","requested_role":"admin"}');
  update public.profiles set role = 'admin' where id = '${A}';`);
await apply(files.filter(f => f >= '0004'));
// Runs a statement as a signed-in account, the way PostgREST does: the
// authenticated role with the account's id as the JWT subject.
async function as(uid, sql) {
  await db.exec(`set role authenticated; select set_config('request.jwt.sub', '${uid}', false);`);
  try { return (await db.query(sql)).rows; } catch (e) { return 'ERROR: ' + e.message; } finally { await db.exec('reset role;'); }
}

// Each check runs a statement as one account and states what must come back:
// rows (compared as JSON) or an error matching a pattern. Any mismatch is
// printed as FAIL and the script exits with status 1.
let failures = 0;
function check(label, got, expected) {
  const pass = expected instanceof RegExp ? typeof got === 'string' && expected.test(got) : JSON.stringify(got) === JSON.stringify(expected);
  failures += pass ? 0 : 1;
  console.log(`${pass ? 'pass' : 'FAIL'}  ${label.padEnd(56)} ${JSON.stringify(got)}${pass ? '' : `\n      expected ${expected}`}`);
}
const count = rows => (typeof rows === 'string' ? rows : Number(rows[0].count));

check('new accounts are students; a teacher request waits', (await db.query('select learner_code, role, requested_role from public.profiles order by learner_code')).rows, [
  { learner_code: 'S-111111', role: 'student', requested_role: 'student' },
  { learner_code: 'S-333333', role: 'admin', requested_role: 'student' },
  { learner_code: 'T-222222', role: 'student', requested_role: 'teacher' },
]);
check('S1 registers its tablet', await as(S1, `insert into public.devices (id, label, last_user) values ('dev1', 'Tablet DEV1', '${S1}') returning id`), [{ id: 'dev1' }]);
// A tablet shared by two accounts: each sync starts by upserting the tablet's
// row, as the app does (PostgREST: insert ... on conflict (id) do update).
const syncTablet = uid => as(uid, `insert into public.devices (id, label, last_user, last_sync_at) values ('dev1', 'Tablet DEV1', '${uid}', now())
  on conflict (id) do update set label = excluded.label, last_user = excluded.last_user, last_sync_at = excluded.last_sync_at`);
check('S2 syncs from the tablet S1 registered', await syncTablet(S2), []);
check('S1 syncs from it again', await syncTablet(S1), []);
check('S1 inserts own attempt', await as(S1, `insert into public.attempts values ('dev1', 1, '${S1}', 'S-111111', 1, 'L', 'E', '5+3i', 'correct', 0, now()) returning local_id`), [{ local_id: 1 }]);
check('S1 upserts it again (updated, not duplicated)', await as(S1, `insert into public.attempts values ('dev1', 1, '${S1}', 'S-111111', 1, 'L', 'E', '5+3i', 'correct', 1, now()) on conflict (device_id, local_id) do update set hints_seen = excluded.hints_seen returning hints_seen`), [{ hints_seen: 1 }]);
check('S1 has exactly one attempt', count(await as(S1, `select count(*) from public.attempts`)), 1);
check('S1 writes a row as S2 (refused)', await as(S1, `insert into public.attempts values ('dev1', 2, '${S2}', 'S-222222', 1, 'L', 'E', 'x', 'wrong', 0, now())`), /row-level security/);
check('S2 reads attempts (sees none)', count(await as(S2, `select count(*) from public.attempts`)), 0);
check('S2 makes itself teacher directly (refused)', await as(S2, `update public.profiles set role = 'teacher' where id = '${S2}' returning role`), /permission denied/);
check('S2 calls set_role (refused)', await as(S2, `select public.set_role('${S2}', 'teacher')`), /only an admin/);
check('admin approves S2 as teacher', await as(A, `select public.set_role('${S2}', 'teacher')`), [{ set_role: '' }]);
check('S2, now a teacher, reads attempts (sees 1)', count(await as(S2, `select count(*) from public.attempts`)), 1);
check('S2, a teacher, promotes S1 (refused)', await as(S2, `select public.set_role('${S1}', 'admin')`), /only an admin/);
check('S2, a teacher, writes a row as S1 (refused)', await as(S2, `insert into public.attempts values ('dev1', 3, '${S1}', 'S-111111', 1, 'L', 'E', 'x', 'wrong', 0, now())`), /row-level security/);
check('S1 renames itself', await as(S1, `update public.profiles set full_name = 'S One' where id = '${S1}' returning full_name`), [{ full_name: 'S One' }]);
check('S1 renames S2 (no row changed)', await as(S1, `update public.profiles set full_name = 'X' where id = '${S2}' returning full_name`), []);
check('S1 reads the overview (own row only)', await as(S1, `select learner_code, attempts, exercises_correct from public.learner_overview`), [{ learner_code: 'S-111111', attempts: 1, exercises_correct: 1 }]);
check('admin reads the overview (all three)', await as(A, `select learner_code, role, attempts from public.learner_overview order by learner_code`), [
  { learner_code: 'S-111111', role: 'student', attempts: 1 },
  { learner_code: 'S-333333', role: 'admin', attempts: 0 },
  { learner_code: 'T-222222', role: 'teacher', attempts: 0 },
]);
check('anon reads attempts (sees none)', await (async () => {
  await db.exec('set role anon');
  try { return Number((await db.query('select count(*) from public.attempts')).rows[0].count); } catch (e) { return 'ERROR: ' + e.message; } finally { await db.exec('reset role'); }
})(), 0);
check('anon reads tablets (sees none)', await (async () => {
  await db.exec('set role anon');
  try { return Number((await db.query('select count(*) from public.devices')).rows[0].count); } catch (e) { return 'ERROR: ' + e.message; } finally { await db.exec('reset role'); }
})(), 0);
await db.exec(`update public.profiles set requested_role = 'teacher' where id = '${S1}'`);
check('admin declines S1\'s teacher request', await as(A, `select public.set_role('${S1}', 'student')`), [{ set_role: '' }]);
check('S1 is a student and no longer pending', (await db.query(`select role, requested_role from public.profiles where id = '${S1}'`)).rows, [{ role: 'student', requested_role: 'student' }]);

// 0004: emails and roles on every account, admin account management, and
// where students struggle.
const appRoles = async () => (await db.query(`select email, raw_app_meta_data ->> 'role' as role from auth.users order by email`)).rows;
check('the upgrade gives each profile its email', (await db.query('select learner_code, email from public.profiles order by learner_code')).rows, [
  { learner_code: 'S-111111', email: 's1@x' },
  { learner_code: 'S-333333', email: 'a@x' },
  { learner_code: 'T-222222', email: 's2@x' },
]);
check('each account carries its role in app metadata', await appRoles(), [
  { email: 'a@x', role: 'admin' },
  { email: 's1@x', role: 'student' },
  { email: 's2@x', role: 'teacher' },
]);
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${S3}', 's3@x', '{"full_name":"Student Three"}')`);
check('a new account gets its email and the student role', (await db.query(`select p.email, p.role, u.raw_app_meta_data ->> 'role' as app_role from public.profiles p join auth.users u on u.id = p.id where p.id = '${S3}'`)).rows, [{ email: 's3@x', role: 'student', app_role: 'student' }]);
await db.exec(`update auth.users set raw_app_meta_data = '{"provider":"email","providers":["email"]}' where id = '${A}'`);
check('Supabase Auth rewriting app metadata keeps the role', (await db.query(`select raw_app_meta_data ->> 'provider' as provider, raw_app_meta_data ->> 'role' as role from auth.users where id = '${A}'`)).rows, [{ provider: 'email', role: 'admin' }]);
check('admin renames S1', await as(A, `update public.profiles set full_name = 'Renamed by admin' where id = '${S1}' returning full_name`), [{ full_name: 'Renamed by admin' }]);
check('S2, a teacher, renames S1 (no row changed)', await as(S2, `update public.profiles set full_name = 'X' where id = '${S1}' returning full_name`), []);
check('S1 sets a password for S3 (refused)', await as(S1, `select public.admin_set_password('${S3}', 'long-enough-1')`), /only an admin/);
check('admin sets a 5-character password (refused)', await as(A, `select public.admin_set_password('${S3}', 'short')`), /at least 8/);
check('admin sets a new password for S3', await as(A, `select public.admin_set_password('${S3}', 'long-enough-1')`), [{ admin_set_password: '' }]);
check('the new password verifies as bcrypt', (await db.query(`select extensions.crypt('long-enough-1', encrypted_password) = encrypted_password as ok, left(encrypted_password, 4) as kind from auth.users where id = '${S3}'`)).rows, [{ ok: true, kind: '$2a$' }]);
// S1 answers E2 wrongly twice and never correctly: stuck there; E is solved.
await as(S1, `insert into public.attempts values ('dev1', 10, '${S1}', 'S-111111', 1, 'L', 'E2', '7', 'wrong', 1, now() - interval '2 minutes')`);
await as(S1, `insert into public.attempts values ('dev1', 11, '${S1}', 'S-111111', 1, 'L', 'E2', '8', 'wrong', 2, now())`);
check('S1 reads where it struggles', await as(S1, `select exercise_id, attempts, wrong, solved, stuck, last_wrong_answer from public.exercise_progress order by exercise_id`), [
  { exercise_id: 'E', attempts: 1, wrong: 0, solved: true, stuck: false, last_wrong_answer: null },
  { exercise_id: 'E2', attempts: 2, wrong: 2, solved: false, stuck: true, last_wrong_answer: '8' },
]);
check('the overview counts wrong answers and stuck exercises', await as(A, `select learner_code, email, wrong_answers, exercises_stuck, tutor_failed from public.learner_overview where user_id = '${S1}'`), [{ learner_code: 'S-111111', email: 's1@x', wrong_answers: 2, exercises_stuck: 1, tutor_failed: 0 }]);
check('S2, a teacher, sees where S1 struggles', count(await as(S2, `select count(*) from public.exercise_progress where user_id = '${S1}'`)), 2);
check('S3, a student, sees no one else\'s struggles', count(await as(S3, `select count(*) from public.exercise_progress`)), 0);
check('anon deletes an account (refused)', await (async () => {
  await db.exec('set role anon');
  try { return (await db.query(`select public.admin_delete_user('${S3}')`)).rows; } catch (e) { return 'ERROR: ' + e.message; } finally { await db.exec('reset role'); }
})(), /permission denied/);
check('S2, a teacher, deletes S3 (refused)', await as(S2, `select public.admin_delete_user('${S3}')`), /only an admin/);
check('admin deletes itself (refused)', await as(A, `select public.admin_delete_user('${A}')`), /your own account/);
await as(A, `select public.set_role('${S3}', 'admin')`);
check('admin deletes another admin (refused)', await as(A, `select public.admin_delete_user('${S3}')`), /change an admin to another role/);
check('admin deletes S1', await as(A, `select public.admin_delete_user('${S1}')`), [{ admin_delete_user: '' }]);
check('S1\'s profile and synced rows are gone; the tablet stays', (await db.query(`select (select count(*) from public.profiles where id = '${S1}')::int as profiles, (select count(*) from public.attempts where user_id = '${S1}')::int as attempts, (select count(*) from public.devices where id = 'dev1')::int as tablets, (select last_user from public.devices where id = 'dev1') as last_user`)).rows, [{ profiles: 0, attempts: 0, tablets: 1, last_user: null }]);

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);

// Checks the row-level security of supabase/migrations against an in-process
// Postgres (PGlite), with stand-ins for the auth schema Supabase provides.
// Run: cd supabase/tests && npm install && npm test
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
const db = new PGlite();
// Stand-ins for what Supabase provides.
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`);
const dir = new URL('../migrations/', import.meta.url);
for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(new URL(f, dir), 'utf8'));
  console.log('applied', f);
}
const S1 = '11111111-1111-1111-1111-111111111111', S2 = '22222222-2222-2222-2222-222222222222', A = '33333333-3333-3333-3333-333333333333';
await db.exec(`insert into auth.users values
  ('${S1}', 's1@x', '{"full_name":"Student One","requested_role":"student"}'),
  ('${S2}', 's2@x', '{"full_name":"Wants Teacher","requested_role":"teacher"}'),
  ('${A}',  'a@x',  '{"full_name":"Admin","requested_role":"admin"}');
  update public.profiles set role = 'admin' where id = '${A}';`);
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
await db.exec(`update public.profiles set requested_role = 'teacher' where id = '${S1}'`);
check('admin declines S1\'s teacher request', await as(A, `select public.set_role('${S1}', 'student')`), [{ set_role: '' }]);
check('S1 is a student and no longer pending', (await db.query(`select role, requested_role from public.profiles where id = '${S1}'`)).rows, [{ role: 'student', requested_role: 'student' }]);

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);

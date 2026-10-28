// Checks the row-level security of supabase/migrations against an in-process
// Postgres (PGlite), with stand-ins for the auth schema Supabase provides.
// Run: cd supabase/tests && npm install && npm test
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
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
await db.exec(readFileSync(new URL("../migrations/0001_accounts_and_sync.sql", import.meta.url), 'utf8'));
console.log('migration applied');
const S1 = '11111111-1111-1111-1111-111111111111', S2 = '22222222-2222-2222-2222-222222222222', A = '33333333-3333-3333-3333-333333333333';
await db.exec(`insert into auth.users values
  ('${S1}', 's1@x', '{"full_name":"Student One","requested_role":"student"}'),
  ('${S2}', 's2@x', '{"full_name":"Wants Teacher","requested_role":"teacher"}'),
  ('${A}',  'a@x',  '{"full_name":"Admin","requested_role":"admin"}');
  update public.profiles set role = 'admin' where id = '${A}';`);
console.log((await db.query('select learner_code, role, requested_role, full_name from public.profiles order by full_name')).rows);
async function as(uid, sql) {
  await db.exec(`set role authenticated; select set_config('request.jwt.sub', '${uid}', false);`);
  try { return (await db.query(sql)).rows; } catch (e) { return 'ERROR: ' + e.message; } finally { await db.exec('reset role;'); }
}
const ok = (label, v) => console.log(label.padEnd(58), JSON.stringify(v));
ok('S1 registers its tablet', await as(S1, `insert into public.devices (id, label, last_user) values ('dev1', 'Tablet DEV1', '${S1}') returning id`));
ok('S1 inserts own attempt', await as(S1, `insert into public.attempts values ('dev1', 1, '${S1}', 'S-111111', 1, 'L', 'E', '5+3i', 'correct', 0, now()) returning local_id`));
ok('S1 upserts it again (no duplicate)', await as(S1, `insert into public.attempts values ('dev1', 1, '${S1}', 'S-111111', 1, 'L', 'E', '5+3i', 'correct', 1, now()) on conflict (device_id, local_id) do update set hints_seen = excluded.hints_seen returning hints_seen`));
ok('S1 writes a row as S2 (must fail)', await as(S1, `insert into public.attempts values ('dev1', 2, '${S2}', 'S-222222', 1, 'L', 'E', 'x', 'wrong', 0, now())`));
ok('S2 reads attempts (must see none)', await as(S2, `select count(*) from public.attempts`));
ok('S2 makes self teacher directly (must fail)', await as(S2, `update public.profiles set role = 'teacher' where id = '${S2}' returning role`));
ok('S2 calls set_role (must fail)', await as(S2, `select public.set_role('${S2}', 'teacher')`));
ok('Admin approves S2 as teacher', await as(A, `select public.set_role('${S2}', 'teacher')`));
ok('S2, now teacher, reads attempts (sees 1)', await as(S2, `select count(*) from public.attempts`));
ok('S1 renames itself', await as(S1, `update public.profiles set full_name = 'S One' where id = '${S1}' returning full_name`));
ok('S1 reads overview (own row only)', await as(S1, `select learner_code, attempts, exercises_correct from public.learner_overview`));
ok('Admin reads overview (all)', await as(A, `select learner_code, role, attempts from public.learner_overview order by learner_code`));
ok('anon reads attempts (must see none)', await (async () => { await db.exec('set role anon'); try { return (await db.query('select count(*) from public.attempts')).rows; } catch (e) { return 'ERROR: ' + e.message; } finally { await db.exec('reset role'); } })());

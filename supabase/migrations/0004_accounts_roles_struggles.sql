-- Accounts managed from the admin portal, every account's role on its auth
-- record, and where students struggle. Run after 0003 in the SQL Editor.

-- ---------------------------------------------------------------------------
-- 1. Each profile carries its account's email, so the profiles table lists
--    every user with their email, name, role and learner code.

alter table public.profiles add column email text not null default '';

update public.profiles p set email = coalesce(u.email, '') from auth.users u where u.id = p.id;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  wanted text := coalesce(new.raw_user_meta_data ->> 'requested_role', 'student');
begin
  if wanted not in ('student', 'teacher') then
    wanted := 'student';
  end if;
  insert into public.profiles (id, requested_role, full_name, learner_code, email)
  values (
    new.id,
    wanted,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    (case when wanted = 'teacher' then 'T-' else 'S-' end) || upper(substr(replace(new.id::text, '-', ''), 1, 6)),
    coalesce(new.email, '')
  );
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The role is copied into each account's app metadata, where the Supabase
--    dashboard shows it (Authentication, Users, a user's raw app metadata)
--    and where it travels in the account's token as app_metadata.role.
--    Supabase Auth rewrites app metadata when it sets up an account, so the
--    role is put back whenever that metadata is written.

create function public.role_into_app_metadata() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', coalesce((select role from public.profiles where id = new.id), 'student'));
  return new;
end $$;

create trigger keep_role_on_new_user
  before insert on auth.users
  for each row execute function public.role_into_app_metadata();

create trigger keep_role_on_user_update
  before update of raw_app_meta_data on auth.users
  for each row execute function public.role_into_app_metadata();

-- A role change touches the auth record, and the trigger above copies it.
create function public.copy_role_to_auth() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) where id = new.id;
  return null;
end $$;

create trigger copy_role_on_change
  after update of role on public.profiles
  for each row when (new.role is distinct from old.role)
  execute function public.copy_role_to_auth();

update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb);

-- ---------------------------------------------------------------------------
-- 3. Admins manage accounts from the portal. Creating one uses the normal
--    sign-up; these cover renaming, a new password and deletion.

-- An admin may correct anyone's name (the column grant still limits
-- updates to full_name).
create policy "admins update any name" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- For students without a reachable inbox: an admin sets a new password.
create function public.admin_set_password(target uuid, new_password text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then
    raise exception 'only an admin can set passwords';
  end if;
  if length(coalesce(new_password, '')) < 8 then
    raise exception 'a password needs at least 8 characters';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = target;
  if not found then
    raise exception 'no such account';
  end if;
end $$;

-- Deleting an account also deletes everything it synced (the foreign keys
-- cascade); a tablet it used keeps its row. Admin accounts are changed to
-- another role first, so an admin is never removed by accident.
create function public.admin_delete_user(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'only an admin can delete accounts';
  end if;
  if target = auth.uid() then
    raise exception 'you cannot delete your own account';
  end if;
  if exists (select 1 from public.profiles where id = target and role = 'admin') then
    raise exception 'change an admin to another role before deleting the account';
  end if;
  delete from auth.users where id = target;
  if not found then
    raise exception 'no such account';
  end if;
end $$;

revoke execute on function public.admin_set_password(uuid, text) from public, anon;
revoke execute on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_set_password(uuid, text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Where students struggle. A student is stuck on an exercise after two
--    or more wrong answers without a correct one, the same rule as "needs
--    help" in the app's class progress.

create view public.exercise_progress with (security_invoker = true) as
select
  a.user_id,
  a.lesson_id,
  a.exercise_id,
  count(*) as attempts,
  count(*) filter (where a.verdict = 'wrong') as wrong,
  bool_or(a.verdict = 'correct') as solved,
  max(a.hints_seen) as hints_seen,
  exists (
    select 1 from public.reveals r
    where r.user_id = a.user_id and r.exercise_id = a.exercise_id and r.kind = 'solution'
  ) as solution_seen,
  max(a.created_at) as last_attempt_at,
  (
    select w.answer from public.attempts w
    where w.user_id = a.user_id and w.exercise_id = a.exercise_id and w.verdict = 'wrong'
    order by w.created_at desc limit 1
  ) as last_wrong_answer,
  count(*) filter (where a.verdict = 'wrong') >= 2 and not bool_or(a.verdict = 'correct') as stuck
from public.attempts a
group by a.user_id, a.lesson_id, a.exercise_id;

-- The account overview gains the email and three signs of difficulty.
create or replace view public.learner_overview with (security_invoker = true) as
select
  p.id as user_id,
  p.full_name,
  p.learner_code,
  p.role,
  p.requested_role,
  p.created_at,
  (select count(*) from public.attempts a where a.user_id = p.id) as attempts,
  (select count(distinct a.exercise_id) from public.attempts a where a.user_id = p.id and a.verdict = 'correct') as exercises_correct,
  (select count(*) from public.reveals r where r.user_id = p.id and r.kind = 'hint') as hints,
  (select count(*) from public.reveals r where r.user_id = p.id and r.kind = 'solution') as solutions,
  (select count(*) from public.guidance_events g where g.user_id = p.id) as tutor_requests,
  greatest(
    (select max(a.created_at) from public.attempts a where a.user_id = p.id),
    (select max(g.created_at) from public.guidance_events g where g.user_id = p.id),
    (select max(s.started_at) from public.sessions s where s.user_id = p.id)
  ) as last_activity,
  p.email,
  (select count(*) from public.attempts a where a.user_id = p.id and a.verdict = 'wrong') as wrong_answers,
  (select count(*) from public.exercise_progress e where e.user_id = p.id and e.stuck) as exercises_stuck,
  (select count(*) from public.guidance_events g where g.user_id = p.id and g.outcome in ('failed', 'timed-out')) as tutor_failed
from public.profiles p;

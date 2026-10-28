-- Accounts, tablets and the learner records synced from tablets.
--
-- The tablet keeps its own SQLite database and works offline; when it is
-- online it upserts its rows here. Each synced row is keyed by the tablet
-- (device_id) and the row's id on that tablet (local_id), so sending a
-- row twice changes nothing. Every row belongs to one account (user_id);
-- row-level security lets an account write and read only its own rows,
-- and teachers and admins read everything.
--
-- Run once in the Supabase SQL Editor. Then make the first admin:
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'you@example.com');

-- ---------------------------------------------------------------------------
-- Accounts

create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  role           text not null default 'student' check (role in ('student', 'teacher', 'admin')),
  requested_role text not null default 'student' check (requested_role in ('student', 'teacher')),
  full_name      text not null default '',
  -- The code the tablet files this account's records under: S-xxxxxx for
  -- students, T-xxxxxx for teachers. It matches the app's learner codes.
  learner_code   text not null unique,
  created_at     timestamptz not null default now()
);

-- A new account is a student until an admin approves a teacher request,
-- so nobody can make themselves a teacher by signing up.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  wanted text := coalesce(new.raw_user_meta_data ->> 'requested_role', 'student');
begin
  if wanted not in ('student', 'teacher') then
    wanted := 'student';
  end if;
  insert into public.profiles (id, requested_role, full_name, learner_code)
  values (
    new.id,
    wanted,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    (case when wanted = 'teacher' then 'T-' else 'S-' end) || upper(substr(replace(new.id::text, '-', ''), 1, 6))
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('teacher', 'admin'));
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Roles change only through this function, and only for an admin.
create function public.set_role(target uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'only an admin can change roles';
  end if;
  if new_role not in ('student', 'teacher', 'admin') then
    raise exception 'unknown role %', new_role;
  end if;
  update public.profiles set role = new_role where id = target;
end $$;

alter table public.profiles enable row level security;
create policy "read own profile, staff read all" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_staff());
-- An account may correct its own name; the role and code are not writable.
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;
create policy "update own name" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Tablets

create table public.devices (
  id            text primary key,           -- the app's install id
  label         text not null,              -- "Tablet 1A2B", as shown in the app
  model         text not null default '',
  app_version   text not null default '',
  content       text not null default '',   -- curriculum package versions
  first_seen_at timestamptz not null default now(),
  last_sync_at  timestamptz not null default now(),
  last_user     uuid references auth.users (id) on delete set null
);

alter table public.devices enable row level security;
create policy "staff read tablets, users read the ones they used" on public.devices
  for select to authenticated using (public.is_staff() or last_user = auth.uid());
create policy "a signed-in user registers a tablet" on public.devices
  for insert to authenticated with check (last_user = auth.uid());
create policy "a signed-in user updates a tablet" on public.devices
  for update to authenticated using (true) with check (last_user = auth.uid());

-- ---------------------------------------------------------------------------
-- Learner records, mirroring the tablet's SQLite tables

create table public.learners (
  device_id    text not null references public.devices (id),
  code         text not null,
  user_id      uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null,
  last_seen_at timestamptz not null,
  synced_at    timestamptz not null default now(),
  primary key (device_id, code)
);

create table public.sessions (
  device_id        text not null references public.devices (id),
  local_id         bigint not null,
  user_id          uuid not null references auth.users (id) on delete cascade,
  learner_code     text not null,
  content_versions text not null,
  started_at       timestamptz not null,
  synced_at        timestamptz not null default now(),
  primary key (device_id, local_id)
);

create table public.attempts (
  device_id    text not null references public.devices (id),
  local_id     bigint not null,
  user_id      uuid not null references auth.users (id) on delete cascade,
  learner_code text not null,
  session_id   bigint not null,
  lesson_id    text not null,
  exercise_id  text not null,
  answer       text not null,
  verdict      text not null,
  hints_seen   integer not null,
  created_at   timestamptz not null,
  synced_at    timestamptz not null default now(),
  primary key (device_id, local_id)
);

create table public.reveals (
  device_id    text not null references public.devices (id),
  local_id     bigint not null,
  user_id      uuid not null references auth.users (id) on delete cascade,
  learner_code text not null,
  session_id   bigint not null,
  lesson_id    text not null,
  exercise_id  text not null,
  kind         text not null,                -- 'hint' or 'solution'
  hint_index   integer,
  created_at   timestamptz not null,
  synced_at    timestamptz not null default now(),
  primary key (device_id, local_id)
);

create table public.guidance_events (
  device_id        text not null references public.devices (id),
  local_id         bigint not null,
  user_id          uuid not null references auth.users (id) on delete cascade,
  learner_code     text not null,
  session_id       bigint not null,
  lesson_id        text,
  exercise_id      text,
  question         text not null,
  outcome          text not null,            -- generated, stored, declined, cancelled, timed-out, failed, no-model
  text             text not null,
  prompt_tokens    integer,
  generated_tokens integer,
  first_token_ms   integer,
  total_ms         integer,
  created_at       timestamptz not null,
  synced_at        timestamptz not null default now(),
  primary key (device_id, local_id)
);

create index attempts_user on public.attempts (user_id, created_at);
create index reveals_user on public.reveals (user_id, created_at);
create index guidance_user on public.guidance_events (user_id, created_at);
create index sessions_user on public.sessions (user_id, started_at);

do $$
declare t text;
begin
  foreach t in array array['learners', 'sessions', 'attempts', 'reveals', 'guidance_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows, staff read all" on public.%I for select to authenticated using (user_id = auth.uid() or public.is_staff())', t);
    execute format('create policy "write own rows" on public.%I for insert to authenticated with check (user_id = auth.uid())', t);
    execute format('create policy "update own rows" on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- What the admin portal reads: one row per account with its activity.

create view public.learner_overview with (security_invoker = true) as
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
  ) as last_activity
from public.profiles p;

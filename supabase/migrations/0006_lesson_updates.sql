-- Lesson updates published from the admin portal. Run after 0005 in the SQL
-- Editor.
--
-- A release is one unit's package as tools/export_package.py writes it (the
-- package is validated, and every answer key proven, before the file
-- exists). An admin publishes it for every tablet or for chosen tablets; a
-- connected tablet that holds an older version of the unit offers to
-- install it, and an offline tablet imports the same file from Teacher
-- tools. The database keeps the file's exact text, computes its SHA-256,
-- which the tablet checks after downloading, and takes the unit, version
-- and counts from the file itself, so they always agree with what is
-- installed.

create table public.content_releases (
  id           uuid primary key default gen_random_uuid(),
  package_id   text not null,
  version      text not null,
  unit         integer not null,
  unit_title   text not null,
  lessons      integer not null,
  exercises    integer not null,
  notes        text not null default '' check (length(notes) <= 500),
  package_text text not null check (length(package_text) <= 2000000),
  sha256       text not null,
  -- The install ids of the tablets that should install it; empty means every tablet.
  devices      text[] not null default '{}',
  published_by uuid default auth.uid() references auth.users (id) on delete set null,
  published_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  unique (package_id, version)
);

create index content_releases_package on public.content_releases (package_id);

-- Everything about a release is read from its file, and a version must be
-- newer than every earlier release of the same unit.
create function public.check_release() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  doc jsonb;
  newest int[];
begin
  begin
    doc := new.package_text::jsonb;
  exception when others then
    raise exception 'the release file is not valid JSON';
  end;
  if jsonb_typeof(doc) <> 'object'
     or doc ->> 'format' is distinct from 'offline-tutor-package'
     or doc ->> 'format_version' is distinct from '1' then
    raise exception 'not a lesson package file (expected format offline-tutor-package, version 1)';
  end if;
  if jsonb_typeof(doc -> 'manifest') <> 'object'
     or jsonb_typeof(doc -> 'lessons') <> 'array'
     or jsonb_typeof(doc -> 'examples') <> 'array'
     or jsonb_typeof(doc -> 'exercises') <> 'array' then
    raise exception 'the package needs a manifest and lists of lessons, examples and exercises';
  end if;
  new.package_id := doc -> 'manifest' ->> 'id';
  new.version := doc -> 'manifest' ->> 'version';
  new.unit_title := coalesce(doc -> 'manifest' ->> 'unit_title', '');
  if new.package_id is null or new.package_id !~ '^rw-s6-am\.u[0-9]+$' then
    raise exception 'the package id must look like rw-s6-am.u4';
  end if;
  if new.version is null or new.version !~ '^[0-9]+\.[0-9]+\.[0-9]+$' then
    raise exception 'the package version must be major.minor.patch, such as 0.3.0';
  end if;
  if doc -> 'manifest' ->> 'unit' is null or doc -> 'manifest' ->> 'unit' !~ '^[0-9]+$' then
    raise exception 'the package unit must be a whole number';
  end if;
  new.unit := (doc -> 'manifest' ->> 'unit')::int;
  if jsonb_array_length(doc -> 'lessons') = 0 or jsonb_array_length(doc -> 'exercises') = 0 then
    raise exception 'the package has no lessons or no exercises';
  end if;
  new.lessons := jsonb_array_length(doc -> 'lessons');
  new.exercises := jsonb_array_length(doc -> 'exercises');
  new.sha256 := encode(extensions.digest(convert_to(new.package_text, 'UTF8'), 'sha256'), 'hex');

  select max(string_to_array(r.version, '.')::int[]) into newest
    from public.content_releases r where r.package_id = new.package_id;
  if newest is not null and string_to_array(new.version, '.')::int[] <= newest then
    raise exception 'version % of % is not newer than the latest published version', new.version, new.package_id;
  end if;
  return new;
end $$;

create trigger check_release before insert on public.content_releases
  for each row execute function public.check_release();

-- A published file never changes: only its notes, its tablets and whether it
-- is withdrawn can.
revoke update on public.content_releases from anon, authenticated;
grant update (notes, devices, withdrawn_at) on public.content_releases to authenticated;

alter table public.content_releases enable row level security;

-- Tablets check for updates with or without an account; the lessons are the
-- same ones the app file carries. Withdrawn releases are for admins only.
create policy "tablets read active releases, admins read all" on public.content_releases
  for select to anon, authenticated using (withdrawn_at is null or public.is_admin());
create policy "admins publish releases" on public.content_releases
  for insert to authenticated with check (public.is_admin());
create policy "admins change releases" on public.content_releases
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete releases" on public.content_releases
  for delete to authenticated using (public.is_admin());

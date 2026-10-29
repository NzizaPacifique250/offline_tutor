-- Classes: a teacher sees only the students in their own classes; an admin
-- sees everyone and manages the classes. Run after 0004 in the SQL Editor.

-- ---------------------------------------------------------------------------
-- Tables

create table public.classes (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 1 and 80),
  teacher_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.class_members (
  class_id   uuid not null references public.classes (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (class_id, student_id)
);

create index classes_teacher on public.classes (teacher_id);
create index class_members_student on public.class_members (student_id);

-- A class is taught by a teacher (or an admin) and holds students.
create function public.check_class_people() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'classes' then
    if new.teacher_id is not null
       and not exists (select 1 from public.profiles where id = new.teacher_id and role in ('teacher', 'admin')) then
      raise exception 'a class needs a teacher or an admin as its teacher';
    end if;
  elsif not exists (select 1 from public.profiles where id = new.student_id and role = 'student') then
    raise exception 'only students can be added to a class';
  end if;
  return new;
end $$;

create trigger check_class_teacher before insert or update of teacher_id on public.classes
  for each row execute function public.check_class_people();
create trigger check_class_student before insert or update of student_id on public.class_members
  for each row execute function public.check_class_people();

-- ---------------------------------------------------------------------------
-- Who may read a student's records: the student, an admin, or a teacher of
-- one of the student's classes. The caller must still be a teacher, so a
-- teacher who is changed to a student loses access at once.

create function public.teaches(student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher')
     and exists (
       select 1 from public.class_members m join public.classes c on c.id = m.class_id
       where m.student_id = student and c.teacher_id = auth.uid()
     );
$$;

drop policy "read own profile, staff read all" on public.profiles;
create policy "own profile, admins, and the student's teachers" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.teaches(id));

do $$
declare t text;
begin
  foreach t in array array['learners', 'sessions', 'attempts', 'reveals', 'guidance_events'] loop
    execute format('drop policy "own rows, staff read all" on public.%I', t);
    execute format('create policy "own rows, admins, and the student''s teachers" on public.%I for select to authenticated using (user_id = auth.uid() or public.is_admin() or public.teaches(user_id))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Classes are managed by admins; a teacher reads their own classes.

alter table public.classes enable row level security;
alter table public.class_members enable row level security;

create policy "admins and the class's teacher read classes" on public.classes
  for select to authenticated using (public.is_admin() or teacher_id = auth.uid());
create policy "admins create classes" on public.classes
  for insert to authenticated with check (public.is_admin());
create policy "admins change classes" on public.classes
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete classes" on public.classes
  for delete to authenticated using (public.is_admin());

create policy "admins and the class's teacher read members" on public.class_members
  for select to authenticated using (
    public.is_admin()
    or exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid())
  );
create policy "admins add students" on public.class_members
  for insert to authenticated with check (public.is_admin());
create policy "admins remove students" on public.class_members
  for delete to authenticated using (public.is_admin());

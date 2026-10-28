-- Declining a teacher request. Setting an account's role to 'student' now
-- also clears its request, so the admin portal can decline a request and
-- the account leaves the pending list. Run after 0001 in the SQL Editor.

create or replace function public.set_role(target uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'only an admin can change roles';
  end if;
  if new_role not in ('student', 'teacher', 'admin') then
    raise exception 'unknown role %', new_role;
  end if;
  update public.profiles
     set role = new_role,
         requested_role = case when new_role = 'student' then 'student' else requested_role end
   where id = target;
end $$;

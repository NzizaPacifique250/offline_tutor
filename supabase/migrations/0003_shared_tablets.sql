-- Several accounts syncing from one tablet. Run after 0002 in the SQL Editor.
--
-- Every sync starts by upserting the tablet's row (insert ... on conflict do
-- update). On a conflict Postgres reads the existing row, so it must pass the
-- table's SELECT policy, which allowed only staff and the account that synced
-- the tablet last. Every other account on a shared tablet was refused ("new
-- row violates row-level security policy (USING expression) for table
-- devices") and none of its records were sent.
--
-- Any signed-in account may now read the tablets' rows: a label such as
-- "Tablet 1A2B", the model, the app and content versions, the last sync time
-- and the id of the account that synced last, never a name. Writing is
-- unchanged: an account can only record itself as the tablet's last user.

drop policy "staff read tablets, users read the ones they used" on public.devices;

create policy "signed-in users read tablets" on public.devices
  for select to authenticated using (true);

// Shown when the Supabase tables are missing. Which files to run is not a
// secret, and on a fresh database nobody's role can be read yet, so everyone
// sees the steps; whoever is not an admin passes them on.
export function SetupNeeded() {
  return (
    <div role="alert" className="rounded-xl border border-warn/30 bg-warn-soft p-6">
      <p className="text-base font-semibold text-ink">The database is not fully set up</p>
      <p className="mt-1 text-sm text-ink">
        Run these files in order in the Supabase SQL Editor (any already run can be skipped), then reload the page.
        If you are not an admin, ask one to do it.
      </p>
      <ul className="mt-3 space-y-2">
        {[
          "supabase/migrations/0001_accounts_and_sync.sql",
          "supabase/migrations/0002_decline_teacher_request.sql",
          "supabase/migrations/0003_shared_tablets.sql",
          "supabase/migrations/0004_accounts_roles_struggles.sql",
        ].map((f) => (
          <li key={f}>
            <code className="inline-block rounded-md border border-line bg-surface px-3 py-2 font-mono text-[13px] text-ink">{f}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

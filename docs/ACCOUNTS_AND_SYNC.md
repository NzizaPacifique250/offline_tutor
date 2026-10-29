# Accounts, sync, lesson updates and the admin portal (1.4.0)

Accounts and sync were added on 28 October 2026 (1.3.0), lesson updates
from the portal on 29 October (1.4.0). The tablet still does everything
offline; accounts and sync add online monitoring on top, and nothing in the
study flow waits for the network.

## How it fits together

```
 Tablet (React Native, SQLite)                 Supabase (Postgres + Auth)          Admin portal (Next.js)
 ┌───────────────────────────────┐   upsert    ┌──────────────────────────┐  read   ┌──────────────────────┐
 │ learners, sessions, attempts, │ ──────────▶ │ same five tables, keyed  │ ◀────── │ teachers and admins  │
 │ reveals, guidance_events      │  when online│ by (device_id, local_id) │  as the │ sign in; RLS decides │
 │ accounts, sync_marks          │             │ profiles, devices        │  user   │ what each one sees   │
 └───────────────────────────────┘             └──────────────────────────┘         └──────────────────────┘
```

- **The tablet is the source of truth.** Every answer, hint and tutor request
  is written to SQLite first, exactly as in 1.2.2.
- **Accounts.** A student or teacher creates an account online (email and
  password). The tablet then keeps the account's profile, a salted
  PBKDF2-SHA256 hash of its password and its refresh token
  (`app/src/account/`), so the same account signs in again with no internet.
  A new account is a student; a teacher request waits for an admin.
- **Sync.** Off until the account holder turns it on under the topic list.
  While on, the app sends that account's rows whenever it has internet: after
  an online sign-in, at start-up, every two minutes, and on "Sync now"
  (`app/src/sync/engine.ts`). Rows are upserted by tablet and local id, so a
  row sent twice changes nothing; per account and table the tablet keeps the
  highest id already sent, so each run sends only what is new; a failure
  leaves that mark in place and the next run sends the same rows again.
- **What is sent.** Everything the account produced on the tablet: its
  learner record, sessions, attempts (with the typed answer), hints and
  solutions shown, and tutor requests (with the question, the generated text,
  and the timings). Studying under a learner code without an account never
  syncs.
- **Security.** Row-level security (`supabase/migrations/`): an account
  writes and reads only its own rows; an admin reads everything, and a
  teacher only the students in their own classes (0005); a
  role changes only through `set_role`, which only an admin may call. The app
  and the portal hold only the publishable key.
- **Roles and accounts (0004).** Each profile holds its account's email, and
  each role is copied into the account's app metadata, so the Supabase
  dashboard shows it under Authentication. An admin creates accounts in the
  portal (the normal sign-up, then the chosen role), renames them, sets a new
  password (`admin_set_password`) and deletes them with everything they
  synced (`admin_delete_user`); the database refuses a non-admin, an admin's
  own account and another admin.
- **Where students struggle (0004).** `exercise_progress` gives, per student
  and exercise, wrong answers, whether it is solved, hints, the solution
  opened and the last wrong answer. Two or more wrong answers on one
  exercise is a struggle; while the exercise is unsolved the student is
  stuck, the app's "needs help" rule. The portal's overview lists every
  student with a wrong answer, stuck first, with each exercise, its wrong
  answers and whether it was solved later; Users has a Struggles column and
  a Struggling filter; a student's page lists every exercise answered
  wrongly.
- **The study build.** `./gradlew :app:assembleRelease -PofflineOnly` removes
  the INTERNET permission, so Android itself stops that build sending
  anything, whatever the sync setting. Participant data must not be synced
  until the ethics committee has approved an amendment covering Supabase.

## Lesson updates (1.4.0, migration 0006)

Until 1.4.0 a new or corrected lesson reached a tablet only inside a new app
file. Now an admin publishes a unit from the portal, and each tablet installs
it when someone accepts:

1. **Make the release file.** On the development laptop, change the unit's
   package, raise its `version` in `package.json`, and run
   `./.venv/bin/python tools/export_package.py curriculum/rw_s6_mathematics/packages/u1`.
   The tool runs the package validator, which proves every answer key with
   SymPy, and writes `dist/content/rw-s6-am.u1-<version>.json` only if the
   package is valid.
2. **Publish.** In the portal, **Content** (admins only): choose the file,
   say what changed if you like, and choose every tablet or particular
   tablets (those that have synced). The database reads the unit, version
   and counts from the file itself, computes its SHA-256, and refuses a
   file that is not a lesson package or a version that is not newer than
   the unit's latest release (`content_releases`). A published file never
   changes; its notes and tablets can, and it can be withdrawn.
3. **Install on a connected tablet.** The app looks for releases at
   start-up and every ten minutes, with or without an account. When one is
   newer than what the tablet has, a pop-up, **New lessons are ready**,
   appears on the sign-in, learner-code or topic screen, never during a
   lesson or an exercise. **Update now** downloads the file, checks its
   SHA-256 against the published one and its structure
   (`app/src/updates/packageFile.ts`: ids, references, answer keys, at least
   two hints), then replaces that unit's lessons, examples and exercises in
   one transaction. The learners' records are not touched. **Later** puts it
   off until the app next starts; Teacher tools → **Lesson updates** lists
   the same releases with **Check for updates** and **Install updates**.
4. **Tablets with no internet.** On the Content page, **Download file**
   gives the same file. Copy it into the tablet's Download folder and use
   Teacher tools → **Import lessons from a file**; the tablet makes the same
   checks. This is the route for the offline-only study build.

A tablet installs only a version newer than the one it has
(`app/src/content/version.ts`), and at start-up it keeps an installed
version that is newer than the one bundled in the app file, so reinstalling
an older APK does not undo an update. Each install is recorded in the
tablet's `content_updates` table with its source and checksum. A tablet
reports its versions when it syncs, which is how the Content page shows
which tablets have each release.

Anyone, signed in or not, can read releases that are not withdrawn: the
lessons are the same ones the app file carries, and a tablet must find
updates before anyone signs in. Only an admin publishes, changes or
withdraws one, and nobody can change a published file.

## Setting up Supabase

1. In the SQL Editor, run `supabase/migrations/0001_accounts_and_sync.sql`,
   then `0002_decline_teacher_request.sql`, `0003_shared_tablets.sql`,
   `0004_accounts_roles_struggles.sql`, `0005_classes.sql` and
   `0006_lesson_updates.sql`, each once.
2. Authentication → Sign In / Providers → Email: switch off "Confirm email"
   for the pilot, so students without a reachable inbox can sign in.
3. Create the first admin (Authentication → Users → Add user), then:
   `update public.profiles set role = 'admin' where id = (select id from auth.users where email = '…');`
4. Run the portal: `cd admin && npm ci && npm run dev` (see `admin/README.md`).

## How it was tested

| Test | What it shows | Result |
|---|---|---|
| `app/__tests__/account-sync.test.ts` (12 tests, sql.js, fake server) | Offline password check; sign-in online then offline; account creation; sync sends each account's rows once, only its own, mapped to the Supabase columns, and keeps its place when the connection drops | Pass |
| `app/__tests__/account-screen.test.tsx` (4 tests) | The sign-in screen: signing in, the offline message, a teacher request, the routes without an account | Pass |
| `supabase/tests/check_policies.mjs` (PGlite) | The migrations apply, 0004 over existing accounts as on the live project; two accounts sync from the same tablet; a student cannot write as another, read others' rows, or make itself a teacher; a teacher cannot change roles or write as a student; an admin approves and declines; each account carries its email and role, kept when Supabase Auth rewrites its metadata; only an admin renames, sets a password (bcrypt) or deletes, never its own or another admin's account; stuck exercises are counted; a teacher reads only the students in their classes, cannot create classes or add students, and loses access when changed to a student; anonymous users read nothing but active lesson releases; only an admin publishes a release, which must be a lesson package newer than the unit's last, whose checksum the database computes and whose file nobody can change, and a withdrawn release is hidden from tablets. Each of the 74 checks states its expected result, and any mismatch exits with status 1 | Pass, 74 of 74 |
| `app/__tests__/updates.test.tsx` (21 tests, sql.js) | Versions compare as numbers; a tablet is offered only the newest newer release meant for it; a release file is refused when it is not JSON, of another format, its unit or ids do not match, a lesson or exercise is missing, an exercise has fewer than two hints or no answer key, or an id repeats; a download whose checksum or version differs is refused; installing replaces the unit, keeps the learners' attempts and records the install; an older bundled package does not overwrite a newer installed one; one failed download does not stop the others; the pop-up offers, installs, reports and retries | Pass |
| `app/__tests__/supabase-live.test.ts` (`SUPABASE_LIVE=1`) | The app's own sign-in and sync code against the live project: a new student syncs a study session and reads back exactly its rows; a teacher request stays a student and cannot promote itself | Pass, 28 October |
| On the IT-801B, 1.3.0 | Below | Pass |
| Lesson updates on the IT-801B, 1.4.0, with the portal and the live project (`docs/evidence/lesson-updates-2026-10-29/`) | A release published for the tablet was offered in the pop-up at start-up and installed in about 4 s; offline, the file downloaded from the portal was imported from Teacher tools with the same checksum; the same file again changed nothing; after a restart the installed version was kept over the bundled one; the learners' records were unchanged. The portal's checks (`docs/evidence/portal-browsers/check_content.mjs`) passed 16 of 16 | Pass, 29 October |
| Admin portal | `npm run lint` and `npm run build` pass; signed out, every page redirects to sign-in in Chrome 154 and Firefox 142 at desktop and phone widths (`docs/evidence/portal-browsers/`); a signed-in student is sent to "no access" | Pass; pages behind a staff sign-in need the first admin account |

On the tablet on 28 October: an account was created in the app online
(code S-3B4C89); with sync on, "Sync now" sent its learner record, two
sessions and one attempt, which the server returned unchanged. In airplane
mode the account signed in again from the tablet ("signed in offline, from
this tablet"), answered another exercise, and a sync attempt reported "No
internet connection" with no effect on studying. After Wi-Fi came back, the
next automatic sync sent that session and attempt once; a later sync sent
nothing new.

## Removing test data

Two checks leave data in the live project on purpose, so that a run can be
inspected afterwards. The live test (`app/__tests__/supabase-live.test.ts`)
creates two accounts named "Integration test" and a tablet called "Tablet
TEST" each time it runs, and `docs/evidence/portal-browsers/check_content.mjs`
leaves the release it publishes, withdrawn. Remove them in the SQL Editor:

```sql
-- Accounts made by the tests, with everything they synced.
delete from auth.users where email like 'it-%@example.com';
-- The tablets the live test registered; their records went with the accounts.
delete from public.devices where id like 'it-device-%';
-- Releases published by the portal check.
delete from public.content_releases where notes like 'Portal check%';
```

## Known limits

- For about a minute after the connection returns, a sync can still fail
  with "No internet connection" while Android's network layer settles; the
  two-minute retry covers it.
- Refresh tokens and records sit unencrypted in the app's private storage,
  as the learner records always have.
- A student in no class is seen only by admins; the Classes page lists such
  students so an admin can place them.
- Any signed-in account can read and update a tablet's row (needed because
  several accounts share a tablet), so a tablet's label is not trustworthy.
  Until migration 0003 (28 October) only the account that synced a tablet
  last could read its row, so every other account on a shared tablet was
  refused and sent nothing, while the tablet still looked synced.
- `received_progress` (summaries imported over Bluetooth) is not synced;
  each tablet syncs its own records instead.
- The Content page knows a tablet's lesson versions only from its last
  sync. A tablet that never syncs, such as one with the offline-only build,
  does not appear there; check it in Teacher tools → About this build.
- Withdrawing a release stops it being offered, but a tablet that installed
  it keeps it; a correction goes out as a newer version.
- The portal names lessons and counts exercises from `admin/lib/curriculum.ts`,
  generated from the packages in the repository. After publishing a new
  lesson, run `npm run curriculum` in `admin/` and deploy the portal again,
  or the portal shows the new lesson by its id.
- The laptop used for the demo resolved Supabase's address in 15 to 30 s at
  times (its router's DNS). Since 28 October the portal's server keeps its
  connections to Supabase for a minute and remembers the address
  (`admin/lib/connections.ts`), so only the first request after the server
  starts waits for DNS; a public DNS server or a phone hotspot still helps
  the tablet's sync.

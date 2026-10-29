# Tutor admin portal

A web portal for teachers and admins to monitor activity synced from the offline tutoring tablets (see `../app`). It reads the Supabase tables defined in `../supabase/migrations/`: accounts, tablets, sessions, attempts, hints and solutions, and tutor requests.

Every query runs as the signed-in user, so row-level security applies. The portal uses only the publishable key. Never put a `service_role` or secret key in it.

Only `teacher` and `admin` accounts can use it. An admin reads every account and record, manages accounts and classes, and approves teacher requests; a teacher reads only the students in their own classes (migration 0005), and does not see the Tablets page.

## Setup

Requires Node 20.9 or newer.

1. Run the files in `../supabase/migrations/` once each, in order (`0001_…` to `0005_…`), in the Supabase SQL Editor; each file runs once. Until then the pages show which files are missing.
2. Create `.env.local` from `.env.example` and fill in your project URL and publishable key.
3. Install and start:

```
npm install
npm run dev
```

Open http://localhost:3000. Other scripts: `npm run lint`, `npm run typecheck`, `npm run build`.

To present or demonstrate the portal, run the production build instead: it is
faster and has no development badge in the corner.

```
npm run build
npm run start
```

## Make the first admin

Create an account (for example in Supabase Authentication, Add user, with a password). Then in the SQL Editor:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```

Sign in at `/login`. Further teachers and admins are managed on the Users page.

## Lesson and exercise names

`lib/curriculum.ts` is generated from `../curriculum/rw_s6_mathematics/packages/{u1,u4,u5,u9}`. After the curriculum changes, regenerate it with `npm run curriculum`. To add a unit, add its folder name to `units` in `scripts/generate-curriculum.mjs`.

## Deploy to Vercel

1. Import the repository in Vercel and set the Root Directory to `admin`.
2. Add the environment variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Deploy. In Supabase, Authentication, URL Configuration, add the Vercel URL to the allowed URLs.

## Notes

- `proxy.ts` is the Next.js 16 name for middleware. It refreshes the session and redirects signed-out visitors to `/login`.
- Timestamps show in UTC for the first render, then in the viewer's local time.
- Speed: `instrumentation.ts` installs `lib/connections.ts` when the server starts, which keeps connections to Supabase open for 60 s and remembers Supabase's address, refreshing it in the background. `lib/auth.ts` checks the session token locally (`getClaims`, the project signs with ES256), and each page starts its queries together with the staff check. Measurements: `../docs/evidence/portal-speed/`.
- Tutor statistics read up to 20,000 events (20 pages of 1,000); the activity feed shows the latest 100.

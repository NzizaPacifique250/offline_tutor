# Admin portal speed, before and after (28 October 2026)

The portal felt slow, and on this laptop it sometimes failed with "fetch
failed". Two things caused it, and both were measured, changed and measured
again on the same evening.

- **The network path to Supabase.** Node closes an idle connection after
  4 s, so most page loads opened a new one, and every new connection asked
  the router's DNS server for Supabase's address. That lookup took 5 to 30 s
  here, and past 10 s Node gives up ("Connect Timeout", shown as "fetch
  failed"). Now `admin/lib/connections.ts` keeps connections for 60 s and
  remembers the address, refreshing it in the background.
- **Round trips on every page.** Each page asked Supabase who was signed in
  (`getUser`), then read the profile, and only then started its own queries.
  Now the token is checked locally (`getClaims`; the project signs with
  ES256), and each page starts its queries together with the profile read.

## Signed in, through the portal (`measure.mjs`)

A test student account (`portal-speed-check-…@example.com`) signed in
through the sign-in form; each page then runs the proxy, the session check
and the profile read before sending a student to `/no-access`, which is the
part every page shares. Five pages, three rounds back to back, then three
single requests after 15 s idle.

| | Before, run 1 | Before, run 2 | After, run 1 | After, run 2 |
|---|---|---|---|---|
| Back to back, median | 467 ms | 505 ms | 350 ms | 364 ms |
| Back to back, slowest | 10,828 ms | 694 ms | 700 ms | 550 ms |
| After 15 s idle | 5,613 / 525 / 5,722 ms | 5,864 / 604 / 5,547 ms | 455 / 411 / 428 ms | 356 / 498 / 417 ms |
| Sign-in | 1,264 ms | 1,413 ms | 8,422 ms | 989 ms |

The 8.4 s sign-in was the first request after the server started, while
its first DNS lookup was still in flight; only that request waits.
Files: `before-1.json`, `before-2.json`, `after-1.json`, `after-2.json`.

## The overview page's ten requests (`replay-overview.mjs`)

Staff pages could not be opened without a staff password, so this replays
the overview page's requests directly: the old way (default connections;
`getUser`, then the profile, then nine queries) and the new way (kept
connections and a remembered address; the profile and nine queries
together), each in its own process, one after the other, at 22:03 to 22:05.

| | Old way | New way |
|---|---|---|
| First request | failed after 10.9 s | 4.9 s |
| Back to back | 6,644 / 1,306 / 922 / 935 / 991 ms | 567 / 629 / 314 / 635 / 636 ms |
| After 15 s idle | failed after 10.5 s / 4,863 ms / failed after 10.5 s | 345 / 317 / 480 ms |

File: `replay-results.txt`. Earlier replays, run between about 21:28 and
21:48, are not counted: they took 30 to 148 s or failed in both ways, and at
about 21:50 the Supabase project itself was not answering (HTTP 522 from
Cloudflare and 30 s timeouts, while Supabase's status page said all systems
were operational). It answered again from 21:53.

## Still to measure

The staff pages end to end with a staff account, which the same
`measure.mjs` does when given a teacher's or admin's email and password.
The test student can be removed in the Supabase SQL Editor:
`delete from auth.users where email like 'portal-speed-check-%@example.com';`

# Admin portal in different browsers

`check_portal.mjs` opens the portal built with `npm run build` and served
with `npm run start`, in Chrome, Firefox and WebKit, at a desktop width
(1280 × 800) and a phone width (390 × 844), with Playwright 1.56.1.

## Signed out (28 October 2026, redesigned portal, `signed-out/`)

| Browser | Width | Every page sends a signed-out visitor to `/login` | Form inside the width, no horizontal scroll | Console errors |
|---|---|---|---|---|
| Chrome 154 | 1280 | yes (`/`, `/users`, `/tutor`) | yes | none |
| Chrome 154 | 390 | yes | yes | none |
| Firefox 142 | 1280 | yes | yes | none |
| Firefox 142 | 390 | yes | yes | none |
| WebKit 26 | n/a | not run: the browser needs `libwoff1` and `libavif16`, which are not installed on this laptop | | |

Pressing "Sign in" with the form empty stays on `/login` (the fields are
required). A made-up account is refused with "That email or password is not
right." The first run, on the earlier design, logged one console error in
Chrome: the site icon was redirected to the sign-in page, so Chrome asked for
a missing `/favicon.ico` (404). `admin/proxy.ts` now serves the icon to
signed-out visitors. `results.json` holds every step with its time, and the
screenshots show the sign-in page in each browser.

## Signed in (29 October 2026, `check_staff.mjs`)

Run against the live Supabase project with a demo teacher and an admin
account, in Chrome at 1280 px. 34 of 34 checks passed:

- **As a teacher:** every page opens; the overview shows where students
  struggle and the Users table their wrong answers and struggles; no account
  creation, role change or account management is shown; the Tablets page
  sends the teacher back to the overview.
- **As an admin:** the Users list shows students and staff in separate
  tables, and a teacher's page shows the classes they teach rather than lesson
  progress; a throwaway teacher account was created, renamed and given
  a new password; Supabase accepted the new password, refused the old one and
  showed the role in the account's app metadata; the account was deleted and
  could no longer sign in.
- **Classes:** the admin created a class taught by the demo teacher and added a
  throwaway student; the teacher then saw exactly the students in their
  classes and no other account, saw the class but no class management; the
  class and the student were deleted afterwards.

The screenshots and the result file of that run name real students, so they
are kept out of the repository.

## Content page (29 October 2026, `check_content.mjs`)

Run against the live Supabase project after migration 0006, signed in as an
admin, in Chrome at 1280 px and 360 px, with a test release of Unit 1 made
from a copy of its package with only the version raised. 16 of 16 checks
passed (`content/results.json`): the menu has Content; the release file was
published for one tablet and listed as offered with the database's checksum,
which is the file's SHA-256; the downloaded file was byte for byte the one
published; the same version again was refused as not newer, and a file that
is not a lesson package as not a release file; withdrawing and offering it
again worked; at 360 px the tab bar's seven links fit with nothing scrolling
sideways. The first run, on the release before, passed 14 of 16: the two
refusal checks waited for an address the previous step had already left in
the address bar, so the script now sends each form from a clean page. The
tablet side of the same test is in
[`../lesson-updates-2026-10-29/`](../lesson-updates-2026-10-29/).

## Again after the rename to Clevo AI (29 October 2026)

The portal was renamed and the live project cleaned of test accounts, so
every check ran again on that build, with the demo teacher and the admin
account kept for the demonstration. Signed out, `check_portal.mjs` passed in
Chrome 154 and Firefox 142 at both widths with no console errors (WebKit
still needs the two missing libraries). Signed in, `check_staff.mjs` passed
34 of 34; its throwaway accounts and class were deleted at the end. Its
first try stopped when this laptop's DNS stalled past four quick retries and
left one throwaway account, which was deleted by hand; the script now waits
five seconds between up to eight tries. `check_content.mjs` passed 18 of 18
(`content/results.json`), now also checking that a teacher sees no Content
page and cannot download a release; its release was deleted afterwards.


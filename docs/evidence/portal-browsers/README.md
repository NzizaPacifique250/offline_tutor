# Admin portal in different browsers

`check_portal.mjs` opens the portal built with `npm run build` and served
with `npm run start`, in Chrome, Firefox and WebKit, at a desktop width
(1280 × 800) and a phone width (390 × 844), with Playwright 1.56.1.

## Signed out (28 October 2026, `signed-out/`)

| Browser | Width | Every page sends a signed-out visitor to `/login` | Form inside the width, no horizontal scroll | Console errors |
|---|---|---|---|---|
| Chrome 154 | 1280 | yes (`/`, `/users`, `/tutor`) | yes | 1: `/favicon.ico` is missing (404) |
| Chrome 154 | 390 | yes | yes | none |
| Firefox 142 | 1280 | yes | yes | none |
| Firefox 142 | 390 | yes | yes | none |
| WebKit 26 | — | not run: the browser needs `libwoff1` and `libavif16`, which are not installed on this laptop | | |

Pressing "Sign in" with the form empty stays on `/login` (the fields are
required). `results.json` holds every step with its time, and the
screenshots show the sign-in page in each browser.

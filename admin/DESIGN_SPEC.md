# Admin portal design spec

Scope: a visual and usability pass over the existing portal. Same routes, same Supabase queries, same server actions, same `window.confirm` on every role change. No new dependencies. Stack stays Next.js 16, React 19, Tailwind 4, server components. Written to be built in one evening and shown on a projector tomorrow.

Direction in one line: match the tablet app (navy, cool grey, calm green/amber/red), put a dark navy sidebar and one big number on every page, and replace bare tables with bars, rings and badges that carry their own text.

Rules that apply everywhere:

- 4 px grid. Every padding, margin and gap is a multiple of 4 (Tailwind steps 1, 2, 3, 4, 5, 6, 8, 10, 12).
- Two weights in running text (400 and 600). 500 is for buttons, nav items and badges only.
- Radius scale only: 0, 4, 8, 12, 16, full. Nothing else.
- Numbers always `tabular-nums`, right-aligned in tables.
- Status is always icon plus text plus colour. Never colour alone.
- Copy: plain, second person, no exclamation marks, no words like "powerful" or "seamless".
- After the pass, `grep -rE "slate-|amber-|emerald-|brand-|teal-" app components` must return nothing.

---

## 1. Intent

What each page must let a teacher grasp in five seconds.

| Page | Five-second takeaway | Headline element |
|---|---|---|
| Sign in | This is the staff side of the tutor app, and where to type. | Product name plus the two fields |
| No access | Why you cannot enter, and what to do next. | The reason sentence |
| Overview | "Is my class working this week, and does anything need me?" | Attempts in the last 7 days, big, on a navy card |
| Users | Who is waiting for approval, and how far each student has got. | Pending requests (admin) then the progress bar per student |
| User detail | How far this one student is through the four lessons. | "7 of 20 exercises correct" with a progress ring |
| Tablets | Which tablets have synced recently and which have not. | "3 of 4 tablets synced in the last 24 hours" |
| Activity | What happened most recently, and who did it. | Day-grouped feed with event-type badges |
| Tutor | How long a student waits for the on-device tutor. | Median first-token time, big |

---

## 2. Hierarchy

Order of attention per page. Item 1 is the only element that gets display size.

**Sign in**
1. Product name and one-line purpose (left navy panel on desktop, strip on phone).
2. Email and password fields.
3. Sign in button (full width, navy).
4. Error notice, when present (appears above the fields so it is seen first, `role="alert"`).

**No access**
1. Lock icon and heading "Your account does not have access yet".
2. Reason (waiting for approval, wrong role, or setup missing).
3. Signed-in email.
4. Sign out button.

**Overview**
1. Pending-requests strip (only when there is at least one; amber, top of page).
2. Hero card: attempts in the last 7 days (display size), then sessions and tutor requests for the same week.
3. Share-correct ring (all time).
4. Account counts (students, teachers, admins, pending).
5. Tutor requests by outcome (stacked bar plus legend with counts).
6. Tablets and their last sync (status badges).

**Users**
1. Pending teacher requests (admin only): cards with Approve as the single primary button.
2. Role filter with counts.
3. Accounts table: name, then exercises-correct bar, then last activity.
4. Change role control (admin only, quiet, last column).

**User detail**
1. Name, role badge, code.
2. Hero: exercises correct as a ring plus "7 of 20".
3. Four counts (attempts, hints, solutions, tutor requests).
4. Progress by lesson: four cards with one pip per exercise.
5. Recent attempts.
6. Recent tutor requests.

**Tablets**
1. Summary sentence (how many synced in 24 h).
2. One card per tablet: status badge, last sync, then details.

**Activity**
1. Summary line ("Latest 100 events") and filter chips with counts.
2. Feed grouped by day, newest first.
3. Detail column (last, truncated).

**Tutor**
1. Hero: median first token and median total time for generated replies.
2. Requests by outcome (horizontal bars).
3. Response time by lesson (median and 95th percentile bars).
4. Full timing table (the exact numbers).

---

## 3. Layout

### 3.1 App shell

Replaces the top bar in `app/(portal)/layout.tsx`.

**Desktop, 1024 px and up: fixed left sidebar, 240 px wide.**
- `aside` is `fixed inset-y-0 left-0 w-60 bg-primary text-white flex flex-col px-4 py-6`.
- Top: brand block. 32 px logo mark (white rounded-8 square holding three ascending navy bars, inline SVG), then "Tutor admin" (16/600) with "Senior Six Advanced Mathematics" under it (12, `text-white/75`).
- Middle: `nav aria-label="Main"`, `mt-8 flex flex-col gap-1`. Five items: Overview, Users, Tablets, Activity, Tutor. Each item is `h-10 rounded-md px-3 gap-3 flex items-center text-sm font-medium`, with a 20 px icon on the left.
  - Idle: `text-white/80`. Hover: `bg-white/10 text-white`.
  - Current (`aria-current="page"`): `bg-white/15 text-white font-semibold`, plus a 4 px wide, 20 px tall white pill at the left edge of the item (`before:` pseudo-element, `before:absolute before:-left-4`; give the item `relative`). This is the "you are here" marker; it is not colour-only because of the pill shape and weight change.
  - Focus: `outline-white` (the global outline colour is overridden inside the sidebar).
- Bottom (`mt-auto`): account block with a 32 px avatar (initials), name (14/600, truncated), role in 12 px `text-white/75`, then a Sign out button (`variant="sidebar"`: `h-9 w-full rounded-md border border-white/25 text-sm text-white hover:bg-white/10`, logout icon on the left).
- Content wrapper: `lg:pl-60`.

**Phone and tablet, below 1024 px: slim top bar plus bottom tab bar.**
- Top bar: `sticky top-0 z-30 h-14 bg-primary text-white flex items-center justify-between px-4`. Left: logo mark and "Tutor admin". Right: account `<details>` (no JavaScript). Summary is the 32 px avatar; the panel is `absolute right-4 top-12 w-64 rounded-lg bg-surface text-ink shadow-pop p-4` showing name and role, then the Sign out button (`variant="default"`).
- Bottom tab bar: `fixed bottom-0 inset-x-0 z-30 h-16 bg-surface border-t border-line grid grid-cols-5 pb-[env(safe-area-inset-bottom)]`. Each tab is a column: 24 px icon over a 12 px label, `h-full`, min target 64 x 48. Idle `text-muted`; current `text-primary font-semibold` with a 24 x 4 px primary pill above the icon (top of the tab). Labels are always visible, so the nav works at 375 px (5 x 75 px).
- Main gets `pb-24` so the tab bar never covers content.
- Both bars are rendered by the same `Nav` client component using one list of links; CSS (`hidden lg:flex` and `lg:hidden`) chooses which is visible. Link list is defined once.

**Skip link:** first element in the body, `sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 btn btn-primary`, text "Skip to content", targets `<main id="content">`.

### 3.2 Page frame

```
<main id="content" class="mx-auto w-full max-w-6xl px-4 py-6 pb-24 md:px-6 lg:px-8 lg:py-8 lg:pb-8">
```
- Max content width 1152 px (`max-w-6xl`). With the 240 px sidebar this fills a 1440 px screen without stretching and reads well on a projector.
- Vertical rhythm: header to first block 24 px (`mb-6`); between blocks 24 px (`gap-6`); between titled sections 32 px (`mt-8`).
- Grids use `grid gap-4 md:gap-6`. Breakpoints: base (under 640) one column, `sm` 640 two-column stats, `md` 768 two columns for panels, `lg` 1024 sidebar appears and 12-column layouts apply.

### 3.3 Page header

`PageHeader` becomes: optional breadcrumb slot, `h1`, description, optional `actions` slot on the right, optional problem or setup block.
- `h1`: `text-title font-semibold tracking-tight text-ink` (28 px, line-height 1.2).
- Description: `mt-2 max-w-2xl text-base text-muted`.
- Layout: `flex flex-wrap items-end justify-between gap-4`. On phone the actions drop under the description.

### 3.4 Per-page block layout

Use `lg:` columns of a 12-column grid (`lg:grid-cols-12`) unless stated.

**Sign in** (`app/login/page.tsx`)
- `lg:grid lg:grid-cols-2 min-h-screen`.
- Left panel (hidden below `lg`, replaced by a 64 px navy strip with the logo): `bg-primary text-white p-12 flex flex-col justify-between`. Logo block at top. Middle: 28/1.2 line "Follow your class, tablet by tablet." and three plain lines in 16/24 `text-white/85`, each with a 20 px check icon: "See who has been working and how far each student has got.", "Check which tablets have synced.", "Approve teacher accounts and change roles." Bottom: 12 px "Works with the offline maths tutor on the tablets." No illustration, no gradient.
- Right panel: `flex items-center justify-center bg-bg px-4 py-12`. Form card `w-full max-w-sm rounded-xl border border-line bg-surface p-8 shadow-card`. Heading "Sign in" (24/600), under it "Use your teacher or admin account." (14, muted). Fields `mt-6 space-y-4`. Submit is full width, 44 px high, with spinner while pending.
- Phone: strip on top, card fills the width with `p-6`.

**No access** (`app/no-access/page.tsx`)
- Centered card on `bg-bg`, `max-w-md rounded-xl border border-line bg-surface p-8 shadow-card`. 40 px circle with lock icon (`bg-tint text-primary`) above the h1 (24/600). Reason paragraph. For `setupMissing` use `SetupNeeded` (section 5). "Signed in as email" in 14 muted, then Sign out (`default` variant) at the bottom. Centering is earned here because the page has one message and one action.

**Overview** (`app/(portal)/page.tsx`)
```
PageHeader: Overview / "Activity synced from the tablets."
[Pending strip, full width, only if pending > 0]
[ Hero (lg:col-span-8) ][ Ring card: Share correct (lg:col-span-4) ]
[ Students ][ Teachers ][ Admins ][ Pending requests ]     grid-cols-2 lg:grid-cols-4
[ Tutor requests by outcome (lg:col-span-7) ][ Tablets (lg:col-span-5) ]
```
- Remove the three `Section` titles ("Accounts", "Learning", "Last 7 days"); the new groupings carry their own card titles. Keep the data they showed:
  - Hero: `attempts7`, `sessions7`, `tutor7`.
  - Ring: `correct` over `attempts`.
  - Stat cards: students (`roleCount("student") - pending`), teachers, admins, pending.
  - "Tablets" count (old stat) moves into the Tablets panel title: "Tablets (4)".
  - "Attempts" and "Tutor requests" all-time totals appear as the ring card footnote: "Out of 312 attempts. 47 tutor requests in total." (`attempts.data`, `tutorTotal`).
- Hero card: `rounded-xl bg-primary p-6 text-white shadow-card lg:p-8`. Eyebrow "Last 7 days" (12/600, `text-white/75`, uppercase not used). Number `text-display font-semibold tabular-nums` (48 px, line-height 1) with the word "attempts" beside it at 20 px `text-white/85`. Under it one sentence, 16/24: "{sessions7} sessions started and {tutor7} tutor requests." Bottom row: three mini facts in `grid grid-cols-3 gap-4 border-t border-white/20 pt-4 mt-6`, each a 24/600 number over a 12 px label: Sessions (`sessions7`), Tutor requests (`tutor7`), Tablets synced in 24 h (computed from `devices.data`). The sentence under the big number is then dropped when these facts show the same numbers; keep only the zero-state sentence. Hero zero state: number "0", sentence "No attempts in the last 7 days. Attempts appear here after a student answers an exercise and the tablet syncs."
- Pending strip: `flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-warn`; clock icon, "{n} teacher request(s) waiting for approval." and a secondary-style link "Review requests" (arrow icon). Show only when `pending > 0`; for non-admin teachers change the text to "Only an admin can approve them." and omit the link.
- Pending stat card: when `pending > 0` it gets `border-warn/40 bg-warn-soft` and the note "Review them on the Users page."; otherwise standard.
- Tutor outcome panel: `Card` with title "Tutor requests by outcome", `StackedBar` (data: `OUTCOMES` with `byOutcome[i].data`), then a legend list under it, one row per outcome with count and percentage. Keep the old table out of view (the legend is the text equivalent).
- Tablets panel: `Card` with a vertical list (`divide-y divide-line`). Row: tablet label (14/600) and app version (12 muted) on the left; status `Badge` and relative time ("3 h ago") on the right. Footer link "All tablet details" with arrow icon.

**Users** (`users/page.tsx`)
```
PageHeader
[Notice success/error, full width]
[Pending teacher requests: stack of RequestCards, admin only]
[Filter segmented control]
[Accounts table]
```
- Pending section (admin only): section heading "Teacher requests" with a count badge. Each `RequestCard`: `flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line border-l-4 border-l-warn bg-surface p-4 shadow-card`. Left: avatar, name (14/600), "Code {learner_code}, asked {LocalTime}" (12 muted). Right: two forms in a `flex gap-2`: Approve as teacher (`btn btn-primary`, check icon) and Decline (`btn btn-secondary text-bad hover:bg-bad-soft`). Phone: buttons become a `grid grid-cols-2 gap-2 w-full`. Hidden fields and `ConfirmButton` messages unchanged.
- When admin and `pending.length === 0`: one compact line `flex items-center gap-2 text-sm text-muted` with check icon, "No teacher requests are waiting."
- Filter: segmented control `inline-flex gap-1 rounded-md bg-tint p-1`. Items are `Link`s `h-8 px-3 rounded-sm text-sm`, label plus count ("Students 12", count in `tabular-nums text-muted`). Current item: `bg-surface text-primary font-semibold shadow-card` with `aria-current="page"`. Counts come from `overview.data`. On phone the control scrolls horizontally (`max-w-full overflow-x-auto`).
- Accounts table columns (rename and merge, same data):
  1. Learner (sticky first column on phone): avatar, name link, code under it in 12 muted. Header "Learner".
  2. Role: `Badge`. Student `neutral`, Teacher `info`, Admin `info`, each with its word. A student with a teacher request shows a second badge `warn` "Teacher requested" (clock icon).
  3. Attempts (numeric).
  4. Exercises correct: `MiniProgress`, 80 px bar plus "7 of 20" text (right-aligned cell). Denominator is the total number of exercises in `LESSONS` (20), exported as `TOTAL_EXERCISES` from `lib/stats.ts`; clamp at 100 %.
  5. Tutor requests (numeric).
  6. Last activity: relative time on line one ("2 h ago", 14), `LocalTime` under it in 12 muted. Never active: "No activity yet" muted.
  7. Change role (admin only): select `h-9` plus Change button. Own row shows "You" as a neutral badge.
- Row min height 56 px.

**User detail** (`users/[id]/page.tsx`)
```
Breadcrumb: "< All users"
Header: avatar 48, name h1, Role badge, code
[ Hero ring card (lg:col-span-5) ][ 2x2 count cards (lg:col-span-7) ]
Progress by lesson: 2 x 2 LessonCards (md:grid-cols-2)
Recent attempts table
Recent tutor requests table
```
- Breadcrumb: `inline-flex items-center gap-1 text-sm text-muted hover:text-primary`, chevron-left icon, "All users", above the header with `mb-4`.
- Hero card: `Card` with a 96 px `Ring` (value `correctIds.size` over `TOTAL_EXERCISES`) and, to its right, "7 of 20" at `text-display`-minus (32/1.1, 600) with "exercises answered correctly" (14 muted). Zero state: ring empty, "0 of 20", "No exercises answered correctly yet."
- Count cards: Attempts, Hints shown, Solutions shown, Tutor requests as `StatCard` (`grid-cols-2 gap-4`). Hint and solution counts are neutral numbers; no judgement colour.
- `LessonCard`: `Card` p-5. Eyebrow with unit ("Complex Numbers", 12/600 muted), lesson title (16/600, 2 lines max), `Pips` row (one 100 %-wide-split pip per exercise: `flex gap-1`, each pip `h-2 flex-1 rounded-full`, filled `bg-ok` when that exercise id is in `correctIds`, else `bg-line`), and on the line below "3 of 5 correct" (14, tabular) on the left and a progress badge on the right: `Complete` (ok, check), `In progress` (info, clock), `Not started` (neutral, dot). Pips are `aria-hidden`; the text line is the equivalent. For screen readers each card also has a visually hidden list of the exercise labels with "correct" or "not yet" (reuse `exerciseLabel`).
- Recent attempts table columns: When, Exercise (label plus lesson in 12 muted), Answer (`font-mono text-[13px]`, max 240 px, truncate with `title`), Result (`Badge`: `correct` is ok with check; any other verdict is bad with x and the raw verdict text capitalised; `null`-like values neutral), Hints seen (numeric).
- Recent tutor requests: When, Question (max 360 px, 2 lines clamp), Outcome (`Badge` via outcome map), First token and Total time (numeric, `formatMs`).

**Tablets** (`devices/page.tsx`)
```
PageHeader: Tablets
Summary sentence (16/600): "3 of 4 tablets synced in the last 24 hours."
Card grid: grid-cols-1 lg:grid-cols-2 gap-4
```
- The `Table` is replaced by `DeviceCard`s (a tablet has seven facts; one row per tablet is hard to read on a phone). Card `p-5`: row 1: tablet icon in a 40 px `bg-tint` circle, label (16/600), model (14 muted), status `Badge` on the right. Row 2 (`mt-4`): "Last sync" label (12 muted) over relative time at 24/600 and the absolute `LocalTime` in 12 muted. Row 3 (`mt-4 border-t border-line pt-4`): `dl` in `grid grid-cols-2 gap-x-4 gap-y-3 text-sm`: App version, Content versions, First seen, Last user (link underlined, or "–").
- Status is derived by `syncStatus(iso)` in `lib/stats.ts` (see 4.7).
- If more than 8 tablets are ever shown the cards still work; no pagination change.

**Activity** (`activity/page.tsx`)
```
PageHeader
Filter chips (All, Attempts, Hints and solutions, Tutor, Sessions)
Table with day-group rows
```
- Filters are `Link`s to `/activity?kind=attempt|reveal|tutor|session`, filtered on the server from the same 100 events (add a `group` field to `Event`). Counts shown in each chip. Summary line above: "Showing 100 of the latest events." Keep the existing `description`.
- Table: sticky `thead`. A group row before each new day: `<tr><th colSpan={5} scope="rowgroup" className="bg-bg px-4 py-2 text-left text-xs font-semibold text-muted">Today</th></tr>`. Day labels "Today", "Yesterday", then "Mon 26 Oct", computed in `Africa/Kigali` so a late-evening event does not land on the wrong day.
- Columns: Time (`HH:mm`, 14, tabular, `title` shows full local time; the full `LocalTime` is kept for screen readers via `<time>`), Learner (link), Tablet (`font-mono text-xs`, first 8 characters), Event (`Badge` with icon: Session started play icon neutral; Attempt (correct) ok check; Attempt (other) bad x; Hint shown info bulb; Solution shown warn eye; Tutor (outcome) outcome map), Detail (muted, truncate to one line on desktop with `title`, wraps on phone).

**Tutor** (`tutor/page.tsx`)
```
PageHeader: Tutor performance
[ Hero: First token median (lg:col-span-6) ][ Total time median (lg:col-span-6) ]
[ Requests by outcome (lg:col-span-5) ][ Response time by lesson bars (lg:col-span-7) ]
Timing table, all lessons then by lesson (existing tables, kept)
```
- Hero pair: two `Card`s. Left card has a `bg-primary text-white` treatment like the overview hero and is the headline: "First token, median" over `formatMs(firstMedian)` at 48/1, then "95th percentile {p95}" and "{n} generated replies" in 14. Right card is white: "Total time, median", same structure. Note under both: the existing description sentence ("First token is the wait before the answer starts to appear. Percentiles use only requests that generated a reply.").
- Outcome bars: `BarList` over `OUTCOMES` with `events.data` counts, tone from the outcome map, sorted in `OUTCOMES` order (stable).
- Lesson bars: `RangeBars`: one row per lesson in `lessonIds`; label (lesson title, truncated with `title`), then two stacked 8 px bars on one track: the 95th percentile as a lighter bar (`bg-primary/30`), the median as a solid bar (`bg-primary`) on top, scaled against the largest 95th percentile value among all lessons (axis max shown in the footer as "Scale: 0 to {formatMs(max)}"). Values printed at the right in text: "median 1.8 s, 95th 4.1 s". A two-item legend (solid = median, light = 95th percentile) sits under the title.
- The two existing timing tables stay, below, as the exact numbers.

### 3.5 Components to build or change

New (all in `components/`):

| File | Purpose |
|---|---|
| `icons.tsx` | `Icon` component and path map (see 4.6). |
| `badge.tsx` | `Badge tone icon` pill. |
| `card.tsx` | `Card` wrapper with optional `title`, `action`. |
| `avatar.tsx` | Initials circle, sizes 24, 32, 48. |
| `ring.tsx` | Server-rendered SVG progress ring. |
| `bars.tsx` | `StackedBar`, `BarList`, `MiniProgress`, `Pips`, `RangeBars`. |
| `empty-state.tsx` | Icon, title, body, optional link. |
| `submit-button.tsx` | Client; `useFormStatus` pending state with spinner. |
| `setup-needed.tsx` | Block shown when the database setup message comes back. |
| `shell.tsx` | Sidebar, top bar and account menu (server) used by `layout.tsx`. |
| `app/(portal)/loading.tsx` | Skeleton page. |
| `app/(portal)/error.tsx` | Client error boundary with a Try again button. |

Changed:

| File | Change |
|---|---|
| `app/globals.css` | New `@theme`, base styles, `.btn*`, `.field`, `.skeleton`, animations, reduced-motion block. |
| `app/(portal)/layout.tsx` | Sidebar shell, skip link, `main` frame. |
| `nav.tsx` | Icons, desktop and mobile variants from one list. |
| `sign-out-button.tsx` | `variant` prop (`default`, `sidebar`). |
| `page-header.tsx` | Breadcrumb and actions slots, setup detection. |
| `notice.tsx` | Icon per tone, same roles. |
| `stat.tsx` | Becomes `StatCard`; keeps the `dl`, `dt`, `dd` markup. |
| `table.tsx` | New styling, sticky head, numeric headers, `EmptyState` for empty. Head items may be `{ label, numeric?: true }`. |
| `section.tsx` | Heading size and spacing only. |
| `confirm-button.tsx` | Add pending/disabled via `useFormStatus`; still calls `window.confirm`. |
| `lib/stats.ts` | Add `timeAgo`, `syncStatus`, `TOTAL_EXERCISES`, `kigaliDayLabel`. Pure functions; no query changes. |
| `lib/ui.ts` (new) | `OUTCOME_META` (label, tone, icon), `roleTone`, `verdictTone`, `initials`. |

Suggested build order tonight (each step leaves the app working):
1. `globals.css` tokens and base, then grep-replace `slate/amber/emerald/brand` classes.
2. `icons`, `badge`, `card`, `avatar`, `empty-state`, `submit-button`.
3. Shell and `nav`, login, no-access.
4. `table`, `notice`, `page-header`, `stat`.
5. Overview with `ring` and `bars`.
6. Users, user detail.
7. Tablets, Activity, Tutor.
8. `loading.tsx`, `error.tsx`, then check at 1440, 1280, 768 and 375 px.

Optional only if time remains: a 7-day attempts sparkline on the hero. It needs one extra query (`attempts` `created_at` since 7 days, bucketed by day in `Africa/Kigali`), so it is not part of the spec. Everything else uses existing queries only.

---

## 4. Tokens

### 4.1 `@theme` block (replace the current one)

Tailwind 4 turns these into utilities (`bg-surface`, `text-muted`, `border-line`, `rounded-lg`, `shadow-card`, `text-title`). Do not reset the default palette; the grep rule above removes the old classes.

```css
@theme {
  /* Font: system stack, matches the tablet's native text rendering. No download. */
  --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
  --font-mono: ui-monospace, "SF Mono", "Cascadia Mono", "Roboto Mono", Menlo, Consolas, monospace;

  /* Colour: tablet palette. Contrast values are against the surface named. */
  --color-bg: #f4f6f8;            /* page background */
  --color-surface: #ffffff;       /* cards, tables */
  --color-tint: #edf2f8;          /* table head, tracks, filter bg, icon circles */
  --color-tint-strong: #dce7f4;   /* avatars, hover on tint */
  --color-line: #d3dce6;          /* dividers, card borders (decorative) */
  --color-field: #7c8b99;         /* input and select borders, 3.5:1 on white */
  --color-ink: #16202b;           /* body text, 15.9:1 on white */
  --color-ink-2: #3a4856;         /* secondary text, 9.4:1 on white */
  --color-muted: #566573;         /* muted text, 6.0:1 on white, 5.5:1 on bg */
  --color-primary: #14467e;       /* 9.7:1 on white */
  --color-primary-hover: #0f3a68;
  --color-primary-press: #0b2e54;
  --color-ok: #1d6b45;            /* 5.7:1 on ok-soft */
  --color-ok-soft: #e6f4ec;
  --color-warn: #8a5a00;          /* 5.5:1 on warn-soft */
  --color-warn-soft: #fff6e5;
  --color-bad: #8a2e2e;           /* 7.2:1 on bad-soft */
  --color-bad-soft: #fbe9e9;
  /* Chart fills (need 3:1 on white; labels carry the meaning) */
  --color-chart-ok: #1d6b45;
  --color-chart-warn: #b7791f;    /* 3.6:1 on white */
  --color-chart-bad: #a63d3d;     /* 6.2:1 on white */
  --color-chart-info: #14467e;
  --color-chart-neutral: #7c8b99; /* 3.5:1 on white */

  /* Radius scale: 0, 4, 8, 12, 16, full. These replace Tailwind's defaults. */
  --radius-sm: 4px;    /* pips, chips inside segmented control */
  --radius-md: 8px;    /* buttons, inputs, nav items */
  --radius-lg: 12px;   /* cards, tables */
  --radius-xl: 16px;   /* hero cards, login card */
  /* rounded-full for badges, avatars, bars; rounded-none for 0 */

  /* Shadows: two only. */
  --shadow-card: 0 1px 2px rgb(22 32 43 / 0.06), 0 0 0 1px rgb(22 32 43 / 0.02);
  --shadow-pop: 0 8px 24px rgb(22 32 43 / 0.12);

  /* Type scale (1.25-ish steps, sizes with line-heights) */
  --text-xs: 0.75rem;   --text-xs--line-height: 1rem;      /* 12/16 labels, badges */
  --text-sm: 0.875rem;  --text-sm--line-height: 1.25rem;   /* 14/20 table, UI */
  --text-base: 1rem;    --text-base--line-height: 1.5rem;  /* 16/24 body */
  --text-lg: 1.25rem;   --text-lg--line-height: 1.75rem;   /* 20/28 card numbers, panel titles */
  --text-xl: 1.5rem;    --text-xl--line-height: 1.75rem;   /* 24/28 stat numbers */
  --text-title: 1.75rem; --text-title--line-height: 1.2;   /* 28 page title */
  --text-display: 3rem; --text-display--line-height: 1;    /* 48 hero number */

  /* Motion */
  --ease-enter: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-exit: ease-out;
}
```

Note on muted: the tablet's `#6B7A88` is 4.4:1 on white and 4.1:1 on `#F4F6F8`, which fails AA for text. The portal uses `#566573` for text and keeps `#7C8B99` only for borders and chart neutrals.

### 4.2 Base styles (replace the rest of `globals.css`)

```css
@layer base {
  html { color-scheme: light; }
  body { @apply bg-bg text-ink font-sans antialiased; font-feature-settings: "tnum" 0; }
  h1, h2, h3 { text-wrap: balance; }
  :focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; border-radius: inherit; }
  .on-primary :focus-visible { outline-color: #fff; }
  ::selection { background: var(--color-tint-strong); }
}
```
Apply the class `on-primary` to the sidebar, top bar and hero cards.

### 4.3 Components in CSS (`@layer components`)

```css
.btn { @apply inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium
  transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50; }
.btn-primary { @apply bg-primary text-white hover:bg-primary-hover active:bg-primary-press; }
.btn-secondary { @apply border border-field bg-surface text-ink hover:bg-tint active:bg-tint-strong; }
.btn-lg { @apply h-11 text-base; }
.field { @apply block h-11 w-full rounded-md border border-field bg-surface px-3 text-base text-ink
  placeholder:text-muted focus:border-primary; }
.field-sm { @apply h-9 px-2 text-sm; }
.link { @apply font-medium text-primary underline decoration-primary/30 underline-offset-4
  transition-colors duration-150 hover:decoration-primary; }
.skeleton { @apply rounded-md bg-tint; animation: pulse 1.6s ease-in-out infinite; }
```

### 4.4 Spacing rhythm

| Use | Value |
|---|---|
| Page padding | 16 (base), 24 (md), 32 (lg) |
| Gap between blocks | 16 base, 24 md and up |
| Between titled sections | 32 |
| Card padding | 20 (`p-5`), hero 24 mobile and 32 desktop |
| Table cell | 16 horizontal, 12 vertical (44 px rows; 56 px on Users) |
| Badge | 8 horizontal, 2 vertical, 4 icon gap |
| Control heights | 32 (chips, small), 36 (buttons), 40 (nav), 44 (inputs, primary on login), 56 (top bar) |

### 4.5 Type usage

| Role | Class |
|---|---|
| Page title | `text-title font-semibold tracking-tight` |
| Hero number | `text-display font-semibold tabular-nums` |
| Stat number | `text-xl font-semibold tabular-nums` |
| Card title | `text-base font-semibold` |
| Body | `text-base` (16/24) |
| Table text | `text-sm` |
| Table header | `text-xs font-semibold text-muted` |
| Label, note, eyebrow | `text-xs text-muted` (eyebrows 600) |
| Maths answers | `font-mono text-[13px]` |

### 4.6 Icons

No library. `components/icons.tsx` exports one `Icon` component.

```tsx
export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
      {paths[name]}
    </svg>
  );
}
```
Icons are decorative (`aria-hidden`); the text beside each one carries the meaning. Use an icon only inside nav, badges, notices, empty states and buttons that benefit from it. Do not put an icon next to a heading that repeats the heading.

Path data (24 x 24 viewBox):

```tsx
const paths = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  users: <><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.5c2 .7 3.5 2.6 3.5 5.5"/></>,
  tablet: <><rect x="5" y="2.5" width="14" height="19" rx="2.5"/><path d="M11 18.5h2"/></>,
  activity: <path d="M3 12h4l3-8 4 16 3-8h4"/>,
  tutor: <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4 4v-4H6.5A2.5 2.5 0 0 1 4 13.5z"/>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5"/>,
  x: <path d="M6 6l12 12M18 6 6 18"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  alert: <><path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.1"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.8v.1"/></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6"/>,
  back: <path d="m15 5-7 7 7 7"/>,
  logout: <path d="M10 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H10M15 8l4 4-4 4M19 12H9"/>,
  inbox: <path d="M3 13.5 5.8 5.5h12.4l2.8 8M3 13.5v4A2.5 2.5 0 0 0 5.5 20h13a2.5 2.5 0 0 0 2.5-2.5v-4M3 13.5h5l1 2.5h6l1-2.5h5"/>,
  hint: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
  play: <path d="M8 5.5v13l11-6.5z"/>,
  pencil: <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/>,
  dot: <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/>,
};
```

Logo mark (`Logo` in `shell.tsx`): 32 x 32 rounded-8 white square; inside, three bars of heights 8, 14, 20 at x 8, 14, 20 (4 wide, radius 1), fill `#14467E`. Used in sidebar, top bar, login panel. For the browser tab, add `app/icon.svg` with the same mark on navy.

### 4.7 Status vocabulary (`lib/ui.ts`)

Badge tones: `ok` (`bg-ok-soft text-ok`, check), `warn` (`bg-warn-soft text-warn`, alert or clock), `bad` (`bg-bad-soft text-bad`, x), `info` (`bg-tint text-primary`, info), `neutral` (`bg-tint text-ink-2`, dot). Badge classes: `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-current/15`.

| Outcome | Label | Tone | Icon | Chart fill |
|---|---|---|---|---|
| generated | Generated | ok | check | `chart-ok` |
| stored | Stored | info | info | `chart-info` |
| declined | Declined | warn | alert | `chart-warn` |
| cancelled | Cancelled | neutral | dot | `chart-neutral` |
| timed-out | Timed out | warn | clock | `chart-warn` |
| failed | Failed | bad | x | `chart-bad` |
| no-model | No model | bad | alert | `chart-bad` |

Tablet sync status from `last_sync_at` (computed by `syncStatus` in `lib/stats.ts`, using `Date.now()` there, not in components):

| Age | Label | Tone |
|---|---|---|
| 24 h or less | Synced in the last 24 h | ok |
| 24 h to 7 days | Synced this week | info |
| Over 7 days | Not synced for over 7 days | warn |
| none | Never synced | neutral |

Role badges: student neutral, teacher info, admin info. Verdict: `correct` ok with check, anything else bad with x and its own text.

Helpers: `timeAgo(iso)` returns "just now", "12 min ago", "3 h ago", "2 days ago", or "–". `initials(name, code)` returns up to two letters from the name, falling back to the first two characters of the code.

### 4.8 Chart specifications

All charts are server-rendered, no dependency. Every chart sits next to text that gives the same numbers, and the wrapper has `role="img"` with an `aria-label` summary (or the chart is `aria-hidden` when a table or legend with the same numbers follows directly).

**Ring** (`ring.tsx`): `<svg viewBox="0 0 96 96" width=96 height=96>`; track circle `cx=48 cy=48 r=40 stroke=#d3dce6 stroke-width=10 fill=none`; value circle same geometry, `stroke-linecap="round"`, `stroke-dasharray="{pct*251.33} 251.33"`, `transform="rotate(-90 48 48)"`, stroke `chart-ok` for share correct, `primary` for lesson progress. Centre text 20/600 tabular (`72%`). Aria label: "72 percent correct". Zero total: track only and centre "–".
- Overview: value = `correct.data / attempts.data`.
- User detail: value = `correctIds.size / TOTAL_EXERCISES`, centre shows the percentage and beside it "7 of 20".

**StackedBar** (overview): `div.flex.h-3.gap-0.5.overflow-hidden.rounded-full`, one `div` per outcome with count above zero, `style={{ flexGrow: n }}` and a minimum width of 4 px, background from the outcome's chart fill. Under it a legend list: swatch (12 px square rounded-sm), label, count (tabular, right), percentage (muted). Segments are separated by gaps and every colour has a labelled legend row, so meaning is not colour-only. Wrapper `aria-label="Tutor requests by outcome: 40 generated, 4 stored, ..."`.

**BarList** (tutor outcomes): row grid `grid-cols-[7rem_1fr_3.5rem] items-center gap-3` (label, track, value). Track `h-2 rounded-full bg-tint`; fill `h-2 rounded-full`, width `n / max * 100%`, outcome fill colour; minimum 4 px if `n > 0`. Value: count, then percentage in muted under 640 px hidden, shown beside the count on larger screens.

**MiniProgress** (users table): 80 x 8 track `bg-tint rounded-full`, fill `bg-chart-ok`, width `correct / TOTAL_EXERCISES`; text "7 of 20" 14 tabular to the right. Track is decorative; the text is the data.

**Pips** (lesson card): see 3.4.

**RangeBars** (tutor lessons): see 3.4. Axis is a single shared maximum so lessons compare fairly. If a lesson has no 95th value, show "–".

**Sparkline:** not used (see optional note in 3.5).

### 4.9 Table styling

```
wrapper: overflow-x-auto rounded-lg border border-line bg-surface shadow-card
table:   w-full min-w-max text-left text-sm
thead:   sticky top-0 bg-tint
th:      px-4 py-3 text-xs font-semibold text-muted  (numeric: text-right)
tr:      border-t border-line first:border-t-0 transition-colors duration-150 hover:bg-bg
td:      px-4 py-3 align-middle   (numeric: text-right tabular-nums)
sticky first col below 640 px: sticky left-0 bg-surface z-10 (hover: group-hover:bg-bg)
```
The `caption` stays `sr-only`. Header cells keep `scope="col"`. Use `align-middle` now that cells hold badges and avatars.

---

## 5. States

### 5.1 Loading

- Route-level: `app/(portal)/loading.tsx` shows the sidebar-less content skeleton: a 28 px by 200 px `skeleton` bar for the title, a 16 px by 320 px bar for the description, then a row of four 96 px high `skeleton` cards (`rounded-lg`) and one 280 px high card. Wrap in `aria-busy="true"` with a visually hidden "Loading".
- Form submit: `SubmitButton` shows a 16 px spinner (SVG arc, `animate-spin`) before the label and changes the label ("Signing in…", "Saving…"), is `disabled`, and sets `aria-disabled`. The width does not change (label swaps inside a `min-w` equal to the longer text).
- Role-change and approve forms: `ConfirmButton` uses `useFormStatus`; while pending it is disabled and shows the spinner. The confirm dialog still runs first via `window.confirm`.

### 5.2 Empty

Use `EmptyState` (`rounded-lg border border-dashed border-field bg-surface px-6 py-10 text-center`; 40 px `bg-tint text-primary` circle with an icon, title 16/600, body 14 muted `max-w-md mx-auto`, optional `link`). Inside a half-width card use `py-6`. Centering is justified here (single message). Copy:

| Where | Title | Body |
|---|---|---|
| Overview hero | (in hero) | "No attempts in the last 7 days. Attempts appear here after a student answers an exercise and the tablet syncs." |
| Overview ring | "No attempts yet" | "The share correct appears after the first attempt syncs." |
| Overview outcomes | "No tutor requests yet" | "They appear when a student asks the tutor a question and the tablet syncs." |
| Overview and Tablets | "No tablet has synced yet" | "Turn sync on in the tablet app under the topic list." |
| Users, no accounts | "No accounts to show" | "Students appear here after they create an account in the tablet app and it syncs." |
| Users, filter empty | "No {students/teachers/admins} yet" | "Show all accounts" as a link back to `/users`. Teachers: "Approve a teacher request to add one." |
| Users, no pending (admin) | one-line row | "No teacher requests are waiting." |
| User detail, attempts | "No attempts yet" | "{Name} has not answered an exercise yet." |
| User detail, tutor | "No tutor requests yet" | "{Name} has not asked the tutor a question yet." |
| Activity | "No activity yet" | "Events appear here after a tablet syncs." |
| Activity filter empty | "No {kind} in the latest 100 events" | "Show all events" link. |
| Tutor outcomes | "No tutor requests yet" | "They appear when a student asks the tutor a question and the tablet syncs." |
| Tutor timing | "No generated replies yet" | "Response times appear after the tutor writes its first answer on a tablet." |

Heroes with no data still render at full size with zeros and a muted explanation so the page does not collapse during the demo. Lesson cards with no attempts show empty pips and "Not started".

### 5.3 Error and setup-needed

- Query problem (any `problem` string): `Notice tone="problem"` under the header. Layout `flex gap-3 rounded-lg border border-warn/30 bg-warn-soft p-4 text-sm text-ink`, alert icon in `text-warn` on the left, bold lead "Some data could not be loaded." then the message. `role="alert"`. Page content below still renders with whatever loaded.
- Setup needed: `isSetupProblem(problem)` (compare with `SETUP_MESSAGE`) renders `SetupNeeded` instead: `rounded-xl border border-warn/30 bg-warn-soft p-6`, title "The database is not set up yet" (16/600), body "Run this file in the Supabase SQL Editor, then reload the page.", then the path `supabase/migrations/0001_accounts_and_sync.sql` in `font-mono text-[13px] bg-surface border border-line rounded-md px-3 py-2`. Also used on No access.
- Not found (`users/[id]` bad id): keep `notFound()`; add `app/(portal)/not-found.tsx` with an `EmptyState` "That page does not exist" and a link "Back to Overview".
- Route error boundary: `app/(portal)/error.tsx` (client) with `EmptyState` icon alert, title "This page could not load", body "Try again. If it keeps failing, check the connection to Supabase.", and a primary `Try again` button calling `reset()`.
- Login error: `Notice tone="problem"` above the form; add `aria-describedby` linking the inputs to the notice id.

### 5.4 Success and error notices (Users page `?notice=` and `?error=`)

- Success: `Notice tone="success"` with check icon, `border-ok/30 bg-ok-soft`, `role="status"`.
- Error: problem tone as above, `role="alert"`.
- Place them directly under the header, `mb-6`. They enter with a 200 ms fade (see Motion). They do not auto-dismiss (query-string based, and teachers read slowly); the next navigation clears them.
- Always keep the Notice text exactly as returned by the server action.

### 5.5 Interactive element states

| Element | Default | Hover | Focus-visible | Active | Disabled |
|---|---|---|---|---|---|
| Primary button | `bg-primary text-white` | `bg-primary-hover` | 2 px primary outline, 2 px offset | `bg-primary-press` | 50 % opacity, `cursor-not-allowed` |
| Secondary button | white, `border-field` | `bg-tint` | same outline | `bg-tint-strong` | 50 % opacity |
| Decline button | secondary with `text-bad` | `bg-bad-soft` | same | `bg-bad-soft` | 50 % opacity |
| Link (`.link`) | navy, underline at 30 % | underline 100 % | outline | none | n/a |
| Sidebar item | `text-white/80` | `bg-white/10` | white outline | `bg-white/20` | n/a |
| Bottom tab | `text-muted` | `text-ink` | outline | `bg-tint` | n/a |
| Filter chip | transparent | `bg-tint-strong` | outline | none | n/a |
| Input and select | `border-field` | `border-ink-2` | `border-primary` plus outline | n/a | `bg-tint`, `text-muted` |
| Table row | white | `bg-bg` | n/a (row not focusable; links inside are) | n/a | n/a |
| Cards that are links | border `line` | border `field`, `shadow-pop` | outline | none | n/a |

Targets are at least 24 x 24 px (WCAG 2.2); real minimums here are 32 px for chips and 36 px for buttons.

Contrast checks done on the tokens: white on `primary` 9.7:1; `ink` on white 15.9:1; `muted` on white 6.0:1 and on `bg` 5.5:1; `muted` on `tint` 5.3:1; `ok` on `ok-soft` 5.7:1; `warn` on `warn-soft` 5.5:1; `bad` on `bad-soft` 7.2:1; `white/80` on `primary` 7.2:1 (the lowest nav text, `white/75`, is 6.4:1); input border `field` on white 3.5:1.

### 5.6 Responsive behaviour

- 375 px: top bar plus bottom tabs, one column. Stat cards two per row. Tables scroll horizontally with the first column sticky. Hero number drops to 40 px (`text-[2.5rem]`), hero facts stay three columns at 12 px labels.
- 768 px: two-column card grids, bottom tabs still used (sidebar starts at 1024).
- 1280 to 1440 px: sidebar plus 12-column content as specified.
- Projector: body text 16 px, hero 48 px, no text under 12 px, nothing relies on hover.

---

## 6. Motion

All durations 150 to 300 ms. Enter easing `cubic-bezier(0.16, 1, 0.3, 1)`; exit and hover easing `ease-out`. Only transform, opacity and colour animate.

| What | When | Effect | Duration |
|---|---|---|---|
| Page blocks | On route render | Fade in and rise 8 px (`rise` keyframes). Blocks stagger by 40 ms, capped at 5 steps (set `style={{ animationDelay: i * 40 + "ms" }}`) | 240 ms |
| Notices | On render | Fade in, no movement | 200 ms |
| Bars (`StackedBar`, `BarList`, `MiniProgress`, `Pips`, `RangeBars`) | On render | `scaleX` from 0 to 1, `transform-origin: left` | 300 ms, delay 80 ms |
| Ring | On render | `stroke-dasharray` from `0 251.33` to the value (set `--dash` as a CSS variable, animate with `@keyframes ring`) | 300 ms |
| Buttons, links, nav items, rows, chips | Hover and press | Colour and background transition | 150 ms |
| Cards that are links | Hover | Border colour and shadow | 150 ms |
| Account menu panel (phone) | Open | Fade and rise 4 px | 150 ms |
| Submit spinner | While pending | Rotation | 800 ms linear, loops only while a request runs |
| Skeleton | While loading | Opacity 1 to 0.6 and back | 1.6 s loop, loading indicator only |

Keyframes:

```css
@keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes ring { from { stroke-dasharray: 0 251.33; } to { stroke-dasharray: var(--dash) 251.33; } }
@keyframes pulse { 50% { opacity: 0.6; } }
.rise { animation: rise 240ms var(--ease-enter) both; }
.fade { animation: fade 200ms var(--ease-enter) both; }
.grow { transform-origin: left; animation: grow 300ms var(--ease-enter) 80ms both; }
```

Reduced motion (required):

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  .skeleton { animation: none; }
}
```
Because every keyframe animation uses `both` fill, content lands in its final state with no movement. The spinner is replaced by the "Saving…" text change, which stays. Nothing carries information through motion alone. Do not animate on data refresh, sort, or filter changes; those are full page navigations and should feel instant.

---

HANDOFF
- Type tokens: system sans and mono stacks; sizes 12/14/16/20/24/28/48 with line-heights 16/20/24/28/28/1.2/1; weights 400 and 600, plus 500 for controls only; `tabular-nums` on all numbers.
- Color tokens: `bg #F4F6F8`, `surface #FFF`, `tint #EDF2F8`, `tint-strong #DCE7F4`, `line #D3DCE6`, `field #7C8B99`, `ink #16202B`, `ink-2 #3A4856`, `muted #566573` (darker than the tablet's `#6B7A88` to pass AA), `primary #14467E` (+ hover `#0F3A68`, press `#0B2E54`), `ok/warn/bad` and `-soft` pairs from the tablet app, chart fills `chart-ok/warn/bad/info/neutral`.
- Spacing: 4 px grid; page padding 16/24/32; block gap 16/24; section gap 32; card padding 20; table cells 16 x 12. Radius 0/4/8/12/16/full only. Shadows `card` and `pop` only.
- Components needed: Shell (sidebar, top bar, bottom tabs, skip link), Nav, Icon, Badge, Card, Avatar, StatCard, Ring, StackedBar, BarList, MiniProgress, Pips, RangeBars, EmptyState, SubmitButton, SetupNeeded, Notice (icons), PageHeader (slots), Table (restyled), `loading.tsx`, `error.tsx`, `not-found.tsx`, CSS utilities `.btn*`, `.field`, `.link`, `.skeleton`, and the helpers `timeAgo`, `syncStatus`, `TOTAL_EXERCISES`, `kigaliDayLabel`, `OUTCOME_META`.
- Open questions:
  1. Does `learner_overview.exercises_correct` count distinct exercises or correct attempts? The Users bar assumes distinct (max 20); if it counts attempts, compute from `attempts` instead or drop the bar to a plain number.
  2. What `verdict` values exist besides `correct`? The spec treats every other value as a bad badge with its own text.
  3. Should Teachers (not just Admins) see the "Pending teacher requests" strip on Overview? The spec shows it with no link for teachers.
  4. Is the 7-day attempts sparkline wanted tonight? It needs one extra query, so it is excluded.
  5. Real tablet app font? The spec uses the system stack to avoid a font download; swap `--font-sans` if the app ships one.

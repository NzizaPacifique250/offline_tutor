# Walkthrough video: script

The narrated walkthrough for the final version (release 1.3.0), covering
sections A to E of the assignment's technical demonstration. It runs about
17 minutes. Each scene says what is on screen, what to do, and what to
say; the narration is written to be read aloud as it is.

| Rubric section | Scenes |
|---|---|
| A. Core functionalities: what each does, how, the logic behind it | 1 to 7 |
| B. Technical requirements: frontend and backend interaction, data handling, logic | 6, 7, 8 |
| C. Testing with different inputs: expected behaviour, error handling | 2, 3, 6 |
| D. Testing strategies: why, how, results, improvements | 9 |
| E. Performance and compatibility | 10 |

## Before recording

- **Tablet.** ATMPC IT-801B charged, 1.3.0 installed (the release build,
  not `-PofflineOnly`, so the sync scene works), the tutor model installed
  and checked in Teacher tools. Clear old demo learners if they clutter
  Class progress. Wake it and keep it awake:
  `adb shell wm dismiss-keyguard && adb shell svc power stayon true`.
  If adb has lost the tablet: `adb kill-server && adb start-server`.
- **Accounts.** Only demo accounts, never a participant's: for example
  `demo.student.1029@example.com` (created on camera in scene 6) and a
  second one, `demo.teacher.1029@example.com`, created beforehand as
  "Teacher", so a pending request is waiting in scene 7. Your own admin
  account for the portal.
- **Network.** Wi-Fi on at the start of scene 6 only; airplane mode
  everywhere else. On the laptop, use a phone hotspot or set DNS to
  1.1.1.1 before scene 7: the router's DNS has taken 15 to 30 s to resolve
  Supabase and made the portal's sign-in time out.
- **Portal.** `cd admin && npm run build && npm run start`, then open
  http://localhost:3000 in Chrome. Firefox open in a second window for
  scene 10.
- **Terminal.** One terminal at the repository root, font large enough to
  read in the video. Run the scene 9 commands once beforehand so the first
  run on camera is not a cold one.
- **Screen capture.** `app/scripts/present_tablet.sh --record=tablet.mp4`
  shows the tablet in a window on the laptop and records it; record the
  laptop screen and the microphone with your screen recorder.
- **Before scene 3**, open the Unit 1 lesson for about a minute off camera:
  the app prepares the model in the background while a lesson is open,
  which shortens the first answer.

## Scenes

### 0. Opening (0:00, 40 s)

**Show:** the tablet on the topic list, airplane mode visible in the status bar.

**Say:** "This is the Offline Mathematics Tutor, my capstone for Senior Six
Advanced Mathematics in Rwanda. It runs on this ATMPC tablet, a low-cost
Android device with four slow cores and under four gigabytes of memory,
and it works with no internet at all: the lessons, the exercises, the
answer checking and a language model all run on the tablet. Release 1.3.0
adds accounts and an optional sync to a server, with a web portal for
teachers. I will show each feature, how it works inside, how I tested it,
and how it performs."

### 1. Lessons offline (0:40, 70 s) — A

**Do:** On the sign-in screen tap **Continue without an account**, type the
learner code `DEMO-29` and tap **Start**, open the Unit 1 lesson "Operations on complex
numbers in algebraic form", scroll through a worked example.

**Say:** "A learner can study under a code, never a name. The four units
are curriculum packages: JSON files with the book's text, exercises, hints
and answer keys, each with its page in the REB Student's Book. When the
app first starts it imports them into SQLite on the tablet. The formulas are
drawn by KaTeX from files inside the app, so nothing is downloaded. Each
lesson is still marked developer-test, because a Mathematics teacher has
not reviewed it yet."

### 2. Practice and answer checking (1:50, 100 s) — A, C

**Do:** Tap **Practise**. On the first exercise:
1. Tap **Check answer** with the box empty.
2. Type `5 - 3i`, Check answer.
3. Tap **Show hint 1 of 3**.
4. Type `sin(2)`, Check answer.
5. Type `3i+5`, Check answer.
6. Open the solution.

**Say, as each result appears:**
- Empty: "An empty answer is not an attempt; it just asks for an answer."
- `5 - 3i`: "Wrong: 'Not quite'. The tablet checked it itself."
- Hint: "Hints come from the book, one at a time and in order. The worked
  solution stays locked until every hint has been seen or the answer is
  right."
- `sin(2)`: "The checker cannot read a sine, so it says so instead of
  guessing a mark."
- `3i+5`: "Correct, after 3 tries, although I wrote it in a different
  order from the key."
- "How does it know? SymPy proved every key when the package was built,
  but SymPy cannot run on Android. So I wrote a small parser and evaluator
  for complex numbers with pi, e, square roots and logarithms. It turns the
  answer and the key into numbers and compares them within a tolerance.
  For a function, such as the solution of a differential equation, it
  compares the two at several points. Once the solution is open, checking
  stops, so a copied answer never counts."

### 3. The on-device tutor (3:30, 150 s; waits sped up) — A, C

**Do:** Back to the lesson. In "Ask about this topic" type
`how do I multiply two complex numbers?` and send. Wait for step 1 (cut or
speed up the wait, with a caption giving the real time). Tap **Explain this
step more simply**, then **Next step (2)**. Then type `explain
photosynthesis` and send. Finally ask another in-scope question and press
**Cancel** after a few seconds.

**Say:**
- While it starts: "Before the model is called, a router checks that the
  question belongs to one of the lessons, by matching its topic keywords.
  This one does. The prompt carries one short passage, the paragraph of the
  lesson that best matches the question, so the answer follows the book.
  Its instructions never change, so the model can reuse the part of the
  prompt it has already read; that is why I opened the lesson first."
- On step 1: "The model is Qwen2.5-Math, 1.5 billion parameters,
  compressed to 4 bits, running on the tablet's processor. Here it took
  [read the time under the text]. It writes one step, then stops: the app
  cuts each generation at the next step's heading, so the learner tries the
  step before seeing more. Under the text it says which book pages it came
  from, and that it is generated and not reviewed."
- On the simpler explanation and step 2: "The learner sets the pace. The
  next step starts quickly because the earlier text is already processed."
- On photosynthesis: "Out of scope: declined at once. The model is not
  called. None of the four models I tested refused such questions by
  themselves, so the app enforces it."
- On Cancel: "Any request can be cancelled, and after 120 seconds it stops
  by itself; stored hints still work. Every request is logged with its
  outcome and timings."

### 4. Progress and recommendation (6:00, 50 s) — A

**Do:** Back to the topics, tap **My progress**. Then close the app from the
recents screen, reopen it, tap **Continue without an account** and
**Continue** beside `DEMO-29`, open My progress again.

**Say:** "Progress is computed from the saved attempts, never stored as a
separate total: a lesson's mastery is the share of its exercises answered
correctly. The next exercise is the first not yet right, or the worked
example after two wrong answers. After a restart the figures are the same,
because everything is in the tablet's database."

### 5. Teacher tools (6:50, 60 s) — A

**Do:** Tap the learner code at the top right (⇄) to return to the sign-in
screen, tap **Teacher tools (PIN)**, enter the PIN, **Open teacher tools**.
Tap **Open class progress**, tap one learner, go back, then show the model's
status and **Export records**.

**Say:** "Teacher tools are behind a PIN. Class progress lists every
learner code with their score in each unit and marks anyone stuck after
two wrong answers. Students on other tablets can send a progress file over
Bluetooth, and it is merged here by learner code, with no network. The
teacher installs the model from a file: the app checks its size and its
SHA-256 checksum and refuses anything else. Export writes the records as CSV
for the research."

### 6. Accounts and sync (7:50, 120 s) — A, B, C

**Do:** Turn Wi-Fi on. On the sign-in screen tap **New here? Create an
account**, create `demo.student.1029@example.com` as a Student, sign in. Under
the topic list, **Turn sync on**, then **Sync now**. Turn airplane mode on.
Tap the learner code at the top right (⇄) to return to the sign-in screen,
and sign in again with the same email and password. Answer one
exercise. Tap **Sync now**. Turn airplane mode off, wait for the next sync or
tap **Sync now**.

**Say:**
- "Creating an account needs the internet: Supabase checks the email and
  password. The tablet then keeps the account's profile and a salted,
  hashed copy of the password, never the password itself."
- "Sync is off until the account holder turns it on. Studying under a code
  without an account never syncs."
- In airplane mode: "With no internet, the same account still signs in: the
  tablet checks the password against its stored hash. I can keep
  studying."
- On the failed sync: "Sync reports no connection and changes nothing.
  Each row is sent with the tablet's id and its local id, and the tablet
  remembers the highest id it has sent per table, so a failed run is simply
  repeated later."
- After Wi-Fi returns: "Now the work done offline is sent, once. Sending
  the same row twice would change nothing on the server."

### 7. The admin portal (9:50, 120 s) — A, B

**Do:** In Chrome, sign in at http://localhost:3000 with the admin account.
Show **Overview**, **Users** (press **Approve as teacher** or **Decline** on
the pending request of `demo.teacher.1029@example.com`), open
`demo.student.1029@example.com`, then **Classes** (a class, its teacher and its students), **Tablets**, **Activity** and **Tutor**. Finally sign out and sign in as the class's teacher.

**Say:**
- "This is the web portal for teachers and admins, built with Next.js. It
  never holds a secret key: every query runs as the signed-in user, and the
  database's row-level security decides what that user may see."
- On Users: "A new account is always a student. A teacher request waits
  here until an admin approves or declines it; only an admin may change a
  role, and the database enforces that, not just the page."
- On the student: "Here is the work I just did on the tablet, including the
  exercise answered offline."
- On Classes: "An admin puts students into classes and gives each class its
  teacher. A teacher then sees only the students in their own classes: the
  database enforces it, so it holds everywhere in the portal."
- Signed in as the teacher: "The same pages, but only this teacher's
  students, with the ones who need help first, and none of the admin's
  controls."
- On Tablets and Tutor: "Each tablet's last sync, and the
  tutor's response times and outcomes, from the same log the offline test
  used."

### 8. How the code is organised (11:50, 80 s) — B

**Show:** the editor with `docs/feature-map.md`, then briefly
`app/src/checker/complex.ts` (the `Parser` class), `app/src/guidance/service.ts`
(`GuidanceService`), `app/src/sync/engine.ts` and
`supabase/migrations/0001_accounts_and_sync.sql`.

**Say:** "Each feature owns a directory. Screens only lay things out; the
logic is in plain TypeScript modules that are tested without a tablet. The
checker is a recursive-descent parser. GuidanceService keeps its state
private: it loads the model when first needed, runs one request at a time,
and enforces the timeout and cancel. The model, the server and the database
each sit behind a small interface, so tests swap in a fake model, a fake
server or an in-memory SQLite. The security rules live in the database
migration: an account writes and reads only its own rows, and staff read
everything."

### 9. Testing strategies (13:10, 150 s) — D

**Do:** In the terminal, run each and let the result show:

```bash
cd app && npx jest --maxWorkers=2 && cd ..
cd supabase/tests && npm test && cd ../..
python3 app/scripts/offline_summary.py docs/evidence/offline-test-2026-10-28/run
```

Then show `docs/images/p8-tablet-topics-stale-cards.png` beside
`docs/images/p8-tablet-topics-fixed.png`.

**Say:**
- Jest: "First, unit and integration tests: 285 of them, over a real SQLite
  engine, with a fake model and a fake server. They also drive whole screens
  by their test ids. When the laptop was busy, some of them failed, because
  they waited fixed times. They now wait for the result itself, and they
  pass under load."
- Policies: "Second, the security rules, run on an in-process Postgres as
  different accounts: 59 checks, for example that a student cannot read
  another student's rows or make itself a teacher. At first this script
  only printed its results; now it fails if any rule is wrong, and I
  checked that by breaking a rule on purpose."
- Offline test: "Third, the device test from my proposal: six tasks, ten
  cases each, under three network conditions, 180 attempts driven through
  the screen by a script. 178 passed, against a target of 171. The two
  failures were tutor answers that took 121 and 125 seconds, just over the
  limit."
- The two screenshots: "The first run of that test found a real bug. After
  a restart, topic cards kept their old size, so a tap on one lesson opened
  another. Version 1.2.2 reads the progress before drawing the cards, and a
  new test fails on the old version and passes on the new one."
- "I also tested the app's sync code against the live server, and the
  curriculum keys and the grader with SymPy."

### 10. Performance and compatibility (15:40, 80 s) — E

**Show:** the performance tables in the technical report (section 5), then
Firefox with the portal's sign-in page; open the browser's responsive mode
at 390 pixels wide.

**Say:** "On this tablet, stored hints appear in about a tenth of a second,
lessons open in about one and a half seconds, and the app reopens in under
one second. The tutor is the slow part: about 23 seconds to the first word and
77 seconds for a first step. I measured why: this processor lacks the
instructions that fast quantised models need, so I built llama.cpp for its
basic instruction set and use three threads; four starve the system, and its
GPU was four to six times slower. With the model loaded the app uses about
1.2 gigabytes, under the 2-gigabyte target. The app also ran on an Infinix
phone as a teacher's device. The portal works in Chrome and Firefox, on a
desktop and at phone width."

### 11. Close (17:00, 30 s)

**Say:** "Most of the proposal's features are complete, and the offline
target is met. Three things wait on people rather than code: a teacher's
review of the content, the held-out questions for the retrieval comparison,
and the ethics approval for the student pilot. No participant data will be
synced until the ethics committee approves it. The repository, the report
and the installable app are linked in the README. Thank you."

## Editing

- Speed up only the tutor's waits, and put the real time on screen as a
  caption ("first step: 74 s, shown at 8×"); keep everything else at real
  speed.
- Cut dead time between scenes; do not cut a result before it is readable.
- Export at 1080p. Upload it where the assessors can open it without a
  request (for example YouTube as unlisted, or Google Drive shared with
  "anyone with the link"), then put the link in the README.

# Offline Tutor v1: Release Notes

**Released:** 19 October 2026, for submission on 23 October 2026
**Current build:** version 1.3.0 (build 7), release, commit `e0fed27`, application ID `rw.offlinetutor.pilot`. Version 1.0.0 (build 2) is the build the readiness run below was made with; 1.1.0 added class progress, 1.2.0 collecting it from other tablets, 1.2.1 the book pages under generated text, 1.2.2 a fix the offline test found, and 1.3.0 accounts, sync and the admin portal. The offline test ran on 1.2.2; for the study, build with `-PofflineOnly`, which gives the same offline-only guarantee. Builds before 1.2.1 were made from the development repository this one was cleaned from, so their commit ids (`b348c17` for 1.0.0, `a0790e3` for 1.2.0) are not in this history.
**Device:** ATMPC IT-801B, Android 15, airplane mode on throughout
**Status:** ready for structured testing with teachers; testing with students waits for the approvals and teacher review below

## What v1 is

An Android app that supports REB Senior Six Advanced Mathematics with no
internet connection. A learner picks a code (never a name), reads a
lesson from the Student's Book with typeset formulas and worked
examples, practises exercises that the tablet marks, sees the book's
hints in order before the worked solution, asks an on-device AI tutor
for step-by-step guidance on in-scope questions, and returns later to
saved progress. A teacher installs the tutor model, exports the
learner records for the research, and checks the build from Teacher
tools, behind a PIN.

## Files

| File | Size | SHA-256 |
|---|---|---|
| `OfflineTutor-1.3.0.apk` (connected: accounts and sync) | 101,099,686 bytes | `33b5298a0f4c54930524474448255c0d62a758501abe75ee062db15f143dbd8e` |
| `OfflineTutor-1.3.0-offline.apk` (built with `-PofflineOnly`: no internet permission; the study build) | 101,099,658 bytes | `319f2f0c5e581ebaa428a1af19c02838d3c6e55f84456e90494365622230d237` |
| `OfflineTutor-1.2.2.apk` (offline only, the build the offline test ran on) | 100,401,394 bytes | `1f9643ba09f348467cd1f9f92252e1bc7a19141ea4c6783e6735572235f9955f` |
| `qwen25-math-1.5b-Qwen2.5-Math-1.5B-Instruct-Q4_K_M.gguf` | 986,048,832 bytes | `9614a50f03c897028920ca0dc4365da570bf587f9ee7768261216fe370b37e8e` |

The APKs and their `SHA256SUMS` are in `dist/v1.3.0/` and `dist/v1.2.2/` (not in Git). The model is in
`bench/models/` (not in Git), fetched by `tools/fetch_models.py`.
Installation: `docs/INSTALLATION_GUIDE.md`. Checks before a session:
`docs/TABLET_TEST_CHECKLIST.md`.

## New in 1.3.0: accounts, sync and the admin portal

- **Personal accounts.** The first screen signs in or creates an account
  (email and password). After its first online sign-in on a tablet, an
  account signs in there again with no internet. A teacher request waits
  for an admin; an approved teacher or admin opens Teacher tools without
  the PIN. Studying under a learner code without an account, and Teacher
  tools by PIN, remain.
- **Sync to Supabase.** Off until the account holder turns it on under the
  topic list. While on, the tablet sends that account's records whenever
  it has internet, each row once, and studying never waits for it.
- **The admin portal** (`admin/`), a web app where teachers and admins
  follow accounts, progress per lesson, tablets and their last sync, recent
  activity, and the tutor's response times, with the students who need
  help (stuck after two or more wrong answers); an admin creates, renames,
  resets and deletes accounts, approves or declines teacher requests, and
  sets up classes, and a teacher sees only the students in their classes.
- **The study build.** `-PofflineOnly` removes the INTERNET permission, so
  that build cannot send anything, as in 1.2.2.

Design, setup, security and tests: [ACCOUNTS_AND_SYNC.md](ACCOUNTS_AND_SYNC.md).
Checked on the IT-801B on 28 October: an account created in the app synced
its work, signed in again offline, studied offline, and its offline work
reached the server after Wi-Fi returned.

## New in 1.2.2: topic cards drawn at their final size

The offline reliability test of 28 October
([evidence/offline-test-2026-10-28/](evidence/offline-test-2026-10-28/))
found a fault in 1.2.1 on the IT-801B. After the app restarted, the topic
cards below the fold, which grow when the learner's progress arrives, kept
their old size on screen: "Open lesson ›" sat outside its card
(`docs/images/p8-tablet-topics-stale-cards.png`), and Android placed taps
by the old sizes, so a tap on the Differential Equations lesson opened
Random Variables and a tap on "My progress" did nothing. The topic list
now reads the progress first, which takes milliseconds, and draws each
card once at its final size (`docs/images/p8-tablet-topics-fixed.png`).
A new test holds the database back and checks that no card is drawn
before its progress is known; it fails on 1.2.1 and passes on 1.2.2
(269 tests in 12 suites).

## New in 1.2.1: the book pages behind generated text

The note under the tutor's generated text used to say only that it came
from "one passage of the book". It now names the source, so a learner can
check the text against the book:

- for a question asked on a lesson, the lesson and its printed Student's
  Book pages, for example *from the lesson "Definite integrals and their
  properties" (REB Student's Book, pp. 254–259)*;
- for help on an exercise, whose passage is the exercise's stored hints,
  the exercise and its page, for example *from the stored hints for
  Application activity 1.7, question 3 (REB Student's Book, p. 15)*.

This meets the proposal's requirement that generated answers identify
their source material (§3.3). Checked on the IT-801B on 28 October
(`docs/images/p7-tablet-tutor-source.png`) and by three new tests
(268 in 12 suites).

## New in 1.2.0: one class across several tablets

Students on different tablets now appear together in the teacher's
Class progress, with no network:

1. On each student tablet, the teacher opens Teacher tools and taps
   **Send by Bluetooth or Quick Share** (or **Save to Download**, for a cable
   or memory card). The app writes one progress summary file for every
   learner on that tablet and hands it to Android's share menu.
2. On the teacher's tablet, **Import progress files** opens the file picker
   (received files are in Download); several files can be chosen at once.
3. **Class progress** then lists every learner from every tablet, says which
   tablet each used, and combines a learner code found on two tablets into
   one student. A received tablet can be removed (two taps).

The summary holds learner codes and, per exercise, attempts, wrong
answers, whether it was solved, hints seen and whether the solution was
opened, with the last activity and the number of AI tutor requests: never
a typed answer, a tutor's text or a name. Each tablet has a short name for
the teacher's records, such as "Tablet 7F3A", made once when the app is
installed. The app checks every file before trusting it, keeps the newest
file per tablet (importing a file twice changes nothing), and refuses a
tablet's own file. It gains no permission: Android's Bluetooth app carries
the file, and the pilot build still has no internet permission.

Checked on the IT-801B on 20 October, with the development build (its own
database, 16 learners) standing in for a student tablet: sharing opened
Android's Bluetooth device picker with airplane mode still on (on this
tablet Bluetooth is the only sharing app, so Android goes straight to it);
the summary saved to Download held exactly the fields above (38 KB);
importing it on the pilot build added 16 learners, a second import changed
nothing, and Class progress showed 19 learners from the two tablets in
53 ms. A learner code used on both tablets showed as one student with both
tablets' work.

The transfer itself was then checked between real devices, the same day:
the IT-801B sent its summary over Bluetooth, with airplane mode on, to an
Infinix Smart 8 phone used as the teacher's device ("1 successful,
0 unsuccessful"). With 1.2.0 installed on the phone and no tutor model,
importing the file and opening Class progress there showed the tablet's
learners (reported by the tester). The teacher's device can therefore be a
phone running the same app; it does not need the model.

## New in 1.1.0: class progress

Teacher tools has a **Class progress** screen: every learner code on the
tablet with their score in each unit, attempts, hints, solutions and AI
tutor requests, a **needs help** mark on any learner who has stopped on an
exercise after two or more wrong answers, and for each unit how many
learners started and mastered it, their average mastery and the exercise
with the most wrong answers. Tapping a learner opens their progress
read-only. It is computed on the tablet from the saved records when the
screen opens, so it works offline; the teacher PIN holds while the teacher
moves between teacher screens and is asked for again once Teacher tools is
left.

Checked on the IT-801B on 19 October: 1.1.0 installed over 1.0.0 as an
update and kept the records and the installed model; with three learners
the screen opened in 15 ms and showed the figures recorded in the database
(3 learners, 8 answers, 1 hint, 3 AI requests; the learner with two wrong
answers on one exercise marked as needing help). 249 app tests pass.

Synchronization is not in the pilot build. Decided on 19 October: when it
comes, a tablet sends progress summaries (per learner and unit: exercises
correct, attempts, hints, last activity) when it is connected, with the
teacher's consent; curriculum updates keep arriving with new app versions.

## What is new since the 13 October report

- **The pilot build installs without developer tools.** A signed release
  APK installed from the tablet's Files app, beside the development
  build, with no internet permission at all.
- **Teacher tools**, behind the PIN: install the tutor model from a file
  (the app checks its size and SHA-256 and refuses anything else), export
  the learner records as CSV with a manifest, see the build, content and
  licence notices, and open the developer checks.
- **Four units instead of one.** Starter lessons for Integration
  (definite integrals), Differential Equations (separable equations and
  particular solutions) and Random Variables (expected value, variance
  and standard deviation), with worked examples and five exercises each,
  joining Complex Numbers: 4 lessons, 7 worked examples, 20 exercises,
  60 hints. Every answer key is proven with SymPy and agrees with the
  Teacher's Guide.
- **The tablet marks the new answer types:** numbers with π, e, √ and ln,
  rounded decimals within a stated tolerance, and functions of x, which
  are compared at sample points in their domain.
- **Faster tutor start:** the text the model needs is prepared while the
  learner reads or types (P5 §9). Exercise help starts in about half a
  second once an exercise has been open for about a minute.

## Readiness run (19 October, 20:30–20:56)

The checks of the development plan's "definition of ready", on a tablet
prepared exactly as the installation guide says.

| Check | Result |
|---|---|
| Install from the Files app | Installed by Android's package installer after allowing the source; no adb |
| Three cold launches | Activity shown in 768–788 ms; learner screen ready about 1.2–1.4 s after launch |
| Tutor before the model is installed | Plain message in 50 ms; lessons and practice unaffected |
| Model installation from Teacher tools | 986 MB copied and checked in 38 s; checksum matched |
| Study flow in all four units | Lesson formulas all rendered (16, 14, 14 and 10); hint shown; wrong answer "Not quite"; right answer in another spelling "Correct" |
| Tutor, Integration question | First text 25.2 s, step 1 complete 40.8 s |
| Tutor, help on a Random Variables exercise after its three hints | First text 23.4 s, step 1 36.1 s; step 2 started in 0.5 s and took 22.2 s; final answer not given |
| Cancel during a step | Stopped after 12.1 s, recorded as cancelled |
| Out-of-scope question | Declined at once; model not called |
| Restart, then the same learner | Progress identical in all four units |
| Second learner | Empty records |
| Export | 2 learners, 4 sessions, 8 attempts, 7 hints, 9 tutor events, 4 content versions: exactly the session |
| Crashes | None in 26 minutes |
| Temperature | CPU mean 61 °C, peak 82.3 °C, at or above 70 °C for about 460 s of the 26 minutes |
| Memory | About 1.2 GB with the model loaded (P5 §9) |

The automated checks: 244 app tests, the typecheck and the lint pass;
the four packages validate; the grader's self-test passes.

## Offline reliability test (28 October)

The proposal's offline test (§3.7.1): six tasks, ten cases and three
network conditions, 180 timed attempts on 1.2.2, driven by
`app/scripts/offline_test.py` ([protocol and results](evidence/offline-test-2026-10-28/)).

**178 of 180 passed (98.9%; target 95%).** No crash, no lost record, no
task that needed the network, including 60 attempts during which the
Wi-Fi connection was cut. Stored content answered in 0.10 to 0.20 s,
lessons opened in 1.4 to 1.6 s and the app was ready 0.8 to 1.0 s after a
restart. The two failures are generated explanations that finished at
124.9 s and 120.6 s against the 120 s limit; the median was 76.7 s and the
first token came after a median of 23.2 s.

An earlier attempt at the run, on 1.2.1, found the fault fixed in 1.2.2.

## Known issues

- **Content is a starter set and is not yet teacher-reviewed.** One
  lesson per unit; every item is marked developer-test. Example 5.5
  differs from the book on purpose: the book integrates x² + 1 to
  x³/3 + 2x; the package carries the correct x³/3 + x and y = x³/12 + x/4 + c.
  The book also labels the Random Variables activity "3.15" and the
  Teacher's Guide numbers activities differently from the Student's Book.
- **The tutor is slow.** A first answer takes about 15–40 s to start and a
  step 20–90 s to finish. In the offline test 2 of 30 first steps took just
  over 120 s: the question waited for the lesson's warm-up and the model
  wrote a long first step. The tutor is labelled, can be cancelled, and
  never marks answers; stored hints and solutions are instant.
- **Preparing exercises costs work the learner may not use:** about a
  minute of processing per exercise opened, which also warms the tablet.
- **While a step is being written, earlier tutor text shows formulas as
  code** (for example `\(E(X)\)`); they are typeset when the step ends.
- **Hidden answers:** on differential-equation exercises the tutor's text
  is not scanned for the final function; only the instruction not to
  state it applies. Numeric and complex answers are masked.
- **General solutions with an arbitrary constant** are not marked by the
  tablet; such exercises are not in v1.
- **Battery use is unmeasured unplugged.** The run was on USB power and
  still fell from 65% to 62% in 26 minutes.
- **The teacher PIN is shared and fixed (4821).** It keeps learners out of
  teacher tools during supervised sessions; it is not a security boundary.
- **Records are not encrypted on the tablet.** They hold learner codes and
  answers, never names.

## Before testing with students

The proposal (§3.8) and the development plan require these, and v1 does
not replace any of them:

1. Institutional and school approval for the Agahozo Shalom Youth Village
   pilot, with guardian consent and learner assent where required.
2. Review of the 20 exercises, 7 worked examples and 4 lessons by a
   Mathematics teacher, recorded in each package's `review` field.
3. Agreement with the supervisor on the response-time targets in the
   evaluation plan, using the figures above.

Testing with teachers (step 2) and developer testing with test codes can
start with v1 now.

## Signing key

The APK is signed with a key created for this project
(`CN=Nziza Aime Pacifique, O=Offline Tutor Capstone, C=RW`, SHA-256
certificate digest `7b773d72…b73a8078`). The keystore is
`~/.android/offlinetutor-release.keystore` and its passwords are in
`~/.gradle/gradle.properties`, both outside the repository. Back both up:
every later v1.x APK must be signed with the same key to install over v1
without losing the records on the tablets.

# Offline Tutor v1: Tablet Test Checklist

Use this list on each tablet before a study session, and record the
answers on paper or in the session log. Every check is done in airplane
mode. Install the app and the model first (`docs/INSTALLATION_GUIDE.md`).

Tablet: ________  Date: ________  Checked by: ________  Battery: ____ %

## Before the session

| # | Check | Expected | OK |
|---|---|---|---|
| 1 | Airplane mode is on | The airplane icon shows in the status bar | ☐ |
| 2 | Open the app | "Who is studying?" appears within 10 seconds | ☐ |
| 3 | The content line at the bottom | Four packages: `rw-s6-am.u1`, `u4`, `u5`, `u9` · 4 lesson(s) · offline | ☐ |
| 4 | Teacher tools → About this build | Offline Tutor 1.3.0 (build 7, release …) | ☐ |
| 5 | Teacher tools → Tutor model | **ready**: Installed and checked: 986 MB | ☐ |

## The study flow (learner code `TEST`)

| # | Check | Expected | OK |
|---|---|---|---|
| 6 | Topics | Unit 1 Complex Numbers, Unit 4 Integration, Unit 5 Differential Equations, Unit 9 Random Variables | ☐ |
| 7 | Open each lesson | Formulas appear typeset; worked examples have their steps | ☐ |
| 8 | Practise the first exercise of each unit; tap "Show hint 1 of 3" | The book's first hint appears | ☐ |
| 9 | Type a wrong answer and tap "Check answer" | "Not quite. Check your working and try again." | ☐ |
| 10 | Type the right answer | "Correct" (any equivalent form is accepted: 4.5 or 9/2) | ☐ |
| 11 | Back to Topics → My progress | Each unit shows 1 of 5 correct, with the attempts and hints | ☐ |

Right answers for the first exercises: Unit 1 `5 + 3i`; Unit 4 `9/2`;
Unit 5 `y = x^2/2 + 4x - 6`; Unit 9 `1.9`.

## The tutor

| # | Check | Expected | OK |
|---|---|---|---|
| 12 | In a lesson, ask `how do I evaluate a definite integral?` | Text starts within about 40 seconds and stops at the end of step 1 | ☐ |
| 13 | Tap "Next step (2)", then "Cancel" while it writes | "Cancelled after … s"; the app stays usable | ☐ |
| 14 | Ask `explain photosynthesis` | "Not covered in this course"; nothing is generated | ☐ |
| 15 | In an exercise, use all three stored hints, then "Ask the tutor (generated)" | One step of method; the final answer is not given | ☐ |

## Records

| # | Check | Expected | OK |
|---|---|---|---|
| 16 | Close the app from the recent-apps screen, reopen, tap "Continue" on `TEST`, open My progress | The same figures as in check 11 | ☐ |
| 17 | Start learner code `TEST2` and open My progress | 0 attempts everywhere: records are kept apart | ☐ |
| 18 | Teacher tools → Export records | A folder `Download/OfflineTutor/export-…` with six CSV files and `manifest.json` | ☐ |
| 19 | Teacher tools → Open class progress | `TEST` with 1/5 in each unit and `TEST2` with 0/5; tapping `TEST` opens their progress without a Practise button | ☐ |
| 20 | With two tablets: on the student tablet, Share this tablet's progress → Bluetooth → the teacher's tablet | The teacher's tablet receives a file `OfflineTutor-progress-Tablet-….txt` in Download | ☐ |
| 21 | On the teacher's tablet: Import progress files → that file, then Open class progress | "… learners added"; the other tablet's learners appear, each marked with the tablet they used | ☐ |

## After the session

- Export the records (check 18) and copy the folder to a computer.
- Note any crash, freeze, wrong mark or confusing screen, with the time.
- Note the battery level and whether the tablet felt hot.

Delete the `TEST` and `TEST2` records only by reinstalling the app on a
tablet that holds no study records, because removing the app deletes
everything it stored.

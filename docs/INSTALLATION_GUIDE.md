# Offline Tutor v1: Installation Guide

For the teacher or researcher who prepares a tablet for a study session.
No programming tools are needed. Allow about 15 minutes per tablet.

## What you need

| Item | Details |
|---|---|
| The app file | `OfflineTutor-1.3.0.apk` (about 100 MB). For sessions with students, use the offline-only build instead (built with `-PofflineOnly`; see `docs/ACCOUNTS_AND_SYNC.md`), which cannot send anything. |
| The tutor model file | `qwen25-math-1.5b-Qwen2.5-Math-1.5B-Instruct-Q4_K_M.gguf` (986 MB). Keep the name exactly as it is. |
| A tablet | Tested on the ATMPC IT-801B with Android 15. It needs about 2.5 GB of free storage. |
| A way to copy files | A USB cable and a computer, or a memory card |
| The teacher PIN | **4821**. Share it only with the adults running sessions. |

The checksums of both files are listed in the release notes
(`docs/RELEASE_V1.md`) if you want to confirm the copies are complete.
The app checks the model file itself during installation, so a damaged
copy is refused.

## 1. Copy the two files onto the tablet

1. Connect the tablet to the computer with the USB cable. On the tablet,
   choose **File transfer** when Android asks what the USB connection is
   for.
2. On the computer, open the tablet's storage and copy both files into
   its **Download** folder.
3. Wait until the copy finishes (the model takes a few minutes), then
   disconnect the cable.

## 2. Install the app

1. On the tablet, open **Files** and go to **Download**.
2. Tap `OfflineTutor-1.3.0.apk`.
3. If Android says that installing unknown apps is not allowed, tap
   **Settings**, switch on **Allow from this source**, and go back.
4. Tap **Install**, then **Open**.

The app is called **Offline Tutor**. The first screen asks "Who is
studying?" and shows the content line
`Content: rw-s6-am.u1 v0.2.0, rw-s6-am.u4 v0.1.0, rw-s6-am.u5 v0.1.0, rw-s6-am.u9 v0.1.0 · 4 lesson(s) · offline`.

## 3. Install the tutor model

1. On the first screen, tap **Teacher tools** (at the bottom) and enter
   the teacher PIN.
2. Under **Tutor model**, tap **Install the tutor model from a file**.
3. The tablet's file picker opens. Tap **Large files** (or open
   **Downloads**) and tap the `.gguf` model file.
4. Keep the app open while it copies and checks the file. On the
   IT-801B this takes 30 to 40 seconds.
5. The status must change to **Installed and checked: 986 MB** and the
   badge to **ready**.

If the app says the file does not match, the copy is incomplete or it is
a different file: copy it again from the computer and repeat this step.
The app keeps any working model until a new one has passed the check.

After this step you may delete the two files from **Download** to free
storage; the app keeps its own copy of the model.

## 4. Switch the network off

Turn on **Airplane mode** from the quick settings. The app never uses the
internet (the pilot build has no permission to), but airplane mode keeps
other apps and updates from interrupting a session.

## 5. Check the tablet before a session

1. Under **About this build** in Teacher tools, check that it says
   **Offline Tutor 1.3.0 (build 7, release …)**.
2. Go back, type the learner code `TEST`, and tap **Start**.
3. Open a lesson. The formulas must appear typeset, not as code.
4. Scroll to **Ask about this topic**, type a question such as
   `how do I add two complex numbers?` and tap **Ask the tutor**. The
   first words appear within about a minute; a complete step takes one
   to two minutes.
5. Open an exercise, type a wrong answer and tap **Check answer**: it
   must say "Not right yet". Type the right answer: it must say
   "Correct".

The full checklist is in `docs/TABLET_TEST_CHECKLIST.md`.

## Learner codes

Each student types a code such as `S6-07`, never a name. Keep the list
that links codes to students on paper or on the school's own records,
not on the tablet. A student continues later by tapping **Continue**
next to their code.

## Following the class

Open **Teacher tools** → **Open class progress**. It lists every learner
code that has used this tablet, with their score in each unit (for example
`U4 3/5`), their attempts, hints and AI tutor requests, and when they were
last active. A learner marked **needs help** has given two or more wrong
answers to an exercise they have not yet solved; the screen says which.
For each unit it shows how many learners have started and mastered it and
the exercise with the most wrong answers. Tap a learner to see their
answers and hints. All of it is worked out on the tablet and needs no
connection.

## When students use different tablets

The teacher collects each tablet's progress onto their own tablet or
phone; no internet is needed. The teacher's device runs the same app (it
was checked on an Infinix Smart 8 phone) and does not need the tutor
model: skip section 3 there, and its Teacher tools will show the model as
"Not installed", which is fine.

1. **On each student tablet:** open **Teacher tools** (PIN), and under
   **Share this tablet's progress** tap **Send by Bluetooth or Quick Share**.
   If Android asks to turn on Bluetooth, tap **Turn on** (airplane mode can
   stay on). Choose the teacher's tablet in the list.
2. **On the teacher's tablet:** accept the incoming file when Android asks.
   It is saved in **Download**.
3. On the teacher's tablet, open **Teacher tools** and tap
   **Import progress files**. Choose the received files (several at once is
   fine). The app says how many learners each tablet added.
4. Open **Class progress**: it now lists the learners of every tablet, and
   says which tablet each learner used.

Without Bluetooth, use **Save to Download** on the student tablet and copy
the file to the teacher's tablet by USB cable or memory card, then import it
the same way. Send again whenever you want newer figures: importing a
newer file from the same tablet replaces the older one, and importing the
same file twice changes nothing. The file holds learner codes and
per-exercise counts only, never answers or names. Switch Bluetooth off
again afterwards.

Learner codes must be different on every tablet (for example start them
with the tablet's number: `T3-S07`). A student who changes tablet should
keep their code; their work on both tablets is then counted together.

## Collecting the records

1. Open **Teacher tools** and tap **Export records**.
2. The app saves a folder such as `Download/OfflineTutor/export-20261023-143005`
   with one CSV file per record table and a `manifest.json` describing
   the app, content and model.
3. Connect the tablet to the computer by USB and copy that folder.

Export before uninstalling the app or resetting the tablet: removing the
app deletes its records.

## Updating to a newer version

Install the newer APK the same way (step 2). Android keeps the records
and the installed model, provided the new APK is signed with the same
key, which every v1.x release is.

## If something goes wrong

| What you see | What to do |
|---|---|
| "The tutor model is not available on this tablet" when asking the tutor | The model is not installed: repeat step 3. Lessons, practice, hints and solutions still work. |
| The file picker does not show the model | Open the picker's menu (three lines, top left), choose **Downloads**, and look there. |
| "There is not enough free storage" | Free about 2.5 GB, for example by deleting the copied files after installing, or videos. |
| The tutor takes several minutes or stops | Tap **Cancel** and ask again. Long sessions warm the tablet; let it rest if it feels hot. |
| "That PIN is not right" | The PIN is 4821. |
| The app does not open after installing | Restart the tablet and open it again. If it still fails, note the time and report it. |

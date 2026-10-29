# Offline Tutor 1.3.0: Installation Guide

For the teacher or researcher who prepares the tablets. Tablets are set up
by hand, one at a time, and need no programming tools; allow about 15
minutes per tablet. Once a tablet is set up, everything a student uses
works with no internet: lessons, practice and marking, hints and
solutions, the tutor, progress, and Teacher tools.

## Choose the build

Both files are release 1.3.0 (build 7), signed with the same key, so a
tablet can move from one to the other without losing its records.

| Build | File | Use it for |
|---|---|---|
| **Offline-only** (the study build) | `OfflineTutor-1.3.0-offline.apk` | Sessions with students in the pilot, and any tablet that must never send data. Android blocks it from the internet entirely. Students study under learner codes; accounts cannot be created or synced on it. |
| **Connected** | `OfflineTutor-1.3.0.apk` | Tablets whose users have accounts and should send their work to the school's server when there is Wi-Fi. Everything above, plus accounts and sync, which stay off until an account holder turns sync on. |

Participant data must not be synced until the ethics committee has
approved an amendment covering it, so the pilot uses the offline-only
build. "About this build" in Teacher tools shows the same text for both;
tell them apart by the file name, or by the checksum below.

## What you need

| Item | Details |
|---|---|
| The app file | One of the two builds above (about 100 MB) |
| The tutor model file | `qwen25-math-1.5b-Qwen2.5-Math-1.5B-Instruct-Q4_K_M.gguf` (986 MB). Keep the name exactly as it is. |
| A tablet | Tested on the ATMPC IT-801B with Android 15. It needs about 2.5 GB of free storage. |
| A way to copy files | A USB cable and a computer, or a memory card |
| The teacher PIN | **4821**. Share it only with the adults running sessions. |

| File | SHA-256 |
|---|---|
| `OfflineTutor-1.3.0-offline.apk` | `319f2f0c5e581ebaa428a1af19c02838d3c6e55f84456e90494365622230d237` |
| `OfflineTutor-1.3.0.apk` | `33b5298a0f4c54930524474448255c0d62a758501abe75ee062db15f143dbd8e` |
| the model file | `9614a50f03c897028920ca0dc4365da570bf587f9ee7768261216fe370b37e8e` |

On a computer, `sha256sum <file>` prints the checksum to compare. The app
checks the model file itself during installation, so a damaged copy is
refused.

## 1. Copy the files onto the tablet

1. Connect the tablet to the computer with the USB cable. On the tablet,
   choose **File transfer** when Android asks what the USB connection is
   for.
2. On the computer, open the tablet's storage and copy the app file and
   the model file into its **Download** folder.
3. Wait until the copy finishes (the model takes a few minutes), then
   disconnect the cable.

## 2. Install the app

1. On the tablet, open **Files** and go to **Download**.
2. Tap the app file.
3. If Android says that installing unknown apps is not allowed, tap
   **Settings**, switch on **Allow from this source**, and go back.
4. Tap **Install**, then **Open**.

The app is called **Offline Tutor**. Its first screen is **Sign in**, with
**Continue without an account** and **Teacher tools (PIN)** below the form,
and at the bottom a line naming the content:
`Content: rw-s6-am.u1 v0.2.0, rw-s6-am.u4 v0.1.0, rw-s6-am.u5 v0.1.0, rw-s6-am.u9 v0.1.0 · 4 lesson(s) · offline`.

## 3. Install the tutor model

1. On the first screen, tap **Teacher tools (PIN)**, enter the teacher
   PIN and tap **Open teacher tools**.
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

You may then delete both files from **Download** to free storage; the app
keeps its own copy of the model.

## 4. Accounts and sync (connected build only)

Skip this step on the offline-only build: there, students tap **Continue
without an account** and type a learner code.

1. **Create the accounts.** An admin creates them in the web portal
   (**Users**, **Create an account**), or each person taps **New here?
   Create an account** in the app. Creating an account needs the internet.
2. **Sign in once with internet on this tablet.** After that first sign-in
   the account also signs in on this tablet with no connection. An
   account that has never signed in here cannot sign in offline.
3. **Sync, if wanted.** Under the topic list, the **Account and sync** card
   shows **Sync off**. **Turn sync on** sends that account's progress,
   answers and tutor questions whenever the tablet has internet; studying
   never waits for it. **Sync now** sends at once.
4. **Teachers.** A teacher account becomes a teacher when an admin
   approves it in the portal; an approved teacher opens Teacher tools
   without the PIN. In the portal, an admin puts students into classes and
   chooses each class's teacher; a teacher sees only those students.

## 5. Switch the network off for sessions

Turn on **Airplane mode** from the quick settings. The offline-only build
cannot use the internet at all; on the connected build, airplane mode
stops sync until you turn it off again, and on both it keeps other apps
and updates from interrupting a session.

## 6. Check the tablet before a session

1. In **Teacher tools**, under **About this build**, check that it says
   **Offline Tutor 1.3.0 (build 7, release …)** and lists the four content
   packages.
2. Go back to the first screen, tap **Continue without an account**, type
   the learner code `TEST` and tap **Start** (or sign in with a test
   account on the connected build).
3. Open a lesson. The formulas must appear typeset, not as code.
4. Scroll to **Ask about this topic**, type a question such as
   `how do I add two complex numbers?` and tap **Ask the tutor**. The first words appear
   within about a minute; a complete step takes one to two minutes.
5. Open an exercise, type a wrong answer and tap **Check answer**: it
   must say "Not quite. Check your working and try again." Type the right
   answer: it must say "Correct".

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

## Updating tablets: a new lesson or a new version

Updates are installed by hand, like the first installation: there is no
download over the network. Lessons are part of the app file, so a new or
corrected lesson reaches a tablet in a new app file, and you choose which
tablets get it by installing it only on those.

**Installing an update on a tablet.** Copy the new app file to the
tablet's **Download** folder and install it as in step 2. Android keeps
the records, the installed model and the accounts, because every 1.x file
is signed with the same key. When the app next starts it loads any
package whose version has changed, replacing that unit's lessons and
exercises and leaving the learners' records as they are. Check the
content line on the first screen, or **About this build**, for the new
version.

**Preparing an update (developer).** On the development laptop, with the
repository set up as in the README:

1. Add or correct the lesson in its unit's package,
   `curriculum/rw_s6_mathematics/packages/<unit>/`, with its exercises,
   hints and answer keys, and raise the package's `version` in that
   folder's `package.json`.
2. Check it:
   `./.venv/bin/python tools/validate_package.py curriculum/rw_s6_mathematics/packages/<unit>`
   must end with `[ok]`; it proves every answer key with SymPy.
3. For a new version of the app itself, raise `versionCode` and
   `versionName` in `app/android/app/build.gradle`.
4. Build both files:

   ```bash
   . app/scripts/env.sh
   app/scripts/sync_content.sh                      # validates and bundles every package
   cd app/android
   ./gradlew :app:assembleRelease -PofflineOnly     # the offline-only build
   cp app/build/outputs/apk/release/app-release.apk ../../dist/OfflineTutor-<version>-offline.apk
   ./gradlew :app:assembleRelease                   # the connected build
   cp app/build/outputs/apk/release/app-release.apk ../../dist/OfflineTutor-<version>.apk
   ```

   The signing key is `~/.android/offlinetutor-release.keystore` with its
   passwords in `~/.gradle/gradle.properties`; keep both backed up, as no
   other key can update the installed app without losing its records.
5. So that the web portal names the new lesson and counts its exercises,
   run `npm run curriculum` in `admin/` and deploy the portal again.

## If something goes wrong

| What you see | What to do |
|---|---|
| "The tutor model is not available on this tablet" when asking the tutor | The model is not installed: repeat step 3. Lessons, practice, hints and solutions still work. |
| The file picker does not show the model | Open the picker's menu (three lines, top left), choose **Downloads**, and look there. |
| "There is not enough free storage" | Free about 2.5 GB, for example by deleting the copied files after installing, or videos. |
| The tutor takes several minutes or stops | Tap **Cancel** and ask again. Long sessions warm the tablet; let it rest if it feels hot. |
| "That PIN is not right." | The PIN is 4821. |
| An account cannot sign in with no internet | It has not signed in on this tablet before: sign in once with internet (connected build), or use a learner code. |
| "No internet connection" under **Account and sync** | Normal while offline; the tablet tries again every two minutes once it has internet. |
| Android refuses to install an update | The file is not signed with the project's key, or it is an older version: use a file built as above. |
| The app does not open after installing | Restart the tablet and open it again. If it still fails, note the time and report it. |

# Feature Map

Every major feature, the directory that owns it, its status at v1.3.0
(28 October 2026), and the tests or records that show it works. Check this
before touching code so a change lands in the right place, and keep each
feature's logic inside its directory.

| Feature | Owning directory | Status | Tests and evidence |
|---|---|---|---|
| Feasibility benchmark: device profile, llama.cpp builds, throughput, probe sweep | `bench/`, `tools/run_bench.py`, `tools/fetch_models.py` | Done, measured on the IT-801B | `bench/README.md`, `bench/results/THROUGHPUT_FINDINGS.md`, `docs/FEASIBILITY_FINDINGS.md` |
| Deterministic answer grading, development-time only, Python and SymPy | `tools/grade.py`, `bench/eval/` | Done, audited 21 September | `tools/grade.py --self-test` (24 symbolic probes, 17 regression cases) |
| Curriculum corpus and PDF extraction | `tools/extract_corpus.py`; the REB books themselves are not in the repository (all rights reserved) | Done for the Unit 1 text | `docs/FEASIBILITY_FINDINGS.md` |
| Curriculum package format and validator | `curriculum/rw_s6_mathematics/packages/<unit>/`, `tools/validate_package.py` | Version 1 with paragraph topic tags; Unit 1 at 0.2.0, Units 4, 5 and 9 at 0.1.0, all developer-test until a teacher reviews them | `tools/validate_package.py` on each package; `app/__tests__/content.test.ts` |
| Package bundling into the app | `app/scripts/sync_content.sh`, generated `app/src/content/packages/` | Done, gitignored output | `app/__tests__/content.test.ts` |
| Content layer: SQLite schema, import, keyed reads | `app/src/content/db.ts`, `importer.ts`, `service.ts`, `types.ts` | Done | `app/__tests__/content.test.ts`, against a real SQLite engine (sql.js) |
| Topic router, the scope gate before generation | `app/src/content/router.ts` | Done, keyword bag; known false positives | `app/__tests__/content.test.ts`; `docs/images/p4-tablet-scope-declined.png` |
| Lesson rendering with KaTeX in a WebView | `app/src/katex/` (page HTML, self-sizing view, generated `autoRender.ts`), `app/src/LessonView.tsx`, `app/src/lesson.ts`, `app/src/content/toLesson.ts`, `app/scripts/sync_katex_assets.sh` | Done, offline; reused by the practice prompt, the solution and generated text | `app/__tests__/content.test.ts`; formulas counted on the tablet in `docs/RELEASE_V1.md` |
| Model bridge: load, bounded completion, cancel, release | `app/src/guidance/llamaEngine.ts`, shared through `app/src/guidance/index.ts` | Done; the developer screen uses the same service | `app/__tests__/guidance.test.ts`; timings in `docs/RELEASE_V1.md` |
| Learner records: learner codes, sessions, attempts, reveals; progress engine; session helper | `app/src/learner/` (`store.ts`, `progress.ts`, `session.ts`, `time.ts`); `app/src/storage.ts` is the early storage check on the `dev_storage_check` table | Done; tested on sql.js and on the tablet across a restart | `app/__tests__/learner.test.ts`, `progress.test.ts` |
| On-device answer checker | `app/src/checker/` (`complex.ts` evaluator, `check.ts` verdicts, `format.ts` answer formats) | a + bi, numbers with π, e, √, ln and exp, rounded values within a tolerance, and functions of x compared at sample points (particular solutions); general solutions and other check types report `unsupported` | `app/__tests__/checker.test.ts` |
| Practice rules: hint order, solution gate, attempt effects, feedback | `app/src/study/practice.ts` | Done, pure reducer | `app/__tests__/checker.test.ts`, `progress.test.ts`, `study-flow.test.tsx` |
| Study flow screens: learner code, topic list, lesson, practice, progress, developer | `app/src/screens/`, navigator in `app/App.tsx`; `KeyboardScrollView.tsx` and `keyboard.ts` keep the focused field above the keyboard | Done, with the tutor wired into lesson and practice | `app/__tests__/App.test.tsx`, `study-flow.test.tsx`, `keyboard.test.ts`; screenshots in `docs/images/` |
| Demonstration: screen recorder, the cuts, presenting the tablet on a laptop | `app/scripts/record_demo.sh`, `demo_cut.sh`, `demo_v1_take.sh`, `demo_v1_cut.py`, `present_tablet.sh`; recordings are kept out of the repository | Done | — |
| Generated guidance: prompt assembly, passage selection, redaction, controller, single-flight service, timeout, cancel, warm-ups (lesson prefix, exercise-help prompt on opening, the passage of a half-typed question), step pacing with simpler explanations, outcome log, the book pages behind each answer | `app/src/guidance/`; shown through `app/src/screens/GuidancePanel.tsx` | Done, measured on the tablet | `app/__tests__/guidance.test.ts`, `guidance-panel.test.tsx`; `docs/RELEASE_V1.md` readiness run |
| Device module: build identity, model installation from a picked file with a checksum, writing to Downloads, sharing a file | `app/src/native/NativeTutorDevice.ts` (codegen spec), `app/android/app/src/main/java/rw/offlinetutor/device/`, wrapped by `app/src/device/device.ts` | Done; checked on the IT-801B | `app/__tests__/teacher.test.tsx` (mocked module); `docs/RELEASE_V1.md` |
| Teacher tools: PIN, class progress, model installation, research export, about and notices, developer checks | `app/src/teacher/` (`classProgress.ts`, `teacher.ts`), `app/src/export/`, `app/src/screens/TeacherScreen.tsx`, `ClassScreen.tsx` | Done; readiness run on 19 October | `app/__tests__/teacher.test.tsx`, `class.test.tsx`; `docs/evidence/v1-readiness-2026-10-19/` |
| Progress collection between tablets: the summary file, its checks, merging by learner code, received tablets | `app/src/sharing/` (`summary.ts`, `store.ts`); share and import in `TutorDeviceModule.kt` | Done in 1.2.0; checked between the IT-801B and an Infinix Smart 8 phone | `app/__tests__/sharing.test.ts`, `class.test.tsx`; `docs/RELEASE_V1.md` |
| Accounts: sign-in online and then offline, the offline password check, accounts kept on the tablet | `app/src/account/` (`auth.ts`, `password.ts`, `store.ts`), `app/src/screens/AccountScreen.tsx` | Done in 1.3.0 | `app/__tests__/account-sync.test.ts`, `account-screen.test.tsx` |
| Sync to Supabase: per-account upserts by tablet and local id, marks, the schedule, the switch | `app/src/sync/` (`engine.ts`, `supabase.ts`, `config.ts`), `app/src/screens/SyncCard.tsx`, scheduling in `app/App.tsx` | Done in 1.3.0; checked on the IT-801B | `app/__tests__/account-sync.test.ts`, `supabase-live.test.ts`; `docs/ACCOUNTS_AND_SYNC.md` |
| Online database and its security rules | `supabase/migrations/` | Applied to the project on 28 October | `supabase/tests/check_policies.mjs` |
| Admin portal: accounts and roles, progress, tablets, activity, tutor timings | `admin/` (Next.js) | Done in 1.3.0 | `admin/README.md`; `npm run lint`, `npm run build` |
| Android build, toolchain pinning, device scripts | `app/android/`, `app/scripts/env.sh`, `run_debug.sh`, `stage_model.sh` | Debug build for development; signed pilot release `rw.offlinetutor.pilot` without the internet permission | `docs/INSTALLATION_GUIDE.md` |
| Tablet UI driver: dump, tap by text, type, wait, screenshot, airplane mode | `app/scripts/ui.py` | Done; drives the tablet checks | `docs/TABLET_TEST_CHECKLIST.md` |
| Offline reliability test: six tasks, ten cases, three network conditions | `app/scripts/offline_test.py` | Run on 28 October | `docs/evidence/offline-test-2026-10-28/` |
| App tests, native-module mocks, real-SQLite adapter | `app/__tests__/`, `app/jest/` (`opsqlite-mock.js`, `sqljs-db.js`), `app/jest.config.js` | 285 tests in 14 suites pass at v1.3.0, and a live Supabase suite run on demand | `cd app && npm test` |

## Placement rules

- Content that a student reads lives in a curriculum package, never in
  application source. The app reads it from SQLite.
- Anything that decides whether the model is called belongs to the router or
  the guidance controller, not to a screen; generated text is shown and
  logged only through the guidance panel.
- Answer keys are proven in Python at package build time. The device consumes
  only what the package carries.
- Screens hold layout and event wiring only; logic lives in the feature
  directory and is unit-tested without React or a WebView.

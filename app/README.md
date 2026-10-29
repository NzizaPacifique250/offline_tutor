# Clevo AI: the tablet app

The React Native app that runs on the tablet. It works with no internet:
lessons, practice with answers marked on the device, hints and worked
solutions, the on-device tutor, progress, and Teacher tools. Accounts, sync
and lesson updates use the internet only when it is there.

The project's main [README](../README.md) covers setup, the tools and the
other parts of the repository, and
[docs/INSTALLATION_GUIDE.md](../docs/INSTALLATION_GUIDE.md) installs a
release on a tablet without any developer tools.

## Where things are

| Folder | What it holds |
|---|---|
| `App.tsx` | Start-up, navigation between screens, and the sync and lesson-update schedules |
| `src/content/` | Curriculum import into SQLite, lesson reads, the topic router |
| `src/checker/` | The on-device answer checker (a parser and evaluator for complex numbers) |
| `src/study/`, `src/learner/` | Practice rules, learner records, sessions and progress |
| `src/guidance/` | The tutor: prompts, the model service, step pacing, hiding final answers |
| `src/account/`, `src/sync/` | Accounts that sign in offline, and sync to Supabase |
| `src/updates/` | Lesson updates: release files checked, offered and installed |
| `src/teacher/`, `src/sharing/`, `src/export/` | Teacher PIN, class progress, progress files between tablets, research export |
| `src/screens/` | Screens and UI components, layout and events only |
| `__tests__/`, `jest/` | The Jest suites and their helpers (real SQLite through sql.js, native mocks) |
| `android/` | The Android project and the Kotlin device module |
| `scripts/` | Build, install and tablet scripts, including the UI driver `ui.py` |

## Common commands

```bash
npm install
scripts/sync_content.sh && scripts/sync_katex_assets.sh   # generated inputs the app and tests need
npm test                                                  # the Jest suites
npm run typecheck && npm run lint
. scripts/env.sh && scripts/run_debug.sh                  # build, install and run on a connected tablet
```

The signed release builds are made as described in the installation guide.

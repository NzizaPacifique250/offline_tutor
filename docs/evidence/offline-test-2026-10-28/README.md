# Offline reliability test: results

Run on 28 October 2026, 13:53 to 16:25, on OfflineTutor 1.2.2 (build 6,
commit `6fd5e84`) on the ATMPC IT-801B, following [PROTOCOL.md](PROTOCOL.md)
with `app/scripts/offline_test.py`. The tables below are printed by
`app/scripts/offline_summary.py run`.

**178 of 180 attempts passed (98.9%); the target was 171 (95%).** No
crash, no lost record, and no task needed the network. In condition B
the tablet was connected to Wi-Fi before all 60 attempts, and Android's
log shows airplane mode switching on about 0.15 s after each tap, while
the task was still running.

| Task | A. Start offline | B. Connection lost | C. Restart offline | All |
|---|---|---|---|---|
| T1 Open a topic | 10/10 | 10/10 | 10/10 | 30/30 |
| T2 Generated explanation | 9/10 | 9/10 | 10/10 | 28/30 |
| T3 Stored hint | 10/10 | 10/10 | 10/10 | 30/30 |
| T4 Exercise with feedback | 10/10 | 10/10 | 10/10 | 30/30 |
| T5 Next-exercise recommendation | 10/10 | 10/10 | 10/10 | 30/30 |
| T6 Save and reopen progress | 10/10 | 10/10 | 10/10 | 30/30 |

| Task | Limit | Median | 95th percentile | Slowest |
|---|---|---|---|---|
| T1 Open a topic | 2 s | 1.44 s | 1.55 s | 1.61 s |
| T2 Generated explanation | 120 s | 76.7 s | 120.6 s | 124.9 s |
| T3 Stored hint | 2 s | 0.12 s | 0.14 s | 0.14 s |
| T4 Exercise with feedback | 2 s | 0.13 s | 0.16 s | 0.17 s |
| T5 Next-exercise recommendation | 2 s | 0.10 s | 0.17 s | 0.20 s |
| T6 Save and reopen progress | 10 s | 0.81 s | 0.96 s | 0.98 s |

The tutor's first token came after a median of 23.2 s (95th percentile
47.0 s) over the 30 generated answers. The CPU was at 54.3 to 71.2 °C at
the start of each case; the battery fell from 73% to 46% on USB power.

## The two failures

Both are generated explanations that arrived just after the limit: A6 at
124.9 s and B9 at 120.6 s. The logs show the same two causes. The question
waited for the lesson's warm-up to finish (17.5 s and 26.3 s), and the
model's first step ran long (218 and 169 tokens), so the app needed three
80-token chunks to complete it. Capping the first step at two chunks, or
letting a question interrupt the warm-up, would bring both under the
limit; neither change was made during the run.

## Where the run departs from the protocol

- **Four dry runs, not one** (`dry-runs/`). The first three found faults in
  the script, not the app: the first launch after installing an update
  was slow to render; `ui.py` read a stale screen when uiautomator could
  not dump a busy one; and a tap made while a scroll was still moving was
  lost. Each was fixed in the script before the next dry run.
- **A first run was stopped after 25 attempts** (`aborted-run-1/`, on
  1.2.1). It found a fault in the app: after a restart, topic cards below
  the fold kept their old size when progress arrived, so a tap on one
  lesson opened another (`../../images/p8-tablet-topics-stale-cards.png`)
  and the script counted a wrong lesson as opened. 1.2.2 fixes the app
  (`../../RELEASE_V1.md`), and the script now checks the lesson and
  exercise it opened. That run's results are not counted.
- **Learner codes `OT2-A`, `OT2-B`, `OT2-C`** replace `OT-A`, `OT-B` and
  `OT-C`, which the stopped run had already used.

## Files

| Path | What it holds |
|---|---|
| `run/attempts.csv` | One row per attempt: task, case, expected and observed result, time, limit, record id, CPU temperature, battery, network |
| `run/logcat.txt` | The app's log for the whole run, with device timestamps |
| `run/failures/` | A screenshot taken at each failed attempt |
| `run-output.txt` | The script's console output |
| `aborted-run-1/`, `dry-runs/` | The stopped run and the dry runs, kept for the record |

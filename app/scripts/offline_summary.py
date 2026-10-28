#!/usr/bin/env python3
"""Summarise an offline reliability run (scripts/offline_test.py) as Markdown tables.

    scripts/offline_summary.py RUN_DIR

Reads RUN_DIR/attempts.csv and prints: passed attempts per task and
condition, the time each task took (median and 95th percentile, nearest
rank), the tutor's time to first token, and the device's temperature and
battery over the run.
"""
from __future__ import annotations

import csv
import math
import os
import sys

TASKS = {
    "T1": "Open a topic",
    "T2": "Generated explanation",
    "T3": "Stored hint",
    "T4": "Exercise with feedback",
    "T5": "Next-exercise recommendation",
    "T6": "Save and reopen progress",
}
CONDITIONS = {"A": "A. Start offline", "B": "B. Connection lost", "C": "C. Restart offline"}


def pct(values: list[float], p: float) -> float:
    """Nearest-rank percentile."""
    s = sorted(values)
    return s[max(0, math.ceil(p / 100 * len(s)) - 1)]


def seconds(ms: float) -> str:
    return f"{ms / 1000:.2f} s" if ms < 10000 else f"{ms / 1000:.1f} s"


def main(run_dir: str) -> int:
    with open(os.path.join(run_dir, "attempts.csv")) as f:
        rows = list(csv.DictReader(f))
    passed = [r for r in rows if r["passed"] == "True"]
    print(f"**{len(passed)} of {len(rows)} attempts passed** (target: 171 of 180).\n")

    conds = [c for c in CONDITIONS if any(r["condition"] == c for r in rows)]
    print("| Task | " + " | ".join(CONDITIONS[c] for c in conds) + " | All |")
    print("|---|" + "---|" * (len(conds) + 1))
    for t, name in TASKS.items():
        cells = []
        for c in conds:
            sub = [r for r in rows if r["task"] == t and r["condition"] == c]
            cells.append(f"{sum(r['passed'] == 'True' for r in sub)}/{len(sub)}")
        sub = [r for r in rows if r["task"] == t]
        cells.append(f"{sum(r['passed'] == 'True' for r in sub)}/{len(sub)}")
        print(f"| {t} {name} | " + " | ".join(cells) + " |")

    print("\n| Task | Limit | Median | 95th percentile | Slowest | Timed attempts |")
    print("|---|---|---|---|---|---|")
    for t, name in TASKS.items():
        ms = [float(r["latency_ms"]) for r in rows if r["task"] == t and r["latency_ms"]]
        if ms:
            limit = float(next(r["limit_ms"] for r in rows if r["task"] == t))
            print(f"| {t} {name} | {seconds(limit)} | {seconds(pct(ms, 50))} | {seconds(pct(ms, 95))} | {seconds(max(ms))} | {len(ms)} |")

    first = [float(r["first_token_ms"]) for r in rows if r["task"] == "T2" and r["first_token_ms"]]
    if first:
        print(f"\nTutor time to first token: median {seconds(pct(first, 50))}, "
              f"95th percentile {seconds(pct(first, 95))}, over {len(first)} generated answers.")

    temps = [float(r["cpu_temp_c"]) for r in rows if r["cpu_temp_c"]]
    bats = [int(r["battery_pct"]) for r in rows if r["battery_pct"]]
    if temps:
        print(f"CPU temperature at the start of each case: {min(temps):.1f} to {max(temps):.1f} °C. "
              f"Battery: {min(bats)} to {max(bats)}%, power: {', '.join(sorted({r['power'] for r in rows if r['power']}))}.")
    nets = [r["network"] for r in rows if r["condition"] == "B" and r["network"]]
    if nets:
        print(f"Condition B: the tablet was connected before {nets.count('connected')} of {len(nets)} attempts.")

    failed = [r for r in rows if r["passed"] != "True"]
    if failed:
        print("\n| Attempt | Reason |\n|---|---|")
        for r in failed:
            print(f"| {r['condition']}{r['case']} {r['task']} | {r['reason']} |")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))

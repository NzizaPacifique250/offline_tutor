#!/usr/bin/env python3
"""Run the offline reliability test of the proposal (§3.7.1) on the tablet.

Six tasks, ten cases and three network conditions give 180 timed attempts,
as set out in docs/evidence/offline-test-2026-10-28/PROTOCOL.md.

    APP_ID=rw.offlinetutor.pilot scripts/offline_test.py OUT_DIR [--conditions ABC] [--cases 1-10] [--prefix OT]
    APP_ID=rw.offlinetutor.pilot scripts/offline_test.py OUT_DIR --dry-run

Each attempt is timed on the tablet's clock: from the device time just
before the tap that starts it to the logcat timestamp of the app line that
marks its result. The uiautomator dumps used to find buttons happen before
that tap, so they do not count against the app. One CSV row per attempt
goes to OUT_DIR/attempts.csv, the app's log to OUT_DIR/logcat.txt.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

os.environ.setdefault("APP_ID", "rw.offlinetutor.pilot")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ui  # noqa: E402  (reads APP_ID when imported)

ACTIVITY = f"{ui.APP_ID}/rw.offlinetutor.MainActivity"
PACKAGES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../curriculum/rw_s6_mathematics/packages")

# Limits from the proposal: stored content 2 s, startup and reopening 10 s,
# a generated explanation 120 s.
LIMIT_MS = {"T1": 2000, "T2": 120000, "T3": 2000, "T4": 2000, "T5": 2000, "T6": 10000}

LESSONS = {
    1: "Operations on complex numbers in algebraic form",
    4: "Definite integrals and their properties",
    5: "Separable equations and particular solutions",
    9: "Expected value, variance and standard deviation",
}

# (unit, exercise number in the lesson, answer typed, question asked)
CASES = [
    (1, 1, "5+3i", "How do I add two complex numbers?"),
    (4, 1, "4.5", "How do I evaluate a definite integral?"),
    (5, 1, "x^2/2+4x-6", "How do I separate the variables in a differential equation?"),
    (9, 1, "1.9", "How do I find the expected value of a random variable?"),
    (1, 2, "-9-15i", "How do I multiply two complex numbers?"),
    (4, 2, "-2", "What are the limits of integration in a definite integral?"),
    (5, 2, "(1+x)/(1-x)", "How do I find a particular solution from an initial condition?"),
    (9, 2, "0.4", "How do I calculate the variance of a discrete random variable?"),
    (1, 3, "3+5i", "What is the conjugate of a complex number?"),
    (4, 3, "0.75", "How do I integrate a function term by term between two limits?"),
]

FIELDS = [
    "condition", "case", "task", "learner", "item", "expected", "observed", "passed", "reason",
    "latency_ms", "limit_ms", "input_tool_ms", "first_token_ms", "record",
    "cpu_temp_c", "battery_pct", "power", "network", "device_time",
]

LOG_LINE = re.compile(r"^\s*(\d+\.\d+)\s+\d+\s+\d+\s+[VDIWEF]\s+ReactNativeJS:\s?(.*)$")


def exercises(unit: int) -> list[dict]:
    """The lesson's exercises in lesson order, with their labels and hints."""
    base = os.path.join(PACKAGES, f"u{unit}")
    with open(os.path.join(base, "lessons.json")) as f:
        lesson = json.load(f)[0]
    with open(os.path.join(base, "exercises.json")) as f:
        by_id = {e["id"]: e for e in json.load(f)}
    return [by_id[i] for i in lesson["exercises"]]


class AppLog:
    """Follows the app's lines in logcat, with the device timestamps."""

    def __init__(self, path: str):
        ui.adb("logcat", "-c")
        self.path = path
        self.out = open(path, "wb")
        self.proc = subprocess.Popen(
            ["adb", "logcat", "-v", "epoch", "ReactNativeJS:I", "*:S"], stdout=self.out, stderr=subprocess.DEVNULL
        )
        self.pos = 0
        self.lines: list[tuple[float, str]] = []

    def poll(self) -> None:
        with open(self.path, "rb") as f:
            f.seek(self.pos)
            chunk = f.read()
        end = chunk.rfind(b"\n")
        if end < 0:
            return
        self.pos += end + 1
        for raw in chunk[: end + 1].decode("utf-8", "replace").splitlines():
            m = LOG_LINE.match(raw)
            if m:
                self.lines.append((float(m.group(1)), m.group(2)))

    def wait(self, patterns: dict[str, str], since: float, timeout: float):
        """The first line at or after `since` matching one of the patterns: (name, time, match), or None."""
        compiled = {k: re.compile(v) for k, v in patterns.items()}
        deadline = time.time() + timeout
        while True:
            self.poll()
            for t, msg in self.lines:
                if t < since:
                    continue
                for name, rx in compiled.items():
                    m = rx.search(msg)
                    if m:
                        return name, t, m
            if time.time() > deadline:
                return None
            time.sleep(0.2)

    def find(self, pattern: str, since: float, until: float | None = None):
        rx = re.compile(pattern)
        self.poll()
        for t, msg in self.lines:
            if t >= since and (until is None or t <= until):
                m = rx.search(msg)
                if m:
                    return t, m
        return None

    def close(self) -> None:
        self.proc.terminate()
        self.out.close()


def shell(cmd: str) -> str:
    return ui.adb("shell", cmd)


def safe_dump() -> ET.Element:
    # ui.dump retries a screen that will not settle and returns an empty one rather than a stale one.
    return ui.dump()


BACK_XY = (54, 57)  # the header's "‹ Back", at the same place on every screen


def screen_texts(patience: int = 20) -> list[str]:
    """The visible texts, waiting up to `patience` seconds for a screen uiautomator can read."""
    for _ in range(patience):
        root = safe_dump()
        if len(root):
            return ui.texts(root)
        time.sleep(1)
    return []


def scroll_top() -> None:
    for _ in range(6):
        shell("input swipe 640 250 640 700 200")
        time.sleep(0.3)


def locate(text: str, from_top: bool = False, swipes: int = 10, cls: str | None = None) -> tuple[int, int] | None:
    """Centre of the first node showing `text` (or of class `cls`), scrolling down until it is clear of the navigation bar."""
    ui.hide_keyboard()
    if from_top:
        scroll_top()
    unreadable = 0

    def where() -> tuple[int, int] | None:
        nonlocal unreadable
        # While the model works the app redraws often and uiautomator may
        # not get an idle screen; read again rather than scroll blind.
        for _ in range(20):
            root = safe_dump()
            if len(root):
                break
            unreadable += 1
            time.sleep(1)
        n = next((n for n in ui.nodes(root) if n.get("class") == cls), None) if cls else ui.find(text, root)
        return ui.bounds(n) if n is not None else None

    scrolled = from_top
    for _ in range(swipes):
        p = where()
        if p is not None and p[1] <= 700:
            # A tap while a scroll is still gliding only stops it, so after
            # scrolling wait until the control holds still between two reads.
            while scrolled:
                time.sleep(0.5)
                q = where()
                if q is None or q[1] > 700:
                    break
                if q == p:
                    return p
                p = q
            else:
                return p
        shell("input swipe 640 600 640 330 300")
        scrolled = True
        time.sleep(0.8)
    print(f"    could not find {text or cls!r} ({unreadable} unreadable screen reads)", flush=True)
    return None


def tap(text: str, **kw) -> bool:
    p = locate(text, **kw)
    if p is None:
        return False
    shell(f"input tap {p[0]} {p[1]}")
    time.sleep(0.8)
    return True


def timed(action: str, cut: bool) -> tuple[float, float]:
    """Run an input command on the tablet between two clock readings; `cut` turns airplane mode on straight after."""
    after = "cmd connectivity airplane-mode enable >/dev/null 2>&1; " if cut else ""
    out = shell(f"t0=$(date +%s.%N); {action} >/dev/null 2>&1; t1=$(date +%s.%N); {after}echo $t0 $t1")
    t0, t1 = map(float, out.split()[-2:])
    return t0, t1


def type_text(text: str) -> None:
    if text.startswith("-"):
        shell("input keyevent KEYCODE_MINUS")
        text = text[1:]
    if text:
        ui.adb("shell", "input", "text", ui.shlex.quote(text.replace(" ", "%s")))
    # React applies the typed text a moment later; tapping sooner sends the old value.
    time.sleep(2)


def network_on() -> str:
    shell("cmd connectivity airplane-mode disable; svc wifi enable")
    deadline = time.time() + 20
    while time.time() < deadline:
        line = shell("dumpsys connectivity 2>/dev/null | grep -m1 'Active default network'")
        if "none" not in line and line.strip():
            return "connected"
        time.sleep(1)
    return "no connection"


def network_off() -> None:
    shell("cmd connectivity airplane-mode enable")
    time.sleep(1)


def device_state() -> dict:
    temps = re.search(r"CPU temperatures: \[([^\]]*)\]", shell("dumpsys hardware_properties"))
    cpu = max(float(x) for x in temps.group(1).split(",")) if temps and temps.group(1).strip() else ""
    bat = shell("dumpsys battery")
    level = re.search(r"level: (\d+)", bat)
    power = "USB" if "USB powered: true" in bat else "AC" if "AC powered: true" in bat else "battery"
    return {"cpu_temp_c": f"{cpu:.1f}" if cpu != "" else "", "battery_pct": level.group(1) if level else "", "power": power}


def app_pid() -> str:
    return shell(f"pidof {ui.APP_ID}").strip()


class Run:
    def __init__(self, out_dir: str):
        os.makedirs(out_dir, exist_ok=True)
        self.shots = os.path.join(out_dir, "failures")
        self.log = AppLog(os.path.join(out_dir, "logcat.txt"))
        new = not os.path.exists(os.path.join(out_dir, "attempts.csv"))
        self.csv_file = open(os.path.join(out_dir, "attempts.csv"), "a", newline="")
        self.csv = csv.DictWriter(self.csv_file, fieldnames=FIELDS)
        if new:
            self.csv.writeheader()
        self.pid = ""
        self.attempts: dict[str, int] = {}

    # --- app lifecycle ---------------------------------------------------

    def start_app(self, cut: bool = False) -> tuple[float, float]:
        shell(f"am force-stop {ui.APP_ID}")
        time.sleep(1)
        t0, t1 = timed(f"am start -n {ACTIVITY}", cut)
        return t0, t1

    def wait_ready(self, since: float, timeout: float = 30):
        hit = self.log.wait({"ready": r"^\[boot\] ready in (\d+) ms", "fail": r"^\[boot\] FAIL"}, since, timeout)
        time.sleep(1.5)
        self.pid = app_pid()
        return hit

    def new_learner(self, code: str) -> bool:
        if not tap("e.g. A1"):
            return False
        type_text(code)
        since = float(shell("date +%s.%N"))
        if not tap("Start"):
            return False
        ok = self.log.wait({"s": rf"^\[session\] learner {re.escape(code)} session"}, since, 10) is not None
        self.attempts.setdefault(code, 0)
        return ok

    def continue_learner(self, code: str) -> bool:
        since = float(shell("date +%s.%N"))
        if not tap("Continue"):
            return False
        return self.log.wait({"s": rf"^\[session\] learner {re.escape(code)} session"}, since, 10) is not None

    def go_topics(self) -> bool:
        moves, unread = 0, 0
        while moves < 6 and unread < 3:
            t = screen_texts()
            if any("Open lesson" in x for x in t):
                return True
            if not t:
                # The screen would not settle (the model is working): read it again.
                unread += 1
                time.sleep(1)
                continue
            moves += 1
            if any("new learner code" in x.lower() for x in t):
                tap("Continue")
            elif "‹ Back" in t:
                shell(f"input tap {BACK_XY[0]} {BACK_XY[1]}")
                time.sleep(1.5)
            else:
                time.sleep(1)
        print(f"    could not reach the topic list ({unread} unreadable screen reads)", flush=True)
        return False

    def open_lesson(self, unit: int) -> bool:
        """From anywhere to the case's lesson, not timed."""
        return self.go_topics() and tap(LESSONS[unit], from_top=True)

    def open_exercise(self, unit: int, label: str) -> str | None:
        """From the lesson to its recommended exercise, not timed; the exercise id from the app's log."""
        since = float(shell("date +%s.%N"))
        if not tap(f"Practise: {label}", from_top=True):
            return None
        opened = self.log.wait({"o": r"^\[practice\] open (\S+) "}, since, 10)
        return opened[2].group(1) if opened else None

    def crashed(self) -> bool:
        return app_pid() != self.pid

    def recover(self, code: str) -> None:
        """After a failed attempt: restart the app and return to the topic list as the same learner."""
        t0, _ = self.start_app()
        self.wait_ready(t0)
        self.continue_learner(code)
        self.go_topics()

    # --- one attempt ------------------------------------------------------

    def record(self, row: dict) -> None:
        self.csv.writerow({k: row.get(k, "") for k in FIELDS})
        self.csv_file.flush()
        mark = "PASS" if row["passed"] else "FAIL"
        print(f"  {row['condition']}{row['case']:>2} {row['task']} {mark} {row.get('latency_ms', '')} ms  {row.get('reason', '')}", flush=True)

    def run_case(self, cond: str, n: int, code: str) -> None:
        unit, k, answer, question = CASES[n - 1]
        exs = exercises(unit)
        ex, nxt = exs[k - 1], exs[k]
        cut = cond == "B"
        state = device_state()
        base = {"condition": cond, "case": n, "learner": code, **state}

        def prepare() -> str:
            return network_on() if cut else "off"

        def done(task: str, ok: bool, latency: float | None, reason: str, **extra) -> bool:
            """Record the attempt. Returns False when the app had to be restarted, so the caller re-navigates."""
            limit = LIMIT_MS[task]
            passed = ok and latency is not None and latency <= limit
            if ok and latency is not None and latency > limit:
                reason = f"{reason}; over the {limit // 1000} s limit"
            crashed = self.crashed()
            if crashed:
                passed, reason = False, "app process ended (crash)"
            if not passed:
                os.makedirs(self.shots, exist_ok=True)
                with open(os.path.join(self.shots, f"{cond}{n:02d}-{task}.png"), "wb") as f:
                    subprocess.run(["adb", "exec-out", "screencap", "-p"], stdout=f, check=False)
            self.record({**base, **extra, "task": task, "passed": passed, "reason": reason,
                         "latency_ms": "" if latency is None else round(latency), "limit_ms": limit})
            # A slow but complete result leaves the app usable; a crash or a
            # missing result does not, so the app is restarted.
            if crashed or latency is None:
                self.recover(code)
                return False
            return True

        if cond == "C":
            t0, _ = self.start_app()
            self.wait_ready(t0)
            self.continue_learner(code)
        self.go_topics()

        # T1: open the topic.
        net = prepare()
        p = locate(LESSONS[unit], from_top=True)
        t0, t1 = timed(f"input tap {p[0]} {p[1]}", cut) if p else (0.0, 0.0)
        hit = self.log.wait({"r": r"^\[lesson\] KaTeX \S+: rendered (\d+) of (\d+) formulas"}, t0, 15) if p else None
        ok = bool(hit) and hit[2].group(1) == hit[2].group(2) and int(hit[2].group(2)) > 0
        if not done("T1", ok, (hit[1] - t0) * 1000 if hit else None,
                    f"{hit[2].group(1)} of {hit[2].group(2)} formulas typeset" if hit else "lesson not rendered" if p else "lesson not found",
                    item=LESSONS[unit], expected="every formula typeset", observed=hit[2].group(0) if hit else "",
                    input_tool_ms=round((t1 - t0) * 1000) if p else "", network=net, device_time=f"{t0:.3f}"):
            self.open_lesson(unit)

        # T2: a generated explanation, asked from the lesson.
        net = prepare()
        ok, latency, reason, first, rec, observed, t0, t1 = False, None, "", "", "", "", 0.0, 0.0
        if tap("e.g. How do I multiply", swipes=8):
            type_text(question)
            p = locate("Ask the tutor")
            if p:
                t0, t1 = timed(f"input tap {p[0]} {p[1]}", cut)
                hit = self.log.wait({
                    "shown": r"^\[guidance\] render: KaTeX",
                    "other": r"^\[guidance\] #(\d+) (stored|declined|cancelled|timed-out|failed|no-model) ",
                    "declined": r"^\[router\] .* -> declined",
                }, t0, 125)
                if hit and hit[0] == "shown":
                    ok, latency = True, (hit[1] - t0) * 1000
                    gen = self.log.find(r"^\[guidance\] #(\d+) generated .* (\d+) tok in (\d+) ms, first (\d+) ms", t0, hit[1])
                    if gen:
                        rec, first = f"guidance #{gen[1].group(1)}", gen[1].group(4)
                    observed, reason = "first step shown", "generated"
                else:
                    reason = "no generated step within 120 s" if not hit else f"{hit[0]}: {hit[2].group(0)[:60]}"
            else:
                reason = "Ask button not found"
        else:
            reason = "question box not found"
        if not done("T2", ok, latency, reason, item=question, expected="first step of a generated answer",
                    observed=observed, first_token_ms=first, record=rec, network=net,
                    input_tool_ms=round((t1 - t0) * 1000) if t0 else "", device_time=f"{t0:.3f}" if t0 else ""):
            self.open_lesson(unit)

        # Open the recommended exercise from the lesson (not timed).
        ex_id = self.open_exercise(unit, ex["source_label"])
        if ex_id is None:
            for task in ("T3", "T4"):
                self.record({**base, "task": task, "passed": False, "item": ex["source_label"], "limit_ms": LIMIT_MS[task],
                             "reason": "the lesson did not offer the expected exercise"})
        else:
            # T3: the first stored hint.
            net = prepare()
            p = locate("Show hint 1 of")
            t0, t1 = timed(f"input tap {p[0]} {p[1]}", cut) if p else (0.0, 0.0)
            hit = self.log.wait({"r": rf"^\[practice\] reveal #(\d+) hint 1 on {re.escape(ex_id)}"}, t0, 15) if p else None
            snippet = ex["hints"][0][:24]
            seen = bool(hit) and locate(snippet, swipes=6) is not None
            if not done("T3", bool(hit) and seen, (hit[1] - t0) * 1000 if hit else None,
                        "hint shown and saved" if hit and seen else "hint saved but not seen on screen" if hit else "no reveal record",
                        item=ex["source_label"], expected=snippet, observed="hint text on screen" if seen else "",
                        record=f"reveal #{hit[2].group(1)}" if hit else "", input_tool_ms=round((t1 - t0) * 1000) if p else "",
                        network=net, device_time=f"{t0:.3f}"):
                self.open_lesson(unit)
                self.open_exercise(unit, ex["source_label"])

            # T4: answer it and get feedback.
            net = prepare()
            ok, latency, reason, rec, observed, t0, t1 = False, None, "", "", "", 0.0, 0.0
            if tap("", cls="android.widget.EditText", from_top=True):
                type_text(answer)
                p = locate("Check answer")
                if p:
                    t0, t1 = timed(f"input tap {p[0]} {p[1]}", cut)
                    hit = self.log.wait({"a": rf'^\[practice\] attempt #(\d+) {re.escape(ex_id)} "(.*)" -> (\w+)'}, t0, 15)
                    if hit:
                        self.attempts[code] = self.attempts.get(code, 0) + 1
                        rec, observed = f"attempt #{hit[2].group(1)}", f'"{hit[2].group(2)}" -> {hit[2].group(3)}'
                        shown = "Correct." in screen_texts()
                        ok = hit[2].group(3) == "correct" and shown
                        latency = (hit[1] - t0) * 1000
                        reason = "marked correct and shown" if ok else "not marked correct" if hit[2].group(3) != "correct" else "feedback not shown"
                    else:
                        reason = "no attempt record"
                else:
                    reason = "Check button not found"
            else:
                reason = "answer field not found"
            done("T4", ok, latency, reason, item=ex["source_label"], expected=f"{answer} -> correct", observed=observed,
                 record=rec, network=net, input_tool_ms=round((t1 - t0) * 1000) if t0 else "",
                 device_time=f"{t0:.3f}" if t0 else "")

        # T5: the next-exercise recommendation on My progress.
        self.go_topics()
        net = prepare()
        p = locate("My progress")
        t0, t1 = timed(f"input tap {p[0]} {p[1]}", cut) if p else (0.0, 0.0)
        hit = self.log.wait({"p": rf"^\[progress\] {re.escape(code)}: (\d+) attempts"}, t0, 15) if p else None
        rec_ok = bool(hit) and locate(f"Practise: {nxt['source_label']}", swipes=8) is not None
        done("T5", rec_ok, (hit[1] - t0) * 1000 if hit else None,
             "recommends the next open exercise" if rec_ok else "recommendation missing or wrong" if hit else "progress not computed",
             item=LESSONS[unit], expected=f"Practise: {nxt['source_label']}", observed=hit[2].group(0)[:80] if hit else "",
             input_tool_ms=round((t1 - t0) * 1000) if p else "", network=net, device_time=f"{t0:.3f}")

        # T6: restart, continue as the same learner, and find every attempt kept.
        net = prepare()
        t0, t1 = self.start_app(cut=cut)
        ready = self.wait_ready(t0)
        latency = (ready[1] - t0) * 1000 if ready and ready[0] == "ready" else None
        kept, ok = "", False
        if latency is not None and self.continue_learner(code) and self.go_topics():
            since = float(shell("date +%s.%N"))
            if tap("My progress"):
                hit = self.log.wait({"p": rf"^\[progress\] {re.escape(code)}: (\d+) attempts"}, since, 15)
                kept = hit[2].group(1) if hit else ""
                ok = kept == str(self.attempts.get(code, 0))
        done("T6", ok, latency,
             f"ready; {kept or 'no'} of {self.attempts.get(code, 0)} attempts shown after the restart" if latency is not None else "app not ready",
             expected=f"{self.attempts.get(code, 0)} attempts after restart", observed=f"{kept} attempts" if kept else "",
             input_tool_ms=round((t1 - t0) * 1000), network=net, device_time=f"{t0:.3f}")


def parse_cases(spec: str) -> list[int]:
    a, _, b = spec.partition("-")
    return list(range(int(a), int(b or a) + 1))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("out")
    ap.add_argument("--conditions", default="ABC")
    ap.add_argument("--cases", default="1-10")
    ap.add_argument("--prefix", default="OT")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    shell("input keyevent KEYCODE_WAKEUP; wm dismiss-keyguard; svc power stayon true")
    run = Run(args.out)
    plan = [("A", [1])] if args.dry_run else [(c, parse_cases(args.cases)) for c in args.conditions]
    try:
        for cond, cases in plan:
            code = f"{args.prefix}-DRY" if args.dry_run else f"{args.prefix}-{cond}"
            print(f"condition {cond}, learner {code}", flush=True)
            if cond == "B":
                print(f"  network: {network_on()}", flush=True)
            else:
                network_off()
            t0, _ = run.start_app()
            run.wait_ready(t0)
            if not run.new_learner(code):
                print("  could not create the learner; stopping", flush=True)
                return 1
            run.go_topics()
            for n in cases:
                run.run_case(cond, n, code)
    finally:
        network_off()
        shell("svc power stayon false")
        run.log.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Run the feasibility benchmark on the tablet over adb.

Answers the question the whole project rests on: can a language model small enough
to fit this tablet give correct, curriculum-grounded help on S6 Advanced
Mathematics, fast enough to be usable?

Two things are measured per model.

Throughput
    ``llama-bench`` reports prompt-processing and token-generation rates. These set
    the latency floor and are independent of the questions asked.

Answer quality and latency
    Each probe in ``bench/eval/s6_math_probe.jsonl`` is sent through
    ``llama-cli``, and the response, time to first token, total time and peak
    resident memory are recorded. Grading happens afterwards in ``tools/grade.py``,
    so a grading change does not require re-running the tablet.

Everything executes on the device. Nothing in the measured path touches the
network, which is the property the dissertation has to demonstrate.

Usage:
    python tools/run_bench.py --throughput-only
    python tools/run_bench.py --models qwen25-math-1.5b
    python tools/run_bench.py --all
"""

from __future__ import annotations

import argparse
import json
import re
import shlex
import subprocess
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BENCH = PROJECT_ROOT / "bench"
RESULTS = BENCH / "results"
RAW = RESULTS / "raw"
PROBES = BENCH / "eval" / "s6_math_probe.jsonl"
DEVICE_DIR = "/data/local/tmp/tutor-bench"
ADB = str(Path.home() / "Android" / "platform-tools" / "adb")

# The tutor's operating instructions. Reused verbatim by the application later, so
# the benchmark measures the prompt that actually ships.
SYSTEM_PROMPT = (
    "You are a mathematics tutor for Senior Six students following the Rwanda "
    "Basic Education Board Advanced Mathematics syllabus.\n"
    "You help only with these four units: Complex Numbers, Integration, "
    "Differential Equations, and Random Variables.\n"
    "If a question falls outside those four units, say plainly that the topic is "
    "not covered yet and do not attempt an answer.\n"
    "If a question is not mathematics at all, say you only help with mathematics.\n"
    "Work in clear numbered steps a Senior Six student can follow.\n"
    "Put your final answer on the last line inside answer tags, like this: "
    "<answer>your answer here</answer>\n"
    "Write the answer in plain ASCII mathematics, not LaTeX. Use ** for powers, "
    "sqrt() for roots, log() for natural logarithm, I for the imaginary unit, "
    "and pi for pi."
)


def log(msg: str) -> None:
    print(f"[bench] {msg}", flush=True)


def warn(msg: str) -> None:
    print(f"[warn ] {msg}", file=sys.stderr, flush=True)


def die(msg: str) -> "None":
    print(f"[fail ] {msg}", file=sys.stderr)
    raise SystemExit(1)


def adb(*args: str, timeout: int = 600) -> subprocess.CompletedProcess:
    return subprocess.run(
        [ADB, *args], capture_output=True, text=True, timeout=timeout, check=False
    )


def adb_shell(cmd: str, timeout: int = 600) -> subprocess.CompletedProcess:
    return adb("shell", cmd, timeout=timeout)


def require_device() -> None:
    out = adb("devices").stdout.splitlines()[1:]
    ready = [l for l in out if l.strip().endswith("device")]
    if not ready:
        die(
            "No tablet visible to adb.\n"
            "  Enable Developer options, turn on USB debugging, reconnect the\n"
            "  cable and tap Allow on the prompt."
        )


def device_threads() -> int:
    """Pick a thread count.

    On a four-core Cortex-A53 with no big/little split, all four cores are equal,
    but leaving one free keeps the UI responsive and avoids thermal throttling
    skewing the numbers. Benchmarks are reported at both settings.
    """
    profile = RESULTS / "device_profile.json"
    cores = 4
    if profile.exists():
        try:
            cores = int(json.loads(profile.read_text()).get("cpu_cores") or 4)
        except Exception:
            pass
    return max(1, cores)


def device_models() -> dict[str, str]:
    """Map a model id to its path on the tablet.

    The id comes from the download manifest rather than being parsed back out of
    the filename, because ids such as ``qwen25-math-1.5b`` contain hyphens and any
    split-on-hyphen rule gets them wrong.
    """
    listing = adb_shell(f"ls {DEVICE_DIR}/models/ 2>/dev/null").stdout.replace("\r", "")
    on_device = {line.strip() for line in listing.splitlines() if line.strip().endswith(".gguf")}
    if not on_device:
        return {}

    manifest_path = BENCH / "models" / "downloaded.json"
    found: dict[str, str] = {}
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        for mid, info in manifest.items():
            fname = info.get("local_file")
            if fname in on_device:
                found[mid] = f"{DEVICE_DIR}/models/{fname}"
                on_device.discard(fname)

    # Anything on the tablet that the manifest does not know about is still
    # usable; fall back to the filename stem as its id.
    for fname in sorted(on_device):
        found[Path(fname).stem] = f"{DEVICE_DIR}/models/{fname}"
    return found


# ---------------------------------------------------------------------------
# Throughput
# ---------------------------------------------------------------------------


def run_throughput(model_id: str, remote_path: str, threads: int) -> dict:
    """Measure prompt processing and generation rate with llama-bench."""
    log(f"throughput: {model_id} at {threads} threads")
    cmd = (
        f"cd {DEVICE_DIR} && ./llama-bench -m {shlex.quote(remote_path)} "
        f"-p 128 -n 32 -t {threads} -r 2 -o json 2>/dev/null"
    )
    started = time.time()
    proc = adb_shell(cmd, timeout=1800)
    elapsed = time.time() - started

    text = proc.stdout.replace("\r", "")
    entries = []
    m = re.search(r"\[\s*\{.*\}\s*\]", text, re.DOTALL)
    if m:
        try:
            entries = json.loads(m.group(0))
        except json.JSONDecodeError as exc:
            warn(f"{model_id}: could not parse llama-bench JSON ({exc})")
    if not entries:
        warn(f"{model_id}: llama-bench produced no result")
        return {
            "model": model_id,
            "threads": threads,
            "ok": False,
            "wall_seconds": round(elapsed, 1),
            "stderr": proc.stderr.replace("\r", "")[-800:],
        }

    result = {"model": model_id, "threads": threads, "ok": True,
              "wall_seconds": round(elapsed, 1), "runs": []}
    for e in entries:
        result["runs"].append({
            "test": f"pp{e.get('n_prompt')}" if e.get("n_prompt") else f"tg{e.get('n_gen')}",
            "n_prompt": e.get("n_prompt"),
            "n_gen": e.get("n_gen"),
            "tokens_per_second": round(float(e.get("avg_ts", 0)), 2),
            "stddev_ts": round(float(e.get("stddev_ts", 0) or 0), 2),
            "model_size_bytes": e.get("model_size"),
            "model_n_params": e.get("model_n_params"),
        })
    for r in result["runs"]:
        label = "prompt processing" if r["n_prompt"] else "generation"
        log(f"  {label:<18} {r['tokens_per_second']:>7.2f} tok/s")
    return result


# ---------------------------------------------------------------------------
# Answer quality
# ---------------------------------------------------------------------------

# Runs on the tablet. Starts llama-cli, samples its high-water memory mark from
# procfs while it works, and writes the peak alongside the output. Sampling from
# the host over adb would miss the peak because each adb round trip costs tens of
# milliseconds.
DEVICE_RUNNER = r"""#!/system/bin/sh
# usage: run_one.sh <model> <prompt_file> <out_prefix> <threads> <n_predict> <ctx>
MODEL="$1"; PROMPT_FILE="$2"; OUT="$3"; THREADS="$4"; NPREDICT="$5"; CTX="$6"
cd "$(dirname "$0")" || exit 1

SYS_FILE="$OUT.sys"

./llama-cli -m "$MODEL" \
  --jinja \
  -sysf "$SYS_FILE" \
  -f "$PROMPT_FILE" \
  -st \
  -n "$NPREDICT" -c "$CTX" -t "$THREADS" \
  --temp 0 -s 42 \
  > "$OUT.stdout" 2> "$OUT.stderr" &
PID=$!

# Sample the high-water memory mark from procfs while the model works. Doing this
# from the host over adb would miss the peak, because each round trip costs tens
# of milliseconds and the peak is reached during model load.
PEAK=0
while [ -d "/proc/$PID" ]; do
  HWM=$(grep VmHWM "/proc/$PID/status" 2>/dev/null | tr -dc '0-9')
  if [ -n "$HWM" ] && [ "$HWM" -gt "$PEAK" ]; then PEAK=$HWM; fi
  sleep 0.2
done
wait $PID
RC=$?

echo "$PEAK" > "$OUT.peakkb"
echo "$RC" > "$OUT.rc"
"""


def install_runner() -> None:
    local = RESULTS / "run_one.sh"
    local.parent.mkdir(parents=True, exist_ok=True)
    local.write_text(DEVICE_RUNNER)
    adb("push", str(local), f"{DEVICE_DIR}/run_one.sh")
    adb_shell(f"chmod 755 {DEVICE_DIR}/run_one.sh")


_ANSI = re.compile(r"\x1b\[[0-9;?]*[a-zA-Z]|\r")
# The current llama-cli reports rates in one compact line on stdout, for example
#   [ Prompt: 3.6 t/s | Generation: 2.4 t/s ]
# Older builds printed "prompt eval time = ... ms ... tokens per second" on
# stderr instead, so both shapes are accepted.
_RATE_LINE = re.compile(
    r"\[\s*Prompt:\s*([\d.]+)\s*t/s\s*\|\s*Generation:\s*([\d.]+)\s*t/s\s*\]"
)


def parse_timings(text: str) -> dict:
    """Pull the throughput figures out of llama-cli's own report."""
    out: dict[str, float] = {}
    m = _RATE_LINE.search(text)
    if m:
        out["prompt_tps"] = round(float(m.group(1)), 2)
        out["gen_tps"] = round(float(m.group(2)), 2)
        return out

    # Legacy stderr format.
    m = re.search(r"prompt eval time.*?,\s*([\d.]+) tokens per second", text, re.DOTALL)
    if m:
        out["prompt_tps"] = round(float(m.group(1)), 2)
    m = re.search(r"[^_]eval time.*?,\s*([\d.]+) tokens per second", text, re.DOTALL)
    if m:
        out["gen_tps"] = round(float(m.group(1)), 2)
    m = re.search(r"prompt eval time\s*=\s*([\d.]+) ms", text)
    if m:
        out["prompt_eval_ms"] = round(float(m.group(1)), 1)
    return out


def clean_response(raw: str, question: str) -> tuple[str, bool]:
    """Strip the CLI banner and trailing report, leaving the model's answer.

    llama-cli prints a logo, a model summary, a command list, then echoes the
    prompt after a "> " marker, then the answer, then a rate line. Only the answer
    is wanted. Returns the answer and whether the generation looks truncated,
    because a truncated answer never reaches its final-answer tag and would
    otherwise be scored as a wrong answer rather than an exhausted token budget.
    """
    text = _ANSI.sub("", raw)

    # Everything up to and including the echoed question is preamble.
    marker = question.strip()[:60]
    idx = text.find(marker)
    if idx != -1:
        nl = text.find("\n", idx)
        text = text[nl + 1:] if nl != -1 else ""
    else:
        # Fall back to the last "> " prompt marker.
        m = list(re.finditer(r"^> .*$", text, re.MULTILINE))
        if m:
            text = text[m[-1].end():]

    m = _RATE_LINE.search(text)
    if m:
        text = text[: m.start()]

    text = re.sub(r"\n?Exiting\.\.\.\s*$", "", text.strip())
    # Drop the model-load spinner if it landed after the marker.
    text = re.sub(r"Loading model\.\.\.[|\\/\- ]*", "", text)
    text = text.strip()
    return text, _looks_truncated(text)


def _looks_truncated(text: str, n_predict: int | None = None) -> bool:
    """Guess whether generation hit the token budget rather than finishing.

    Qwen-Math ignores the requested <answer> tag and closes with \\boxed{} instead,
    so the absence of the tag is not evidence of truncation. A finished answer
    carries some terminal marker; a truncated one stops mid-derivation, typically
    inside an open LaTeX block or after a colon.
    """
    low = text.lower()
    if not text:
        return True
    if "</answer>" in low:
        return False
    if "\\boxed{" in low:
        # Qwen-Math frequently runs out of budget inside the box itself, leaving
        # "\boxed{\frac{1}{2} \" with no closing brace. Count braces from the last
        # \boxed onward; an unbalanced box is the signature of truncation.
        tail = text[low.rfind("\\boxed{"):]
        return tail.count("{") > tail.count("}")
    tail = text.rstrip()[-40:]
    open_blocks = text.count("\\[") - text.count("\\]")
    if open_blocks > 0:
        return True
    if tail.endswith((":", "=", "+", "-", "*", "/", "(", "\\", ",")):
        return True
    # Ends without any closing punctuation and without an answer marker.
    return not tail.endswith((".", ")", "]", "}", "!", "?"))


def run_probes(model_id: str, remote_path: str, threads: int,
               probes: list[dict], n_predict: int, ctx: int) -> Path:
    """Send every probe to one model and record the responses locally."""
    RAW.mkdir(parents=True, exist_ok=True)
    out_path = RAW / f"{model_id}.jsonl"
    rows = []

    prefix = f"{DEVICE_DIR}/work"
    adb_shell(f"mkdir -p {prefix}")

    # The system prompt is pushed once as a file, because passing a long
    # multi-line string through two levels of shell quoting is fragile.
    sys_local = RESULTS / "system_prompt.txt"
    sys_local.write_text(SYSTEM_PROMPT)
    adb("push", str(sys_local), f"{prefix}/probe.sys")

    log(f"probes: {model_id} over {len(probes)} questions")
    for idx, probe in enumerate(probes, 1):
        pid = probe["id"]
        # Push the question as a file for the same quoting reason.
        q_local = RESULTS / ".question.txt"
        q_local.write_text(probe["question"])
        adb("push", str(q_local), f"{prefix}/probe.prompt")

        cmd = (
            f"{DEVICE_DIR}/run_one.sh {shlex.quote(remote_path)} "
            f"{prefix}/probe.prompt {prefix}/probe {threads} {n_predict} {ctx}"
        )
        started = time.time()
        proc = adb_shell(cmd, timeout=1200)
        wall = time.time() - started

        def read(suffix: str) -> str:
            return adb_shell(f"cat {prefix}/probe.{suffix} 2>/dev/null").stdout.replace("\r", "")

        raw_stdout = read("stdout")
        stderr = read("stderr")
        peak_kb = read("peakkb").strip()
        rc = read("rc").strip()

        response, truncated = clean_response(raw_stdout, probe["question"])
        timings = parse_timings(raw_stdout) or parse_timings(stderr)
        row = {
            "id": pid,
            "model": model_id,
            "unit": probe.get("unit"),
            "question": probe["question"],
            "response": response,
            "truncated": truncated,
            "n_predict": n_predict,
            "return_code": int(rc) if rc.isdigit() else None,
            "peak_rss_mb": round(int(peak_kb) / 1024, 1) if peak_kb.isdigit() else None,
            "host_wall_seconds": round(wall, 1),
            **timings,
        }
        rows.append(row)

        # Write after every probe. A full sweep takes hours on this device, and
        # losing it to an interrupted run would be expensive.
        out_path.write_text("\n".join(json.dumps(r) for r in rows) + "\n")

        state = "TRUNC" if truncated else ("ok" if response else "EMPTY")
        log(
            f"  [{idx:>2}/{len(probes)}] {pid:<8} {state:<6} "
            f"{row['host_wall_seconds']:>6.0f}s  "
            f"pp={timings.get('prompt_tps', '?')} "
            f"tg={timings.get('gen_tps', '?')} tok/s  "
            f"peak={row['peak_rss_mb']}MB"
        )
        if proc.returncode != 0 and not response:
            warn(f"  {pid}: runner exited {proc.returncode}; stderr tail: {stderr[-300:]}")

    log(f"wrote {out_path.relative_to(PROJECT_ROOT)}")
    return out_path


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--models", nargs="*", help="model ids; default is every generation model on the device")
    ap.add_argument("--throughput-only", action="store_true")
    ap.add_argument("--probes-only", action="store_true")
    ap.add_argument("--all", action="store_true", help="throughput and probes")
    ap.add_argument("--threads", type=int, default=None)
    ap.add_argument("--n-predict", type=int, default=512)
    ap.add_argument("--ctx", type=int, default=2048)
    ap.add_argument("--limit", type=int, default=None, help="use only the first N probes")
    args = ap.parse_args()

    require_device()
    RESULTS.mkdir(parents=True, exist_ok=True)
    threads = args.threads or device_threads()

    available = device_models()
    # Embedding models are benchmarked separately; exclude them here.
    gen_models = {k: v for k, v in available.items()
                  if not any(t in k for t in ("bge", "minilm"))}
    if not gen_models:
        die(f"No generation models found in {DEVICE_DIR}/models. Run 02_push_to_device.sh first.")

    selected = args.models or sorted(gen_models)
    missing = [m for m in selected if m not in gen_models]
    if missing:
        die(f"not on the device: {missing}. Available: {sorted(gen_models)}")

    do_tp = args.throughput_only or args.all or not args.probes_only
    do_probes = args.probes_only or args.all

    log(f"device threads: {threads}")
    log(f"models: {', '.join(selected)}")

    if do_tp:
        tp_results = []
        for mid in selected:
            tp_results.append(run_throughput(mid, gen_models[mid], threads))
        out = RESULTS / "throughput.json"
        out.write_text(json.dumps(tp_results, indent=2) + "\n")
        log(f"wrote {out.relative_to(PROJECT_ROOT)}")

    if do_probes:
        probes = [json.loads(l) for l in PROBES.read_text().splitlines() if l.strip()]
        if args.limit:
            probes = probes[: args.limit]
        install_runner()
        for mid in selected:
            run_probes(mid, gen_models[mid], threads, probes, args.n_predict, args.ctx)

    log("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

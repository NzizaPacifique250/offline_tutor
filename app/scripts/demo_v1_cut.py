#!/usr/bin/env python3
"""Build the short cut of the v1 demonstration from its marks.

    .venv/bin/python app/scripts/demo_v1_cut.py

Reads docs/demo/v1demo-NN.mp4 (record_demo.sh pull), docs/demo/v1demo.marks
(demo_v1_take.sh) and docs/demo/v1demo.segments (the end time of each
segment on the tablet, written by this script's --segments step), and writes
docs/demo/v1demo-short.mp4. Only the waits are changed: the model copy, the
model loading while the lesson is read, and the two generations are played
faster under a caption that gives the real duration. Everything else is real
time.
"""

import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEMO = ROOT / "docs" / "demo"
NAME = "v1demo"


def sh(*args: str) -> str:
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout.strip()


def duration(path: Path) -> float:
    return float(sh("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)))


def record_segment_ends() -> None:
    """Device mtime (end of recording) of each segment, in laptop epoch seconds."""
    offset = float(sh("date", "+%s.%N")) - float(sh("adb", "shell", "date", "+%s"))
    lines = []
    for line in sh("adb", "shell", f"stat -c '%n %Y' /sdcard/Movies/tutor-demo/{NAME}-*.mp4").splitlines():
        name, mtime = line.rsplit(" ", 1)
        lines.append(f"{Path(name).name} {float(mtime) + offset:.3f}")
    (DEMO / f"{NAME}.segments").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


def main() -> None:
    if "--segments" in sys.argv:
        record_segment_ends()
        return
    segs = []
    for line in (DEMO / f"{NAME}.segments").read_text().split("\n"):
        if line.strip():
            name, end = line.split()
            path = DEMO / name
            d = duration(path)
            segs.append((path, float(end) - d, d))
    marks = {}
    for line in (DEMO / f"{NAME}.marks").read_text().split("\n"):
        if line.strip():
            k, v = line.split()
            marks.setdefault(k, float(v))

    def at(epoch: float) -> float:
        """Position in the joined video of a laptop-clock moment."""
        before = 0.0
        for _, start, d in segs:
            if epoch < start + d:
                return before + max(0.0, epoch - start)
            before += d
        return before

    total = sum(d for _, _, d in segs)
    m = {k: at(v) for k, v in marks.items()}
    real = {
        "copy": marks["copy_end"] - marks["copy_start"],
        "load": marks["typing"] - marks["lesson"],
        "step1": marks["step1_done"] - marks["ask"],
        "simpler": marks["simpler_done"] - marks["simpler"],
    }
    # (start, end, speed, caption)
    plan = [
        (0.0, m["copy_start"] + 2, 1, "Offline Tutor v1.0.0 on the ATMPC IT-801B  |  airplane mode on  |  recorded 19 October 2026"),
        (m["copy_start"] + 2, m["copy_end"] - 1, 4, f"Copying and checking the 986 MB model: {real['copy']:.0f} s in real time, shown at 4x"),
        (m["copy_end"] - 1, m["lesson"] + 14, 1, None),
        (m["lesson"] + 14, m["typing"] - 1, 4, f"The model loads while the lesson is read: {real['load']:.0f} s in real time, shown at 4x"),
        (m["typing"] - 1, m["ask"] + 3, 1, None),
        (m["ask"] + 3, m["step1_done"] - 2, 8, f"On-device generation of step 1: {real['step1']:.0f} s in real time, shown at 8x"),
        (m["step1_done"] - 2, m["simpler"] + 2, 1, None),
        (m["simpler"] + 2, m["simpler_done"] - 2, 6, f"Simpler explanation: {real['simpler']:.0f} s in real time, shown at 6x"),
        (m["simpler_done"] - 2, total, 1, None),
    ]
    for a, b, *_ in plan:
        assert b > a, plan
    with tempfile.TemporaryDirectory() as tmp:
        import pymupdf

        caps = []
        for i, (_, _, _, text) in enumerate(plan):
            if not text:
                caps.append(None)
                continue
            doc = pymupdf.open()
            page = doc.new_page(width=1280, height=60)
            page.draw_rect(pymupdf.Rect(0, 0, 1280, 60), color=None, fill=(0.08, 0.27, 0.49))
            width = pymupdf.get_text_length(text, fontname="hebo", fontsize=22)
            page.insert_text(((1280 - width) / 2, 38), text, fontsize=22, fontname="hebo", color=(1, 1, 1))
            png = Path(tmp) / f"cap{i}.png"
            page.get_pixmap(alpha=False).save(str(png))
            caps.append(png)

        inputs = []
        for path, _, _ in segs:
            inputs += ["-i", str(path)]
        n_seg = len(segs)
        cap_index = {}
        for i, png in enumerate(caps):
            if png:
                cap_index[i] = n_seg + len(cap_index)
                inputs += ["-loop", "1", "-i", str(png)]
        joined = "".join(f"[{k}:v]" for k in range(n_seg)) + f"concat=n={n_seg}:v=1:a=0,fps=30[all]"
        filters = [joined, f"[all]split={len(plan)}" + "".join(f"[s{i}]" for i in range(len(plan)))]
        outs = []
        for i, (a, b, speed, text) in enumerate(plan):
            seg = f"[s{i}]trim={a:.3f}:{b:.3f},setpts=(PTS-STARTPTS)/{speed},fps=30"
            if text:
                seg += f"[r{i}];[r{i}][{cap_index[i]}:v]overlay=0:740:shortest=1"
                if i == 0:
                    seg += ":enable='between(t,0.5,8)'"
            if i == len(plan) - 1:
                seg += ",tpad=stop_mode=clone:stop_duration=4"
            filters.append(seg + f"[p{i}]")
            outs.append(f"[p{i}]")
        filters.append("".join(outs) + f"concat=n={len(plan)}:v=1:a=0[v]")
        out = DEMO / f"{NAME}-short.mp4"
        subprocess.run(
            ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *inputs, "-filter_complex", ";".join(filters),
             "-map", "[v]", "-c:v", "libx264", "-crf", "21", "-preset", "medium", "-pix_fmt", "yuv420p",
             "-movflags", "+faststart", str(out)],
            check=True,
        )
    print(f"short cut: {out} ({duration(out):.0f} s from {total:.0f} s); real waits: " +
          ", ".join(f"{k} {v:.0f} s" for k, v in real.items()))


if __name__ == "__main__":
    main()

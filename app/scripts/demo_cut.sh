#!/usr/bin/env bash
# Build the short cut of a demonstration take recorded by record_demo.sh.
#
#   app/scripts/demo_cut.sh [name]      docs/demo/<name>-NN.mp4 -> docs/demo/<name>-short.mp4
#
# The raw take is kept as it was recorded. The short cut changes two things
# and says so on screen: the on-device generation waits are played faster,
# under a caption giving the real duration and the speed, and an idle
# stretch in which nothing was happening is removed. Nothing else is edited.
#
# The times below are those of the take of 2 October 2026 (four segments),
# read from the application's log and the driver's step marks. For another
# take, set them from that take's marks. Each is seconds into the named
# segment.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/docs/demo"
NAME="${1:-demo}"
PY="$ROOT/.venv/bin/python"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# --- the take's timings -----------------------------------------------------
ASK_END=105.0          # segment 1: three seconds after the question was sent
STEP1_NEAR=170.0       # segment 1: just before step 1 completed (70 s of generation)
RESUME=154.3           # segment 2: where the take resumes after the idle stretch
SIMPLER_START=169.3    # segment 2: just after "Explain this step more simply"
SIMPLER_NEAR=16.0      # segment 3: just before the simpler explanation completed (33 s)
STEP2_START=43.0       # segment 3: just after "Next step (2)"
STEP2_NEAR=63.5        # segment 3: just before step 2 completed (25 s)
HOLD=4                 # seconds to hold the final frame
# ---------------------------------------------------------------------------

# Caption strips: this ffmpeg build has no text filter, so they are drawn
# with PyMuPDF and overlaid across the navigation bar, where no content is.
"$PY" - "$TMP" <<'PYEOF'
import sys
import pymupdf
out = sys.argv[1]
captions = {
    "cap0.png": "Offline Tutor on the ATMPC IT-801B tablet  |  airplane mode on  |  recorded 2 October 2026",
    "cap1.png": "On-device generation of step 1: 70 s in real time, shown at 8x speed",
    "cap2.png": "Simpler explanation: 33 s in real time, shown at 6x speed",
    "cap3.png": "Next step: 25 s in real time, shown at 6x speed",
}
for name, text in captions.items():
    doc = pymupdf.open()
    page = doc.new_page(width=1280, height=60)
    page.draw_rect(pymupdf.Rect(0, 0, 1280, 60), color=None, fill=(0.08, 0.27, 0.49))
    width = pymupdf.get_text_length(text, fontname="hebo", fontsize=24)
    page.insert_text(((1280 - width) / 2, 39), text, fontsize=24, fontname="hebo", color=(1, 1, 1))
    page.get_pixmap(alpha=False).save(f"{out}/{name}")
PYEOF

ffmpeg -y -hide_banner -loglevel error \
  -i "$DIR/$NAME-01.mp4" -i "$DIR/$NAME-02.mp4" -i "$DIR/$NAME-03.mp4" -i "$DIR/$NAME-04.mp4" \
  -loop 1 -i "$TMP/cap0.png" -loop 1 -i "$TMP/cap1.png" -loop 1 -i "$TMP/cap2.png" -loop 1 -i "$TMP/cap2.png" -loop 1 -i "$TMP/cap3.png" \
  -filter_complex "
[0:v]split=3[a1][a2][a3];
[1:v]split=2[b1][b2];
[2:v]split=4[c1][c2][c3][c4];
[a1]trim=0:$ASK_END,setpts=PTS-STARTPTS,fps=30[p1r];[p1r][4:v]overlay=0:740:shortest=1:enable='between(t,0.5,7)'[p1];
[a2]trim=$ASK_END:$STEP1_NEAR,setpts=(PTS-STARTPTS)/8,fps=30[p2r];[p2r][5:v]overlay=0:740:shortest=1[p2];
[a3]trim=start=$STEP1_NEAR,setpts=PTS-STARTPTS,fps=30[p3];
[b1]trim=$RESUME:$SIMPLER_START,setpts=PTS-STARTPTS,fps=30[p4];
[b2]trim=start=$SIMPLER_START,setpts=(PTS-STARTPTS)/6,fps=30[p5r];[p5r][6:v]overlay=0:740:shortest=1[p5];
[c1]trim=0:$SIMPLER_NEAR,setpts=(PTS-STARTPTS)/6,fps=30[p6r];[p6r][7:v]overlay=0:740:shortest=1[p6];
[c2]trim=$SIMPLER_NEAR:$STEP2_START,setpts=PTS-STARTPTS,fps=30[p7];
[c3]trim=$STEP2_START:$STEP2_NEAR,setpts=(PTS-STARTPTS)/6,fps=30[p8r];[p8r][8:v]overlay=0:740:shortest=1[p8];
[c4]trim=start=$STEP2_NEAR,setpts=PTS-STARTPTS,fps=30[p9];
[3:v]setpts=PTS-STARTPTS,fps=30,tpad=stop_mode=clone:stop_duration=$HOLD[p10];
[p1][p2][p3][p4][p5][p6][p7][p8][p9][p10]concat=n=10:v=1:a=0[v]" \
  -map "[v]" -c:v libx264 -crf 21 -preset medium -pix_fmt yuv420p -movflags +faststart "$DIR/$NAME-short.mp4"

printf 'short cut: %s (%s, %.0f s)\n' "$DIR/$NAME-short.mp4" "$(du -h "$DIR/$NAME-short.mp4" | cut -f1)" \
  "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$DIR/$NAME-short.mp4")"

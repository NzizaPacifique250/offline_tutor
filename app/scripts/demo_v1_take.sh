#!/usr/bin/env bash
# Perform the v1 demonstration on the tablet while record_demo.sh records it.
#
#   app/scripts/demo_v1_take.sh            marks -> docs/demo/v1demo.marks
#
# Expects: the pilot build freshly installed (no learners, no model), the
# model file in the tablet's Download folder, airplane mode on, and
# `record_demo.sh start v1demo` already running. Each step writes
# "<name> <epoch seconds>" to the marks file; demo_v1_cut.py turns the marks
# into the short cut. The scenario is the roadmap's demonstration plus the
# v1 additions; docs/DEMO_SCRIPT.md has the narration.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="$ROOT/app"
export APP_ID=rw.offlinetutor.pilot
MARKS="$ROOT/docs/demo/v1demo.marks"
LOG="$ROOT/docs/demo/v1demo.log"
PIN=4821
# A screen step that misses is reported, not fatal: the take is reviewed on video.
U() { python3 "$APP/scripts/ui.py" "$@" >/dev/null || echo "$(date +%T) ui step failed: $*" >&2; }
mark() { echo "$1 $(date +%s.%N)" >> "$MARKS"; echo "$(date +%T) $1"; }
wait_log() { # pattern timeout-seconds
  local end=$((SECONDS + $2))
  while [ $SECONDS -lt $end ]; do
    if [ -n "$(grep -a -E "$1" "$LOG" || true)" ]; then return 0; fi
    sleep 1
  done
  echo "timed out waiting for: $1" >&2
  return 1
}
pause() { sleep "$1"; }

mkdir -p "$ROOT/docs/demo"
: > "$MARKS"
adb logcat -c
adb logcat -v time ReactNativeJS:I '*:S' > "$LOG" 2>&1 &
LOGCAT=$!
trap 'kill $LOGCAT 2>/dev/null || true' EXIT

# The tablet locks after a few idle minutes; wake it and keep it awake.
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard
adb shell svc power stayon true
sleep 2

mark start
U relaunch
pause 5

mark teacher
U tap "Teacher tools"; pause 2
U tap "Teacher PIN"; U type "$PIN"; U tap "Open teacher tools"; pause 4

mark install
U tap "Install the tutor model from a file"; pause 3
U tap "Large files"; pause 3
U tap "qwen25-math-1.5b-Qwen2.5-Math-1.5B-Instruct-Q4_K_M.gguf"
mark copy_start
wait_log "model installed and checked|model not installed" 180
mark copy_end
pause 4
U scrollto "Offline Tutor 1.0.0" 6; pause 4
U top 6

mark learner
adb shell input keyevent KEYCODE_BACK; pause 2
U scrollto "e.g. A1" 6; U tap "e.g. A1"; U type "DEMO-V1"; U tap "Start"; pause 4
U scrollto "Random Variables" 8; pause 3
U top 8; pause 1

mark lesson
U scrollto "Separable equations and particular solutions" 8
U tap "Separable equations and particular solutions"; pause 5
adb shell input swipe 640 650 640 300 600; pause 4
adb shell input swipe 640 650 640 300 600; pause 4
wait_log "warm-up done|warm-up skipped" 90 || true
U scrollto "How do I multiply (3" 14
U tap "How do I multiply (3"

mark typing
first=1
for w in how do I solve a separable differential equation?; do
  if [ $first = 1 ]; then U type "$w"; first=0; else U type " $w"; fi
  pause 2
done
mark ask
adb shell input keyevent 66
# The panel typesets a step only once it is complete, and logs the render.
wait_log '\[guidance\] render:' 300
pause 2
mark step1_done
pause 5

U scrollto "Explain this step more simply" 8
U tap "Explain this step more simply"
mark simpler
wait_log 'generated "\(simpler 1\)' 240
mark simpler_done
pause 6

mark decline
U scrollto "how do I solve a separable differential equation?" 10 || true
U tap "how do I solve a separable differential equation?" || true
U clear 60
U type "explain photosynthesis"
# Enter right after typing would submit the box before the app has the new text.
pause 2
adb shell input keyevent 66
pause 5
U hidekb

mark practice
U top 14
U scrollto "Practise:" 14
U tap "Practise:"; pause 5
U tap "y in terms of x"; U type "x^2"; U tap "Check answer"; pause 4
U scrollto "Show hint 1 of 3" 6; U tap "Show hint 1 of 3"; pause 5
U top 6
U tap "x^2"; U clear 20; U type "y = x^2/2 + 4x - 6"; U tap "Check answer"; pause 4
U hidekb
U scrollto "Show solution" 8; U tap "Show solution"; pause 6

mark progress
adb shell input keyevent KEYCODE_BACK; pause 2
adb shell input keyevent KEYCODE_BACK; pause 2
U scrollto "My progress" 10; U tap "My progress"; pause 6

mark restart
adb shell am force-stop "$APP_ID"; pause 2
adb shell am start -n "$APP_ID/rw.offlinetutor.MainActivity" >/dev/null; pause 5
U tap "Continue"; pause 3
U scrollto "My progress" 10; U tap "My progress"; pause 6

mark export
U tap "DEMO-V1 ⇄"; pause 2
U scrollto "Teacher tools" 6; U tap "Teacher tools"; pause 2
U tap "Teacher PIN"; U type "$PIN"; U tap "Open teacher tools"; pause 3
U scrollto "Export records" 6; U tap "Export records"; pause 6

mark end

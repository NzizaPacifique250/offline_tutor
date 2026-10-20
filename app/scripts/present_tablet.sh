#!/usr/bin/env bash
# Show the tablet's screen in a window on this laptop, for a meeting (share
# the window) or a projector. Uses scrcpy over the USB cable: no network, no
# app on the tablet. Close the window to stop; the tablet keeps running.
#
#   app/scripts/present_tablet.sh                     mirror the tablet
#   app/scripts/present_tablet.sh --record=take.mp4   mirror and record
#   ANDROID_SERIAL=<serial> app/scripts/present_tablet.sh   show the phone, or one of several devices
#
# scrcpy 4.1 (the official Linux build, checksum verified) lives in
# ~/.local/opt/scrcpy-linux-x86_64-v4.1; set SCRCPY to use another copy.

set -euo pipefail
SCRCPY="${SCRCPY:-$HOME/.local/opt/scrcpy-linux-x86_64-v4.1/scrcpy}"

# Started from the applications menu there is no terminal to read, so say
# what went wrong in a desktop notification as well.
fail() {
  echo "$1" >&2
  command -v notify-send >/dev/null && notify-send "Present tablet" "$1" || true
  exit 1
}

# The same adb as the development scripts, so the running adb server is kept;
# scrcpy's own copy only when no other is found.
ADB_BIN="$(command -v adb || true)"
for c in "$HOME/platform-tools/adb" "$HOME/Android/Sdk/platform-tools/adb" "$(dirname "$SCRCPY")/adb"; do
  if [ -z "$ADB_BIN" ] && [ -x "$c" ]; then ADB_BIN="$c"; fi
done

[ -x "$SCRCPY" ] || fail "scrcpy not found at $SCRCPY"
# With the tablet and a phone both connected, name the one to show:
#   ANDROID_SERIAL=<serial from "adb devices"> app/scripts/present_tablet.sh
if [ -z "${ANDROID_SERIAL:-}" ] && [ "$("$ADB_BIN" devices | grep -c "device$")" -gt 1 ]; then
  "$ADB_BIN" devices -l | tail -n +2 >&2
  fail "Several devices are connected; choose one with ANDROID_SERIAL=<serial> (see adb devices)."
fi
"$ADB_BIN" get-state >/dev/null 2>&1 || fail "No tablet found: connect it by USB and allow USB debugging."

# The tablet locks after a few idle minutes; wake and unlock it first.
"$ADB_BIN" shell input keyevent KEYCODE_WAKEUP
"$ADB_BIN" shell wm dismiss-keyguard

# 30 frames a second leaves more of the tablet's processor to the AI tutor.
exec env ADB="$ADB_BIN" "$SCRCPY" --stay-awake --no-audio --max-fps=30 --window-title="Offline Tutor tablet" "$@"

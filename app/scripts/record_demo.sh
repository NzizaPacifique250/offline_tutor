#!/usr/bin/env bash
# Record the tablet's screen for the demonstration video.
#
#   app/scripts/record_demo.sh start [name]   begin recording in 3-minute segments
#   app/scripts/record_demo.sh stop           end the current segment and stop
#   app/scripts/record_demo.sh pull [name]    copy the segments to docs/demo/ and join them
#
# Android's screenrecord stops by itself after 180 seconds, and a tutoring
# session with on-device generation is longer than that, so `start` records
# back-to-back segments until `stop`. The video has no sound; narration is
# recorded separately or added in the edit. The cable must stay attached
# while recording, but the app itself uses no network: turn airplane mode on
# first so the status bar shows it.
#
# The segments are joined with ffmpeg when it is installed; otherwise they
# are left as numbered files, which any editor can place in order.

set -euo pipefail
. "$(dirname "$0")/env.sh"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="$ROOT/docs/demo"
DEVICE_DIR="/sdcard/Movies/tutor-demo"
PIDFILE="/tmp/tutor-demo-recorder.pid"

adb get-state >/dev/null 2>&1 || app_die "No tablet visible to adb"

case "${1:-}" in
  start)
    name="${2:-demo}"
    [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null && app_die "Already recording (pid $(cat "$PIDFILE")). Run: $0 stop"
    adb shell "rm -rf '$DEVICE_DIR' && mkdir -p '$DEVICE_DIR'"
    # Keep the screen on for the whole take.
    adb shell svc power stayon true
    # Detached, so the recording outlives the terminal command that started it.
    nohup "$0" _loop "$name" >/dev/null 2>&1 &
    echo $! > "$PIDFILE"
    app_log "Recording to $DEVICE_DIR/$name-NN.mp4 in 3-minute segments. Stop with: $0 stop"
    ;;
  _loop)
    name="${2:-demo}"
    n=1
    while :; do
      f="$DEVICE_DIR/$(printf '%s-%02d.mp4' "$name" "$n")"
      # 8 Mbit/s at the native size is sharp enough for formulas and small text.
      adb shell screenrecord --time-limit 180 --bit-rate 8000000 "$f" || break
      n=$((n + 1))
    done
    ;;
  stop)
    [ -f "$PIDFILE" ] || app_die "Not recording"
    kill "$(cat "$PIDFILE")" 2>/dev/null || true
    rm -f "$PIDFILE"
    # SIGINT lets screenrecord finish the MP4 it is writing.
    adb shell "pkill -INT screenrecord" 2>/dev/null || true
    sleep 3
    adb shell svc power stayon false
    app_log "Stopped. Segments on the tablet:"
    adb shell "ls -la '$DEVICE_DIR'" | tail -n +2
    ;;
  pull)
    name="${2:-demo}"
    mkdir -p "$OUT_DIR"
    adb pull "$DEVICE_DIR/." "$OUT_DIR/" >/dev/null
    ls -la "$OUT_DIR"/"$name"-*.mp4
    if command -v ffmpeg >/dev/null; then
      list="$OUT_DIR/$name.txt"
      : > "$list"
      for f in "$OUT_DIR"/"$name"-*.mp4; do printf "file '%s'\n" "$f" >> "$list"; done
      ffmpeg -y -loglevel error -f concat -safe 0 -i "$list" -c copy "$OUT_DIR/$name.mp4"
      rm -f "$list"
      app_log "Joined: $OUT_DIR/$name.mp4 ($(du -h "$OUT_DIR/$name.mp4" | cut -f1))"
    else
      app_log "ffmpeg not installed: the segments are in $OUT_DIR, in order."
    fi
    ;;
  *)
    sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac

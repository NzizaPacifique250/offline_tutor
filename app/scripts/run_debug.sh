#!/usr/bin/env bash
# Install the debug APK on the tablet and launch it against a local Metro.
#
# Usage: app/scripts/run_debug.sh [--no-build]
#
# The debug build carries its own JavaScript bundle (see debuggableVariants in
# android/app/build.gradle), so the installed app runs with no laptop. When
# Metro is reachable over `adb reverse`, as this script arranges, the app
# loads from Metro instead so edits reload without a rebuild.

set -euo pipefail
. "$(dirname "$0")/env.sh"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APK="$APP_DIR/android/app/build/outputs/apk/debug/app-debug.apk"

app_check_toolchain
adb get-state >/dev/null 2>&1 || app_die "No tablet visible to adb"

# The bundle needs the curriculum packages and the generated KaTeX module
# whether or not the APK is rebuilt.
"$APP_DIR/scripts/sync_content.sh"
"$APP_DIR/scripts/sync_katex_assets.sh"

if [ "${1:-}" != "--no-build" ]; then
  app_log "Building debug APK"
  (cd "$APP_DIR/android" && ./gradlew :app:assembleDebug --max-workers=2 --console=plain -q)
fi
[ -f "$APK" ] || app_die "APK not found: $APK"

app_log "Installing $(du -h "$APK" | cut -f1) APK"
adb install -r -t "$APK" | tail -1

# Let the device reach Metro on the laptop as localhost:8081.
adb reverse tcp:8081 tcp:8081

if ! curl -s http://localhost:8081/status | grep -q running; then
  app_log "Starting Metro in the background (log: /tmp/metro.log)"
  (cd "$APP_DIR" && nohup npx react-native start --no-interactive >/tmp/metro.log 2>&1 &)
  for _ in $(seq 1 30); do
    curl -s http://localhost:8081/status | grep -q running && break
    sleep 1
  done
fi
curl -s http://localhost:8081/status | grep -q running || app_die "Metro did not start. See /tmp/metro.log"

app_log "Launching $APP_ID"
adb shell am start -n "$APP_ID/.MainActivity" >/dev/null

app_log "Watching logcat for the native loader and crashes (Ctrl-C to stop)"
adb logcat -c
adb logcat -v time RNLlama:V ReactNativeJS:V AndroidRuntime:E DEBUG:F libc:F '*:S'

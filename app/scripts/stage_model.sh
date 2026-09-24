#!/usr/bin/env bash
# Copy the model into the app's private storage on the tablet.
#
# The GGUF is already on the device from the benchmark kit, so this copies it
# on-device instead of pushing 941 MB over USB again. It works on debug builds
# only, because `run-as` requires a debuggable package. Release builds will
# bundle or download the model instead (see P6 in the development plan).
#
# Usage: app/scripts/stage_model.sh [model-file-name]

set -euo pipefail
. "$(dirname "$0")/env.sh"

MODEL="${1:-$MODEL_FILE}"
SRC="$DEVICE_MODELS_DIR/$MODEL"
DST_DIR="files/models"
DST="$DST_DIR/$MODEL"

adb get-state >/dev/null 2>&1 || app_die "No tablet visible to adb"
adb shell "[ -f '$SRC' ]" || app_die "Model not staged on the tablet: $SRC. Run bench/scripts/02_push_to_device.sh"
adb shell "run-as $APP_ID true" >/dev/null 2>&1 || app_die "$APP_ID is not installed as a debuggable build"

app_log "Copying $MODEL into $APP_ID/$DST_DIR (on-device)"
adb shell "run-as $APP_ID mkdir -p $DST_DIR"

# The benchmark staging directory is world-readable, so a direct copy inside
# the app's user works. If a future Android build tightens that, stream it
# through the laptop instead.
if ! adb shell "run-as $APP_ID cp '$SRC' '$DST'" 2>/dev/null; then
  app_log "Direct copy refused, streaming through adb instead"
  adb exec-out "cat '$SRC'" | adb shell "run-as $APP_ID sh -c 'cat > $DST'"
fi

app_log "Verifying checksum"
src_sum="$(adb shell "sha256sum '$SRC'" | cut -c1-64)"
dst_sum="$(adb shell "run-as $APP_ID sha256sum '$DST'" | cut -c1-64)"
[ "$src_sum" = "$dst_sum" ] || app_die "Checksum mismatch after copy"

# The absolute path the app will open. /data/data/<pkg> is the stable alias
# of /data/user/0/<pkg> on a single-user device.
app_log "Staged: /data/data/$APP_ID/$DST  ($src_sum)"

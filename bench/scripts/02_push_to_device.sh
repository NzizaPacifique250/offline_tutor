#!/usr/bin/env bash
# Push the cross-compiled binaries, the chosen models and the probe set to the tablet.
#
# Everything lands in /data/local/tmp/tutor-bench, which is the only directory an
# adb shell user can both write to and execute from on a device that is not rooted.
#
# Usage: bench/scripts/02_push_to_device.sh [model.gguf ...]
#        With no arguments, every .gguf in bench/models is pushed.

. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_device

STAGE_DIR="$BENCH_ROOT/device-bin"
[ -d "$STAGE_DIR" ] || die "No binaries staged. Run 01_build_llamacpp_android.sh first."

log "Creating $DEVICE_DIR on the tablet"
adb shell "mkdir -p $DEVICE_DIR/models" >/dev/null

log "Pushing binaries"
for f in "$STAGE_DIR"/*; do
  [ -f "$f" ] || continue
  adb push "$f" "$DEVICE_DIR/" >/dev/null
  adb shell "chmod 755 $DEVICE_DIR/$(basename "$f")"
  printf '  %s\n' "$(basename "$f")"
done

# Confirm the binary actually runs. A silent failure here is almost always a
# missing libomp, which is why the build disables OpenMP.
log "Smoke-testing llama-cli on the device"
if out="$(adb shell "$DEVICE_DIR/llama-cli --version" 2>&1)"; then
  printf '  %s\n' "$(echo "$out" | head -2 | tr '\n' ' ')"
else
  die "llama-cli will not start on the device. Output:
$out"
fi

# --- Models ---
if [ "$#" -gt 0 ]; then
  MODELS=("$@")
else
  mapfile -t MODELS < <(find "$MODELS_DIR" -maxdepth 1 -name '*.gguf' | sort)
fi

if [ "${#MODELS[@]}" -eq 0 ]; then
  warn "No models found in $MODELS_DIR. Run 04_fetch_models.sh, then re-run this script."
else
  # Check free space before pushing, because a partial push produces a corrupt
  # GGUF and a confusing error much later.
  need=0
  for m in "${MODELS[@]}"; do
    need=$(( need + $(stat -c%s "$m") ))
  done
  free_kb="$(adb shell "df /data/local/tmp | tail -1" | tr -d '\r' | awk '{print $4}')"
  free_bytes=$(( free_kb * 1024 ))
  log "Models need $(numfmt --to=iec "$need"); device has $(numfmt --to=iec "$free_bytes") free"
  if [ "$need" -gt "$free_bytes" ]; then
    die "Not enough free space on the tablet."
  fi

  for m in "${MODELS[@]}"; do
    base="$(basename "$m")"
    # Skip a model that is already there with a matching size, so the script is
    # cheap to re-run over a slow USB 2.0 link.
    remote_size="$(adb shell "stat -c%s $DEVICE_DIR/models/$base 2>/dev/null || echo 0" | tr -d '\r')"
    local_size="$(stat -c%s "$m")"
    if [ "$remote_size" = "$local_size" ]; then
      printf '  %-45s already present, skipped\n' "$base"
      continue
    fi
    printf '  %-45s pushing %s\n' "$base" "$(numfmt --to=iec "$local_size")"
    adb push "$m" "$DEVICE_DIR/models/$base" >/dev/null
  done
fi

log "Pushing the evaluation probe set"
adb push "$EVAL_DIR/." "$DEVICE_DIR/eval/" >/dev/null 2>&1 || warn "no probe set to push yet"

log "Contents of $DEVICE_DIR"
adb shell "ls -la $DEVICE_DIR $DEVICE_DIR/models" | tr -d '\r' | sed 's/^/  /'

log "Done. Next: bench/scripts/03_run_bench.sh"

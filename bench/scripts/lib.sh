#!/usr/bin/env bash
# Shared configuration for the benchmark kit.
# Source this from every script: . "$(dirname "$0")/lib.sh"

set -euo pipefail

# --- Toolchain locations (all user-space, no sudo required) ---
export ANDROID_TOOLS="${ANDROID_TOOLS:-$HOME/Android}"
export PATH="$ANDROID_TOOLS/platform-tools:$PATH"

export NDK_HOME="${NDK_HOME:-$ANDROID_TOOLS/android-ndk-r27c}"
export JAVA_HOME="${JAVA_HOME:-$(ls -d "$ANDROID_TOOLS"/jdk-17* 2>/dev/null | head -1)}"
export ANDROID_HOME="${ANDROID_HOME:-$ANDROID_TOOLS/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"

export LLAMA_SRC="${LLAMA_SRC:-$ANDROID_TOOLS/llama.cpp}"

# --- Project locations ---
BENCH_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export BENCH_ROOT
export PROJECT_ROOT="$(dirname "$BENCH_ROOT")"

# cmake and ninja live in the project virtualenv, because this machine's system
# Python is PEP 668 managed and sudo is unavailable.
export VENV="$PROJECT_ROOT/.venv"
export PATH="$VENV/bin:$PATH"
export MODELS_DIR="$BENCH_ROOT/models"
export RESULTS_DIR="$BENCH_ROOT/results"
export EVAL_DIR="$BENCH_ROOT/eval"

# --- On-device staging area ---
# /data/local/tmp is the only path writable by the adb shell user on a
# non-rooted device, and it permits execution.
export DEVICE_DIR="/data/local/tmp/tutor-bench"

# --- Target ABI ---
# Every Rockchip tablet shipping Android 9 or later is arm64-v8a.
export ANDROID_ABI="${ANDROID_ABI:-arm64-v8a}"
export ANDROID_API="${ANDROID_API:-24}"

log()  { printf '\033[1;34m[bench]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn ]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[fail ]\033[0m %s\n' "$*" >&2; exit 1; }

# Fail early and with a useful message rather than a cryptic adb error.
require_device() {
  command -v adb >/dev/null || die "adb not on PATH. Expected $ANDROID_TOOLS/platform-tools/adb"
  local n
  n="$(adb devices | awk 'NR>1 && $2=="device"' | wc -l)"
  if [ "$n" -eq 0 ]; then
    if adb devices | awk 'NR>1 && $2=="unauthorized"' | grep -q .; then
      die "Tablet is connected but UNAUTHORIZED. Unlock it and tap 'Allow' on the USB debugging prompt."
    fi
    die "No tablet visible to adb.
  On the tablet:
    1. Settings > About tablet > tap 'Build number' 7 times
    2. Settings > System > Developer options > enable 'USB debugging'
    3. Reconnect the cable, then tap 'Allow' on the prompt
  Then re-run this script."
  fi
  if [ "$n" -gt 1 ]; then
    die "More than one device is attached. Set ANDROID_SERIAL to the one you want."
  fi
}

#!/usr/bin/env bash
# Cross-compile llama.cpp for the tablet (arm64-v8a) and stage the binaries.
#
# Produces static CLI tools that run directly from the adb shell, which lets us
# benchmark the real device before any application code exists.
#
# Usage: bench/scripts/01_build_llamacpp_android.sh [--clean]

. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

export PATH="$HOME/.local/bin:$PATH"   # pip-installed cmake and ninja

BUILD_DIR="$LLAMA_SRC/build-android-$ANDROID_ABI"
STAGE_DIR="$BENCH_ROOT/device-bin"

[ -d "$NDK_HOME" ]  || die "NDK not found at $NDK_HOME"
[ -d "$LLAMA_SRC" ] || die "llama.cpp source not found at $LLAMA_SRC"
command -v cmake >/dev/null || die "cmake not on PATH (try: pip3 install --user cmake ninja)"

if [ "${1:-}" = "--clean" ]; then
  log "Removing $BUILD_DIR"
  rm -rf "$BUILD_DIR"
fi

# --- Choose -march from the real device, not from a guess ---
#
# Compiling for a newer architecture than the device implements produces a binary
# that dies with SIGILL the first time it reaches a dot-product or fp16
# instruction. The target here is a Cortex-A53, which is ARMv8.0-A and has none of
# those extensions, so the flags are read from the device profile rather than
# assumed.
PROFILE="$RESULTS_DIR/device_profile.json"
ARCH_FLAGS="-march=armv8-a"
if [ -f "$PROFILE" ]; then
  has() { grep -q "\"$1\": \"yes\"" "$PROFILE"; }
  exts=""
  has asimddp && exts="$exts+dotprod"
  has asimdhp && exts="$exts+fp16"
  has i8mm    && exts="$exts+i8mm"
  if [ -n "$exts" ]; then
    ARCH_FLAGS="-march=armv8.2-a$exts"
  fi
  log "Device profile found. Using $ARCH_FLAGS"
  if [ -z "$exts" ]; then
    warn "This CPU has no dotprod, fp16 or i8mm extension."
    warn "Quantized inference will fall back to slower scalar kernels."
  fi
else
  warn "No device profile at $PROFILE. Falling back to baseline $ARCH_FLAGS."
  warn "Run 00_device_profile.sh first to enable CPU-specific optimisation."
fi

log "Configuring for $ANDROID_ABI, API $ANDROID_API"

# Notes on the flag choices:
#   GGML_OPENMP=OFF     Android's libomp is not present on stock devices; without
#                       this the binary fails to load at runtime.
#   LLAMA_CURL=OFF      No libcurl in the NDK sysroot, and we push models manually.
#   GGML_LLAMAFILE=OFF  Avoids a sgemm path that has been unstable on some
#                       low-end ARM cores.
#   ARCH_FLAGS          Derived from the device profile above, never assumed.
cmake -S "$LLAMA_SRC" -B "$BUILD_DIR" -G Ninja \
  -DCMAKE_TOOLCHAIN_FILE="$NDK_HOME/build/cmake/android.toolchain.cmake" \
  -DANDROID_ABI="$ANDROID_ABI" \
  -DANDROID_PLATFORM="android-$ANDROID_API" \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF \
  -DGGML_OPENMP=OFF \
  -DGGML_LLAMAFILE=OFF \
  -DLLAMA_CURL=OFF \
  -DLLAMA_BUILD_TESTS=OFF \
  -DLLAMA_BUILD_EXAMPLES=ON \
  -DCMAKE_C_FLAGS="$ARCH_FLAGS -O3" \
  -DCMAKE_CXX_FLAGS="$ARCH_FLAGS -O3"

log "Building (this takes a few minutes)"
cmake --build "$BUILD_DIR" --target llama-cli llama-bench llama-embedding -j "$(nproc)"

log "Staging binaries into $STAGE_DIR"
mkdir -p "$STAGE_DIR"
found=0
for name in llama-cli llama-bench llama-embedding; do
  # The output location moved between llama.cpp versions, so search for it.
  path="$(find "$BUILD_DIR" -type f -name "$name" -perm -u+x | head -1)"
  if [ -n "$path" ]; then
    cp -f "$path" "$STAGE_DIR/"
    found=$((found + 1))
  else
    warn "binary not produced: $name"
  fi
done
[ "$found" -gt 0 ] || die "No binaries were produced. Check the build output above."

# Unstripped these are around 400 MB in total, which is slow to push over USB 2.0
# and wasteful on a tablet with limited storage. Stripping takes them to ~25 MB.
STRIP="$NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-strip"
if [ -x "$STRIP" ]; then
  before="$(du -sh "$STAGE_DIR" | cut -f1)"
  for f in "$STAGE_DIR"/*; do "$STRIP" --strip-all "$f"; done
  log "Stripped symbols: $before -> $(du -sh "$STAGE_DIR" | cut -f1)"
else
  warn "llvm-strip not found; binaries stay unstripped and large"
fi

log "Verifying the binaries are arm64 and depend only on Android system libraries"
for f in "$STAGE_DIR"/*; do
  deps="$("$NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-readelf" -d "$f" 2>/dev/null \
    | grep -o '\[lib[^]]*\]' | tr -d '[]' | tr '\n' ' ')"
  printf '  %-18s needs: %s\n' "$(basename "$f")" "${deps:-none}"
  # libomp would mean the binary cannot start on a stock device.
  case "$deps" in *libomp*) warn "$(basename "$f") links libomp and will fail on the tablet" ;; esac
done

for f in "$STAGE_DIR"/*; do
  printf '  %-18s %s\n' "$(basename "$f")" "$(file -b "$f" | cut -c1-90)"
done

log "Done. $found binaries staged. Next: bench/scripts/02_push_to_device.sh"

#!/usr/bin/env bash
# Cross-compile llama.cpp with the Vulkan backend for the tablet's Mali GPU.
#
# Why this exists: the RK3562's Cortex-A53 cores have no dot-product or int8
# matrix extension, so CPU inference is stuck at roughly 4 tokens per second.
# The device does ship a Vulkan driver (/vendor/lib64/hw/vulkan.rk3562.so), so
# offloading to the Mali GPU is the only remaining way to make interactive
# tutoring viable on this hardware.
#
# Extra dependencies compared with the CPU build:
#   glslc          ships inside the NDK, at shader-tools/
#   SPIRV-Headers  cloned and installed separately, header-only
#
# The shader generator, vulkan-shaders-gen, must run on the build machine while
# everything else targets ARM. llama.cpp's own CMake handles that split, which is
# why the host compiler is left visible to the configure step.
#
# Usage: bench/scripts/05_build_vulkan_android.sh [--clean]

. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

SPIRV_PREFIX="${SPIRV_PREFIX:-$ANDROID_TOOLS/spirv-prefix}"
SPIRV_SRC="${SPIRV_SRC:-$ANDROID_TOOLS/SPIRV-Headers}"
VKHPP_SRC="${VKHPP_SRC:-$ANDROID_TOOLS/Vulkan-Headers}"
GLSLC="$NDK_HOME/shader-tools/linux-x86_64/glslc"
SYSROOT="$NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/sysroot"

# Vulkan 1.1 is guaranteed from API 24, but the loader stubs for a usable
# feature set land at 28, and the tablet reports API 35, so nothing is lost by
# raising the floor for this build only.
VK_API="${VK_API:-28}"

BUILD_DIR="$LLAMA_SRC/build-android-vulkan"
STAGE_DIR="$BENCH_ROOT/device-bin-vulkan"

[ -x "$GLSLC" ] || die "glslc not found at $GLSLC"
[ -d "$SYSROOT" ] || die "NDK sysroot not found at $SYSROOT"

# SPIRV-Headers is header-only; install it once if it is not already there.
if [ ! -f "$SPIRV_PREFIX/share/cmake/SPIRV-Headers/SPIRV-HeadersConfig.cmake" ]; then
  log "Installing SPIRV-Headers into $SPIRV_PREFIX"
  [ -d "$SPIRV_SRC" ] || git clone --depth 1 \
    https://github.com/KhronosGroup/SPIRV-Headers.git "$SPIRV_SRC"
  cmake -S "$SPIRV_SRC" -B "$SPIRV_SRC/build" -DCMAKE_INSTALL_PREFIX="$SPIRV_PREFIX" >/dev/null
  cmake --install "$SPIRV_SRC/build" >/dev/null
fi

# The NDK ships only the C headers. ggml-vulkan is written against vulkan.hpp,
# the C++ bindings, so those come from Khronos' Vulkan-Headers repository. Linking
# still uses the NDK's libvulkan.so; anything newer than the platform stub is
# resolved at runtime through vkGetInstanceProcAddr, so the newer headers are safe.
if [ ! -f "$VKHPP_SRC/include/vulkan/vulkan.hpp" ]; then
  log "Fetching Vulkan-Headers (C++ bindings) into $VKHPP_SRC"
  git clone --depth 1 https://github.com/KhronosGroup/Vulkan-Headers.git "$VKHPP_SRC"
fi
VK_INCLUDE="$VKHPP_SRC/include"

VK_LIB="$SYSROOT/usr/lib/aarch64-linux-android/$VK_API/libvulkan.so"
[ -f "$VK_LIB" ] || die "libvulkan.so not found at $VK_LIB"

if [ "${1:-}" = "--clean" ]; then
  log "Removing $BUILD_DIR"
  rm -rf "$BUILD_DIR"
fi

log "Configuring Vulkan build (API $VK_API, glslc from the NDK)"
cmake -S "$LLAMA_SRC" -B "$BUILD_DIR" -G Ninja \
  -DCMAKE_TOOLCHAIN_FILE="$NDK_HOME/build/cmake/android.toolchain.cmake" \
  -DANDROID_ABI="$ANDROID_ABI" \
  -DANDROID_PLATFORM="android-$VK_API" \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF \
  -DGGML_VULKAN=ON \
  -DGGML_OPENMP=OFF \
  -DGGML_LLAMAFILE=OFF \
  -DLLAMA_CURL=OFF \
  -DLLAMA_BUILD_TESTS=OFF \
  -DVulkan_GLSLC_EXECUTABLE="$GLSLC" \
  -DVulkan_INCLUDE_DIR="$VK_INCLUDE" \
  -DVulkan_LIBRARY="$VK_LIB" \
  -DCMAKE_PREFIX_PATH="$SPIRV_PREFIX" \
  -DCMAKE_FIND_ROOT_PATH_MODE_PACKAGE=BOTH \
  -DCMAKE_C_FLAGS="-march=armv8-a -O3" \
  -DCMAKE_CXX_FLAGS="-march=armv8-a -O3 -I$SPIRV_PREFIX/include"

log "Building (the shader generator runs on this machine, the rest targets ARM)"
cmake --build "$BUILD_DIR" --target llama-cli llama-bench -j "$(nproc)"

log "Staging into $STAGE_DIR"
mkdir -p "$STAGE_DIR"
for name in llama-cli llama-bench; do
  path="$(find "$BUILD_DIR" -type f -name "$name" -perm -u+x | head -1)"
  [ -n "$path" ] && cp -f "$path" "$STAGE_DIR/" || warn "not produced: $name"
done

STRIP="$NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-strip"
[ -x "$STRIP" ] && for f in "$STAGE_DIR"/*; do "$STRIP" --strip-all "$f"; done

log "Staged:"
ls -lh "$STAGE_DIR" | tail -n +2 | sed 's/^/  /'

cat <<'EOF'

Next steps:
  adb push bench/device-bin-vulkan/llama-bench /data/local/tmp/tutor-bench/llama-bench-vk
  adb shell chmod 755 /data/local/tmp/tutor-bench/llama-bench-vk
  adb shell "cd /data/local/tmp/tutor-bench && ./llama-bench-vk -m models/<model>.gguf -ngl 99 -p 128 -n 32"

If the Vulkan device is not detected, the binary falls back to CPU and reports
backend "CPU" in the results table. That is the signal that the Mali driver
rejected the required features rather than that the build failed.
EOF

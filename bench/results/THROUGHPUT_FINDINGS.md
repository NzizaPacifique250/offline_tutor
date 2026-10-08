# Throughput on the Target Tablet

All figures measured on the actual deployment device, an ATMPC IT-801B, using
`llama-bench` from a llama.cpp build cross-compiled for this CPU. No figure in this
document is estimated or copied from another device.

**Date:** 2026-09-18
**Model under test:** Qwen2.5-Math-1.5B-Instruct, 1.54 B parameters
**Test shape:** `pp128` is prompt processing of 128 tokens, `tg32` is generation of 32 tokens

## The device

| Property | Value |
|---|---|
| System on chip | Rockchip RK3562 |
| Cores | 4 × Cortex-A53 at 2.02 GHz |
| Architecture level | ARMv8.0-A |
| GPU | Mali-G52, warp size 8, 32 KB shared memory |
| RAM | 3.79 GB total, 2.47 GB available |
| Android | 15, API 35, arm64-v8a |

The decisive detail is the CPU feature line:

```
fp asimd evtstrm aes pmull sha1 sha2 crc32 cpuid
```

There is no `asimddp` (dot product), no `asimdhp` (fp16 arithmetic) and no `i8mm`
(int8 matrix multiply). Quantized inference in llama.cpp relies on those
extensions for its fast integer kernels. Without them every quantized matrix
multiply falls back to a scalar dequantize-then-multiply path.

This also means an initial build using `-march=armv8.2-a+dotprod+fp16` would have
produced binaries that crash with an illegal instruction on this device. The build
script now reads the CPU features from the device profile and selects
`-march=armv8-a` accordingly.

## Thread scaling

| Threads | pp128 tok/s | tg32 tok/s |
|---|---|---|
| 1 | 1.28 | 0.99 |
| 2 | 2.52 | 1.80 |
| 3 | 3.71 | 2.60 |
| 4 | 3.74 | 1.61 |

Scaling is close to linear up to three threads and then collapses for generation
at four. With all four cores claimed there is no core left for the kernel and the
sampling thread, so the generation loop is repeatedly descheduled. **Three threads
is the correct setting on this device** and is used for everything that follows.

A repeat run at four threads on a cooler device reached 4.87 and 3.37 tok/s, which
shows run-to-run variation of roughly 30% from thermal state alone. Any published
figure needs to report the number of repeats and the thermal condition.

## Quantization

All at three threads.

| Quantization | File size | pp128 tok/s | tg32 tok/s |
|---|---|---|---|
| Q4_K_M | 934 MiB | 3.71 | 2.60 |
| Q4_0 | 888 MiB | 3.82 | 2.74 |
| IQ4_XS | 848 MiB | 4.04 | 2.82 |

Changing quantization buys almost nothing, about 9% at best. The usual reason to
prefer Q4_0 on ARM is that llama.cpp repacks it into a layout that feeds the
dot-product instructions. This CPU has no such instructions, so the repacking has
nothing to accelerate. Quantization should therefore be chosen on accuracy and
file size, not speed.

## GPU offload via Vulkan

The tablet does ship a working Vulkan driver, `/vendor/lib64/hw/vulkan.rk3562.so`,
and a llama.cpp Vulkan build detects the GPU correctly:

```
ggml_vulkan: 0 = Mali-G52 (Mali-G52) | uma: 1 | fp16: 1 | bf16: 0 |
             warp size: 8 | shared memory: 32768 | int dot: 0 | matrix cores: none
```

| Backend | pp128 tok/s | tg32 tok/s |
|---|---|---|
| CPU, 3 threads | 3.82 | 2.74 |
| Vulkan, all layers offloaded | 0.64 | 0.81 |

**Vulkan is four to six times slower than the CPU on this device.** The Mali-G52
here has a warp size of 8, only 32 KB of shared memory, no integer dot product and
no matrix cores. It does not have the occupancy or the memory bandwidth to beat
even four Cortex-A53 cores. GPU offload is abandoned for this hardware, and the
Vulkan build script is kept only so the measurement can be reproduced.

## What this means for response time

The numbers above translate directly into what a student experiences. Time to
first token is governed by prompt processing, and the wait for a complete answer
by generation.

Taking 3.8 tok/s prompt and 2.7 tok/s generation:

| Prompt size | Time to first token | 150-token answer | 300-token answer |
|---|---|---|---|
| 200 tokens, question only | 53 s | 1 min 48 s | 2 min 44 s |
| 600 tokens, question plus two retrieved passages | 2 min 38 s | 3 min 33 s | 4 min 29 s |
| 1200 tokens, richer retrieval | 5 min 16 s | 6 min 11 s | 7 min 7 s |

The second row is the configuration the architecture document assumes, retrieval
before generation. At two and a half minutes before the first character appears,
that design is not usable for interactive tutoring on this tablet.

This is a finding about the hardware, not about the idea. It does mean the
architecture has to change, and the chosen option is reviewed content served instantly plus short bounded generation.

## Reproducing these numbers

```bash
bench/scripts/00_device_profile.sh              # records the CPU features
bench/scripts/01_build_llamacpp_android.sh      # picks -march from that profile
bench/scripts/02_push_to_device.sh              # stages binaries and models
python tools/run_bench.py --throughput-only     # the table above

bench/scripts/05_build_vulkan_android.sh        # optional, for the GPU comparison
```

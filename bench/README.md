# Feasibility Benchmark Kit

Answers the question the project depends on: can a language model that fits the
target tablet give correct S6 Advanced Mathematics help, fast enough to use?

Everything runs on the real device over adb. Nothing here uses an emulator or a
desktop measurement, because the whole point is the tablet's own numbers.

## Findings so far

- [results/device_profile.md](results/device_profile.md): the tablet's hardware.
- [results/THROUGHPUT_FINDINGS.md](results/THROUGHPUT_FINDINGS.md): tokens per second on CPU and GPU, and what that means for response time.
- `results/raw/<model>.jsonl`: every probe response, with timings and peak memory.
- `results/raw/<model>.graded.json`: deterministic grading of those responses.

## Layout

```
bench/
├── scripts/
│   ├── lib.sh                      shared paths and the device check
│   ├── 00_device_profile.sh        hardware profile → results/device_profile.{md,json}
│   ├── 01_build_llamacpp_android.sh cross-compile llama.cpp for the tablet's CPU
│   ├── 02_push_to_device.sh        stage binaries, models and probes on the tablet
│   ├── 03_run_full_sweep.sh        throughput + probes on every model, then grade
│   └── 05_build_vulkan_android.sh  optional GPU build, kept for reproducibility
├── models.json                     candidate models, by tier
├── models/                         downloaded .gguf files (gitignored)
├── eval/
│   └── s6_math_probe.jsonl         28 questions with deterministic checks
└── results/                        everything measured
```

The Python side lives in `tools/`:

| Script | Role |
|---|---|
| `fetch_models.py` | resolve and download GGUF files from the manifest |
| `run_bench.py` | drive `llama-bench` and `llama-cli` on the tablet |
| `grade.py` | symbolic and numeric grading of responses, with a self-test |

## Running it

```bash
# once
bench/scripts/00_device_profile.sh
bench/scripts/01_build_llamacpp_android.sh
./.venv/bin/python tools/fetch_models.py --tier A
bench/scripts/02_push_to_device.sh

# the sweep, in the background; watch results/sweep.log
nohup bench/scripts/03_run_full_sweep.sh > /dev/null 2>&1 &
```

Every script refuses to run without a visible, authorized tablet and prints the
exact steps to enable USB debugging if it is missing.

## Probe set

Twenty-four symbolic probes across the four pilot units, plus three scope-boundary
probes and one pedagogy probe. Each symbolic probe carries a check type:

| Check | How it decides |
|---|---|
| `antiderivative` | differentiates the answer and compares with the integrand |
| `ode_solution` | substitutes the answer into the equation, then checks any initial condition |
| `symbolic_equal` | simplifies the difference to zero |
| `root_set` | solves the equation and matches the set |
| `modulus_argument` | compares against the computed modulus and argument |
| `numeric` | absolute tolerance |

None of them compares strings. `tools/grade.py --self-test` grades every probe's
own reference answer and must pass before any result is trusted.

## Why the numbers look the way they do

The RK3562's Cortex-A53 cores lack the ARM dot-product extension, so llama.cpp
cannot use its fast integer kernels. That single fact explains the low throughput,
the lack of gain from changing quantization, and why the build script has to pick
`-march=armv8-a` from the device profile. See THROUGHPUT_FINDINGS.md.

# Offline-First Intelligent Tutoring Platform

## Project title

**Offline-First Intelligent Tutoring Platform: Enabling Resilient Academic Support**

**Repository:** [github.com/NzizaPacifique250/capstone_project](https://github.com/NzizaPacifique250/capstone_project)
**Student:** Nziza Aime Pacifique · **Target device:** ATMPC IT-801B Android tablet · **Pilot:** Rwanda REB Senior Six Advanced Mathematics

## Overview

This capstone project proposes an edge-computing tutoring platform that provides personalized, AI-driven academic support without requiring continuous internet connectivity. It is intended to support students in low-connectivity environments by running a language model locally on their device and storing essential curriculum resources and learning data offline.

The capstone will begin as a focused prototype for **one high-school grade and one subject**. After implementation and evaluation, the platform can be expanded to support additional grades and subjects through modular curriculum packages.

## Problem statement

Many AI tutoring systems depend on continuous internet access and cloud-hosted models. This limits their usefulness in communities with unreliable or expensive connectivity, creates recurring operational costs, and raises privacy concerns around student data.

This project investigates whether a resource-efficient language model running locally can provide useful, curriculum-aligned, and personalized academic assistance on modest hardware while remaining functional when the device is offline.

## Main objective

Design, implement, and evaluate an offline-first intelligent tutoring prototype that uses on-device language-model inference and locally stored curriculum resources to provide personalized academic support for students in one selected high-school grade and subject.

## Proposed research question

> To what extent can a resource-efficient, locally deployed language model provide reliable and personalized curriculum-grounded tutoring on devices operating with limited or no internet connectivity?

## Initial strategy

1. Build a prototype for one grade, one subject, selected topics, and one target device category.
2. Evaluate educational quality, offline reliability, performance, resource consumption, and usability.
3. Improve the prototype based on evaluation results.
4. Expand to other high-school grades and subjects using modular curriculum packages.

## Setting up the environment and the project

The repository has three parts: `tools/` and `bench/` (Python, run on the
laptop), `curriculum/` (the curriculum packages), and `app/` (the React
Native application for the tablet). Everything was developed on Linux; the
commands below assume a Linux or macOS shell.

### Prerequisites

| Component | Version used | Notes |
|---|---|---|
| Python | 3.10 or newer | for the grader, validator, extractor and model fetcher |
| Node.js | 22.11 or newer required by `app/package.json` | the project also runs on Node 20 (a known mismatch, tests pass) |
| JDK | 17 | `app/scripts/env.sh` expects it under `~/Android/jdk-17.0.20.1+1` |
| Android SDK | platform `android-37.0`, build-tools `37.0.0`, NDK `27.1.12297006`, CMake `3.22.1` | installed with `sdkmanager`; `env.sh` checks for them |
| adb | from the SDK platform-tools | the tablet must have USB debugging enabled |
| Target tablet | ATMPC IT-801B, Android 15, 4 GB RAM, arm64 | any arm64 Android device with about 2 GB free RAM should work; this one lacks the `dotprod`/`i8mm` CPU extensions, which is why speeds are what they are |
| Disk | about 6 GB free | model weights (935 MB), Android build output and `node_modules` |

### 1. Clone and install

```bash
git clone https://github.com/NzizaPacifique250/capstone_project.git
cd capstone_project

# Python tools
python3 -m venv .venv
.venv/bin/pip install -r tools/requirements.txt

# Application
cd app && npm install && cd ..
```

### 2. Check that the tools work

```bash
./.venv/bin/python tools/grade.py --self-test
./.venv/bin/python tools/validate_package.py curriculum/rw_s6_mathematics/packages/u1
cd app && npm test && npm run typecheck && cd ..
```

All three should end with `[ok]` lines and passing tests (142 Jest tests
at the time of writing).

### 3. Get the model onto the tablet

The model weights are not in the repository. `tools/fetch_models.py`
downloads the candidates listed in `bench/models.json` from Hugging Face
with resumable transfers; the provisional model is Qwen2.5-Math-1.5B-Instruct
Q4_K_M (935 MB).

```bash
./.venv/bin/python tools/fetch_models.py --id qwen25-math-1.5b
bench/scripts/02_push_to_device.sh          # stages models and probes on the tablet over adb
```

### 4. Build, install and run the application

```bash
. app/scripts/env.sh                        # toolchain paths and the memory-capped native build
app/scripts/run_debug.sh                    # validates and bundles the curriculum, builds the APK,
                                            # installs it, starts Metro and launches the app
app/scripts/stage_model.sh                  # copies the model into the app's private storage
```

The first native build takes about 15 minutes on an 8 GB laptop because
the build is deliberately capped at three compilers; later builds take
under a minute. The APK bundles its JavaScript, so once installed the app
runs with the cable removed and the network off; with Metro running it
reloads edits live instead.

### 5. Reproduce the benchmark (optional)

`bench/README.md` describes the device profile, the llama.cpp cross-build,
the throughput run and the 28-probe sweep.

### 6. Curriculum source books (optional)

The REB Senior Six Advanced Mathematics Student's Book and Teacher's Guide
are not included in this repository because their copyright notices reserve
all rights. They are only needed to re-run `tools/extract_corpus.py`.
Download them from the REB e-learning portal and place them in
`curriculum/rw_s6_mathematics/sources/` as
`S6_Advanced_Math_StudentBook.pdf` and `S6_Advanced_Math_TeacherGuide.pdf`.

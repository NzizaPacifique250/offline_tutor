# System Architecture

**Revised 21 September 2026.** This replaces the retrieve-then-generate design the
proposal assumed. The reasons are measured, not argued:
[FEASIBILITY_FINDINGS.md](FEASIBILITY_FINDINGS.md) for the model results and
[RELEASE_V1.md](RELEASE_V1.md) for the measurements in the finished app.

## Architectural goal

The essential tutoring path stays on the student's device. Connectivity may
improve the system through updates and synchronization, but it is never required
for a lesson, an exercise, a hint, or an answer check.

## What changed, and why

Three measurements on the ATMPC IT-801B forced the revision.

| Measurement | Value | Consequence |
|---|---|---|
| Generation speed inside the app | 2.26 tokens/s, 3.54 tokens/s prompt | A 600-token grounded prompt waits 2.5 minutes before the first character. Generation cannot sit on the main path. |
| Mathematics accuracy, Qwen2.5-Math-1.5B | 23 of 24 probes | The model is good enough to be worth keeping, as an addition rather than the core. |
| Behaviour probes, all four models | 0 of 4 | No model refused an out-of-scope question or gave a hint before an answer. Scope and pedagogy cannot be delegated to the prompt. |

The design therefore has two layers. **Reviewed content is the primary path and
is instant.** Generation is additive, bounded, cancellable, and clearly
labelled. Scope control and hint-first behaviour are enforced by the application
before the model is ever called.

## High-level architecture

```text
Student interface  (React Native 0.87, Hermes, New Architecture)
        |
Tutoring controller
 ├── Topic router             maps a request to a package topic, or declines it
 ├── Content service          lessons, examples, exercises, hints, solutions
 ├── Answer checker           reviewed keys; deterministic where the type allows
 ├── Guidance service         bounded generation through llama.rn (additive)
 ├── Learner-profile manager
 └── Progress engine
        |
Local storage
 ├── SQLite                   content package + learner data
 ├── GGUF model file          Qwen2.5-Math-1.5B-Instruct Q4_K_M, 935 MiB
 └── KaTeX assets             equation rendering, no network
        |
Optional synchronization service   (later; never on the core path)
```

## Layer 1: reviewed content

Everything a student normally touches comes from a **curriculum package**
prepared offline from the REB Student's Book and Teacher's Guide, checked
against the source, and loaded into SQLite on first launch with a
`content_version`.

- Lessons, worked examples, exercises, **ordered hints**, accepted answers and
  worked solutions, each with a stable ID, a REB page reference, and a review
  status (`developer-test` until a teacher has signed it off).
- Retrieval is a **keyed lookup** by topic and exercise ID. There is no vector
  index in the pilot; embeddings are added only if measured lookup failures
  justify their cost.
- Mathematics is written in TeX and rendered by KaTeX from bundled assets.
  Proven offline in P2: 4 of 4 formulas with airplane mode on.
- Target: any reviewed-content action completes within 2 seconds.

This layer alone supports the full study flow: choose a topic, read a lesson,
attempt an exercise, request hints in order, see the solution, review progress.

## Layer 2: bounded generation

The model answers what the reviewed content does not cover: a free question on
an in-scope topic, or further guidance after the stored hints are exhausted.

| Constraint | Setting | Reason |
|---|---|---|
| Model and runtime | Qwen2.5-Math-1.5B-Instruct Q4_K_M via `llama.rn`, 3 threads, CPU only, mmap | Measured optimum; GPU offload is 4–6× slower on this device |
| Prompt size | About 200 tokens: a short, **stable** system prompt, one short reviewed passage, the question | Prompt processing costs 3.5 tokens/s. A stable prefix hits llama.cpp's prompt cache: first token fell from 22.5 s to 0.6 s in P2 |
| Output cap | About 80 tokens initially | Measured: enough for a hint, not a worked answer. The final budget is a P5 decision |
| Concurrency | One request at a time, visible progress, cancel, timeout | Cancellation proven in P2 |
| Labelling | Shown as *generated guidance*, stored separately, never presented as a reviewed solution, never used to grade | Correct final answers do not validate generated reasoning |

## Control flow

1. The student selects a topic or exercise, or types a question.
2. The **topic router** matches the request against the package's topics. No
   match means a "not covered in this course" response. **The model is not
   called.** This is how questions outside the subject, or outside the pilot
   units, are handled: structurally, not by prompt instruction.
3. An in-scope request goes to the **content service**, which returns the
   lesson, example or exercise. Hints are served in their stored order.
   **Hint-first is a property of the content, not of the model.**
4. An answer to an exercise goes to the **answer checker**, which compares it
   with reviewed accepted forms or a numeric tolerance. Where free-form algebra
   cannot be checked on the device, the application says so rather than
   guessing a grade.
5. Only after stored hints are exhausted, or for a free question on a matched
   topic, does the **guidance service** run bounded generation with the matched
   passage in the prompt.
6. Every step is recorded: attempts, hints used, and generated, stored,
   declined, cancelled and timed-out outcomes, each distinct.

## Learner-profile manager and progress engine

Unchanged in intent. The profile stores explainable data: grade and subject,
topics attempted, correct and incorrect responses, hints requested, a simple
mastery indicator per topic, and the recommended next exercise. Personalization
selects activities and hint depth from this record; it does not train a model
per student. Progress is computed from saved attempts in SQLite, which P2 showed
survive restarts.

## Implementation decisions, now fixed

| Concern | Decision | Evidence |
|---|---|---|
| Interface | React Native 0.87.1, Hermes, New Architecture | Builds and runs on the tablet |
| Inference | `llama.rn` 0.12.9 over llama.cpp, prebuilt `armv8-a` variant selected at runtime | `native lib: rnllama_jni_v8` confirmed on device |
| Model | Qwen2.5-Math-1.5B-Instruct, Q4_K_M | 23/24 probes; 0 truncations; 1,064 MB peak |
| Storage | SQLite via `@op-engineering/op-sqlite` | Record persisted across `force-stop` |
| Mathematics rendering | KaTeX 0.18.7 in a WebView from bundled assets | 4/4 formulas offline |
| Retrieval | Keyed lookup by topic and ID | No vector index in the pilot |
| Distribution | Installable Android APK, arm64-v8a | 122 MB debug build; release build is P6 |
| Device | ATMPC IT-801B, Rockchip RK3562 | All figures measured on it |

## Reliability and safety controls

- No cloud calls in the core path.
- Scope gate before generation: the topic router declines what the package does
  not cover, so refusal does not depend on the model.
- Hint-first enforced by stored hint order.
- Generated text labelled, quarantined from grading, and never counted as a
  reviewed answer.
- Generation is single-flight, bounded, cancellable and times out.
- A REB page reference on every reviewed item.
- Every reviewed answer key is validated computationally when the package is
  built; deterministic checking on the device where the answer type allows it.
- Recovery after restart, proven for stored records.
- Memory budget: application under 2 GB PSS on a 4 GB device (measured 1.26 GB
  with the model loaded).

## What this document does not decide

- The generation budget in tokens and seconds: P5, from measurements.
- Synchronization scope and the server side.
- Whether embeddings are ever needed. They are not needed to start.

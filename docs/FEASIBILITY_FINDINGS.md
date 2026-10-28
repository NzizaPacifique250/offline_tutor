# Feasibility Findings

**Date:** 21 September 2026
**Phase:** P1 of the prototype development plan
**Status:** provisional model decision recorded; architecture revision proposed

This document closes the question the benchmark was built to answer: can a
language model small enough to run on the target tablet give correct Senior Six
Advanced Mathematics help, and fast enough to be usable?

The short answer is that **accuracy is not the binding constraint. Speed is.**

---

## 1. Summary of decisions

| Question | Decision |
|---|---|
| Is on-device mathematics accuracy sufficient? | Yes, for one model. Qwen2.5-Math-1.5B-Instruct answered 23 of 24 mathematics probes correctly. |
| Provisional model | **Qwen2.5-Math-1.5B-Instruct, Q4_K_M**, 934 MiB, 3 threads, CPU only |
| Is live retrieve-then-generate viable? | **No.** At 2.2 tokens per second a grounded answer takes minutes. |
| Replacement architecture | Reviewed curriculum content served instantly from SQLite, with short bounded generation as an additive layer |
| Can the model be trusted to refuse or to hint first? | **No.** All four models scored 0 of 4 on the behaviour probes. This must be enforced by the application. |

---

## 2. The audit changed the results

The plan required auditing the recorded responses before selecting a model, and
warned against treating the largest pass count as the winner. That warning was
justified: the audit reversed the ranking.

| Model | Originally reported | Mathematics after audit | Behaviour |
|---|---|---|---|
| Qwen2.5-Math 1.5B | 4 / 28 | **23 / 24** | 0 / 4 |
| Qwen2.5 1.5B | 2 / 28 | 14 / 24 | 0 / 4 |
| Qwen3 1.7B | 0 / 28 | 8 / 24 | 0 / 4 |
| Llama 3.2 1B | 6 / 28 | 4 / 24 | 0 / 4 |

**No model was re-run.** The response files in `bench/results/raw/*.jsonl` are
unchanged. Only the grading of those same responses changed. The original
grading output is preserved unmodified in
[`bench/results/raw/original_2026-09-18/`](../bench/results/raw/original_2026-09-18/).

The two figures are also now separated. The original 28 mixed 24 mathematics
probes with 4 behaviour probes, so a single percentage described two different
things. They are reported apart from here on.

### Why the original numbers were wrong

Every defect was in answer extraction or normalisation, not in the checks
themselves. Three were **silent**: they produced a wrong expression rather than
an error, so a correct answer was confidently marked wrong.

| # | Defect | Effect | Example |
|---|---|---|---|
| 1 | Braces stripped before `^` was converted to `**` | `e^{3x}` parsed as `(e**3)*x` | `2e^{3x}` scored wrong for `dy/dx = 3y, y(0) = 2` |
| 2 | LaTeX commands substituted without a separator | `i\sin` became the identifier `isin`, split into `i*s*i*n` | correct polar form scored wrong |
| 3 | `\ln` and `Abs(` glued into `logAbs` | parsed as a product of seven letters | correct `ln\|x²+3x+2\|` scored wrong |
| 4 | Concluding-cue regex captured only to end of line | captured `the final answer is:` while the answer sat in the display block on the next line | most `could not parse` failures |
| 5 | Cue matched the *first* `therefore`, not the last | captured mid-working reasoning | — |
| 6 | `\boxed{}` required the closing brace be followed by `$`, `\)` or end of string | a box followed by `\]` or a newline was missed | — |
| 7 | Absolute-value bars never converted to `Abs()` | unparseable | — |
| 8 | Unicode `²`, `³`, `π`, `≈`, `−` not folded | unparseable | — |
| 9 | Markdown bold `**0.2048**` unparseable | — | — |
| 10 | Prose root sets (`2 + 3i and -2 - 3i`) not split | unparseable | — |
| 11 | Subscripted constants `C_1`, `C_2` not declared arbitrary | — | — |
| 12 | Equation splitting ignored brackets | `P(X = 2) = 0.2240` split at the wrong `=` | — |

### Two defects made the grader too lenient

Correcting these **lowered** Llama 3.2 1B from 6 to 4, which is the clearest
evidence that the corrections were not tuned to raise scores.

- **The trivial solution passed.** `y = 0` satisfies every homogeneous linear
  equation, and substituting back is not on its own sufficient. The checker now
  rejects an answer that does not depend on the independent variable.
- **A particular solution passed where the general solution was asked for.**
  Where the expected answer carries arbitrary constants and the probe sets no
  initial condition, the checker now requires at least one arbitrary constant.

### Why the self-test did not catch any of this

The self-test graded each probe against its own `expected` value. Those values
are already clean SymPy syntax, so the LaTeX, unicode and markdown paths were
never exercised. It passed while the extractor was mangling correct answers.

It now also grades **17 regression cases**: twelve correct answers written the
way the models actually wrote them, which must be accepted, and five wrong or
insufficient answers, which must be rejected.

### Verification that the grader is not simply permissive

Every response was cross-graded against the *other* probes of the same check
type, where it should fail. **448 wrong pairings, 0 accepted.**

---

## 3. Provisional model decision

**Qwen2.5-Math-1.5B-Instruct, Q4_K_M quantization, 3 threads, CPU only.**

| Model | Mathematics | Median time per answer | Peak RSS | Truncated | Empty |
|---|---|---|---|---|---|
| **Qwen2.5-Math 1.5B** | **23 / 24** | 4 min 41 s | 1,064 MB | **0 / 28** | **0 / 28** |
| Qwen2.5 1.5B | 14 / 24 | 4 min 04 s | 1,064 MB | 2 / 28 | 0 / 28 |
| Qwen3 1.7B | 8 / 24 | 7 min 52 s | 1,467 MB | 20 / 28 | 10 / 28 |
| Llama 3.2 1B | 4 / 24 | 2 min 29 s | 910 MB | 6 / 28 | 0 / 28 |

It wins on accuracy by a wide margin and is the only model that completed every
probe without truncating or returning nothing. Qwen3 1.7B is rejected outright:
it failed to finish 20 of 28 responses, returned nothing at all 10 times, and its
1,467 MB peak sits above the practical budget for a 3.79 GB device.

Llama 3.2 1B is the fastest by a factor of two, and that matters given the speed
problem below. It is kept as a fallback **only** if the guidance layer is reduced
to short hints where 4 of 24 correctness is tolerable because no answer is
asserted. On present evidence it is not usable for answers.

### Limitations of this decision, stated explicitly

1. **The probe set is small.** 24 mathematics items across four units. 23 of 24
   is a strong signal, not a precise accuracy estimate.
2. **The questions were written for this project, not taken from the book or
   past papers.** They follow the syllabus topics and are tagged to the teaching
   section, but they are not authentic REB examination items. This avoids
   testing memorisation of published questions, and it means representativeness
   is not yet established. The evaluation must add a held-out set drawn from the
   book's end-of-unit assessments and past national papers.
3. **One failure is a truncation, not a mathematics error.** `in-02` was cut off
   mid-answer at `\boxed{\frac{1}{2} \`. The underlying mathematics may well be
   correct; the generation limit ended it.
4. **`ode_solution` verifies that an answer solves the equation**, and now that
   it is non-trivial and general where required. It does not check that the
   general solution has the full expected number of independent constants.
5. **Nothing here was measured through the Android application.** These are
   command-line measurements over adb. P2 must prove the model loads and runs
   inside the app before any of this is relied upon.

---

## 4. Speed is the binding constraint

From [THROUGHPUT_FINDINGS.md](../bench/results/THROUGHPUT_FINDINGS.md), measured
on the ATMPC IT-801B: roughly 3.8 tokens per second prompt processing and 2.7
generation on the throughput benchmark, and 2.2 generation across the full probe
sweep.

| Prompt size | Time to first token | 150-token answer |
|---|---|---|
| 200 tokens, question only | 53 s | 1 min 48 s |
| 600 tokens, question plus two retrieved passages | 2 min 38 s | 3 min 33 s |
| 1200 tokens, richer retrieval | 5 min 16 s | 6 min 11 s |

The second row is the configuration [ARCHITECTURE.md](ARCHITECTURE.md) assumes.
Two and a half minutes before the first character appears is not interactive
tutoring.

GPU offload does not help: Vulkan on the Mali-G52 measured four to six times
slower than the CPU and is abandoned. Quantization does not help either, varying
by at most 9% across Q4_K_M, Q4_0 and IQ4_XS.

**This is a finding about the hardware, not about the model.** The model is
accurate enough. It cannot produce a long grounded answer quickly on four
Cortex-A53 cores that lack dot-product, fp16 and int8 matrix-multiply
extensions.

---

## 5. Proposed architecture revision

Replace live retrieve-then-generate with a two-layer design.

**Layer 1, reviewed content, always instant.** Lessons, worked examples,
exercises, ordered hints, accepted answers and worked solutions are prepared
offline from the REB books, checked against the source, and stored in SQLite.
Retrieval is a keyed lookup by topic and exercise ID, not a vector search, so a
student's normal path through the app never waits for the model. This layer
alone supports the full study flow in P4.

**Layer 2, bounded generation, additive.** The model answers a free question the
reviewed content does not cover. Constraints that follow directly from the
measurements:

- Prompt kept near 200 tokens: the question plus one short retrieved passage,
  not two or three.
- Output capped at roughly 80 tokens, hint-first rather than a full solution.
- One request at a time, with a visible loading state, a cancel control and a
  timeout.
- Generated guidance is labelled and stored separately from reviewed solutions,
  and is never counted as a reviewed answer.

Even so, expect roughly 50 to 60 seconds for an 80-token hint after a 200-token
prompt. **The proposal's 30-second 95th-percentile target will not be met on this
device.** That should be renegotiated with the supervisor rather than quietly
dropped.

### Refusal and hint-first must live in the application

All four models scored 0 of 4 on the behaviour probes. Every one answered the
conics question that is outside the pilot, answered "what is the capital city of
France", explained photosynthesis, and gave a bare final answer when told not to
explain.

No prompt wording will be trusted to fix this. Scope is enforced by the topic
lookup: a question that does not map to an in-scope topic is declined by the
application before the model is called. Hint-first is enforced by the hint
sequence being stored content, with generation offered only after the stored
hints are exhausted.

---

## 6. Documents this contradicts

| Document | Conflict | Action |
|---|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Assumes retrieve-then-generate on every question, with embeddings | Rewrite around the two-layer design; keep embeddings out of the pilot unless measured lookup failures justify them |
| Project scope | Implies generated explanations are the primary support | Reviewed content is primary; generation is additive |
| Evaluation plan | 30 s at the 95th percentile for short answers | Not achievable; propose a revised target and measure it in the app |
| Assignment 1 proposal §3.4 | Same pipeline assumption | Record the revision and the measurements that forced it |
| [README.md](../README.md) | States the answer-quality sweep is unfinished | Update: the sweep is complete and audited |

---

## 7. What this means for the research question

The question asks to what extent a resource-efficient, locally deployed model can
provide reliable and personalised curriculum-grounded tutoring on a device with
limited connectivity.

The honest current answer, on this hardware:

- **Reliability of the mathematics: better than expected.** A 1.5 B mathematics-
  specialised model answered 23 of 24 S6 probes correctly, offline, on a
  three-year-old budget tablet.
- **Reliability of the behaviour: poor.** No model stayed inside its subject or
  followed a hint-first instruction. Pedagogical control must be structural.
- **Interactivity: not achievable in the generate-everything form.** Useful
  offline tutoring on this device means mostly-prepared content with a small
  generative layer, not a conversational tutor.

That is a defensible and interesting finding. It should be presented as a result,
not as a shortfall.

---

## 8. Reproducing this

```bash
./.venv/bin/python tools/grade.py --self-test          # 24 probes + 17 regression cases
./.venv/bin/python tools/grade.py --responses bench/results/raw/qwen25-math-1.5b.jsonl
```

The corrected grader is [tools/grade.py](../tools/grade.py). The preserved
pre-audit output is in
[`bench/results/raw/original_2026-09-18/`](../bench/results/raw/original_2026-09-18/).

## 9. Next actions

- [x] Audit the four model result files and resolve grading defects
- [x] Record the feasibility findings and provisional model choice
- [x] Update the architecture, project scope and evaluation plan — done 22 September
- [ ] Agree the revised response-time target with the supervisor
- [x] P2: scaffold the app and prove the model loads on the tablet — done
- [ ] P3: select the first Complex Numbers objective and five exercises

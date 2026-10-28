# Offline reliability test: protocol

Written on 28 October 2026, before the run. It turns the offline test of
the proposal (§3.7.1, objective 3) into steps a script can repeat:
`app/scripts/offline_test.py` carries them out and the results are in
[README.md](README.md) beside this file.

## What is tested

| | |
|---|---|
| Build | OfflineTutor 1.2.1, pilot release `rw.offlinetutor.pilot`, built from this repository |
| Model | Qwen2.5-Math-1.5B-Instruct Q4_K_M, SHA-256 `9614a50f…e37e8e`, installed from Teacher tools |
| Tablet | ATMPC IT-801B, Android 15, 4 GB RAM; on USB power, screen kept on, no other app in the foreground |
| Network | The pilot build has no internet permission. Wi-Fi network "He is God" is used where a condition needs a connection |

## Six tasks

The proposal lists six tasks. Each attempt below is timed on the tablet's
own clock: from the device time just before the tap that starts the task
to the logcat timestamp of the app line that marks the result. That span
includes Android's input tool (about 0.1 s), which is recorded separately.

| Task | What the script does | Expected result | Saved record | Limit |
|---|---|---|---|---|
| T1 Open a topic | Taps the lesson on the topic list | The lesson opens and every formula is typeset (`[lesson] KaTeX …: rendered n of n formulas`) | — | 2 s (stored content) |
| T2 Generated explanation | Types an in-scope question in the lesson's question box and taps "Ask the tutor" | The first step of a generated answer is shown complete (`[guidance] render:` after a `generated` outcome); the time to the first token is recorded | One `guidance_events` row per generated part | 120 s |
| T3 Stored hint | On the exercise, taps "Show hint 1 of 3" | The hint text is on screen | A reveal row (`[practice] reveal #id hint 1`) | 2 s (stored content) |
| T4 Exercise with feedback | Types the correct answer and taps "Check answer" | The tablet marks it correct and says so | An attempt row (`[practice] attempt #id … -> correct`) | 2 s (stored content) |
| T5 Next-exercise recommendation | Opens "My progress" | Progress is computed from the saved attempts and recommends the first exercise of that lesson not yet answered correctly | — | 2 s (stored content) |
| T6 Save and reopen progress | Force-stops the app, starts it, continues as the same learner and opens "My progress" | The app is ready (`[boot] ready`) and progress shows every attempt made so far by this learner | The attempts made before the restart | 10 s (startup and reopening), app start to ready |

A task fails if the expected result does not appear, appears after its
limit, a required record is missing, the app crashes, or the answer comes
from somewhere it should not: a stored hint or a refusal returned when a
generated explanation was asked for counts as a failed T2.

## Three conditions

| Condition | Learner code | How the network is handled |
|---|---|---|
| A. Start without a network | `OT-A` | Airplane mode on before the app starts; it stays on |
| B. Lose the connection during use | `OT-B` | Before each task, airplane mode off and Wi-Fi connected; airplane mode on immediately after the task's tap, so the connection drops while the task runs |
| C. Restart offline | `OT-C` | Airplane mode on; every case begins by force-stopping and restarting the app |

Each condition starts with a new learner code, so its progress is
predictable. The conditions run in the order A, B, C.

## Ten cases

The same ten cases run in each condition. A case is one pass through the
six tasks in the order a learner would use them: open the lesson, ask a
question, open the recommended exercise, take a hint, answer, check
progress, then restart and check that progress was kept.

| Case | Unit | Question asked (T2) | Exercise (T3, T4) | Answer typed (T4) | Expected recommendation (T5) |
|---|---|---|---|---|---|
| 1 | 1 Complex Numbers | How do I add two complex numbers? | Application activity 1.7, question 3 | `5+3i` | Application activity 1.7, question 7 |
| 2 | 4 Integration | How do I evaluate a definite integral? | Application activity 4.19, question 1 | `4.5` | Application activity 4.19, question 3 |
| 3 | 5 Differential Equations | How do I separate the variables in a differential equation? | Activity 5.5 | `x^2/2+4x-6` | Application activity 5.5, question 2 |
| 4 | 9 Random Variables | How do I find the expected value of a random variable? | Application activity 3.15 (Unit 9), question 1a | `1.9` | Application activity 3.15 (Unit 9), question 1c |
| 5 | 1 Complex Numbers | How do I multiply two complex numbers? | Application activity 1.7, question 7 | `-9-15i` | Application activity 1.8, question 7 |
| 6 | 4 Integration | What are the limits of integration in a definite integral? | Application activity 4.19, question 3 | `-2` | Application activity 4.19, question 4 |
| 7 | 5 Differential Equations | How do I find a particular solution from an initial condition? | Application activity 5.5, question 2 | `(1+x)/(1-x)` | Application activity 5.5, question 3 |
| 8 | 9 Random Variables | How do I calculate the variance of a discrete random variable? | Application activity 3.15 (Unit 9), question 1c | `0.4` | Application activity 3.15 (Unit 9), question 2a |
| 9 | 1 Complex Numbers | What is the conjugate of a complex number? | Application activity 1.8, question 7 | `3+5i` | Application activity 1.9, question 3 |
| 10 | 4 Integration | How do I integrate a function term by term between two limits? | Application activity 4.19, question 4 | `0.75` | Application activity 4.19, question 7 |

Answers are spelled in ASCII because Android's input tool types nothing
else; the tablet's checker accepts these spellings. The exercise of each
case is opened from the lesson's "Practise: …" button, which shows the
recommended exercise.

## Pass mark

Offline completion is the number of passed attempts out of 180. The target
is at least 171 (95%). Results are reported for every task and condition.
Correctness of the generated text is not judged here; it belongs to the
answer-quality evaluation (§3.7.2).

## Recorded alongside

For every case: CPU temperature (`dumpsys hardware_properties`), battery
level and power source, and the case's start time; the order of the
conditions; the app's process id, to detect a crash. After the run, the
records are exported from Teacher tools and kept with the results.

## Not counted

One dry-run case with the code `OT-DRY` checks the script before the run.
It is reported but not counted.

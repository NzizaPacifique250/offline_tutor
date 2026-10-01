/**
 * The bounded-generation budget (ARCHITECTURE.md, Layer 2), as constants with
 * the measurement behind each one. Every number here was set from the tablet
 * figures in docs/P2_TABLET_BRIDGE.md and is revised only from a new
 * measurement, recorded in docs/P5_GUIDANCE.md.
 */

// Where scripts/stage_model.sh places the provisional model. Kept in sync with
// MODEL_FILE in scripts/env.sh.
export const APP_ID = 'rw.offlinetutor';
export const MODEL_FILE = 'qwen25-math-1.5b-Qwen2.5-Math-1.5B-Instruct-Q4_K_M.gguf';
export const DEFAULT_MODEL_PATH = `/data/data/${APP_ID}/files/models/${MODEL_FILE}`;

// bench/results/THROUGHPUT_FINDINGS.md: three threads is the optimum on the
// four Cortex-A53 cores, and the GPU is slower than the CPU.
export const N_THREADS = 3;
export const N_GPU_LAYERS = 0;
export const N_CTX = 1024;

// docs/FEASIBILITY_FINDINGS.md §5: about 80 tokens is enough for a hint and
// not for a worked answer; measured at 36 s warm and 58 s cold in P2.
export const N_PREDICT = 80;

// Prompt processing runs at about 3.5 tokens per second, so every token in the
// passage costs about 0.3 s before the first character appears. 320
// characters is roughly 90 tokens: about 25 s cold on top of the cached
// system prompt. Revised from measurement in docs/P5_GUIDANCE.md.
export const PASSAGE_MAX_CHARS = 320;

// The evaluation plan's proposed bound is an 80-token hint within 90 s at the
// 95th percentile; the timeout sits above it so a slow but finishing request
// is not cut off, while a stuck one is.
export const TIMEOUT_MS = 120_000;

// Guidance is paced one step at a time: each step is at most N_PREDICT
// tokens from the cached context, and the learner asks for the next. Six
// steps bound a request at about 480 tokens, under four minutes of
// generation spread across the learner's own pace.
export const MAX_STEPS = 6;

// A step with a display formula runs past 80 tokens, so a step is generated
// in chunks of N_PREDICT until the next step's heading arrives, at most this
// many chunks (about 240 tokens, under two minutes) before it is shown as is.
export const MAX_CHUNKS_PER_STEP = 3;

export const TEMPERATURE = 0.2;
export const STOP_WORDS = ['<|im_end|>', '<|endoftext|>', '</s>'];

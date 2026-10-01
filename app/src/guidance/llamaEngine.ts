/**
 * The llama.rn implementation of the guidance service's Engine: the same
 * settings the P2 bridge proved on the tablet (three threads, CPU only,
 * mmap), wrapped so the service sees tokens, timings and an interrupt flag
 * and nothing else. Result fields the runtime may not report are optional.
 */

import { initLlama, type LlamaContext } from 'llama.rn';
import { N_CTX, N_GPU_LAYERS, N_THREADS } from './config';
import type { ChatMessage } from './prompt';
import type { CompleteOptions, Engine, EngineLoader, EngineResult } from './service';

type Timings = {
  prompt_n?: number;
  prompt_ms?: number;
  predicted_n?: number;
  predicted_ms?: number;
  cache_n?: number;
};

type RawResult = {
  text?: string;
  content?: string;
  timings?: Timings;
  tokens_cached?: number;
  interrupted?: boolean;
  stopped_limit?: number | boolean;
  stopped_word?: number | boolean;
};

/**
 * llama.rn reports the size of the KV cache after the request, as
 * `tokens_cached` and again as `timings.cache_n`: the whole prompt plus what
 * was generated. The tokens actually reused from the previous prompt are
 * that size minus the tokens processed this time. Measured on the tablet:
 * 258 cached, 109 processed, 79 generated means 70 reused (the stable
 * system prompt); 259, 111 and 79 after a warm-up means 69.
 */
export function toEngineResult(raw: RawResult, streamed: string): EngineResult {
  const t = raw.timings ?? {};
  const promptN = t.prompt_n ?? 0;
  const predictedN = t.predicted_n ?? 0;
  const size = raw.tokens_cached ?? t.cache_n;
  const reused = size !== undefined ? Math.max(0, size - promptN - predictedN) : null;
  return {
    text: raw.text ?? raw.content ?? streamed,
    promptTokens: promptN,
    generatedTokens: predictedN,
    promptMs: t.prompt_ms ?? 0,
    generatedMs: t.predicted_ms ?? 0,
    cachedTokens: reused,
    interrupted: raw.interrupted ?? false,
    stoppedByLimit: Boolean(raw.stopped_limit),
    stoppedByWord: Boolean(raw.stopped_word),
  };
}

export function describeContext(ctx: LlamaContext): string {
  const lib = ctx.androidLib ?? 'unknown';
  const sys = (ctx.systemInfo ?? '').slice(0, 120);
  return `native lib ${lib}; gpu=${ctx.gpu}${ctx.reasonNoGPU ? ` (${ctx.reasonNoGPU})` : ''}; ${sys}`;
}

export const loadLlamaEngine: EngineLoader = async (modelPath: string): Promise<Engine> => {
  const ctx = await initLlama({
    model: modelPath,
    n_threads: N_THREADS,
    n_ctx: N_CTX,
    n_gpu_layers: N_GPU_LAYERS,
    use_mmap: true,
    use_mlock: false,
  });
  return {
    describe: () => describeContext(ctx),
    async complete(messages: ChatMessage[], opts: CompleteOptions, onToken: (token: string) => void): Promise<EngineResult> {
      let streamed = '';
      const cb = (data: { token: string }) => {
        streamed += data.token;
        onToken(data.token);
      };
      const base = { n_predict: opts.nPredict, stop: opts.stop, temperature: opts.temperature };
      let raw: RawResult;
      if (opts.prefill) {
        // Resume the assistant turn: the chat rendered exactly as before, up
        // to and including the assistant header, followed by the text the
        // model already produced. llama.cpp finds all of it in the KV cache.
        const formatted = (await ctx.getFormattedChat(messages)) as { prompt?: string };
        raw = (await ctx.completion({ ...base, prompt: `${formatted.prompt ?? ''}${opts.prefill}` }, cb)) as unknown as RawResult;
      } else {
        raw = (await ctx.completion({ ...base, messages }, cb)) as unknown as RawResult;
      }
      return toEngineResult(raw, streamed);
    },
    stop: () => ctx.stopCompletion(),
    release: () => ctx.release(),
  };
};

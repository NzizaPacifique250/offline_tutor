/**
 * The guidance service: bounded generation with the controls the
 * architecture fixes (ARCHITECTURE.md, Layer 2): one request at a time,
 * a visible loading state, cancellation, a timeout, and an outcome that is
 * always one of a fixed set. The model sits behind the Engine interface so
 * the service is unit-tested with a fake; llamaEngine.ts is the llama.rn
 * implementation.
 *
 * Loading is lazy: the model is opened on the first request and kept for
 * the session. A missing or unloadable model is the 'no-model' outcome,
 * and the stored content keeps working without it.
 *
 * Warm-ups process a prompt the learner is likely to send next, so its
 * tokens are in the cache before they ask. A warm-up never makes the
 * service busy: a request that arrives during one waits for it and then
 * reuses what it processed, which is the same work the request would have
 * done itself. Only the newest warm-up asked for while one runs is kept.
 */

import { N_PREDICT, STOP_WORDS, TEMPERATURE, TIMEOUT_MS } from './config';
import type { GuidanceOutcome } from './log';
import type { ChatMessage } from './prompt';

export type ChatMessageLike = ChatMessage;

export type EngineResult = {
  text: string;
  promptTokens: number;
  generatedTokens: number;
  promptMs: number;
  generatedMs: number;
  /** Tokens served from the prompt cache, when the runtime reports it. */
  cachedTokens: number | null;
  interrupted: boolean;
  stoppedByLimit: boolean;
  /** Ended at one of the stop strings (a step heading), not at the cap. */
  stoppedByWord: boolean;
};

export type CompleteOptions = {
  nPredict: number;
  stop: string[];
  temperature: number;
  /** Text the assistant turn already contains; generation resumes after it. */
  prefill?: string;
};

export type Engine = {
  complete(messages: ChatMessage[], opts: CompleteOptions, onToken: (token: string) => void): Promise<EngineResult>;
  stop(): Promise<void>;
  release(): Promise<void>;
  /** A line for the log: native library, system info. */
  describe(): string;
};

export type EngineLoader = (modelPath: string) => Promise<Engine>;

export type ServiceState = 'idle' | 'loading' | 'ready' | 'busy' | 'no-model';

export type GuidanceResult = {
  outcome: Extract<GuidanceOutcome, 'generated' | 'cancelled' | 'timed-out' | 'failed' | 'no-model'>;
  text: string;
  firstTokenMs: number | null;
  totalMs: number;
  promptTokens: number | null;
  generatedTokens: number | null;
  cachedTokens: number | null;
  promptMs: number;
  generatedMs: number;
  /** True when the output cap ended the text, so a continuation makes sense. */
  stoppedByLimit: boolean;
  /** True when a stop string (the next step's heading) ended the text. */
  stoppedByWord: boolean;
  /** Plain words for the screen when the outcome is not 'generated'. */
  message: string;
  /** Time spent waiting for a warm-up in progress, included in firstTokenMs and totalMs. */
  warmWaitMs: number;
};

export type WarmUpResult = { ok: boolean; ms: number; promptTokens: number | null; reason?: string };

export type ServiceOptions = {
  modelPath: string;
  timeoutMs?: number;
  nPredict?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export class BusyError extends Error {
  constructor() {
    super('another guidance request is running');
    this.name = 'BusyError';
  }
}

export class GuidanceService {
  private engine: Engine | null = null;
  private state_: ServiceState = 'idle';
  private loadError: string | null = null;
  private loading: Promise<boolean> | null = null;
  private cancelRequested = false;
  private warming: Promise<WarmUpResult> | null = null;
  private pendingWarmKey: string | null = null;
  /** The warm-up prompt whose tokens head the cache, until a request replaces them. */
  private cachedKey: string | null = null;
  private readonly listeners = new Set<(s: ServiceState) => void>();
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  readonly timeoutMs: number;
  readonly nPredict: number;

  constructor(private readonly loader: EngineLoader, private readonly opts: ServiceOptions) {
    this.now = opts.now ?? Date.now;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? (h => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
    this.nPredict = opts.nPredict ?? N_PREDICT;
  }

  get state(): ServiceState {
    return this.state_;
  }

  get modelPath(): string {
    return this.opts.modelPath;
  }

  /** Why the model is unavailable, once a load has failed. */
  get unavailableReason(): string | null {
    return this.loadError;
  }

  describeEngine(): string {
    return this.engine?.describe() ?? 'not loaded';
  }

  subscribe(fn: (s: ServiceState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private setState(s: ServiceState): void {
    if (s === this.state_) {
      return;
    }
    this.state_ = s;
    for (const l of this.listeners) {
      l(s);
    }
  }

  /** Open the model if it is not open. Resolves false, and sets 'no-model', when it cannot be. */
  ensureLoaded(): Promise<boolean> {
    if (this.engine) {
      return Promise.resolve(true);
    }
    if (this.loading) {
      return this.loading;
    }
    this.setState('loading');
    this.loading = this.loader(this.opts.modelPath)
      .then(engine => {
        this.engine = engine;
        this.loadError = null;
        this.setState('ready');
        return true;
      })
      .catch(e => {
        this.loadError = (e as Error).message;
        this.setState('no-model');
        return false;
      })
      .finally(() => {
        this.loading = null;
      });
    return this.loading;
  }

  /**
   * Run one bounded completion. Throws BusyError if one is already running;
   * every other failure is an outcome, not an exception.
   */
  async ask(
    messages: ChatMessage[],
    onToken?: (text: string) => void,
    opts: { prefill?: string; stop?: string[] } = {},
  ): Promise<GuidanceResult> {
    if (this.state_ === 'busy' || this.state_ === 'loading') {
      throw new BusyError();
    }
    const t0 = this.now();
    this.pendingWarmKey = null;
    this.cachedKey = null;
    this.cancelRequested = false;
    let warmWaitMs = 0;
    if (this.warming) {
      this.setState('busy');
      await this.warming;
      warmWaitMs = this.now() - t0;
      if (this.cancelRequested) {
        this.setState('ready');
        return {
          outcome: 'cancelled',
          text: '',
          firstTokenMs: null,
          totalMs: warmWaitMs,
          promptTokens: null,
          generatedTokens: null,
          cachedTokens: null,
          promptMs: 0,
          generatedMs: 0,
          stoppedByLimit: false,
          stoppedByWord: false,
          message: `Cancelled after ${(warmWaitMs / 1000).toFixed(1)} s.`,
          warmWaitMs,
        };
      }
    }
    const loaded = await this.ensureLoaded();
    if (!loaded || !this.engine) {
      return {
        outcome: 'no-model',
        text: '',
        firstTokenMs: null,
        totalMs: this.now() - t0,
        promptTokens: null,
        generatedTokens: null,
        cachedTokens: null,
        promptMs: 0,
        generatedMs: 0,
        stoppedByLimit: false,
        stoppedByWord: false,
        message: 'The tutor model is not available on this tablet, so the tutor cannot answer. Stored hints and solutions still work, and a teacher can install the model from Teacher tools.',
        warmWaitMs,
      };
    }
    const engine = this.engine;
    this.setState('busy');
    let timedOut = false;
    let first: number | null = null;
    let text = '';
    const timer = this.setTimer(() => {
      timedOut = true;
      engine.stop().catch(() => undefined);
    }, this.timeoutMs);
    try {
      const stop = [...STOP_WORDS, ...(opts.stop ?? [])];
      const r = await engine.complete(messages, { nPredict: this.nPredict, stop, temperature: TEMPERATURE, prefill: opts.prefill }, token => {
        if (first === null) {
          first = this.now() - t0;
        }
        text += token;
        onToken?.(text);
      });
      const totalMs = this.now() - t0;
      const base = {
        text: r.text || text,
        firstTokenMs: first,
        totalMs,
        promptTokens: r.promptTokens,
        generatedTokens: r.generatedTokens,
        cachedTokens: r.cachedTokens,
        promptMs: r.promptMs,
        generatedMs: r.generatedMs,
        stoppedByLimit: r.stoppedByLimit,
        stoppedByWord: r.stoppedByWord,
        warmWaitMs,
      };
      if (this.cancelRequested) {
        return { ...base, outcome: 'cancelled', message: `Cancelled after ${(totalMs / 1000).toFixed(1)} s.` };
      }
      if (timedOut) {
        return { ...base, outcome: 'timed-out', message: `Stopped at the ${Math.round(this.timeoutMs / 1000)} s limit; what was produced is shown.` };
      }
      return { ...base, outcome: 'generated', message: '' };
    } catch (e) {
      const totalMs = this.now() - t0;
      return {
        outcome: 'failed',
        text,
        firstTokenMs: first,
        totalMs,
        promptTokens: null,
        generatedTokens: null,
        cachedTokens: null,
        promptMs: 0,
        generatedMs: 0,
        stoppedByLimit: false,
        stoppedByWord: false,
        message: `Generation failed: ${(e as Error).message}. Stored hints and solutions still work.`,
        warmWaitMs,
      };
    } finally {
      this.clearTimer(timer);
      this.setState('ready');
    }
  }

  /**
   * Load the model and process `messages` with a one-token completion, so a
   * request that starts with the same tokens finds them in the cache. Runs
   * in the background of the learner's reading or typing: the state stays
   * 'ready', and a request waits for it (see ask). Skipped when the model is
   * missing, a request is running, or these messages are already cached;
   * asked for while another warm-up runs, it is queued, and a newer call
   * replaces it.
   */
  warmUp(messages: ChatMessage[]): Promise<WarmUpResult> {
    const key = JSON.stringify(messages);
    const skip = (reason: string): Promise<WarmUpResult> => Promise.resolve({ ok: false, ms: 0, promptTokens: null, reason });
    if (this.state_ === 'no-model') {
      return skip('the model is not available');
    }
    if (this.state_ === 'busy') {
      return skip('a request is running');
    }
    if (key === this.cachedKey) {
      return skip('already cached');
    }
    if (this.warming) {
      this.pendingWarmKey = key;
      return this.warming.then(() => {
        if (this.pendingWarmKey !== key) {
          return { ok: false, ms: 0, promptTokens: null, reason: 'superseded' };
        }
        this.pendingWarmKey = null;
        return this.warmUp(messages);
      });
    }
    const t0 = this.now();
    const run = (async (): Promise<WarmUpResult> => {
      const loaded = await this.ensureLoaded();
      if (!loaded || !this.engine) {
        return { ok: false, ms: this.now() - t0, promptTokens: null, reason: this.loadError ?? 'not loaded' };
      }
      try {
        const r = await this.engine.complete(messages, { nPredict: 1, stop: STOP_WORDS, temperature: TEMPERATURE }, () => undefined);
        if (r.interrupted) {
          return { ok: false, ms: this.now() - t0, promptTokens: r.promptTokens, reason: 'stopped' };
        }
        this.cachedKey = key;
        return { ok: true, ms: this.now() - t0, promptTokens: r.promptTokens };
      } catch (e) {
        return { ok: false, ms: this.now() - t0, promptTokens: null, reason: (e as Error).message };
      }
    })();
    const tracked: Promise<WarmUpResult> = run.finally(() => {
      if (this.warming === tracked) {
        this.warming = null;
      }
    });
    this.warming = tracked;
    return tracked;
  }

  async cancel(): Promise<void> {
    if (this.state_ !== 'busy' || !this.engine) {
      return;
    }
    this.cancelRequested = true;
    await this.engine.stop();
  }

  async release(): Promise<void> {
    this.pendingWarmKey = null;
    if (this.warming && this.engine) {
      await this.engine.stop();
      await this.warming;
    }
    this.cachedKey = null;
    const e = this.engine;
    this.engine = null;
    if (e) {
      await e.release();
    }
    this.setState('idle');
  }
}

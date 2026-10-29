/**
 * The guidance layer without a model: prompt assembly against the real
 * Unit 1 lesson, answer redaction, the controller's decisions, the outcome
 * log on real SQLite, and the service's state machine driven by a fake
 * engine with controllable timing.
 */

import { PACKAGES } from '../src/content/packages';
import { PASSAGE_MAX_CHARS } from '../src/guidance/config';
import { planExerciseHelp, planFreeQuestion, planTypingWarmUp } from '../src/guidance/controller';
import { countOutcomes, ensureGuidanceSchema, listGuidance, recordGuidance, summariseOutcomes } from '../src/guidance/log';
import { toEngineResult } from '../src/guidance/llamaEngine';
import { displayCut, dropUnclosedMath, exerciseHelpMessages, exerciseSource, freeQuestionMessages, lessonSource, passageWarmUpMessages, promptTokens, selectPassage, SYSTEM_PROMPT, warmUpMessages } from '../src/guidance/prompt';
import { generatedHtml } from '../src/katex/page';
import { MASK, redactAnswer } from '../src/guidance/redact';
import { BusyError, GuidanceService, type Engine, type EngineResult } from '../src/guidance/service';
import { afterStep, canAskSimpler, canNextStep, initialSteps, needsAnotherChunk, SIMPLER_LEAD_IN, SIMPLER_STOP, simplerPrefill, stepLabel, stopWordsForStep, withSimpler } from '../src/guidance/steps';
import { MAX_CHUNKS_PER_STEP, MAX_STEPS } from '../src/guidance/config';
import { initialPractice, reduce } from '../src/study/practice';

const { makeSqlDb } = require('../jest/sqljs-db');

const u1 = PACKAGES[0];
const lesson = u1.lessons[0];
const q1 = u1.exercises[0];
const routable = u1.lessons.map(l => ({ id: l.id, topics: l.topics }));

describe('selectPassage', () => {
  it('picks the multiplication paragraph and its formula for a multiplication question', () => {
    const p = selectPassage(lesson, 'How do I multiply two complex numbers?', ['multiply', 'complex numbers']);
    expect(p).toContain('multiplication of z');
    expect(p).toContain('(ac - bd) + (bc + ad)');
    expect(p.length).toBeLessThanOrEqual(PASSAGE_MAX_CHARS);
  });

  it('picks the conjugate paragraph for a conjugate question', () => {
    const p = selectPassage(lesson, 'What is the conjugate of 12 - 4i?', ['conjugate']);
    expect(p).toContain('complex conjugate');
    expect(p).toContain('\\bar{z} = x - yi');
  });

  it('falls back to the objective when nothing overlaps', () => {
    const p = selectPassage(lesson, 'zzz', []);
    expect(p.startsWith(lesson.objective.slice(0, 40))).toBe(true);
    expect(p.length).toBeLessThanOrEqual(PASSAGE_MAX_CHARS);
  });

  it('never exceeds the character budget and cuts at a sentence', () => {
    const long = { objective: 'o', blocks: [{ kind: 'p' as const, text: `${'complex numbers add '.repeat(60)}. tail` }] };
    const p = selectPassage(long, 'add complex numbers', []);
    expect(p.length).toBeLessThanOrEqual(PASSAGE_MAX_CHARS);
  });
});

describe('messages', () => {
  it('keeps the system prompt byte-for-byte stable across requests', () => {
    const a = freeQuestionMessages('p', 'q1');
    const b = freeQuestionMessages('other passage', 'q2');
    expect(a[0]).toEqual(b[0]);
    expect(a[0].content).toBe(SYSTEM_PROMPT);
    expect(a[1].content).toContain('Question: q1');
  });

  it('stays near the 200-token budget for a real question', () => {
    const passage = selectPassage(lesson, 'How do I multiply two complex numbers?', ['multiply']);
    const m = freeQuestionMessages(passage, 'How do I multiply two complex numbers?');
    expect(promptTokens(m)).toBeLessThan(230);
  });

  it('warm-up shares the exact prefix of every free question', () => {
    const w = warmUpMessages();
    const q = freeQuestionMessages('some passage', 'a question');
    expect(w[0]).toEqual(q[0]);
    expect(q[1].content.startsWith(w[1].content)).toBe(true);
  });

  it('the passage warm-up is the full question prompt up to the question, split where the tokenizer splits', () => {
    const passage = selectPassage(lesson, 'How do I multiply two complex numbers?', ['multiply']);
    const w = passageWarmUpMessages(passage);
    const q = freeQuestionMessages(passage, 'How do I multiply two complex numbers?');
    expect(w[0]).toEqual(q[0]);
    expect(q[1].content.startsWith(w[1].content)).toBe(true);
    expect(w[1].content.endsWith('Question:')).toBe(true);
    expect(q[1].content.slice(w[1].content.length)).toBe(' How do I multiply two complex numbers?');
  });

  it('carries the exercise and its hints, asks for the next step, and never the solution', () => {
    const m = exerciseHelpMessages(q1);
    expect(m[1].content).toContain(q1.prompt.text);
    for (const h of q1.hints) {
      expect(m[1].content).toContain(h);
    }
    expect(m[1].content).toContain('Do not state the final answer');
    for (const s of q1.solution) {
      if (s.tex) {
        expect(m[1].content).not.toContain(s.tex);
      }
    }
    expect(m[1].content).not.toContain(q1.answer.display_tex);
  });
});

describe('passage source', () => {
  it('names the routed lesson and its printed page range', () => {
    expect(lesson.pages).toEqual([13, 19]);
    expect(lessonSource(lesson)).toBe(`the lesson "${lesson.title}" (REB Student's Book, pp. 13–19)`);
  });

  it('names the exercise whose hints are the passage, and its single page', () => {
    expect(q1.pages).toEqual([15]);
    expect(exerciseSource(q1)).toBe(`the stored hints for ${q1.source_label} (REB Student's Book, p. 15)`);
  });

  it('gives every lesson and exercise in the four packages a page', () => {
    for (const pkg of PACKAGES) {
      for (const l of pkg.lessons) {
        expect(lessonSource(l)).toMatch(/\(REB Student's Book, pp?\. \d+(–\d+)?\)$/);
      }
      for (const e of pkg.exercises) {
        expect(exerciseSource(e)).toMatch(/\(REB Student's Book, pp?\. \d+(–\d+)?\)$/);
      }
    }
  });
});

describe('redactAnswer', () => {
  const key = q1.answer; // 5 + 3i

  it('masks a rounded answer when the key accepts one, and leaves other numbers', () => {
    const sd = PACKAGES.find(p => p.manifest.id === 'rw-s6-am.u9')!.exercises.find(q => q.id === 'rw-s6-am.u9.q.005')!.answer;
    const r = redactAnswer('The variance is 35/12, so the standard deviation is about 1.71.', sd);
    expect(r.masked).toBe(1);
    expect(r.text).toContain(MASK);
    expect(r.text).toContain('35/12');
  });

  it('leaves the text alone when the key is a function it cannot evaluate as a number', () => {
    const ivp = PACKAGES.find(p => p.manifest.id === 'rw-s6-am.u5')!.exercises[1].answer;
    const text = 'Separate the variables and integrate both sides.';
    expect(redactAnswer(text, ivp)).toEqual({ text, masked: 0 });
  });

  it.each(['So the answer is 5 + 3i.', 'You get 3i + 5', 'giving 5+3i as the result', 'z = 5 + 3*i', '\\boxed{5 + 3i}', '$5+3i$'])(
    'masks the answer written as %s',
    text => {
      const r = redactAnswer(text, key);
      expect(r.masked).toBeGreaterThanOrEqual(1);
      expect(r.text).toContain(MASK);
      expect(r.text).not.toMatch(/5\s*\+\s*3\s*\*?\s*i/);
    },
  );

  it('leaves intermediate numbers and other values alone', () => {
    const text = 'Add the real parts: 3 + 2 = 5. Add the imaginary parts: 4 - 1 = 3. Then combine them.';
    const r = redactAnswer(text, key);
    expect(r.masked).toBe(0);
    expect(r.text).toBe(text);
  });

  it('leaves the question restated in its unsimplified form', () => {
    const r = redactAnswer('Start from (3 + 4i) + (2 - i) and add the real parts.', key);
    expect(r.masked).toBe(0);
  });

  it('masks a real answer only when the key is real', () => {
    const real = { ...key, expected: '7', accepted: [], display_tex: '7' };
    expect(redactAnswer('The result is 7.', real).masked).toBe(1);
    expect(redactAnswer('There are 7 steps and the result is 5 + 3i.', key).text).not.toContain('[final answer hidden: work it out] steps');
  });
});

describe('continuation and display after the cap', () => {
  it('ends the display at the last full sentence when little is lost, else marks the cut', () => {
    expect(displayCut('Add the real parts. Then add the imaginary parts. Finally combine the')).toEqual({
      text: 'Add the real parts. Then add the imaginary parts.',
      trimmed: true,
    });
    expect(displayCut('Add the real parts.')).toEqual({ text: 'Add the real parts.', trimmed: false });
    expect(displayCut('To evaluate z_1 + z_2 we need to add the real parts together and the')).toEqual({
      text: 'To evaluate z_1 + z_2 we need to add the real parts together and the…',
      trimmed: true,
    });
    expect(displayCut('Step 1. Identify the real part and the imaginary part of each number and then write')).toEqual({
      text: 'Step 1. Identify the real part and the imaginary part of each number and then write…',
      trimmed: true,
    });
  });

  it('drops an unclosed formula fragment from the display and keeps closed ones', () => {
    expect(dropUnclosedMath('Substitute: \\[ ac + adi + b')).toBe('Substitute:');
    expect(dropUnclosedMath('We know \\(i^2 = -1\\), so we substitute \\(-1\\) for')).toBe('We know \\(i^2 = -1\\), so we substitute \\(-1\\) for');
    expect(dropUnclosedMath('closed \\[ x \\] then open \\( y')).toBe('closed \\[ x \\] then open');
    expect(dropUnclosedMath('$x$ and $y')).toBe('$x$ and');
    expect(displayCut('Next, substitute: \\[ ac + adi + b').text).toBe('Next, substitute:…');
  });

  it('judges the sentence trim on the newest part only', () => {
    const first = 'Add the real parts of the two numbers. Then add the imaginary parts of the two numbers. Write the sum in the form a + bi.';
    const tail = ' Combine: the real part is';
    // Judged over the whole text, the last sentence end keeps most of it and the tail is lost.
    expect(displayCut(first + tail).text).toBe(first);
    // Judged from the tail start there is no sentence end, so the tail is kept with an ellipsis.
    expect(displayCut(first + tail, first.length).text).toBe(`${first + tail}…`);
  });

  it('the instruction asks the model to begin with the method, in numbered steps, and not restate', () => {
    expect(SYSTEM_PROMPT).toMatch(/Begin immediately with the first step/);
    expect(SYSTEM_PROMPT).toMatch(/do not repeat the question/);
    expect(SYSTEM_PROMPT).toMatch(/numbered steps/);
  });
});

describe('steps', () => {
  it('stops a generation at the heading of the following step', () => {
    expect(stopWordsForStep(1)).toEqual(['\n2.', '\n2)', '\nStep 2', '\n**2.']);
    expect(stopWordsForStep(5)).toContain('\n6.');
  });

  it('counts steps, keeps the raw text, and ends on finish or at the limit', () => {
    let s = initialSteps();
    expect(canNextStep(s)).toBe(false);
    expect(canAskSimpler(s)).toBe(false);
    expect(stepLabel(s)).toBe('');
    s = afterStep(s, '1. Expand the brackets.', false);
    expect(s).toMatchObject({ step: 1, raw: '1. Expand the brackets.', finished: false });
    expect(canNextStep(s)).toBe(true);
    expect(canAskSimpler(s)).toBe(true);
    expect(stepLabel(s)).toBe('Step 1. Try it yourself, then ask for the next step.');
    s = withSimpler(s, 'Multiply each part.');
    expect(canAskSimpler(s)).toBe(false);
    s = afterStep(s, '\n2. Combine terms.', true);
    expect(s.raw).toBe('1. Expand the brackets.\n2. Combine terms.');
    expect(s.simpler).toBeNull();
    expect(canNextStep(s)).toBe(false);
    expect(stepLabel(s)).toBe('The tutor finished in 2 steps.');
    let m = initialSteps();
    for (let i = 0; i < MAX_STEPS; i += 1) {
      m = afterStep(m, 'x', false);
    }
    expect(canNextStep(m)).toBe(false);
    expect(stepLabel(m)).toMatch(/as far as the tutor goes/);
  });

  it('asks for the simpler explanation as a completion after the text so far', () => {
    expect(simplerPrefill('1. Expand.\n')).toBe(`1. Expand.${SIMPLER_LEAD_IN}`);
    expect(SIMPLER_LEAD_IN).toMatch(/In simpler words/);
    expect(SIMPLER_STOP).toEqual(['\n']);
  });

  it('chains chunks only while the cap, not a heading, ended the text, up to the bound', () => {
    const cap = { stoppedByLimit: true, stoppedByWord: false };
    expect(needsAnotherChunk(1, cap)).toBe(true);
    expect(needsAnotherChunk(1, { stoppedByLimit: false, stoppedByWord: true })).toBe(false);
    expect(needsAnotherChunk(1, { stoppedByLimit: false, stoppedByWord: false })).toBe(false);
    expect(needsAnotherChunk(MAX_CHUNKS_PER_STEP, cap)).toBe(false);
    // The heading arrived on the chunk's last token: both flags, and the heading wins.
    expect(needsAnotherChunk(2, { stoppedByLimit: true, stoppedByWord: true })).toBe(false);
  });
});

describe('llama.rn result mapping', () => {
  it('turns the cache size into the number of tokens reused, as measured on the tablet', () => {
    const r = toEngineResult({ text: 'x', timings: { prompt_n: 109, predicted_n: 79, prompt_ms: 1, predicted_ms: 2 }, tokens_cached: 258, stopped_limit: 1 }, 'x');
    expect(r.cachedTokens).toBe(70);
    expect(r.stoppedByLimit).toBe(true);
    expect(r.stoppedByWord).toBe(false);
    expect(toEngineResult({ text: 'y', stopped_word: 1 }, 'y').stoppedByWord).toBe(true);
    expect(toEngineResult({ timings: { prompt_n: 146, predicted_n: 79 }, tokens_cached: 225 }, 's').cachedTokens).toBe(0);
    expect(toEngineResult({ timings: { prompt_n: 10, predicted_n: 14, cache_n: 202 } }, 's').cachedTokens).toBe(178);
    expect(toEngineResult({ timings: { prompt_n: 111, predicted_n: 79, cache_n: 259 }, tokens_cached: 259 }, 's').cachedTokens).toBe(69);
    expect(toEngineResult({}, 'streamed').text).toBe('streamed');
  });
});

describe('generated text page', () => {
  it('escapes the text and renders the delimiters the model writes with KaTeX auto-render', () => {
    const html = generatedHtml('Add \\( z_1 + z_2 \\) then <b>bold</b> and **Distribute** each term');
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
    expect(html).toContain('and Distribute each term');
    expect(html).toContain('renderMathInElement(document.body');
    expect(html).toContain("left: '\\\\('");
    expect(html).not.toMatch(/https?:\/\//);
  });
});

describe('controller', () => {
  it('declines an out-of-scope question without a route', () => {
    const p = planFreeQuestion('Explain photosynthesis', routable);
    expect(p.kind).toBe('declined');
    expect(p.kind === 'declined' && p.reason).toMatch(/model is not called/);
    expect(planFreeQuestion('   ', routable).kind).toBe('declined');
  });

  it('plans generation for an in-scope question with the route attached', () => {
    const p = planFreeQuestion('How do I multiply two complex numbers?', routable);
    expect(p.kind).toBe('generate');
    expect(p.kind === 'generate' && p.route.lessonId).toBe(lesson.id);
  });

  it('warms the passage of a half-typed question only once it has a few words and routes to this lesson', () => {
    expect(planTypingWarmUp('how do', routable, lesson.id)).toBeNull();
    expect(planTypingWarmUp('how do I multiply', routable, lesson.id)?.lessonId).toBe(lesson.id);
    expect(planTypingWarmUp('how do I multiply', routable, 'another-lesson')).toBeNull();
    expect(planTypingWarmUp('explain photosynthesis to me', routable, lesson.id)).toBeNull();
  });

  it('serves stored hints before generating for an exercise', () => {
    let s = initialPractice(q1.id, 2);
    expect(planExerciseHelp(s)).toEqual({ kind: 'stored', hintIndex: 0 });
    s = reduce(s, { type: 'hint' }).state;
    expect(planExerciseHelp(s)).toEqual({ kind: 'stored', hintIndex: 1 });
    s = reduce(s, { type: 'hint' }).state;
    expect(planExerciseHelp(s)).toEqual({ kind: 'generate' });
    const solved = reduce(s, { type: 'check', result: { verdict: 'correct', input: '5+3i' } }).state;
    expect(planExerciseHelp(solved).kind).toBe('none');
    const opened = reduce(s, { type: 'solution' }).state;
    expect(planExerciseHelp(opened).kind).toBe('none');
  });
});

describe('guidance log on real SQLite', () => {
  it('records outcomes apart and counts them', async () => {
    const db = await makeSqlDb();
    await ensureGuidanceSchema(db);
    const base = { learnerCode: 'A1', sessionId: 1, lessonId: lesson.id, exerciseId: null, question: 'q', text: '' };
    await recordGuidance(db, { ...base, outcome: 'declined', promptTokens: null, generatedTokens: null, firstTokenMs: null, totalMs: 1 });
    await recordGuidance(db, { ...base, outcome: 'generated', text: 'Add the real parts.', promptTokens: 150, generatedTokens: 80, firstTokenMs: 9800, totalMs: 41000 });
    await recordGuidance(db, { ...base, exerciseId: q1.id, outcome: 'stored', promptTokens: null, generatedTokens: null, firstTokenMs: null, totalMs: 0 });
    await recordGuidance(db, { ...base, learnerCode: 'B2', outcome: 'cancelled', promptTokens: null, generatedTokens: null, firstTokenMs: null, totalMs: 12000 });
    const a = await listGuidance(db, 'A1');
    expect(a.map(e => e.outcome)).toEqual(['declined', 'generated', 'stored']);
    expect(a[1]).toMatchObject({ promptTokens: 150, generatedTokens: 80, firstTokenMs: 9800, totalMs: 41000, exerciseId: null });
    expect(a[2].exerciseId).toBe(q1.id);
    const c = await countOutcomes(db, 'A1');
    expect(c).toMatchObject({ generated: 1, stored: 1, declined: 1, cancelled: 0 });
    expect(summariseOutcomes(c)).toBe('1 generated, 1 stored, 1 declined');
    expect(summariseOutcomes(await countOutcomes(db, 'C3'))).toBe('none yet');
    db.close();
  });
});

// A fake engine whose completion streams tokens on a controllable clock.
type Script = { tokens: string[]; result?: Partial<EngineResult>; fail?: Error };

function fakeEngine(script: Script) {
  let stopped = false;
  let resolveStop: (() => void) | null = null;
  const engine: Engine & { stops: number; calls: string[]; active: number; maxActive: number } = {
    stops: 0,
    calls: [],
    active: 0,
    maxActive: 0,
    describe: () => 'fake engine',
    async complete(m, opts, onToken) {
      engine.calls.push(m.map(x => x.content).join('|'));
      engine.active += 1;
      engine.maxActive = Math.max(engine.maxActive, engine.active);
      try {
        return await run(opts, onToken);
      } finally {
        engine.active -= 1;
      }
    },
    async stop() {
      stopped = true;
      engine.stops += 1;
      await new Promise<void>(r => {
        resolveStop = r;
      });
    },
    async release() {},
  };
  async function run(opts: { nPredict: number }, onToken: (t: string) => void): Promise<EngineResult> {
      if (script.fail) {
        throw script.fail;
      }
      let out = '';
      for (const t of script.tokens) {
        if (stopped) {
          break;
        }
        await new Promise<void>(r => setTimeout(() => r(), 1));
        out += t;
        onToken(t);
      }
      const r: EngineResult = {
        text: out,
        promptTokens: 150,
        generatedTokens: Math.min(script.tokens.length, opts.nPredict),
        promptMs: 100,
        generatedMs: 200,
        cachedTokens: 60,
        interrupted: stopped,
        stoppedByLimit: false,
        stoppedByWord: false,
        ...script.result,
      };
      resolveStop?.();
      return r;
  }
  return engine;
}

/** A one-shot event a test can wait for, instead of sleeping. */
function signal() {
  let fire!: () => void;
  const seen = new Promise<void>(res => (fire = res));
  return { fire: () => fire(), seen };
}

describe('GuidanceService', () => {
  const tokens = 'Add the real parts first, then the imaginary parts.'.split(/(?<= )/);

  it('loads lazily, streams, and reports a generated outcome with timings', async () => {
    const engine = fakeEngine({ tokens });
    const states: string[] = [];
    const svc = new GuidanceService(async () => engine, { modelPath: '/m.gguf' });
    svc.subscribe(s => states.push(s));
    expect(svc.state).toBe('idle');
    const seen: string[] = [];
    const r = await svc.ask([{ role: 'system', content: 's' }], t => seen.push(t));
    expect(r.outcome).toBe('generated');
    expect(r.text).toBe(tokens.join(''));
    expect(seen[seen.length - 1]).toBe(tokens.join(''));
    expect(r.firstTokenMs).not.toBeNull();
    expect(r.promptTokens).toBe(150);
    expect(r.cachedTokens).toBe(60);
    expect(r.stoppedByLimit).toBe(false);
    expect(states).toEqual(['loading', 'ready', 'busy', 'ready']);
    expect(svc.describeEngine()).toBe('fake engine');
  });

  it('is single-flight: a second request while busy throws BusyError', async () => {
    const svc = new GuidanceService(async () => fakeEngine({ tokens }), { modelPath: '/m.gguf' });
    const firstToken = signal();
    const first = svc.ask([], firstToken.fire);
    await firstToken.seen;
    await expect(svc.ask([])).rejects.toBeInstanceOf(BusyError);
    await first;
    expect(svc.state).toBe('ready');
  });

  it('cancels: stops the engine and reports the partial text as cancelled', async () => {
    const engine = fakeEngine({ tokens });
    const svc = new GuidanceService(async () => engine, { modelPath: '/m.gguf' });
    // Cancel once the first token has arrived, whatever the time it took.
    const firstToken = signal();
    const p = svc.ask([], firstToken.fire);
    await firstToken.seen;
    await svc.cancel();
    const r = await p;
    expect(r.outcome).toBe('cancelled');
    expect(engine.stops).toBe(1);
    expect(r.text.length).toBeGreaterThan(0);
    expect(r.text.length).toBeLessThan(tokens.join('').length);
    expect(r.message).toMatch(/Cancelled after/);
    expect(svc.state).toBe('ready');
  });

  it('times out: the timer stops the engine and the outcome is timed-out', async () => {
    const engine = fakeEngine({ tokens: Array(200).fill('x ') });
    const svc = new GuidanceService(async () => engine, { modelPath: '/m.gguf', timeoutMs: 15 });
    const r = await svc.ask([]);
    expect(r.outcome).toBe('timed-out');
    expect(engine.stops).toBe(1);
    expect(r.message).toMatch(/limit/);
    expect(svc.state).toBe('ready');
  });

  it('reports a missing or unloadable model as no-model and keeps working without it', async () => {
    const svc = new GuidanceService(async () => {
      throw new Error('Failed to load model: no such file');
    }, { modelPath: '/missing.gguf' });
    const r = await svc.ask([]);
    expect(r.outcome).toBe('no-model');
    expect(r.message).toMatch(/not available on this tablet/);
    expect(r.message).toMatch(/Stored hints and solutions still work/);
    expect(svc.state).toBe('no-model');
    expect(svc.unavailableReason).toMatch(/no such file/);
    // A later request tries again rather than staying stuck.
    const again = await svc.ask([]);
    expect(again.outcome).toBe('no-model');
  });

  it('reports an engine error as failed, not as a crash', async () => {
    const svc = new GuidanceService(async () => fakeEngine({ tokens, fail: new Error('context full') }), { modelPath: '/m.gguf' });
    const r = await svc.ask([]);
    expect(r.outcome).toBe('failed');
    expect(r.message).toMatch(/context full/);
    expect(svc.state).toBe('ready');
  });

  it('warms up without making the service busy, and skips a prompt already cached', async () => {
    const engine = fakeEngine({ tokens: ['x'] });
    const svc = new GuidanceService(async () => engine, { modelPath: '/m.gguf' });
    const states: string[] = [];
    svc.subscribe(s => states.push(s));
    const w = await svc.warmUp([{ role: 'system', content: 's' }]);
    expect(w.ok).toBe(true);
    expect(w.promptTokens).toBe(150);
    expect(states).toEqual(['loading', 'ready']);
    const again = await svc.warmUp([{ role: 'system', content: 's' }]);
    expect(again).toMatchObject({ ok: false, reason: 'already cached' });
    // A request replaces the cache head, so the same warm-up runs again after it.
    await svc.ask([{ role: 'system', content: 'other' }]);
    expect((await svc.warmUp([{ role: 'system', content: 's' }])).ok).toBe(true);
    const missing = new GuidanceService(async () => {
      throw new Error('gone');
    }, { modelPath: '/x' });
    expect((await missing.warmUp([])).ok).toBe(false);
    expect(missing.state).toBe('no-model');
    expect((await missing.warmUp([])).reason).toMatch(/not available/);
  });

  it('a request during a warm-up waits for it, then runs; the engine never runs two at once', async () => {
    const engine = fakeEngine({ tokens });
    const svc = new GuidanceService(async () => engine, { modelPath: '/m.gguf' });
    await svc.ensureLoaded();
    const warm = svc.warmUp([{ role: 'user', content: 'passage' }]);
    expect(svc.state).toBe('ready');
    const r = await svc.ask([{ role: 'user', content: 'passage q' }]);
    expect((await warm).ok).toBe(true);
    expect(r.outcome).toBe('generated');
    expect(r.warmWaitMs).toBeGreaterThan(0);
    expect(r.firstTokenMs).toBeGreaterThanOrEqual(r.warmWaitMs);
    expect(engine.calls).toEqual(['passage', 'passage q']);
    expect(engine.maxActive).toBe(1);
    expect(svc.state).toBe('ready');
  });

  it('cancelling while a request waits for a warm-up stops it and reports cancelled', async () => {
    const engine = fakeEngine({ tokens: Array(50).fill('x ') });
    const svc = new GuidanceService(async () => engine, { modelPath: '/m.gguf' });
    await svc.ensureLoaded();
    svc.warmUp([{ role: 'user', content: 'passage' }]).catch(() => undefined);
    const busy = signal();
    svc.subscribe(s => s === 'busy' && busy.fire());
    const p = svc.ask([{ role: 'user', content: 'passage q' }]);
    await busy.seen;
    expect(svc.state).toBe('busy');
    await svc.cancel();
    const r = await p;
    expect(r.outcome).toBe('cancelled');
    expect(engine.calls).toEqual(['passage']);
    expect(svc.state).toBe('ready');
  });

  it('keeps only the newest warm-up asked for while one runs, and none once a request starts', async () => {
    const engine = fakeEngine({ tokens: ['x'] });
    const svc = new GuidanceService(async () => engine, { modelPath: '/m.gguf' });
    await svc.ensureLoaded();
    const a = svc.warmUp([{ role: 'user', content: 'a' }]);
    const b = svc.warmUp([{ role: 'user', content: 'b' }]);
    const c = svc.warmUp([{ role: 'user', content: 'c' }]);
    expect((await a).ok).toBe(true);
    expect(await b).toMatchObject({ ok: false, reason: 'superseded' });
    expect((await c).ok).toBe(true);
    expect(engine.calls).toEqual(['a', 'c']);

    const d = svc.warmUp([{ role: 'user', content: 'd' }]);
    const e = svc.warmUp([{ role: 'user', content: 'e' }]);
    await svc.ask([{ role: 'user', content: 'q' }]);
    expect((await d).ok).toBe(true);
    expect((await e).ok).toBe(false);
    expect(engine.calls).toEqual(['a', 'c', 'd', 'q']);
    expect(engine.maxActive).toBe(1);
  });

  it('releases the engine and returns to idle', async () => {
    const svc = new GuidanceService(async () => fakeEngine({ tokens }), { modelPath: '/m.gguf' });
    await svc.ensureLoaded();
    expect(svc.state).toBe('ready');
    await svc.release();
    expect(svc.state).toBe('idle');
    expect(svc.describeEngine()).toBe('not loaded');
  });
});

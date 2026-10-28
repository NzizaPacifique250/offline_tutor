/**
 * The guidance panel's step pacing: each generation stops at the next
 * step's heading, the learner asks for the next step, which resumes the
 * same assistant turn from the raw text, "Explain this step more simply"
 * asks a side question, and the request ends when the model finishes.
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ensureGuidanceSchema, listGuidance } from '../src/guidance/log';
import { freeQuestionMessages } from '../src/guidance/prompt';
import { GuidanceService, type ChatMessageLike, type CompleteOptions, type Engine } from '../src/guidance/service';
import { SIMPLER_LEAD_IN } from '../src/guidance/steps';
import { GuidancePanel } from '../src/screens/GuidancePanel';
import { waitUntil } from '../jest/waitUntil';

const { makeSqlDb } = require('../jest/sqljs-db');

function texts(root: ReactTestRenderer.ReactTestInstance): string {
  return root
    .findAllByType(require('react-native').Text)
    .map(t => (Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children ?? '')))
    .join('\n');
}

function press(root: ReactTestRenderer.ReactTestInstance, id: string) {
  const hit = root.findAllByProps({ testID: id }).find(n => typeof n.props.onPress === 'function');
  if (!hit) {
    throw new Error(`no pressable ${id}`);
  }
  return hit.props.onPress();
}

const has = (root: ReactTestRenderer.ReactTestInstance, id: string) => root.findAllByProps({ testID: id }).length > 0;

// The whole answer the fake model "knows"; a request returns the part after
// the prefill, cut at the first stop string or at a cap of 40 characters,
// as llama.cpp would. Step 1 is longer than the cap, so it takes two chunks.
const ANSWER = '1. Expand the brackets: multiply each term of the first number by each term of the second.\n2. Replace i^2 with -1.\n3. Collect the real and imaginary parts.';
const SIMPLER = 'multiply every part of the first number by every part of the second.';
const CAP = 40;

describe('GuidancePanel steps', () => {
  it('paces the answer one step at a time and answers a simpler question on the side', async () => {
    const db = await makeSqlDb();
    await ensureGuidanceSchema(db);
    const calls: Array<{ m: ChatMessageLike[]; o: CompleteOptions }> = [];
    const engine: Engine = {
      describe: () => 'fake',
      async complete(m, o, onToken) {
        calls.push({ m, o });
        if ((o.prefill ?? '').endsWith(SIMPLER_LEAD_IN)) {
          onToken(SIMPLER);
          return { text: SIMPLER, promptTokens: 12, generatedTokens: 20, promptMs: 1, generatedMs: 2, cachedTokens: 200, interrupted: false, stoppedByLimit: false, stoppedByWord: true };
        }
        const rest = ANSWER.slice((o.prefill ?? '').length);
        let cut = rest.length;
        let byWord = false;
        for (const w of o.stop) {
          const i = rest.indexOf(w);
          if (i >= 0 && i < cut) {
            cut = i;
            byWord = true;
          }
        }
        const byLimit = cut > CAP;
        if (byLimit) {
          cut = CAP;
          byWord = false;
        }
        const text = rest.slice(0, cut);
        onToken(text);
        return { text, promptTokens: 10, generatedTokens: 30, promptMs: 1, generatedMs: 2, cachedTokens: 150, interrupted: false, stoppedByLimit: byLimit, stoppedByWord: byWord };
      },
      async stop() {},
      async release() {},
    };
    const service = new GuidanceService(async () => engine, { modelPath: '/fake.gguf' });
    const session = { learnerCode: 'D4', sessionId: 2 };
    const request = { id: 1, kind: 'generate' as const, question: 'how do I multiply?', lessonId: 'L', exerciseId: null, messages: freeQuestionMessages('p', 'how do I multiply?'), source: 'the lesson "Multiplication" (REB Student\'s Book, p. 15)' };
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      r = ReactTestRenderer.create(<GuidancePanel service={service} db={db} session={session} request={request} />);
    });
    const page = () => r.root.findAllByProps({ testID: 'webview' }).map(w => (w.props.source?.html ?? '') as string).find(h => h.includes('class="gen"')) ?? '';

    // Step 1 is longer than the cap: several chunks, each resumed from the
    // text so far, all stopping at the heading of step 2; shown once complete.
    const step1 = '1. Expand the brackets: multiply each term of the first number by each term of the second.';
    await waitUntil(() => expect(texts(r.root)).toContain('Next step (2)'));
    const chunks = calls.length;
    expect(chunks).toBeGreaterThanOrEqual(2);
    expect(calls[0].o.prefill).toBeUndefined();
    expect(calls[1].o.prefill).toBe(ANSWER.slice(0, CAP));
    for (const c of calls) {
      expect(c.o.stop).toContain('\n2.');
    }
    expect(page()).toContain(step1);
    expect(page()).not.toContain('Replace i^2');
    let t = texts(r.root);
    expect(t).toContain('Step 1. Try it yourself, then ask for the next step.');
    expect(t).toContain('produced by the on-device model from the lesson "Multiplication" (REB Student\'s Book, p. 15).');
    expect(t).toContain('Next step (2)');
    expect(has(r.root, 'guidance-simpler-button')).toBe(true);

    // A simpler explanation of step 1: the turn resumed with the lead-in,
    // ended at the line break; the main text is unchanged.
    await act(async () => press(r.root, 'guidance-simpler-button'));
    await waitUntil(() => expect(has(r.root, 'guidance-simpler')).toBe(true));
    const simplerCall = calls[chunks];
    expect(simplerCall.m).toEqual(request.messages);
    expect(simplerCall.o.prefill).toBe(`${step1}${SIMPLER_LEAD_IN}`);
    expect(simplerCall.o.stop).toContain('\n');
    expect(has(r.root, 'guidance-simpler')).toBe(true);
    expect(has(r.root, 'guidance-simpler-button')).toBe(false);
    expect(page()).not.toContain('Replace i^2');

    // Step 2 resumes the main turn from the raw text and stops before step 3.
    await act(async () => press(r.root, 'guidance-next-step'));
    await waitUntil(() => expect(texts(r.root)).toContain('Step 2. Try it yourself'));
    const step2Call = calls[chunks + 1];
    expect(step2Call.m).toEqual(request.messages);
    expect(step2Call.o.prefill).toBe(step1);
    expect(step2Call.o.stop).toContain('\n3.');
    expect(page()).toContain('2. Replace i^2 with -1.');
    expect(page()).not.toContain('Collect the real');
    expect(has(r.root, 'guidance-simpler')).toBe(false);
    t = texts(r.root);
    expect(t).toContain('Step 2. Try it yourself');

    // Step 3 is the model's last: it finishes on its own and no button remains.
    await act(async () => press(r.root, 'guidance-next-step'));
    await waitUntil(() => expect(texts(r.root)).toContain('The tutor finished in 3 steps.'));
    expect(page()).toContain('3. Collect the real and imaginary parts.');
    t = texts(r.root);
    expect(t).toContain('The tutor finished in 3 steps.');
    expect(has(r.root, 'guidance-next-step')).toBe(false);

    // The last log entry is written as the step ends; wait for it.
    await waitUntil(async () => expect((await listGuidance(db, 'D4')).map(e => e.question)).toContain('(step 3) how do I multiply?'));
    const events = await listGuidance(db, 'D4');
    const questions = events.map(e => e.question);
    // Step 1 took `chunks` chunks; a later step may need more than one too.
    expect(questions.filter(q => q.startsWith('(step 1, part ')).length).toBe(chunks - 1);
    expect(questions.filter(q => !q.includes(', part '))).toEqual([
      'how do I multiply?',
      '(simpler 1) how do I multiply?',
      '(step 2) how do I multiply?',
      '(step 3) how do I multiply?',
    ]);
    expect(events.every(e => e.outcome === 'generated')).toBe(true);
    db.close();
  });
});

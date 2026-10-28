/**
 * The study flow end to end, without a tablet: the practice and progress
 * screens rendered with react-test-renderer over a real SQLite database
 * (sql.js), driven through their testIDs. What the tablet check later
 * confirms by hand is asserted here first: a wrong answer, a hint, a correct
 * answer and the solution are each persisted, and progress reads them back.
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { importPackages } from '../src/content/importer';
import { PACKAGES } from '../src/content/packages';
import { ensureGuidanceSchema, listGuidance } from '../src/guidance/log';
import { GuidanceService, type Engine } from '../src/guidance/service';
import { ensureLearnerSchema, listAttempts, listReveals } from '../src/learner/store';
import { PracticeScreen } from '../src/screens/PracticeScreen';
import { ProgressScreen } from '../src/screens/ProgressScreen';

const { makeSqlDb } = require('../jest/sqljs-db');

const LESSON = 'rw-s6-am.u1.l07';
const Q1 = 'rw-s6-am.u1.q.001';
const session = { learnerCode: 'A1', sessionId: 1 };

// A model stand-in that answers with the final answer in it, so the
// redaction has something to catch.
function fakeService(reply = 'Add the real parts, 3 + 2, and the imaginary parts, 4 - 1: the answer is 5 + 3i.') {
  const engine: Engine = {
    describe: () => 'fake',
    async complete(_m, o, onToken) {
      for (const t of reply.split(/(?<= )/).slice(0, o.nPredict)) {
        await new Promise<void>(r => setTimeout(() => r(), 1));
        onToken(t);
      }
      return { text: reply, promptTokens: 120, generatedTokens: 25, promptMs: 100, generatedMs: 200, cachedTokens: 40, interrupted: false, stoppedByLimit: false, stoppedByWord: false };
    },
    async stop() {},
    async release() {},
  };
  return new GuidanceService(async () => engine, { modelPath: '/fake.gguf' });
}

const flush = () => act(async () => {
  await new Promise<void>(r => setTimeout(() => r(), 0));
});

// A testID sits on the composite Button or TextInput wrapper and on its host
// view; pick the first match that carries the prop the step needs.
function byId(root: ReactTestRenderer.ReactTestInstance, testID: string, prop: string) {
  const hit = root.findAllByProps({ testID }).find(n => n.props[prop] !== undefined);
  if (!hit) {
    throw new Error(`no element with testID ${testID} and prop ${prop}`);
  }
  return hit;
}
const press = (root: ReactTestRenderer.ReactTestInstance, id: string) => byId(root, id, 'onPress').props.onPress();
const type = (root: ReactTestRenderer.ReactTestInstance, id: string, text: string) => byId(root, id, 'onChangeText').props.onChangeText(text);
const disabled = (root: ReactTestRenderer.ReactTestInstance, id: string) => byId(root, id, 'accessibilityState').props.accessibilityState.disabled;

function texts(root: ReactTestRenderer.ReactTestInstance): string {
  return root
    .findAllByType(require('react-native').Text)
    .map(t => (Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children ?? '')))
    .join('\n');
}

describe('practice screen over real SQLite', () => {
  let db: Awaited<ReturnType<typeof makeSqlDb>>;
  beforeAll(async () => {
    db = await makeSqlDb();
    await ensureLearnerSchema(db);
    await ensureGuidanceSchema(db);
    await importPackages(db, PACKAGES);
  });
  afterAll(() => db.close());

  it('checks, hints, solves and persists', async () => {
    const onNext = jest.fn();
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      r = ReactTestRenderer.create(
        <PracticeScreen db={db} session={session} guidance={fakeService()} lessonId={LESSON} exerciseId={Q1} onNext={onNext} onBackToLesson={() => {}} />,
      );
    });
    await flush();
    const root = r.root;
    expect(texts(root)).toContain('Application activity 1.7, question 3');
    expect(texts(root)).toContain('Exercise 1 of 5');

    // Solution is closed before any hint.
    expect(disabled(root, 'solution-button')).toBe(true);

    // Wrong answer.
    await act(async () => type(root, 'answer-input', '5 - 3i'));
    await act(async () => press(root, 'check-button'));
    await flush();
    expect(texts(root)).toContain('Not quite. Check your working and try again.');

    // One hint, in stored order.
    await act(async () => press(root, 'hint-button'));
    await flush();
    expect(texts(root)).toContain(PACKAGES[0].exercises[0].hints[0]);
    expect(texts(root)).not.toContain(PACKAGES[0].exercises[0].hints[1]);

    // Unsupported input is explained, not graded.
    await act(async () => type(root, 'answer-input', 'sin(2)'));
    await act(async () => press(root, 'check-button'));
    await flush();
    expect(texts(root)).toContain('could not be checked automatically');

    // Correct answer in another spelling.
    await act(async () => type(root, 'answer-input', '3i+5'));
    await act(async () => press(root, 'check-button'));
    await flush();
    expect(texts(root)).toContain('Correct, after 3 tries.');
    expect(disabled(root, 'check-button')).toBe(true);

    // Solution now available; opening it mounts the second KaTeX page.
    expect(disabled(root, 'solution-button')).toBe(false);
    await act(async () => press(root, 'solution-button'));
    await flush();
    const webviews = root.findAllByProps({ testID: 'webview' });
    expect(webviews.length).toBeGreaterThanOrEqual(2);
    expect(webviews[webviews.length - 1].props.source.html).toContain('Solution');
    expect(webviews[webviews.length - 1].props.source.html).toContain('5 + 3i');

    // Persisted.
    const attempts = await listAttempts(db, 'A1');
    expect(attempts.map(a => [a.answer, a.verdict, a.hintsSeen])).toEqual([
      ['5 - 3i', 'wrong', 0],
      ['sin(2)', 'unsupported', 1],
      ['3i+5', 'correct', 1],
    ]);
    const reveals = await listReveals(db, 'A1');
    expect(reveals.map(x => [x.kind, x.hintIndex])).toEqual([
      ['hint', 0],
      ['solution', null],
    ]);

    await act(async () => press(root, 'practice-next'));
    expect(onNext).toHaveBeenCalledWith('rw-s6-am.u1.q.002');
  });

  it('serves stored hints first, then generates with the answer redacted, and logs each outcome', async () => {
    const c3 = { learnerCode: 'C3', sessionId: 9 };
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      r = ReactTestRenderer.create(
        <PracticeScreen db={db} session={c3} guidance={fakeService()} lessonId={LESSON} exerciseId={Q1} onNext={() => {}} onBackToLesson={() => {}} />,
      );
    });
    await flush();
    const root = r.root;
    const hints = PACKAGES[0].exercises[0].hints;
    // Three stored hints are served before any generation.
    for (let i = 0; i < hints.length; i += 1) {
      expect(texts(root)).toContain('Ask the tutor (next stored hint)');
      await act(async () => press(root, 'ask-tutor'));
      await flush();
      expect(texts(root)).toContain(hints[i]);
      expect(texts(root)).toContain(`Hint ${i + 1} of ${hints.length} shown from the book`);
    }
    expect(texts(root)).toContain('Ask the tutor (generated)');
    await act(async () => press(root, 'ask-tutor'));
    await flush();
    await act(async () => {
      await new Promise<void>(res => setTimeout(() => res(), 80));
    });
    await flush();
    const t = texts(root);
    // The finished text is drawn by the KaTeX WebView, so read its page.
    const gen = root
      .findAllByProps({ testID: 'webview' })
      .map(w => (w.props.source?.html ?? '') as string)
      .find(h => h.includes('class="gen"'));
    expect(gen).toBeDefined();
    expect(gen).toContain('Add the real parts, 3 + 2, and the imaginary parts, 4 - 1: the answer is');
    expect(gen).toContain('[final answer hidden');
    expect(gen).not.toMatch(/answer is 5 \+ 3i/);
    expect(gen).toContain('renderMathInElement');
    expect(t).toContain('Generated 25 tokens');
    expect(t).toContain('not reviewed');
    expect(t).toContain("produced by the on-device model from the stored hints for Application activity 1.7, question 3 (REB Student's Book, p. 15).");
    const events = await listGuidance(db, 'C3');
    expect(events.map(e => e.outcome)).toEqual(['stored', 'stored', 'stored', 'generated']);
    expect(events[3].text).toContain('[final answer hidden');
    expect(events[3].text).not.toContain('5 + 3i');
    expect(events[3]).toMatchObject({ exerciseId: Q1, promptTokens: 120, generatedTokens: 25 });
    // The stored hints were also recorded as reveals, so progress counts them.
    expect((await listReveals(db, 'C3')).filter(x => x.kind === 'hint')).toHaveLength(3);
    // Checking still works after guidance: the exercise is not solved by it.
    await act(async () => type(root, 'answer-input', '5+3i'));
    await act(async () => press(root, 'check-button'));
    await flush();
    expect(texts(root)).toContain('Correct.');
  });

  it('progress screen reads the saved attempts back and recommends the next exercise', async () => {
    const lessons = [{ id: LESSON, packageId: 'rw-s6-am.u1', title: 'Operations', objective: '', topics: [], exerciseCount: 5, reviewStatus: 'developer-test' as const }];
    const onPractice = jest.fn();
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      r = ReactTestRenderer.create(<ProgressScreen db={db} learnerCode="A1" lessons={lessons} onPractice={onPractice} />);
    });
    await flush();
    const t = texts(r.root);
    expect(t).toContain('1 of 5 exercises correct');
    expect(t).toContain('3 attempts');
    expect(t).toContain('1 hints');
    expect(t).toContain('1 solutions');
    expect(t).toContain('Next: Application activity 1.7, question 7.');
    expect(t).toContain('answered "5 - 3i"');
    expect(t).toContain('Tutor requests');
    await act(async () => press(r.root, 'progress-practice'));
    expect(onPractice).toHaveBeenCalledWith(LESSON, 'rw-s6-am.u1.q.002');
  });

  it('keeps another learner code empty', async () => {
    const lessons = [{ id: LESSON, packageId: 'rw-s6-am.u1', title: 'Operations', objective: '', topics: [], exerciseCount: 5, reviewStatus: 'developer-test' as const }];
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      r = ReactTestRenderer.create(<ProgressScreen db={db} learnerCode="B2" lessons={lessons} onPractice={() => {}} />);
    });
    await flush();
    const t = texts(r.root);
    expect(t).toContain('0 of 5 exercises correct');
    expect(t).toContain('No attempts saved yet.');
  });
});

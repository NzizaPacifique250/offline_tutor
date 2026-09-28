/**
 * The on-device answer checker, run against the real Unit 1 keys so it is
 * held to the same bar as tools/validate_package.py: every expected answer
 * and every accepted form is correct, and a deliberately wrong answer is not.
 */

import { checkAnswer } from '../src/checker/check';
import { evaluate, fold, UnsupportedInput } from '../src/checker/complex';
import { PACKAGES } from '../src/content/packages';

const exercises = PACKAGES[0].exercises;
const q1 = exercises[0]; // 5 + 3i
const key = q1.answer;

describe('evaluate (a + bi arithmetic)', () => {
  it.each([
    ['5 + 3i', 5, 3],
    ['5+3i', 5, 3],
    ['3i + 5', 5, 3],
    ['5 + 3*I', 5, 3],
    ['5 + 3 i', 5, 3],
    ['-9 - 15i', -9, -15],
    ['-15i - 9', -9, -15],
    ['10-41i', 10, -41],
    ['(3 + 4i)(2 - i)', 10, 5],
    ['(3 + 4i) + (2 - i)', 5, 3],
    ['i^2', -1, 0],
    ['i*i', -1, 0],
    ['2i(1+i)', -2, 2],
    ['5/2 + i/2', 2.5, 0.5],
    ['2.5 + 0.5i', 2.5, 0.5],
    ['-(3 - 2i)', -3, 2],
    ['7', 7, 0],
    ['-i', 0, -1],
    ['+4', 4, 0],
  ])('%s = %d + %di', (text, re, im) => {
    const v = evaluate(text);
    expect(v.re).toBeCloseTo(re, 9);
    expect(v.im).toBeCloseTo(im, 9);
  });

  it('folds the Unicode a tablet keyboard produces, as the grader does', () => {
    expect(fold('5 − 3i')).toBe('5 - 3i');
    expect(fold('3 × 2i')).toBe('3 * 2i');
    expect(fold('i²')).toBe('i^2');
    expect(evaluate('5 − 3i')).toEqual({ re: 5, im: -3 });
    expect(evaluate('z = 5 + 3i')).toEqual({ re: 5, im: 3 });
    expect(evaluate('z1 = 5 + 3i')).toEqual({ re: 5, im: 3 });
  });

  it.each(['sqrt(2)', 'x + 1', '5 + 3i +', '(5 + 3i', '5 +* 3i', 'sin(1)', '2^10', 'i^i', '1/0', '', '   ', '5 3 + i i i k'])(
    'refuses what it cannot evaluate: %s',
    text => {
      expect(() => evaluate(text)).toThrow(UnsupportedInput);
    },
  );
});

describe('checkAnswer against the bundled keys', () => {
  it.each(exercises.map(q => [q.id, q]))('%s: expected and every accepted form are correct', (_id, q) => {
    const k = (q as typeof q).answer;
    expect(checkAnswer(k, k.expected).verdict).toBe('correct');
    for (const alt of k.accepted ?? []) {
      expect(checkAnswer(k, alt).verdict).toBe('correct');
    }
  });

  it.each(exercises.map(q => [q.id, q]))('%s: expected + 1 is wrong, as the validator requires', (_id, q) => {
    const k = (q as typeof q).answer;
    expect(checkAnswer(k, `(${k.expected}) + 1`).verdict).toBe('wrong');
  });

  it('accepts the same value in another spelling', () => {
    for (const text of ['5+3i', '3i+5', '5 + 3 i', '5 − (−3i)', '(3 + 4i) + (2 - i)']) {
      expect(checkAnswer(key, text).verdict).toBe('correct');
    }
  });

  it('rejects a wrong sign, a swapped part and a near miss', () => {
    expect(checkAnswer(key, '5 - 3i').verdict).toBe('wrong');
    expect(checkAnswer(key, '3 + 5i').verdict).toBe('wrong');
    expect(checkAnswer(key, '5 + 3.001i').verdict).toBe('wrong');
  });

  it('reports an empty input as empty, not wrong', () => {
    expect(checkAnswer(key, '').verdict).toBe('empty');
    expect(checkAnswer(key, '   ').verdict).toBe('empty');
  });

  it('reports what it cannot read as unsupported, never as a grade', () => {
    for (const text of ['sqrt(2) + i', 'x + yi', 'five plus three i', '5 + 3i +']) {
      const r = checkAnswer(key, text);
      expect(r.verdict).toBe('unsupported');
      expect(r.reason).toBeTruthy();
    }
  });

  it('reports a check type the device does not implement as unsupported', () => {
    const r = checkAnswer({ ...key, check: 'antiderivative', expected: 'x**2/2' }, 'x^2/2');
    expect(r.verdict).toBe('unsupported');
    expect(r.reason).toContain('antiderivative');
  });

  it('honours a numeric tolerance from the key', () => {
    const numeric = { ...key, check: 'numeric', expected: '0.3', check_args: { tolerance: 0.01 } };
    expect(checkAnswer(numeric, '0.305').verdict).toBe('correct');
    expect(checkAnswer(numeric, '0.32').verdict).toBe('wrong');
  });
});

/**
 * The on-device answer checker, run against the real keys of every bundled
 * package so it is held to the same bar as tools/validate_package.py: every
 * expected answer and every accepted form is correct, and a deliberately
 * wrong answer is not.
 */

import { checkAnswer } from '../src/checker/check';
import { answerFormat } from '../src/checker/format';
import { initialPractice, reduce } from '../src/study/practice';
import { DomainError, evaluate, fold, UnsupportedInput } from '../src/checker/complex';
import { PACKAGES } from '../src/content/packages';
import type { AnswerKey } from '../src/content/types';

const exercises = PACKAGES.flatMap(p => p.exercises);
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

  it.each(['x + 1', '5 + 3i +', '(5 + 3i', '5 +* 3i', 'sin(1)', 'i^i', '1/0', '', '   ', '5 3 + i i i k', 'ln(-1)', 'sqrt', 'y = x = 2', 'cos x'])(
    'refuses what it cannot evaluate: %s',
    text => {
      expect(() => evaluate(text)).toThrow(UnsupportedInput);
    },
  );
});

describe('evaluate (π, e, √, ln, exp, powers and one variable)', () => {
  it.each([
    ['sqrt(2)', Math.SQRT2],
    ['√2', Math.SQRT2],
    ['2^10', 1024],
    ['2**3', 8],
    ['2^-1', 0.5],
    ['4^(1/2)', 2],
    ['pi', Math.PI],
    ['2π', 2 * Math.PI],
    ['e', Math.E],
    ['e^2', Math.E ** 2],
    ['2e+1', 2 * Math.E + 1],
    ['exp(1)', Math.E],
    ['ln(e)', 1],
    ['log(e^3)', 3],
    ['ln 8 / ln 2', 3],
    ['2ln 3', 2 * Math.log(3)],
    ['sqrt(35/12)', Math.sqrt(35 / 12)],
    ['46/3', 46 / 3],
    ['E(X) = 1.9', 1.9],
    ['Var(X)=2', 2],
    ['σ = 1.71', 1.71],
  ])('%s = %d', (text, want) => {
    const v = evaluate(text);
    expect(v.re).toBeCloseTo(want as number, 9);
    expect(v.im).toBeCloseTo(0, 9);
  });

  it('takes the principal square root of a negative number', () => {
    expect(evaluate('sqrt(-4)')).toEqual({ re: 0, im: 2 });
  });

  it('evaluates a function of x at a given point, with the label stripped', () => {
    expect(evaluate('y = x^2/2 + 4x - 6', { x: 2 }).re).toBeCloseTo(4, 12);
    expect(evaluate('(1+x)/(1-x)', { x: 0.5 }).re).toBeCloseTo(3, 12);
    expect(evaluate('1/√(1-x^2)', { x: 0.6 }).re).toBeCloseTo(1.25, 12);
    expect(evaluate('ln((e^(2x)+1)/2)', { x: 0 }).re).toBeCloseTo(0, 12);
    expect(evaluate('sqrt(x^2 - 2ln x + 3)', { x: 1 }).re).toBeCloseTo(2, 12);
    expect(evaluate('xx', { x: 3 }).re).toBe(9);
  });

  it('marks values outside a domain apart from what it cannot read', () => {
    expect(() => evaluate('ln(x)', { x: -1 })).toThrow(DomainError);
    expect(() => evaluate('1/(1-x)', { x: 1 })).toThrow(DomainError);
    expect(() => evaluate('sin(x)', { x: 1 })).not.toThrow(DomainError);
    expect(() => evaluate('sin(x)', { x: 1 })).toThrow(UnsupportedInput);
  });
});

describe('checkAnswer on functions and particular solutions', () => {
  const ivp: AnswerKey = {
    check: 'ode_solution',
    expected: '(1 + x)/(1 - x)',
    check_args: { ode: 'Derivative(y(x), x) - (1 + y(x)**2)/(1 + x**2)', var: 'x', func: 'y', ic: { '0': 1 }, sample: [0.2, 0.4, 0.6] },
    accepted: [],
    display_tex: 'y = \\frac{1 + x}{1 - x}',
    input: 'expression',
  };

  it('accepts the same function written another way and rejects a different one', () => {
    expect(checkAnswer(ivp, 'y = (1+x)/(1-x)').verdict).toBe('correct');
    expect(checkAnswer(ivp, '-(x+1)/(x-1)').verdict).toBe('correct');
    expect(checkAnswer(ivp, '(1-x)/(1+x)').verdict).toBe('wrong');
    expect(checkAnswer(ivp, '1 + 2x').verdict).toBe('wrong');
    expect(checkAnswer(ivp, '3').verdict).toBe('wrong');
  });

  it('says a function it cannot evaluate is unsupported, not wrong', () => {
    const r = checkAnswer(ivp, 'tan(atan(x) + pi/4)');
    expect(r.verdict).toBe('unsupported');
  });

  it('skips sample points outside the key\'s domain and needs three inside it', () => {
    const k = { ...ivp, expected: '1/sqrt(1 - x**2)', check_args: { ...ivp.check_args, sample: [0.2, 0.5, 0.8, 1.5] } };
    expect(checkAnswer(k, '1/√(1-x^2)').verdict).toBe('correct');
    expect(checkAnswer(k, 'sqrt(1-x^2)').verdict).toBe('wrong');
    const few = { ...k, check_args: { ...k.check_args, sample: [0.5, 1.5, 2] } };
    expect(checkAnswer(few, '1/√(1-x^2)').verdict).toBe('unsupported');
  });

  it('marks an answer undefined where the key is defined as wrong', () => {
    const k = { ...ivp, check: 'symbolic_equal', expected: 'x', check_args: { var: 'x', sample: [-1, 1, 2, 3] } };
    expect(checkAnswer(k, 'e^(ln x)').verdict).toBe('wrong');
    expect(checkAnswer(k, 'x').verdict).toBe('correct');
  });

  it('leaves a general solution to the worked solution', () => {
    const general = { ...ivp, expected: 'C*exp(3*x)', check_args: { ode: 'Derivative(y(x), x) - 3*y(x)', var: 'x', func: 'y' } };
    const r = checkAnswer(general, 'Ce^(3x)');
    expect(r.verdict).toBe('unsupported');
    expect(r.reason).toMatch(/general solution/);
  });
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
    for (const text of ['sin(2) + i', 'x + yi', 'five plus three i', '5 + 3i +']) {
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

describe('answerFormat (how the field asks for the answer)', () => {
  it('reads the format from each unit\'s keys', () => {
    const kinds = Object.fromEntries(PACKAGES.map(p => [p.manifest.unit, [...new Set(p.exercises.map(q => answerFormat(q.answer).kind))]]));
    expect(kinds).toEqual({ 1: ['complex'], 4: ['number'], 5: ['function'], 9: ['number'] });
  });

  it('gives the advice for an unreadable answer in the same terms, and keeps a + bi as the default', () => {
    const u5 = PACKAGES.find(p => p.manifest.unit === 5)!.exercises[0];
    const format = answerFormat(u5.answer);
    expect(format.placeholder).toMatch(/^y in terms of x/);
    const s = initialPractice(u5.id, u5.hints.length);
    const advised = reduce(s, { type: 'check', result: checkAnswer(u5.answer, 'tan(x)'), instruction: format.instruction }).state;
    expect(advised.feedback?.text).toBe(`That answer could not be checked automatically. ${format.instruction}`);
    const plain = reduce(s, { type: 'check', result: { verdict: 'unsupported', input: 'q' } }).state;
    expect(plain.feedback?.text).toMatch(/a \+ bi/);
  });
});

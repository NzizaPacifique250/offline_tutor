/**
 * The on-device answer checker (ARCHITECTURE.md, control flow step 4).
 *
 * It compares a student's input with the exercise's reviewed key. The key was
 * proven by tools/validate_package.py at build time; here the question is
 * only whether the student's input has the same value.
 *
 *   symbolic_equal / numeric with an a + bi or real value -> evaluated and
 *     compared numerically (tolerance from check_args, default 1e-6)
 *   a function of one variable (check_args.var, or an     -> both evaluated at
 *     ode_solution with an initial condition, whose         sample points in
 *     answer is unique)                                     the domain
 *                                                           (check_args.sample)
 *                                                           and compared there
 *   an input the evaluator cannot read                    -> 'unsupported'
 *   a check type the device does not implement            -> 'unsupported'
 *   nothing typed                                          -> 'empty'
 *
 * 'unsupported' is never a guess: the screen tells the student to compare
 * their answer with the solution instead.
 *
 * Pure: no React, no database.
 */

import type { AnswerKey } from '../content/types';
import { approxEqual, DomainError, evaluate, UnsupportedInput, type Complex } from './complex';

export type Verdict = 'correct' | 'wrong' | 'unsupported' | 'empty';

export type CheckResult = {
  verdict: Verdict;
  /** What the student typed, trimmed. */
  input: string;
  /** Why an input was unsupported, for the log; never shown as a grade. */
  reason?: string;
};

/** Check types the device can evaluate. The rest are development-time only. */
export const DEVICE_CHECKS = new Set(['symbolic_equal', 'numeric', 'ode_solution']);

// Points inside most domains the pilot needs; an exercise names its own in
// check_args.sample where these fall outside (1/√(1 − x²) needs |x| < 1).
const DEFAULT_SAMPLES = [0.3, 0.6, 0.9, 1.2, 1.5];
const MIN_POINTS = 3;

function tolerance(key: AnswerKey): number {
  const t = key.check_args?.tolerance;
  return typeof t === 'number' && t > 0 ? t : 1e-6;
}

function variableOf(key: AnswerKey): string | null {
  const v = key.check_args?.var;
  if (typeof v === 'string' && /^[a-z]$/.test(v)) {
    return v;
  }
  return key.check === 'ode_solution' ? 'x' : null;
}

function samplesOf(key: AnswerKey): number[] {
  const s = key.check_args?.sample;
  return Array.isArray(s) && s.length > 0 && s.every(x => typeof x === 'number' && Number.isFinite(x)) ? (s as number[]) : DEFAULT_SAMPLES;
}

/** Equal within `tolerance` relative to the size of the expected value. */
function close(got: Complex, want: Complex, tol: number): boolean {
  const scale = Math.max(1, Math.abs(want.re), Math.abs(want.im));
  return approxEqual(got, want, tol * scale);
}

/**
 * Compare two functions of `v` at the key's sample points. A point where the
 * key is undefined or not real is skipped; one where the key is defined and the student's
 * answer is not makes the answer wrong, since equivalent answers share a
 * domain. Fewer than MIN_POINTS usable points is 'unsupported', not a guess.
 */
function compareAsFunctions(key: AnswerKey, input: string, v: string): CheckResult {
  const tol = tolerance(key);
  let used = 0;
  for (const x of samplesOf(key)) {
    let want: Complex;
    try {
      want = evaluate(key.expected, { [v]: x });
    } catch (e) {
      if (e instanceof DomainError) {
        continue;
      }
      return { verdict: 'unsupported', input, reason: `key "${key.expected}" is outside the device grammar (${(e as Error).message})` };
    }
    if (Math.abs(want.im) > 1e-12) {
      // A real function's key is outside its domain where its value is not
      // real (√ of a negative number); the point says nothing.
      continue;
    }
    let got: Complex;
    try {
      got = evaluate(input, { [v]: x });
    } catch (e) {
      if (e instanceof DomainError) {
        return { verdict: 'wrong', input };
      }
      return { verdict: 'unsupported', input, reason: (e as Error).message };
    }
    if (!close(got, want, tol)) {
      return { verdict: 'wrong', input };
    }
    used += 1;
  }
  return used >= MIN_POINTS ? { verdict: 'correct', input } : { verdict: 'unsupported', input, reason: `only ${used} sample points lie in the domain` };
}

function tryEvaluate(text: string): Complex | string {
  try {
    return evaluate(text);
  } catch (e) {
    return e instanceof UnsupportedInput ? e.message : String(e);
  }
}

export function checkAnswer(key: AnswerKey, rawInput: string): CheckResult {
  const input = rawInput.trim();
  if (!input) {
    return { verdict: 'empty', input };
  }
  if (!DEVICE_CHECKS.has(key.check)) {
    return { verdict: 'unsupported', input, reason: `check "${key.check}" is not evaluated on the device` };
  }
  if (key.check === 'ode_solution' && !key.check_args?.ic) {
    // A general solution carries arbitrary constants that can be written in
    // many ways; the student compares with the worked solution instead.
    return { verdict: 'unsupported', input, reason: 'a general solution is not compared on the device' };
  }
  const variable = variableOf(key);
  if (variable) {
    return compareAsFunctions(key, input, variable);
  }
  const want = tryEvaluate(key.expected);
  if (typeof want === 'string') {
    // The validator proves keys parse in Python; a key this evaluator cannot
    // read is a package problem, not the student's.
    return { verdict: 'unsupported', input, reason: `key "${key.expected}" is outside the device grammar (${want})` };
  }
  const got = tryEvaluate(input);
  if (typeof got === 'string') {
    return { verdict: 'unsupported', input, reason: got };
  }
  const tol = tolerance(key);
  if (approxEqual(got, want, tol)) {
    return { verdict: 'correct', input };
  }
  // Accepted forms are alternative spellings of the same value, so they can
  // only ever agree with `expected`; they are consulted so that a key whose
  // accepted list carries a value the evaluator reads differently still passes.
  for (const alt of key.accepted ?? []) {
    const v = tryEvaluate(alt);
    if (typeof v !== 'string' && approxEqual(got, v, tol)) {
      return { verdict: 'correct', input };
    }
  }
  return { verdict: 'wrong', input };
}

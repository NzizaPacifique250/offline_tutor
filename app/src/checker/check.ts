/**
 * The on-device answer checker (ARCHITECTURE.md, control flow step 4).
 *
 * It compares a student's input with the exercise's reviewed key. The key was
 * proven by tools/validate_package.py at build time; here the question is
 * only whether the student's input has the same value.
 *
 *   symbolic_equal / numeric with an a + bi or real value -> evaluated and
 *     compared numerically (tolerance from check_args, default 1e-6)
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
import { approxEqual, evaluate, UnsupportedInput, type Complex } from './complex';

export type Verdict = 'correct' | 'wrong' | 'unsupported' | 'empty';

export type CheckResult = {
  verdict: Verdict;
  /** What the student typed, trimmed. */
  input: string;
  /** Why an input was unsupported, for the log; never shown as a grade. */
  reason?: string;
};

/** Check types the device can evaluate. The rest are development-time only. */
export const DEVICE_CHECKS = new Set(['symbolic_equal', 'numeric']);

function tolerance(key: AnswerKey): number {
  const t = key.check_args?.tolerance;
  return typeof t === 'number' && t > 0 ? t : 1e-6;
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

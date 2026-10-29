/**
 * Hint-first, enforced by the application: no candidate model gave a hint
 * before an answer in the benchmark (0 of 4), so generated guidance for an
 * exercise is scanned for the exercise's own answer and any occurrence is
 * masked before it is shown or stored. The check uses the same evaluator as
 * the answer checker, so "5 + 3i", "3i + 5" and "5+3*i" are all caught, and
 * a number that is not the answer (an intermediate step) is left alone.
 *
 * Pure: no model, no database.
 */

import { approxEqual, evaluate, UnsupportedInput, type Complex } from '../checker/complex';
import type { AnswerKey } from '../content/types';

export const MASK = '[final answer hidden: work it out]';

// Things that look like a complex or real number written as an answer:
// "5 + 3i", "-9-15i", "3i + 5", "10 - 41 i", "5+3*i", plus a lone "7" or
// "-41i". Boxed answers and inline TeX are caught by stripping delimiters.
const CANDIDATE =
  /(?:[-−+]?\s*\d+(?:\.\d+)?\s*\*?\s*i?\s*[-−+]\s*\d+(?:\.\d+)?\s*\*?\s*i?|[-−]?\s*\d+(?:\.\d+)?\s*\*?\s*i\b|(?<!\w|\d\.)[-−]?\d+(?:\.\d+)?(?!\w|\.\d))/gu;

function value(text: string): Complex | null {
  try {
    return evaluate(text);
  } catch (e) {
    return e instanceof UnsupportedInput ? null : null;
  }
}

function keyValue(key: AnswerKey): Complex | null {
  return value(key.expected);
}

/** Mask every span whose value equals the key. Returns the text and how many spans were masked. */
export function redactAnswer(text: string, key: AnswerKey): { text: string; masked: number } {
  const want = keyValue(key);
  if (!want) {
    return { text, masked: 0 };
  }
  // A key that accepts a rounded answer (a standard deviation to two
  // decimal places) is masked when written rounded, too.
  const t = key.check_args?.tolerance;
  const tol = typeof t === 'number' && t > 1e-6 ? t : 1e-6;
  let masked = 0;
  const stripped = text.replace(/\\boxed\{([^{}]*)\}/g, '$1').replace(/\$+/g, ' ');
  const out = stripped.replace(CANDIDATE, m => {
    const v = value(m);
    if (v && approxEqual(v, want, tol)) {
      masked += 1;
      return MASK;
    }
    return m;
  });
  return { text: out, masked };
}

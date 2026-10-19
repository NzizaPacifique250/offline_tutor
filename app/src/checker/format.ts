/**
 * How a student should write the answer to an exercise, read from its key:
 * a function of x (a particular solution), a complex number a + bi, or a
 * number. The practice screen shows it as the field's placeholder and as
 * the advice when an answer cannot be read.
 *
 * Pure: no React.
 */

import type { AnswerKey } from '../content/types';
import { evaluate } from './complex';

export type AnswerFormat = {
  kind: 'function' | 'complex' | 'number';
  placeholder: string;
  /** Advice after an answer the device could not read. */
  instruction: string;
};

const FORMATS: Record<AnswerFormat['kind'], Omit<AnswerFormat, 'kind'>> = {
  function: {
    placeholder: 'y in terms of x, e.g. y = 2e^(3x) + 1',
    instruction: 'Write y in terms of x, for example y = 2e^(3x) + 1, using ^ for powers, sqrt( ) for square roots and ln( ) for logarithms.',
  },
  complex: {
    placeholder: 'in the form a + bi, e.g. 5 + 3i',
    instruction: 'Write it in the form a + bi, for example 5 + 3i.',
  },
  number: {
    placeholder: 'a number, e.g. 7/2, 3.5 or sqrt(2)',
    instruction: 'Write it as a number, for example 7/2, 3.5 or sqrt(2).',
  },
};

function kindOf(key: AnswerKey): AnswerFormat['kind'] {
  if (key.check === 'ode_solution' || typeof key.check_args?.var === 'string') {
    return 'function';
  }
  try {
    return evaluate(key.expected).im !== 0 ? 'complex' : 'number';
  } catch {
    return 'number';
  }
}

export function answerFormat(key: AnswerKey): AnswerFormat {
  const kind = kindOf(key);
  return { kind, ...FORMATS[kind] };
}

/**
 * The practice state machine: what one exercise attempt looks like from the
 * moment it opens until the learner moves on.
 *
 * The rules the architecture fixes live here, not in the screen:
 *   - hints are revealed one at a time in their stored order;
 *   - the solution can be opened only after every hint has been seen, or
 *     after a correct answer;
 *   - every check is an attempt; an empty input is not;
 *   - once the solution is open, checking stops, so an answer copied from
 *     the solution is never recorded as a correct attempt;
 *   - feedback escalates with repeated wrong answers and, at the threshold the
 *     progress engine uses, points back to the worked example.
 *
 * reduce() returns the next state and a list of effects for the screen to
 * persist, so the machine stays pure and unit-tested without a database.
 */

import type { CheckResult, Verdict } from '../checker/check';
import { REPEATED_MISTAKES } from '../learner/progress';

export type PracticeState = {
  exerciseId: string;
  hintCount: number;
  hintsShown: number;
  solutionShown: boolean;
  attempts: Array<{ input: string; verdict: Verdict }>;
  solved: boolean;
  feedback: Feedback | null;
};

export type Feedback = { tone: 'ok' | 'info' | 'warn' | 'bad'; text: string };

export type PracticeAction =
  /** `instruction` says how to write the answer, shown when it cannot be read (checker/format.ts). */
  | { type: 'check'; result: CheckResult; instruction?: string }
  | { type: 'hint' }
  | { type: 'solution' };

export type PracticeEffect =
  | { type: 'record-attempt'; input: string; verdict: Verdict; hintsSeen: number }
  | { type: 'record-reveal'; kind: 'hint'; hintIndex: number }
  | { type: 'record-reveal'; kind: 'solution' };

export function initialPractice(exerciseId: string, hintCount: number): PracticeState {
  return { exerciseId, hintCount, hintsShown: 0, solutionShown: false, attempts: [], solved: false, feedback: null };
}

export function canShowHint(s: PracticeState): boolean {
  return s.hintsShown < s.hintCount;
}

export function canCheck(s: PracticeState): boolean {
  return !s.solved && !s.solutionShown;
}

export function canShowSolution(s: PracticeState): boolean {
  return !s.solutionShown && (s.solved || s.hintsShown >= s.hintCount);
}

export function wrongCount(s: PracticeState): number {
  return s.attempts.filter(a => a.verdict === 'wrong').length;
}

const DEFAULT_INSTRUCTION = 'Write it in the form a + bi, for example 5 + 3i.';

export function feedbackFor(result: CheckResult, s: PracticeState, instruction = DEFAULT_INSTRUCTION): Feedback {
  switch (result.verdict) {
    case 'correct': {
      const tries = s.attempts.length;
      return { tone: 'ok', text: tries > 1 ? `Correct, after ${tries} tries.` : 'Correct.' };
    }
    case 'empty':
      return { tone: 'info', text: 'Type an answer first.' };
    case 'unsupported':
      return {
        tone: 'info',
        text: `That answer could not be checked automatically. ${instruction}`,
      };
    case 'wrong': {
      const wrong = wrongCount(s);
      if (wrong >= REPEATED_MISTAKES + 1) {
        return { tone: 'bad', text: 'Still not right. Look again at the worked example in the lesson, then try once more.' };
      }
      if (wrong >= REPEATED_MISTAKES) {
        return { tone: 'warn', text: canShowHint(s) ? 'Not right yet. A hint may help.' : 'Not right yet. Try once more.' };
      }
      return { tone: 'warn', text: 'Not quite. Check your working and try again.' };
    }
  }
}

export function reduce(s: PracticeState, action: PracticeAction): { state: PracticeState; effects: PracticeEffect[] } {
  switch (action.type) {
    case 'check': {
      const { result } = action;
      if (!canCheck(s)) {
        return { state: s, effects: [] };
      }
      if (result.verdict === 'empty') {
        return { state: { ...s, feedback: feedbackFor(result, s, action.instruction) }, effects: [] };
      }
      const next: PracticeState = {
        ...s,
        attempts: [...s.attempts, { input: result.input, verdict: result.verdict }],
        solved: s.solved || result.verdict === 'correct',
      };
      next.feedback = feedbackFor(result, next, action.instruction);
      return {
        state: next,
        effects: [{ type: 'record-attempt', input: result.input, verdict: result.verdict, hintsSeen: s.hintsShown }],
      };
    }
    case 'hint': {
      if (!canShowHint(s)) {
        return { state: s, effects: [] };
      }
      return {
        state: { ...s, hintsShown: s.hintsShown + 1 },
        effects: [{ type: 'record-reveal', kind: 'hint', hintIndex: s.hintsShown }],
      };
    }
    case 'solution': {
      if (!canShowSolution(s)) {
        return { state: s, effects: [] };
      }
      return { state: { ...s, solutionShown: true }, effects: [{ type: 'record-reveal', kind: 'solution' }] };
    }
  }
}

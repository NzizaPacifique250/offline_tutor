/**
 * Step-by-step guidance (P5, 1 October 2026). The tutor shows one step of
 * the method, the learner tries it, and asks for the next. The application
 * paces this, not the model: each generation stops at the heading of the
 * following step ("\n2.", "\nStep 2") or at the token cap, the next step
 * resumes the same assistant turn from the cached text, and a request ends
 * when the model stops on its own or after MAX_STEPS. A step longer than
 * the cap is generated in chunks until its heading arrives. "Explain this
 * step more simply" resumes the turn with a lead-in sentence and stops at
 * the end of the line; the main explanation resumes from where it was.
 *
 * Pure: no model, no React.
 */

import { MAX_CHUNKS_PER_STEP, MAX_STEPS } from './config';

export type StepState = {
  /** Steps shown so far. */
  step: number;
  /** The model's text so far, untrimmed; the next step resumes from it. */
  raw: string;
  /** True once the model ended its answer itself. */
  finished: boolean;
  /** A simpler explanation of the last step, if asked for. */
  simpler: string | null;
};

/**
 * The simpler explanation is a completion, not a question: the assistant
 * turn is resumed with this lead-in after the text so far, and the model
 * completes the sentence in context. Asked as a chat turn, the 1.5B model
 * restarted its whole answer instead (measured on the tablet, 1 October).
 */
export const SIMPLER_LEAD_IN = '\n\nIn simpler words, this step means: ';

/** The simpler explanation ends at the end of its paragraph. */
export const SIMPLER_STOP = ['\n'];

export function initialSteps(): StepState {
  return { step: 0, raw: '', finished: false, simpler: null };
}

/** Stop strings that end a generation at the heading of step `n + 1`. */
export function stopWordsForStep(n: number): string[] {
  const next = n + 1;
  return [`\n${next}.`, `\n${next})`, `\nStep ${next}`, `\n**${next}.`];
}

export function afterStep(s: StepState, text: string, finished: boolean): StepState {
  return { step: s.step + 1, raw: `${s.raw}${text}`, finished, simpler: null };
}

export function withSimpler(s: StepState, text: string): StepState {
  return { ...s, simpler: text };
}

export function canNextStep(s: StepState): boolean {
  return !s.finished && s.step > 0 && s.step < MAX_STEPS;
}

export function canAskSimpler(s: StepState): boolean {
  return s.step > 0 && s.simpler === null;
}

export function stepLabel(s: StepState): string {
  if (s.step === 0) {
    return '';
  }
  if (s.finished) {
    return `The tutor finished in ${s.step} step${s.step === 1 ? '' : 's'}.`;
  }
  if (s.step >= MAX_STEPS) {
    return `Step ${s.step} of ${MAX_STEPS}: that is as far as the tutor goes. The worked solution has the rest.`;
  }
  return `Step ${s.step}. Try it yourself, then ask for the next step.`;
}

/** The prefill for a simpler explanation: the text so far plus the lead-in. */
export function simplerPrefill(raw: string): string {
  return `${raw.trimEnd()}${SIMPLER_LEAD_IN}`;
}

/**
 * Whether a chunk should be followed by another before the step is shown:
 * yes while only the cap ended it and the chunk bound is not reached. A
 * chunk can reach the next step's heading on its last token, in which case
 * the runtime reports both the stop string and the cap; the heading wins,
 * or the step would run on into the next one (seen on the tablet, 2
 * October).
 */
export function needsAnotherChunk(chunk: number, ended: { stoppedByLimit: boolean; stoppedByWord: boolean }): boolean {
  return ended.stoppedByLimit && !ended.stoppedByWord && chunk < MAX_CHUNKS_PER_STEP;
}

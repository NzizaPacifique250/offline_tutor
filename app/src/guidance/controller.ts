/**
 * Who decides whether the model is called: the router and this module, never
 * a screen (docs/feature-map.md, placement rules).
 *
 *   - a free question is routed first; no lesson match means 'declined' and
 *     the model is not called;
 *   - help on an exercise serves the next stored hint while any remain
 *     ('stored'); generation runs only once every hint has been shown and
 *     the exercise is still open.
 *
 * Pure: the screen carries out the plan it is given.
 */

import { routeQuestion, type RoutableLesson, type RouteResult } from '../content/router';
import type { PracticeState } from '../study/practice';
import { canShowHint } from '../study/practice';
import { TYPING_WARM_UP_MIN_WORDS } from './config';

export type FreeQuestionPlan =
  | { kind: 'declined'; reason: string }
  | { kind: 'generate'; route: RouteResult };

export function planFreeQuestion(question: string, lessons: RoutableLesson[]): FreeQuestionPlan {
  const q = question.trim();
  if (!q) {
    return { kind: 'declined', reason: 'Type a question first.' };
  }
  const route = routeQuestion(q, lessons);
  if (!route) {
    return {
      kind: 'declined',
      reason: 'Not covered in this course. The tutor answers only questions on the loaded units, so the model is not called.',
    };
  }
  return { kind: 'generate', route };
}

/**
 * Whether a half-typed question is worth warming the cache for: once it
 * has a few words and routes to the lesson on screen, whose paragraphs are
 * already loaded. A warm-up is not a learner request; nothing is logged.
 */
export function planTypingWarmUp(question: string, lessons: RoutableLesson[], lessonId: string): RouteResult | null {
  const q = question.trim();
  if (q.split(/\s+/).length < TYPING_WARM_UP_MIN_WORDS) {
    return null;
  }
  const route = routeQuestion(q, lessons);
  return route && route.lessonId === lessonId ? route : null;
}

export type ExerciseHelpPlan =
  | { kind: 'stored'; hintIndex: number }
  | { kind: 'generate' }
  | { kind: 'none'; reason: string };

export function planExerciseHelp(state: PracticeState): ExerciseHelpPlan {
  if (state.solved) {
    return { kind: 'none', reason: 'Already answered correctly.' };
  }
  if (state.solutionShown) {
    return { kind: 'none', reason: 'The solution is open.' };
  }
  if (canShowHint(state)) {
    return { kind: 'stored', hintIndex: state.hintsShown };
  }
  return { kind: 'generate' };
}

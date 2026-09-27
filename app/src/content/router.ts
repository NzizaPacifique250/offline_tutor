/**
 * The topic router: the scope gate in front of the model.
 *
 * A free question is matched against each lesson's topic keywords. A lesson
 * wins when at least one keyword occurs as whole words in the question; the
 * best-scoring lesson is returned, or null when nothing matches, in which case
 * the application declines the question and the model is never called. The
 * benchmark showed no candidate model refuses out-of-scope questions on its
 * own, so this must not depend on the model.
 *
 * Pure function: no database, no React, so it is unit-tested directly.
 */

export type RoutableLesson = { id: string; topics: string[] };

export type RouteResult = {
  lessonId: string;
  score: number;
  matched: string[];
};

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word (or whole-phrase) containment, so "add" never matches "address". */
function contains(haystack: string, phrase: string): boolean {
  if (!phrase) {
    return false;
  }
  return new RegExp(`(?:^|\\s)${escapeRegExp(phrase)}(?:\\s|$)`, 'u').test(haystack);
}

export function routeQuestion(question: string, lessons: RoutableLesson[]): RouteResult | null {
  const q = normalise(question);
  if (!q) {
    return null;
  }
  let best: RouteResult | null = null;
  for (const lesson of lessons) {
    const matched = lesson.topics.map(normalise).filter(t => contains(q, t));
    if (matched.length === 0) {
      continue;
    }
    // A multi-word keyword is more specific than a single word, so it counts
    // for its word count.
    const score = matched.reduce((n, t) => n + t.split(' ').length, 0);
    if (!best || score > best.score) {
      best = { lessonId: lesson.id, score, matched };
    }
  }
  return best;
}

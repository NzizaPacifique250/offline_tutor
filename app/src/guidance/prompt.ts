/**
 * Prompt assembly for bounded guidance (ARCHITECTURE.md, Layer 2).
 *
 * The system prompt is short and byte-for-byte stable, because llama.cpp
 * reuses the cached prefix of the previous prompt: P2 measured the first
 * token falling from 22.5 s to 0.6 s when the prefix was unchanged. The
 * user message carries one short reviewed passage and the question, so the
 * only tokens processed cold are the ones that differ per request.
 *
 * Two shapes:
 *   - a free question on a lesson the router matched: the passage is the
 *     lesson paragraph (with its formulas) that best matches the question;
 *   - an exercise the stored hints did not unlock: the passage is the
 *     exercise and its hints, and the instruction asks for the next step
 *     only. The worked solution is never placed in the prompt.
 *
 * Pure: no model, no database.
 */

import type { PackageExercise, PackageLesson, PackageLessonBlock } from '../content/types';
import { PASSAGE_MAX_CHARS } from './config';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

// Measured on the tablet (docs/P5_GUIDANCE.md): with a looser instruction the
// model spent its 80 tokens restating the question in LaTeX and announcing
// steps before saying anything. The wording below asks it to start with the
// method and keep notation short. It stays byte-stable across requests so
// the prompt cache keeps the prefix.
export const SYSTEM_PROMPT =
  'You are a mathematics tutor for Senior Six students following the Rwanda REB Advanced Mathematics syllabus. ' +
  'Use only the passage given. Begin immediately with the first step of the method; do not repeat the question ' +
  'or the passage, and do not announce what you are going to do. Write the method as numbered steps, one per ' +
  'line, starting "1.", each step one or two short sentences in plain words with short notation. ' +
  'Do not state a final numerical answer.';


const STOP_WORDS = new Set(
  (
    'a an the of to in on for and or is are be by with as at from that this it its how do i what which when give find evaluate ' +
    'one two three first second any each'
  ).split(' '),
);

// A crude stem so that "multiply" and "multiplication", "conjugate" and
// "conjugating", "add" and "addition" count as the same word.
const SUFFIXES = ['ication', 'ations', 'ation', 'ition', 'ings', 'ing', 'ies', 'ied', 'ion', 'ed', 'es', 's'];

export function stem(w: string): string {
  for (const suf of SUFFIXES) {
    if (w.length > suf.length + 2 && w.endsWith(suf)) {
      return w.slice(0, -suf.length).slice(0, 6);
    }
  }
  return w.slice(0, 6);
}

export function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w))
    .map(stem);
}

/** Rough token estimate; TeX runs closer to 3 characters per token than prose. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

type Candidate = { text: string; score: number; position: number };

const EARLY_WORDS = 6;
const EARLY_BONUS = 3;

/**
 * The lesson paragraph that best matches the question, followed by the
 * formulas that directly follow it, capped at PASSAGE_MAX_CHARS.
 *
 * A paragraph whose `topics` tag names a topic the router matched wins
 * outright (the earliest such paragraph, or the one naming most of them):
 * the package author has said what that paragraph teaches, in the same
 * vocabulary the router keys on. Without tags the heuristic below applies.
 *
 * Each distinct question word found in a paragraph scores 1 over the square
 * of the number of paragraphs that contain it, so "complex" and "numbers",
 * which most paragraphs of this lesson mention, weigh little against
 * "multiply", which few mention; a word the router matched as a topic counts
 * double, and a word among the paragraph's first six counts three times
 * more, because the paragraph that introduces a concept names it first
 * ("The multiplication of z₁ …", "The complex conjugate of z …"). Falls back
 * to the objective and the first paragraph.
 *
 * The heuristic alone could not tell the paragraph that introduces
 * multiplication from the one that says conjugation distributes over it,
 * which is why the tags exist.
 */
export function selectPassage(lesson: Pick<PackageLesson, 'objective' | 'blocks'>, question: string, matched: string[] = []): string {
  const blocks = lesson.blocks;
  const tagged = taggedPassage(blocks, matched);
  if (tagged !== null) {
    return truncate(tagged, PASSAGE_MAX_CHARS);
  }
  const topic = new Set(matched.flatMap(words));
  const q = new Set([...words(question), ...topic]);
  const paragraphs = blocks
    .map((b, i) => {
      if (b.kind !== 'p') {
        return null;
      }
      const list = words(b.text);
      return { i, stems: new Set(list), early: new Set(list.slice(0, EARLY_WORDS)) };
    })
    .filter((x): x is { i: number; stems: Set<string>; early: Set<string> } => x !== null);
  const df = new Map<string, number>();
  for (const p of paragraphs) {
    for (const w of p.stems) {
      df.set(w, (df.get(w) ?? 0) + 1);
    }
  }
  const candidates: Candidate[] = [];
  for (const p of paragraphs) {
    let score = 0;
    for (const w of q) {
      if (p.stems.has(w)) {
        const n = df.get(w) ?? 1;
        score += ((topic.has(w) ? 2 : 1) * (p.early.has(w) ? EARLY_BONUS : 1)) / (n * n);
      }
    }
    candidates.push({ text: withFollowingMath(blocks, p.i), score, position: p.i });
  }
  candidates.sort((a, b) => b.score - a.score || a.position - b.position);
  const best = candidates[0];
  const body = best && best.score > 0 ? best.text : `${lesson.objective}\n${candidates[0]?.text ?? ''}`.trim();
  return truncate(body, PASSAGE_MAX_CHARS);
}

function normaliseTag(t: string): string {
  return t.toLowerCase().replace(/\s+/g, ' ').trim();
}

function taggedPassage(blocks: PackageLessonBlock[], matched: string[]): string | null {
  const want = new Set(matched.map(normaliseTag));
  if (want.size === 0) {
    return null;
  }
  let best: { i: number; hits: number } | null = null;
  for (const [i, b] of blocks.entries()) {
    if (b.kind !== 'p' || !b.topics) {
      continue;
    }
    const hits = b.topics.map(normaliseTag).filter(t => want.has(t)).length;
    if (hits > 0 && (!best || hits > best.hits)) {
      best = { i, hits };
    }
  }
  return best ? withFollowingMath(blocks, best.i) : null;
}

function withFollowingMath(blocks: PackageLessonBlock[], i: number): string {
  const parts: string[] = [(blocks[i] as { text: string }).text];
  for (let j = i + 1; j < blocks.length && parts.length < 3; j += 1) {
    const b = blocks[j];
    if (b.kind === 'math') {
      parts.push(b.tex);
    } else {
      break;
    }
  }
  return parts.join('\n');
}

function truncate(s: string, max: number): string {
  if (s.length <= max) {
    return s;
  }
  const cut = s.slice(0, max);
  const at = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'));
  return (at > max / 2 ? cut.slice(0, at + 1) : cut).trim();
}

const PASSAGE_HEADER = "Passage from the REB Student's Book:\n";

export function freeQuestionMessages(passage: string, question: string): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `${PASSAGE_HEADER}${passage}\n\nQuestion: ${question.trim()}` },
  ];
}

/**
 * The prefix every free question shares, so processing it while the learner
 * reads the lesson takes it out of the first question's wait. P5 measured
 * about 70 tokens reused this way.
 */
export function warmUpMessages(): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: PASSAGE_HEADER },
  ];
}

/**
 * After every stored hint has been shown and the exercise is still open.
 * The hints are the passage; the instruction asks for one further step.
 */
export function exerciseHelpMessages(exercise: Pick<PackageExercise, 'prompt' | 'hints'>): ChatMessage[] {
  const q = [exercise.prompt.text, exercise.prompt.tex].filter(Boolean).join('\n');
  const hints = exercise.hints.map((h, i) => `${i + 1}. ${h}`).join('\n');
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content:
        `Exercise: ${q}\n\nThe student has already seen these hints and is still stuck:\n${hints}\n\n` +
        'Give the next step of the working in one or two sentences. Do not state the final answer.',
    },
  ];
}

/**
 * A segment cut by the cap may end inside a formula: an opening \\[, \\( or $
 * with no closer. Left in place it shows as raw text and stops KaTeX from
 * rendering everything after it, so for display the fragment is dropped
 * from the opener onwards. The stored text is never changed.
 */
export function dropUnclosedMath(text: string): string {
  const openers: Array<[RegExp, RegExp]> = [
    [/\\\[/g, /\\\]/g],
    [/\\\(/g, /\\\)/g],
  ];
  let t = text;
  for (const [open, close] of openers) {
    const opens = [...t.matchAll(open)].map(m => m.index ?? -1);
    const closes = [...t.matchAll(close)].map(m => m.index ?? -1);
    const lastOpen = opens.length ? opens[opens.length - 1] : -1;
    const lastClose = closes.length ? closes[closes.length - 1] : -1;
    if (lastOpen > lastClose) {
      t = t.slice(0, lastOpen).trimEnd();
    }
  }
  // An odd number of $ signs means the last one opened a formula.
  const dollars = [...t.matchAll(/\$/g)].map(m => m.index ?? -1);
  if (dollars.length % 2 === 1) {
    t = t.slice(0, dollars[dollars.length - 1]).trimEnd();
  }
  return t;
}

/**
 * Text cut by the token cap ends mid-word. For display, end it at the last
 * complete sentence when that keeps most of the newest part (from
 * `tailStart`, the point where the last continuation began); otherwise mark
 * the cut with an ellipsis. The stored text is never trimmed, and a
 * continuation resumes from the untrimmed text.
 */
export function displayCut(text: string, tailStart = 0): { text: string; trimmed: boolean } {
  const t = dropUnclosedMath(text).trimEnd();
  const from = Math.min(tailStart, t.length);
  let end = -1;
  for (const m of t.slice(from).matchAll(/[.!?](?=\s|$)/g)) {
    end = from + (m.index ?? 0);
  }
  const tailLength = t.length - from;
  if (end >= 0 && end + 1 - from >= tailLength * 0.6) {
    return { text: t.slice(0, end + 1), trimmed: end + 1 < t.length };
  }
  return { text: `${t}…`, trimmed: true };
}

export function promptTokens(messages: ChatMessage[]): number {
  // Chat-template overhead is about five tokens per message on Qwen2.
  return messages.reduce((n, m) => n + estimateTokens(m.content) + 5, 0);
}

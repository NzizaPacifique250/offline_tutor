/**
 * Turns a package lesson, with its examples and exercises, into the block
 * model the renderer draws. Example references are resolved inline in the
 * position the lesson author put them; exercises are appended after the
 * lesson text in their stored order, each carrying its ordered hints.
 *
 * Pure function: unit-tested without a database or a WebView.
 */

import type { Lesson, LessonBlock } from '../lesson';
import type { PackageExample, PackageExercise, PackageLesson, PackageManifest } from './types';

export function toLesson(
  manifest: Pick<PackageManifest, 'unit' | 'unit_title' | 'source'>,
  lesson: PackageLesson,
  examples: PackageExample[],
  exercises: PackageExercise[],
): Lesson {
  const byId = new Map(examples.map(e => [e.id, e]));
  const blocks: LessonBlock[] = [];

  for (const b of lesson.blocks) {
    if (b.kind === 'p') {
      blocks.push({ kind: 'p', text: b.text });
    } else if (b.kind === 'math') {
      blocks.push({ kind: 'math', tex: b.tex });
    } else {
      const ex = byId.get(b.ref);
      if (ex) {
        blocks.push({
          kind: 'example',
          label: ex.source_label,
          pages: ex.pages,
          question: ex.question,
          steps: ex.steps,
          answerTex: ex.answer_tex,
        });
      }
    }
  }

  const order = new Map(lesson.exercises.map((id, i) => [id, i]));
  const ordered = [...exercises]
    .filter(q => order.has(q.id))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  for (const q of ordered) {
    blocks.push({
      kind: 'exercise',
      id: q.id,
      label: q.source_label,
      pages: q.pages,
      difficulty: q.difficulty,
      prompt: q.prompt,
      hints: q.hints,
      solution: q.solution,
      answerTex: q.answer.display_tex,
    });
  }

  const [first, last] = [lesson.pages[0], lesson.pages[lesson.pages.length - 1]];
  return {
    id: lesson.id,
    unit: manifest.unit,
    title: lesson.title,
    objective: lesson.objective,
    source: manifest.source.student_book,
    pages: `Unit ${manifest.unit}, pages ${first}–${last}`,
    blocks,
  };
}

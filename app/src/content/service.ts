/**
 * Read side of the content layer: keyed lookups over the imported package.
 *
 * Everything here is a primary-key or indexed query, which is what keeps
 * reviewed content inside the 2-second target on the tablet. There is no text
 * search in the pilot; the topic router works from the lessons' topic lists.
 */

import type { DB } from '@op-engineering/op-sqlite';
import type { PackageExample, PackageExercise, PackageLesson, Review } from './types';

type Reader = { execute: DB['execute'] };

export type ContentVersion = {
  packageId: string;
  version: string;
  unit: number;
  unitTitle: string;
  attribution: string;
  importedAt: string;
};

export type LessonSummary = {
  id: string;
  packageId: string;
  title: string;
  objective: string;
  topics: string[];
  exerciseCount: number;
  reviewStatus: Review['status'];
};

function review(status: string): Review {
  return { status: status as Review['status'], reviewed_by: null, date: null };
}

function parse<T>(text: unknown): T {
  return JSON.parse(String(text)) as T;
}

export async function getContentVersions(db: Reader): Promise<ContentVersion[]> {
  const res = await db.execute(
    'SELECT package_id, version, unit, unit_title, attribution, imported_at FROM content_version ORDER BY unit',
  );
  return res.rows.map(r => ({
    packageId: String(r.package_id),
    version: String(r.version),
    unit: Number(r.unit),
    unitTitle: String(r.unit_title),
    attribution: String(r.attribution),
    importedAt: String(r.imported_at),
  }));
}

export async function listLessons(db: Reader): Promise<LessonSummary[]> {
  const res = await db.execute(
    'SELECT id, package_id, title, objective, topics, exercise_ids, review_status FROM lessons ORDER BY package_id, position',
  );
  return res.rows.map(r => ({
    id: String(r.id),
    packageId: String(r.package_id),
    title: String(r.title),
    objective: String(r.objective),
    topics: parse<string[]>(r.topics),
    exerciseCount: parse<string[]>(r.exercise_ids).length,
    reviewStatus: String(r.review_status) as Review['status'],
  }));
}

export async function getLesson(db: Reader, id: string): Promise<PackageLesson | null> {
  const res = await db.execute('SELECT * FROM lessons WHERE id = ?', [id]);
  const r = res.rows[0];
  if (!r) {
    return null;
  }
  return {
    id: String(r.id),
    title: String(r.title),
    tg_lessons: parse<string[]>(r.tg_lessons),
    objective: String(r.objective),
    pages: [Number(r.page_first), Number(r.page_last)],
    topics: parse<string[]>(r.topics),
    blocks: parse<PackageLesson['blocks']>(r.blocks),
    exercises: parse<string[]>(r.exercise_ids),
    review: review(String(r.review_status)),
  };
}

export async function getExamples(db: Reader, lessonId: string): Promise<PackageExample[]> {
  const res = await db.execute('SELECT * FROM examples WHERE lesson_id = ? ORDER BY id', [lessonId]);
  return res.rows.map(r => ({
    id: String(r.id),
    lesson: String(r.lesson_id),
    pages: [Number(r.page_first), Number(r.page_last)],
    source_label: String(r.source_label),
    question: parse<PackageExample['question']>(r.question),
    steps: parse<PackageExample['steps']>(r.steps),
    answer_tex: String(r.answer_tex),
    review: review(String(r.review_status)),
  }));
}

export async function getExercises(db: Reader, lessonId: string): Promise<PackageExercise[]> {
  const res = await db.execute('SELECT * FROM exercises WHERE lesson_id = ? ORDER BY position', [lessonId]);
  return res.rows.map(r => ({
    id: String(r.id),
    lesson: String(r.lesson_id),
    pages: [Number(r.page_first), Number(r.page_last)],
    source_label: String(r.source_label),
    difficulty: String(r.difficulty) as PackageExercise['difficulty'],
    prompt: parse<PackageExercise['prompt']>(r.prompt),
    answer: parse<PackageExercise['answer']>(r.answer),
    hints: parse<string[]>(r.hints),
    solution: parse<PackageExercise['solution']>(r.solution),
    review: review(String(r.review_status)),
  }));
}

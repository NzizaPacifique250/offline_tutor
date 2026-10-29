/**
 * Loads bundled curriculum packages into SQLite.
 *
 * Runs at every launch and is idempotent: a bundled package is imported only
 * when it is newer than the version recorded in content_version, and then
 * replaces its own rows inside one transaction, so a crash mid-import never
 * leaves a half-loaded unit. A newer version installed as a lesson update
 * (src/updates/) is kept over an older bundled one. Rich fields (blocks, steps, hints) are
 * stored as JSON text; the pilot looks content up by ID and lesson, never
 * inside those fields, so a relational breakdown would buy nothing yet.
 */

import type { DB } from '@op-engineering/op-sqlite';
import type { ContentPackage } from './types';
import { isNewer } from './version';

export const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS content_version (
     package_id  TEXT PRIMARY KEY,
     version     TEXT NOT NULL,
     unit        INTEGER NOT NULL,
     unit_title  TEXT NOT NULL,
     attribution TEXT NOT NULL,
     imported_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE TABLE IF NOT EXISTS lessons (
     id            TEXT PRIMARY KEY,
     package_id    TEXT NOT NULL,
     position      INTEGER NOT NULL,
     title         TEXT NOT NULL,
     objective     TEXT NOT NULL,
     tg_lessons    TEXT NOT NULL,
     page_first    INTEGER NOT NULL,
     page_last     INTEGER NOT NULL,
     topics        TEXT NOT NULL,
     blocks        TEXT NOT NULL,
     exercise_ids  TEXT NOT NULL,
     review_status TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS examples (
     id            TEXT PRIMARY KEY,
     lesson_id     TEXT NOT NULL,
     page_first    INTEGER NOT NULL,
     page_last     INTEGER NOT NULL,
     source_label  TEXT NOT NULL,
     question      TEXT NOT NULL,
     steps         TEXT NOT NULL,
     answer_tex    TEXT NOT NULL,
     review_status TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS exercises (
     id            TEXT PRIMARY KEY,
     lesson_id     TEXT NOT NULL,
     position      INTEGER NOT NULL,
     page_first    INTEGER NOT NULL,
     page_last     INTEGER NOT NULL,
     source_label  TEXT NOT NULL,
     difficulty    TEXT NOT NULL,
     prompt        TEXT NOT NULL,
     answer        TEXT NOT NULL,
     hints         TEXT NOT NULL,
     solution      TEXT NOT NULL,
     review_status TEXT NOT NULL
   )`,
  'CREATE INDEX IF NOT EXISTS idx_lessons_package ON lessons(package_id)',
  'CREATE INDEX IF NOT EXISTS idx_examples_lesson ON examples(lesson_id)',
  'CREATE INDEX IF NOT EXISTS idx_exercises_lesson ON exercises(lesson_id)',
];

export type ImportAction = 'imported' | 'up-to-date' | 'kept-newer';

export type ImportReport = {
  packageId: string;
  version: string;
  action: ImportAction;
  lessons: number;
  examples: number;
  exercises: number;
};

/** The subset of the op-sqlite API the importer needs, so tests can fake it. */
export type Executor = {
  execute: DB['execute'];
};

type Transactor = Executor & {
  transaction: (fn: (tx: Executor) => Promise<void>) => Promise<void>;
};

export async function ensureSchema(db: Executor): Promise<void> {
  for (const statement of SCHEMA) {
    await db.execute(statement);
  }
}

export async function recordedVersion(db: Executor, packageId: string): Promise<string | null> {
  const res = await db.execute('SELECT version FROM content_version WHERE package_id = ?', [packageId]);
  const row = res.rows[0] as { version?: string } | undefined;
  return row?.version ?? null;
}

function pages(p: number[]): [number, number] {
  return [p[0], p[p.length - 1]];
}

async function writePackage(tx: Executor, pkg: ContentPackage): Promise<void> {
  const { manifest } = pkg;

  // Remove this package's previous rows only; other units are untouched.
  await tx.execute(
    'DELETE FROM examples WHERE lesson_id IN (SELECT id FROM lessons WHERE package_id = ?)',
    [manifest.id],
  );
  await tx.execute(
    'DELETE FROM exercises WHERE lesson_id IN (SELECT id FROM lessons WHERE package_id = ?)',
    [manifest.id],
  );
  await tx.execute('DELETE FROM lessons WHERE package_id = ?', [manifest.id]);

  for (const [position, lesson] of pkg.lessons.entries()) {
    const [first, last] = pages(lesson.pages);
    await tx.execute(
      `INSERT INTO lessons (id, package_id, position, title, objective, tg_lessons, page_first, page_last,
                            topics, blocks, exercise_ids, review_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lesson.id, manifest.id, position, lesson.title, lesson.objective,
        JSON.stringify(lesson.tg_lessons), first, last, JSON.stringify(lesson.topics),
        JSON.stringify(lesson.blocks), JSON.stringify(lesson.exercises), lesson.review.status,
      ],
    );
  }
  for (const ex of pkg.examples) {
    const [first, last] = pages(ex.pages);
    await tx.execute(
      `INSERT INTO examples (id, lesson_id, page_first, page_last, source_label, question, steps, answer_tex, review_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ex.id, ex.lesson, first, last, ex.source_label, JSON.stringify(ex.question),
        JSON.stringify(ex.steps), ex.answer_tex, ex.review.status,
      ],
    );
  }
  for (const [position, q] of pkg.exercises.entries()) {
    const [first, last] = pages(q.pages);
    await tx.execute(
      `INSERT INTO exercises (id, lesson_id, position, page_first, page_last, source_label, difficulty,
                              prompt, answer, hints, solution, review_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        q.id, q.lesson, position, first, last, q.source_label, q.difficulty,
        JSON.stringify(q.prompt), JSON.stringify(q.answer), JSON.stringify(q.hints),
        JSON.stringify(q.solution), q.review.status,
      ],
    );
  }
  await tx.execute(
    `INSERT INTO content_version (package_id, version, unit, unit_title, attribution, imported_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(package_id) DO UPDATE SET
       version = excluded.version, unit = excluded.unit, unit_title = excluded.unit_title,
       attribution = excluded.attribution, imported_at = excluded.imported_at`,
    [manifest.id, manifest.version, manifest.unit, manifest.unit_title, manifest.attribution],
  );
}

/** Replace one package's lessons, examples and exercises, in one transaction. */
export async function importPackage(db: Transactor, pkg: ContentPackage): Promise<void> {
  await db.transaction(async tx => {
    await writePackage(tx, pkg);
  });
}

/**
 * Import every bundled package that is missing or older than the version
 * installed. Returns one report line per package.
 */
export async function importPackages(db: Transactor, packages: ContentPackage[]): Promise<ImportReport[]> {
  await ensureSchema(db);
  const reports: ImportReport[] = [];
  for (const pkg of packages) {
    const { manifest } = pkg;
    const counts = {
      lessons: pkg.lessons.length,
      examples: pkg.examples.length,
      exercises: pkg.exercises.length,
    };
    const have = await recordedVersion(db, manifest.id);
    if (!isNewer(manifest.version, have)) {
      const action: ImportAction = have === manifest.version ? 'up-to-date' : 'kept-newer';
      reports.push({ packageId: manifest.id, version: have ?? manifest.version, action, ...counts });
      continue;
    }
    await importPackage(db, pkg);
    reports.push({ packageId: manifest.id, version: manifest.version, action: 'imported', ...counts });
  }
  return reports;
}

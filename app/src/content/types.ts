/**
 * Curriculum package types, mirroring docs/CURRICULUM_PACKAGE_FORMAT.md.
 *
 * The JSON is validated by tools/validate_package.py before it is bundled, so
 * these types describe data that has already been proven well-formed.
 */

export type ReviewStatus = 'developer-test' | 'teacher-reviewed';

export type Review = {
  status: ReviewStatus;
  reviewed_by: string | null;
  date: string | null;
};

/** Prose, TeX, or both. Prose is plain text; TeX is rendered in display mode. */
export type Rich = {
  text?: string;
  tex?: string;
};

export type PackageManifest = {
  id: string;
  version: string;
  curriculum: string;
  unit: number;
  unit_title: string;
  source: {
    student_book: string;
    teacher_guide: string;
    pages: [number, number];
  };
  attribution: string;
  review: Review;
  files: { lessons: string; examples: string; exercises: string };
};

export type PackageLessonBlock =
  /** `topics`, optional, names which of the lesson's topics this paragraph teaches; the guidance passage selector prefers it. */
  | { kind: 'p'; text: string; topics?: string[] }
  | { kind: 'math'; tex: string }
  | { kind: 'example'; ref: string };

export type PackageLesson = {
  id: string;
  title: string;
  tg_lessons: string[];
  objective: string;
  pages: number[];
  topics: string[];
  blocks: PackageLessonBlock[];
  exercises: string[];
  review: Review;
};

export type PackageExample = {
  id: string;
  lesson: string;
  pages: number[];
  source_label: string;
  question: Rich;
  steps: Rich[];
  answer_tex: string;
  review: Review;
};

export type AnswerKey = {
  check: string;
  expected: string;
  check_args: Record<string, unknown>;
  accepted?: string[];
  display_tex: string;
  input: 'expression' | 'number' | 'pair' | 'choice';
};

export type Difficulty = 'basic' | 'intermediate' | 'advanced';

export type PackageExercise = {
  id: string;
  lesson: string;
  pages: number[];
  source_label: string;
  difficulty: Difficulty;
  prompt: Rich;
  answer: AnswerKey;
  hints: string[];
  solution: Rich[];
  review: Review;
};

export type ContentPackage = {
  manifest: PackageManifest;
  lessons: PackageLesson[];
  examples: PackageExample[];
  exercises: PackageExercise[];
};

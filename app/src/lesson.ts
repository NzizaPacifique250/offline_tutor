/**
 * The block model the lesson renderer draws.
 *
 * Content arrives here from the imported curriculum package through
 * content/toLesson.ts; nothing is hand-written in the application any more.
 * TeX fields are rendered by KaTeX in display mode; text fields are prose.
 */

export type Rich = { text?: string; tex?: string };

export type LessonBlock =
  | { kind: 'p'; text: string }
  | { kind: 'math'; tex: string }
  | {
      kind: 'example';
      label: string;
      pages: number[];
      question: Rich;
      steps: Rich[];
      answerTex: string;
    }
  | {
      kind: 'exercise';
      id: string;
      label: string;
      pages: number[];
      difficulty: 'basic' | 'intermediate' | 'advanced';
      prompt: Rich;
      hints: string[];
      solution: Rich[];
      answerTex: string;
    };

export type Lesson = {
  id: string;
  unit: number;
  title: string;
  objective?: string;
  source: string;
  pages: string;
  blocks: LessonBlock[];
};

/**
 * Renders a lesson with KaTeX inside a WebView, entirely from local assets.
 *
 * The page machinery (local KaTeX, auto-height, render report) lives in
 * src/katex/. This file builds the lesson body: prose, display mathematics,
 * worked examples inline, and any exercises hint-first, with each hint and
 * the solution behind a closed <details> in their stored order so nothing
 * beyond the prompt is visible until the student opens it.
 *
 * In the study flow the lesson screen passes a lesson without exercises,
 * because practice happens on its own screen with answer checking; the
 * developer screen still renders the full lesson as the P3 regression check.
 */

import React, { useMemo } from 'react';
import { KatexView } from './katex/KatexView';
import { escapeHtml, math, pageHtml, pagesLabel, rich, stepsHtml } from './katex/page';
import type { Lesson, LessonBlock } from './lesson';

function blockHtml(b: LessonBlock): string {
  switch (b.kind) {
    case 'p':
      return `<p>${escapeHtml(b.text)}</p>`;
    case 'math':
      return math(b.tex);
    case 'example':
      return (
        `<div class="example"><div class="q">${escapeHtml(b.label)} <span class="pg">(${pagesLabel(b.pages)})</span></div>` +
        rich(b.question) +
        stepsHtml(b.steps, b.answerTex) +
        '</div>'
      );
    case 'exercise':
      return (
        `<div class="exercise" data-id="${escapeHtml(b.id)}">` +
        `<div class="q">${escapeHtml(b.label)} <span class="pg">(${pagesLabel(b.pages)}) · ${escapeHtml(b.difficulty)}</span></div>` +
        rich(b.prompt) +
        b.hints
          .map((h, i) => `<details><summary>Hint ${i + 1} of ${b.hints.length}</summary><p>${escapeHtml(h)}</p></details>`)
          .join('') +
        `<details class="sol"><summary>Solution</summary>${stepsHtml(b.solution, b.answerTex)}</details>` +
        '</div>'
      );
  }
}

export function lessonHtml(lesson: Lesson): string {
  const counts = lesson.blocks.reduce(
    (n, b) => {
      if (b.kind === 'example') {
        n.examples += 1;
      } else if (b.kind === 'exercise') {
        n.exercises += 1;
        n.hints += b.hints.length;
      }
      return n;
    },
    { examples: 0, exercises: 0, hints: 0 },
  );
  const body =
    `<h1>${escapeHtml(lesson.title)}</h1>\n` +
    `<div class="src">${escapeHtml(lesson.source)}, ${escapeHtml(lesson.pages)}</div>\n` +
    (lesson.objective ? `<div class="obj">Objective: ${escapeHtml(lesson.objective)}</div>\n` : '') +
    lesson.blocks.map(blockHtml).join('\n');
  return pageHtml(body, {
    statusNote: `${counts.examples} example(s), ${counts.exercises} exercise(s), ${counts.hints} hint(s)`,
    showStatus: true,
  });
}

export function LessonView({
  lesson,
  onStatus,
}: {
  lesson: Lesson;
  onStatus?: (message: string) => void;
}): React.JSX.Element {
  const html = useMemo(() => lessonHtml(lesson), [lesson]);
  return <KatexView html={html} onStatus={onStatus} caption="Rendered from local assets. No network is used." />;
}

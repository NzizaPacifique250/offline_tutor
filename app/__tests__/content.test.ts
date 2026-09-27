/**
 * The content layer's pure parts, tested against the real bundled package so a
 * change to the package that breaks routing or rendering order fails here
 * before it reaches the tablet.
 */

import { importPackages } from '../src/content/importer';
import { PACKAGES } from '../src/content/packages';
import { routeQuestion } from '../src/content/router';
import { toLesson } from '../src/content/toLesson';
import { lessonHtml } from '../src/LessonView';

const { __makeDb } = require('../jest/opsqlite-mock');

const u1 = PACKAGES[0];
const lesson = u1.lessons[0];

describe('bundled package', () => {
  it('is the Unit 1 package with the expected shape', () => {
    expect(PACKAGES).toHaveLength(1);
    expect(u1.manifest.id).toBe('rw-s6-am.u1');
    expect(u1.lessons).toHaveLength(1);
    expect(u1.examples).toHaveLength(2);
    expect(u1.exercises).toHaveLength(5);
    expect(lesson.exercises).toEqual(u1.exercises.map(q => q.id));
  });
});

describe('routeQuestion (the scope gate)', () => {
  const lessons = u1.lessons.map(l => ({ id: l.id, topics: l.topics }));

  it.each([
    'How do I multiply (3 + 4i) by (2 - i)?',
    'What is the conjugate of 12 - 4i?',
    'add 3 + 2i and 1 - 4i',
    'Find the product of two complex numbers',
  ])('routes an in-scope question to the operations lesson: %s', q => {
    const r = routeQuestion(q, lessons);
    expect(r?.lessonId).toBe('rw-s6-am.u1.l07');
    expect(r?.matched.length).toBeGreaterThan(0);
  });

  it.each([
    'Find the equation of the tangent to the parabola y^2 = 8x at (2, 4).',
    'Explain the light-dependent reactions of photosynthesis.',
    'What is the capital city of France?',
    '',
  ])('declines what the package does not cover: %s', q => {
    expect(routeQuestion(q, lessons)).toBeNull();
  });

  it('matches whole words only, so "address" is not "add"', () => {
    expect(routeQuestion('What is your address?', lessons)).toBeNull();
  });

  it('prefers the more specific multi-word keyword', () => {
    const r = routeQuestion('multiplication of complex numbers', lessons);
    expect(r?.matched).toContain('multiplication of complex numbers');
    expect(r?.score).toBeGreaterThan(1);
  });
});

describe('toLesson (package to renderer blocks)', () => {
  const rendered = toLesson(u1.manifest, lesson, u1.examples, u1.exercises);

  it('keeps the lesson blocks in order and resolves example references inline', () => {
    const kinds = rendered.blocks.map(b => b.kind);
    const firstExample = kinds.indexOf('example');
    expect(firstExample).toBeGreaterThan(0);
    expect(kinds[0]).toBe('p');
    const ex = rendered.blocks[firstExample];
    expect(ex.kind === 'example' && ex.label).toBe('Example 1.16');
  });

  it('appends the exercises after the lesson text, in the lesson order, with their hints', () => {
    const exercises = rendered.blocks.filter(b => b.kind === 'exercise');
    expect(exercises).toHaveLength(5);
    expect(exercises.map(b => b.kind === 'exercise' && b.id)).toEqual(lesson.exercises);
    const lastLessonBlock = rendered.blocks.findIndex(b => b.kind === 'exercise');
    expect(rendered.blocks.slice(lastLessonBlock).every(b => b.kind === 'exercise')).toBe(true);
    expect(exercises[0].kind === 'exercise' && exercises[0].hints).toHaveLength(3);
  });

  it('drops a reference to an example that does not exist rather than crashing', () => {
    const broken = { ...lesson, blocks: [...lesson.blocks, { kind: 'example' as const, ref: 'rw-s6-am.u1.ex.99' }] };
    const out = toLesson(u1.manifest, broken, u1.examples, u1.exercises);
    expect(out.blocks.filter(b => b.kind === 'example')).toHaveLength(2);
  });

  it('carries the source and page reference the attribution requires', () => {
    expect(rendered.source).toContain('REB');
    expect(rendered.pages).toBe('Unit 1, pages 13–19');
  });
});

describe('lessonHtml (what the WebView draws)', () => {
  const html = lessonHtml(toLesson(u1.manifest, lesson, u1.examples, u1.exercises));

  it('loads KaTeX only from the local asset directory', () => {
    expect(html).toContain('href="katex.min.css"');
    expect(html).toContain('src="katex.min.js"');
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('draws every exercise hint-first: one closed <details> per hint, then the solution', () => {
    const exercises = html.split('<div class="exercise"').slice(1);
    expect(exercises).toHaveLength(5);
    for (const [i, q] of u1.exercises.entries()) {
      const block = exercises[i];
      expect(block).toContain(`data-id="${q.id}"`);
      expect(block).toContain(q.source_label);
      const hintSummaries = block.match(/<summary>Hint \d+ of \d+<\/summary>/g) ?? [];
      expect(hintSummaries).toHaveLength(q.hints.length);
      expect(block.indexOf('<summary>Solution</summary>')).toBeGreaterThan(block.lastIndexOf('<summary>Hint'));
      expect(block).not.toContain('<details open');
    }
  });

  it('carries the REB attribution and page references on screen', () => {
    expect(html).toContain('Senior Six Student');
    expect(html).toContain('pages 13');
    expect(html).toContain('(p. 15)');
  });

  it('escapes prose so a stray angle bracket cannot inject markup', () => {
    const hostile = toLesson(u1.manifest, { ...lesson, blocks: [{ kind: 'p', text: '<script>alert(1)</script>' }] }, [], []);
    const out = lessonHtml(hostile);
    expect(out).toContain('&lt;script&gt;');
    expect(out.match(/<script>/g)).toHaveLength(1); // only the renderer's own script
  });
});

describe('importPackages', () => {
  it('imports a fresh package inside a transaction and records its version', async () => {
    const db = __makeDb();
    const reports = await importPackages(db, PACKAGES);
    expect(reports).toEqual([
      { packageId: 'rw-s6-am.u1', version: '0.2.0', action: 'imported', lessons: 1, examples: 2, exercises: 5 },
    ]);
    const inserts = db.__log.filter((e: { sql: string }) => /^\s*INSERT INTO (lessons|examples|exercises)/.test(e.sql));
    expect(inserts).toHaveLength(1 + 2 + 5);
    const upsert = db.__log.filter((e: { sql: string }) => /INSERT INTO content_version/.test(e.sql));
    expect(upsert).toHaveLength(1);
  });

  it('is idempotent: the same version is not imported twice', async () => {
    const db = __makeDb();
    await importPackages(db, PACKAGES);
    const before = db.__log.length;
    const again = await importPackages(db, PACKAGES);
    expect(again[0].action).toBe('up-to-date');
    const newInserts = db.__log.slice(before).filter((e: { sql: string }) => /^\s*INSERT/.test(e.sql));
    expect(newInserts).toHaveLength(0);
  });

  it('re-imports when the bundled version changes', async () => {
    const db = __makeDb();
    await importPackages(db, PACKAGES);
    const bumped = [{ ...u1, manifest: { ...u1.manifest, version: '0.3.0' } }];
    const again = await importPackages(db, bumped);
    expect(again[0]).toMatchObject({ action: 'imported', version: '0.3.0' });
  });
});

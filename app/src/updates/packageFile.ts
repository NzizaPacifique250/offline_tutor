/**
 * Reading a lesson package file before anything is installed: the file that
 * tools/export_package.py writes and the admin portal publishes. The package
 * was validated, and its answer keys proven with SymPy, before it was
 * exported; this checks again that the file is complete and consistent, so
 * a damaged or wrong file is refused and the tablet's lessons stay as they
 * were. Pure: no network, no database.
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import type { ContentPackage } from '../content/types';

export const PACKAGE_FORMAT = 'offline-tutor-package';
export const PACKAGE_FORMAT_VERSION = 1;
/** Far above a unit (about 30 kB today); the database allows the same. */
export const MAX_PACKAGE_BYTES = 2_000_000;

export type ReadResult = { ok: true; pkg: ContentPackage } | { ok: false; problem: string };

export function sha256Hex(text: string): string {
  return bytesToHex(sha256(utf8ToBytes(text)));
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isText = (v: unknown): v is string => isStr(v) && v.trim().length > 0;
const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const isPages = (v: unknown) => Array.isArray(v) && (v.length === 1 || v.length === 2) && v.every(n => Number.isInteger(n));
const isRich = (v: unknown) => isObj(v) && (isText(v.text) || isText(v.tex));
const isReview = (v: unknown) => isObj(v) && (v.status === 'developer-test' || v.status === 'teacher-reviewed');

class Problem extends Error {}
function need(condition: unknown, where: string, what: string): asserts condition {
  if (!condition) {
    throw new Problem(`${where}: ${what}`);
  }
}

function checkPackage(doc: Obj): ContentPackage {
  need(doc.format === PACKAGE_FORMAT && doc.format_version === PACKAGE_FORMAT_VERSION, 'file', 'not a lesson package file');
  const m = doc.manifest;
  need(isObj(m), 'manifest', 'missing');
  const id = isStr(m.id) ? /^rw-s6-am\.u(\d+)$/.exec(m.id) : null;
  need(id, 'manifest', 'id must look like rw-s6-am.u4');
  need(isStr(m.version) && /^\d+\.\d+\.\d+$/.test(m.version), 'manifest', 'version must be major.minor.patch');
  need(m.unit === Number(id[1]), 'manifest', "unit does not match the package id");
  need(isText(m.unit_title) && isStr(m.attribution), 'manifest', 'unit_title and attribution are required');
  const unit = String(m.unit);

  const { lessons, examples, exercises } = doc;
  need(Array.isArray(lessons) && lessons.length > 0, 'lessons', 'must be a non-empty list');
  need(Array.isArray(examples), 'examples', 'must be a list');
  need(Array.isArray(exercises) && exercises.length > 0, 'exercises', 'must be a non-empty list');

  const seen = new Set<string>();
  const unique = (v: string, where: string) => {
    need(!seen.has(v), where, `duplicate id ${v}`);
    seen.add(v);
  };
  const lessonIds = new Set<string>();
  for (const l of lessons) {
    need(isObj(l) && isStr(l.id) && new RegExp(`^rw-s6-am\\.u${unit}\\.l\\d{2}$`).test(l.id), 'lesson', `bad id ${isObj(l) ? String(l.id) : ''}`);
    const where = l.id;
    unique(l.id, where);
    lessonIds.add(l.id);
    need(isText(l.title) && isStr(l.objective), where, 'title and objective are required');
    need(isStrList(l.tg_lessons) && isStrList(l.topics) && isStrList(l.exercises), where, 'tg_lessons, topics and exercises must be lists of text');
    need(isPages(l.pages) && isReview(l.review), where, 'pages and review are required');
    need(Array.isArray(l.blocks) && l.blocks.length > 0, where, 'blocks must be a non-empty list');
    for (const b of l.blocks as unknown[]) {
      need(isObj(b) && ((b.kind === 'p' && isText(b.text)) || (b.kind === 'math' && isText(b.tex)) || (b.kind === 'example' && isText(b.ref))), where, 'a block must be a paragraph, a formula or an example reference');
    }
  }
  for (const e of examples) {
    need(isObj(e) && isStr(e.id) && new RegExp(`^rw-s6-am\\.u${unit}\\.ex\\.\\d{2}$`).test(e.id), 'example', `bad id ${isObj(e) ? String(e.id) : ''}`);
    unique(e.id, e.id);
    need(isStr(e.lesson) && lessonIds.has(e.lesson), e.id, 'lesson is not in this package');
    need(isPages(e.pages) && isText(e.source_label) && isRich(e.question), e.id, 'pages, source_label and question are required');
    need(Array.isArray(e.steps) && e.steps.length > 0 && e.steps.every(isRich), e.id, 'steps must be a non-empty list');
    need(isStr(e.answer_tex) && isReview(e.review), e.id, 'answer_tex and review are required');
  }
  const exerciseLesson = new Map<string, string>();
  for (const q of exercises) {
    need(isObj(q) && isStr(q.id) && new RegExp(`^rw-s6-am\\.u${unit}\\.q\\.\\d{3}$`).test(q.id), 'exercise', `bad id ${isObj(q) ? String(q.id) : ''}`);
    const where = q.id;
    unique(q.id, where);
    need(isStr(q.lesson) && lessonIds.has(q.lesson), where, 'lesson is not in this package');
    exerciseLesson.set(q.id, q.lesson);
    need(isPages(q.pages) && isText(q.source_label) && isRich(q.prompt) && isReview(q.review), where, 'pages, source_label, prompt and review are required');
    need(q.difficulty === 'basic' || q.difficulty === 'intermediate' || q.difficulty === 'advanced', where, 'difficulty must be basic, intermediate or advanced');
    const a = q.answer;
    need(isObj(a) && isText(a.check) && isText(a.expected) && isObj(a.check_args) && isStr(a.display_tex), where, 'answer needs check, expected, check_args and display_tex');
    need(a.input === 'expression' || a.input === 'number' || a.input === 'pair' || a.input === 'choice', where, 'answer.input is not known');
    need(a.accepted === undefined || isStrList(a.accepted), where, 'answer.accepted must be a list of text');
    need(Array.isArray(q.hints) && q.hints.length >= 2 && q.hints.every(isText), where, 'hints must be at least two non-empty texts');
    need(Array.isArray(q.solution) && q.solution.length > 0 && q.solution.every(isRich), where, 'solution must be a non-empty list');
  }
  for (const l of lessons as Obj[]) {
    for (const qid of l.exercises as string[]) {
      need(exerciseLesson.get(qid) === l.id, String(l.id), `lists exercise ${qid}, which is not one of its exercises`);
    }
  }
  return {
    manifest: m as unknown as ContentPackage['manifest'],
    lessons: lessons as ContentPackage['lessons'],
    examples: examples as ContentPackage['examples'],
    exercises: exercises as ContentPackage['exercises'],
  };
}

/** Parse and check a package file's text. */
export function readPackageFile(text: string): ReadResult {
  if (text.length > MAX_PACKAGE_BYTES) {
    return { ok: false, problem: 'The file is too large to be a lesson package.' };
  }
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'The file is not a lesson package (not JSON).' };
  }
  if (!isObj(doc)) {
    return { ok: false, problem: 'The file is not a lesson package.' };
  }
  try {
    return { ok: true, pkg: checkPackage(doc) };
  } catch (e) {
    if (e instanceof Problem) {
      return { ok: false, problem: `The package is not complete: ${e.message}.` };
    }
    throw e;
  }
}

/** A downloaded release: the bytes must be exactly what was published, and the package the one announced. */
export function readDownloaded(text: string, expected: { packageId: string; version: string; sha256: string }): ReadResult {
  if (sha256Hex(text) !== expected.sha256) {
    return { ok: false, problem: 'The download is incomplete or changed: its checksum does not match.' };
  }
  const read = readPackageFile(text);
  if (read.ok && (read.pkg.manifest.id !== expected.packageId || read.pkg.manifest.version !== expected.version)) {
    return { ok: false, problem: `The download holds ${read.pkg.manifest.id} v${read.pkg.manifest.version}, not the release announced.` };
  }
  return read;
}

/**
 * Teacher tools: the PIN that keeps them away from learners, the wording of
 * the model's status, installation progress, and the notices the About
 * section must carry. Pure: no React, no native calls.
 */

import { MODEL_BYTES, MODEL_SHA256 } from '../guidance/config';

/**
 * Shared with the teachers and researchers in docs/INSTALLATION_GUIDE.md.
 * It keeps learners out of model installation, exports and developer
 * checks during supervised sessions; it is not a security boundary.
 */
export const TEACHER_PIN = '4821';

export function pinMatches(input: string): boolean {
  return input.trim() === TEACHER_PIN;
}

export type ModelState = 'missing' | 'checked' | 'unchecked' | 'wrong-size';

export function modelState(info: { exists: boolean; bytes: number; verifiedSha256: string }): ModelState {
  if (!info.exists) {
    return 'missing';
  }
  if (info.bytes !== MODEL_BYTES) {
    return 'wrong-size';
  }
  return info.verifiedSha256 === MODEL_SHA256 ? 'checked' : 'unchecked';
}

export function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1e6)} MB`;
}

export function modelStatusText(info: { exists: boolean; bytes: number; verifiedSha256: string }): string {
  switch (modelState(info)) {
    case 'missing':
      return 'Not installed. Learners can still read lessons, practise and see stored hints and solutions; the tutor cannot answer until the model is installed.';
    case 'wrong-size':
      return `A model file is present but has ${info.bytes} bytes instead of ${MODEL_BYTES}. Install it again from the model file.`;
    case 'unchecked':
      return `Installed (${megabytes(info.bytes)}) by a developer tool, so this app has not checked its checksum. Installing it from the model file checks it.`;
    case 'checked':
      return `Installed and checked: ${megabytes(info.bytes)}, SHA-256 ${MODEL_SHA256.slice(0, 12)}…`;
  }
}

export function progressText(p: { phase: string; copied: number; total: number }): string {
  if (p.phase === 'picking') {
    return 'Choose the model file in the window that opened.';
  }
  if (p.phase === 'copying') {
    const of = p.total > 0 ? ` of ${megabytes(p.total)} (${Math.floor((100 * p.copied) / p.total)}%)` : '';
    return `Copying and checking: ${megabytes(p.copied)}${of}. Keep the app open.`;
  }
  return 'Working…';
}

export function installOutcomeText(r: { ok: boolean; reason: string }): string {
  if (r.ok) {
    return 'The tutor model is installed and its checksum matches. The tutor is ready.';
  }
  if (r.reason === 'cancelled') {
    return 'Installation cancelled. Nothing was changed.';
  }
  return `Not installed: ${r.reason}`;
}

/** The notices the pilot build must show (About). */
export const NOTICES: { title: string; text: string }[] = [
  {
    title: 'Curriculum content',
    text: "Lessons, examples and exercises are quoted from the REB Senior Six Advanced Mathematics Student's Book (2020), with credit to the Rwanda Basic Education Board. Each item carries its page reference.",
  },
  {
    title: 'Tutor model',
    text: 'Qwen2.5-Math-1.5B-Instruct by the Qwen team, Alibaba Cloud, used under the Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0), quantised to Q4_K_M.',
  },
  {
    title: 'Software',
    text: 'llama.cpp and llama.rn (MIT), KaTeX (MIT), React Native (MIT), op-sqlite (MIT), react-native-webview (MIT).',
  },
];

/**
 * The one guidance service the application shares. The model is about a
 * gigabyte in memory, so there must never be two contexts open; every
 * screen, including the developer screen, goes through this instance.
 */

import { DEFAULT_MODEL_PATH } from './config';
import { loadLlamaEngine } from './llamaEngine';
import { GuidanceService } from './service';

let shared: GuidanceService | null = null;

export function getGuidanceService(): GuidanceService {
  if (!shared) {
    shared = new GuidanceService(loadLlamaEngine, { modelPath: DEFAULT_MODEL_PATH });
  }
  return shared;
}

/**
 * Lesson updates published from the admin portal (supabase/migrations/0006):
 * which releases this tablet should install. Pure: no network, no database.
 */

import { compareVersions, isNewer } from '../content/version';

export type Release = {
  id: string;
  packageId: string;
  version: string;
  unit: number;
  unitTitle: string;
  lessons: number;
  exercises: number;
  notes: string;
  sha256: string;
  /** The tablets it is for, by install id; empty means every tablet. */
  devices: string[];
  publishedAt: string;
};

export type Installed = { packageId: string; version: string };

/**
 * Releases meant for this tablet that are newer than the unit it holds (a
 * unit it does not have at all counts too): the newest per unit, by unit.
 */
export function pendingUpdates(releases: Release[], installed: Installed[], deviceId: string): Release[] {
  const have = new Map(installed.map(v => [v.packageId, v.version]));
  const best = new Map<string, Release>();
  for (const r of releases) {
    if (r.devices.length > 0 && !r.devices.includes(deviceId)) {
      continue;
    }
    if (!isNewer(r.version, have.get(r.packageId))) {
      continue;
    }
    const current = best.get(r.packageId);
    if (!current || compareVersions(r.version, current.version) > 0) {
      best.set(r.packageId, r);
    }
  }
  return [...best.values()].sort((a, b) => a.unit - b.unit);
}

/** "Complex Numbers (Unit 1): 0.2.0 → 0.3.0 · 1 lesson, 7 exercises" */
export function describeRelease(r: Release, installed?: string): string {
  const from = installed ? `${installed} → ` : 'new unit, ';
  const lessons = `${r.lessons} lesson${r.lessons === 1 ? '' : 's'}`;
  const exercises = `${r.exercises} exercise${r.exercises === 1 ? '' : 's'}`;
  return `${r.unitTitle} (Unit ${r.unit}): ${from}${r.version} · ${lessons}, ${exercises}`;
}

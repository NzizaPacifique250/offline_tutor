/**
 * Checking the server for lesson updates and installing them. The server
 * side is an interface (sync/supabase.ts implements it), so this is tested
 * without a network. A tablet with no internet, or the offline-only build,
 * simply finds nothing; studying never waits for it.
 */

import type { Executor } from '../content/importer';
import { installPackage, type InstallOutcome } from './install';
import { readDownloaded, readPackageFile, sha256Hex } from './packageFile';
import { pendingUpdates, type Installed, type Release } from './releases';

type Transactor = Executor & { transaction: (fn: (tx: Executor) => Promise<void>) => Promise<void> };

export type UpdateRemote = {
  /** Active releases (not withdrawn), without their files. */
  listReleases(): Promise<Release[]>;
  /** A release's file, exactly as published. */
  fetchPackage(releaseId: string): Promise<string>;
};

export async function checkForUpdates(remote: UpdateRemote, installed: Installed[], deviceId: string): Promise<Release[]> {
  return pendingUpdates(await remote.listReleases(), installed, deviceId);
}

export type ReleaseResult = { release: Release; outcome: InstallOutcome | null; problem: string | null };

/** Download, check and install each release in turn; one failing does not stop the others. */
export async function installReleases(db: Transactor, remote: UpdateRemote, releases: Release[]): Promise<ReleaseResult[]> {
  const results: ReleaseResult[] = [];
  for (const release of releases) {
    try {
      const text = await remote.fetchPackage(release.id);
      const read = readDownloaded(text, release);
      if (!read.ok) {
        results.push({ release, outcome: null, problem: read.problem });
        continue;
      }
      const outcome = await installPackage(db, read.pkg, { source: 'online', sha256: release.sha256, releaseId: release.id });
      results.push({ release, outcome, problem: null });
    } catch (e) {
      results.push({ release, outcome: null, problem: (e as Error).message || String(e) });
    }
  }
  return results;
}

export type FileResult = { name: string; sha256: string; outcome: InstallOutcome | null; problem: string | null };

/** A package file copied onto the tablet (the offline route): checked, then installed if newer. */
export async function installFromFile(db: Transactor, name: string, text: string): Promise<FileResult> {
  const sha256 = sha256Hex(text);
  const read = readPackageFile(text);
  if (!read.ok) {
    return { name, sha256, outcome: null, problem: read.problem };
  }
  const outcome = await installPackage(db, read.pkg, { source: 'file', sha256 });
  return { name, sha256, outcome, problem: null };
}

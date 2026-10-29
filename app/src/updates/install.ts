/**
 * Installing a lesson package on this tablet: only a version newer than the
 * one installed, through the content importer (one transaction per unit),
 * with a record of what was installed, from where and when. Learner
 * records live in other tables and are never touched.
 */

import { ensureSchema, importPackage, recordedVersion, type Executor } from '../content/importer';
import type { ContentPackage } from '../content/types';
import { isNewer } from '../content/version';

type Transactor = Executor & { transaction: (fn: (tx: Executor) => Promise<void>) => Promise<void> };

export const UPDATES_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS content_updates (
     id           INTEGER PRIMARY KEY AUTOINCREMENT,
     package_id   TEXT NOT NULL,
     version      TEXT NOT NULL,
     source       TEXT NOT NULL,
     sha256       TEXT NOT NULL,
     release_id   TEXT,
     installed_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
];

export async function ensureUpdatesSchema(db: Executor): Promise<void> {
  for (const statement of UPDATES_SCHEMA) {
    await db.execute(statement);
  }
}

export type InstallSource = { source: 'online' | 'file'; sha256: string; releaseId?: string };

export type InstallOutcome =
  | { result: 'installed'; packageId: string; version: string; replaced: string | null }
  | { result: 'not-newer'; packageId: string; version: string; installed: string };

export async function installPackage(db: Transactor, pkg: ContentPackage, from: InstallSource): Promise<InstallOutcome> {
  await ensureSchema(db);
  await ensureUpdatesSchema(db);
  const { id, version } = pkg.manifest;
  const installed = await recordedVersion(db, id);
  if (!isNewer(version, installed)) {
    return { result: 'not-newer', packageId: id, version, installed: installed ?? version };
  }
  await importPackage(db, pkg);
  await db.execute('INSERT INTO content_updates (package_id, version, source, sha256, release_id) VALUES (?, ?, ?, ?, ?)', [
    id,
    version,
    from.source,
    from.sha256,
    from.releaseId ?? null,
  ]);
  return { result: 'installed', packageId: id, version, replaced: installed };
}

export type InstalledUpdate = { packageId: string; version: string; source: string; installedAt: string };

/** Updates installed on this tablet, the most recent first. */
export async function listInstalledUpdates(db: Executor): Promise<InstalledUpdate[]> {
  await ensureUpdatesSchema(db);
  const res = await db.execute('SELECT package_id, version, source, installed_at FROM content_updates ORDER BY id DESC');
  return res.rows.map(r => ({
    packageId: String(r.package_id),
    version: String(r.version),
    source: String(r.source),
    installedAt: String(r.installed_at),
  }));
}

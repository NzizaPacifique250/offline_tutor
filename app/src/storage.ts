/**
 * Local persistence check (P2 of the development plan).
 *
 * SQLite is the locked storage choice, and this was its first use: one table
 * shaped like an attempts record, one insert, and a count before and after.
 * The count surviving an app restart is the evidence the plan asks for. It
 * shares the database with the content layer.
 *
 * P4 gave the real `attempts` table to the learner store, so this check's
 * table is now `dev_storage_check`; the learner schema renames the P2 table
 * on first run and its rows, and this count, carry on.
 */

import { getDb } from './content/db';
import { DEV_STORAGE_TABLE } from './learner/store';
import type { DB } from '@op-engineering/op-sqlite';

async function countAttempts(d: DB): Promise<number> {
  const res = await d.execute(`SELECT COUNT(*) AS n FROM ${DEV_STORAGE_TABLE}`);
  const row = res.rows[0] as { n?: number } | undefined;
  return Number(row?.n ?? 0);
}

export type StorageCheck = {
  dbPath: string;
  before: number;
  after: number;
  insertId: number;
};

export async function storageCheck(): Promise<StorageCheck> {
  const d = getDb();
  await d.execute(
    `CREATE TABLE IF NOT EXISTS ${DEV_STORAGE_TABLE} (
       id         INTEGER PRIMARY KEY AUTOINCREMENT,
       learner    TEXT NOT NULL,
       probe      TEXT NOT NULL,
       answer     TEXT,
       correct    INTEGER,
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
  );
  const before = await countAttempts(d);
  const ins = await d.execute(
    `INSERT INTO ${DEV_STORAGE_TABLE} (learner, probe, answer, correct) VALUES (?, ?, ?, ?)`,
    ['dev-A', 'cx-01', '11 - 10i', 1],
  );
  const after = await countAttempts(d);
  return {
    dbPath: d.getDbPath(),
    before,
    after,
    insertId: Number(ins.insertId ?? -1),
  };
}

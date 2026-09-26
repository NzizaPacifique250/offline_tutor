/**
 * The one SQLite database the application uses, opened lazily and shared by
 * the content importer, the content service and learner records.
 */

import { open, type DB } from '@op-engineering/op-sqlite';

export const DB_NAME = 'tutor.db';

let db: DB | null = null;

export function getDb(): DB {
  if (!db) {
    db = open({ name: DB_NAME });
  }
  return db;
}

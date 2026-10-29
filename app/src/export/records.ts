/**
 * Research export for the pilot: the learner records, as one CSV file per
 * table plus a manifest, written to Download/ClevoAI/<folder>/ for the
 * researcher to copy off the tablet by USB. Only the tables listed here
 * leave the device; lesson content, the developer check table and the
 * model never do. Records carry learner codes, never names.
 *
 * Pure apart from the executor and the writer it is given.
 */

import type { Executor } from '../learner/store';

/** The tables a research export contains, in the order they are written. */
export const EXPORT_TABLES = ['learners', 'sessions', 'attempts', 'reveals', 'guidance_events', 'content_version'] as const;

/** Writes one file into Download/ClevoAI/<folder>/ and resolves the path shown to the teacher. */
export type ExportWriter = (folder: string, fileName: string, mimeType: string, content: string) => Promise<string>;

export type ExportMeta = Record<string, unknown>;

export type ExportReport = {
  folder: string;
  files: { name: string; rows: number; path: string }[];
};

function cell(v: unknown): string {
  if (v === null || v === undefined) {
    return '';
  }
  const s = typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180 CSV: a header row, CRLF line ends, fields quoted when they need it. */
export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines = [columns.map(cell).join(',')];
  for (const r of rows) {
    lines.push(columns.map(c => cell(r[c])).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

/** A folder name that sorts by time and never collides on one tablet: export-20261020-143005. */
export function exportFolder(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `export-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

async function columnsOf(db: Executor, table: string): Promise<string[]> {
  const res = await db.execute(`PRAGMA table_info(${table})`);
  return res.rows.map(r => String(r.name));
}

async function tableExists(db: Executor, table: string): Promise<boolean> {
  const res = await db.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [table]);
  return res.rows.length > 0;
}

export async function exportRecords(db: Executor, write: ExportWriter, meta: ExportMeta, now = new Date()): Promise<ExportReport> {
  const folder = exportFolder(now);
  const files: ExportReport['files'] = [];
  const counts: Record<string, number> = {};
  for (const table of EXPORT_TABLES) {
    if (!(await tableExists(db, table))) {
      continue;
    }
    const columns = await columnsOf(db, table);
    const res = await db.execute(`SELECT * FROM ${table} ORDER BY rowid`);
    const rows = res.rows as Record<string, unknown>[];
    const name = `${table}.csv`;
    const path = await write(folder, name, 'text/csv', toCsv(columns, rows));
    files.push({ name, rows: rows.length, path });
    counts[table] = rows.length;
  }
  const manifest = { exportedAt: now.toISOString(), folder, tables: counts, ...meta };
  const path = await write(folder, 'manifest.json', 'application/json', `${JSON.stringify(manifest, null, 2)}\n`);
  files.push({ name: 'manifest.json', rows: 0, path });
  return { folder, files };
}

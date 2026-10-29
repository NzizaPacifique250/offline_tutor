export const SETUP_MESSAGE =
  "The database is missing a part this page needs: run the files in supabase/migrations in the Supabase SQL Editor, in order (the latest is 0004_accounts_roles_struggles.sql).";

type DbError = { code?: string; message: string } | null;
type Response = { data: unknown; error: DbError; count?: number | null };

export type Loaded<T> = { data: T; problem: string | null };

// PostgREST: PGRST205 = table not in the schema cache, 42P01 = undefined table,
// PGRST202 = function not found, 42703 = undefined column.
function describe(error: DbError): string | null {
  if (!error) return null;
  if (error.code === "PGRST205" || error.code === "42P01" || error.code === "PGRST202" || error.code === "42703") {
    return SETUP_MESSAGE;
  }
  return error.message;
}

// The query builders are untyped (no generated database types), so the caller
// states the row type it expects; the schema is the contract.
export async function rows<T>(query: PromiseLike<Response>): Promise<Loaded<T[]>> {
  const { data, error } = await query;
  return { data: (data as T[] | null) ?? [], problem: describe(error) };
}

export async function count(query: PromiseLike<Response>): Promise<Loaded<number>> {
  const { count: n, error } = await query;
  return { data: n ?? 0, problem: describe(error) };
}

// PostgREST returns at most 1000 rows per request; read page by page.
export async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<Response>,
  maxPages = 20,
): Promise<Loaded<T[]>> {
  const size = 1000;
  const all: T[] = [];
  for (let i = 0; i < maxPages; i++) {
    const { data, problem } = await rows<T>(page(i * size, i * size + size - 1));
    if (problem) return { data: all, problem };
    all.push(...data);
    if (data.length < size) break;
  }
  return { data: all, problem: null };
}

// First problem among several loads, so a page can show one message.
export function firstProblem(...loads: Loaded<unknown>[]): string | null {
  return loads.find((l) => l.problem)?.problem ?? null;
}

/**
 * The Supabase side of sign-in (account/auth.ts AuthRemote), sync
 * (sync/engine.ts SyncRemote) and lesson updates (updates/updater.ts
 * UpdateRemote), over supabase-js.
 *
 * The client keeps no session of its own: the tablet stores each account's
 * refresh token (account/store.ts) and the sync engine resumes one account
 * at a time. A request that cannot reach the server becomes an OfflineError,
 * so sign-in can fall back to the tablet and sync can wait for the next run.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AuthError, OfflineError, type AuthRemote, type RemoteProfile } from '../account/auth';
import type { Role } from '../account/store';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';
import type { SyncRemote } from './engine';
import type { Release } from '../updates/releases';
import type { UpdateRemote } from '../updates/updater';

let client: SupabaseClient | null = null;

function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}

/** fetch failures surface as a TypeError, or as an auth error with status 0. */
function offline(e: { name?: string; message?: string; status?: number } | null | undefined): boolean {
  if (!e) {
    return false;
  }
  return e.name === 'AuthRetryableFetchError' || e.status === 0 || /network request failed|failed to fetch|fetch failed|timed? ?out/i.test(e.message ?? '');
}

function fail(e: { name?: string; message?: string; status?: number }): never {
  if (offline(e)) {
    throw new OfflineError('No internet connection.');
  }
  throw new AuthError(/invalid login credentials/i.test(e.message ?? '') ? 'Wrong email or password.' : e.message ?? 'The server refused the request.');
}

export const supabaseAuth: AuthRemote = {
  async signUp(email, password, meta) {
    const { data, error } = await supabase()
      .auth.signUp({ email, password, options: { data: { full_name: meta.fullName, requested_role: meta.requestedRole } } })
      .catch(e => ({ data: null, error: e }));
    if (error || !data?.user) {
      fail(error ?? { message: 'The server returned no account.' });
    }
    return { userId: data.user.id, refreshToken: data.session?.refresh_token ?? null };
  },

  async signIn(email, password) {
    const { data, error } = await supabase()
      .auth.signInWithPassword({ email, password })
      .catch(e => ({ data: null, error: e }));
    if (error || !data?.session) {
      fail(error ?? { message: 'The server returned no session.' });
    }
    return { userId: data.session.user.id, refreshToken: data.session.refresh_token };
  },

  async profile(userId): Promise<RemoteProfile | null> {
    const { data, error } = await supabase()
      .from('profiles')
      .select('role, requested_role, full_name, learner_code')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) {
      return null;
    }
    return { role: data.role as Role, requestedRole: data.requested_role, fullName: data.full_name, learnerCode: data.learner_code };
  },
};

export const supabaseSync: SyncRemote = {
  async resume(refreshToken) {
    const { data, error } = await supabase()
      .auth.refreshSession({ refresh_token: refreshToken })
      .catch(e => ({ data: null, error: e }));
    if (error || !data?.session) {
      fail(error ?? { message: 'The account must sign in again.' });
    }
    return { userId: data.session.user.id, refreshToken: data.session.refresh_token };
  },

  async upsert(table, rows, onConflict) {
    const { error } = await supabase().from(table).upsert(rows, { onConflict });
    if (error) {
      if (offline(error)) {
        throw new OfflineError('No internet connection.');
      }
      throw new Error(`${table}: ${error.message}`);
    }
  },
};

type ReleaseRow = {
  id: string;
  package_id: string;
  version: string;
  unit: number;
  unit_title: string;
  lessons: number;
  exercises: number;
  notes: string;
  sha256: string;
  devices: string[] | null;
  published_at: string;
};

/**
 * Releases are readable without an account. Withdrawn ones are filtered here
 * too, because an admin account that synced on this tablet could otherwise
 * see them. A project without the releases table (migration 0006 not run)
 * has no updates.
 */
export const supabaseUpdates: UpdateRemote = {
  async listReleases(): Promise<Release[]> {
    const { data, error } = await supabase()
      .from('content_releases')
      .select('id, package_id, version, unit, unit_title, lessons, exercises, notes, sha256, devices, published_at')
      .is('withdrawn_at', null)
      .order('published_at')
      .then(r => r, e => ({ data: null, error: e }));
    if (error) {
      if (error.code === 'PGRST205' || error.code === '42P01') {
        return [];
      }
      fail(error);
    }
    return ((data ?? []) as ReleaseRow[]).map(r => ({
      id: r.id,
      packageId: r.package_id,
      version: r.version,
      unit: r.unit,
      unitTitle: r.unit_title,
      lessons: r.lessons,
      exercises: r.exercises,
      notes: r.notes,
      sha256: r.sha256,
      devices: r.devices ?? [],
      publishedAt: r.published_at,
    }));
  },

  async fetchPackage(releaseId: string): Promise<string> {
    const { data, error } = await supabase()
      .from('content_releases')
      .select('package_text')
      .eq('id', releaseId)
      .maybeSingle()
      .then(r => r, e => ({ data: null, error: e }));
    if (error) {
      fail(error);
    }
    if (!data) {
      throw new Error('That update is no longer available.');
    }
    return (data as { package_text: string }).package_text;
  },
};

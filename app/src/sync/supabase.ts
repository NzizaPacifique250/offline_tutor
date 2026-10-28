/**
 * The Supabase side of sign-in (account/auth.ts AuthRemote) and sync
 * (sync/engine.ts SyncRemote), over supabase-js.
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

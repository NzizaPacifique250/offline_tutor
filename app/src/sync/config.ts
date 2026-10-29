/**
 * Where synced records go, and how often. The publishable key is meant to be
 * shipped in apps: what it can read or write is decided by the row-level
 * security in supabase/migrations, not by keeping it secret. A service-role
 * key must never appear here.
 */

export const SUPABASE_URL = 'https://xthtcewmrjonzelhvmir.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_eDY-FhmdHNW5BHrwEFYkVA_Y4ASIUOf';

/** How often the app tries to sync while it is open. */
export const SYNC_INTERVAL_MS = 2 * 60 * 1000;

/** How often the app looks for lesson updates while it is open (also at start-up). */
export const UPDATE_CHECK_MS = 10 * 60 * 1000;

/** Rows sent per request; a tablet's backlog after weeks offline goes in several. */
export const SYNC_BATCH = 200;

/** PBKDF2 rounds for the offline password check, sized for the IT-801B (Hermes has no JIT). */
export const PASSWORD_ROUNDS = 3000;

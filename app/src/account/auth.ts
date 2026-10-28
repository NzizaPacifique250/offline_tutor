/**
 * Signing in, online first and offline after that.
 *
 * Online, the account is checked by Supabase and its profile (role, learner
 * code) is read and kept on the tablet with an offline password hash. With
 * no internet, an account that has signed in on this tablet before is
 * checked against that hash; any other account has to wait for a connection.
 * Creating an account always needs the internet.
 *
 * The remote side is an interface (sync/supabase.ts implements it), so this
 * logic is tested without a network.
 */

import type { Executor } from '../learner/store';
import { hashPassword, verifyPassword } from './password';
import { findAccountByEmail, saveAccount, type Account, type Role } from './store';

/** The network could not be reached; the caller may fall back to the tablet. */
export class OfflineError extends Error {}

/** The server answered and refused (wrong password, email taken, ...). */
export class AuthError extends Error {}

export type RemoteProfile = { role: Role; requestedRole: 'student' | 'teacher'; fullName: string; learnerCode: string };

export type AuthRemote = {
  /** Resolves with the new user's id; refreshToken is null while the email awaits confirmation. */
  signUp(email: string, password: string, meta: { fullName: string; requestedRole: 'student' | 'teacher' }): Promise<{ userId: string; refreshToken: string | null }>;
  signIn(email: string, password: string): Promise<{ userId: string; refreshToken: string }>;
  /** Null when the profile cannot be read (for example before the database is set up). */
  profile(userId: string): Promise<RemoteProfile | null>;
};

export type SignInResult = { account: Account; online: boolean };

/** The learner code the server's trigger gives an account, for when its profile cannot be read. */
export function codeFor(userId: string, requestedRole: 'student' | 'teacher'): string {
  return `${requestedRole === 'teacher' ? 'T' : 'S'}-${userId.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

export function checkNewAccount(email: string, password: string, fullName: string): string | null {
  if (!fullName.trim()) {
    return 'Enter your name.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return 'Enter a valid email address.';
  }
  if (password.length < 8) {
    return 'Use a password of at least 8 characters.';
  }
  return null;
}

async function keep(
  db: Executor,
  remote: AuthRemote,
  userId: string,
  email: string,
  password: string,
  refreshToken: string | null,
  fallback: { fullName: string; requestedRole: 'student' | 'teacher' },
): Promise<Account> {
  const p = await remote.profile(userId).catch(() => null);
  return saveAccount(db, {
    userId,
    email,
    fullName: p?.fullName || fallback.fullName,
    role: p?.role ?? 'student',
    requestedRole: p?.requestedRole ?? fallback.requestedRole,
    learnerCode: p?.learnerCode ?? codeFor(userId, fallback.requestedRole),
    passwordHash: hashPassword(password),
    refreshToken,
  });
}

export async function signIn(db: Executor, remote: AuthRemote, email: string, password: string): Promise<SignInResult> {
  const address = email.trim().toLowerCase();
  const cached = await findAccountByEmail(db, address);
  try {
    const s = await remote.signIn(address, password);
    const account = await keep(db, remote, s.userId, address, password, s.refreshToken, {
      fullName: cached?.fullName ?? '',
      requestedRole: cached?.requestedRole ?? 'student',
    });
    return { account, online: true };
  } catch (e) {
    if (!(e instanceof OfflineError)) {
      throw e;
    }
    if (!cached) {
      throw new AuthError('No internet, and this account has not signed in on this tablet before. Connect once to sign in.');
    }
    if (!verifyPassword(password, cached.passwordHash)) {
      throw new AuthError('Wrong email or password.');
    }
    return { account: cached, online: false };
  }
}

export type SignUpResult = { kind: 'signed-in'; account: Account } | { kind: 'confirm-email' };

export async function signUp(
  db: Executor,
  remote: AuthRemote,
  input: { email: string; password: string; fullName: string; requestedRole: 'student' | 'teacher' },
): Promise<SignUpResult> {
  const problem = checkNewAccount(input.email, input.password, input.fullName);
  if (problem) {
    throw new AuthError(problem);
  }
  const address = input.email.trim().toLowerCase();
  const meta = { fullName: input.fullName.trim(), requestedRole: input.requestedRole };
  const s = await remote.signUp(address, input.password, meta);
  if (!s.refreshToken) {
    return { kind: 'confirm-email' };
  }
  return { kind: 'signed-in', account: await keep(db, remote, s.userId, address, input.password, s.refreshToken, meta) };
}

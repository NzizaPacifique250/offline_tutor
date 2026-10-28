/**
 * The offline password check. When an account signs in online, the tablet
 * keeps a salted PBKDF2-SHA256 hash of the password, never the password, so
 * the same account can sign in later with no internet.
 *
 * Stored as "pbkdf2-sha256$<rounds>$<salt hex>$<hash hex>". Pure.
 */

import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { PASSWORD_ROUNDS } from '../sync/config';

/**
 * The salt only has to differ between accounts and tablets; Hermes offers no
 * crypto.getRandomValues without a native module, so it mixes the clock with
 * Math.random.
 */
export function newSalt(): string {
  let s = Date.now().toString(16);
  while (s.length < 32) {
    s += Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  }
  return s.slice(0, 32);
}

export function hashPassword(password: string, salt: string = newSalt(), rounds: number = PASSWORD_ROUNDS): string {
  const hash = bytesToHex(pbkdf2(sha256, password, salt, { c: rounds, dkLen: 32 }));
  return `pbkdf2-sha256$${rounds}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, rounds, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2-sha256' || !rounds || !salt || !hash) {
    return false;
  }
  const again = hashPassword(password, salt, Number(rounds)).split('$')[3];
  // Compare every character so the time taken does not depend on where they differ.
  let differences = again.length === hash.length ? 0 : 1;
  for (let i = 0; i < Math.min(again.length, hash.length); i++) {
    differences += again.charCodeAt(i) === hash.charCodeAt(i) ? 0 : 1;
  }
  return differences === 0;
}

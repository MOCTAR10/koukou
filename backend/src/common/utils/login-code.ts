import { randomInt } from 'node:crypto';
import * as bcrypt from 'bcrypt';

/**
 * 8-digit login code handed once to a new or reset account (programme owner
 * activation, institutional account, platform admin reset). Only its bcrypt
 * hash is stored.
 */
export function generateLoginCode(): string {
  return String(randomInt(0, 100_000_000)).padStart(8, '0');
}

/**
 * A new login code and the hash to store (`users.passwordHash`). Shared by
 * every route that hands a code: the code is returned once, never stored;
 * the sessions already open stay valid until they expire.
 */
export async function newLoginCode(): Promise<{ code: string; hash: string }> {
  const code = generateLoginCode();
  return { code, hash: await bcrypt.hash(code, 10) };
}

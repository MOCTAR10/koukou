import { randomInt } from 'node:crypto';

/**
 * 8-digit login code handed once to a new or reset account (programme owner
 * activation, institutional account, platform admin reset). Only its bcrypt
 * hash is stored.
 */
export function generateLoginCode(): string {
  return String(randomInt(0, 100_000_000)).padStart(8, '0');
}

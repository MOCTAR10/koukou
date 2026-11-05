import { createHash, type Hash } from 'node:crypto';

/**
 * Canonical serialization and hash chain of the daily audit seal. Pure and
 * unit-tested: `docs/audit-deploiement.md` documents the same algorithm so an
 * auditor (ANINF) can recompute a seal without this code.
 *
 *   hash(day) = SHA-256(
 *     (prevHash ?? "") + "\n" + day + "\n"
 *     + for each event of the day, by id:      "E " + canonical(row) + "\n"
 *     + for each row change of the day, by id: "R " + canonical(row) + "\n"
 *   )  (UTF-8, lowercase hex)
 *
 * canonical(x) is JSON with object keys sorted (code point order) at every
 * level, no whitespace; rows are read with every value as text (see
 * `AuditSealService`), so the result does not depend on the database driver.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Incremental seal hash: rows are fed in id order, events first. */
export class SealHasher {
  private readonly hash: Hash;
  private phase: 'events' | 'rows' = 'events';
  eventsCount = 0;
  rowChangesCount = 0;

  constructor(prevHash: string | null, day: string) {
    this.hash = createHash('sha256');
    this.hash.update(`${prevHash ?? ''}\n${day}\n`, 'utf8');
  }

  addEvent(row: Record<string, unknown>): void {
    if (this.phase !== 'events') {
      throw new Error('Events must be hashed before row changes.');
    }
    this.hash.update(`E ${canonicalJson(row)}\n`, 'utf8');
    this.eventsCount += 1;
  }

  addRowChange(row: Record<string, unknown>): void {
    this.phase = 'rows';
    this.hash.update(`R ${canonicalJson(row)}\n`, 'utf8');
    this.rowChangesCount += 1;
  }

  digest(): string {
    return this.hash.digest('hex');
  }
}

/** Seal hash of a whole day in one call (tests, small days). */
export function sealHash(
  prevHash: string | null,
  day: string,
  events: Record<string, unknown>[],
  rowChanges: Record<string, unknown>[],
): string {
  const hasher = new SealHasher(prevHash, day);
  for (const row of events) hasher.addEvent(row);
  for (const row of rowChanges) hasher.addRowChange(row);
  return hasher.digest();
}

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` of an instant, in UTC. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addUtcDays(day: string, n: number): string {
  return utcDay(new Date(Date.parse(`${day}T00:00:00.000Z`) + n * DAY_MS));
}

/** [start, end) of a UTC day. */
export function utcDayBounds(day: string): { start: Date; end: Date } {
  const start = new Date(`${day}T00:00:00.000Z`);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/**
 * Last day that may be sealed at `now`: a UTC day is sealed once it has fully
 * elapsed plus a grace period, so a transaction still committing just after
 * midnight is not left out of its day's seal.
 */
export function lastSealableDay(now: Date, graceMs: number): string {
  return utcDay(new Date(now.getTime() - graceMs - DAY_MS));
}

// Africa/Libreville is UTC+1 all year (no daylight saving). The farmer's "day"
// is the Gabon day whatever the browser time zone (a jury abroad, a phone in
// UTC): never derive "today" from `new Date().toISOString()` or local getters.

const OFFSET_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` of the instant in Gabon time. */
export function librevilleDay(at: Date | number | string = new Date()): string {
  const ms = at instanceof Date ? at.getTime() : typeof at === 'number' ? at : Date.parse(at);
  return new Date(ms + OFFSET_MS).toISOString().slice(0, 10);
}

/** Gabon day `days` days before the instant (0 = today). */
export function librevilleDaysBack(days: number, at: Date | number = new Date()): string {
  const ms = at instanceof Date ? at.getTime() : at;
  return librevilleDay(ms - days * DAY_MS);
}

/** Calendar arithmetic on a `YYYY-MM-DD` day, independent of any time zone. */
export function shiftDay(ymd: string, days: number): string {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

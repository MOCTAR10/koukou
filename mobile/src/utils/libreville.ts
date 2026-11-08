// Africa/Libreville is UTC+1 all year (no daylight saving). A farmer's "day"
// (cession, delivery, ledger) is the Gabon day, never the UTC one: between
// 23:00 and 24:00 UTC the two differ.

const OFFSET_MS = 3_600_000;

/** `YYYY-MM-DD` of the instant in Gabon time. */
export function librevilleDay(at: Date | number | string = new Date()): string {
  const ms = at instanceof Date ? at.getTime() : typeof at === 'number' ? at : Date.parse(at);
  return new Date(ms + OFFSET_MS).toISOString().slice(0, 10);
}

/** `HH:mm` of the instant in Gabon time. */
export function librevilleTime(at: Date | number = new Date()): string {
  const ms = at instanceof Date ? at.getTime() : at;
  return new Date(ms + OFFSET_MS).toISOString().slice(11, 16);
}

/** Gabon day `days` days before the instant (0 = today). Gabon has no DST. */
export function librevilleDaysBack(days: number, at: Date | number = new Date()): string {
  const ms = at instanceof Date ? at.getTime() : at;
  return librevilleDay(ms - days * 86_400_000);
}

/** ISO instant written in Gabon time (`…+01:00`): same instant, its date part is the Gabon day. */
export function librevilleIso(at: Date | number = new Date()): string {
  const ms = at instanceof Date ? at.getTime() : at;
  return `${new Date(ms + OFFSET_MS).toISOString().slice(0, 19)}+01:00`;
}

export function isoWeekStart(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  const mondayIndex = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - mondayIndex);
  return d.toISOString().slice(0, 10);
}

/**
 * True when a YYYY-MM-DD date is later than tomorrow (UTC). One day of slack:
 * Gabon is UTC+1, so just after local midnight "today" is still yesterday in
 * UTC.
 */
export function isAfterTomorrowUtc(date: string): boolean {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  return date.slice(0, 10) > tomorrow;
}

/** True for a real calendar day written YYYY-MM-DD (2026-02-30 is not). */
export function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Business time zone: Gabon (UTC+1, no daylight saving). */
export const APP_TIME_ZONE = 'Africa/Libreville';

const LOCAL_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Today's date (YYYY-MM-DD) in Gabon. The server runs in UTC: between local
 * midnight and 01:00 a UTC "today" would still be yesterday for the farms.
 */
export function todayLocal(now: Date = new Date()): string {
  return LOCAL_DAY.format(now);
}

/**
 * Day shown to a reader in a server-written message (« 08 nov. 2026 »), like
 * the web `dateFr`. A bare AAAA-MM-JJ is a calendar day and is never shifted;
 * an instant is read in Gabon time. Unparsable input is returned unchanged.
 */
export function dateFr(value: string | Date | null | undefined): string {
  if (value == null || value === '') return '—';
  const s = value instanceof Date ? value.toISOString() : String(value);
  const withClock = /[T ]\d{2}:\d{2}/.test(s);
  const d = withClock ? new Date(s) : new Date(`${s.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: withClock ? APP_TIME_ZONE : 'UTC',
  });
}

/** Amount in a server-written message: « 975 000 FCFA » (rounded, no -0). */
export function fcfaFr(n: number | string | null | undefined): string {
  const v = Number(n);
  if (n == null || !Number.isFinite(v)) return '—';
  return `${(Math.round(v) || 0).toLocaleString('fr-FR')} FCFA`;
}

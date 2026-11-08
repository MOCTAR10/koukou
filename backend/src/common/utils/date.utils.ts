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

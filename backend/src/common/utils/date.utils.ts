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

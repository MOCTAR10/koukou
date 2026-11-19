/**
 * Business day for the e2e specs. The server reads « today » as the
 * Africa/Libreville calendar day (`todayLocal`), which is already tomorrow
 * between 23:00 and 24:00 UTC. A spec that derives a business date from the
 * clock must use these helpers, never `toISOString().slice(0, 10)` (UTC day).
 *
 * `E2E_FAKE_NOW` (see `e2e-setup.ts`) moves the clock to test that window.
 */
import { todayLocal } from '../../src/common/utils/date.utils.js';

/** Libreville day (YYYY-MM-DD) of an instant. */
export function lvDate(instant: Date = new Date()): string {
  return todayLocal(instant);
}

/** Today in Libreville. */
export function lvToday(): string {
  return todayLocal();
}

/**
 * UTC day `n` days from today. Only for facts the server itself dates in UTC
 * (e.g. the closure day of a band, taken from `closedAt`); everything else is
 * a Libreville day: use `lvDay`.
 */
export function utcDayOf(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * True between 23:00 and 24:00 UTC, when Libreville is already on the next
 * day. Some production readers still date « today » in UTC while others use
 * Libreville (listed in the PR); a spec that cross-checks both can only hold
 * outside that hour and gates itself on this.
 */
export function libervilleAheadOfUtc(): boolean {
  return todayLocal() !== utcDayOf(0);
}

/** Libreville day `n` calendar days from today (negative = past). */
export function lvDay(n: number): string {
  const [y, m, d] = todayLocal().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

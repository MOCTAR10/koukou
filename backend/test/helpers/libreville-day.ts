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

/** Libreville day `n` calendar days from today (negative = past). */
export function lvDay(n: number): string {
  const [y, m, d] = todayLocal().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * Day an order was delivered (POUFA lot A2 divers, audit v3 T3 reserve).
 * A delivery recorded offline reaches the server later: its cession, its
 * delivery date and its ledger entry keep the device's capture, already
 * corrected for clock skew and never in the future (`sync/conflict-rules.ts`
 * `effectiveCapture`), never the day of the sync. No lower bound on the
 * order's creation: an order created offline too is stamped at its own sync,
 * which may come after the delivery it precedes. The day is read in
 * Gabon time (Africa/Libreville, UTC+1 all year, no daylight saving), so a
 * delivery between 00:00 and 01:00 local is not dated the day before (audit v4
 * T3 nuance). Pure.
 */
export const LIBREVILLE_OFFSET_MS = 60 * 60 * 1000;

export function gabonDay(at: Date): string {
  return new Date(at.getTime() + LIBREVILLE_OFFSET_MS).toISOString().slice(0, 10);
}

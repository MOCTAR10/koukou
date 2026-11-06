/**
 * Day an order was delivered (POUFA lot A2 divers, audit v3 T3 reserve).
 * A delivery recorded offline reaches the server later: its cession, its
 * delivery date and its ledger entry keep the device's capture, already
 * corrected for clock skew and never in the future (`sync/conflict-rules.ts`
 * `effectiveCapture`), never the day of the sync. No lower bound on the
 * order's creation: an order created offline too is stamped at its own sync,
 * which may come after the delivery it precedes. Days are UTC, like every
 * other date of the orders module. Pure.
 */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

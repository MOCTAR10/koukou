/** Pure helpers for the Grand livre tab (running balances, opening-balance date). */

export interface LedgerMovement {
  debitFcfa: number;
  creditFcfa: number;
}

/** Running balance (debit - credit) after each movement, starting from the opening balance. */
export function runningBalances(opening: number, movements: LedgerMovement[]): number[] {
  let acc = opening;
  return movements.map((m) => {
    acc += m.debitFcfa - m.creditFcfa;
    return acc;
  });
}

/** ISO day before `iso` (yyyy-mm-dd), to ask the balance "up to the eve" of the period. */
export function dayBefore(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

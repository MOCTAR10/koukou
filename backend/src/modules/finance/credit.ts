/**
 * Pure helpers of the customer credit rules (ceiling and payment terms).
 * Dates are `YYYY-MM-DD` Libreville days; no clock is read here.
 */

/** One unpaid invoice (sale) of a customer. */
export interface UnpaidInvoice {
  /** Remaining amount due on the sale, FCFA (> 0). */
  remainingFcfa: number;
  /** Invoice day: the delivery day for an order, else the sale date. */
  baseDate: string;
}

export interface CreditSummary {
  /** Sum of the remaining amounts (same rule as the customer balance). */
  outstandingFcfa: number;
  /** Unpaid beyond the payment term. */
  overdueAmount: number;
  /** Age in days past the due date of the oldest overdue invoice (0 when none). */
  oldestOverdueDays: number;
}

const DAY_MS = 86_400_000;

/** `date` plus `days` calendar days (UTC arithmetic on a date-only string). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

/** Due day of an invoice, or null when the customer has no payment term. */
export function dueDateOf(
  baseDate: string,
  termDays: number | null | undefined,
): string | null {
  return termDays == null ? null : addDays(baseDate, termDays);
}

/**
 * Totals and lateness of a customer's unpaid invoices on `today`. An invoice
 * is overdue the day after its due date (due today = not late yet).
 */
export function summarizeCredit(
  invoices: readonly UnpaidInvoice[],
  termDays: number | null | undefined,
  today: string,
): CreditSummary {
  let outstanding = 0;
  let overdue = 0;
  let oldest = 0;
  for (const inv of invoices) {
    if (inv.remainingFcfa <= 0) continue;
    outstanding += inv.remainingFcfa;
    const due = dueDateOf(inv.baseDate, termDays);
    if (due == null) continue;
    const late = daysBetween(due, today);
    if (late > 0) {
      overdue += inv.remainingFcfa;
      oldest = Math.max(oldest, late);
    }
  }
  return {
    outstandingFcfa: outstanding,
    overdueAmount: overdue,
    oldestOverdueDays: oldest,
  };
}

/** True when the customer's outstanding balance has reached the ceiling. */
export function isLimitReached(
  outstandingFcfa: number,
  limitFcfa: number | null | undefined,
): boolean {
  return limitFcfa != null && outstandingFcfa >= limitFcfa;
}

const fcfa = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`;

/** French refusal shown to the seller (and kept in the offline rejected list). */
export function creditRefusalMessage(
  outstandingFcfa: number,
  limitFcfa: number,
  newUnpaidFcfa: number,
): string {
  return `Plafond de crédit dépassé : ce client doit déjà ${fcfa(outstandingFcfa)} et cette opération ajoute ${fcfa(newUnpaidFcfa)} à crédit, pour un plafond de ${fcfa(limitFcfa)}. Faites encaisser tout ou partie du montant, ou demandez à un responsable de valider le dépassement.`;
}

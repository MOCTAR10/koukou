/** What the server says about a customer's credit (see `Customer`). */
export interface CreditFlags {
  limitReached?: boolean;
  overdue?: boolean;
  oldestOverdueDays?: number;
}

export interface CreditBadge {
  label: 'En retard' | 'Plafond atteint';
  /** Red for a late customer, amber for a ceiling reached. */
  tone: 'danger' | 'warn';
}

/** Badges of the customer picker and list: « En retard » first, then « Plafond atteint ». */
export function creditBadges(c: CreditFlags): CreditBadge[] {
  const out: CreditBadge[] = [];
  if (c.overdue) out.push({ label: 'En retard', tone: 'danger' });
  if (c.limitReached) out.push({ label: 'Plafond atteint', tone: 'warn' });
  return out;
}

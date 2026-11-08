import { ApiError, errorBody } from '../api/errors';

/** What the server says about a customer's credit (see `Customer`). */
export interface CreditFlags {
  limitReached?: boolean;
  overdue?: boolean;
  oldestOverdueDays?: number;
}

export interface CreditBadge {
  label: string;
  /** Red for a late customer, amber for a ceiling reached. */
  tone: 'red' | 'amber';
  title: string;
}

/** Badges of the customer list: « En retard » first, then « Plafond atteint ». */
export function creditBadges(c: CreditFlags): CreditBadge[] {
  const out: CreditBadge[] = [];
  if (c.overdue) {
    const days = c.oldestOverdueDays ?? 0;
    out.push({
      label: 'En retard',
      tone: 'red',
      title: days > 0 ? `Facture échue depuis ${days} jour${days > 1 ? 's' : ''}` : 'Facture échue',
    });
  }
  if (c.limitReached) {
    out.push({ label: 'Plafond atteint', tone: 'amber', title: 'Le plafond de crédit du client est atteint' });
  }
  return out;
}

export const CREDIT_LIMIT_CODE = 'PLAFOND_CREDIT';

export interface CreditRefusal {
  message: string;
  outstandingFcfa?: number;
  creditLimitFcfa?: number;
  /** True when the signed-in user may validate the overrun. */
  overridable: boolean;
}

/** The credit-ceiling refusal (409 `PLAFOND_CREDIT`) behind an error, else null. */
export function creditRefusal(err: unknown): CreditRefusal | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const body = errorBody<{ code: string; outstandingFcfa: number; creditLimitFcfa: number; overridable: boolean }>(err);
  if (!body || body.code !== CREDIT_LIMIT_CODE) return null;
  return {
    message: err.message,
    outstandingFcfa: body.outstandingFcfa,
    creditLimitFcfa: body.creditLimitFcfa,
    overridable: body.overridable === true,
  };
}

/** Whole number >= 0 from a form field; '' = null (no ceiling / term); NaN = invalid. */
export function parseOptionalCount(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  return /^\d+$/.test(t) ? Number(t) : Number.NaN;
}

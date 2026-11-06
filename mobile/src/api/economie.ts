// POUFA lot A droits: programme-wide economic synthesis (backend
// `programme-economie`, `GET /programme/economie/synthese`). Platform admin,
// or an institution granted ECONOMIQUE:CONSULTER; a column its matrix does
// not grant comes as null everywhere.
import { apiFetch } from './client';

export interface SynthesisColumns {
  sales: boolean;
  collected: boolean;
  payroll: boolean;
  stock: boolean;
  // POUFA lot A2 dge: SYSCOHADA (COMPTABILITE), Market (MARCHE), production (TECHNIQUE).
  accounting?: boolean;
  market?: boolean;
  production?: boolean;
}

export interface SynthesisRow {
  farmId?: string;
  code?: string | null;
  name?: string;
  provinceCode: string | null;
  provinceName: string | null;
  farmCount?: number;
  salesFcfa: number | null;
  salesCount: number | null;
  collectedFcfa: number | null;
  expensesFcfa: number | null;
  marginFcfa: number | null;
  marginPct: number | null;
  payrollMonthlyFcfa: number | null;
  employeeCount: number | null;
  feedStockKg: number | null;
  // POUFA lot A2 dge.
  accountingChargesFcfa?: number | null;
  accountingProductsFcfa?: number | null;
  accountingResultFcfa?: number | null;
  treasuryFcfa?: number | null;
  receivablesFcfa?: number | null;
  marketRequests?: number | null;
  marketAccepted?: number | null;
  marketDelivered?: number | null;
  marketSalesFcfa?: number | null;
  marketBirds?: number | null;
  marketCarcasses?: number | null;
  /** FORMULE_COMPLETUDE_PCT in force. */
  completenessPct?: number | null;
  /** FORMULE_VOLUME_PRODUIT_TETES / _KG in force. */
  producedHeads?: number | null;
  producedKg?: number | null;
}

export interface EconomieSynthesis {
  from: string;
  to: string;
  columns: SynthesisColumns;
  farms: SynthesisRow[];
  provinces: SynthesisRow[];
  total: SynthesisRow;
}

export function fetchEconomieSynthesis(window: { from: string; to: string }): Promise<EconomieSynthesis> {
  const q = new URLSearchParams({ from: window.from, to: window.to });
  return apiFetch<EconomieSynthesis>(`/programme/economie/synthese?${q.toString()}`);
}

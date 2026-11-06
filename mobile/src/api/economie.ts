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

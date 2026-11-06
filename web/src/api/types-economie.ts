/**
 * POUFA lot A droits: programme economic synthesis
 * (`GET /programme/economie/synthese`, backend domain ECONOMIQUE). One row
 * per farm of the caller's scope, then per province and the total. A null
 * figure: the column is not granted to the caller's profile (payroll needs
 * EQUIPE, the collected cash VENTES, the stock INTRANTS).
 */
export interface EconomieRow {
  farmId?: string;
  code?: string;
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

export interface EconomieSynthese {
  from: string;
  to: string;
  columns: { sales: boolean; collected: boolean; payroll: boolean; stock: boolean };
  farms: EconomieRow[];
  provinces: EconomieRow[];
  total: EconomieRow;
}

export type EconomieFormat = 'csv' | 'xlsx';

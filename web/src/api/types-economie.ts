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
  // POUFA lot A2 dge: SYSCOHADA (COMPTABILITE), Market (MARCHE) and production (TECHNIQUE).
  accountingChargesFcfa: number | null;
  accountingProductsFcfa: number | null;
  /** Résultat SYSCOHADA of the period: classes 7 − 6. */
  accountingResultFcfa: number | null;
  /** Class 5 balance at the end of the period. */
  treasuryFcfa: number | null;
  /** Customer receivables (411, 416) at the end of the period. */
  receivablesFcfa: number | null;
  marketRequests: number | null;
  marketAccepted: number | null;
  marketDelivered: number | null;
  marketSalesFcfa: number | null;
  marketBirds: number | null;
  marketCarcasses: number | null;
  /** FORMULE_COMPLETUDE_PCT in force. */
  completenessPct: number | null;
  /** FORMULE_VOLUME_PRODUIT_TETES / _KG in force. */
  producedHeads: number | null;
  producedKg: number | null;
}

export interface EconomieColumns {
  sales: boolean;
  collected: boolean;
  payroll: boolean;
  stock: boolean;
  /** POUFA lot A2 dge (absent from an older server: treated as not granted). */
  accounting?: boolean;
  market?: boolean;
  production?: boolean;
}

export interface EconomieSynthese {
  from: string;
  to: string;
  columns: EconomieColumns;
  farms: EconomieRow[];
  provinces: EconomieRow[];
  total: EconomieRow;
}

export type EconomieFormat = 'csv' | 'xlsx';

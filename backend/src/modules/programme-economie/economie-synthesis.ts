/**
 * Programme-wide economic synthesis of the Fermia bonus features (user
 * decision 2026-11-06: the government benefits from the farms' caisse,
 * payroll and stock): one row per farm, subtotals per province, a total.
 * A column the caller's matrix does not grant is null everywhere (gating by
 * the matrix, never a partial mask). Pure, unit-tested.
 */

/** Columns the caller reads, each from its own domain of the matrix. */
export interface SynthesisColumns {
  /** Sales, expenses and margin (ECONOMIQUE:CONSULTER, the route's domain). */
  sales: boolean;
  /** Cash collected (ECONOMIQUE or VENTES consultation). */
  collected: boolean;
  /** Monthly payroll of the active members (EQUIPE:CONSULTER). */
  payroll: boolean;
  /** Feed available (INTRANTS:CONSULTER). */
  stock: boolean;
}

/** Figures summed per farm over the period. */
export interface FarmSums {
  salesFcfa: number;
  salesCount: number;
  collectedFcfa: number;
  expensesFcfa: number;
  payrollMonthlyFcfa: number;
  employeeCount: number;
  feedStockKg: number;
}

export interface FarmFigures extends FarmSums {
  farmId: string;
  code: string | null;
  name: string;
  provinceCode: string | null;
  provinceName: string | null;
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

export interface Synthesis {
  columns: SynthesisColumns;
  farms: SynthesisRow[];
  provinces: SynthesisRow[];
  total: SynthesisRow;
}

/** Margin rate (% of sales, one decimal), null without sales. */
export function marginPct(
  salesFcfa: number,
  marginFcfa: number,
): number | null {
  if (salesFcfa <= 0) return null;
  return Math.round((marginFcfa / salesFcfa) * 1000) / 10;
}

type RowBase = Pick<SynthesisRow, 'provinceCode' | 'provinceName'> &
  Partial<Pick<SynthesisRow, 'farmId' | 'code' | 'name' | 'farmCount'>>;

function rowOf(
  base: RowBase,
  f: FarmSums,
  columns: SynthesisColumns,
): SynthesisRow {
  const margin = f.salesFcfa - f.expensesFcfa;
  return {
    ...base,
    salesFcfa: columns.sales ? f.salesFcfa : null,
    salesCount: columns.sales ? f.salesCount : null,
    collectedFcfa: columns.collected ? f.collectedFcfa : null,
    expensesFcfa: columns.sales ? f.expensesFcfa : null,
    marginFcfa: columns.sales ? margin : null,
    marginPct: columns.sales ? marginPct(f.salesFcfa, margin) : null,
    payrollMonthlyFcfa: columns.payroll ? f.payrollMonthlyFcfa : null,
    employeeCount: columns.payroll ? f.employeeCount : null,
    feedStockKg: columns.stock ? Math.round(f.feedStockKg * 10) / 10 : null,
  };
}

function emptySums(): FarmSums {
  return {
    salesFcfa: 0,
    salesCount: 0,
    collectedFcfa: 0,
    expensesFcfa: 0,
    payrollMonthlyFcfa: 0,
    employeeCount: 0,
    feedStockKg: 0,
  };
}

function add(into: FarmSums, f: FarmSums): void {
  into.salesFcfa += f.salesFcfa;
  into.salesCount += f.salesCount;
  into.collectedFcfa += f.collectedFcfa;
  into.expensesFcfa += f.expensesFcfa;
  into.payrollMonthlyFcfa += f.payrollMonthlyFcfa;
  into.employeeCount += f.employeeCount;
  into.feedStockKg += f.feedStockKg;
}

const LAST = '￿';

/** Farms sorted by province then code; provinces in the same order (none last). */
export function buildSynthesis(
  figures: readonly FarmFigures[],
  columns: SynthesisColumns,
): Synthesis {
  const sorted = [...figures].sort(
    (a, b) =>
      (a.provinceName ?? LAST).localeCompare(b.provinceName ?? LAST, 'fr') ||
      (a.code ?? '').localeCompare(b.code ?? '') ||
      a.name.localeCompare(b.name, 'fr'),
  );
  const byProvince = new Map<
    string,
    { code: string | null; name: string | null; count: number; sums: FarmSums }
  >();
  const total = emptySums();
  for (const f of sorted) {
    const key = f.provinceCode ?? '';
    let p = byProvince.get(key);
    if (!p) {
      p = {
        code: f.provinceCode,
        name: f.provinceName,
        count: 0,
        sums: emptySums(),
      };
      byProvince.set(key, p);
    }
    p.count += 1;
    add(p.sums, f);
    add(total, f);
  }
  return {
    columns,
    farms: sorted.map((f) =>
      rowOf(
        {
          farmId: f.farmId,
          code: f.code,
          name: f.name,
          provinceCode: f.provinceCode,
          provinceName: f.provinceName,
        },
        f,
        columns,
      ),
    ),
    provinces: [...byProvince.values()].map((p) =>
      rowOf(
        { provinceCode: p.code, provinceName: p.name, farmCount: p.count },
        p.sums,
        columns,
      ),
    ),
    total: rowOf(
      { provinceCode: null, provinceName: null, farmCount: sorted.length },
      total,
      columns,
    ),
  };
}

/** Export columns (row key, French header) for the columns the caller reads. */
export function exportColumns(
  columns: SynthesisColumns,
): Array<readonly [keyof SynthesisRow, string]> {
  const out: Array<readonly [keyof SynthesisRow, string]> = [
    ['provinceName', 'Province'],
    ['code', 'Code ferme'],
    ['name', 'Ferme'],
  ];
  if (columns.sales) {
    out.push(
      ['salesFcfa', 'Chiffre d’affaires (FCFA)'],
      ['salesCount', 'Nombre de ventes'],
      ['expensesFcfa', 'Charges (FCFA)'],
      ['marginFcfa', 'Marge (FCFA)'],
      ['marginPct', 'Marge (%)'],
    );
  }
  if (columns.collected) out.push(['collectedFcfa', 'Encaissé (FCFA)']);
  if (columns.payroll) {
    out.push(
      ['payrollMonthlyFcfa', 'Masse salariale mensuelle (FCFA)'],
      ['employeeCount', 'Membres actifs'],
    );
  }
  if (columns.stock) out.push(['feedStockKg', 'Aliment disponible (kg)']);
  return out;
}

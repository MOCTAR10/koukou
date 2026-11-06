// POUFA lot A droits: pure rules of the mobile programme synthesis screen.
import type { SynthesisColumns, SynthesisRow } from '@/api/economie';

export type SynthesisSpan = 'MOIS' | 'TRIMESTRE' | 'ANNEE';

export const SYNTHESIS_SPANS: readonly { key: SynthesisSpan; label: string }[] = [
  { key: 'MOIS', label: 'Ce mois' },
  { key: 'TRIMESTRE', label: '3 mois' },
  { key: 'ANNEE', label: 'Cette année' },
];

/**
 * Period sent to the server, from a `YYYY-MM-DD` day: the current month, the
 * current month and the two before it, or the calendar year, up to that day.
 */
export function synthesisWindow(span: SynthesisSpan, today: string): { from: string; to: string } {
  const [y, m] = today.split('-').map(Number);
  if (span === 'ANNEE') return { from: `${y}-01-01`, to: today };
  if (span === 'TRIMESTRE') {
    const back = m - 2;
    const year = back >= 1 ? y : y - 1;
    const month = back >= 1 ? back : back + 12;
    return { from: `${year}-${String(month).padStart(2, '0')}-01`, to: today };
  }
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

export type FigureKind = 'fcfa' | 'pct' | 'kg' | 'count';

export interface Figure {
  key: string;
  label: string;
  value: number | null;
  kind: FigureKind;
}

/**
 * Figures shown for one row, in order, keeping only the columns the server
 * granted (a refused column is null everywhere and never shown as zero).
 */
export function visibleFigures(row: SynthesisRow, columns: SynthesisColumns): Figure[] {
  const out: Figure[] = [];
  if (columns.sales) {
    out.push(
      { key: 'sales', label: 'Chiffre d’affaires', value: row.salesFcfa, kind: 'fcfa' },
      { key: 'expenses', label: 'Charges', value: row.expensesFcfa, kind: 'fcfa' },
      { key: 'margin', label: 'Marge', value: row.marginFcfa, kind: 'fcfa' },
      { key: 'marginPct', label: 'Taux de marge', value: row.marginPct, kind: 'pct' },
    );
  }
  if (columns.collected) out.push({ key: 'collected', label: 'Encaissé', value: row.collectedFcfa, kind: 'fcfa' });
  if (columns.payroll) {
    out.push(
      { key: 'payroll', label: 'Masse salariale / mois', value: row.payrollMonthlyFcfa, kind: 'fcfa' },
      { key: 'employees', label: 'Employés actifs', value: row.employeeCount, kind: 'count' },
    );
  }
  if (columns.stock) out.push({ key: 'stock', label: 'Aliment disponible', value: row.feedStockKg, kind: 'kg' });
  return out;
}

/** Farms of one province, by name (rows without province last). */
export function farmsOfProvince(farms: readonly SynthesisRow[], provinceCode: string | null): SynthesisRow[] {
  return farms
    .filter((f) => f.provinceCode === provinceCode)
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'fr'));
}

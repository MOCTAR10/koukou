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

/** POUFA lot A2 dge: column groups of the synthesis, each from its own matrix domain. */
export type SynthesisGroup = 'VENTES' | 'COMPTA' | 'MARKET' | 'PRODUCTION' | 'BIOSECURITE';

export const SYNTHESIS_GROUPS: readonly { key: SynthesisGroup; label: string }[] = [
  { key: 'VENTES', label: 'Ventes' },
  { key: 'COMPTA', label: 'Compta' },
  { key: 'MARKET', label: 'Market' },
  { key: 'PRODUCTION', label: 'Saisies' },
  { key: 'BIOSECURITE', label: 'Biosécurité' },
];

/** The groups the server granted, in order (the sales group always: it is the route's domain). */
export function synthesisGroups(columns: SynthesisColumns): SynthesisGroup[] {
  return SYNTHESIS_GROUPS.map((g) => g.key).filter(
    (g) =>
      g === 'VENTES' ||
      (g === 'COMPTA' && !!columns.accounting) ||
      (g === 'MARKET' && !!columns.market) ||
      (g === 'PRODUCTION' && !!columns.production) ||
      (g === 'BIOSECURITE' && !!columns.biosecurity),
  );
}

/** The group shown: the one picked when granted, else the sales. */
export function shownGroup(picked: SynthesisGroup, columns: SynthesisColumns): SynthesisGroup {
  return synthesisGroups(columns).includes(picked) ? picked : 'VENTES';
}

/**
 * Figures shown for one row, in order, keeping only the columns the server
 * granted (a refused column is null everywhere and never shown as zero).
 */
export function visibleFigures(row: SynthesisRow, columns: SynthesisColumns, group: SynthesisGroup = 'VENTES'): Figure[] {
  const out: Figure[] = [];
  const v = (x: number | null | undefined) => x ?? null;
  const g = shownGroup(group, columns);
  if (g === 'COMPTA') {
    return [
      { key: 'products', label: 'Produits (classe 7)', value: v(row.accountingProductsFcfa), kind: 'fcfa' },
      { key: 'charges', label: 'Charges (classe 6)', value: v(row.accountingChargesFcfa), kind: 'fcfa' },
      { key: 'result', label: 'Résultat SYSCOHADA', value: v(row.accountingResultFcfa), kind: 'fcfa' },
      { key: 'treasury', label: 'Trésorerie', value: v(row.treasuryFcfa), kind: 'fcfa' },
      { key: 'receivables', label: 'Créances clients', value: v(row.receivablesFcfa), kind: 'fcfa' },
    ];
  }
  if (g === 'MARKET') {
    return [
      { key: 'requests', label: 'Demandes reçues', value: v(row.marketRequests), kind: 'count' },
      { key: 'accepted', label: 'Acceptées', value: v(row.marketAccepted), kind: 'count' },
      { key: 'delivered', label: 'Commandes livrées', value: v(row.marketDelivered), kind: 'count' },
      { key: 'marketSales', label: 'Ventes livrées', value: v(row.marketSalesFcfa), kind: 'fcfa' },
      { key: 'birds', label: 'Poulets vifs livrés', value: v(row.marketBirds), kind: 'count' },
      { key: 'carcasses', label: 'Carcasses livrées', value: v(row.marketCarcasses), kind: 'count' },
    ];
  }
  if (g === 'PRODUCTION') {
    return [
      { key: 'completeness', label: 'Complétude des saisies', value: v(row.completenessPct), kind: 'pct' },
      { key: 'producedHeads', label: 'Volumes produits (têtes)', value: v(row.producedHeads), kind: 'count' },
      { key: 'producedKg', label: 'Poids vif produit', value: v(row.producedKg), kind: 'kg' },
    ];
  }
  if (g === 'BIOSECURITE') {
    return [
      { key: 'bioA', label: 'Classe A', value: v(row.bioA), kind: 'count' },
      { key: 'bioB', label: 'Classe B', value: v(row.bioB), kind: 'count' },
      { key: 'bioC', label: 'Classe C', value: v(row.bioC), kind: 'count' },
      { key: 'bioNever', label: 'Jamais contrôlées', value: v(row.bioNever), kind: 'count' },
      { key: 'bioControlledPct', label: 'Fermes contrôlées', value: v(row.bioControlledPct), kind: 'pct' },
      { key: 'bioAverageScorePct', label: 'Score moyen du dernier contrôle', value: v(row.bioAverageScorePct), kind: 'pct' },
    ];
  }
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

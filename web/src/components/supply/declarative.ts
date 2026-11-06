import type { DeclarativeStockRow } from '../../api/types-supply';

/**
 * Display of the declarative stock (`GET /farms/:farmId/declarative-stock`):
 * received on the confirmed programme deliveries − used as Fermia records it,
 * per intrant, beside the physical FEFO stock (which never goes negative). A
 * negative row is what the « stock négatif » alert is about: use recorded
 * beyond what the programme delivered.
 */

const FAMILY_ORDER = ['POUSSIN', 'ALIMENT', 'VACCIN', 'MEDICAMENT', 'AUTRE'];

/** Stock unit shown after the figures. */
export function stockUnitLabel(row: Pick<DeclarativeStockRow, 'unitCode' | 'unitLabel'>): string {
  if (row.unitCode === 'KG') return 'kg';
  if (row.unitCode === 'TETE') return 'têtes';
  return (row.unitLabel ?? row.unitCode).toLowerCase();
}

/** A figure in the row's unit: whole heads for chicks, up to 3 decimals otherwise. */
export function stockFigure(value: number | null, row: Pick<DeclarativeStockRow, 'intrantFamily'>): string {
  if (value == null) return '—';
  const digits = row.intrantFamily === 'POUSSIN' ? 0 : 3;
  return value.toLocaleString('fr-FR', { maximumFractionDigits: digits });
}

/** Negative rows first, then by family (chicks, feed, care, other), then by label. */
export function sortDeclarativeRows<T extends Pick<DeclarativeStockRow, 'negative' | 'intrantFamily' | 'intrantLabel' | 'intrantCode'>>(
  rows: readonly T[],
): T[] {
  const fam = (f: string) => {
    const i = FAMILY_ORDER.indexOf(f);
    return i < 0 ? FAMILY_ORDER.length : i;
  };
  return rows.slice().sort(
    (a, b) =>
      Number(b.negative) - Number(a.negative) ||
      fam(a.intrantFamily) - fam(b.intrantFamily) ||
      (a.intrantLabel ?? a.intrantCode).localeCompare(b.intrantLabel ?? b.intrantCode, 'fr'),
  );
}

/**
 * Gap between the declarative and the physical stock (declarative − physical),
 * null when there is no physical figure (chicks). Positive: more is declared
 * than left on the delivery lots.
 */
export function physicalGap(row: Pick<DeclarativeStockRow, 'stock' | 'physicalStock'>): number | null {
  if (row.physicalStock == null) return null;
  return Math.round((row.stock - row.physicalStock) * 1000) / 1000;
}

/** Tone of the declarative figure: red below zero, amber at zero, plain otherwise. */
export function stockTone(row: Pick<DeclarativeStockRow, 'stock' | 'negative'>): 'red' | 'amber' | 'plain' {
  if (row.negative || row.stock < 0) return 'red';
  if (Math.abs(row.stock) < 1e-9) return 'amber';
  return 'plain';
}

/** Summary line above the table (French). */
export function declarativeSummary(rows: readonly Pick<DeclarativeStockRow, 'negative' | 'intrantLabel' | 'intrantCode'>[]): string {
  if (rows.length === 0) return 'Aucune livraison du programme confirmée : le stock déclaratif est vide.';
  const negative = rows.filter((r) => r.negative);
  if (negative.length === 0) return `${rows.length} intrant${rows.length > 1 ? 's' : ''} suivi${rows.length > 1 ? 's' : ''}, aucun stock négatif.`;
  const names = negative.map((r) => r.intrantLabel ?? r.intrantCode).join(', ');
  return `Stock négatif pour ${negative.length > 1 ? `${negative.length} intrants` : '1 intrant'} (${names}) : l’utilisation enregistrée dépasse ce que le programme a livré. Vérifiez les saisies ou les réceptions.`;
}

// One indicator set on screen (CDC n° 11-15, 36; audit F3). The official
// value, from the programme formulas in force, is the headline; Fermia's own
// figure comes second, always named « indicateur de conduite (Fermia) ».
// Same rules as the web (`web/src/components/bandes/headline.ts`). Pure.
import type { BandComparison, BandHistoryRow } from '@/api/poufa';
import { comparisonRows, type ComparisonRow } from './comparison';

export const CONDUITE_LABEL = 'indicateur de conduite (Fermia)';

export type HeadlineKey = 'taux_mortalite' | 'viabilite' | 'gmq_g_j' | 'ic';

/** The CDC's band indicators (n° 12-15), in display order. */
export const HEADLINE: readonly { key: HeadlineKey; label: string }[] = [
  { key: 'taux_mortalite', label: 'Mortalité' },
  { key: 'viabilite', label: 'Viabilité' },
  { key: 'gmq_g_j', label: 'GMQ' },
  { key: 'ic', label: 'IC' },
];

/** Fermia's own formulas, shown under its figures. */
export const FERMIA_FORMULAS = {
  mortality: 'Fermia : morts déclarés ÷ sujets mis en place, à date.',
  fcr: 'IC technique (Fermia) : aliment consommé ÷ poids vif de tous les oiseaux nourris (dont les morts, au poids estimé), à la dernière pesée. L’IC officiel (bilan) = aliment ÷ poids vif produit.',
  gmq: 'Fermia : gain de poids depuis l’arrivée ÷ âge, à la dernière pesée.',
  costPerKgSold: 'Coût par kg vendu = charges du lot ÷ kg vendus au poids (« — » si vente à l’unité). Le coût de production officiel se rapporte au kg de poids vif produit.',
  marginPct: 'Fermia : (revenus − charges) ÷ revenus.',
} as const;

export const COST_PER_KG_SOLD_LABEL = 'Coût par kg vendu';

export function findIndicator<T extends { key: string }>(list: readonly T[] | null | undefined, key: string): T | null {
  return list?.find((i) => i.key === key) ?? null;
}

/** « — » without an official set, « non calculable » when the formula has no value; IC without its long unit. */
export function officialText(indicator: { value: number | null; unit: string } | null): string {
  if (!indicator) return '—';
  if (indicator.value == null || !Number.isFinite(indicator.value)) return 'non calculable';
  const v = indicator.value;
  if (indicator.unit === 'kg aliment/kg vif') return v.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  const digits = Math.abs(v) >= 100 ? 0 : 1;
  const s = v.toLocaleString('fr-FR', { maximumFractionDigits: digits });
  return indicator.unit ? `${s} ${indicator.unit}` : s;
}

/** Fermia's second line under an official value. */
export function conduiteLine(valueText: string): string {
  return `Fermia ${valueText} · ${CONDUITE_LABEL}`;
}

/** Label of the margin formula in force, else the fallback. */
export function marginLabel(indicators: readonly { key: string; label: string }[] | null | undefined, key: 'marge_fcfa' | 'taux_marge'): string {
  return findIndicator(indicators, key)?.label ?? (key === 'marge_fcfa' ? 'Marge' : 'Taux de marge');
}

/** The band the farmer follows today: the newest open band (rows come newest first). */
export function currentBand(rows: readonly BandHistoryRow[] | null | undefined): BandHistoryRow | null {
  return (rows ?? []).find((r) => r.status !== 'CLOTURE') ?? null;
}

/** Which band does best on each indicator (two bands at least): lowest mortality and IC, highest viability and GMQ. */
export function bestBands(rows: readonly BandHistoryRow[]): Partial<Record<HeadlineKey, string>> {
  const best: Partial<Record<HeadlineKey, string>> = {};
  const higher: Record<HeadlineKey, boolean> = { taux_mortalite: false, viabilite: true, gmq_g_j: true, ic: false };
  for (const { key } of HEADLINE) {
    let id: string | null = null;
    let value: number | null = null;
    let count = 0;
    for (const r of rows) {
      const v = findIndicator(r.summary?.indicators, key)?.value;
      if (v == null || !Number.isFinite(v)) continue;
      count += 1;
      if (value == null || (higher[key] ? v > value : v < value)) {
        value = v;
        id = r.id;
      }
    }
    if (id && count >= 2) best[key] = id;
  }
  return best;
}

/**
 * The comparison row to show on the home card: the latest week the band has
 * values for and the programme average is shown (not masked); else the
 * latest week with band values.
 */
export function latestComparison(c: BandComparison | null | undefined): ComparisonRow | null {
  if (!c) return null;
  const rows = comparisonRows(c);
  const withBand = rows.filter((r) => r.cells.mortalityPct.band !== '—' || r.cells.fcr.band !== '—' || r.cells.gmqG.band !== '—');
  return withBand.find((r) => !r.suppressed && r.cells.mortalityPct.programme !== '—') ?? withBand[0] ?? null;
}

// POUFA lot A2 droits (F6): the server masks the band economics for a reader
// without ECONOMIQUE (`economicMasked`); the screens then hide the money line.
/** Whether every band answer of the list carries its money figures. */
export function showsBandEconomics(list: readonly ({ economicMasked?: boolean } | null | undefined)[]): boolean {
  return !list.some((item) => item?.economicMasked === true);
}

/**
 * Qualification of an IC (lower is better). With the breed reference, the
 * deviation decides (recette A11: « Excellent » at +8 % above the reference was
 * wrong); without it only an absurdly high IC is flagged, never « Excellent ».
 */
export function fcrQualification(fcr: number | null | undefined, deviationPct?: number | null): string {
  if (fcr == null) return 'Pas de donnée';
  if (deviationPct != null && Number.isFinite(deviationPct)) {
    if (deviationPct <= -3) return 'Meilleur que la référence';
    if (deviationPct <= 3) return 'Conforme à la référence';
    if (deviationPct <= 10) return 'Au-dessus de la référence';
    return 'Élevé';
  }
  return fcr > 2.2 ? 'Élevé' : 'Conforme';
}

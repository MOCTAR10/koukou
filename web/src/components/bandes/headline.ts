/**
 * One indicator set on screen (CDC n° 11-15, 36; audit F3). The official
 * value, from the programme formulas in force, is the headline everywhere;
 * Fermia's own computation comes second, always under the label
 * « indicateur de conduite (Fermia) » with its formula as a tooltip, so a
 * farmer never sees two mortalities or two ICs without knowing which one is
 * official. Pure, unit-tested; the backend PDFs and the mobile app say the same.
 */
import type { BandHistoryRow, BandSummary, BandSummaryIndicator } from '../../api/types-pilotage';
import { indicatorValueLabel } from './bandSummary';

export const CONDUITE_LABEL = 'indicateur de conduite';

/** The CDC's band indicators (n° 12-15). */
export type HeadlineKey = 'taux_mortalite' | 'viabilite' | 'gmq_g_j' | 'ic';
export const HEADLINE_KEYS: readonly HeadlineKey[] = ['taux_mortalite', 'viabilite', 'gmq_g_j', 'ic'];

/** Short names used in tables and tiles. */
export const HEADLINE_SHORT: Record<HeadlineKey, string> = {
  taux_mortalite: 'Mortalité',
  viabilite: 'Viabilité',
  gmq_g_j: 'GMQ',
  ic: 'IC',
};

/** Fermia's own formulas (`batches/flock-performance.ts`, `rentabilite.service.ts`), for the tooltips. */
export const FERMIA_FORMULAS = {
  mortality: 'Fermia : (morts des saisies + mortalités déclarées) ÷ sujets mis en place × 100, à date.',
  viability: 'Fermia : 100 − mortalité Fermia.',
  fcr: 'Fermia : aliment consommé jusqu’à la dernière pesée ÷ poids vif de tous les oiseaux nourris (présents, vendus, abattus, réformés et morts, au poids estimé), à la dernière pesée.',
  gmq: 'Fermia : gain de poids depuis l’arrivée ÷ âge, à la dernière pesée.',
  ipe: 'Fermia : indice de performance européen (viabilité × poids ÷ âge ÷ IC), à la dernière pesée.',
  costPerKgSold: 'Fermia : toutes les charges du lot ÷ kg vendus. Le coût officiel se rapporte au kg vif produit.',
  marginPct: 'Fermia : (revenus − charges) ÷ revenus × 100.',
} as const;

/** One indicator of a list, or null. */
export function findIndicator<T extends { key: string }>(list: readonly T[] | null | undefined, key: string): T | null {
  return list?.find((i) => i.key === key) ?? null;
}

/** Value with unit, « — » when there is no official set at all. */
export function officialText(indicator: Pick<BandSummaryIndicator, 'value' | 'unit'> | null): string {
  if (!indicator) return '—';
  if (indicator.unit === 'kg aliment/kg vif') {
    return indicator.value == null ? 'non calculable' : indicator.value.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  }
  return indicatorValueLabel(indicator);
}

/** Tooltip of an official value: the formula in force. */
export function officialTooltip(indicator: Pick<BandSummaryIndicator, 'label' | 'expression'> | null): string {
  if (!indicator) return 'Indicateur officiel indisponible.';
  return `${indicator.label} (officiel) = ${indicator.expression}`;
}

/** Second line under an official value: Fermia's figure, always named. */
export function conduiteLine(valueText: string): string {
  return `${valueText} · ${CONDUITE_LABEL}`;
}

/** Official summaries by band id (the lot list joins on it). */
export function summariesById(rows: readonly BandHistoryRow[] | null | undefined): Map<string, BandSummary> {
  const out = new Map<string, BandSummary>();
  for (const r of rows ?? []) if (r.summary) out.set(r.id, r.summary);
  return out;
}

/** The band the farmer follows today: the newest open band (rows are newest first). */
export function currentBand(rows: readonly BandHistoryRow[] | null | undefined): BandHistoryRow | null {
  return (rows ?? []).find((r) => r.status !== 'CLOTURE') ?? null;
}

/**
 * Farm headline over the open bands: each official indicator averaged with
 * the bands' live headcount as weight (bands without a value are skipped).
 * The value of each band comes from the programme formula; only the
 * weighting across bands is Fermia's.
 */
export function openBandsHeadline(rows: readonly BandHistoryRow[] | null | undefined): Record<HeadlineKey, number | null> & { bands: number } {
  const open = (rows ?? []).filter((r) => r.status !== 'CLOTURE' && r.summary);
  const out = { bands: open.length } as Record<HeadlineKey, number | null> & { bands: number };
  for (const key of HEADLINE_KEYS) {
    let sum = 0;
    let weight = 0;
    for (const r of open) {
      const v = findIndicator(r.summary!.indicators, key)?.value;
      if (v == null || !Number.isFinite(v)) continue;
      const w = Math.max(r.quantityAlive, 1);
      sum += v * w;
      weight += w;
    }
    out[key] = weight > 0 ? sum / weight : null;
  }
  return out;
}

export type BestOf = Partial<Record<HeadlineKey, string>>;

/**
 * Which band does best on each indicator, among those with a value: lowest
 * mortality and IC, highest viability and GMQ. Ties keep the first (newest).
 * Needs two bands to compare, else nothing is marked.
 */
export function bestBands(rows: readonly BandHistoryRow[]): BestOf {
  const best: BestOf = {};
  const higherIsBetter: Record<HeadlineKey, boolean> = { taux_mortalite: false, viabilite: true, gmq_g_j: true, ic: false };
  for (const key of HEADLINE_KEYS) {
    let id: string | null = null;
    let value: number | null = null;
    let count = 0;
    for (const r of rows) {
      const v = findIndicator(r.summary?.indicators, key)?.value;
      if (v == null || !Number.isFinite(v)) continue;
      count += 1;
      if (value == null || (higherIsBetter[key] ? v > value : v < value)) {
        value = v;
        id = r.id;
      }
    }
    if (id && count >= 2) best[key] = id;
  }
  return best;
}

/** « Coût par kg vendu » (Fermia) next to the official cost per kg live produced. */
export const COST_PER_KG_SOLD_LABEL = 'Coût par kg vendu';

/** Label of the margin formula in force (« Marge brute », « Taux de marge »), else the fallback. */
export function marginLabel(indicators: readonly { key: string; label: string }[] | null | undefined, key: 'marge_fcfa' | 'taux_marge'): string {
  return findIndicator(indicators, key)?.label ?? (key === 'marge_fcfa' ? 'Marge' : 'Taux de marge');
}

// POUFA lot A2 droits (F6): the server masks the band economics for a reader
// without ECONOMIQUE (`economicMasked`); the screens then hide the money
// block instead of showing empty figures.
/** Whether every band answer of the list carries its money figures. */
export function showsBandEconomics(list: readonly ({ economicMasked?: boolean } | null | undefined)[]): boolean {
  return !list.some((item) => item?.economicMasked === true);
}

/** Note shown where the money block is hidden. */
export const ECONOMICS_MASKED_NOTE = 'Chiffre d’affaires, coût et marge : réservés aux profils disposant du droit Économique.';

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

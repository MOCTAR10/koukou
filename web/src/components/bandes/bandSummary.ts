/**
 * « Bilan POUFA » of a band (CDC rows 10-15): official indicators with the
 * formula version in force, frozen bilans, the comparison with the
 * programme average and the closed-band correction form. Pure, unit-tested.
 */
import type {
  BandComparison,
  BandeSnapshotTrigger,
  ComparisonValues,
  ComparisonWeek,
  CorrectClosedBandeBody,
  OfficialIndicator,
} from '../../api/types-pilotage';

/** The CDC's official band indicators (rows 12-15), in this order. */
export const OFFICIAL_KEYS = ['taux_mortalite', 'viabilite', 'gmq_g_j', 'ic'] as const;

export function splitIndicators(list: readonly OfficialIndicator[]): { official: OfficialIndicator[]; others: OfficialIndicator[] } {
  const official = OFFICIAL_KEYS.map((k) => list.find((i) => i.key === k)).filter((i): i is OfficialIndicator => !!i);
  const others = list.filter((i) => !(OFFICIAL_KEYS as readonly string[]).includes(i.key));
  return { official, others };
}

/** FCFA whole, %, g/j and kg one decimal, ratios (IC « kg aliment/kg vif ») two. */
function digitsFor(unit: string): number {
  if (unit.startsWith('FCFA')) return 0;
  if (unit === '%' || unit === 'g/j' || unit === 'kg') return 1;
  return 2;
}

/** Value with its unit, « non calculable » when the server gives null (division by zero, missing input). */
export function indicatorValueLabel(i: Pick<OfficialIndicator, 'value' | 'unit'>): string {
  if (i.value == null || Number.isNaN(i.value)) return 'non calculable';
  const text = i.value.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: digitsFor(i.unit) });
  return i.unit ? `${text} ${i.unit}` : text;
}

/** Which formula version produced the value. */
export function formulaVersionLabel(i: Pick<OfficialIndicator, 'parameterVersionId' | 'validFrom'>, fmt: (iso: string) => string): string {
  if (!i.parameterVersionId) return 'Formule proposée du catalogue (aucune version enregistrée)';
  // The seeded defaults carry a sentinel date (2000): not a real effective date (recette A15).
  const t = i.validFrom ? Date.parse(i.validFrom) : NaN;
  if (!i.validFrom || Number.isNaN(t) || t < Date.UTC(2001, 0, 1)) return 'Version par défaut du programme';
  return `Version en vigueur depuis le ${fmt(i.validFrom)}`;
}

export const TRIGGER_LABELS: Record<BandeSnapshotTrigger, string> = {
  CLOTURE_AUTO: 'Clôture automatique (effectif à zéro)',
  CLOTURE_MANUELLE: 'Clôture manuelle',
  CORRECTION: 'Correction',
};

// ---------------------------------------------------------------------------
// Comparison with the programme
// ---------------------------------------------------------------------------

export type ComparisonField = keyof ComparisonValues;

export const COMPARISON_FIELDS: readonly ComparisonField[] = ['mortalityPct', 'fcr', 'gmqG'];

export const COMPARISON_LABELS: Record<ComparisonField, string> = {
  mortalityPct: 'Mortalité cumulée',
  fcr: 'IC',
  gmqG: 'GMQ',
};

export function comparisonValueLabel(field: ComparisonField, v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  if (field === 'mortalityPct') return `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
  if (field === 'gmqG') return `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} g/j`;
  return v.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

export type CompareTone = 'better' | 'worse' | 'same';

/** Lower mortality and IC are better, a higher GMQ is better; within 2 % of the average = same. */
export function compareTone(field: ComparisonField, band: number | null | undefined, programme: number | null | undefined): CompareTone | null {
  if (band == null || programme == null) return null;
  const tolerance = Math.abs(programme) * 0.02;
  if (Math.abs(band - programme) <= tolerance) return 'same';
  const higherIsBetter = field === 'gmqG';
  return (band > programme) === higherIsBetter ? 'better' : 'worse';
}

/** What the programme column shows for a week. */
export function programmeCell(week: ComparisonWeek, field: ComparisonField, k: number): { text: string; suppressed: boolean } {
  if (week.suppressed || !week.programme) {
    return { text: week.suppressed ? `masqué, moins de ${k} fermes` : '—', suppressed: week.suppressed };
  }
  return { text: comparisonValueLabel(field, week.programme[field]), suppressed: false };
}

/** The latest week where both the band and the programme average are known (summary card). */
export function latestComparableWeek(c: Pick<BandComparison, 'weeks'>): ComparisonWeek | null {
  for (let i = c.weeks.length - 1; i >= 0; i--) {
    const w = c.weeks[i];
    if (!w.suppressed && w.programme && w.band) return w;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Closed-band correction
// ---------------------------------------------------------------------------

export const CORRECTION_REASON_MIN = 5;

export interface CorrectionForm {
  entryDate: string;
  deaths: string;
  feedQuantityKg: string;
  waterL: string;
  avgWeightKg: string;
  sampleSize: string;
  reason: string;
}

export const EMPTY_CORRECTION: CorrectionForm = {
  entryDate: '',
  deaths: '',
  feedQuantityKg: '',
  waterL: '',
  avgWeightKg: '',
  sampleSize: '',
  reason: '',
};

function parsed(raw: string): number | undefined {
  const t = raw.trim().replace(',', '.');
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** French reason the correction can't be sent (same checks as the DTO and the service), or null. */
export function correctionError(form: CorrectionForm, bounds: { from: string; to: string | null }): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.entryDate)) return 'Choisissez le jour à corriger.';
  if (form.entryDate < bounds.from || (bounds.to && form.entryDate > bounds.to)) {
    return `Le jour corrigé doit être entre l'ouverture (${bounds.from}) et la clôture (${bounds.to ?? '—'}).`;
  }
  const deaths = parsed(form.deaths);
  const feed = parsed(form.feedQuantityKg);
  const water = parsed(form.waterL);
  const weight = parsed(form.avgWeightKg);
  const sample = parsed(form.sampleSize);
  if ([deaths, feed, water, weight, sample].every((v) => v === undefined)) return 'Aucune valeur à corriger.';
  if (deaths !== undefined && !(Number.isInteger(deaths) && deaths >= 0)) return 'Morts : nombre entier positif ou nul.';
  if (feed !== undefined && !(feed >= 0)) return 'Aliment : quantité positive ou nulle (kg).';
  if (water !== undefined && !(water >= 0)) return 'Eau : quantité positive ou nulle (L).';
  if (weight !== undefined && !(weight >= 0.001)) return 'Poids moyen : au moins 0,001 kg.';
  if (sample !== undefined && !(Number.isInteger(sample) && sample >= 1)) return 'Sujets pesés : nombre entier, au moins 1.';
  if (form.reason.trim().length < CORRECTION_REASON_MIN) {
    return `Le motif de la correction est obligatoire (${CORRECTION_REASON_MIN} caractères au moins).`;
  }
  return null;
}

/** `POST …/corrections` body: only the fields typed. Call after `correctionError` returned null. */
export function correctionBody(form: CorrectionForm): CorrectClosedBandeBody {
  const body: CorrectClosedBandeBody = { entryDate: form.entryDate, reason: form.reason.trim() };
  const deaths = parsed(form.deaths);
  const feed = parsed(form.feedQuantityKg);
  const water = parsed(form.waterL);
  const weight = parsed(form.avgWeightKg);
  const sample = parsed(form.sampleSize);
  if (deaths !== undefined) body.deaths = deaths;
  if (feed !== undefined) body.feedQuantityKg = feed;
  if (water !== undefined) body.waterL = water;
  if (weight !== undefined) body.avgWeightKg = weight;
  if (sample !== undefined) body.sampleSize = sample;
  return body;
}

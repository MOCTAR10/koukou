import type { ChecklistLine, FarmFinancials } from '../../api/types-financing';
import { librevilleDay, shiftDay } from '../../lib/libreville';
import type { StatusTone } from '../ui';

type Ratio = FarmFinancials['ratios'][number];
type BeforeAfter = NonNullable<FarmFinancials['beforeAfter']>;

// ── Period ─────────────────────────────────────────────────────────────────

export type PeriodPreset = 'MONTHS_12' | 'YEAR_CURRENT' | 'YEAR_PREVIOUS' | 'CUSTOM';

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  MONTHS_12: '12 derniers mois',
  YEAR_CURRENT: 'Exercice en cours',
  YEAR_PREVIOUS: 'Exercice précédent',
  CUSTOM: 'Dates libres',
};

export const PERIOD_PRESETS: readonly PeriodPreset[] = ['MONTHS_12', 'YEAR_CURRENT', 'YEAR_PREVIOUS', 'CUSTOM'];

export interface Period {
  from: string;
  to: string;
}

/**
 * Period of a preset on the Gabon calendar. The fiscal year is the calendar year (OHADA default):
 * « exercice en cours » runs from 1 January to today, « exercice précédent » is last year whole,
 * « 12 derniers mois » ends today and starts the day after the same date a year ago.
 */
export function periodFor(preset: Exclude<PeriodPreset, 'CUSTOM'>, today: string = librevilleDay()): Period {
  const year = Number(today.slice(0, 4));
  if (preset === 'YEAR_CURRENT') return { from: `${year}-01-01`, to: today };
  if (preset === 'YEAR_PREVIOUS') return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
  // Same day a year earlier (29 February falls back on 28 February), then one day later.
  const [, m, d] = today.split('-').map(Number);
  const lastYear = new Date(Date.UTC(year - 1, m - 1, d));
  const sameDay = lastYear.getUTCMonth() === m - 1 ? lastYear.toISOString().slice(0, 10) : `${year - 1}-02-28`;
  return { from: shiftDay(sameDay, 1), to: today };
}

/** Why a free period cannot be asked for, or null. */
export function periodError(p: Period, today: string = librevilleDay()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.from) || !/^\d{4}-\d{2}-\d{2}$/.test(p.to)) return 'Indiquez la date de début et la date de fin.';
  if (p.from > p.to) return 'La date de début doit précéder la date de fin.';
  if (p.to > today) return 'La date de fin ne peut pas être dans le futur.';
  return null;
}

// ── Ratios ─────────────────────────────────────────────────────────────────

export const READING_LABELS: Record<NonNullable<Ratio['reading']>, string> = { BON: 'Bon', A_SURVEILLER: 'À surveiller', FAIBLE: 'Faible' };
export const READING_TONES: Record<NonNullable<Ratio['reading']>, StatusTone> = { BON: 'ok', A_SURVEILLER: 'warning', FAIBLE: 'danger' };

export const NOT_COMPUTABLE = 'Non calculable';

const nf = (n: number, digits: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: digits });

/** A ratio as the tile prints it: « 18,4 % », « 45 jours », « 1,3 x », « 4 250 000 FCFA »; « Non calculable » for null, never a dash. */
export function ratioValueText(value: number | null, unit: Ratio['unit']): string {
  if (value == null || !Number.isFinite(value)) return NOT_COMPUTABLE;
  switch (unit) {
    case 'FCFA':
      return `${nf(Math.round(value), 0)} FCFA`;
    case '%':
      return `${nf(value, 1)} %`;
    case 'jours': {
      const n = Math.round(value);
      return `${nf(n, 0)} ${Math.abs(n) < 2 ? 'jour' : 'jours'}`;
    }
    case 'x':
      return `${nf(value, 2)} x`;
  }
}

/** The ratios worth a glance on a file: computable ones first, then in the order a credit analyst reads them. */
const HEADLINE_ORDER: Array<Ratio['code']> = ['CAF', 'MARGE_NETTE', 'SERVICE_DETTE', 'TRESORERIE_NETTE', 'ENDETTEMENT', 'FONDS_ROULEMENT', 'DELAI_CLIENTS'];

export function headlineRatios(ratios: readonly Ratio[], max = 4): Ratio[] {
  const rank = (r: Ratio) => HEADLINE_ORDER.indexOf(r.code);
  return [...ratios].sort((a, b) => Number(a.value == null) - Number(b.value == null) || rank(a) - rank(b)).slice(0, max);
}

// ── Reliability ────────────────────────────────────────────────────────────

type Coverage = Pick<FarmFinancials['reliability'], 'daysInPeriod' | 'daysWithEntries' | 'coveragePct' | 'coverageMinPct'>;

/** Under the programme's minimum share (parameter FINANCEMENT_COUVERTURE_SAISIE_MIN) of days entered. */
export const isLowCoverage = (r: Pick<Coverage, 'coveragePct' | 'coverageMinPct'>): boolean => r.coveragePct < r.coverageMinPct;

/** « 153 sur 365 (41,9 %) ». */
export const coverageFigures = (r: Coverage): string => `${r.daysWithEntries.toLocaleString('fr-FR')} sur ${r.daysInPeriod.toLocaleString('fr-FR')} (${nf(r.coveragePct, 1)} %)`;

/** « 153 jours saisis sur 365 (41,9 %) », the same figure as the PDF's warning. */
export const coverageText = (r: Coverage): string => `${r.daysWithEntries.toLocaleString('fr-FR')} jours saisis sur ${r.daysInPeriod.toLocaleString('fr-FR')} (${nf(r.coveragePct, 1)} %)`;

/** « Saisie incomplète : 153 jours saisis sur 365 (41,9 %) », or null when the entries are complete enough. */
export const lowCoverageLine = (r: Coverage): string | null => (isLowCoverage(r) ? `Saisie incomplète : ${coverageText(r)}` : null);

// ── Statements ─────────────────────────────────────────────────────────────

export function sumLines(lines: ReadonlyArray<{ amountFcfa: number }>): number {
  return lines.reduce((n, l) => n + l.amountFcfa, 0);
}

export interface BalanceCheck {
  /** Total assets and total liabilities agree to the franc. */
  balanced: boolean;
  /** Assets minus liabilities, as stated. */
  gapFcfa: number;
  /** The stated totals match the sum of their lines. */
  totalsMatchLines: boolean;
}

export function balanceCheck(b: NonNullable<FarmFinancials['balanceSheet']>): BalanceCheck {
  const gapFcfa = b.totalAssetsFcfa - b.totalLiabilitiesFcfa;
  return {
    balanced: gapFcfa === 0,
    gapFcfa,
    totalsMatchLines: sumLines(b.assets) === b.totalAssetsFcfa && sumLines(b.liabilities) === b.totalLiabilitiesFcfa,
  };
}

// ── Before / after ─────────────────────────────────────────────────────────

export interface BeforeAfterRow {
  key: 'revenue' | 'charges' | 'net' | 'mortality';
  label: string;
  kind: 'money' | 'pct';
  before: number | null;
  after: number | null;
  /** Money: change of the monthly average (the two periods differ in length). Mortality: change in points. Null when it cannot be told. */
  variation: number | null;
  /** Percent change of the monthly average; null for mortality or when the base is zero. */
  variationPct: number | null;
}

const perMonth = (total: number, months: number): number | null => (months > 0 ? total / months : null);

export function beforeAfterRows(b: BeforeAfter): BeforeAfterRow[] {
  const money = (key: BeforeAfterRow['key'], label: string, before: number, after: number): BeforeAfterRow => {
    const bm = perMonth(before, b.before.months);
    const am = perMonth(after, b.after.months);
    const variation = bm != null && am != null ? Math.round(am - bm) : null;
    const variationPct = bm != null && am != null && bm !== 0 ? Math.round(((am - bm) / Math.abs(bm)) * 1000) / 10 : null;
    return { key, label, kind: 'money', before, after, variation, variationPct };
  };
  const bm = b.before.mortalityPct;
  const am = b.after.mortalityPct;
  return [
    money('revenue', 'Produits', b.before.revenueFcfa, b.after.revenueFcfa),
    money('charges', 'Charges', b.before.chargesFcfa, b.after.chargesFcfa),
    money('net', 'Résultat net', b.before.netResultFcfa, b.after.netResultFcfa),
    { key: 'mortality', label: 'Mortalité', kind: 'pct', before: bm, after: am, variation: bm != null && am != null ? Math.round((am - bm) * 10) / 10 : null, variationPct: null },
  ];
}

export const monthsText = (n: number): string => `${n.toLocaleString('fr-FR')} mois`;

/** Signed text for a variation: « +1 200 000 FCFA », « −3,4 points ». */
export function signedText(n: number | null, unit: 'FCFA' | 'points' | ''): string {
  if (n == null) return NOT_COMPUTABLE;
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${nf(Math.abs(n), unit === 'points' ? 1 : 0)}${unit ? ` ${unit}` : ''}`;
}

// ── Checklist ──────────────────────────────────────────────────────────────

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** The requirement that asks for the financial statements: by code, falling back on the label. */
export function isFinancialStatementsRequirement(r: Pick<ChecklistLine['requirement'], 'code' | 'label'>): boolean {
  if (r.code.toUpperCase().includes('ETATS_FINANCIERS')) return true;
  const label = fold(r.label);
  return label.includes('etats financiers') || label.includes('etat de tresorerie');
}

// ── Band status ────────────────────────────────────────────────────────────

export const BAND_STATUS_TONES: Record<string, StatusTone> = { EN_COURS: 'info', EN_VENTE: 'info', CLOTURE: 'neutral' };

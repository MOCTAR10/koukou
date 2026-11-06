/**
 * Headline of a band in the farm's band history (CDC n° 11): the official
 * indicators (programme formulas) with the money figures of the same bilan.
 * A closed band reads its latest frozen bilan, an open band the indicators
 * in force today. Pure, unit-tested.
 */

/** One official indicator, as shown in a list (no formula version ids). */
export interface BandSummaryIndicator {
  key: string;
  label: string;
  unit: string;
  value: number | null;
  /** Formula applied, shown as a tooltip. */
  expression: string;
}

export interface BandSummary {
  /** BILAN: latest frozen bilan of a closed band; EN_COURS: computed today. */
  source: 'BILAN' | 'EN_COURS';
  asOf: string;
  ageDays: number;
  /** Opening → closure (bilan) or → today, in days. */
  durationDays: number | null;
  snapshotVersion: number | null;
  indicators: BandSummaryIndicator[];
  revenueFcfa: number | null;
  chargesFcfa: number | null;
  marginFcfa: number | null;
  completenessPct: number | null;
}

/** `?status=` of `GET /farms/:farmId/bandes`. */
export type BandStatusFilter = 'CLOTURE' | 'EN_COURS';

/** Parsed `?status=`; undefined = every band, null = an unknown value (400). */
export function parseBandStatusFilter(
  raw: string | undefined,
): BandStatusFilter | undefined | null {
  if (raw == null || raw === '') return undefined;
  const value = raw.trim().toUpperCase();
  if (value === 'CLOTURE' || value === 'EN_COURS') return value;
  return null;
}

interface IndicatorLike {
  key: string;
  label: string;
  unit: string;
  value: number | null;
  expression: string;
}

const slim = (list: readonly IndicatorLike[]): BandSummaryIndicator[] =>
  list.map(({ key, label, unit, value, expression }) => ({
    key,
    label,
    unit,
    value,
    expression,
  }));

const toFcfa = (n: number | null | undefined): number | null =>
  n == null || !Number.isFinite(n) ? null : Math.round(n);

/** Summary of a closed band from its latest frozen bilan. */
export function summaryFromSnapshot(snapshot: {
  version: number;
  asOf: string;
  ageDays: number;
  durationDays: number;
  indicators: readonly IndicatorLike[];
  revenueFcfa: number | null;
  chargesFcfa: number | null;
  marginFcfa: number | null;
  completenessPct: number | null;
}): BandSummary {
  return {
    source: 'BILAN',
    asOf: snapshot.asOf,
    ageDays: snapshot.ageDays,
    durationDays: snapshot.durationDays,
    snapshotVersion: snapshot.version,
    indicators: slim(snapshot.indicators),
    revenueFcfa: snapshot.revenueFcfa,
    chargesFcfa: snapshot.chargesFcfa,
    marginFcfa: snapshot.marginFcfa,
    completenessPct: snapshot.completenessPct,
  };
}

/** Summary of an open band from the indicators in force today. */
export function summaryFromLive(
  live: {
    asOf: string;
    ageDays: number;
    indicators: readonly IndicatorLike[];
    variables: Readonly<Record<string, number | null | undefined>>;
    completenessPct: number | null;
  },
  durationDays: number | null,
): BandSummary {
  const revenue = toFcfa(live.variables.ca_fcfa);
  const charges = toFcfa(live.variables.charges_fcfa);
  const marge = live.indicators.find((i) => i.key === 'marge_fcfa')?.value;
  return {
    source: 'EN_COURS',
    asOf: live.asOf,
    ageDays: live.ageDays,
    durationDays,
    snapshotVersion: null,
    indicators: slim(live.indicators),
    revenueFcfa: revenue,
    chargesFcfa: charges,
    marginFcfa:
      toFcfa(marge) ??
      (revenue != null && charges != null ? revenue - charges : null),
    completenessPct: live.completenessPct,
  };
}

/**
 * What the steering counts (POUFA lot A, audit F1 / F2 / n° 44), read from
 * the programme parameters at the date of the fact:
 * - the bands of the programme (`BANDE_TYPES_ELIGIBLES`, broiler chicken by
 *   default): other species and laying flocks stay out of every aggregate;
 * - the advisory alert kinds shown apart as « alertes de conduite »
 *   (`PILOTAGE_ALERTES_CONDUITE_TYPES`); only published sanitary alerts ever
 *   colour a farm;
 * - the `FORMULE_*` set in force, so the aggregates' mortality, completeness
 *   and produced volumes go through the formula engine
 *   (`mortalite_periode_pct`, `completude_pct`, `volume_produit_*`) instead
 *   of fixed SQL.
 * Pure, unit-tested; the services read the parameters and embed the SQL.
 */
import { factInstant } from '../batches/poufa/bande-rules.js';
import {
  evaluateOfficialIndicators,
  formulasInForce,
  indicatorValue,
  type FormulaInForce,
  type FormulaVersionSource,
} from '../indicators/official-indicators.js';
import {
  checkConductAlertKinds,
  checkEligibleBandTypes,
  DEFAULT_CONDUCT_ALERT_KINDS,
  DEFAULT_ELIGIBLE_BAND_TYPES,
  NON_CONDUCT_ALERT_KINDS,
} from '../programme/parameter-catalog.js';
import { round } from './pilotage-rules.js';

export const ELIGIBLE_BANDS_KEY = 'BANDE_TYPES_ELIGIBLES';
export const CONDUCT_ALERTS_KEY = 'PILOTAGE_ALERTES_CONDUITE_TYPES';

/** Reads a parameter value in force (`ParameterResolver`). */
export interface ParameterValueSource extends FormulaVersionSource {
  value<T = unknown>(key: string, at: Date): T;
}

export interface PilotageRules {
  /** `SPECIES:TYPE` keys of the programme's bands (never empty). */
  eligibleBandKeys: string[];
  /** Advisory kinds counted as conduct alerts (may be empty). */
  conductAlertKinds: string[];
  /** The indicator formulas in force. */
  formulas: readonly FormulaInForce[];
}

/** `[{ species, type }]` → `['POULET:CHAIR']`; the default when malformed. */
export function eligibleBandKeys(value: unknown): string[] {
  const list = checkEligibleBandTypes(value)
    ? DEFAULT_ELIGIBLE_BAND_TYPES
    : (value as { species: string; type: string }[]);
  return list.map((t) => `${t.species}:${t.type}`);
}

/** The conduct kinds, never a sanitary or economic one; the default when malformed. */
export function conductAlertKinds(value: unknown): string[] {
  const list = checkConductAlertKinds(value)
    ? DEFAULT_CONDUCT_ALERT_KINDS
    : (value as string[]);
  return list.filter((k) => !NON_CONDUCT_ALERT_KINDS.includes(k));
}

/** Rules in force at the end of `day` (today at most). */
export function pilotageRulesAt(
  source: ParameterValueSource,
  day: string,
): PilotageRules {
  const at = factInstant(day);
  return {
    eligibleBandKeys: eligibleBandKeys(source.value(ELIGIBLE_BANDS_KEY, at)),
    conductAlertKinds: conductAlertKinds(source.value(CONDUCT_ALERTS_KEY, at)),
    formulas: formulasInForce(source, at),
  };
}

/** Whether a band counts in the programme's aggregates. */
export function isEligibleBand(
  band: { species: string; type: string },
  keys: readonly string[],
): boolean {
  return keys.includes(`${band.species}:${band.type}`);
}

/**
 * SQL condition: the band `alias` (a `production_batches` row) is of an
 * eligible type. `placeholder` holds the `SPECIES:TYPE` text array.
 */
export function eligibleBandSql(alias: string, placeholder: string): string {
  return `(${alias}.species::text || ':' || ${alias}.type::text) = ANY(${placeholder}::text[])`;
}

/**
 * Mortality of a period with `FORMULE_MORTALITE_PERIODE_PCT` (deaths of the
 * period and birds at risk, summed over the bands first), one decimal.
 */
export function periodMortalityPct(
  formulas: readonly FormulaInForce[],
  deaths: number,
  exposed: number,
): number | null {
  return formulaIndicator(
    formulas,
    'mortalite_periode_pct',
    { morts_periode: deaths, effectif_expose: exposed },
    1,
  );
}

/** One indicator of the set evaluated on `variables`, rounded; null when undefined. */
export function formulaIndicator(
  formulas: readonly FormulaInForce[],
  key: string,
  variables: Readonly<Record<string, number | null | undefined>>,
  digits: number,
): number | null {
  const v = indicatorValue(
    evaluateOfficialIndicators(formulas, variables),
    key,
  );
  return v == null ? null : round(v, digits);
}

/**
 * Cumulative mortality of one band, or of bands summed (`FORMULE_TAUX_MORTALITE`:
 * deaths since placement / birds placed).
 */
export function bandMortalityPct(
  formulas: readonly FormulaInForce[],
  deaths: number,
  placed: number,
  digits = 1,
): number | null {
  return formulaIndicator(
    formulas,
    'taux_mortalite',
    { morts_cumules: deaths, mis_en_place: placed },
    digits,
  );
}

/** A period-mortality function bound to a formula set. */
export function mortalityOf(
  formulas: readonly FormulaInForce[],
): (deaths: number, exposed: number) => number | null {
  return (deaths, exposed) => periodMortalityPct(formulas, deaths, exposed);
}

// POUFA lot A2 dge: completeness and produced volumes of a period go through
// the formula engine too (CDC §7.3), like the period mortality.

/** Volumes produced over a period (heads and live kg), null when undefined. */
export interface ProducedVolumes {
  heads: number | null;
  kg: number | null;
}

/**
 * The steering's per-period indicators bound to a formula set: every
 * aggregate (dashboards, map, exports, reports, objective, programme
 * synthesis) computes them from summed facts with the `FORMULE_*` in force.
 */
export interface PeriodFormulas {
  /** `FORMULE_MORTALITE_PERIODE_PCT`, one decimal. */
  mortality(deaths: number, exposed: number): number | null;
  /** `FORMULE_COMPLETUDE_PCT` (days entered / days elapsed × 100), one decimal. */
  completeness(entered: number, elapsed: number): number | null;
  /** `FORMULE_VOLUME_PRODUIT_TETES` and `FORMULE_VOLUME_PRODUIT_KG` (kg, one decimal). */
  produced(heads: number, kg: number): ProducedVolumes;
}

/** Completeness of a period with `FORMULE_COMPLETUDE_PCT`, one decimal. */
export function periodCompletenessPct(
  formulas: readonly FormulaInForce[],
  entered: number,
  elapsed: number,
): number | null {
  return formulaIndicator(
    formulas,
    'completude_pct',
    { jours_saisis: entered, jours_ecoules: elapsed },
    1,
  );
}

/** Volumes produced over a period with the two `FORMULE_VOLUME_PRODUIT_*`. */
export function periodProduced(
  formulas: readonly FormulaInForce[],
  heads: number,
  kg: number,
): ProducedVolumes {
  const values = evaluateOfficialIndicators(formulas, {
    sortis_periode_tetes: heads,
    poids_sortis_periode_kg: kg,
  });
  const h = indicatorValue(values, 'volume_produit_tetes');
  const k = indicatorValue(values, 'volume_produit_kg');
  return {
    heads: h == null ? null : round(h, 0),
    kg: k == null ? null : round(k, 1),
  };
}

/** The period indicators bound to a formula set. */
export function periodFormulasOf(
  formulas: readonly FormulaInForce[],
): PeriodFormulas {
  return {
    mortality: mortalityOf(formulas),
    completeness: (entered, elapsed) =>
      periodCompletenessPct(formulas, entered, elapsed),
    produced: (heads, kg) => periodProduced(formulas, heads, kg),
  };
}

/** Tonnes of a kg volume (3 decimals), null when undefined. */
export function tonnesOf(kg: number | null): number | null {
  return kg == null ? null : round(kg / 1000, 3);
}
// End POUFA lot A2 dge.

/** Labels of the conduct alerts, as the screens and PDFs show them. */
export const CONDUCT_ALERTS_LABEL =
  'Alertes de conduite (conseil Fermia, non sanitaires)';

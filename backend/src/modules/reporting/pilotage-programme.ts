/**
 * What the steering counts (POUFA lot A, audit F1 / F2 / n° 44), read from
 * the programme parameters at the date of the fact:
 * - the bands of the programme (`BANDE_TYPES_ELIGIBLES`, broiler chicken by
 *   default): other species and laying flocks stay out of every aggregate;
 * - the advisory alert kinds shown apart as « alertes de conduite »
 *   (`PILOTAGE_ALERTES_CONDUITE_TYPES`); only published sanitary alerts ever
 *   colour a farm;
 * - the `FORMULE_*` set in force, so the aggregates' mortality goes through
 *   the formula engine (`mortalite_periode_pct`) instead of fixed SQL.
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

/** Labels of the conduct alerts, as the screens and PDFs show them. */
export const CONDUCT_ALERTS_LABEL =
  'Alertes de conduite (conseil Fermia, non sanitaires)';

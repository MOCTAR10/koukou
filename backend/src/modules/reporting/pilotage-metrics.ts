/**
 * Additive facts of the steering dashboards and the figures derived from
 * them. A farm's facts are read in SQL (`PilotageDataService`), summed per
 * province or for the whole scope here, and only then turned into rates and
 * averages (a mean of ratios would weigh a 50-bird band like a 5 000-bird one).
 * Pure, unit-tested.
 */
import type { PeriodFormulas } from './pilotage-programme.js';
import { pct, ratio, round } from './pilotage-rules.js';

/** What a farm (or a group of farms) contributes over a period. */
export interface Facts {
  /** Farms of the registry in the group. */
  farms: number;
  /** Farms with band data (projection rows) in the period. */
  farmsReporting: number;
  /**
   * Farms contributing any figure (bands, placements, sales, alerts): the
   * count the small-group suppression is judged on.
   */
  farmsWithData: number;
  /** Bands with projection rows in the period. */
  bands: number;
  /** Bands with birds present at the end of the period. */
  activeBands: number;
  /** Birds present at the end of the period (or today). */
  headcount: number;
  bandsOpened: number;
  /** Chicks placed in bands opened in the period. */
  placed: number;
  /** Birds at risk: headcount of each band on its first day of the period. */
  exposed: number;
  deaths: number;
  /** Birds that left alive (sales, slaughter, culls, sorties). */
  exits: number;
  /** Live weight of those exits (kg): heads × last known average weight. */
  exitKg: number;
  daysEntered: number;
  daysElapsed: number;
  /** Live birds sold (per piece, or per kg with a head count). */
  liveHeads: number;
  liveKg: number;
  pieceQty: number;
  pieceFcfa: number;
  kgFcfa: number;
  carcassHeads: number;
  carcassKg: number;
  carcassKgFcfa: number;
  carcassPieceQty: number;
  carcassPieceFcfa: number;
  revenueFcfa: number;
  /**
   * Conduct alerts: Fermia advisory alerts (JAUNE/ROUGE) of the kinds listed
   * in `PILOTAGE_ALERTES_CONDUITE_TYPES`, on the programme's bands. Shown
   * apart, never a sanitary alert, never a farm's colour.
   */
  alertsRaised: number;
  alertsRaisedRed: number;
  alertsActive: number;
  alertsActiveRed: number;
  /** Sanitary alerts published by the veterinary authority: the only « alerte ». */
  publishedAlerts: number;
}

export const FACT_KEYS = [
  'farms',
  'farmsReporting',
  'farmsWithData',
  'bands',
  'activeBands',
  'headcount',
  'bandsOpened',
  'placed',
  'exposed',
  'deaths',
  'exits',
  'exitKg',
  'daysEntered',
  'daysElapsed',
  'liveHeads',
  'liveKg',
  'pieceQty',
  'pieceFcfa',
  'kgFcfa',
  'carcassHeads',
  'carcassKg',
  'carcassKgFcfa',
  'carcassPieceQty',
  'carcassPieceFcfa',
  'revenueFcfa',
  'alertsRaised',
  'alertsRaisedRed',
  'alertsActive',
  'alertsActiveRed',
  'publishedAlerts',
] as const satisfies readonly (keyof Facts)[];

export function emptyFacts(): Facts {
  return Object.fromEntries(FACT_KEYS.map((k) => [k, 0])) as unknown as Facts;
}

export function sumFacts(list: readonly Facts[]): Facts {
  const out = emptyFacts();
  for (const f of list) for (const k of FACT_KEYS) out[k] += f[k];
  return out;
}

/** Figures shown for a group of farms. */
export interface PilotageMetrics {
  farms: number;
  farmsReporting: number;
  bands: number;
  activeBands: number;
  headcount: number;
  bandsOpened: number;
  placedHeads: number;
  deaths: number;
  /** `FORMULE_MORTALITE_PERIODE_PCT` (deaths of the period / birds at risk × 100). */
  mortalityPct: number | null;
  /** `FORMULE_VOLUME_PRODUIT_TETES` / `_KG` (null when the formula is undefined). */
  produced: { heads: number | null; kg: number | null; tonnes: number | null };
  sold: {
    liveHeads: number;
    liveKg: number;
    carcassHeads: number;
    carcassKg: number;
    revenueFcfa: number;
    avgPricePerHeadFcfa: number | null;
    avgPricePerKgFcfa: number | null;
    avgCarcassPricePerPieceFcfa: number | null;
    avgCarcassPricePerKgFcfa: number | null;
  };
  completeness: {
    /** `FORMULE_COMPLETUDE_PCT` (days entered / days elapsed × 100). */
    pct: number | null;
    daysEntered: number;
    daysElapsed: number;
  };
  alerts: {
    /** Sanitary alerts published by the veterinary authority (L5): the only « alerte ». */
    published: number;
    /** « Alertes de conduite (conseil, non sanitaires) », shown apart. */
    conduct: ConductAlerts;
  };
}

export interface ConductAlerts {
  /** Conduct alerts (JAUNE/ROUGE) raised in the period. */
  raised: number;
  raisedRed: number;
  /** Conduct alerts still active now. */
  activeNow: number;
  activeRedNow: number;
}

/** Mortality of a period from its summed deaths and birds at risk. */
export type PeriodMortality = (deaths: number, exposed: number) => number | null;

/**
 * POUFA lot A2 dge: plain ratios standing in for the formula set in the unit
 * tests only; the services always pass `periodFormulasOf(rules.formulas)`.
 */
export const PLAIN_PERIOD_FORMULAS: PeriodFormulas = {
  mortality: pct,
  completeness: pct,
  produced: (heads, kg) => ({ heads, kg: round(kg, 1) }),
};

export function conductAlertsOf(f: Facts): ConductAlerts {
  return {
    raised: f.alertsRaised,
    raisedRed: f.alertsRaisedRed,
    activeNow: f.alertsActive,
    activeRedNow: f.alertsActiveRed,
  };
}

/**
 * Figures of a group. `period` holds the period formulas in force
 * (`periodFormulasOf` in pilotage-programme.ts); the plain ratios are only
 * the fallback of the unit tests.
 */
export function metricsOf(
  f: Facts,
  period: PeriodFormulas = PLAIN_PERIOD_FORMULAS,
): PilotageMetrics {
  const produced = period.produced(f.exits, f.exitKg);
  return {
    farms: f.farms,
    farmsReporting: f.farmsReporting,
    bands: f.bands,
    activeBands: f.activeBands,
    headcount: f.headcount,
    bandsOpened: f.bandsOpened,
    placedHeads: f.placed,
    deaths: f.deaths,
    mortalityPct: period.mortality(f.deaths, f.exposed),
    produced: {
      heads: produced.heads,
      kg: produced.kg,
      tonnes: produced.kg == null ? null : round(produced.kg / 1000, 3),
    },
    sold: {
      liveHeads: f.liveHeads,
      liveKg: round(f.liveKg, 1),
      carcassHeads: f.carcassHeads,
      carcassKg: round(f.carcassKg, 1),
      revenueFcfa: f.revenueFcfa,
      avgPricePerHeadFcfa: ratio(f.pieceFcfa, f.pieceQty),
      avgPricePerKgFcfa: ratio(f.kgFcfa, f.liveKg),
      avgCarcassPricePerPieceFcfa: ratio(f.carcassPieceFcfa, f.carcassPieceQty),
      avgCarcassPricePerKgFcfa: ratio(f.carcassKgFcfa, f.carcassKg),
    },
    completeness: {
      pct: period.completeness(f.daysEntered, f.daysElapsed),
      daysEntered: f.daysEntered,
      daysElapsed: f.daysElapsed,
    },
    alerts: {
      published: f.publishedAlerts,
      conduct: conductAlertsOf(f),
    },
  };
}

/** Methods of the dashboards, served with them (French, for the users). */
export const METRIC_NOTES: readonly string[] = [
  'Périmètre : bandes des types éligibles au programme (paramètre BANDE_TYPES_ELIGIBLES, poulet de chair par défaut) ; les autres bandes des fermes sont « hors programme » et n’entrent dans aucun agrégat.',
  'Mortalité de la période = formule FORMULE_MORTALITE_PERIODE_PCT en vigueur (par défaut : morts de la période / effectif présent au premier jour de la période, ou mis en place, × 100), toutes bandes confondues.',
  'Volumes produits = formules FORMULE_VOLUME_PRODUIT_TETES et FORMULE_VOLUME_PRODUIT_KG en vigueur (par défaut : animaux sortis vivants — ventes, abattoir, réformes, autres sorties — et leur poids vif, mesuré à la sortie quand il est saisi, sinon têtes sorties × dernier poids moyen pesé de la bande).',
  'Effectif = animaux présents le dernier jour de la période dans les bandes non clôturées.',
  'Volumes vendus et prix moyens = ventes de poulets vifs et de carcasses non annulées (commandes : à la livraison).',
  'Complétude = formule FORMULE_COMPLETUDE_PCT en vigueur (par défaut : jours saisis / jours écoulés × 100 ; le jour en cours compte une fois saisi).',
  'Alertes : seules les alertes sanitaires publiées par les services vétérinaires comptent comme alertes. Les alertes de conduite (conseil Fermia, non sanitaires, types du paramètre PILOTAGE_ALERTES_CONDUITE_TYPES) sont montrées à part et ne colorent jamais une ferme.',
];

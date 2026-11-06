/**
 * Additive facts of the steering dashboards and the figures derived from
 * them. A farm's facts are read in SQL (`PilotageDataService`), summed per
 * province or for the whole scope here, and only then turned into rates and
 * averages (a mean of ratios would weigh a 50-bird band like a 5 000-bird one).
 * Pure, unit-tested.
 */
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
  produced: { heads: number; kg: number; tonnes: number };
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

export function conductAlertsOf(f: Facts): ConductAlerts {
  return {
    raised: f.alertsRaised,
    raisedRed: f.alertsRaisedRed,
    activeNow: f.alertsActive,
    activeRedNow: f.alertsActiveRed,
  };
}

/**
 * Figures of a group. `mortality` is the period formula in force
 * (`mortalityOf` in pilotage-programme.ts); the plain ratio is only the
 * fallback of the unit tests.
 */
export function metricsOf(
  f: Facts,
  mortality: PeriodMortality = pct,
): PilotageMetrics {
  return {
    farms: f.farms,
    farmsReporting: f.farmsReporting,
    bands: f.bands,
    activeBands: f.activeBands,
    headcount: f.headcount,
    bandsOpened: f.bandsOpened,
    placedHeads: f.placed,
    deaths: f.deaths,
    mortalityPct: mortality(f.deaths, f.exposed),
    produced: {
      heads: f.exits,
      kg: round(f.exitKg, 1),
      tonnes: round(f.exitKg / 1000, 3),
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
      pct: pct(f.daysEntered, f.daysElapsed),
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
  'Volumes produits = animaux sortis vivants (ventes, abattoir, réformes, autres sorties) ; poids = poids vif mesuré à la sortie quand il est saisi, sinon têtes sorties × dernier poids moyen pesé de la bande.',
  'Effectif = animaux présents le dernier jour de la période dans les bandes non clôturées.',
  'Volumes vendus et prix moyens = ventes de poulets vifs et de carcasses non annulées (commandes : à la livraison).',
  'Complétude = jours saisis / jours écoulés × 100 (le jour en cours compte une fois saisi).',
  'Alertes : seules les alertes sanitaires publiées par les services vétérinaires comptent comme alertes. Les alertes de conduite (conseil Fermia, non sanitaires, types du paramètre PILOTAGE_ALERTES_CONDUITE_TYPES) sont montrées à part et ne colorent jamais une ferme.',
];

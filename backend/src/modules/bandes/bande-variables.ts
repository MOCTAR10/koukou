/**
 * Base variables of a POUFA band at a date, fed to the formula engine
 * (`POUFA_BASE_VARIABLES`). Pure: the indicator service reads the rows.
 *
 * - Headcount follows the CDC: présents = mis en place − morts − sorties.
 * - `sortis_tetes` counts every exit that is not a death: sales, slaughter,
 *   culls and sorties. Their live weight is the weight measured on the sortie
 *   when there is one, else the interpolated band weight that day.
 * - Weights are only known on weighing days: `poids_moyen_g` is the last
 *   weighing on or before the date, and `jours_elevage` runs to that weighing
 *   so the GMQ does not decay between weighings.
 */
import {
  daysBetween,
  populationOn,
  weightOn,
  type FlockEntry,
  type FlockTimeline,
} from '../batches/flock-performance.js';
import { addDays } from '../batches/poufa/bande-rules.js';

export interface BandeVariablesInput {
  integrationDate: string;
  initialAgeDays: number | null;
  /** Measured at opening (J+x); null = chick weight of the species. */
  initialAvgWeightG: number | null;
  day1WeightKg: number;
  quantityAtStart: number;
  capacityPlaces: number | null;
  asOf: string;
  entries: readonly FlockEntry[];
  /** Every removal per day (MORTALITE events and removal sorties included). */
  removalsByDate: ReadonlyMap<string, number>;
  deathEventsByDate: ReadonlyMap<string, number>;
  /** Effective sorties with a measured weight (their heads are in removals). */
  weighedSorties: readonly { date: string; count: number; weightKg: number }[];
  revenueFcfa: number | null;
  chargesFcfa: number | null;
}

export type BandeVariables = Record<string, number | null>;

const round = (n: number, digits = 3) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

export function bandeVariables(input: BandeVariablesInput): BandeVariables {
  const asOf = input.asOf;
  const initialKg =
    input.initialAvgWeightG != null
      ? input.initialAvgWeightG / 1000
      : input.day1WeightKg;
  const entries = input.entries.filter((e) => e.entryDate <= asOf);
  const removals = new Map(
    [...input.removalsByDate].filter(([d]) => d <= asOf),
  );
  const deathEvents = new Map(
    [...input.deathEventsByDate].filter(([d]) => d <= asOf),
  );
  const timeline: FlockTimeline = {
    integrationDate: input.integrationDate,
    quantityAtStart: input.quantityAtStart,
    day1WeightKg: initialKg,
    entries,
    removalsByDate: removals,
    deathEventsByDate: deathEvents,
  };

  let deaths = 0;
  let deathsToday = 0;
  let feedKg = 0;
  for (const e of entries) {
    deaths += e.deaths;
    feedKg += e.feedQuantity;
    if (e.entryDate === asOf) deathsToday += e.deaths;
  }
  for (const [d, n] of deathEvents) {
    deaths += n;
    if (d === asOf) deathsToday += n;
  }

  let exits = 0;
  let exitsKg = 0;
  for (const [d, n] of removals) {
    const others = Math.max(0, n - (deathEvents.get(d) ?? 0));
    exits += others;
    exitsKg += others * weightOn(timeline, d);
  }
  for (const s of input.weighedSorties) {
    if (s.date > asOf) continue;
    exitsKg += s.weightKg - s.count * weightOn(timeline, s.date);
  }

  const weighings = entries
    .filter((e) => e.avgWeightKg != null && e.avgWeightKg > 0)
    .sort((a, b) => a.entryDate.localeCompare(b.entryDate));
  const last = weighings[weighings.length - 1] ?? null;
  const present = populationOn(timeline, asOf);
  const presentYesterday =
    asOf <= input.integrationDate
      ? input.quantityAtStart
      : populationOn(timeline, addDays(asOf, -1));
  // A weight measured at opening counts from the opening; the chick weight
  // counts from hatching (age).
  const daysFrom =
    input.initialAvgWeightG != null ? 0 : (input.initialAgeDays ?? 0);
  const rearingDays =
    daysBetween(input.integrationDate, last?.entryDate ?? asOf) + daysFrom;

  return {
    mis_en_place: input.quantityAtStart,
    morts_cumules: deaths,
    morts_jour: deathsToday,
    presents: present,
    presents_veille: presentYesterday,
    sortis_tetes: exits,
    poids_sortis_kg: round(Math.max(0, exitsKg)),
    poids_presents_kg:
      present === 0 ? 0 : last ? round(present * last.avgWeightKg!) : null,
    poids_poussins_kg: round(input.quantityAtStart * initialKg),
    poids_moyen_g: last ? round(last.avgWeightKg! * 1000, 1) : null,
    poids_initial_g: round(initialKg * 1000, 1),
    jours_elevage: rearingDays,
    aliment_kg: round(feedKg),
    charges_fcfa: input.chargesFcfa,
    ca_fcfa: input.revenueFcfa,
    capacite_places: input.capacityPlaces,
  };
}

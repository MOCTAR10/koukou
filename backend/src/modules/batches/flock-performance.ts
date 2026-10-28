/**
 * Pure zootechnical calculations shared by metrics, advisory alerts and the
 * batch curve. They all rely on the same two ideas:
 *
 * - The population on a given day is the starting headcount minus every bird
 *   that left before the end of that day: daily-entry deaths AND removals
 *   (sales, slaughter, sanitary culls). Ignoring removals makes per-bird
 *   ratios jump as soon as birds are sold.
 * - Weight is only known on weighing days. FCR / GMQ / IPE are therefore
 *   computed AT the last weighing (feed and age up to that day), never
 *   stretched to today, otherwise they degrade every day without a weighing.
 */

export interface FlockEntry {
  entryDate: string;
  deaths: number;
  feedQuantity: number;
  waterL: number;
  avgWeightKg: number | null;
}

export interface FlockTimeline {
  integrationDate: string;
  quantityAtStart: number;
  day1WeightKg: number;
  /** Entries in any order; dates are YYYY-MM-DD. */
  entries: FlockEntry[];
  /** Birds removed per date (sales, slaughter, sanitary culls). */
  removalsByDate: Map<string, number>;
}

export interface PerformanceAtWeighing {
  weighingDate: string;
  /** Age at the weighing (days since integration). */
  ageDays: number;
  avgWeightKg: number;
  population: number;
  feedKg: number;
  /** Live weight produced: present birds + birds that left, minus day-1 weight. */
  biomassGainKg: number;
  fcr: number | null;
  gmqGramsPerDay: number | null;
  viabilityPercent: number;
  ipe: number | null;
}

/**
 * Indice de Performance Européen:
 * poids (kg) × viabilité (%) × 100 / (âge (j) × IC).
 * Scale is roughly 250–400 for a normal broiler lot, so it can only be judged
 * against a reference computed the same way (see `ipeTarget` in metrics).
 */
export function ipeOf(
  weightKg: number,
  viabilityPercent: number,
  ageDays: number,
  fcr: number | null,
): number | null {
  return fcr != null && fcr > 0 && ageDays > 0
    ? (weightKg * viabilityPercent * 100) / (ageDays * fcr)
    : null;
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.max(0, Math.floor((b - a) / 86400000));
}

/** Headcount at the end of `date`. */
export function populationOn(t: FlockTimeline, date: string): number {
  let out = 0;
  for (const e of t.entries) if (e.entryDate <= date) out += e.deaths;
  for (const [d, n] of t.removalsByDate) if (d <= date) out += n;
  return Math.max(0, t.quantityAtStart - out);
}

function weighings(t: FlockTimeline, upTo?: string) {
  return t.entries
    .filter(
      (e) =>
        e.avgWeightKg != null &&
        e.avgWeightKg > 0 &&
        (upTo == null || e.entryDate <= upTo),
    )
    .sort((a, b) => a.entryDate.localeCompare(b.entryDate));
}

/**
 * Average weight on `date`, linearly interpolated between day 1 and the
 * weighings (held flat after the last one).
 */
export function weightOn(t: FlockTimeline, date: string): number {
  const points = [
    { date: t.integrationDate, kg: t.day1WeightKg },
    ...weighings(t).map((e) => ({ date: e.entryDate, kg: e.avgWeightKg! })),
  ];
  let prev = points[0];
  for (const p of points.slice(1)) {
    if (date <= p.date) {
      const span = daysBetween(prev.date, p.date);
      if (span === 0) return p.kg;
      const ratio = daysBetween(prev.date, date) / span;
      return prev.kg + (p.kg - prev.kg) * ratio;
    }
    prev = p;
  }
  return prev.kg;
}

/** FCR / GMQ / IPE at the last weighing on or before `asOf` (null if none). */
export function performanceAtLastWeighing(
  t: FlockTimeline,
  asOf?: string,
): PerformanceAtWeighing | null {
  const ws = weighings(t, asOf);
  const last = ws[ws.length - 1];
  if (!last) return null;
  const date = last.entryDate;
  const kg = last.avgWeightKg!;
  const ageDays = daysBetween(t.integrationDate, date);
  const population = populationOn(t, date);

  let feedKg = 0;
  let deaths = 0;
  let removedGainKg = 0;
  for (const e of t.entries) {
    if (e.entryDate > date) continue;
    feedKg += e.feedQuantity;
    deaths += e.deaths;
    if (e.deaths > 0) {
      removedGainKg += e.deaths * (weightOn(t, e.entryDate) - t.day1WeightKg);
    }
  }
  for (const [d, n] of t.removalsByDate) {
    if (d > date || n <= 0) continue;
    removedGainKg += n * (weightOn(t, d) - t.day1WeightKg);
  }
  const biomassGainKg =
    population * (kg - t.day1WeightKg) + Math.max(0, removedGainKg);

  const fcr = biomassGainKg > 0 && feedKg > 0 ? feedKg / biomassGainKg : null;
  const gmqGramsPerDay =
    ageDays > 0 ? ((kg - t.day1WeightKg) * 1000) / ageDays : null;
  const viabilityPercent =
    t.quantityAtStart > 0
      ? Math.max(0, 100 - (deaths / t.quantityAtStart) * 100)
      : 100;
  const ipe = ipeOf(kg, viabilityPercent, ageDays, fcr);

  return {
    weighingDate: date,
    ageDays,
    avgWeightKg: kg,
    population,
    feedKg,
    biomassGainKg,
    fcr,
    gmqGramsPerDay,
    viabilityPercent,
    ipe,
  };
}

/** Water per bird for one day's entry (null if no water or no birds). */
export function waterPerBirdOn(
  t: FlockTimeline,
  entry: FlockEntry,
): number | null {
  if (entry.waterL <= 0) return null;
  const pop = populationOn(t, entry.entryDate);
  return pop > 0 ? entry.waterL / pop : null;
}

/**
 * Average daily water per bird (L/oiseau/j) over the days with a water
 * reading in (`from`, `to`].
 */
export function avgDailyWaterPerBird(
  t: FlockTimeline,
  from: string,
  to: string,
): number | null {
  let sum = 0;
  let n = 0;
  for (const e of t.entries) {
    if (e.entryDate <= from || e.entryDate > to) continue;
    const v = waterPerBirdOn(t, e);
    if (v == null) continue;
    sum += v;
    n += 1;
  }
  return n > 0 ? sum / n : null;
}

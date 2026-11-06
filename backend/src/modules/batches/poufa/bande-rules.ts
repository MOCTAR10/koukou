/**
 * Pure rules of a POUFA band (CDC § Bandes d'élevage, architecture §7-§8):
 * age with a mid-cycle opening (J+x), daily projection rows, completeness and
 * weighing schedule. No I/O: services feed them with rows they read.
 */
import { daysBetween } from '../flock-performance.js';

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` of `now` in UTC (all band dates are UTC days). */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * Instant at which the parameters "of a day" are read: the end of that day,
 * or now when the day is not over yet (a formula changed this morning
 * applies to today's figures).
 */
export function factInstant(day: string, now: Date = new Date()): Date {
  const end = new Date(Date.parse(`${day}T23:59:59.999Z`));
  return end.getTime() > now.getTime() ? now : end;
}

/** Age of the birds on `day`: age at opening + days since opening. */
export function ageOn(
  integrationDate: string,
  initialAgeDays: number | null,
  day: string,
): number {
  return (initialAgeDays ?? 0) + daysBetween(integrationDate, day);
}

/**
 * Day the birds were at age 0 (J0): the integration date moved back by the
 * age at opening. A care step or a curve week at age N falls on J0 + N.
 */
export function ageZeroDay(
  integrationDate: string,
  initialAgeDays: number | null,
): string {
  return addDays(integrationDate.slice(0, 10), -(initialAgeDays ?? 0));
}

/**
 * Planned end of the band: the reference duration counts from placement, so
 * a band opened at J+x ends x days sooner.
 */
export function expectedEndDate(
  integrationDate: string,
  initialAgeDays: number | null,
  referenceDurationDays: number | null,
): string | null {
  if (referenceDurationDays == null) return null;
  return addDays(
    integrationDate,
    Math.max(0, referenceDurationDays - (initialAgeDays ?? 0)),
  );
}

/**
 * A catch-up entry is recorded after the day following its date (the farmer
 * fills in earlier days, e.g. from the paper sheet). Today and yesterday are
 * normal entries (the evening entry often lands after midnight UTC+1).
 */
export function isCatchUp(entryDate: string, now: Date = new Date()): boolean {
  return entryDate.slice(0, 10) < addDays(utcDay(now), -1);
}

export interface StatsEntry {
  entryDate: string;
  deaths: number;
  feedQuantity: number;
  avgWeightKg: number | null;
  sampleSize: number | null;
  catchUp: boolean;
}

export interface DailyStatsInput {
  integrationDate: string;
  initialAgeDays: number | null;
  quantityAtStart: number;
  /** Weight at opening (g): measured at J+x, else the chick weight. */
  initialWeightG: number | null;
  /** Last day of the projection (inclusive). */
  endDay: string;
  entries: readonly StatsEntry[];
  /**
   * Every bird that left per day apart from daily-entry deaths: sales,
   * slaughter, REFORME/MORTALITE health events and removal sorties
   * (`FlockReconciliationService.removalsByDate`).
   */
  removalsByDate: ReadonlyMap<string, number>;
  /** The MORTALITE health events among `removalsByDate`. */
  deathEventsByDate: ReadonlyMap<string, number>;
  /** `FORMULE_MORTALITE_JOUR_PCT` in force on `day`. */
  mortalityPct: (
    day: string,
    deaths: number,
    presentStart: number,
  ) => number | null;
}

export interface DailyStatRow {
  day: string;
  ageDays: number;
  presentStart: number;
  deaths: number;
  mortalityDayPct: number | null;
  deathsCumulative: number;
  removals: number;
  removalsCumulative: number;
  present: number;
  feedKg: number;
  feedCumulativeKg: number;
  lastWeightG: number | null;
  weighed: boolean;
  sampleSize: number | null;
  entryDone: boolean;
  catchUp: boolean;
}

/**
 * One row per day from opening to `endDay`. Movements dated before the
 * opening (should not happen) are counted on the first day so the headcount
 * still adds up.
 */
export function buildDailyStats(input: DailyStatsInput): DailyStatRow[] {
  const start = input.integrationDate.slice(0, 10);
  const clampDay = (d: string) => (d < start ? start : d.slice(0, 10));
  const entries = new Map<string, StatsEntry>();
  const entryDeaths = new Map<string, number>();
  for (const e of input.entries) {
    const day = clampDay(e.entryDate);
    // One entry per (batch, date); a pre-opening one only adds its deaths.
    if (day === e.entryDate.slice(0, 10)) entries.set(day, e);
    entryDeaths.set(day, (entryDeaths.get(day) ?? 0) + e.deaths);
  }
  const removals = new Map<string, number>();
  for (const [d, n] of input.removalsByDate) {
    const day = clampDay(d);
    removals.set(day, (removals.get(day) ?? 0) + n);
  }
  const deathEvents = new Map<string, number>();
  for (const [d, n] of input.deathEventsByDate) {
    const day = clampDay(d);
    deathEvents.set(day, (deathEvents.get(day) ?? 0) + n);
  }

  const rows: DailyStatRow[] = [];
  let present = input.quantityAtStart;
  let deathsCumulative = 0;
  let removalsCumulative = 0;
  let feedCumulativeKg = 0;
  let lastWeightG = input.initialWeightG;
  for (let day = start; day <= input.endDay; day = addDays(day, 1)) {
    const entry = entries.get(day);
    const events = deathEvents.get(day) ?? 0;
    const deaths = (entryDeaths.get(day) ?? 0) + events;
    const others = Math.max(0, (removals.get(day) ?? 0) - events);
    const presentStart = present;
    present = Math.max(0, presentStart - deaths - others);
    deathsCumulative += deaths;
    removalsCumulative += others;
    const feedKg = entry?.feedQuantity ?? 0;
    feedCumulativeKg += feedKg;
    const weighed = entry?.avgWeightKg != null && entry.avgWeightKg > 0;
    if (weighed) lastWeightG = entry.avgWeightKg! * 1000;
    rows.push({
      day,
      ageDays: ageOn(start, input.initialAgeDays, day),
      presentStart,
      deaths,
      mortalityDayPct: input.mortalityPct(day, deaths, presentStart),
      deathsCumulative,
      removals: others,
      removalsCumulative,
      present,
      feedKg,
      feedCumulativeKg,
      lastWeightG,
      weighed,
      sampleSize: weighed ? (entry.sampleSize ?? null) : null,
      entryDone: entry != null,
      catchUp: entry?.catchUp ?? false,
    });
  }
  return rows;
}

/**
 * Completeness (CDC « Qualité et complétude ») = days entered / days elapsed
 * × 100, one decimal, over the band's days from `startDay` to `endDay`
 * (today, or the closure day). Elapsed days come from the dates, not from the
 * projection rows (a band nobody touches gets no new rows). Today counts once
 * its entry is done: the day is not over. Null before the first elapsed day.
 */
export function completenessPct(
  rows: readonly { day: string; entryDone: boolean }[],
  startDay: string,
  endDay: string,
  today: string,
): number | null {
  const last = endDay < today ? endDay : today;
  if (last < startDay) return null;
  const entered = new Set(
    rows
      .filter((r) => r.entryDone && r.day >= startDay && r.day <= last)
      .map((r) => r.day),
  );
  let elapsed = daysBetween(startDay, last) + 1;
  if (last === today && !entered.has(today)) elapsed -= 1;
  return elapsed > 0
    ? Math.round((entered.size / elapsed) * 1000) / 10
    : null;
}

export interface WeighingStatus {
  frequencyDays: number;
  expectedSampleSize: number;
  lastWeighingDate: string | null;
  lastSampleSize: number | null;
  /** The last weighing used fewer birds than the parameter asks. */
  lastSampleBelowExpected: boolean;
  nextDueDate: string;
  daysLate: number;
  late: boolean;
}

/**
 * Weighing schedule: one weighing every `frequencyDays` (PESEE_FREQUENCE_J),
 * counted from the last weighing, or from the opening before the first one.
 * A closed band is never late.
 */
export function weighingStatus(input: {
  integrationDate: string;
  weighings: readonly { date: string; sampleSize: number | null }[];
  frequencyDays: number;
  expectedSampleSize: number;
  today: string;
  closed: boolean;
}): WeighingStatus {
  const sorted = [...input.weighings].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const last = sorted[sorted.length - 1] ?? null;
  const from = last?.date ?? input.integrationDate.slice(0, 10);
  const nextDueDate = addDays(from, input.frequencyDays);
  const late = !input.closed && input.today > nextDueDate;
  return {
    frequencyDays: input.frequencyDays,
    expectedSampleSize: input.expectedSampleSize,
    lastWeighingDate: last?.date ?? null,
    lastSampleSize: last?.sampleSize ?? null,
    lastSampleBelowExpected:
      last?.sampleSize != null && last.sampleSize < input.expectedSampleSize,
    nextDueDate,
    daysLate: late ? daysBetween(nextDueDate, input.today) : 0,
    late,
  };
}

import {
  daysBetween,
  populationOn,
  type FlockTimeline,
} from './flock-performance.js';

/** The part of a breed standard row the feed tracking reads. */
export interface FeedStandardRow {
  week: number;
  targetDailyFeedG: number | null;
}

/** One day with a feed entry. */
export interface DailyFeedPoint {
  date: string;
  /** Feed given that day (kg, as typed). */
  feedKg: number;
  /** Birds alive at the end of that day (deaths and removals deducted). */
  birds: number;
  /** Feed per bird that day (g), 0.1 g. */
  feedPerBirdG: number;
  /** Breed standard for the age week of that day (g/bird/day); null without one. */
  targetDailyFeedG: number | null;
  /** Water / feed (L per kg), null when either quantity is missing or zero. */
  waterFeedRatio: number | null;
}

export interface FeedTotals {
  /** Feed of every entry of the batch (kg). */
  totalFeedKg: number;
  /** Days with a feed entry and live birds, the basis of the two figures below. */
  countedDays: number;
  /** Sum of the daily feed per bird over the counted days (g). */
  feedPerBirdToDateG: number;
  /**
   * Standard cumulated over the SAME counted days (g/bird). Null as soon as
   * the standard is missing on one counted day: a partial sum would flatter
   * the comparison. Days without any feed entry count on neither side.
   */
  standardToDateG: number | null;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Standard of the age week on `date`: week = floor(age / 7) + 1, last row not
 * after it (the last row once past the curve, the first before it). Same rule
 * as the batch metrics' breed comparison. `standards` sorted by week.
 */
export function standardFeedOn(
  standards: readonly FeedStandardRow[],
  t: Pick<FlockTimeline, 'integrationDate' | 'initialAgeDays'>,
  date: string,
): number | null {
  if (standards.length === 0) return null;
  const ageDays = (t.initialAgeDays ?? 0) + daysBetween(t.integrationDate, date);
  const ageWeek = Math.floor(ageDays / 7) + 1;
  let row = standards[0]!;
  for (const s of standards) if (s.week <= ageWeek) row = s;
  return row.targetDailyFeedG;
}

/** Daily feed per bird against the standard, water/feed ratio, cumulated totals. */
export function dailyFeedSeries(
  t: FlockTimeline,
  standards: readonly FeedStandardRow[],
): { daily: DailyFeedPoint[]; totals: FeedTotals } {
  const sorted = [...standards].sort((a, b) => a.week - b.week);
  const entries = [...t.entries].sort((a, b) =>
    a.entryDate.localeCompare(b.entryDate),
  );
  const daily: DailyFeedPoint[] = [];
  let totalFeedKg = 0;
  let perBirdSum = 0;
  let standardSum = 0;
  let standardComplete = true;

  for (const e of entries) {
    if (e.feedQuantity <= 0) continue;
    totalFeedKg += e.feedQuantity;
    const birds = populationOn(t, e.entryDate);
    if (birds <= 0) continue;
    const perBird = (e.feedQuantity * 1000) / birds;
    const target = standardFeedOn(sorted, t, e.entryDate);
    perBirdSum += perBird;
    if (target == null) standardComplete = false;
    else standardSum += target;
    daily.push({
      date: e.entryDate,
      feedKg: round2(e.feedQuantity),
      birds,
      feedPerBirdG: round1(perBird),
      targetDailyFeedG: target == null ? null : round1(target),
      waterFeedRatio:
        e.waterL > 0 ? round2(e.waterL / e.feedQuantity) : null,
    });
  }

  return {
    daily,
    totals: {
      totalFeedKg: round2(totalFeedKg),
      countedDays: daily.length,
      feedPerBirdToDateG: round1(perBirdSum),
      standardToDateG:
        daily.length > 0 && standardComplete ? round1(standardSum) : null,
    },
  };
}

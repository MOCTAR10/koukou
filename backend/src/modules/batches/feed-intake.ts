import { AlertLevel } from '../../common/enums/alert-level.enum.js';
import {
  populationOn,
  type FlockEntry,
  type FlockTimeline,
} from './flock-performance.js';

/** Days of feed entries averaged for the baseline and the standard comparison. */
export const FEED_WINDOW_DAYS = 3;

/** Feed eaten per live bird on one entered day (grams). */
export interface FeedDay {
  date: string;
  gPerBird: number;
}

/**
 * Feed per live bird (g/bird/day) of every entry carrying feed, latest first.
 * `feedQuantity` is in kg; the population of each day deducts deaths AND
 * removals (see `populationOn`), like the water figures.
 */
export function feedPerBirdDays(t: FlockTimeline): FeedDay[] {
  const out: FeedDay[] = [];
  for (const e of t.entries as FlockEntry[]) {
    if (!(e.feedQuantity > 0)) continue;
    const pop = populationOn(t, e.entryDate);
    if (pop <= 0) continue;
    out.push({ date: e.entryDate, gPerBird: (e.feedQuantity * 1000) / pop });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export interface FeedDrop {
  todayG: number;
  baselineG: number;
  dropPct: number;
  baselineDays: number;
}

/**
 * Drop of the last entered day versus the mean of the previous `window` days
 * with feed. `days` is latest first; `latestEntryDate` is the date of the last
 * daily entry of the batch: when that entry carries no feed there is no
 * reading (null), a missing value is never replaced by an older day.
 */
export function computeFeedDrop(
  days: readonly FeedDay[],
  latestEntryDate: string | null,
  window = FEED_WINDOW_DAYS,
): FeedDrop | null {
  if (!latestEntryDate || days.length < 2) return null;
  if (days[0]!.date !== latestEntryDate) return null;
  const base = days.slice(1, 1 + Math.max(1, Math.round(window)));
  const baselineG = base.reduce((s, d) => s + d.gPerBird, 0) / base.length;
  if (!(baselineG > 0)) return null;
  const todayG = days[0]!.gPerBird;
  return {
    todayG,
    baselineG,
    dropPct: ((baselineG - todayG) / baselineG) * 100,
    baselineDays: base.length,
  };
}

export interface FeedDeviation {
  meanG: number;
  standardG: number;
  /** Positive = below the standard. */
  belowPct: number;
  days: number;
}

/**
 * Mean feed per bird over the last `window` entered days versus the breed
 * standard of the week. Null without a positive standard or without a full
 * window of days (a single day is too noisy to judge).
 */
export function computeFeedDeviation(
  days: readonly FeedDay[],
  standardG: number | null | undefined,
  window = FEED_WINDOW_DAYS,
): FeedDeviation | null {
  if (standardG == null || !(standardG > 0)) return null;
  const n = Math.max(1, Math.round(window));
  if (days.length < n) return null;
  const last = days.slice(0, n);
  const meanG = last.reduce((s, d) => s + d.gPerBird, 0) / n;
  return {
    meanG,
    standardG,
    belowPct: ((standardG - meanG) / standardG) * 100,
    days: n,
  };
}

export interface FeedThresholds {
  dropWarnPct: number;
  dropCriticalPct: number;
  standardWarnPct: number;
}

export type FeedVerdict =
  | { cause: 'DROP'; level: AlertLevel; drop: FeedDrop }
  | { cause: 'STANDARD'; level: AlertLevel; deviation: FeedDeviation }
  | null;

/**
 * Single verdict for the CONSOMMATION_ALIMENT alert: a critical drop (ROUGE)
 * outranks a warning drop (JAUNE), which outranks a deviation from the
 * standard (JAUNE). Null = back to normal (the alert is cleared).
 */
export function feedVerdict(
  drop: FeedDrop | null,
  deviation: FeedDeviation | null,
  th: FeedThresholds,
): FeedVerdict {
  if (drop && drop.dropPct > th.dropCriticalPct) {
    return { cause: 'DROP', level: AlertLevel.ROUGE, drop };
  }
  if (drop && drop.dropPct > th.dropWarnPct) {
    return { cause: 'DROP', level: AlertLevel.JAUNE, drop };
  }
  if (deviation && deviation.belowPct > th.standardWarnPct) {
    return { cause: 'STANDARD', level: AlertLevel.JAUNE, deviation };
  }
  return null;
}

/**
 * Standard row for an age: week = floor(age / 7) + 1, the last row not after
 * that week (the last row once past the curve), the first one before it. Same
 * rule as `MetricsService.pickStandard`. `rows` must be sorted by week.
 */
export function standardForAge<T extends { week: number }>(
  rows: readonly T[],
  ageDays: number,
): T | null {
  if (rows.length === 0) return null;
  const ageWeek = Math.floor(ageDays / 7) + 1;
  const applicable = rows.filter((r) => r.week <= ageWeek);
  return applicable.length > 0 ? applicable[applicable.length - 1]! : rows[0]!;
}

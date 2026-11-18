import { describe, expect, it } from 'vitest';
import { AlertLevel } from '../../common/enums/alert-level.enum.js';
import {
  computeFeedDeviation,
  computeFeedDrop,
  feedPerBirdDays,
  feedVerdict,
  standardForAge,
} from './feed-intake.js';
import type { FlockTimeline } from './flock-performance.js';

const TH = { dropWarnPct: 10, dropCriticalPct: 25, standardWarnPct: 15 };

function timeline(
  feeds: Array<[string, number, number?]>,
  start = 1000,
): FlockTimeline {
  return {
    integrationDate: '2026-01-01',
    quantityAtStart: start,
    day1WeightKg: 0.04,
    entries: feeds.map(([entryDate, feedQuantity, deaths]) => ({
      entryDate,
      deaths: deaths ?? 0,
      feedQuantity,
      waterL: 0,
      avgWeightKg: null,
    })),
    removalsByDate: new Map(),
  };
}

describe('feedPerBirdDays', () => {
  it('converts kg to g per live bird, latest first, skipping days without feed', () => {
    const days = feedPerBirdDays(
      timeline([
        ['2026-01-10', 100],
        ['2026-01-11', 0],
        ['2026-01-12', 110, 100],
      ]),
    );
    expect(days.map((d) => d.date)).toEqual(['2026-01-12', '2026-01-10']);
    expect(days[1]!.gPerBird).toBeCloseTo(100, 5);
    // 110 kg / 900 live birds
    expect(days[0]!.gPerBird).toBeCloseTo((110 * 1000) / 900, 5);
  });
});

describe('computeFeedDrop', () => {
  const days = [
    { date: '2026-01-14', gPerBird: 70 },
    { date: '2026-01-13', gPerBird: 100 },
    { date: '2026-01-12', gPerBird: 100 },
    { date: '2026-01-11', gPerBird: 100 },
    { date: '2026-01-10', gPerBird: 10 },
  ];

  it('compares the last day to the mean of the 3 previous ones', () => {
    const drop = computeFeedDrop(days, '2026-01-14')!;
    expect(drop.baselineDays).toBe(3);
    expect(drop.baselineG).toBeCloseTo(100, 5);
    expect(drop.dropPct).toBeCloseTo(30, 5);
  });

  it('gives no reading when the last entry has no feed or there is no baseline', () => {
    expect(computeFeedDrop(days, '2026-01-15')).toBeNull();
    expect(computeFeedDrop(days.slice(0, 1), '2026-01-14')).toBeNull();
    expect(computeFeedDrop([], null)).toBeNull();
  });
});

describe('computeFeedDeviation', () => {
  const days = [
    { date: '3', gPerBird: 80 },
    { date: '2', gPerBird: 90 },
    { date: '1', gPerBird: 100 },
  ];

  it('measures the mean over 3 days below the standard', () => {
    const dev = computeFeedDeviation(days, 120)!;
    expect(dev.meanG).toBeCloseTo(90, 5);
    expect(dev.belowPct).toBeCloseTo(25, 5);
  });

  it('is skipped without a standard or without 3 days', () => {
    expect(computeFeedDeviation(days, null)).toBeNull();
    expect(computeFeedDeviation(days, 0)).toBeNull();
    expect(computeFeedDeviation(days.slice(0, 2), 120)).toBeNull();
  });
});

describe('feedVerdict', () => {
  const drop = (dropPct: number) => ({
    todayG: 1,
    baselineG: 1,
    dropPct,
    baselineDays: 3,
  });
  const dev = (belowPct: number) => ({
    meanG: 1,
    standardG: 1,
    belowPct,
    days: 3,
  });

  it('ranks a critical drop, a warning drop, then the standard deviation', () => {
    expect(feedVerdict(drop(30), dev(40), TH)?.level).toBe(AlertLevel.ROUGE);
    expect(feedVerdict(drop(15), null, TH)?.level).toBe(AlertLevel.JAUNE);
    const std = feedVerdict(drop(5), dev(20), TH);
    expect(std?.level).toBe(AlertLevel.JAUNE);
    expect(std?.cause).toBe('STANDARD');
  });

  it('is null when back to normal', () => {
    expect(feedVerdict(drop(10), dev(15), TH)).toBeNull();
    expect(feedVerdict(null, null, TH)).toBeNull();
  });
});

describe('standardForAge', () => {
  const rows = [{ week: 1 }, { week: 2 }, { week: 3 }];
  it('picks the week of the age, capped at the last row', () => {
    expect(standardForAge(rows, 0)).toBe(rows[0]);
    expect(standardForAge(rows, 8)).toBe(rows[1]);
    expect(standardForAge(rows, 200)).toBe(rows[2]);
    expect(standardForAge([], 5)).toBeNull();
  });
});

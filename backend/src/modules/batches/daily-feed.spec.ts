import { describe, expect, it } from 'vitest';
import { dailyFeedSeries, standardFeedOn } from './daily-feed.js';
import type { FlockEntry, FlockTimeline } from './flock-performance.js';

const entry = (over: Partial<FlockEntry> & { entryDate: string }): FlockEntry => ({
  deaths: 0,
  feedQuantity: 0,
  waterL: 0,
  avgWeightKg: null,
  ...over,
});

const timeline = (entries: FlockEntry[], over: Partial<FlockTimeline> = {}): FlockTimeline => ({
  integrationDate: '2026-01-01',
  quantityAtStart: 100,
  day1WeightKg: 0.042,
  entries,
  removalsByDate: new Map(),
  ...over,
});

const STANDARDS = [
  { week: 1, targetDailyFeedG: 15 },
  { week: 2, targetDailyFeedG: 30 },
];

describe('standardFeedOn', () => {
  it('maps the age to its week, the last row after the curve', () => {
    const t = { integrationDate: '2026-01-01', initialAgeDays: 0 };
    expect(standardFeedOn(STANDARDS, t, '2026-01-02')).toBe(15);
    expect(standardFeedOn(STANDARDS, t, '2026-01-09')).toBe(30);
    expect(standardFeedOn(STANDARDS, t, '2026-03-01')).toBe(30);
  });

  it('counts the age at opening and answers null without a standard', () => {
    const t = { integrationDate: '2026-01-01', initialAgeDays: 7 };
    expect(standardFeedOn(STANDARDS, t, '2026-01-02')).toBe(30);
    expect(standardFeedOn([], t, '2026-01-02')).toBeNull();
  });
});

describe('dailyFeedSeries', () => {
  const entries = [
    entry({ entryDate: '2026-01-02', feedQuantity: 5, waterL: 10 }),
    entry({ entryDate: '2026-01-05', deaths: 10 }),
    entry({ entryDate: '2026-01-09', feedQuantity: 9, waterL: 0 }),
  ];

  it('gives feed per bird on the live headcount of each day', () => {
    const { daily, totals } = dailyFeedSeries(timeline(entries), STANDARDS);
    expect(daily).toHaveLength(2);
    expect(daily[0]).toMatchObject({
      date: '2026-01-02',
      birds: 100,
      feedPerBirdG: 50,
      targetDailyFeedG: 15,
      waterFeedRatio: 2,
    });
    expect(daily[1]).toMatchObject({
      date: '2026-01-09',
      birds: 90,
      feedPerBirdG: 100,
      targetDailyFeedG: 30,
      waterFeedRatio: null,
    });
    expect(totals).toEqual({
      totalFeedKg: 14,
      countedDays: 2,
      feedPerBirdToDateG: 150,
      standardToDateG: 45,
    });
  });

  it('keeps the series without a standard and drops the cumulated standard', () => {
    const { daily, totals } = dailyFeedSeries(timeline(entries), []);
    expect(daily.every((d) => d.targetDailyFeedG === null)).toBe(true);
    expect(totals.standardToDateG).toBeNull();
    expect(totals.feedPerBirdToDateG).toBe(150);
  });

  it('gives no cumulated standard when one counted day lacks it', () => {
    const { totals } = dailyFeedSeries(timeline(entries), [
      { week: 1, targetDailyFeedG: 15 },
      { week: 2, targetDailyFeedG: null },
    ]);
    expect(totals.standardToDateG).toBeNull();
  });

  it('ignores days without feed and empty flocks', () => {
    const none = dailyFeedSeries(timeline([entry({ entryDate: '2026-01-02' })]), STANDARDS);
    expect(none.daily).toEqual([]);
    expect(none.totals.standardToDateG).toBeNull();
    const emptied = dailyFeedSeries(
      timeline([entry({ entryDate: '2026-01-02', feedQuantity: 5 })], {
        removalsByDate: new Map([['2026-01-01', 100]]),
      }),
      STANDARDS,
    );
    expect(emptied.daily).toEqual([]);
    expect(emptied.totals.totalFeedKg).toBe(5);
  });
});

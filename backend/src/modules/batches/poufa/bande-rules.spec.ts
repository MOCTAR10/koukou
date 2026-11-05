import { describe, expect, it } from 'vitest';
import {
  addDays,
  ageOn,
  buildDailyStats,
  completenessPct,
  expectedEndDate,
  factInstant,
  isCatchUp,
  weighingStatus,
  type DailyStatsInput,
} from './bande-rules.js';

const pct = (_day: string, deaths: number, presentStart: number) =>
  presentStart > 0 ? (deaths / presentStart) * 100 : null;

const base = (over: Partial<DailyStatsInput> = {}): DailyStatsInput => ({
  integrationDate: '2026-10-01',
  initialAgeDays: 0,
  quantityAtStart: 1000,
  initialWeightG: 45,
  endDay: '2026-10-04',
  entries: [],
  removalsByDate: new Map(),
  deathEventsByDate: new Map(),
  mortalityPct: pct,
  ...over,
});

describe('band dates', () => {
  it('adds days across months', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-11-02', -2)).toBe('2026-10-31');
  });

  it('counts the age from the age at opening (J+x)', () => {
    expect(ageOn('2026-10-01', 0, '2026-10-01')).toBe(0);
    expect(ageOn('2026-10-01', 12, '2026-10-05')).toBe(16);
    expect(ageOn('2026-10-01', null, '2026-10-05')).toBe(4);
  });

  it('ends a J+x band sooner', () => {
    expect(expectedEndDate('2026-10-01', 0, 45)).toBe('2026-11-15');
    expect(expectedEndDate('2026-10-01', 15, 45)).toBe('2026-10-31');
    expect(expectedEndDate('2026-10-01', 0, null)).toBeNull();
  });

  it('reads the parameters of a past day at its end, of today now', () => {
    const now = new Date('2026-11-05T10:00:00Z');
    expect(factInstant('2026-11-01', now).toISOString()).toBe(
      '2026-11-01T23:59:59.999Z',
    );
    expect(factInstant('2026-11-05', now)).toBe(now);
  });

  it('flags entries recorded after the day following their date', () => {
    const now = new Date('2026-11-05T08:00:00Z');
    expect(isCatchUp('2026-11-05', now)).toBe(false);
    expect(isCatchUp('2026-11-04', now)).toBe(false);
    expect(isCatchUp('2026-11-03', now)).toBe(true);
  });
});

describe('buildDailyStats', () => {
  it('gives one row per day with present, deaths and cumulatives', () => {
    const rows = buildDailyStats(
      base({
        entries: [
          {
            entryDate: '2026-10-02',
            deaths: 10,
            feedQuantity: 50,
            avgWeightKg: null,
            sampleSize: null,
            catchUp: false,
          },
          {
            entryDate: '2026-10-03',
            deaths: 5,
            feedQuantity: 60,
            avgWeightKg: 0.12,
            sampleSize: 30,
            catchUp: true,
          },
        ],
        removalsByDate: new Map([['2026-10-04', 100]]),
      }),
    );
    expect(rows.map((r) => r.day)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(rows[0]).toMatchObject({
      presentStart: 1000,
      present: 1000,
      entryDone: false,
      lastWeightG: 45,
      mortalityDayPct: 0,
    });
    expect(rows[1]).toMatchObject({
      deaths: 10,
      present: 990,
      mortalityDayPct: 1,
      feedCumulativeKg: 50,
      entryDone: true,
    });
    expect(rows[2]).toMatchObject({
      presentStart: 990,
      deathsCumulative: 15,
      weighed: true,
      sampleSize: 30,
      lastWeightG: 120,
      catchUp: true,
    });
    expect(rows[3]).toMatchObject({
      removals: 100,
      removalsCumulative: 100,
      present: 885,
      lastWeightG: 120,
      feedKg: 0,
      feedCumulativeKg: 110,
    });
  });

  it('counts MORTALITE events as deaths, not as other removals', () => {
    const rows = buildDailyStats(
      base({
        endDay: '2026-10-02',
        removalsByDate: new Map([['2026-10-02', 30]]),
        deathEventsByDate: new Map([['2026-10-02', 20]]),
      }),
    );
    expect(rows[1]).toMatchObject({ deaths: 20, removals: 10, present: 970 });
  });

  it('never lets the headcount go below zero', () => {
    const rows = buildDailyStats(
      base({
        endDay: '2026-10-01',
        removalsByDate: new Map([['2026-10-01', 2000]]),
      }),
    );
    expect(rows[0].present).toBe(0);
  });

  it('starts the age at the age at opening', () => {
    const rows = buildDailyStats(base({ initialAgeDays: 20 }));
    expect(rows.map((r) => r.ageDays)).toEqual([20, 21, 22, 23]);
  });
});

describe('completenessPct', () => {
  const rows = [
    { day: '2026-10-01', entryDone: true },
    { day: '2026-10-02', entryDone: false },
    { day: '2026-10-03', entryDone: true },
    { day: '2026-10-04', entryDone: false },
  ];
  const at = (today: string, list = rows, end = '2026-12-31') =>
    completenessPct(list, '2026-10-01', end, today);

  it('is days entered / days elapsed, today counting once entered', () => {
    expect(at('2026-10-04')).toBe(66.7);
    expect(at('2026-10-05')).toBe(50);
    expect(
      at('2026-10-04', [...rows.slice(0, 3), { day: '2026-10-04', entryDone: true }]),
    ).toBe(75);
  });

  it('counts elapsed days even without projection rows', () => {
    expect(at('2026-10-10', rows.slice(0, 1))).toBe(11.1);
  });

  it('stops at the closure day', () => {
    expect(at('2026-11-20', rows, '2026-10-04')).toBe(50);
  });

  it('is null before the first elapsed day', () => {
    expect(at('2026-10-01', [{ day: '2026-10-01', entryDone: false }])).toBeNull();
    expect(at('2026-09-30')).toBeNull();
  });
});

describe('weighingStatus', () => {
  const input = {
    integrationDate: '2026-10-01',
    frequencyDays: 7,
    expectedSampleSize: 30,
    closed: false,
  };

  it('is due a period after the opening before the first weighing', () => {
    const s = weighingStatus({ ...input, weighings: [], today: '2026-10-08' });
    expect(s).toMatchObject({ nextDueDate: '2026-10-08', late: false, daysLate: 0 });
    expect(
      weighingStatus({ ...input, weighings: [], today: '2026-10-10' }),
    ).toMatchObject({ late: true, daysLate: 2 });
  });

  it('counts from the last weighing and checks its sample', () => {
    const s = weighingStatus({
      ...input,
      weighings: [
        { date: '2026-10-08', sampleSize: 30 },
        { date: '2026-10-15', sampleSize: 12 },
      ],
      today: '2026-10-20',
    });
    expect(s).toMatchObject({
      lastWeighingDate: '2026-10-15',
      nextDueDate: '2026-10-22',
      late: false,
      lastSampleSize: 12,
      lastSampleBelowExpected: true,
    });
  });

  it('is never late once closed', () => {
    expect(
      weighingStatus({ ...input, weighings: [], today: '2026-12-01', closed: true })
        .late,
    ).toBe(false);
  });
});

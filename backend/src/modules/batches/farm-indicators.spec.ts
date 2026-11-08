import { describe, expect, it } from 'vitest';
import { BatchStatus, BatchType } from '../../common/enums/batch-type.enum.js';
import { Species } from '../../common/enums/species.enum.js';
import { farmIndicators } from './farm-indicators.js';
import { indicatorThresholds } from './indicator-thresholds.js';

const lot = (
  over: Partial<Parameters<typeof farmIndicators>[0][number]> & {
    metrics?: Partial<Parameters<typeof farmIndicators>[0][number]['metrics']>;
  },
) => ({
  status: BatchStatus.ACTIF,
  type: BatchType.PONDEUSE,
  species: Species.POULET,
  customSpecies: null,
  ...over,
  metrics: {
    layWindowEggs: 0,
    layWindowHenDays: 0,
    feedWindowKg: 0,
    feedWindowBirdDays: 0,
    ...over.metrics,
  },
});

describe('farmIndicators', () => {
  it('weights the laying rate by hen-days, not by lot', () => {
    const out = farmIndicators([
      lot({ metrics: { layWindowEggs: 480, layWindowHenDays: 800 } }), // 60 %
      lot({ metrics: { layWindowEggs: 960, layWindowHenDays: 2400 } }), // 40 %
    ]);
    expect(out.layingBySpecies).toHaveLength(1);
    expect(out.layingBySpecies[0]!.layRatePercent).toBe(45);
    expect(out.layRatePercent).toBe(45);
  });

  it('ignores closed lots and meat lots for the laying rate', () => {
    const out = farmIndicators([
      lot({
        status: BatchStatus.CLOTURE,
        metrics: { layWindowEggs: 10, layWindowHenDays: 10 },
      }),
      lot({ type: BatchType.CHAIR, metrics: { layWindowEggs: 5, layWindowHenDays: 5 } }),
    ]);
    expect(out.layingBySpecies).toEqual([]);
  });

  it('keeps one group per species and caps at 100 %', () => {
    const out = farmIndicators([
      lot({ metrics: { layWindowEggs: 200, layWindowHenDays: 100 } }),
      lot({
        species: Species.CANARD,
        metrics: { layWindowEggs: 50, layWindowHenDays: 100 },
      }),
    ]);
    const rate = (s: Species) =>
      out.layingBySpecies.find((g) => g.species === s)?.layRatePercent;
    expect(rate(Species.POULET)).toBe(100);
    expect(rate(Species.CANARD)).toBe(50);
  });

  it('feed per bird-day = kg / bird-days on open lots, null without data', () => {
    expect(farmIndicators([lot({})]).feedPerBirdDayKg).toBeNull();
    const out = farmIndicators([
      lot({ metrics: { feedWindowKg: 384, feedWindowBirdDays: 3200 } }),
      lot({
        type: BatchType.CHAIR,
        metrics: { feedWindowKg: 160, feedWindowBirdDays: 1600 },
      }),
      lot({
        status: BatchStatus.CLOTURE,
        metrics: { feedWindowKg: 999, feedWindowBirdDays: 1 },
      }),
    ]);
    expect(out.feedPerBirdDayKg).toBe(0.1133);
  });
});

describe('indicatorThresholds', () => {
  it('falls back to the seeded defaults and reads the stored values', () => {
    expect(indicatorThresholds({})).toMatchObject({
      fcrAbsoluteWarn: 2.2,
      fcrDeviationWarnPct: 10,
      waterDropCriticalPct: 25,
    });
    expect(indicatorThresholds({ fcr_absolute_warn: 2.5 }).fcrAbsoluteWarn).toBe(
      2.5,
    );
  });
});

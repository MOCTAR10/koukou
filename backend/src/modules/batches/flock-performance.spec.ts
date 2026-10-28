import { describe, expect, it } from 'vitest';
import {
  avgDailyWaterPerBird,
  FlockEntry,
  FlockTimeline,
  performanceAtLastWeighing,
  populationOn,
  waterPerBirdOn,
  weightOn,
} from './flock-performance.js';

const entry = (
  entryDate: string,
  over: Partial<FlockEntry> = {},
): FlockEntry => ({
  entryDate,
  deaths: 0,
  feedQuantity: 0,
  waterL: 0,
  avgWeightKg: null,
  ...over,
});

// 1000 chicks on 2026-01-01, weighed 1.445 kg at 28 days (+50 g/day),
// 400 sold at 14 days, 2000 kg of feed up to the weighing, 500 kg after.
function timeline(over: Partial<FlockTimeline> = {}): FlockTimeline {
  return {
    integrationDate: '2026-01-01',
    quantityAtStart: 1000,
    day1WeightKg: 0.045,
    entries: [
      entry('2026-01-14', { feedQuantity: 800, waterL: 200 }),
      entry('2026-01-16', { feedQuantity: 1200, waterL: 120 }),
      entry('2026-01-29', { avgWeightKg: 1.445 }),
      entry('2026-02-05', { feedQuantity: 500 }),
    ],
    removalsByDate: new Map([['2026-01-15', 400]]),
    ...over,
  };
}

describe('flock-performance', () => {
  it('population retire morts et sorties à leur date', () => {
    const t = timeline({
      entries: [entry('2026-01-10', { deaths: 5 })],
    });
    expect(populationOn(t, '2026-01-09')).toBe(1000);
    expect(populationOn(t, '2026-01-10')).toBe(995);
    expect(populationOn(t, '2026-01-15')).toBe(595);
  });

  it('poids interpolé entre J1 et les pesées, figé après la dernière', () => {
    const t = timeline();
    expect(weightOn(t, '2026-01-01')).toBeCloseTo(0.045, 6);
    expect(weightOn(t, '2026-01-15')).toBeCloseTo(0.745, 6);
    expect(weightOn(t, '2026-03-01')).toBeCloseTo(1.445, 6);
  });

  it('IC sur toute la biomasse produite (oiseaux vendus compris), à la date de pesée', () => {
    const p = performanceAtLastWeighing(timeline())!;
    expect(p.weighingDate).toBe('2026-01-29');
    expect(p.ageDays).toBe(28);
    expect(p.population).toBe(600);
    // Feed eaten after the weighing has no matching weight: excluded.
    expect(p.feedKg).toBe(2000);
    // 600 × 1.4 kg present + 400 × 0.7 kg sold at 14 days.
    expect(p.biomassGainKg).toBeCloseTo(1120, 6);
    expect(p.fcr).toBeCloseTo(2000 / 1120, 6);
    // GMQ on the age at the weighing, not today's age.
    expect(p.gmqGramsPerDay).toBeCloseTo(50, 6);
    expect(p.viabilityPercent).toBe(100);
    expect(p.ipe).toBeCloseTo((1.445 * 100 * 100) / (28 * (2000 / 1120)), 6);
  });

  it('les morts comptent dans la biomasse au poids du jour de leur mort', () => {
    const t = timeline({
      removalsByDate: new Map(),
      entries: [
        entry('2026-01-15', { deaths: 100, feedQuantity: 1000 }),
        entry('2026-01-29', { avgWeightKg: 1.445 }),
      ],
    });
    const p = performanceAtLastWeighing(t)!;
    expect(p.biomassGainKg).toBeCloseTo(900 * 1.4 + 100 * 0.7, 6);
    expect(p.viabilityPercent).toBe(90);
  });

  it('morts déclarées en événement sanitaire : retirées une fois, comptées en viabilité', () => {
    const t = timeline({
      removalsByDate: new Map([['2026-01-15', 100]]),
      deathEventsByDate: new Map([['2026-01-15', 100]]),
      entries: [
        entry('2026-01-15', { feedQuantity: 1000 }),
        entry('2026-01-29', { avgWeightKg: 1.445 }),
      ],
    });
    const p = performanceAtLastWeighing(t)!;
    expect(p.population).toBe(900);
    expect(p.biomassGainKg).toBeCloseTo(900 * 1.4 + 100 * 0.7, 6);
    expect(p.viabilityPercent).toBe(90);
  });

  it('asOf : pesée la plus récente avant la date ; aucune pesée → null', () => {
    expect(performanceAtLastWeighing(timeline(), '2026-01-20')).toBeNull();
    expect(
      performanceAtLastWeighing(timeline({ entries: [entry('2026-01-14')] })),
    ).toBeNull();
  });

  it('eau par oiseau : une vente ne ressemble pas à une chute de consommation', () => {
    const t = timeline();
    expect(waterPerBirdOn(t, t.entries[0])).toBeCloseTo(0.2, 6);
    expect(waterPerBirdOn(t, t.entries[1])).toBeCloseTo(0.2, 6);
    expect(waterPerBirdOn(t, t.entries[2])).toBeNull();
    expect(avgDailyWaterPerBird(t, '2026-01-10', '2026-01-20')).toBeCloseTo(0.2, 6);
  });
});

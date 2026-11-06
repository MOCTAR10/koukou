import { describe, expect, it } from 'vitest';
import {
  addIsoDays,
  ageOnDay,
  ageZeroDay,
  bandOpening,
  feedAdviceFor,
  lotAgeOn,
  MAX_ARRIVAL_AGE_DAYS,
  MAX_ARRIVAL_WEIGHT_G,
  parseArrivalAgeDays,
  parseArrivalWeightG,
  splitStepsByAge,
  stepDate,
} from './band';

describe('ageOnDay / ageZeroDay (backend J+x rule)', () => {
  it('age = age at opening + days since the opening', () => {
    expect(ageOnDay('2026-11-01', 21, '2026-11-06')).toBe(26);
    expect(ageOnDay('2026-11-01T00:00:00.000Z', null, '2026-11-06')).toBe(5);
    expect(ageOnDay('2026-11-01', 0, '2026-11-01')).toBe(0);
    expect(ageOnDay('2026-10-30', 3, '2026-11-02')).toBe(6);
  });

  it('J0 = opening day moved back by the age at opening', () => {
    expect(ageZeroDay('2026-11-06', 21)).toBe('2026-10-16');
    expect(ageZeroDay('2026-11-06', null)).toBe('2026-11-06');
    const j0 = ageZeroDay('2026-11-06', 21);
    expect(ageOnDay('2026-11-06', 21, addIsoDays(j0, 28))).toBe(28);
  });
});

describe('parseArrivalAgeDays', () => {
  it('empty = day-old chicks (0)', () => {
    expect(parseArrivalAgeDays('')).toBe(0);
    expect(parseArrivalAgeDays('  ')).toBe(0);
  });

  it('takes a whole number up to the backend maximum', () => {
    expect(parseArrivalAgeDays('21')).toBe(21);
    expect(parseArrivalAgeDays(' 0 ')).toBe(0);
    expect(parseArrivalAgeDays(String(MAX_ARRIVAL_AGE_DAYS))).toBe(MAX_ARRIVAL_AGE_DAYS);
  });

  it('refuses a negative, decimal or too large age', () => {
    expect(parseArrivalAgeDays('-3')).toBeNull();
    expect(parseArrivalAgeDays('2.5')).toBeNull();
    expect(parseArrivalAgeDays('abc')).toBeNull();
    expect(parseArrivalAgeDays(String(MAX_ARRIVAL_AGE_DAYS + 1))).toBeNull();
  });
});

describe('bandOpening', () => {
  it('new lot of day-old chicks: J0 = arrival', () => {
    expect(bandOpening({ arrivalDay: '2026-11-06', arrivalAgeDays: 0, today: '2026-11-06' })).toEqual({
      integrationDate: '2026-11-06',
      initialAgeDays: 0,
      ageZeroDay: '2026-11-06',
      ageToday: 0,
    });
  });

  it('lot already running, opened today at J+21: the date stays the arrival, care of day 14 dated J0 + 14', () => {
    const o = bandOpening({ arrivalDay: '2026-11-06', arrivalAgeDays: 21, today: '2026-11-06' });
    expect(o).toMatchObject({ integrationDate: '2026-11-06', initialAgeDays: 21, ageToday: 21 });
    expect(stepDate(o, 14)).toBe('2026-10-30');
  });

  it('arrived 3 days ago at J+10: age 13 today', () => {
    const o = bandOpening({ arrivalDay: '2026-11-03', arrivalAgeDays: 10, today: '2026-11-06' });
    expect(o.ageToday).toBe(13);
    expect(o.ageZeroDay).toBe('2026-10-24');
  });

  it('arrival in the future (time zone): today’s age never drops below the age at arrival', () => {
    expect(bandOpening({ arrivalDay: '2026-11-07', arrivalAgeDays: 5, today: '2026-11-06' }).ageToday).toBe(5);
  });
});

describe('lotAgeOn', () => {
  const lot = { integrationDate: '2026-11-01', initialAgeDays: 20, metrics: { ageDays: 25 } };

  it('uses the served age for today and the J+x rule for a back-dated day', () => {
    expect(lotAgeOn(lot, '2026-11-06', '2026-11-06')).toBe(25);
    expect(lotAgeOn(lot, '2026-11-04', '2026-11-06')).toBe(23);
    expect(lotAgeOn({ ...lot, initialAgeDays: null }, '2026-11-04', '2026-11-06')).toBe(3);
  });
});

describe('feed advice and care steps by age', () => {
  it('picks the feed phase of the birds’ age', () => {
    expect(feedAdviceFor('CHAIR', 0).label).toMatch(/^Poussin/);
    expect(feedAdviceFor('CHAIR', 21).label).toMatch(/^Démarrage/);
    expect(feedAdviceFor('PONDEUSE', 120).label).toMatch(/^Pré-ponte/);
  });

  it('splits the protocol at the age, in day order', () => {
    const steps = [{ id: 'c', dayFrom: 28 }, { id: 'a', dayFrom: 1 }, { id: 'b', dayFrom: 14 }];
    const { due, upcoming } = splitStepsByAge(steps, 21);
    expect(due.map((s) => s.id)).toEqual(['a', 'b']);
    expect(upcoming.map((s) => s.id)).toEqual(['c']);
  });
});

// POUFA lot A bande: average weight of the chicks at arrival (initialAvgWeightG).
describe('parseArrivalWeightG', () => {
  it('is optional, in grams, a comma accepted', () => {
    expect(parseArrivalWeightG('')).toBeUndefined();
    expect(parseArrivalWeightG(' 42 ')).toBe(42);
    expect(parseArrivalWeightG('42,5')).toBe(42.5);
  });

  it('refuses 0, text and more than the maximum', () => {
    expect(parseArrivalWeightG('0')).toBeNull();
    expect(parseArrivalWeightG('abc')).toBeNull();
    expect(parseArrivalWeightG(String(MAX_ARRIVAL_WEIGHT_G))).toBe(MAX_ARRIVAL_WEIGHT_G);
    expect(parseArrivalWeightG(String(MAX_ARRIVAL_WEIGHT_G + 1))).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

import {
  addIsoDays,
  ageOnDay,
  ageZeroDay,
  bandCycle,
  lotSearchText,
  MAX_ARRIVAL_AGE_DAYS,
  parseArrivalAgeDays,
} from './band';

describe('bandCycle', () => {
  it('utilise la durée de référence de la bande', () => {
    const c = bandCycle({ ageDays: 15, referenceDurationDays: 45, type: 'CHAIR' });
    expect(c).toMatchObject({ ageDays: 15, cycleDays: 45, remainingDays: 30, fromReference: true });
    expect(c.progressPercent).toBeCloseTo(33.33, 1);
  });

  it('bande ouverte à J+x : l’âge servi inclut déjà x, il n’est pas ajouté une seconde fois', () => {
    // Opened at J+20, 5 days ago: the backend serves ageDays = 25.
    const c = bandCycle({ ageDays: 25, referenceDurationDays: 45, type: 'CHAIR' });
    expect(c.ageDays).toBe(25);
    expect(c.remainingDays).toBe(20);
  });

  it('sans durée de référence : cycle par défaut selon le type', () => {
    expect(bandCycle({ ageDays: 10, type: 'CHAIR' })).toMatchObject({ cycleDays: 84, fromReference: false });
    expect(bandCycle({ ageDays: 10, referenceDurationDays: null, type: 'PONDEUSE' }).cycleDays).toBe(504);
    expect(bandCycle({ ageDays: 10, referenceDurationDays: 0, type: 'CHAIR' }).cycleDays).toBe(84);
  });

  it('cycle dépassé : 0 jour restant, progression plafonnée à 100 %', () => {
    const c = bandCycle({ ageDays: 60, referenceDurationDays: 45, type: 'CHAIR' });
    expect(c.remainingDays).toBe(0);
    expect(c.progressPercent).toBe(100);
  });
});

describe('ageOnDay / ageZeroDay (règle J+x du backend)', () => {
  it('âge = âge à l’ouverture + jours depuis l’ouverture', () => {
    expect(ageOnDay('2026-11-01', 21, '2026-11-06')).toBe(26);
    expect(ageOnDay('2026-11-01T00:00:00.000Z', null, '2026-11-06')).toBe(5);
    expect(ageOnDay('2026-11-01', 0, '2026-11-01')).toBe(0);
  });

  it('traverse les changements de mois', () => {
    expect(ageOnDay('2026-10-30', 3, '2026-11-02')).toBe(6);
  });

  it('J0 = date d’ouverture reculée de l’âge à l’ouverture', () => {
    expect(ageZeroDay('2026-11-06', 21)).toBe('2026-10-16');
    expect(ageZeroDay('2026-11-06', null)).toBe('2026-11-06');
    // A step of day N falls on J0 + N, i.e. at age N.
    const j0 = ageZeroDay('2026-11-06', 21);
    expect(ageOnDay('2026-11-06', 21, addIsoDays(j0, 28))).toBe(28);
  });
});

describe('parseArrivalAgeDays', () => {
  it('vide = poussins d’un jour (0)', () => {
    expect(parseArrivalAgeDays('')).toBe(0);
    expect(parseArrivalAgeDays('  ')).toBe(0);
  });

  it('accepte un entier de 0 au maximum du backend', () => {
    expect(parseArrivalAgeDays('21')).toBe(21);
    expect(parseArrivalAgeDays(' 0 ')).toBe(0);
    expect(parseArrivalAgeDays(String(MAX_ARRIVAL_AGE_DAYS))).toBe(MAX_ARRIVAL_AGE_DAYS);
  });

  it('refuse un âge négatif, décimal ou trop grand', () => {
    expect(parseArrivalAgeDays('-3')).toBeNull();
    expect(parseArrivalAgeDays('2.5')).toBeNull();
    expect(parseArrivalAgeDays('abc')).toBeNull();
    expect(parseArrivalAgeDays(String(MAX_ARRIVAL_AGE_DAYS + 1))).toBeNull();
  });
});

describe('lotSearchText', () => {
  it('cherche aussi par code de bande', () => {
    const text = lotSearchText({ batchName: 'Lot B-049', code: 'G1-0012-B07', breedName: 'Cobb 500' });
    expect(text).toContain('g1-0012-b07');
    expect(text).toContain('lot b-049');
  });

  it('tolère un lot sans code ni souche', () => {
    expect(lotSearchText({ batchName: null, code: null, breedName: null })).toBe('');
  });
});

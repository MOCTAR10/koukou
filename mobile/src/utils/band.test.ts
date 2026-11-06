import { describe, expect, it } from 'vitest';

import { bandCycle, lotSearchText } from './band';

describe('bandCycle', () => {
  it('utilise la durée de référence de la bande', () => {
    const c = bandCycle({ daysSinceOpening: 15, referenceDurationDays: 45, type: 'CHAIR' });
    expect(c).toMatchObject({ ageDays: 15, cycleDays: 45, remainingDays: 30, fromReference: true });
    expect(c.progressPercent).toBeCloseTo(33.33, 1);
  });

  it('bande ouverte à J+x : âge décalé, x jours de moins à faire', () => {
    const c = bandCycle({ daysSinceOpening: 5, initialAgeDays: 20, referenceDurationDays: 45, type: 'CHAIR' });
    expect(c.ageDays).toBe(25);
    expect(c.remainingDays).toBe(20);
  });

  it('sans durée de référence : cycle par défaut selon le type', () => {
    expect(bandCycle({ daysSinceOpening: 10, type: 'CHAIR' })).toMatchObject({ cycleDays: 84, fromReference: false });
    expect(bandCycle({ daysSinceOpening: 10, referenceDurationDays: null, type: 'PONDEUSE' }).cycleDays).toBe(504);
    expect(bandCycle({ daysSinceOpening: 10, referenceDurationDays: 0, type: 'CHAIR' }).cycleDays).toBe(84);
  });

  it('cycle dépassé : 0 jour restant, progression plafonnée à 100 %', () => {
    const c = bandCycle({ daysSinceOpening: 60, referenceDurationDays: 45, type: 'CHAIR' });
    expect(c.remainingDays).toBe(0);
    expect(c.progressPercent).toBe(100);
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

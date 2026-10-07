import { describe, expect, it } from 'vitest';

import {
  CROP_CATEGORY_LABELS,
  adviceForCulture,
  cultureStage,
  formatHarvestDate,
  groupCulturesByCategory,
  waterNeedLabel,
} from './agriculture';
import type { Culture } from '@/api/types';

const cultures: Culture[] = [
  { id: 'fruit1', name: 'Mangue', category: 'FRUIT', defaultCycleDays: null, waterNeedsLPlantDay: null, notes: null },
  { id: 'tub1', name: 'Plantain', category: 'TUBERCULE', defaultCycleDays: 330, waterNeedsLPlantDay: 12, notes: null },
  { id: 'tub2', name: 'Manioc', category: 'TUBERCULE', defaultCycleDays: 300, waterNeedsLPlantDay: 10, notes: null },
  { id: 'aut1', name: 'Ananas', category: 'AUTRE', defaultCycleDays: 420, waterNeedsLPlantDay: null, notes: null },
];

describe('groupCulturesByCategory', () => {
  it('regroupe les cultures par catégorie dans l’ordre d’affichage', () => {
    const groups = groupCulturesByCategory(cultures);
    expect(groups.map((g) => g.category)).toEqual(['TUBERCULE', 'FRUIT', 'AUTRE']);
    expect(groups[0].cultures.map((c) => c.name)).toEqual(['Manioc', 'Plantain']);
    expect(groups[0].label).toBe(CROP_CATEGORY_LABELS.TUBERCULE);
  });

  it('omet les catégories sans culture', () => {
    const groups = groupCulturesByCategory([cultures[1]]);
    expect(groups.map((g) => g.category)).toEqual(['TUBERCULE']);
  });

  it('retourne une liste vide sans cultures', () => {
    expect(groupCulturesByCategory([])).toEqual([]);
  });
});

describe('cultureStage', () => {
  const FIXED = new Date('2026-01-10T00:00:00Z');

  it('retourne null sans date de plantation', () => {
    expect(cultureStage(null, 300, FIXED)).toBeNull();
  });

  it('calcule stade, progression et échéance', () => {
    // Planté au 1er janv 2026, cycle 100 jours → jour 9 → 9 % (Plantation).
    const s = cultureStage('2026-01-01', 100, FIXED);
    expect(s?.key).toBe('PLANTATION');
    expect(s?.progress).toBeCloseTo(0.09, 5);
    expect(s?.daysElapsed).toBe(9);
    expect(s?.daysRemaining).toBe(91);
    expect(s?.harvestDate?.toISOString().slice(0, 10)).toBe('2026-04-11');
  });

  it('passe en « À récolter » au-delà du cycle', () => {
    const s = cultureStage('2025-09-01', 100, FIXED);
    expect(s?.key).toBe('A_RECOLTER');
    expect(s?.progress).toBeGreaterThan(1);
    expect(s?.daysRemaining).toBe(0);
  });

  it('gère une culture sans cycle (cycle libre)', () => {
    const s = cultureStage('2026-01-01', null, FIXED);
    expect(s?.key).toBe('A_RECOLTER');
    expect(s?.harvestDate).toBeNull();
  });
});

describe('formatHarvestDate', () => {
  it('formate une échéance en français', () => {
    expect(formatHarvestDate(new Date('2026-04-11T00:00:00Z'))).toMatch(/11 (avr|avril)/);
  });

  it('retourne un tiret sans échéance', () => {
    expect(formatHarvestDate(null)).toBe('—');
  });
});

describe('adviceForCulture / waterNeedLabel', () => {
  it('renvoie les conseils de la catégorie', () => {
    const tips = adviceForCulture(cultures[1]); // Plantain (TUBERCULE)
    expect(tips.length).toBeGreaterThan(0);
    expect(tips.join(' ')).toMatch(/tubercules|buttage|sol/i);
  });

  it('retombe sur AUTRE pour une catégorie inconnue', () => {
    expect(adviceForCulture({ ...cultures[0], category: 'AUTRE' as const })).toHaveLength(2);
  });

  it('libelle le besoin en eau du référentiel', () => {
    expect(waterNeedLabel(cultures[1])).toContain('12');
    expect(waterNeedLabel(null)).toBeNull();
  });
});
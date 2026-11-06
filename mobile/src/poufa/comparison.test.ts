import { describe, expect, it } from 'vitest';

import type { BandComparison } from '@/api/poufa';
import { compareTone, comparisonRows, fmtIndicator, suppressionNote } from './comparison';

const comparison: BandComparison = {
  batchId: 'b-1',
  code: 'B-1',
  species: 'POULET',
  type: 'CHAIR',
  ageDays: 16,
  currentWeek: 3,
  minGroupSize: 5,
  method: [],
  weeks: [
    {
      week: 1,
      ageFrom: 0,
      ageTo: 6,
      band: { mortalityPct: 1, fcr: 1.1, gmqG: 20 },
      programme: { mortalityPct: 2, fcr: 1.1, gmqG: 25, bands: 12, farms: 8 },
      suppressed: false,
    },
    { week: 2, ageFrom: 7, ageTo: 13, band: { mortalityPct: 0.5, fcr: 1.3, gmqG: 40 }, programme: null, suppressed: true },
    { week: 3, ageFrom: 14, ageTo: 20, band: null, programme: null, suppressed: false },
  ],
};

describe('compareTone', () => {
  it('mieux / moins bien selon le sens de l’indicateur, ±2 % = pareil', () => {
    expect(compareTone(1, 2, false)).toBe('better');
    expect(compareTone(30, 25, true)).toBe('better');
    expect(compareTone(20, 25, true)).toBe('worse');
    expect(compareTone(1.01, 1, false)).toBe('same');
    expect(compareTone(null, 1, false)).toBe('none');
  });
});

describe('comparisonRows', () => {
  it('plus récente d’abord, semaine en cours marquée, moyenne masquée affichée comme telle', () => {
    const rows = comparisonRows(comparison);
    expect(rows.map((r) => r.week)).toEqual([3, 2, 1]);
    expect(rows[0].current).toBe(true);
    expect(rows[0].cells.fcr.band).toBe('—');
    expect(rows[1].suppressed).toBe(true);
    expect(rows[1].cells.mortalityPct.programme).toBe('Masquée');
    expect(rows[1].cells.mortalityPct.tone).toBe('none');
    expect(rows[2].ages).toBe('J0–J6');
    expect(rows[2].cells.mortalityPct.tone).toBe('better');
    expect(rows[2].cells.gmqG.tone).toBe('worse');
    expect(rows[2].cells.fcr.tone).toBe('same');
  });

  it('note d’anonymat quand des semaines sont masquées', () => {
    expect(suppressionNote(comparison)).toMatch(/1 semaine .*moins de 5/);
    expect(suppressionNote({ ...comparison, weeks: [comparison.weeks[0]] })).toBeNull();
  });
});

describe('fmtIndicator', () => {
  it('formate, tiret pour une valeur indéfinie', () => {
    expect(fmtIndicator(null, '%')).toBe('—');
    expect(fmtIndicator(Number.NaN, '%')).toBe('—');
    expect(fmtIndicator(250, 'g')).toMatch(/^250 g$/);
  });
});

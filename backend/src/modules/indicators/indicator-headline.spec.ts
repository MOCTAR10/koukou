import { describe, expect, it } from 'vitest';
import {
  CONDUITE_LABEL,
  indicatorText,
  labelOf,
  passportIndicatorRows,
} from './indicator-headline.js';

const official = [
  { key: 'taux_mortalite', label: 'Taux de mortalité', unit: '%', value: 3.25 },
  { key: 'viabilite', label: 'Viabilité', unit: '%', value: 96.75 },
  { key: 'gmq_g_j', label: 'Gain moyen quotidien (GMQ)', unit: 'g/j', value: 52.04 },
  { key: 'ic', label: 'Indice de consommation (IC)', unit: 'kg aliment/kg vif', value: 1.678 },
  { key: 'marge_fcfa', label: 'Marge brute', unit: 'FCFA', value: 120_000.4 },
];

const fermia = { mortalityPercent: 3.4, fcr: 1.71, gmqGramsPerDay: 51.5, ipe: 320.2 };

describe('indicatorText', () => {
  it('formats in French with the unit', () => {
    expect(indicatorText(3.25, '%')).toBe('3,3 %');
    expect(indicatorText(1.678, 'kg aliment/kg vif')).toBe('1,68');
    expect(indicatorText(120_000.4, 'FCFA')).toBe('120000 FCFA');
    expect(indicatorText(null, '%')).toBe('non calculable');
  });
});

describe('passportIndicatorRows', () => {
  it('puts the official values first, then Fermia under its label', () => {
    const rows = passportIndicatorRows(official, fermia);
    expect(rows.slice(0, 4).map((r) => r.label)).toEqual([
      'Taux de mortalité (officiel)',
      'Viabilité (officiel)',
      'Gain moyen quotidien (GMQ) (officiel)',
      'Indice de consommation (IC) (officiel)',
    ]);
    expect(rows[0].value).toBe('3,3 %');
    const conduite = rows.slice(4);
    expect(conduite).toHaveLength(4);
    for (const r of conduite) expect(r.label).toContain(CONDUITE_LABEL);
    expect(conduite[0].value).toBe('3,4 %');
  });

  it('never shows a bare Fermia mortality when the official set is missing', () => {
    const rows = passportIndicatorRows(null, { ...fermia, fcr: null });
    expect(rows[0].value).toContain('indisponibles');
    expect(rows.find((r) => r.label === 'Mortalité')).toBeUndefined();
    expect(rows.find((r) => r.label.startsWith('IC'))?.value).toBe('N/A');
  });
});

describe('labelOf', () => {
  it('reads the label of the formula in force', () => {
    expect(labelOf(official, 'marge_fcfa', 'Marge')).toBe('Marge brute');
    expect(labelOf(null, 'marge_fcfa', 'Marge')).toBe('Marge');
  });
});

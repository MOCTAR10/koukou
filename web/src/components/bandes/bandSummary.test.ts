import { describe, expect, it } from 'vitest';
import type { ComparisonWeek, OfficialIndicator } from '../../api/types-pilotage';
import {
  EMPTY_CORRECTION,
  compareTone,
  comparisonValueLabel,
  correctionBody,
  correctionError,
  formulaVersionLabel,
  indicatorValueLabel,
  latestComparableWeek,
  programmeCell,
  splitIndicators,
} from './bandSummary';

const plain = (s: string) => s.replace(/[  ]/g, ' ');

const ind = (key: string, value: number | null, unit: string): OfficialIndicator => ({
  key,
  label: key,
  unit,
  expression: 'a / b',
  parameterKey: `FORMULE_${key.toUpperCase()}`,
  parameterVersionId: null,
  validFrom: null,
  value,
});

describe('official indicators', () => {
  it('puts mortality, viability, GMQ and IC first, in the CDC order', () => {
    const list = [ind('ic', 1.8, 'kg aliment/kg vif'), ind('marge_fcfa', 1000, 'FCFA'), ind('taux_mortalite', 4, '%'), ind('gmq_g_j', 55, 'g/j'), ind('viabilite', 96, '%')];
    const { official, others } = splitIndicators(list);
    expect(official.map((i) => i.key)).toEqual(['taux_mortalite', 'viabilite', 'gmq_g_j', 'ic']);
    expect(others.map((i) => i.key)).toEqual(['marge_fcfa']);
  });

  it('formats the values with their unit, null as « non calculable »', () => {
    expect(indicatorValueLabel({ value: 4.256, unit: '%' })).toBe('4,3 %');
    expect(indicatorValueLabel({ value: 1.8456, unit: 'kg aliment/kg vif' })).toBe('1,85 kg aliment/kg vif');
    expect(plain(indicatorValueLabel({ value: 125400.6, unit: 'FCFA' }))).toBe('125 401 FCFA');
    expect(indicatorValueLabel({ value: null, unit: '%' })).toBe('non calculable');
  });

  it('names the formula version', () => {
    expect(formulaVersionLabel({ parameterVersionId: null, validFrom: null }, (d) => d)).toMatch(/proposée du catalogue/);
    expect(formulaVersionLabel({ parameterVersionId: 'v1', validFrom: '2026-10-01T00:00:00Z' }, (d) => d.slice(0, 10))).toBe(
      'Version en vigueur depuis le 2026-10-01',
    );
  });
});

describe('comparison with the programme', () => {
  const week = (w: number, programme: ComparisonWeek['programme'], suppressed = false, band: ComparisonWeek['band'] = { mortalityPct: 2, fcr: 1.6, gmqG: 50 }): ComparisonWeek => ({
    week: w,
    ageFrom: w * 7,
    ageTo: w * 7 + 6,
    band,
    programme,
    suppressed,
  });

  it('shows a suppressed week as such', () => {
    expect(programmeCell(week(1, null, true), 'fcr', 5)).toEqual({ text: 'masqué, moins de 5 fermes', suppressed: true });
    expect(programmeCell(week(1, null, false), 'fcr', 5)).toEqual({ text: '—', suppressed: false });
    expect(programmeCell(week(1, { mortalityPct: 3.25, fcr: 1.7, gmqG: 48, bands: 9, farms: 7 }), 'mortalityPct', 5).text).toBe('3,3 %');
  });

  it('judges better or worse per indicator', () => {
    expect(compareTone('mortalityPct', 2, 3)).toBe('better');
    expect(compareTone('fcr', 1.9, 1.6)).toBe('worse');
    expect(compareTone('gmqG', 55, 50)).toBe('better');
    expect(compareTone('gmqG', 50.5, 50)).toBe('same');
    expect(compareTone('gmqG', null, 50)).toBeNull();
    expect(comparisonValueLabel('gmqG', 52.34)).toBe('52,3 g/j');
  });

  it('finds the latest comparable week', () => {
    const avg = { mortalityPct: 3, fcr: 1.7, gmqG: 48, bands: 9, farms: 7 };
    expect(latestComparableWeek({ weeks: [week(0, avg), week(1, avg), week(2, null, true)] })?.week).toBe(1);
    expect(latestComparableWeek({ weeks: [week(0, null, true)] })).toBeNull();
  });
});

describe('closed-band correction', () => {
  const bounds = { from: '2026-09-01', to: '2026-10-15' };

  it('asks for a day in the band, one value and a reason of 5 characters', () => {
    expect(correctionError(EMPTY_CORRECTION, bounds)).toMatch(/jour à corriger/);
    expect(correctionError({ ...EMPTY_CORRECTION, entryDate: '2026-10-20' }, bounds)).toMatch(/entre l'ouverture/);
    expect(correctionError({ ...EMPTY_CORRECTION, entryDate: '2026-10-01' }, bounds)).toBe('Aucune valeur à corriger.');
    expect(correctionError({ ...EMPTY_CORRECTION, entryDate: '2026-10-01', deaths: '2.5' }, bounds)).toMatch(/Morts/);
    expect(correctionError({ ...EMPTY_CORRECTION, entryDate: '2026-10-01', avgWeightKg: '0' }, bounds)).toMatch(/Poids moyen/);
    expect(correctionError({ ...EMPTY_CORRECTION, entryDate: '2026-10-01', deaths: '3', reason: 'oups' }, bounds)).toMatch(/5 caractères/);
    expect(correctionError({ ...EMPTY_CORRECTION, entryDate: '2026-10-01', deaths: '3', reason: 'Saisie erronée' }, bounds)).toBeNull();
  });

  it('sends only the typed fields', () => {
    expect(
      correctionBody({ ...EMPTY_CORRECTION, entryDate: '2026-10-01', deaths: '3', avgWeightKg: '1,25', reason: '  Saisie erronée ' }),
    ).toEqual({ entryDate: '2026-10-01', deaths: 3, avgWeightKg: 1.25, reason: 'Saisie erronée' });
  });
});

import { describe, expect, it } from 'vitest';
import {
  availableViews,
  defaultPeriod,
  economieRights,
  effectiveView,
  missingAreas,
  exportFilename,
  exportPath,
  marginRate,
  marginTone,
  matchesSearch,
  periodError,
  sortByMargin,
  synthesePath,
} from './economie';

describe('economieRights', () => {
  it('opens to the platform admin and to ECONOMIQUE on a scope reaching farms', () => {
    expect(economieRights('PLATFORM_ADMIN').view).toBe(true);
    expect(economieRights('INSTITUTION', { scopeKind: 'ALL', matrix: { ECONOMIQUE: ['CONSULTER'] } }).view).toBe(true);
    expect(economieRights('INSTITUTION', { scopeKind: 'PROVINCES', matrix: { ECONOMIQUE: ['CONSULTER'] } }).view).toBe(true);
    expect(economieRights('INSTITUTION', { scopeKind: 'AGGREGATE', matrix: { ECONOMIQUE: ['CONSULTER'] } }).view).toBe(false);
    expect(economieRights('INSTITUTION', { scopeKind: 'ALL', matrix: { TECHNIQUE: ['CONSULTER'] } }).view).toBe(false);
    expect(economieRights('INSTITUTION', null).view).toBe(false);
    expect(economieRights('PROPRIETAIRE').view).toBe(false);
  });
});

describe('period and paths', () => {
  it('defaults to the month so far', () => {
    expect(defaultPeriod(new Date(2026, 10, 6))).toEqual({ from: '2026-11-01', to: '2026-11-06' });
  });

  it('checks the period', () => {
    expect(periodError({ from: '2026-11-01', to: '2026-11-06' })).toBeNull();
    expect(periodError({ from: '2026-11-07', to: '2026-11-06' })).toMatch(/précéder/);
    expect(periodError({ from: '', to: '2026-11-06' })).toMatch(/Choisissez/);
  });

  it('builds the read and export paths', () => {
    const f = { from: '2026-11-01', to: '2026-11-06', provinceId: '' };
    expect(synthesePath(f)).toBe('/programme/economie/synthese?from=2026-11-01&to=2026-11-06');
    expect(exportPath({ ...f, provinceId: 'p1' }, 'xlsx')).toBe(
      '/programme/economie/synthese/export?format=xlsx&from=2026-11-01&to=2026-11-06&provinceId=p1',
    );
    expect(exportFilename(f, 'csv')).toBe('synthese-economique-2026-11-01-2026-11-06.csv');
  });
});

describe('margins', () => {
  it('prefers the server rate, else computes it', () => {
    expect(marginRate({ marginPct: 12.5, marginFcfa: 1, salesFcfa: 1 })).toBe(12.5);
    expect(marginRate({ marginPct: null, marginFcfa: 250, salesFcfa: 1000 })).toBe(25);
    expect(marginRate({ marginPct: null, marginFcfa: 250, salesFcfa: 0 })).toBeNull();
    expect(marginRate({ marginPct: null, marginFcfa: null, salesFcfa: 1000 })).toBeNull();
  });

  it('tones and sorts, worst first', () => {
    expect(marginTone(-1)).toBe('bad');
    expect(marginTone(5)).toBe('good');
    expect(marginTone(null)).toBe('default');
    const sorted = sortByMargin([
      { code: 'G1-0002', marginFcfa: 100 },
      { code: 'G1-0001', marginFcfa: null },
      { code: 'G1-0003', marginFcfa: -50 },
    ]);
    expect(sorted.map((r) => r.code)).toEqual(['G1-0003', 'G1-0002', 'G1-0001']);
  });

  it('searches names, codes and provinces without accents', () => {
    const row = { name: 'Ferme Éboué', code: 'G1-0012', provinceName: 'Estuaire' };
    expect(matchesSearch(row, 'eboue')).toBe(true);
    expect(matchesSearch(row, 'g1-0012')).toBe(true);
    expect(matchesSearch(row, 'estu')).toBe(true);
    expect(matchesSearch(row, 'woleu')).toBe(false);
    expect(matchesSearch(row, '  ')).toBe(true);
  });
});

// POUFA lot A2 dge: column groups of the synthesis.
describe('column groups', () => {
  const base = { sales: true, collected: true, payroll: true, stock: true };
  it('offers only the groups the matrix grants', () => {
    expect(availableViews(base)).toEqual(['ventes']);
    expect(availableViews({ ...base, accounting: true, market: true, production: true })).toEqual(['ventes', 'comptabilite', 'market', 'production']);
    expect(availableViews({ ...base, market: true })).toEqual(['ventes', 'market']);
  });

  it('falls back to the first granted group', () => {
    expect(effectiveView('market', { ...base, market: true })).toBe('market');
    expect(effectiveView('comptabilite', base)).toBe('ventes');
    expect(effectiveView('production', { ...base, sales: false, production: true })).toBe('production');
    expect(effectiveView('ventes', { ...base, sales: false })).toBeNull();
  });

  it('names what the profile does not open', () => {
    expect(missingAreas({ ...base, accounting: true, market: true, production: true, biosecurity: true })).toEqual([]);
    expect(missingAreas({ ...base, payroll: false })).toEqual([
      'les salaires (Équipe et RH)',
      'la comptabilité SYSCOHADA',
      'le Market',
      'les saisies techniques (complétude et volumes)',
      'les contrôles de biosécurité',
    ]);
  });
});

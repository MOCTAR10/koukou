import { describe, expect, it } from 'vitest';

import type { SynthesisRow } from '@/api/economie';

import { farmsOfProvince, shownGroup, synthesisGroups, synthesisWindow, visibleFigures } from './economie';

const row = (over: Partial<SynthesisRow> = {}): SynthesisRow => ({
  provinceCode: 'G1',
  provinceName: 'Estuaire',
  salesFcfa: 100_000,
  salesCount: 4,
  collectedFcfa: 80_000,
  expensesFcfa: 60_000,
  marginFcfa: 40_000,
  marginPct: 40,
  payrollMonthlyFcfa: 150_000,
  employeeCount: 2,
  feedStockKg: 500,
  ...over,
});

describe('synthesisWindow', () => {
  it('month, three months and year up to the day', () => {
    expect(synthesisWindow('MOIS', '2026-11-06')).toEqual({ from: '2026-11-01', to: '2026-11-06' });
    expect(synthesisWindow('TRIMESTRE', '2026-11-06')).toEqual({ from: '2026-09-01', to: '2026-11-06' });
    expect(synthesisWindow('ANNEE', '2026-11-06')).toEqual({ from: '2026-01-01', to: '2026-11-06' });
  });

  it('three months cross the new year', () => {
    expect(synthesisWindow('TRIMESTRE', '2027-02-10')).toEqual({ from: '2026-12-01', to: '2027-02-10' });
    expect(synthesisWindow('TRIMESTRE', '2027-01-03')).toEqual({ from: '2026-11-01', to: '2027-01-03' });
  });
});

describe('visibleFigures', () => {
  it('every column when all are granted', () => {
    const keys = visibleFigures(row(), { sales: true, collected: true, payroll: true, stock: true }).map((f) => f.key);
    expect(keys).toEqual(['sales', 'expenses', 'margin', 'marginPct', 'collected', 'payroll', 'employees', 'stock']);
  });

  it('a refused column is left out, never shown as zero', () => {
    const figures = visibleFigures(row({ salesFcfa: null, expensesFcfa: null, marginFcfa: null, marginPct: null }), {
      sales: false,
      collected: true,
      payroll: false,
      stock: true,
    });
    expect(figures.map((f) => f.key)).toEqual(['collected', 'stock']);
    expect(figures[0]).toMatchObject({ value: 80_000, kind: 'fcfa' });
  });

  it('a granted margin rate may be null (no sales)', () => {
    const f = visibleFigures(row({ marginPct: null }), { sales: true, collected: false, payroll: false, stock: false });
    expect(f.find((x) => x.key === 'marginPct')?.value).toBeNull();
  });
});

describe('farmsOfProvince', () => {
  it('keeps the province farms, sorted by name', () => {
    const farms = [row({ name: 'Mba' }), row({ name: 'Bidzi' }), row({ name: 'Autre', provinceCode: 'G2' })];
    expect(farmsOfProvince(farms, 'G1').map((f) => f.name)).toEqual(['Bidzi', 'Mba']);
    expect(farmsOfProvince(farms, null)).toEqual([]);
  });
});

// POUFA lot A2 dge: SYSCOHADA, Market and production groups.
describe('synthesis groups', () => {
  const base = { sales: true, collected: true, payroll: true, stock: true };
  const all = { ...base, accounting: true, market: true, production: true };

  it('offers the groups the matrix grants, sales always', () => {
    expect(synthesisGroups(base)).toEqual(['VENTES']);
    expect(synthesisGroups(all)).toEqual(['VENTES', 'COMPTA', 'MARKET', 'PRODUCTION']);
    expect(synthesisGroups({ ...base, production: true })).toEqual(['VENTES', 'PRODUCTION']);
    expect(shownGroup('MARKET', base)).toBe('VENTES');
    expect(shownGroup('MARKET', all)).toBe('MARKET');
  });

  it('shows each group with its figures, never a refused one', () => {
    const r = row({
      accountingProductsFcfa: 200_000,
      accountingChargesFcfa: 150_000,
      accountingResultFcfa: 50_000,
      marketRequests: 3,
      marketSalesFcfa: 30_000,
      completenessPct: 85.5,
      producedHeads: 120,
      producedKg: 264.1,
    });
    expect(visibleFigures(r, all, 'COMPTA').map((f) => [f.key, f.value])).toContainEqual(['result', 50_000]);
    expect(visibleFigures(r, all, 'MARKET').map((f) => f.key)).toEqual(['requests', 'accepted', 'delivered', 'marketSales', 'birds', 'carcasses']);
    expect(visibleFigures(r, all, 'PRODUCTION').map((f) => [f.key, f.value])).toEqual([
      ['completeness', 85.5],
      ['producedHeads', 120],
      ['producedKg', 264.1],
    ]);
    // A group the server did not grant falls back to the sales figures.
    expect(visibleFigures(r, base, 'COMPTA')[0].key).toBe('sales');
    // A field an older server does not send reads as null, never zero.
    expect(visibleFigures(row(), all, 'MARKET')[0].value).toBeNull();
  });
});

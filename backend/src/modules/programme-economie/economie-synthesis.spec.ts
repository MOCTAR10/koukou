import { describe, expect, it } from 'vitest';
import {
  buildSynthesis,
  exportColumns,
  marginPct,
  type FarmFigures,
} from './economie-synthesis.js';

const farm = (over: Partial<FarmFigures>): FarmFigures => ({
  farmId: 'f',
  code: 'G1-0001',
  name: 'Ferme',
  provinceCode: 'G1',
  provinceName: 'Estuaire',
  salesFcfa: 0,
  salesCount: 0,
  collectedFcfa: 0,
  expensesFcfa: 0,
  payrollMonthlyFcfa: 0,
  employeeCount: 0,
  feedStockKg: 0,
  ...over,
});

const ALL = { sales: true, collected: true, payroll: true, stock: true };

describe('buildSynthesis', () => {
  const figures = [
    farm({
      farmId: 'b',
      code: 'G2-0001',
      provinceCode: 'G2',
      provinceName: 'Haut-Ogooué',
      salesFcfa: 1000,
      salesCount: 2,
      expensesFcfa: 400,
      payrollMonthlyFcfa: 100,
      employeeCount: 1,
      feedStockKg: 12.34,
    }),
    farm({
      farmId: 'a',
      code: 'G1-0002',
      salesFcfa: 500,
      salesCount: 1,
      expensesFcfa: 700,
      collectedFcfa: 300,
    }),
    farm({ farmId: 'c', code: 'G1-0001', expensesFcfa: 50 }),
  ];

  it('sorts farms by province then code and computes the margin', () => {
    const s = buildSynthesis(figures, ALL);
    expect(s.farms.map((f) => f.farmId)).toEqual(['c', 'a', 'b']);
    expect(s.farms[1]).toMatchObject({ marginFcfa: -200, marginPct: -40 });
    expect(s.farms[0].marginPct).toBeNull();
    expect(s.farms[2].feedStockKg).toBe(12.3);
  });

  it('subtotals per province and totals the programme', () => {
    const s = buildSynthesis(figures, ALL);
    expect(s.provinces).toHaveLength(2);
    expect(s.provinces[0]).toMatchObject({
      provinceCode: 'G1',
      farmCount: 2,
      salesFcfa: 500,
      expensesFcfa: 750,
    });
    expect(s.total).toMatchObject({
      farmCount: 3,
      salesFcfa: 1500,
      expensesFcfa: 1150,
      marginFcfa: 350,
      collectedFcfa: 300,
      payrollMonthlyFcfa: 100,
    });
  });

  it('nulls the columns the matrix does not grant', () => {
    const s = buildSynthesis(figures, {
      sales: true,
      collected: false,
      payroll: false,
      stock: false,
    });
    expect(s.total.collectedFcfa).toBeNull();
    expect(s.total.payrollMonthlyFcfa).toBeNull();
    expect(s.farms[2].feedStockKg).toBeNull();
    expect(s.farms[2].salesFcfa).toBe(1000);
  });

  it('exports only the granted columns', () => {
    const keys = exportColumns({
      sales: true,
      collected: false,
      payroll: true,
      stock: false,
    }).map(([k]) => k);
    expect(keys).toContain('payrollMonthlyFcfa');
    expect(keys).not.toContain('collectedFcfa');
    expect(keys).not.toContain('feedStockKg');
  });

  it('marginPct rounds to one decimal', () => {
    expect(marginPct(3, 1)).toBe(33.3);
    expect(marginPct(0, 5)).toBeNull();
  });
});

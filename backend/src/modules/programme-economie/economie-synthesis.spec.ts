import { describe, expect, it } from 'vitest';
import { formulasInForce } from '../indicators/official-indicators.js';
import { parameterDefinition } from '../programme/parameter-catalog.js';
import {
  buildSynthesis,
  emptySums,
  exportColumns,
  marginPct,
  synthesisFormulasOf,
  type FarmFigures,
} from './economie-synthesis.js';

const farm = (over: Partial<FarmFigures>): FarmFigures => ({
  farmId: 'f',
  code: 'G1-0001',
  name: 'Ferme',
  provinceCode: 'G1',
  provinceName: 'Estuaire',
  ...emptySums(),
  ...over,
});

const ALL = {
  sales: true,
  collected: true,
  payroll: true,
  stock: true,
  accounting: true,
  market: true,
  production: true,
};
const NONE = {
  sales: false,
  collected: false,
  payroll: false,
  stock: false,
  accounting: false,
  market: false,
  production: false,
};

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
    const s = buildSynthesis(figures, { ...NONE, sales: true });
    expect(s.total.collectedFcfa).toBeNull();
    expect(s.total.payrollMonthlyFcfa).toBeNull();
    expect(s.farms[2].feedStockKg).toBeNull();
    expect(s.farms[2].salesFcfa).toBe(1000);
  });

  it('exports only the granted columns', () => {
    const keys = exportColumns({ ...NONE, sales: true, payroll: true }).map(
      ([k]) => k,
    );
    expect(keys).toContain('payrollMonthlyFcfa');
    expect(keys).not.toContain('collectedFcfa');
    expect(keys).not.toContain('feedStockKg');
  });

  it('marginPct rounds to one decimal', () => {
    expect(marginPct(3, 1)).toBe(33.3);
    expect(marginPct(0, 5)).toBeNull();
  });

  // POUFA lot A2 dge: SYSCOHADA, Market and production columns.
  describe('accounting, Market and production columns (lot A2)', () => {
    const rich = [
      farm({
        farmId: 'x',
        code: 'G1-0003',
        salesFcfa: 2000,
        expensesFcfa: 500,
        accountingChargesFcfa: 800,
        accountingProductsFcfa: 2100,
        treasuryFcfa: 1500,
        receivablesFcfa: 200,
        marketRequests: 3,
        marketAccepted: 2,
        marketDelivered: 1,
        marketSalesFcfa: 900,
        marketBirds: 30,
        marketCarcasses: 5,
        daysEntered: 9,
        daysElapsed: 10,
        exitHeads: 40,
        exitKg: 88.04,
      }),
      farm({
        farmId: 'y',
        code: 'G1-0004',
        accountingChargesFcfa: 100,
        daysEntered: 1,
        daysElapsed: 10,
      }),
    ];

    it('computes the résultat and sums the new figures', () => {
      const s = buildSynthesis(rich, ALL);
      expect(s.farms[0]).toMatchObject({
        accountingResultFcfa: 1300,
        treasuryFcfa: 1500,
        receivablesFcfa: 200,
        marketRequests: 3,
        marketSalesFcfa: 900,
        marketBirds: 30,
        completenessPct: 90,
        producedHeads: 40,
        producedKg: 88,
      });
      expect(s.farms[1].accountingResultFcfa).toBe(-100);
      // Completeness of a group sums the days before dividing.
      expect(s.total).toMatchObject({
        accountingResultFcfa: 1200,
        completenessPct: 50,
        producedHeads: 40,
        marketDelivered: 1,
      });
    });

    it('nulls each group the matrix does not grant', () => {
      const s = buildSynthesis(rich, { ...NONE, sales: true });
      expect(s.total.accountingResultFcfa).toBeNull();
      expect(s.total.treasuryFcfa).toBeNull();
      expect(s.total.marketRequests).toBeNull();
      expect(s.total.completenessPct).toBeNull();
      expect(s.total.producedKg).toBeNull();
      const keys = exportColumns({ ...NONE, sales: true }).map(([k]) => k);
      expect(keys).not.toContain('accountingResultFcfa');
      expect(keys).not.toContain('marketSalesFcfa');
      expect(keys).not.toContain('completenessPct');
      const all = exportColumns(ALL).map(([k]) => k);
      expect(all).toEqual(
        expect.arrayContaining([
          'accountingChargesFcfa',
          'accountingProductsFcfa',
          'accountingResultFcfa',
          'treasuryFcfa',
          'receivablesFcfa',
          'marketRequests',
          'marketSalesFcfa',
          'marketBirds',
          'completenessPct',
          'producedHeads',
          'producedKg',
        ]),
      );
    });

    it('takes margin, completeness and volumes from the formulas in force', () => {
      const source = (values: Record<string, string>) => ({
        version: (key: string) =>
          key in values
            ? { id: `v-${key}`, value: values[key], validFrom: new Date(0) }
            : null,
      });
      expect(parameterDefinition('FORMULE_COMPLETUDE_PCT')).toMatchObject({
        ownerProfile: 'DGE',
        defaultValue: 'jours_saisis / jours_ecoules * 100',
      });
      const defaults = synthesisFormulasOf(formulasInForce(source({}), new Date()));
      const d = buildSynthesis(rich, ALL, defaults);
      expect(d.farms[0]).toMatchObject({
        marginFcfa: 1500,
        marginPct: 75,
        completenessPct: 90,
        producedHeads: 40,
        producedKg: 88,
      });
      const custom = synthesisFormulasOf(
        formulasInForce(
          source({
            FORMULE_COMPLETUDE_PCT: 'jours_saisis / jours_ecoules * 10',
            FORMULE_VOLUME_PRODUIT_KG: 'poids_sortis_periode_kg * 0.75',
            FORMULE_MARGE_FCFA: 'ca_fcfa - charges_fcfa * 2',
          }),
          new Date(),
        ),
      );
      const c = buildSynthesis(rich, ALL, custom);
      expect(c.farms[0]).toMatchObject({
        marginFcfa: 1000,
        marginPct: 50,
        completenessPct: 9,
        producedKg: 66,
      });
      // Undefined (no day elapsed): null, never a fake zero.
      expect(defaults.completeness(0, 0)).toBeNull();
    });
  });
});

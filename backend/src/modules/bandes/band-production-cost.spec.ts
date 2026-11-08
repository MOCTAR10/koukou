import { describe, expect, it } from 'vitest';
import type { BandSummary } from './band-summary.js';
import { productionCostOf } from './band-production-cost.js';

const summary = (
  value: number | null,
  over: Partial<BandSummary> = {},
): BandSummary => ({
  source: 'BILAN',
  asOf: '2026-01-01',
  ageDays: 42,
  durationDays: 42,
  snapshotVersion: 1,
  indicators: [
    {
      key: 'cout_production_kg',
      label: 'Coût de production par kg vif',
      unit: 'FCFA/kg',
      value,
      expression: 'charges_fcfa / poids_vif_produit_kg',
    },
  ],
  revenueFcfa: 0,
  chargesFcfa: 2_550_000,
  marginFcfa: 0,
  completenessPct: null,
  ...over,
});

describe('productionCostOf', () => {
  it('rounds the bilan indicator to 2 decimals and keeps its source', () => {
    expect(productionCostOf(summary(2_550_000 / 2092.8))).toEqual({
      coutProductionKg: 1218.46,
      coutProductionReason: null,
      coutProductionSource: 'BILAN',
    });
  });

  it('gives a reason code when not computable', () => {
    expect(productionCostOf(summary(null)).coutProductionReason).toBe(
      'NO_WEIGHT_PRODUCED',
    );
    expect(
      productionCostOf(summary(null, { chargesFcfa: 0, source: 'EN_COURS' })),
    ).toMatchObject({
      coutProductionKg: null,
      coutProductionReason: 'NO_CHARGES',
      coutProductionSource: 'EN_COURS',
    });
    expect(productionCostOf(null).coutProductionReason).toBe('NOT_COMPUTABLE');
  });
});

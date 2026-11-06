import { describe, expect, it } from 'vitest';

import type { BandComparison, BandHistoryRow } from '@/api/poufa';
import { CONDUITE_LABEL, bestBands, conduiteLine, currentBand, latestComparison, marginLabel, officialText } from './official-headline';

function row(id: string, status: string, values: Record<string, number | null>): BandHistoryRow {
  return {
    id,
    code: `G1-${id}`,
    batchName: null,
    status,
    integrationDate: '2026-10-01',
    closedAt: status === 'CLOTURE' ? '2026-11-01' : null,
    ageDays: 20,
    quantityAtStart: 1000,
    quantityAlive: 900,
    summary: {
      source: status === 'CLOTURE' ? 'BILAN' : 'EN_COURS',
      asOf: '2026-11-06',
      ageDays: 20,
      durationDays: 20,
      snapshotVersion: null,
      indicators: Object.entries(values).map(([key, value]) => ({ key, label: key, unit: key === 'ic' ? 'kg aliment/kg vif' : '%', value, expression: '' })),
      revenueFcfa: null,
      chargesFcfa: null,
      marginFcfa: null,
      completenessPct: 100,
    },
  };
}

describe('official headline', () => {
  it('formats the official value and names Fermia’s figure', () => {
    expect(officialText({ value: 3.21, unit: '%' })).toBe('3,2 %');
    expect(officialText({ value: 1.678, unit: 'kg aliment/kg vif' })).toBe('1,68');
    expect(officialText({ value: null, unit: '%' })).toBe('non calculable');
    expect(officialText(null)).toBe('—');
    expect(conduiteLine('3,4 %')).toBe(`Fermia 3,4 % · ${CONDUITE_LABEL}`);
    expect(CONDUITE_LABEL).toBe('indicateur de conduite (Fermia)');
    expect(marginLabel([{ key: 'taux_marge', label: 'Taux de marge brute' }], 'taux_marge')).toBe('Taux de marge brute');
    expect(marginLabel(null, 'marge_fcfa')).toBe('Marge');
  });

  it('picks the current band and the best closed band per indicator', () => {
    const rows = [row('B3', 'ACTIF', { taux_mortalite: 2 }), row('B2', 'CLOTURE', { taux_mortalite: 5, ic: 1.7 }), row('B1', 'CLOTURE', { taux_mortalite: 3, ic: 1.9 })];
    expect(currentBand(rows)?.id).toBe('B3');
    expect(currentBand(rows.slice(1))).toBeNull();
    const best = bestBands(rows.slice(1));
    expect(best.taux_mortalite).toBe('B1');
    expect(best.ic).toBe('B2');
    expect(best.gmq_g_j).toBeUndefined();
  });

  it('shows the latest week with a programme average', () => {
    const c: BandComparison = {
      batchId: 'b',
      code: null,
      species: 'POULET',
      type: 'CHAIR',
      ageDays: 16,
      currentWeek: 3,
      minGroupSize: 5,
      method: [],
      weeks: [
        { week: 2, ageFrom: 7, ageTo: 13, band: { mortalityPct: 1, fcr: 1.2, gmqG: 30 }, programme: { mortalityPct: 1.5, fcr: 1.3, gmqG: 28, bands: 9, farms: 6 }, suppressed: false },
        { week: 3, ageFrom: 14, ageTo: 20, band: { mortalityPct: 2, fcr: 1.4, gmqG: 40 }, programme: null, suppressed: true },
      ],
    };
    expect(latestComparison(c)?.week).toBe(2);
    expect(latestComparison(null)).toBeNull();
  });
});

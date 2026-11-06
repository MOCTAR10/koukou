import { describe, expect, it } from 'vitest';
import type { BandHistoryRow, BandSummaryIndicator } from '../../api/types-pilotage';
import {
  CONDUITE_LABEL,
  bestBands,
  conduiteLine,
  currentBand,
  marginLabel,
  officialText,
  officialTooltip,
  openBandsHeadline,
  showsBandEconomics,
  summariesById,
} from './headline';

const ind = (key: string, value: number | null, unit = '%'): BandSummaryIndicator => ({
  key,
  label: key === 'ic' ? 'Indice de consommation (IC)' : key,
  unit,
  value,
  expression: `${key} = …`,
});

function row(id: string, status: string, alive: number, values: Partial<Record<string, number | null>>): BandHistoryRow {
  return {
    id,
    code: `G1-0001-${id}`,
    batchName: null,
    status,
    integrationDate: '2026-10-01',
    initialAgeDays: 0,
    initialAvgWeightG: null,
    referenceDurationDays: 45,
    expectedEndDate: null,
    ageDays: 20,
    quantityAtStart: 1000,
    quantityAlive: alive,
    closedAt: null,
    completenessPct: 100,
    weighing: {} as BandHistoryRow['weighing'],
    lastSnapshotVersion: null,
    summary: {
      source: status === 'CLOTURE' ? 'BILAN' : 'EN_COURS',
      asOf: '2026-11-06',
      ageDays: 20,
      durationDays: 20,
      snapshotVersion: status === 'CLOTURE' ? 1 : null,
      indicators: Object.entries(values).map(([k, v]) => ind(k, v ?? null, k === 'ic' ? 'kg aliment/kg vif' : k === 'gmq_g_j' ? 'g/j' : '%')),
      revenueFcfa: null,
      chargesFcfa: null,
      marginFcfa: null,
      completenessPct: 100,
    },
  };
}

describe('official values and Fermia’s second line', () => {
  it('formats the official value, IC without its long unit', () => {
    expect(officialText(ind('taux_mortalite', 3.21))).toBe('3,2 %');
    expect(officialText(ind('ic', 1.678, 'kg aliment/kg vif'))).toBe('1,68');
    expect(officialText(ind('ic', null, 'kg aliment/kg vif'))).toBe('non calculable');
    expect(officialText(null)).toBe('—');
  });

  it('gives the formula in force as a tooltip and always names Fermia’s figure', () => {
    expect(officialTooltip(ind('ic', 1.7))).toBe('Indice de consommation (IC) (officiel) = ic = …');
    expect(conduiteLine('3,4 %')).toBe(`3,4 % · ${CONDUITE_LABEL}`);
    expect(CONDUITE_LABEL).toBe('indicateur de conduite');
  });

  it('reads the margin label of the formula in force', () => {
    expect(marginLabel([{ key: 'marge_fcfa', label: 'Marge brute' }], 'marge_fcfa')).toBe('Marge brute');
    expect(marginLabel(null, 'taux_marge')).toBe('Taux de marge');
  });
});

describe('band history', () => {
  const rows = [
    row('B03', 'ACTIF', 900, { taux_mortalite: 2, ic: 1.6 }),
    row('B02', 'ACTIF', 100, { taux_mortalite: 10, ic: null }),
    row('B01', 'CLOTURE', 0, { taux_mortalite: 4, ic: 1.8, gmq_g_j: 50 }),
  ];

  it('finds the current band and the summaries by id', () => {
    expect(currentBand(rows)?.id).toBe('B03');
    expect(currentBand([rows[2]])).toBeNull();
    expect(summariesById(rows).get('B01')?.source).toBe('BILAN');
  });

  it('weights the open bands by their live birds', () => {
    const h = openBandsHeadline(rows);
    expect(h.bands).toBe(2);
    expect(h.taux_mortalite).toBeCloseTo((2 * 900 + 10 * 100) / 1000, 6);
    // B02 has no IC: only B03 counts.
    expect(h.ic).toBeCloseTo(1.6, 6);
    expect(h.gmq_g_j).toBeNull();
  });

  it('marks the best band per indicator when there are two to compare', () => {
    const best = bestBands(rows);
    expect(best.taux_mortalite).toBe('B03');
    expect(best.ic).toBe('B03');
    // Only one band has a GMQ: nothing to compare.
    expect(best.gmq_g_j).toBeUndefined();
  });
});

// POUFA lot A2 droits (F6).
describe('showsBandEconomics', () => {
  it('hides the money block once the server masked it', () => {
    expect(showsBandEconomics([])).toBe(true);
    expect(showsBandEconomics([null, { economicMasked: false }, {}])).toBe(true);
    expect(showsBandEconomics([{ economicMasked: false }, { economicMasked: true }])).toBe(false);
  });
});

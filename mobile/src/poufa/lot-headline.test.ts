import { describe, expect, it } from 'vitest';

import type { BandHistoryRow } from '@/api/poufa';
import { CONDUITE_LABEL } from './official-headline';
import { headlineCell, lotHeadlines, officialByBand, overviewCell } from './lot-headline';

function row(id: string, values: Record<string, number | null> | null): BandHistoryRow {
  return {
    id,
    code: `G1-${id}`,
    batchName: null,
    status: 'EN_COURS',
    integrationDate: '2026-10-01',
    closedAt: null,
    ageDays: 20,
    quantityAtStart: 1000,
    quantityAlive: 900,
    summary: values
      ? {
          source: 'EN_COURS',
          asOf: '2026-11-06',
          ageDays: 20,
          durationDays: 20,
          snapshotVersion: null,
          indicators: Object.entries(values).map(([key, value]) => ({ key, label: key, unit: key === 'ic' ? 'kg aliment/kg vif' : '%', value, expression: '' })),
          revenueFcfa: null,
          chargesFcfa: null,
          marginFcfa: null,
          completenessPct: 100,
        }
      : null,
  };
}

describe('Lots tab headline', () => {
  const map = officialByBand([row('a', { taux_mortalite: 3.21, ic: 1.678 }), row('b', { taux_mortalite: 1.0, ic: null }), row('c', null)]);

  it('maps the official indicators of each band that has a summary', () => {
    expect([...map.keys()]).toEqual(['a', 'b']);
    expect(officialByBand(null).size).toBe(0);
  });

  it('puts the official value first and labels Fermia’s figure « conduite »', () => {
    const cell = headlineCell(map.get('a'), 'taux_mortalite', { text: '3,4 %', value: 3.4 });
    expect(cell).toEqual({ value: '3,2 %', sub: '', official: true, numeric: 3.21 });
    expect(headlineCell(map.get('a'), 'ic', { text: '1,7', value: 1.7 }, true).sub).toBe('');
    expect(headlineCell(map.get('b'), 'ic', { text: '1,7', value: 1.7 }).value).toBe('non calculable');
  });

  it('keeps Fermia’s figure, labelled as conduct, without an official value', () => {
    expect(headlineCell(map.get('c'), 'gmq_g_j', { text: '52 g', value: 52 })).toEqual({ value: '52 g', sub: CONDUITE_LABEL, official: false, numeric: 52 });
    expect(headlineCell(undefined, 'gmq_g_j', { text: '52 g', value: 52 }, true).sub).toBe('Fermia · conduite');
  });

  it('builds the four cells of a lot from its metrics', () => {
    const head = lotHeadlines(map.get('a'), { mortalityPercent: 3.4, fcr: 1.7, gmqGramsPerDay: null, viabilityPercent: 96.6 });
    expect(head.mortality.value).toBe('3,2 %');
    expect(head.fcr.sub).toBe('');
    expect(head.gmq).toEqual({ value: '—', sub: CONDUITE_LABEL, official: false, numeric: null });
    expect(head.viability.value).toBe('96,6 %');
  });

  it('averages the official values in the overview, Fermia’s mean second', () => {
    const cell = overviewCell(['a', 'b', 'c'], map, 'taux_mortalite', { text: '2 %', value: 2 });
    expect(cell.value).toBe('2,1 %');
    expect(cell.numeric).toBeCloseTo(2.105);
    expect(cell.sub).toBe('');
    // A dated overview has no official set.
    expect(overviewCell(['a'], null, 'ic', { text: '1,8', value: 1.8 })).toEqual({ value: '1,8', sub: CONDUITE_LABEL, official: false, numeric: 1.8 });
  });
});

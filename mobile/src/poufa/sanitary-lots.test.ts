import { describe, expect, it } from 'vitest';

import type { SanitaryLotView } from '@/api/poufa';
import { openSanitaryLots, sanitaryLotAsBatch } from './sanitary-lots';
import { officialAlertRows } from './official-alerts';

const lot = (over: Partial<SanitaryLotView> = {}): SanitaryLotView =>
  ({
    id: 'b-1',
    code: 'B-2026-001',
    name: null,
    species: 'POULET',
    type: 'CHAIR',
    status: 'ACTIF',
    integrationDate: '2026-10-27',
    ageDays: 12,
    quantityAtStart: 500,
    quantityAlive: 490,
    closedAt: null,
    building: null,
    ...over,
  }) as SanitaryLotView;

describe('sanitaryLotAsBatch', () => {
  it('âge à l’ouverture = âge du jour − jours écoulés', () => {
    const b = sanitaryLotAsBatch(lot(), 'f-1', '2026-11-06');
    expect(b.initialAgeDays).toBe(2);
    expect(b.batchName).toBe('B-2026-001');
    expect(b.farmId).toBe('f-1');
  });

  it('bande clôturée : âge mesuré à la clôture, jamais négatif', () => {
    expect(sanitaryLotAsBatch(lot({ closedAt: '2026-11-01T10:00:00.000Z', ageDays: 5 }), 'f-1', '2026-11-06').initialAgeDays).toBe(0);
  });

  it('ne propose que les bandes ouvertes', () => {
    const list = [lot(), lot({ id: 'b-2', status: 'CLOTURE' }), lot({ id: 'b-3', closedAt: '2026-11-01' })];
    expect(openSanitaryLots(list, 'f-1', '2026-11-06').map((b) => b.id)).toEqual(['b-1']);
  });
});

describe('officialAlertRows', () => {
  const alert = (id: string, statusFamily: string, factDay: string, over: Record<string, unknown> = {}) =>
    ({
      id,
      code: `AS-2026-${id}`,
      statusCode: statusFamily === 'CLOSE' ? 'CLOSE' : 'NOUVELLE',
      statusFamily,
      severity: 'ROUGE',
      origin: 'DECLARATION',
      factDay,
      lastFactDay: null,
      batchCode: 'B-1',
      summary: 'Suspicion',
      clinicalSigns: ['TOUX'],
      published: false,
      ...over,
    }) as never;

  it('ouvertes d’abord, puis par jour des faits, libellés résolus', () => {
    const rows = officialAlertRows(
      [alert('1', 'CLOSE', '2026-11-05'), alert('2', 'OUVERTE', '2026-11-01'), alert('3', 'OUVERTE', '2026-11-03', { lastFactDay: '2026-11-04' })],
      [],
      [{ id: 's', listType: 'SIGNE_CLINIQUE', code: 'TOUX', label: 'Toux', family: null, meta: null, sort: 1, active: true }],
    );
    expect(rows.map((r) => r.id)).toEqual(['3', '2', '1']);
    expect(rows[0].period).toBe('du 03/11/2026 au 04/11/2026');
    expect(rows[1].period).toBe('le 01/11/2026');
    expect(rows[0].statusLabel).toBe('Nouvelle');
    expect(rows[0].originLabel).toBe('Suspicion déclarée');
    expect(rows[0].signs).toBe('Toux');
    expect(rows[2].closed).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { _clearBreedCache, LiveApi, mapAdvisory } from './live';
import { clearSession } from './token';
import { jsonResponse, readCall, stubFetch, stubFetchSequence } from './test-utils';
import type { AlertLevel } from './types';

vi.mock('expo-constants', () => ({
  default: { expoConfig: { hostUri: '10.0.0.5:8081' } },
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

type RawAction = {
  id: string;
  category: string;
  level: AlertLevel;
  title: string;
  description: string;
  dueDate: string | null;
  batchId: string | null;
  batchName: string | null;
  buildingId: string | null;
  acknowledged: boolean;
  alertId: string | null;
};

function rawAdvisory(actions: RawAction[], summary?: { rouge: number; jaune: number; vert: number }) {
  const s = summary ?? {
    rouge: actions.filter((a) => a.level === 'ROUGE').length,
    jaune: actions.filter((a) => a.level === 'JAUNE').length,
    vert: actions.filter((a) => a.level === 'VERT').length,
  };
  return {
    farmId: 'f-1',
    generatedAt: '2026-08-28T06:00:00.000Z',
    summary: { ...s, total: s.rouge + s.jaune + s.vert },
    actions,
  };
}

function action(over: Partial<RawAction>): RawAction {
  return {
    id: 'a-1',
    category: 'SAISIE',
    level: 'JAUNE',
    title: 'Saisie du jour manquante',
    description: 'Enregistrez les morts et l’alimentation.',
    dueDate: null,
    batchId: 'b-2',
    batchName: 'Lot A-061',
    buildingId: null,
    acknowledged: false,
    alertId: null,
    ...over,
  };
}

beforeEach(() => {
  clearSession();
  vi.unstubAllGlobals();
  _clearBreedCache();
});

describe('mapAdvisory', () => {
  it('aucune action → score 100 EXCELLENT', () => {
    const d = mapAdvisory(rawAdvisory([]));
    expect(d.pulse).toMatchObject({ score: 100, grade: 'EXCELLENT', breakdown: { rouge: 0, jaune: 0, saisiesManquantes: 0 } });
    expect(d.actions).toEqual([]);
  });

  it('1 rouge + 1 saisie → 65 MOYEN', () => {
    const d = mapAdvisory(
      rawAdvisory([action({ id: 'r', category: 'ALERTE', level: 'ROUGE' }), action({ id: 's', category: 'SAISIE' })]),
    );
    expect(d.pulse.score).toBe(65);
    expect(d.pulse.grade).toBe('MOYEN');
  });

  it.each([
    [{ rouge: 0, jaune: 0 }, 100, 'EXCELLENT'],
    [{ rouge: 1, jaune: 0 }, 80, 'BON'],
    [{ rouge: 1, jaune: 3 }, 65, 'MOYEN'],
    [{ rouge: 2, jaune: 2 }, 50, 'MOYEN'],
    [{ rouge: 2, jaune: 3 }, 45, 'CRITIQUE'],
    [{ rouge: 5, jaune: 0 }, 0, 'CRITIQUE'],
  ] as const)('résumé %j → score %i, grade %s', (summary, score, grade) => {
    const d = mapAdvisory(rawAdvisory([], { ...summary, vert: 0 }));
    expect(d.pulse.score).toBe(score);
    expect(d.pulse.grade).toBe(grade);
  });

  it('alerts reflètent actions (acquittement, message, date)', () => {
    const d = mapAdvisory(
      rawAdvisory([action({ id: 'a1', category: 'SAISIE', title: 'Saisie en retard' }), action({ id: 'a2', category: 'ALERTE', level: 'ROUGE', acknowledged: true })]),
    );
    expect(d.alerts).toHaveLength(2);
    expect(d.alerts[0]).toMatchObject({
      status: 'ACTIVE',
      message: 'Saisie en retard',
      kind: 'SAISIE',
      level: 'JAUNE',
      createdAt: '2026-08-28T06:00:00.000Z',
    });
    expect(d.alerts[1]).toMatchObject({ status: 'ACQUITTEE', level: 'ROUGE' });
  });

  it('CTA par catégorie, défaut Voir', () => {
    const d = mapAdvisory(rawAdvisory([action({ category: 'SAISIE' }), action({ category: 'VENTE' }), action({ category: 'INCONNUE' })]));
    expect(d.actions.map((a) => a.cta)).toEqual(['Saisir', 'Encaisser', 'Voir']);
  });
});

describe('LiveApi.fetchAdvisory', () => {
  it('appelle next-actions et mappe le pulse', async () => {
    const fetchMock = stubFetch(async () =>
      jsonResponse(200, rawAdvisory([action({ id: 'r', category: 'ALERTE', level: 'ROUGE' }), action({ id: 'v', category: 'VENTE', level: 'JAUNE' })])),
    );
    const d = await new LiveApi().fetchAdvisory('f-1');
    expect(readCall(fetchMock).url).toBe('http://10.0.0.5:3000/farms/f-1/advisory/next-actions');
    expect(d.pulse.score).toBe(75);
    expect(d.pulse.breakdown).toMatchObject({ rouge: 1, jaune: 1 });
  });
});

describe('LiveApi.fetchBatches / fetchBatch', () => {
  it('résout le nom de souche via le cache /breeds', async () => {
    const fetchMock = stubFetchSequence([
      jsonResponse(200, [{ id: 'b1', name: 'Cobb 500', refCode: 'CB-500' }]),
      jsonResponse(200, [
        {
          id: 'lot-1',
          farmId: 'f-1',
          batchName: 'Lot A-061',
          breedId: 'b1',
          integrationDate: '2026-06-01',
          quantityAtStart: 3000,
          quantityAlive: 2960,
          type: 'CHAIR',
          status: 'EN_VENTE',
          metrics: {},
        },
      ]),
    ]);
    const batches = await new LiveApi().fetchBatches('f-1');
    expect(batches[0].breedName).toBe('Cobb 500');
    expect(batches[0].breedCode).toBe('CB-500');
    expect(batches[0].quantityAlive).toBe(2960);
    expect(batches[0].metrics.liveCount).toBe(0);
    expect(readCall(fetchMock, 0).url).toBe('http://10.0.0.5:3000/breeds');
  });

  it('fetchBatch réutilise le cache de souches (pas de 2e GET /breeds)', async () => {
    const rawBatch = {
      id: 'lot-9',
      farmId: 'f-1',
      batchName: 'Lot P-012',
      breedId: 'b9',
      integrationDate: '2026-01-15',
      quantityAtStart: 500,
      quantityAlive: 480,
      type: 'PONDEUSE',
      status: 'ACTIF',
      metrics: {},
    };
    const fetchMock = stubFetchSequence([
      jsonResponse(200, [{ id: 'b9', name: 'ISA Brown', refCode: 'ISA-43' }]),
      jsonResponse(200, [rawBatch]),
      jsonResponse(200, rawBatch),
    ]);
    const api = new LiveApi();
    await api.fetchBatches('f-1');
    const batch = await api.fetchBatch('f-1', 'lot-9');
    expect(batch.breedName).toBe('ISA Brown');
    expect(batch.breedCode).toBe('ISA-43');
    expect(readCall(fetchMock, 2).url).toContain('/batches/lot-9');
    const breedsCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/breeds'));
    expect(breedsCalls).toHaveLength(1);
  });
});

describe('LiveApi.fetchFeedStock / fetchCaisse', () => {
  it('fetchFeedStock lit l’inventaire provende', async () => {
    const fetchMock = stubFetch(async () =>
      jsonResponse(200, { byType: [{ foodType: 'CROISSANCE', availableKg: 780, autonomyDays: 4, status: 'JAUNE' }], lots: [], losses: [] }),
    );
    const s = await new LiveApi().fetchFeedStock('f-1');
    expect(s.byType[0].foodType).toBe('CROISSANCE');
    expect(s.losses).toEqual([]);
    expect(readCall(fetchMock).url).toBe('http://10.0.0.5:3000/farms/f-1/feed-stock');
  });

  it('fetchCaisseCurrent lit la session ouverte (nullable)', async () => {
    const fetchMock = stubFetch(async () =>
      jsonResponse(200, { session: { id: 's-1', status: 'OPEN' }, movements: [], expectedBalanceFcfa: 0, inFcfa: 0, outFcfa: 0 }),
    );
    const cur = await new LiveApi().fetchCaisseCurrent('f-1');
    expect(cur?.session?.id).toBe('s-1');
    expect(readCall(fetchMock).url).toBe('http://10.0.0.5:3000/farms/f-1/caisse/current');
  });

  it('fetchCaisseCurrent renvoie null sans session', async () => {
    stubFetch(async () => jsonResponse(200, null));
    const cur = await new LiveApi().fetchCaisseCurrent('f-1');
    expect(cur).toBeNull();
  });

  it('fetchCaisseSessions lit l’historique', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, [{ id: 's-2', status: 'CLOSED' }]));
    const sessions = await new LiveApi().fetchCaisseSessions('f-1');
    expect(sessions[0].status).toBe('CLOSED');
    expect(readCall(fetchMock).url).toBe('http://10.0.0.5:3000/farms/f-1/caisse/sessions');
  });
});

describe('LiveApi — sanitaire, abattage, clients, rentabilité', () => {
  it('fetchProtocols lit le référentiel', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, [{ id: 'proto-1', name: 'Pintade chair Gabon', steps: [] }]));
    const protocols = await new LiveApi().fetchProtocols('PINTADE', 'CHAIR');
    expect(protocols[0].id).toBe('proto-1');
    expect(readCall(fetchMock).url).toBe('http://10.0.0.5:3000/sanitary/protocols?species=PINTADE&type=CHAIR');
  });

  it('fetchProtocols sans filtre ne passe aucun query string', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, []));
    await new LiveApi().fetchProtocols();
    expect(readCall(fetchMock).url).toBe('http://10.0.0.5:3000/sanitary/protocols');
  });

  it('fetchProphylaxis lit le calendrier du lot', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, [{ id: 'e-1', status: 'PLANIFIE' }]));
    const events = await new LiveApi().fetchProphylaxis('f-1', 'b-2');
    expect(events[0].status).toBe('PLANIFIE');
    expect(readCall(fetchMock).url).toBe('http://10.0.0.5:3000/farms/f-1/batches/b-2/prophylaxis');
  });

  it('fetchTreatments lit l’historique des soins', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, [{ id: 't-1', careType: 'VITAMINE' }]));
    const treatments = await new LiveApi().fetchTreatments('f-1', 'b-2');
    expect(treatments[0].careType).toBe('VITAMINE');
    expect(readCall(fetchMock).url).toBe('http://10.0.0.5:3000/farms/f-1/batches/b-2/treatments');
  });

  it('fetchSlaughterOrders liste les ordres', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, [{ id: 'ab-1', status: 'SENT' }]));
    const orders = await new LiveApi().fetchSlaughterOrders('f-1');
    expect(orders[0].status).toBe('SENT');
    expect(readCall(fetchMock).url).toBe('http://10.0.0.5:3000/farms/f-1/slaughter-orders');
  });

  it('fetchCustomers / fetchCustomer / stats / history', async () => {
    const fetchMock = stubFetchSequence([
      jsonResponse(200, [{ id: 'c-1', fullName: 'Coco', segment: 'TOP' }]),
      jsonResponse(200, { id: 'c-1', fullName: 'Coco', segment: 'TOP' }),
      jsonResponse(200, { visits: 3, totalSpentFcfa: 5000 }),
      jsonResponse(200, [{ id: 's-1', referenceNumber: 'VTE-20260828-000001' }]),
    ]);
    const api = new LiveApi();
    const list = await api.fetchCustomers('f-1');
    expect(list[0].segment).toBe('TOP');
    const one = await api.fetchCustomer('f-1', 'c-1');
    expect(one.fullName).toBe('Coco');
    const stats = await api.fetchCustomerStats('f-1', 'c-1');
    expect(stats.visits).toBe(3);
    const history = await api.fetchCustomerHistory('f-1', 'c-1');
    expect(history[0].referenceNumber).toContain('VTE-');
    expect(readCall(fetchMock, 1).url).toBe('http://10.0.0.5:3000/farms/f-1/customers/c-1');
    expect(readCall(fetchMock, 2).url).toBe('http://10.0.0.5:3000/farms/f-1/customers/c-1/stats');
    expect(readCall(fetchMock, 3).url).toBe('http://10.0.0.5:3000/farms/f-1/customers/c-1/history');
  });

  it('fetchPromotions liste les coupons', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, [{ id: 'p-1', code: 'BIENVENUE10', active: true }]));
    const promos = await new LiveApi().fetchPromotions('f-1');
    expect(promos[0].code).toBe('BIENVENUE10');
    expect(readCall(fetchMock).url).toBe('http://10.0.0.5:3000/farms/f-1/promotions');
  });

  it('fetchRentabiliteOverview passe la période en query', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, { period: { from: '2026-08-01', to: '2026-08-28' }, netFcfa: 100 }));
    const pnl = await new LiveApi().fetchRentabiliteOverview('f-1', '2026-08-01', '2026-08-28');
    expect(pnl.netFcfa).toBe(100);
    expect(readCall(fetchMock).url).toContain('/farms/f-1/rentabilite/overview?from=2026-08-01&to=2026-08-28');
  });

  it('fetchRentabiliteOverview : sans période, pas de query', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, { period: {} }));
    await new LiveApi().fetchRentabiliteOverview('f-1');
    expect(readCall(fetchMock).url).not.toContain('?');
  });

  it('fetchRentabiliteBatch lit le P&L du lot', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, { batchId: 'b-2', netFcfa: 55 }));
    const pnl = await new LiveApi().fetchRentabiliteBatch('f-1', 'b-2');
    expect(pnl.batchId).toBe('b-2');
    expect(readCall(fetchMock).url).toBe('http://10.0.0.5:3000/farms/f-1/rentabilite/batches/b-2');
  });

  it('fetchSales liste les ventes (période en query optionnelle)', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, [{ id: 's-1', referenceNumber: 'VTE-20260828-000001', status: 'SETTLED' }]));
    const sales = await new LiveApi().fetchSales('f-1', '2026-08-01', '2026-08-28');
    expect(sales[0].status).toBe('SETTLED');
    expect(readCall(fetchMock).url).toBe('http://10.0.0.5:3000/farms/f-1/sales?from=2026-08-01&to=2026-08-28');
  });

  it('fetchSales : sans période, pas de query', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, []));
    await new LiveApi().fetchSales('f-1');
    expect(readCall(fetchMock).url).toBe('http://10.0.0.5:3000/farms/f-1/sales');
  });

  it('fetchStockTransfers liste les transferts (boutique en query optionnelle)', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, [{ id: 't-1', status: 'TRANSFERRED', quantity: 12, quantitySold: 4 }]));
    const transfers = await new LiveApi().fetchStockTransfers('f-1');
    expect(transfers[0].status).toBe('TRANSFERRED');
    expect(readCall(fetchMock).url).toBe('http://10.0.0.5:3000/farms/f-1/stock-transfers');
  });

  it('fetchStockTransfers filtre par boutique', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, []));
    await new LiveApi().fetchStockTransfers('f-1', 'pdv-boutique-1');
    expect(readCall(fetchMock).url).toBe('http://10.0.0.5:3000/farms/f-1/stock-transfers?pointOfSaleId=pdv-boutique-1');
  });

  it('fetchStockTransfers filtre par type de produit', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, []));
    await new LiveApi().fetchStockTransfers('f-1', undefined, 'OEUFS');
    expect(readCall(fetchMock).url).toBe('http://10.0.0.5:3000/farms/f-1/stock-transfers?productType=OEUFS');
  });

  it('fetchExpenses liste les dépenses (période en query optionnelle)', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, [{ id: 'e-1', category: 'ALIMENTS', amountFcfa: 420000 }]));
    const expenses = await new LiveApi().fetchExpenses('f-1', '2026-08-01', '2026-08-28');
    expect(expenses[0].amountFcfa).toBe(420000);
    expect(readCall(fetchMock).url).toBe('http://10.0.0.5:3000/farms/f-1/expenses?from=2026-08-01&to=2026-08-28');
  });

  it('fetchOrders filtre par canal et statut', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, [{ id: 'ord-1', referenceNumber: 'CMD-20260828-000001', status: 'CONFIRMED' }]));
    const orders = await new LiveApi().fetchOrders('f-1', 'PRECOMMANDE', 'CONFIRMED');
    expect(orders[0].status).toBe('CONFIRMED');
    expect(readCall(fetchMock).url).toBe('http://10.0.0.5:3000/farms/f-1/orders?canal=PRECOMMANDE&status=CONFIRMED');
  });

  it('fetchOrders : sans filtre, pas de query', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, []));
    await new LiveApi().fetchOrders('f-1');
    expect(readCall(fetchMock).url).toBe('http://10.0.0.5:3000/farms/f-1/orders');
  });

  it('fetchOrder lit le détail d’une commande', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, { id: 'ord-1', sale: { id: 's-1' } }));
    const order = await new LiveApi().fetchOrder('f-1', 'ord-1');
    expect(order.sale).toBeDefined();
    expect(readCall(fetchMock).url).toBe('http://10.0.0.5:3000/farms/f-1/orders/ord-1');
  });

  it('fetchFarmMembers liste les employés liés', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, [{ id: 'emp-1', farmId: 'f-1', userId: 'u-1', buildingAssignment: null, user: { id: 'u-1', fullName: 'J. Ondo', phone: '+241', role: 'ELEVEUR' } }]));
    const members = await new LiveApi().fetchFarmMembers('f-1');
    expect(members[0].user.role).toBe('ELEVEUR');
    expect(members[0].buildingAssignment).toBeNull();
    expect(readCall(fetchMock).url).toBe('http://10.0.0.5:3000/farms/f-1/eleveurs');
  });

  it('fetchReferenceConstants liste les seuils', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, [{ key: 'vide_sanitaire_min_days', value: 14, description: null, isEditable: true }]));
    const constants = await new LiveApi().fetchReferenceConstants();
    expect(constants[0].key).toBe('vide_sanitaire_min_days');
    expect(readCall(fetchMock).url).toBe('http://10.0.0.5:3000/reference-constants');
  });
});
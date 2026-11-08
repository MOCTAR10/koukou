import { beforeEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, readCall, stubFetch, stubFetchSequence } from '@/api/test-utils';
import { clearSession, saveSession, type StoredSession } from '@/api/token';

import { MAX_SERVER_ATTEMPTS, cancelStockTransferQueued, heldCashSummary, createCreditSaleQueued, deliverOrderQueued, createStockTransferQueued, createDailyEntryQueued, createSaleQueued, flushQueue, recordCustomerPaymentQueued } from './engine';
import { clearQueue, clearUserQueue, countUserOps, dismissRejected, enqueueOp, getQueueVersion, loadOps, loadRejected, removeOp, salvageOps, subscribeQueue } from './store';

vi.mock('expo-constants', () => ({
  default: { expoConfig: { hostUri: '192.168.1.10:8081' } },
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

const networkError = () => {
  throw new TypeError('Network request failed');
};

beforeEach(() => {
  clearQueue();
  loadRejected().forEach((op) => dismissRejected(op.id));
  clearSession();
  vi.unstubAllGlobals();
});

describe('store — file FIFO', () => {
  it('enqueue préserve l’ordre FIFO, version et abonnés notifiés', () => {
    const listener = vi.fn();
    const unsub = subscribeQueue(listener);
    const v0 = getQueueVersion();

    enqueueOp({
      id: 'off-sale-1',
      kind: 'sale',
      farmId: 'f-1',
      payload: { saleDate: '2026-08-28', items: [], payments: [] },
      createdAt: '2026-08-28T08:00:00.000Z',
    });
    enqueueOp({
      id: 'off-daily-1',
      kind: 'daily-entry',
      farmId: 'f-1',
      batchId: 'b-1',
      payload: { entryDate: '2026-08-28' },
      createdAt: '2026-08-28T08:05:00.000Z',
    });

    expect(getQueueVersion()).toBeGreaterThan(v0);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(loadOps().map((op) => op.id)).toEqual(['off-sale-1', 'off-daily-1']);

    unsub();
    removeOp('off-sale-1');
    expect(loadOps().map((op) => op.id)).toEqual(['off-daily-1']);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('clearQueue vide la file et notifie', () => {
    enqueueOp({ id: 'off-sale-1', kind: 'sale', farmId: 'f-1', payload: {}, createdAt: '2026-08-28T08:00:00.000Z' });
    clearQueue();
    expect(loadOps()).toEqual([]);
  });

  it('charge une file corrompue comme vide', () => {
    const g = globalThis as unknown as { localStorage?: { setItem: (k: string, v: string) => void } };
    g.localStorage?.setItem('koukou.offline.queue', '{pas du json');
    expect(loadOps()).toEqual([]);
  });
});

describe('storage — persistance localStorage', () => {
  it('persiste la file dans localStorage valide quand présent', () => {
    const store = {
      data: new Map<string, string>(),
      getItem: (k: string) => store.data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.data.set(k, v);
      },
      removeItem: (k: string) => {
        store.data.delete(k);
      },
    };
    vi.stubGlobal('localStorage', store);

    enqueueOp({ id: 'off-sale-7', kind: 'sale', farmId: 'f-1', payload: {}, createdAt: '2026-08-28T08:00:00.000Z' });
    expect(store.data.get('koukou.offline.queue')).toContain('off-sale-7');

    clearQueue();
    expect(loadOps()).toEqual([]);
    vi.unstubAllGlobals();
  });
});

describe('store — file corrompue ou illisible', () => {
  const memStore = () => {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
  };

  it('déplace une file corrompue vers une clé de secours', () => {
    const store = memStore();
    vi.stubGlobal('localStorage', store);
    store.setItem('koukou.offline.queue', '{pas du json');
    expect(loadOps()).toEqual([]);
    const backups = [...store.data.keys()].filter((k) => k.startsWith('koukou.offline.queue.corrupt.'));
    expect(backups).toHaveLength(1);
    expect(store.data.get(backups[0])).toBe('{pas du json');
    vi.unstubAllGlobals();
  });

  it('lecture impossible : n’écrase pas la file', () => {
    const store = memStore();
    store.setItem('koukou.offline.queue', '[{"id":"off-sale-1"}]');
    vi.stubGlobal('localStorage', {
      ...store,
      getItem: () => {
        throw new Error('EIO');
      },
    });
    expect(loadOps()).toEqual([]);
    expect(() =>
      enqueueOp({ id: 'off-sale-2', kind: 'sale', farmId: 'f-1', payload: {}, createdAt: '2026-08-28T08:00:00.000Z' }),
    ).toThrow();
    expect(store.data.get('koukou.offline.queue')).toBe('[{"id":"off-sale-1"}]');
    vi.unstubAllGlobals();
  });
});

describe('capture hors-ligne — enfile et rejette', () => {
  it('createDailyEntryQueued : erreur réseau → mis en attente (poster)', async () => {
    stubFetch(networkError);
    const res = await createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-08-28', deaths: 3 });
    expect(res).toEqual({ status: 'queued' });
    const [op] = loadOps();
    expect(op.kind).toBe('daily-entry');
    expect(op.farmId).toBe('f-1');
    expect(op.batchId).toBe('b-1');
    expect(op.payload).toMatchObject({ entryDate: '2026-08-28', deaths: 3 });
  });

  it('createDailyEntryQueued : erreur serveur (5xx) → mis en attente', async () => {
    stubFetch(async () => jsonResponse(503, null));
    const res = await createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-08-28' });
    expect(res).toEqual({ status: 'queued' });
  });

  it('createDailyEntryQueued : refus backend (4xx) → propagé, rien en file', async () => {
    stubFetch(async () => jsonResponse(400, { message: 'Lot inconnu.' }));
    await expect(createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-08-28' })).rejects.toMatchObject({
      status: 400,
    });
    expect(loadOps()).toEqual([]);
  });

  it('createSaleQueued : réseau → en attente avec idempotencyKey = id op', async () => {
    stubFetch(networkError);
    const res = await createSaleQueued('f-1', '2026-08-28', [], 2500);
    expect(res).toEqual({ status: 'queued' });
    const [op] = loadOps();
    expect(op.kind).toBe('sale');
    expect(op.payload).toEqual({
      saleDate: '2026-08-28',
      items: [],
      idempotencyKey: op.id,
      payments: [{ method: 'CASH', amountFcfa: 2500, idempotencyKey: op.id }],
    });
  });

  it('createSaleQueued : la zone client/coupon est conservée en attente', async () => {
    stubFetch(networkError);
    await createSaleQueued('f-1', '2026-08-28', [], 2500, {
      customerName: 'Restaurant Coco',
      customerPhone: '074112233',
      promoCode: 'BIENVENUE10',
    });
    const [op] = loadOps();
    expect(op.payload).toMatchObject({
      customerName: 'Restaurant Coco',
      customerPhone: '074112233',
      promoCode: 'BIENVENUE10',
    });
  });

  it('createSaleQueued : en ligne → la vente emporte la zone client/coupon', async () => {
    const fetchMock = stubFetchSequence([
      jsonResponse(200, { session: { id: 's-1' } }),
      jsonResponse(201, { sale: { referenceNumber: 'VTE-20260828-000001' } }),
    ]);
    await createSaleQueued('f-1', '2026-08-28', [], 2500, { customerPhone: '074112233', promoCode: 'BIENVENUE10' });
    const saleCall = readCall(fetchMock, 1);
    expect(saleCall.url).toContain('/sales');
    expect(JSON.parse(saleCall.init.body as string)).toMatchObject({
      customerPhone: '074112233',
      promoCode: 'BIENVENUE10',
    });
  });

  it('createSaleQueued : en ligne → envoyée avec référence retournée', async () => {
    stubFetchSequence([
      jsonResponse(200, { session: { id: 's-1' } }),
      jsonResponse(201, { sale: { referenceNumber: 'VTE-20260828-000001' } }),
    ]);
    const res = await createSaleQueued('f-1', '2026-08-28', [], 2500);
    expect(res).toEqual({ status: 'sent', reference: 'VTE-20260828-000001' });
    expect(loadOps()).toEqual([]);
  });

  it('createCreditSaleQueued : réseau → en attente sans paiement (crédit client)', async () => {
    stubFetch(networkError);
    const res = await createCreditSaleQueued('f-1', '2026-08-28', [], { customerId: 'c-1' });
    expect(res).toEqual({ status: 'queued' });
    const [op] = loadOps();
    expect(op.kind).toBe('sale');
    expect(op.payload).toEqual({
      saleDate: '2026-08-28',
      items: [],
      idempotencyKey: op.id,
      payments: [],
      customerId: 'c-1',
    });
  });

  it('createCreditSaleQueued : en ligne → envoyée sans ouvrir de caisse', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(201, { sale: { referenceNumber: 'VTE-20260828-000042' } }));
    const res = await createCreditSaleQueued('f-1', '2026-08-28', [], { customerId: 'c-1' });
    expect(res).toEqual({ status: 'sent', reference: 'VTE-20260828-000042' });
    expect(readCall(fetchMock).url).toContain('/sales');
    expect(loadOps()).toEqual([]);
  });

  it('recordCustomerPaymentQueued : réseau → mis en attente (kind customer-payment)', async () => {
    stubFetch(networkError);
    const res = await recordCustomerPaymentQueued('f-1', 'c-1', 25000);
    expect(res).toEqual({ status: 'queued' });
    const [op] = loadOps();
    expect(op.kind).toBe('customer-payment');
    expect(op.payload).toEqual({ customerId: 'c-1', amountFcfa: 25000, idempotencyKey: op.id });
  });

  it('createStockTransferQueued : réseau → mis en attente avec le bon kind', async () => {
    stubFetch(networkError);
    const res = await createStockTransferQueued('f-1', { productType: 'ABATTU', slaughterOrderId: 'ab-1', pointOfSaleId: 'pdv-2', quantity: 12 });
    expect(res).toEqual({ status: 'queued' });
    const [op] = loadOps();
    expect(op.kind).toBe('stock-transfer-create');
    expect(op.payload).toEqual({
      productType: 'ABATTU',
      slaughterOrderId: 'ab-1',
      pointOfSaleId: 'pdv-2',
      quantity: 12,
      idempotencyKey: op.id,
    });
  });

  it('création hors-ligne : même idempotencyKey en direct et au rejeu (pas de doublon serveur)', async () => {
    // Live POST reached the server but the response was lost (timeout).
    const live = stubFetch(networkError);
    await createStockTransferQueued('f-1', { productType: 'PROVENDE', inputLotId: 'l-1', pointOfSaleId: 'pdv-2', unit: 'SAC', quantity: 2 });
    const liveKey = JSON.parse(readCall(live).init.body as string).idempotencyKey;
    const [op] = loadOps();
    expect(liveKey).toBe(op.id);

    const replay = stubFetch(async () => jsonResponse(201, { id: 'tr-1' }));
    await flushQueue();
    expect(JSON.parse(readCall(replay).init.body as string).idempotencyKey).toBe(liveKey);
  });

  it('livraison hors ligne : rejouée avec l’heure de la livraison sur le téléphone', async () => {
    const live = stubFetch(networkError);
    await deliverOrderQueued('f-1', 'o-1');
    const liveBody = JSON.parse(readCall(live).init.body as string);
    expect(typeof liveBody.capturedAt).toBe('string');
    expect(typeof liveBody.deviceSentAt).toBe('string');
    const replay = stubFetch(async () => jsonResponse(201, { id: 'o-1' }));
    await flushQueue();
    const body = JSON.parse(readCall(replay).init.body as string);
    expect(body.capturedAt).toBe(liveBody.capturedAt);
    expect(body.deviceId).toBe(liveBody.deviceId);
  });

  it('livraison mise en file avant le lot A2 : l’heure de l’op tient lieu de capture', async () => {
    enqueueOp({ id: 'off-order-deliver-legacy', kind: 'order-deliver', farmId: 'f-1', payload: { orderId: 'o-1' }, createdAt: '2026-10-01T09:00:00.000Z' });
    const fetchMock = stubFetch(async () => jsonResponse(201, { id: 'o-1' }));
    await flushQueue();
    expect(JSON.parse(readCall(fetchMock).init.body as string).capturedAt).toBe('2026-10-01T09:00:00.000Z');
  });

  it('op ancienne sans clé : rejouée avec op.id comme clé', async () => {
    enqueueOp({
      id: 'off-stock-loss-legacy',
      kind: 'stock-loss',
      farmId: 'f-1',
      payload: { inputLotId: 'l-1', quantity: 1, unit: 'SAC', reason: 'HUMIDITE' },
      createdAt: '2026-10-01T00:00:00.000Z',
    });
    const fetchMock = stubFetch(async () => jsonResponse(201, { id: 'loss-1' }));
    await flushQueue();
    expect(JSON.parse(readCall(fetchMock).init.body as string).idempotencyKey).toBe('off-stock-loss-legacy');
  });

  it('cancelStockTransferQueued : réseau → mis en attente', async () => {
    stubFetch(networkError);
    const res = await cancelStockTransferQueued('f-1', 'tr-1');
    expect(res).toEqual({ status: 'queued' });
    const [op] = loadOps();
    expect(op.kind).toBe('stock-transfer-cancel');
    expect(op.payload).toEqual({ transferId: 'tr-1' });
  });

  it('createStockTransferQueued : en ligne → envoyé, file vide', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(201, { id: 'tr-1' }));
    const res = await createStockTransferQueued('f-1', { productType: 'ABATTU', slaughterOrderId: 'ab-1', pointOfSaleId: 'pdv-2', quantity: 12 });
    expect(res).toEqual({ status: 'sent' });
    expect(loadOps()).toEqual([]);
    expect(readCall(fetchMock).url).toContain('/farms/f-1/stock-transfers');
  });
});

describe('flushQueue — synchronisation FIFO', () => {
  it('remonte saisie + vente dans l’ordre, retire les ops réussies', async () => {
    stubFetch(networkError);
    await createSaleQueued('f-1', '2026-08-28', [], 2500);
    await createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-08-28', deaths: 1 });

    const fetchMock = stubFetchSequence([
      jsonResponse(200, { session: { id: 's-1' } }),
      jsonResponse(201, { sale: { referenceNumber: 'VTE-20260828-000002' } }),
      jsonResponse(200, { id: 'e-1' }),
    ]);

    const summary = await flushQueue();
    expect(summary).toMatchObject({ synced: 2, dropped: 0, rejected: 0, remaining: 0, farmIds: ['f-1'] });
    expect(loadOps()).toEqual([]);

    const url = (i: number) => readCall(fetchMock, i).url;
    expect(url(0)).toContain('/caisse/current');
    expect(url(1)).toContain('/sales');
    expect(url(2)).toContain('/daily-entries');
  });

  it('remonte un transfert de stock mis en attente', async () => {
    stubFetch(networkError);
    await createStockTransferQueued('f-1', { productType: 'ABATTU', slaughterOrderId: 'ab-1', pointOfSaleId: 'pdv-2', quantity: 6 });

    const fetchMock = stubFetch(async () => jsonResponse(201, { id: 'tr-1' }));
    const summary = await flushQueue();
    expect(summary).toMatchObject({ synced: 1, dropped: 0, rejected: 0, remaining: 0 });
    expect(loadOps()).toEqual([]);
    expect(readCall(fetchMock).url).toBe('http://192.168.1.10:3000/farms/f-1/stock-transfers');
  });

  it('s’arrête à la première erreur réseau, ops conservées', async () => {
    stubFetch(networkError);
    await createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-08-28' });

    stubFetch(networkError);
    const summary = await flushQueue();
    expect(summary).toMatchObject({ synced: 0, dropped: 0, rejected: 0, remaining: 1 });
    expect(loadOps()).toHaveLength(1);
  });

  it('met de côté une saisie refusée (4xx) sans bloquer la suite', async () => {
    stubFetch(networkError);
    await createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-08-26', deaths: 2 });
    await createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-08-28', deaths: 5 });

    stubFetchSequence([
      jsonResponse(400, { message: 'Lot inconnu.' }),
      jsonResponse(200, { id: 'e-2' }),
    ]);
    const summary = await flushQueue();
    expect(summary).toMatchObject({ synced: 1, dropped: 0, rejected: 1, remaining: 0 });
    expect(loadOps()).toEqual([]);
    const [rej] = loadRejected();
    expect(rej.kind).toBe('daily-entry');
    expect(rej.reason).toBe('Lot inconnu.');
  });

  it('ne perd jamais une vente encaissée refusée (4xx) : mise de côté', async () => {
    stubFetch(networkError);
    await createSaleQueued('f-1', '2026-08-28', [], 5000);

    stubFetchSequence([
      jsonResponse(200, { session: {} }), // caisse/current : ouverte
      jsonResponse(400, { message: 'Stock insuffisant.' }),
    ]);
    const summary = await flushQueue();
    expect(summary).toMatchObject({ synced: 0, dropped: 0, rejected: 1, remaining: 0 });
    const [rej] = loadRejected();
    expect(rej.kind).toBe('sale');
    expect(rej.reason).toBe('Stock insuffisant.');
  });

  it('garde en file une op sur 401 (jeton expiré hors ligne)', async () => {
    stubFetch(networkError);
    await createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-08-28' });

    stubFetchSequence([jsonResponse(401, { message: 'Unauthorized' })]);
    const summary = await flushQueue();
    expect(summary.remaining).toBe(1);
    expect(summary.dropped).toBe(0);
  });

  it('caisse impossible à ouvrir : la vente reste en file, la suite part', async () => {
    stubFetch(networkError);
    await createSaleQueued('f-1', '2026-08-28', [], 5000);
    await createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-08-28' });

    stubFetchSequence([
      jsonResponse(200, null), // caisse/current : fermée
      jsonResponse(200, []), // caisse/sessions
      jsonResponse(403, { message: 'Permission requise.' }), // caisse/open
      jsonResponse(200, { id: 'e-1' }), // saisie journalière
    ]);
    const summary = await flushQueue();
    expect(summary.synced).toBe(1);
    expect(loadOps().map((o) => o.kind)).toEqual(['sale']);
  });

  it('caisse clôturée après la vente hors ligne : pas de réouverture, la vente part à la prochaine ouverture', async () => {
    enqueueOp({
      id: 'off-sale-held',
      kind: 'sale',
      farmId: 'f-1',
      payload: { saleDate: '2026-11-02', items: [], payments: [{ method: 'CASH', amountFcfa: 1000 }] },
      createdAt: '2026-11-02T17:00:00.000Z',
    });
    enqueueOp({
      id: 'off-daily-after',
      kind: 'daily-entry',
      farmId: 'f-1',
      batchId: 'b-1',
      payload: { entryDate: '2026-11-02' },
      createdAt: '2026-11-02T17:05:00.000Z',
    });
    const closed = stubFetchSequence([
      jsonResponse(200, null), // caisse/current : fermée
      jsonResponse(200, [{ closingBalanceFcfa: 5000, closedAt: '2026-11-02T18:00:00.000Z' }]), // caisse/sessions
      jsonResponse(201, {}), // saisie journalière
    ]);
    expect(await flushQueue()).toMatchObject({ synced: 1, remaining: 1 });
    expect(loadOps().map((op) => op.id)).toEqual(['off-sale-held']);
    expect(closed.mock.calls.some((_, i) => readCall(closed, i).url.includes('/caisse/open'))).toBe(false);
    expect(heldCashSummary('f-1')).toEqual({ count: 1, amountFcfa: 1000 });
    expect(heldCashSummary('f-2')).toEqual({ count: 0, amountFcfa: 0 });

    stubFetchSequence([
      jsonResponse(200, { session: {} }), // ouverte par un humain le lendemain
      jsonResponse(201, { sale: { referenceNumber: 'VTE-1' } }),
    ]);
    expect(await flushQueue()).toMatchObject({ synced: 1, remaining: 0 });
    expect(loadRejected()).toEqual([]);
    expect(heldCashSummary('f-1')).toEqual({ count: 0, amountFcfa: 0 });
  });

  it('une caisse ouverte retire le signalement même si l’envoi échoue ensuite', async () => {
    enqueueOp({
      id: 'off-sale-flag',
      kind: 'sale',
      farmId: 'f-1',
      payload: { saleDate: '2026-11-02', items: [], payments: [{ method: 'CASH', amountFcfa: 2500 }] },
      createdAt: '2026-11-02T17:00:00.000Z',
      heldByClosedCaisse: true,
    });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/caisse/current')) return jsonResponse(200, { session: {} });
      throw new TypeError('Network request failed');
    }));
    await flushQueue();
    expect(loadOps().map((op) => op.id)).toEqual(['off-sale-flag']);
    expect(heldCashSummary('f-1').count).toBe(0);
  });

  it('rejoue une vente à crédit sans exiger la caisse', async () => {
    stubFetch(networkError);
    await createCreditSaleQueued('f-1', '2026-08-28', [], { customerId: 'c-1' });

    const fetchMock = stubFetchSequence([jsonResponse(201, { sale: { referenceNumber: 'V-1' } })]);
    const summary = await flushQueue();
    expect(summary.synced).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readCall(fetchMock).url).toBe('http://192.168.1.10:3000/farms/f-1/sales');
  });
});

describe('file hors ligne — robustesse', () => {
  const sessionOf = (id: string) =>
    ({ token: `t-${id}`, user: { id, fullName: id, phone: '+241', role: 'PROPRIETAIRE' }, farms: [] }) as unknown as StoredSession;

  it('ne rejoue pas les opérations d’un autre compte', async () => {
    saveSession(sessionOf('u-1'));
    stubFetch(networkError);
    await createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-08-28' });
    expect(loadOps()[0].userId).toBe('u-1');

    saveSession(sessionOf('u-2'));
    const fetchMock = stubFetch(async () => jsonResponse(200, { id: 'e-1' }));
    const summary = await flushQueue();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(summary.remaining).toBe(1);
  });

  it('FIFO : une nouvelle op passe derrière les ops en attente', async () => {
    stubFetch(networkError);
    await createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-08-28', deaths: 1 });
    const res = await createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-08-28', deaths: 2 });
    expect(res).toEqual({ status: 'queued' });
    expect(loadOps()).toHaveLength(2);
  });

  it('une transition refusée (4xx) est abandonnée, pas mise de côté', async () => {
    stubFetch(networkError);
    await deliverOrderQueued('f-1', 'o-1');
    stubFetchSequence([jsonResponse(400, { message: 'Commande déjà livrée.' })]);
    const summary = await flushQueue();
    expect(summary).toMatchObject({ dropped: 1, rejected: 0, remaining: 0 });
    expect(loadRejected()).toEqual([]);
  });

  it('erreurs serveur répétées : la saisie est mise de côté, la vente encaissée reste en file', async () => {
    stubFetch(networkError);
    await createSaleQueued('f-1', '2026-08-28', [], 5000);
    await createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-08-28' });
    stubFetch(async (url) =>
      String(url).includes('/caisse/current') ? jsonResponse(200, { session: {} }) : jsonResponse(500, { message: 'Erreur' }),
    );
    // The sale reaches the limit first, then the entry behind it is tried.
    for (let i = 0; i < 2 * MAX_SERVER_ATTEMPTS; i++) await flushQueue();
    expect(loadOps().map((o) => o.kind)).toEqual(['sale']);
    expect(loadRejected().map((o) => o.kind)).toEqual(['daily-entry']);
  });

  it('identifiants uniques et non séquentiels', async () => {
    stubFetch(networkError);
    await createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-08-27' });
    await createDailyEntryQueued('f-2', 'b-2', { entryDate: '2026-08-28' });
    const [a, b] = loadOps().map((o) => o.id);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^off-daily-entry-[0-9a-z]+-[0-9a-f]{24}$/);
  });

  it('429 / 408 / 425 : l’op reste en file, ni rejetée ni abandonnée', async () => {
    for (const status of [429, 408, 425]) {
      clearQueue();
      stubFetch(networkError);
      await createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-08-28' });
      stubFetchSequence([jsonResponse(status, { message: 'Trop de requêtes' })]);
      const summary = await flushQueue();
      expect(summary).toMatchObject({ synced: 0, dropped: 0, rejected: 0, remaining: 1 });
      expect(loadOps()[0].attempts ?? 0).toBe(0);
    }
  });

  it('401 : file conservée et signalée', async () => {
    stubFetch(networkError);
    await createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-08-28' });
    stubFetchSequence([jsonResponse(401, { message: 'Unauthorized' })]);
    const summary = await flushQueue();
    expect(summary).toMatchObject({ unauthorized: true, remaining: 1 });
  });

  it('exception locale (ancien payload) : refusée après MAX_SERVER_ATTEMPTS, la file se débloque', async () => {
    enqueueOp({ id: 'off-bad', kind: 'daily-entry', farmId: 'f-1', batchId: 'b-1', payload: null, createdAt: '2026-08-28T08:00:00.000Z' });
    enqueueOp({ id: 'off-ok', kind: 'daily-entry', farmId: 'f-1', batchId: 'b-1', payload: { entryDate: '2026-08-28' }, createdAt: '2026-08-28T08:01:00.000Z' });
    stubFetch(async () => jsonResponse(200, { id: 'e-1' }));
    for (let i = 0; i < MAX_SERVER_ATTEMPTS; i++) await flushQueue();
    expect(loadOps()).toEqual([]);
    expect(loadRejected().map((o) => o.id)).toEqual(['off-bad']);
  });
});

describe('store — récupération et déconnexion', () => {
  it('salvageOps récupère les ops valides d’un JSON tronqué', () => {
    const a = { id: 'a', kind: 'sale', farmId: 'f-1', payload: { note: 'x}"y' }, createdAt: '2026-08-28T08:00:00.000Z' };
    const b = { id: 'b', kind: 'sale', farmId: 'f-1', payload: {}, createdAt: '2026-08-28T08:01:00.000Z' };
    const raw = JSON.stringify([a, b]).slice(0, -12);
    expect(salvageOps(raw).map((o) => o.id)).toEqual(['a']);
  });

  it('clearUserQueue ne retire que les ops de l’utilisateur', () => {
    enqueueOp({ id: 'mine', kind: 'sale', farmId: 'f-1', payload: {}, createdAt: '2026-08-28T08:00:00.000Z', userId: 'u-1' });
    enqueueOp({ id: 'other', kind: 'sale', farmId: 'f-1', payload: {}, createdAt: '2026-08-28T08:01:00.000Z', userId: 'u-2' });
    expect(countUserOps('u-1')).toBe(1);
    clearUserQueue('u-1');
    expect(loadOps().map((o) => o.id)).toEqual(['other']);
  });
});

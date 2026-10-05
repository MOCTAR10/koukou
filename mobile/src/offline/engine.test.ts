import { beforeEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, readCall, stubFetch, stubFetchSequence } from '@/api/test-utils';
import { clearSession } from '@/api/token';

import { cancelStockTransferQueued, createStockTransferQueued, createDailyEntryQueued, createSaleQueued, flushQueue } from './engine';
import { clearQueue, enqueueOp, getQueueVersion, loadOps, removeOp, subscribeQueue } from './store';

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

describe('capture hors-ligne — enfile et rejette', () => {
  it('createDailyEntryQueued : erreur réseau → mis en attente (poster)', async () => {
    stubFetch(networkError);
    const res = await createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-08-28', deaths: 3 });
    expect(res).toEqual({ status: 'queued' });
    const [op] = loadOps();
    expect(op.kind).toBe('daily-entry');
    expect(op.farmId).toBe('f-1');
    expect(op.batchId).toBe('b-1');
    expect(op.payload).toEqual({ entryDate: '2026-08-28', deaths: 3 });
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

  it('createStockTransferQueued : réseau → mis en attente avec le bon kind', async () => {
    stubFetch(networkError);
    const res = await createStockTransferQueued('f-1', { productType: 'ABATTU', slaughterOrderId: 'ab-1', pointOfSaleId: 'pdv-2', quantity: 12 });
    expect(res).toEqual({ status: 'queued' });
    const [op] = loadOps();
    expect(op.kind).toBe('stock-transfer-create');
    expect(op.payload).toEqual({ productType: 'ABATTU', slaughterOrderId: 'ab-1', pointOfSaleId: 'pdv-2', quantity: 12 });
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
    expect(summary).toEqual({ synced: 2, dropped: 0, remaining: 0 });
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
    expect(summary).toEqual({ synced: 1, dropped: 0, remaining: 0 });
    expect(loadOps()).toEqual([]);
    expect(readCall(fetchMock).url).toBe('http://192.168.1.10:3000/farms/f-1/stock-transfers');
  });

  it('s’arrête à la première erreur réseau, ops conservées', async () => {
    stubFetch(networkError);
    await createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-08-28' });

    stubFetch(networkError);
    const summary = await flushQueue();
    expect(summary).toEqual({ synced: 0, dropped: 0, remaining: 1 });
    expect(loadOps()).toHaveLength(1);
  });

  it('abandonne une op refusée (4xx) sans bloquer la suite', async () => {
    stubFetch(networkError);
    await createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-08-26', deaths: 2 });
    await createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-08-28', deaths: 5 });

    stubFetchSequence([
      jsonResponse(400, { message: 'Lot inconnu.' }),
      jsonResponse(200, { id: 'e-2' }),
    ]);
    const summary = await flushQueue();
    expect(summary).toEqual({ synced: 1, dropped: 1, remaining: 0 });
    const [op] = loadOps();
    expect(op).toBeUndefined();
    const entries = loadOps();
    expect(entries.filter((o) => o.id.includes('-2')).length).toBe(0);
  });
});
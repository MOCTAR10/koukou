import { beforeEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, stubFetch } from '@/api/test-utils';
import { clearSession, saveSession, type StoredSession } from '@/api/token';

import { createDailyEntryQueued, createSaleQueued, flushQueue } from './engine';
import { clearQueue, dismissRejected, enqueueOp, loadOps, loadRejected } from './store';

vi.mock('expo-constants', () => ({
  default: { expoConfig: { hostUri: '192.168.1.10:8081' } },
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

const sessionOf = (id: string) =>
  ({ token: `t-${id}`, user: { id, fullName: id, phone: '+241', role: 'PROPRIETAIRE' }, farms: [] }) as unknown as StoredSession;

const networkError = () => {
  throw new TypeError('Network request failed');
};

beforeEach(() => {
  clearQueue();
  loadRejected().forEach((op) => dismissRejected(op.id));
  clearSession();
  vi.unstubAllGlobals();
});

describe('send-or-queue : persisté AVANT l’envoi', () => {
  it('l’op est déjà dans la file pendant la requête réseau (kill app = rien de perdu)', async () => {
    let seenDuringRequest: string[] = [];
    stubFetch(async () => {
      seenDuringRequest = loadOps().map((o) => o.kind);
      return jsonResponse(200, { ok: true });
    });
    const res = await createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-08-28', deaths: 1 });
    expect(res).toEqual({ status: 'sent' });
    expect(seenDuringRequest).toEqual(['daily-entry']);
    // Succès : l’op quitte la file.
    expect(loadOps()).toEqual([]);
  });

  it('refus définitif (4xx) : l’op est retirée de la file et l’erreur propagée', async () => {
    stubFetch(async () => jsonResponse(400, { message: 'Lot inconnu.' }));
    await expect(createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-08-28' })).rejects.toMatchObject({ status: 400 });
    expect(loadOps()).toEqual([]);
  });

  it('5xx et réseau : l’op reste en file avec le même identifiant', async () => {
    stubFetch(async () => jsonResponse(503, null));
    expect(await createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-08-28' })).toEqual({ status: 'queued' });
    expect(loadOps()).toHaveLength(1);
    stubFetch(networkError);
    expect(await createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-08-29' })).toEqual({ status: 'queued' });
    expect(loadOps()).toHaveLength(2);
  });

  it('une passe de replay concurrente n’envoie pas une op dont la tentative live est en cours', async () => {
    let release: (v: unknown) => void = () => {};
    const gate = new Promise((r) => (release = r));
    const fetchMock = stubFetch(async () => {
      await gate;
      return jsonResponse(200, { ok: true });
    });
    const live = createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-08-28' });
    await new Promise((r) => setTimeout(r, 0));
    await flushQueue(); // pendant la tentative live
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release(null);
    await live;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(loadOps()).toEqual([]);
  });
});

describe('idempotence et ordre', () => {
  it('la clé d’idempotence d’une vente est la même au replay qu’à la première tentative', async () => {
    saveSession(sessionOf('u-1'));
    const bodies: string[] = [];
    // 1re tentative : caisse ouverte puis vente en 503 ; replay : succès.
    let failSales = true;
    stubFetch(async (url, init) => {
      if (String(url).includes('/sales')) {
        bodies.push(String((init as { body?: string }).body));
        return failSales ? jsonResponse(503, null) : jsonResponse(201, { sale: { referenceNumber: 'V-1' } });
      }
      return jsonResponse(200, { session: { id: 's-1' } });
    });
    expect(await createSaleQueued('f-1', '2026-08-28', [], 2500)).toEqual({ status: 'queued' });
    const [op] = loadOps();
    failSales = false;
    await flushQueue();
    expect(loadOps()).toEqual([]);
    const keys = bodies.map((b) => (JSON.parse(b) as { idempotencyKey: string }).idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(op.id);
    expect(keys[1]).toBe(op.id);
  });

  it('FIFO : les ops partent dans l’ordre d’enfilage', async () => {
    saveSession(sessionOf('u-1'));
    const order: string[] = [];
    stubFetch(async (url, init) => {
      const body = JSON.parse(String((init as { body?: string }).body ?? '{}')) as { entryDate?: string };
      if (body.entryDate) order.push(body.entryDate);
      return jsonResponse(200, { ok: true });
    });
    for (const d of ['2026-08-01', '2026-08-02', '2026-08-03']) {
      enqueueOp({ id: `off-${d}`, kind: 'daily-entry', farmId: 'f-1', batchId: 'b-1', userId: 'u-1', payload: { entryDate: d }, createdAt: `${d}T08:00:00.000Z` });
    }
    await flushQueue();
    expect(order).toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
  });

  it('une nouvelle op passe derrière les plus anciennes en attente (pas de dépassement)', async () => {
    saveSession(sessionOf('u-1'));
    enqueueOp({ id: 'off-old', kind: 'daily-entry', farmId: 'f-1', batchId: 'b-1', userId: 'u-1', payload: { entryDate: '2026-08-01' }, createdAt: '2026-08-01T08:00:00.000Z' });
    stubFetch(networkError);
    const res = await createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-08-02' });
    expect(res).toEqual({ status: 'queued' });
    expect(loadOps().map((o) => (o.payload as { entryDate: string }).entryDate)).toEqual(['2026-08-01', '2026-08-02']);
  });
});

describe('isolation par utilisateur et classification', () => {
  it('les ops d’un autre compte ne sont jamais rejouées avec notre jeton', async () => {
    saveSession(sessionOf('u-2'));
    const fetchMock = stubFetch(async () => jsonResponse(200, { ok: true }));
    enqueueOp({ id: 'off-a', kind: 'daily-entry', farmId: 'f-1', batchId: 'b-1', userId: 'u-1', payload: { entryDate: '2026-08-01' }, createdAt: '2026-08-01T08:00:00.000Z' });
    const summary = await flushQueue();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(summary.synced).toBe(0);
    expect(loadOps().map((o) => o.id)).toEqual(['off-a']);
  });

  it('une op enfilée porte l’identifiant du compte courant', async () => {
    saveSession(sessionOf('u-7'));
    stubFetch(networkError);
    await createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-08-28' });
    expect(loadOps()[0].userId).toBe('u-7');
  });

  it('replay : 4xx → écartée, 5xx/réseau → conservée, 401 → file intacte et signalée', async () => {
    saveSession(sessionOf('u-1'));
    const mk = (id: string) => enqueueOp({ id, kind: 'daily-entry', farmId: 'f-1', batchId: 'b-1', userId: 'u-1', payload: { entryDate: '2026-08-01' }, createdAt: '2026-08-01T08:00:00.000Z' });
    mk('off-4xx');
    stubFetch(async () => jsonResponse(422, { message: 'Invalide' }));
    await flushQueue();
    expect(loadOps()).toEqual([]);
    expect(loadRejected().map((o) => o.id)).toEqual(['off-4xx']);

    mk('off-5xx');
    stubFetch(async () => jsonResponse(500, null));
    await flushQueue();
    expect(loadOps().map((o) => o.id)).toEqual(['off-5xx']);

    stubFetch(async () => jsonResponse(401, { message: 'Unauthorized' }));
    const summary = await flushQueue();
    expect(summary).toMatchObject({ unauthorized: true, remaining: 1 });
  });
});

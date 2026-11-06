import { beforeEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, readCall, stubFetch } from '@/api/test-utils';
import { clearSession } from '@/api/token';

import { confirmDeliveryQueued, createDeclarationQueued, createSortieQueued, flushQueue, setFarmGpsQueued } from './engine';
import { clearQueue, dismissRejected, loadOps, loadRejected } from './store';

vi.mock('expo-constants', () => ({
  default: { expoConfig: { hostUri: '192.168.1.10:8081' } },
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

const networkError = () => {
  throw new TypeError('Network request failed');
};

const body = (mock: ReturnType<typeof stubFetch>, i = 0) => JSON.parse(readCall(mock, i).init.body as string);

beforeEach(() => {
  clearQueue();
  loadRejected().forEach((op) => dismissRejected(op.id));
  clearSession();
  vi.unstubAllGlobals();
});

describe('déclaration sanitaire (health-event)', () => {
  const declaration = {
    kind: 'MALADIE' as const,
    occurredAt: '2026-11-06',
    severity: 'ROUGE' as const,
    title: 'Toux et diarrhée',
    clinicalSigns: ['TOUX'],
    suspicion: true,
  };

  it('en ligne : POST avec idempotencyKey puis photos, réponse envoyée', async () => {
    const fetch = stubFetch(async (url) =>
      String(url).endsWith('/photos') ? jsonResponse(201, { id: 'ph-1' }) : jsonResponse(201, { id: 'ev-1' }),
    );
    const res = await createDeclarationQueued('f-1', 'b-1', declaration, [{ uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg' }]);
    expect(res).toEqual({ status: 'sent', data: { eventId: 'ev-1', photosSent: 1, photosRefused: [] } });
    expect(readCall(fetch).url).toContain('/farms/f-1/batches/b-1/health-events');
    const sent = body(fetch);
    expect(sent.clinicalSigns).toEqual(['TOUX']);
    expect(sent.suspicion).toBe(true);
    expect(sent.idempotencyKey).toMatch(/^off-health-event-/);
    expect(readCall(fetch, 1).url).toContain('/health-events/ev-1/photos');
    expect(loadOps()).toEqual([]);
  });

  it('hors ligne : mis en file, même clé au rejeu, photos envoyées au rejeu', async () => {
    const live = stubFetch(networkError);
    const res = await createDeclarationQueued('f-1', 'b-1', declaration, [{ uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg' }]);
    expect(res).toEqual({ status: 'queued' });
    const [op] = loadOps();
    expect(op.kind).toBe('health-event');
    expect(op.batchId).toBe('b-1');
    expect(body(live).idempotencyKey).toBe(op.id);

    const replay = stubFetch(async (url) =>
      String(url).endsWith('/photos') ? jsonResponse(201, { id: 'ph-1' }) : jsonResponse(201, { id: 'ev-1' }),
    );
    const summary = await flushQueue();
    expect(summary.synced).toBe(1);
    expect(body(replay).idempotencyKey).toBe(op.id);
    expect(readCall(replay, 1).url).toContain('/health-events/ev-1/photos');
    expect(loadOps()).toEqual([]);
  });

  it('photo refusée (4xx) : la déclaration reste enregistrée, motif rapporté', async () => {
    stubFetch(async (url) =>
      String(url).endsWith('/photos')
        ? jsonResponse(400, { message: 'Photo trop lourde (5 Mo au plus).' })
        : jsonResponse(201, { id: 'ev-1' }),
    );
    const res = await createDeclarationQueued('f-1', 'b-1', declaration, [{ uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg' }]);
    expect(res).toEqual({ status: 'sent', data: { eventId: 'ev-1', photosSent: 0, photosRefused: ['Photo trop lourde (5 Mo au plus).'] } });
  });

  it('refus du serveur au rejeu : rangée dans les rejets avec le message', async () => {
    stubFetch(networkError);
    await createDeclarationQueued('f-1', 'b-1', declaration);
    stubFetch(async () => jsonResponse(400, { message: 'Bande clôturée.' }));
    await flushQueue();
    expect(loadOps()).toEqual([]);
    const [rejected] = loadRejected();
    expect(rejected.kind).toBe('health-event');
    expect(rejected.reason).toBe('Bande clôturée.');
  });
});

describe('confirmation de livraison (delivery-confirm)', () => {
  const confirmation = { receivedDate: '2026-11-06', lines: [{ lineId: 'l-1', receivedQuantity: 98, discrepancyReason: 'Deux morts' }] };

  it('hors ligne : même idempotencyKey en direct et au rejeu', async () => {
    const live = stubFetch(networkError);
    expect(await confirmDeliveryQueued('f-1', 'd-1', confirmation)).toEqual({ status: 'queued' });
    const [op] = loadOps();
    expect(op.kind).toBe('delivery-confirm');
    expect(op.payload).toMatchObject({ deliveryId: 'd-1' });
    expect(body(live).idempotencyKey).toBe(op.id);

    const replay = stubFetch(async () => jsonResponse(201, { id: 'd-1', replay: true, openBandHint: null }));
    await flushQueue();
    expect(readCall(replay).url).toContain('/farms/f-1/input-deliveries/d-1/confirm');
    expect(body(replay)).toEqual({ ...confirmation, idempotencyKey: op.id });
    expect(loadOps()).toEqual([]);
  });

  it('en ligne : renvoie la réponse (openBandHint compris)', async () => {
    const hint = { deliveryId: 'd-1', quantityAtStart: 98 };
    stubFetch(async () => jsonResponse(201, { id: 'd-1', replay: false, openBandHint: hint }));
    const res = await confirmDeliveryQueued('f-1', 'd-1', confirmation);
    expect(res.status).toBe('sent');
    expect(res.status === 'sent' && res.data.openBandHint).toEqual(hint);
  });
});

describe('sortie de bande (sortie)', () => {
  it('hors ligne : clé = id de l’op, capturedAt à la saisie, deviceSentAt à l’envoi', async () => {
    const live = stubFetch(networkError);
    await createSortieQueued('f-1', 'b-1', { sortieDate: '2026-11-06', count: 10, reasonCode: 'DON' });
    const [op] = loadOps();
    expect(op.kind).toBe('sortie');
    const first = body(live);
    expect(first.idempotencyKey).toBe(op.id);
    expect(typeof first.capturedAt).toBe('string');
    expect(typeof first.deviceSentAt).toBe('string');

    const replay = stubFetch(async () => jsonResponse(201, { id: 's-1' }));
    await flushQueue();
    const again = body(replay);
    expect(readCall(replay).url).toContain('/farms/f-1/bandes/b-1/sorties');
    expect(again.idempotencyKey).toBe(op.id);
    expect(again.capturedAt).toBe(first.capturedAt);
    expect(loadOps()).toEqual([]);
  });

  it('refus (4xx) en direct : erreur levée, rien en file', async () => {
    stubFetch(async () => jsonResponse(400, { message: 'Sortie impossible : 10 sujet(s) pour 5 présent(s).' }));
    await expect(createSortieQueued('f-1', 'b-1', { sortieDate: '2026-11-06', count: 10, reasonCode: 'DON' })).rejects.toThrow(
      'Sortie impossible',
    );
    expect(loadOps()).toEqual([]);
  });
});

describe('point GPS (farm-gps)', () => {
  it('hors ligne : rejoué tel quel (même capturedAt)', async () => {
    stubFetch(networkError);
    const gps = { latitude: 0.39, longitude: 9.45, capturedAt: '2026-11-06T08:00:00.000Z', source: 'APPAREIL' as const, accuracyM: 8 };
    expect(await setFarmGpsQueued('f-1', gps)).toEqual({ status: 'queued' });
    const replay = stubFetch(async () => jsonResponse(200, { gps: null, previous: null, provinceWarning: null }));
    await flushQueue();
    expect(readCall(replay).url).toContain('/programme/farms/f-1/gps');
    expect(readCall(replay).init.method).toBe('PUT');
    expect(body(replay)).toEqual(gps);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, readCall, stubFetch } from '@/api/test-utils';
import { clearSession } from '@/api/token';

import {
  confirmDeliveryQueued,
  createDailyEntryQueued,
  createDeclarationQueued,
  createSortieQueued,
  deliverOrderQueued,
  flushQueue,
  createVisitQueued,
  setFarmGpsQueued,
} from './engine';
import { DEVICE_ID_KEY } from './device-id';
import { storage } from './storage';
import { clearQueue, dismissRejected, enqueueOp, loadOps, loadRejected } from './store';

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
  it('hors ligne : rejoué avec sa clé (même capturedAt, même idempotencyKey)', async () => {
    stubFetch(networkError);
    const gps = { latitude: 0.39, longitude: 9.45, capturedAt: '2026-11-06T08:00:00.000Z', source: 'APPAREIL' as const, accuracyM: 8 };
    expect(await setFarmGpsQueued('f-1', gps)).toEqual({ status: 'queued' });
    const replay = stubFetch(async () => jsonResponse(200, { gps: null, previous: null, provinceWarning: null }));
    await flushQueue();
    expect(readCall(replay).url).toContain('/programme/farms/f-1/gps');
    expect(readCall(replay).init.method).toBe('PUT');
    expect(body(replay)).toMatchObject(gps);
    expect(String((body(replay) as { idempotencyKey?: string }).idempotencyKey)).toMatch(/^off-farm-gps-/);
  });

  it('en direct : envoie la clé de rejeu', async () => {
    const live = stubFetch(async () => jsonResponse(200, { gps: null, previous: null, provinceWarning: null, applied: true }));
    await setFarmGpsQueued('f-1', { latitude: 0.4, longitude: 9.4 });
    expect((body(live) as { idempotencyKey?: string }).idempotencyKey).toBeTruthy();
  });
});

describe('visite technique (farm-visit)', () => {
  const visit = { visitDate: '2026-11-06', type: 'BIOSECURITE' as const, answers: [{ criterionCode: 'PEDILUVE', answer: 'CONFORME' as const }] };

  it('hors ligne : rejouée avec sa clé et son heure de saisie', async () => {
    stubFetch(networkError);
    expect(await createVisitQueued('f-1', visit)).toEqual({ status: 'queued' });
    const replay = stubFetch(async () => jsonResponse(201, { id: 'v-1' }));
    await flushQueue();
    expect(readCall(replay).url).toContain('/farms/f-1/visits');
    expect(readCall(replay).init.method).toBe('POST');
    expect(body(replay)).toMatchObject(visit);
    expect(String((body(replay) as { idempotencyKey?: string }).idempotencyKey)).toMatch(/^off-farm-visit-/);
    expect(Date.parse(String((body(replay) as { capturedAt?: string }).capturedAt))).not.toBeNaN();
  });

  const photo = { uri: 'file:///v.jpg', name: 'v.jpg', mimeType: 'image/jpeg' };

  it('en ligne : la visite puis ses photos, sans les fichiers dans le corps', async () => {
    const live = stubFetch(async (url) =>
      String(url).endsWith('/photos') ? jsonResponse(201, { id: 'ph-1' }) : jsonResponse(201, { id: 'v-1' }),
    );
    const res = await createVisitQueued('f-1', visit, [photo]);
    expect(res).toEqual({ status: 'sent', data: { visitId: 'v-1', photosSent: 1, photosRefused: [] } });
    expect(body(live)).not.toHaveProperty('photos');
    expect(readCall(live, 1).url).toContain('/farms/f-1/visits/v-1/photos');
  });

  it('hors ligne : les photos partent au rejeu, après la visite', async () => {
    stubFetch(networkError);
    expect(await createVisitQueued('f-1', visit, [photo])).toEqual({ status: 'queued' });
    const replay = stubFetch(async (url) =>
      String(url).endsWith('/photos') ? jsonResponse(201, { id: 'ph-1' }) : jsonResponse(201, { id: 'v-1' }),
    );
    expect((await flushQueue()).synced).toBe(1);
    expect(readCall(replay).url).toMatch(/\/visits$/);
    expect(body(replay)).not.toHaveProperty('photos');
    expect(readCall(replay, 1).url).toContain('/visits/v-1/photos');
  });

  it('photo refusée (4xx) : la visite reste enregistrée, motif rapporté', async () => {
    stubFetch(async (url) =>
      String(url).endsWith('/photos') ? jsonResponse(400, { message: 'Photo trop lourde (5 Mo au plus).' }) : jsonResponse(201, { id: 'v-1' }),
    );
    expect(await createVisitQueued('f-1', visit, [photo])).toEqual({
      status: 'sent',
      data: { visitId: 'v-1', photosSent: 0, photosRefused: ['Photo trop lourde (5 Mo au plus).'] },
    });
  });

  it('refus (4xx) en direct : erreur levée, rien en file', async () => {
    stubFetch(async () => jsonResponse(400, { message: 'Critère(s) inconnu(s) de la grille de biosécurité : X.' }));
    await expect(createVisitQueued('f-1', visit)).rejects.toThrow('Critère');
    expect(loadOps()).toEqual([]);
  });
});

// POUFA lot A bande: offline conflict rule of the daily entry (CDC §7.2).
describe('saisie quotidienne (daily-entry) : règle de conflit hors ligne', () => {
  const edited = {
    entryDate: '2026-11-05',
    deaths: 0,
    waterL: 45,
    baseUpdatedAt: '2026-11-05T09:00:00.000Z',
    baseValues: { deaths: 0, waterL: 30 },
  };

  it('en ligne : capturedAt, deviceId stable et deviceSentAt envoyés avec la base', async () => {
    storage.removeItem(DEVICE_ID_KEY);
    const fetch = stubFetch(async () => jsonResponse(201, { id: 'e-1' }));
    expect(await createDailyEntryQueued('f-1', 'b-1', edited)).toEqual({ status: 'sent' });
    const sent = body(fetch);
    expect(readCall(fetch).url).toContain('/farms/f-1/batches/b-1/daily-entries');
    expect(sent).toMatchObject({ ...edited, source: 'MANUELLE' });
    expect(Date.parse(sent.capturedAt)).not.toBeNaN();
    expect(Date.parse(sent.deviceSentAt)).not.toBeNaN();
    expect(sent.deviceId).toMatch(/^mob-[0-9a-f]{24}$/);
    expect(storage.getItem(DEVICE_ID_KEY)).toBe(sent.deviceId);

    const again = stubFetch(async () => jsonResponse(201, { id: 'e-1' }));
    await createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-11-06', deaths: 1 });
    expect(body(again).deviceId).toBe(sent.deviceId);
    // A new entry carries no base.
    expect(body(again).baseUpdatedAt).toBeUndefined();
    expect(body(again).baseValues).toBeUndefined();
  });

  it('hors ligne : la saisie garde son heure et sa base au rejeu, l’heure d’envoi est renouvelée', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-11-05T10:00:00.000Z'));
      const live = stubFetch(networkError);
      expect(await createDailyEntryQueued('f-1', 'b-1', edited)).toEqual({ status: 'queued' });
      const first = body(live);
      expect(first.capturedAt).toBe('2026-11-05T10:00:00.000Z');
      expect(first.deviceSentAt).toBe('2026-11-05T10:00:00.000Z');
      const [op] = loadOps();
      expect(op.payload).toMatchObject({ capturedAt: first.capturedAt, deviceId: first.deviceId, baseValues: edited.baseValues });
      expect((op.payload as { deviceSentAt?: string }).deviceSentAt).toBeUndefined();

      vi.setSystemTime(new Date('2026-11-05T14:30:00.000Z'));
      const replay = stubFetch(async () => jsonResponse(201, { id: 'e-1' }));
      expect((await flushQueue()).synced).toBe(1);
      const sent = body(replay);
      expect(sent).toMatchObject({
        capturedAt: '2026-11-05T10:00:00.000Z',
        deviceId: first.deviceId,
        baseUpdatedAt: edited.baseUpdatedAt,
        baseValues: edited.baseValues,
        deviceSentAt: '2026-11-05T14:30:00.000Z',
      });
      expect(loadOps()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('une saisie mise en file avant la règle est datée de sa mise en file', async () => {
    enqueueOp({
      id: 'off-daily-entry-old',
      kind: 'daily-entry',
      farmId: 'f-1',
      batchId: 'b-1',
      payload: { entryDate: '2026-11-04', deaths: 2 },
      createdAt: '2026-11-04T18:00:00.000Z',
    });
    const replay = stubFetch(async () => jsonResponse(201, { id: 'e-2' }));
    await flushQueue();
    expect(body(replay)).toMatchObject({ entryDate: '2026-11-04', deaths: 2, capturedAt: '2026-11-04T18:00:00.000Z' });
    expect(Date.parse(body(replay).deviceSentAt)).not.toBeNaN();
  });

  it('une pesée sans échantillon n’est ni envoyée ni mise en file', async () => {
    const fetch = stubFetch(networkError);
    await expect(createDailyEntryQueued('f-1', 'b-1', { entryDate: '2026-11-05', deaths: 0, avgWeightKg: 1.2 })).rejects.toThrow(/sujets pesés/);
    expect(fetch).not.toHaveBeenCalled();
    expect(loadOps()).toEqual([]);
  });

  it('une ancienne pesée en file sans échantillon, refusée au rejeu, est rangée avec une raison claire', async () => {
    enqueueOp({
      id: 'off-daily-entry-weight',
      kind: 'daily-entry',
      farmId: 'f-1',
      batchId: 'b-1',
      payload: { entryDate: '2026-11-04', deaths: 0, avgWeightKg: 1.1 },
      createdAt: '2026-11-04T18:00:00.000Z',
    });
    stubFetch(async () => jsonResponse(400, { message: 'Pesée : indiquez le nombre de sujets pesés (échantillon).' }));
    expect((await flushQueue()).rejected).toBe(1);
    expect(loadOps()).toEqual([]);
    const [rejected] = loadRejected();
    expect(rejected.reason).toMatch(/Ressaisissez la pesée/);
  });

  it('refus (4xx) au rejeu : rangée dans les refus, jamais perdue', async () => {
    stubFetch(networkError);
    await createDailyEntryQueued('f-1', 'b-1', edited);
    stubFetch(async () => jsonResponse(400, { message: 'Bande clôturée : lecture seule.' }));
    await flushQueue();
    expect(loadOps()).toEqual([]);
    expect(loadRejected().map((r) => r.kind)).toEqual(['daily-entry']);
  });
});

describe('livraison hors ligne (jour du Gabon)', () => {
  it('capturedAt est écrit à l’heure du Gabon : 23:30 UTC = lendemain +01:00', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T23:30:00Z'));
    try {
      const live = stubFetch(networkError);
      await deliverOrderQueued('f-1', 'o-1');
      const [op] = loadOps();
      const sent = body(live);
      expect(sent.capturedAt).toBe('2026-11-04T00:30:00+01:00');
      expect(Date.parse(sent.capturedAt)).toBe(Date.parse('2026-11-03T23:30:00Z'));
      expect((op.payload as { capturedAt: string }).capturedAt).toBe('2026-11-04T00:30:00+01:00');
    } finally {
      vi.useRealTimers();
    }
  });
});

// POUFA lot A sante: treatments (CDC n° 23) and care completions (n° 22) offline.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, readCall, stubFetch } from '@/api/test-utils';
import { clearSession } from '@/api/token';

import { completeProphylaxisQueued, createTreatmentQueued, flushQueue } from './engine';
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

const treatment = {
  careType: 'ANTIBIOTIQUE' as const,
  productName: 'Oxytétracycline',
  administeredAt: '2026-11-04',
  endDate: '2026-11-06',
  reason: 'Coryza',
  animalCount: 480,
  withdrawalDays: 5,
};

describe('traitement (treatment)', () => {
  it('en ligne : POST avec ses champs CDC et une clé d’idempotence', async () => {
    const fetch = stubFetch(async () => jsonResponse(201, { id: 't-1' }));
    expect(await createTreatmentQueued('f-1', 'b-1', treatment)).toEqual({ status: 'sent' });
    expect(readCall(fetch).url).toContain('/farms/f-1/batches/b-1/treatments');
    expect(body(fetch)).toMatchObject({ endDate: '2026-11-06', reason: 'Coryza', animalCount: 480 });
    expect(body(fetch).idempotencyKey).toMatch(/^off-treatment-/);
    expect(loadOps()).toEqual([]);
  });

  it('hors ligne : mis en file, rejoué avec la même clé (créé une seule fois)', async () => {
    const live = stubFetch(networkError);
    expect(await createTreatmentQueued('f-1', 'b-1', treatment)).toEqual({ status: 'queued' });
    const [op] = loadOps();
    expect(op.kind).toBe('treatment');
    expect(op.batchId).toBe('b-1');
    expect(body(live).idempotencyKey).toBe(op.id);
    const replay = stubFetch(async () => jsonResponse(201, { id: 't-1' }));
    expect((await flushQueue()).synced).toBe(1);
    expect(readCall(replay).url).toContain('/batches/b-1/treatments');
    expect(body(replay)).toMatchObject({ idempotencyKey: op.id, animalCount: 480 });
    expect(loadOps()).toEqual([]);
  });

  it('refusé au rejeu (liste remplie entre-temps) : gardé pour être ressaisi', async () => {
    stubFetch(networkError);
    await createTreatmentQueued('f-1', 'b-1', treatment);
    stubFetch(async () =>
      jsonResponse(400, { message: 'Choisissez le produit dans la liste des produits de traitement (PRODUIT_TRAITEMENT) fixée par les services vétérinaires.' }),
    );
    const summary = await flushQueue();
    expect(summary.rejected).toBe(1);
    expect(loadRejected()[0]).toMatchObject({ kind: 'treatment' });
    expect(loadRejected()[0].reason).toContain('PRODUIT_TRAITEMENT');
  });
});

describe('soin réalisé (prophylaxis-complete)', () => {
  const completion = { completedAt: '2026-11-06', animalCount: 495, route: 'Nébulisation' };

  it('hors ligne : rejoué avec le nombre d’animaux, la voie et la même clé', async () => {
    const live = stubFetch(networkError);
    expect(await completeProphylaxisQueued('f-1', 'b-1', 'e-1', completion)).toEqual({ status: 'queued' });
    const [op] = loadOps();
    expect(op.kind).toBe('prophylaxis-complete');
    expect(body(live).idempotencyKey).toBe(op.id);
    const replay = stubFetch(async () => jsonResponse(201, { id: 'e-1', status: 'FAIT' }));
    expect((await flushQueue()).synced).toBe(1);
    expect(readCall(replay).url).toContain('/batches/b-1/prophylaxis/e-1/complete');
    expect(body(replay)).toEqual({ ...completion, idempotencyKey: op.id });
  });

  it('en ligne : la clé part dès le premier envoi', async () => {
    const fetch = stubFetch(async () => jsonResponse(201, { id: 'e-1', status: 'FAIT' }));
    expect(await completeProphylaxisQueued('f-1', 'b-1', 'e-1', completion)).toEqual({ status: 'sent' });
    expect(body(fetch).idempotencyKey).toMatch(/^off-prophylaxis-complete-/);
  });

  it('refusé au rejeu (soin annulé entre-temps) : gardé, jamais perdu en silence', async () => {
    stubFetch(networkError);
    await completeProphylaxisQueued('f-1', 'b-1', 'e-1', completion);
    stubFetch(async () => jsonResponse(400, { message: 'Ce soin a été annulé : planifiez un nouveau soin plutôt que de le compléter.' }));
    expect((await flushQueue()).rejected).toBe(1);
    expect(loadRejected()[0].reason).toContain('annulé');
  });
});

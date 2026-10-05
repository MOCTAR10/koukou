import { describe, expect, it } from 'vitest';

import {
  inHorizon,
  lotAvailability,
  lotSlaughterSummary,
  pipelineOrders,
  projectOrder,
  reserveCarcasses,
  slaughterRefs,
  speciesWeightReference,
  yieldReference,
} from './slaughterInsights';
import type { ProductionBatch, SlaughterOrder } from '@/api/types';

const TODAY = '2026-09-14';

const BATCH = {
  id: 'lot-1',
  farmId: 'f-1',
  batchName: 'Bande A',
  breedCode: null,
  integrationDate: '2026-01-01',
  quantityAtStart: 1000,
  quantityAlive: 500,
  type: 'CHAIR',
  species: 'POULET',
  status: 'ACTIF',
} as ProductionBatch;

function makeOrder(p: Partial<SlaughterOrder>): SlaughterOrder {
  return {
    id: p.id ?? 'ord-1',
    farmId: 'f-1',
    batchId: p.batchId ?? 'lot-1',
    referenceNumber: p.referenceNumber ?? 'ABT-20260914-000001',
    slaughterType: p.slaughterType ?? 'ABATTU',
    destination: p.destination ?? 'EXTERNE',
    plannedDate: p.plannedDate ?? TODAY,
    birdCount: p.birdCount ?? 100,
    totalWeightKg: p.totalWeightKg ?? null,
    carcassWeightKg: p.carcassWeightKg ?? null,
    rendementPercent: p.rendementPercent ?? null,
    internalBatchCode: p.internalBatchCode ?? null,
    abattoirLotCode: p.abattoirLotCode ?? null,
    status: p.status ?? 'DRAFT',
    processedAt: p.processedAt ?? null,
    abattoirNotes: p.abattoirNotes ?? null,
    createdById: null,
    createdAt: '2026-09-14T00:00:00Z',
    updatedAt: '2026-09-14T00:00:00Z',
    batch: p.batch ?? BATCH,
    carcassesAvailable: p.carcassesAvailable ?? 0,
  };
}

describe('inHorizon', () => {
  it('today garde uniquement la date du jour', () => {
    expect(inHorizon({ kind: 'today' }, TODAY, TODAY)).toBe(true);
    expect(inHorizon({ kind: 'today' }, '2026-09-15', TODAY)).toBe(false);
    expect(inHorizon({ kind: 'today' }, '2026-09-13', TODAY)).toBe(false);
  });

  it('week couvre ±7 jours', () => {
    expect(inHorizon({ kind: 'week' }, '2026-09-21', TODAY)).toBe(true);
    expect(inHorizon({ kind: 'week' }, '2026-09-22', TODAY)).toBe(false);
    expect(inHorizon({ kind: 'week' }, '2026-09-07', TODAY)).toBe(true);
    expect(inHorizon({ kind: 'week' }, '2026-09-06', TODAY)).toBe(false);
  });

  it('month couvre ±30 jours', () => {
    expect(inHorizon({ kind: 'month' }, '2026-10-14', TODAY)).toBe(true);
    expect(inHorizon({ kind: 'month' }, '2026-10-15', TODAY)).toBe(false);
    expect(inHorizon({ kind: 'month' }, '2026-08-14', TODAY)).toBe(false);
    expect(inHorizon({ kind: 'month' }, '2026-08-15', TODAY)).toBe(true);
  });

  it('custom correspond exactement à la date choisie', () => {
    expect(inHorizon({ kind: 'custom', date: '2026-09-20' }, '2026-09-20', TODAY)).toBe(true);
    expect(inHorizon({ kind: 'custom', date: '2026-09-20' }, TODAY, TODAY)).toBe(false);
    expect(inHorizon({ kind: 'custom' }, TODAY, TODAY)).toBe(false);
  });

  it('all inclut tout', () => {
    expect(inHorizon({ kind: 'all' }, '2025-01-01', TODAY)).toBe(true);
    expect(inHorizon({ kind: 'all' }, '2099-01-01', TODAY)).toBe(true);
  });
});

describe('pipelineOrders', () => {
  const orders = [
    makeOrder({ id: 'd1', status: 'DRAFT', birdCount: 50 }),
    makeOrder({ id: 's1', status: 'SENT', birdCount: 30 }),
    makeOrder({ id: 'p1', status: 'PROCESSED', birdCount: 40, carcassWeightKg: 80 }),
    makeOrder({ id: 'p2', status: 'PROCESSED', birdCount: 20, carcassWeightKg: 30, plannedDate: '2026-09-01' }),
    makeOrder({ id: 'c1', status: 'CANCELLED', birdCount: 999 }),
  ];

  it('scope sur today et ignore les annulés des compteurs actifs', () => {
    const p = pipelineOrders(orders, { kind: 'today' }, TODAY);
    expect(p.drafts).toEqual({ count: 1, birds: 50, kgCarcass: 0 });
    expect(p.sent).toEqual({ count: 1, birds: 30, kgCarcass: 0 });
    expect(p.processed).toEqual({ count: 1, birds: 40, kgCarcass: 80 });
    expect(p.cancelled).toEqual({ count: 1, birds: 999, kgCarcass: 0 });
    expect(p.openBirds).toBe(80);
  });

  it('scope global requalifie les traitements passés', () => {
    const p = pipelineOrders(orders, { kind: 'all' }, TODAY);
    expect(p.processed).toEqual({ count: 2, birds: 60, kgCarcass: 110 });
  });
});

describe('speciesWeightReference', () => {
  it('moyenne pondérée par ordre du poids vif par oiseau', () => {
    const orders = [
      makeOrder({ status: 'PROCESSED', birdCount: 100, totalWeightKg: 180 }),
      makeOrder({ status: 'PROCESSED', birdCount: 50, totalWeightKg: 90 }),
      makeOrder({ status: 'PROCESSED', birdCount: 40, totalWeightKg: null }),
      makeOrder({ status: 'SENT', birdCount: 200, totalWeightKg: 999 }),
    ];
    const refs = speciesWeightReference(orders);
    expect(refs.POULET).toEqual({ n: 2, avgLiveKgPerBird: 1.8 });
  });

  it('retourne un objet vide sans ordres pesés traités', () => {
    expect(speciesWeightReference([])).toEqual({});
  });
});

describe('yieldReference', () => {
  it('moyenne des rendements renseignés', () => {
    const orders = [
      makeOrder({ status: 'PROCESSED', rendementPercent: 70 }),
      makeOrder({ status: 'PROCESSED', rendementPercent: 74 }),
      makeOrder({ status: 'PROCESSED', rendementPercent: null }),
    ];
    expect(yieldReference(orders)).toEqual({ avgRendementPct: 72, n: 2 });
  });

  it('retourne null sans rendement saisi', () => {
    expect(yieldReference([])).toEqual({ avgRendementPct: null, n: 0 });
  });
});

describe('slaughterRefs', () => {
  it('agrège poids vif par espèce et rendement global', () => {
    const orders = [
      makeOrder({ status: 'PROCESSED', birdCount: 100, totalWeightKg: 180, rendementPercent: 70 }),
      makeOrder({ status: 'PROCESSED', birdCount: 100, totalWeightKg: 182, rendementPercent: 74 }),
    ];
    const refs = slaughterRefs(orders);
    expect(refs.weights.POULET.avgLiveKgPerBird).toBeCloseTo(1.81, 5);
    expect(refs.yield.avgRendementPct).toBe(72);
  });
});

describe('projectOrder', () => {
  const refs = slaughterRefs([
    makeOrder({ status: 'PROCESSED', birdCount: 100, totalWeightKg: 180, rendementPercent: 72 }),
  ]);

  it('projette vif, carcasse et reliquat du lot', () => {
    const p = projectOrder(BATCH, 100, refs);
    expect(p.estLiveKg).toBeCloseTo(180, 5);
    expect(p.estCarcassKg).toBeCloseTo(129.6, 5);
    expect(p.avgRendementPct).toBe(72);
    expect(p.rendementN).toBe(1);
    expect(p.remainingAfter).toBe(400);
  });

  it('reste vide sans références historiques', () => {
    const p = projectOrder(BATCH, 100, slaughterRefs([]));
    expect(p.estLiveKg).toBeNull();
    expect(p.estCarcassKg).toBeNull();
    expect(p.remainingAfter).toBe(400);
  });

  it('nul quand le nombre de oiseaux est 0', () => {
    const p = projectOrder(BATCH, 0, refs);
    expect(p.estLiveKg).toBeNull();
    expect(p.estCarcassKg).toBeNull();
    expect(p.remainingAfter).toBe(500);
  });
});

describe('lotAvailability', () => {
  it('additionne brouillons et envoyés, exclut annulés', () => {
    const orders = [
      makeOrder({ id: 'd1', status: 'DRAFT', birdCount: 100 }),
      makeOrder({ id: 's1', status: 'SENT', birdCount: 50 }),
      makeOrder({ id: 'p1', status: 'PROCESSED', birdCount: 200 }),
      makeOrder({ id: 'c1', status: 'CANCELLED', birdCount: 999 }),
    ];
    const a = lotAvailability(orders, BATCH);
    expect(a.alive).toBe(500);
    expect(a.ordered).toBe(150);
    expect(a.processed).toBe(200);
    expect(a.remaining).toBe(350);
    expect(a.overbooked).toBe(false);
  });

  it('signale la surcapacité', () => {
    const small = { ...BATCH, quantityAlive: 100 } as ProductionBatch;
    const orders = [makeOrder({ status: 'DRAFT', birdCount: 80 }), makeOrder({ status: 'SENT', birdCount: 60 })];
    const a = lotAvailability(orders, small);
    expect(a.overbooked).toBe(true);
    expect(a.remaining).toBe(0);
  });
});

describe('reserveCarcasses', () => {
  it('cumule les pools vendables', () => {
    const orders = [
      makeOrder({ status: 'PROCESSED', carcassesAvailable: 50 }),
      makeOrder({ status: 'PROCESSED', carcassesAvailable: 0 }),
      makeOrder({ status: 'DRAFT' }),
    ];
    expect(reserveCarcasses(orders)).toBe(50);
  });
});

describe('lotSlaughterSummary', () => {
  const batch500 = { ...BATCH, quantityAlive: 500 } as ProductionBatch;
  const smallBatch = { ...BATCH, id: 'lot-2', quantityAlive: 80 } as ProductionBatch;

  it('agrège les ordres en cours et traités, exclut annulés', () => {
    const orders = [
      makeOrder({ id: 'd1', batchId: 'lot-1', status: 'DRAFT', birdCount: 120 }),
      makeOrder({ id: 's1', batchId: 'lot-1', status: 'SENT', birdCount: 60 }),
      makeOrder({ id: 'p1', batchId: 'lot-1', status: 'PROCESSED', birdCount: 200, carcassWeightKg: 400, rendementPercent: 72 }),
      makeOrder({ id: 'p2', batchId: 'lot-1', status: 'PROCESSED', birdCount: 100, carcassWeightKg: 180, rendementPercent: 76 }),
      makeOrder({ id: 'c1', batchId: 'lot-1', status: 'CANCELLED', birdCount: 999 }),
      makeOrder({ id: 'other', batchId: 'lot-x', status: 'DRAFT', birdCount: 50 }),
    ];
    const s = lotSlaughterSummary(orders, batch500);
    expect(s.pendingCount).toBe(2);
    expect(s.pendingBirds).toBe(180);
    expect(s.overbooked).toBe(false);
    expect(s.processedCount).toBe(2);
    expect(s.processedBirds).toBe(300);
    expect(s.carcassKg).toBe(580);
    expect(s.rendementPct).toBeCloseTo(74, 5);
    expect(s.remaining).toBe(320);
    expect(s.hasActivity).toBe(true);
  });

  it('signale surcapacité', () => {
    const orders = [
      makeOrder({ id: 'd1', batchId: 'lot-2', status: 'DRAFT', birdCount: 50 }),
      makeOrder({ id: 's1', batchId: 'lot-2', status: 'SENT', birdCount: 40 }),
    ];
    const s = lotSlaughterSummary(orders, smallBatch);
    expect(s.overbooked).toBe(true);
    expect(s.pendingBirds).toBe(90);
    expect(s.remaining).toBe(0);
    expect(s.hasActivity).toBe(true);
  });

  it('aucune activité → zeros partout', () => {
    const s = lotSlaughterSummary([], batch500);
    expect(s.pendingCount).toBe(0);
    expect(s.pendingBirds).toBe(0);
    expect(s.overbooked).toBe(false);
    expect(s.processedCount).toBe(0);
    expect(s.processedBirds).toBe(0);
    expect(s.carcassKg).toBe(0);
    expect(s.rendementPct).toBeNull();
    expect(s.remaining).toBe(500);
    expect(s.hasActivity).toBe(false);
  });

  it('ignore rendement null sur les ordres sans saisie', () => {
    const orders = [
      makeOrder({ status: 'PROCESSED', carcassWeightKg: 100, rendementPercent: null }),
      makeOrder({ status: 'PROCESSED', carcassWeightKg: 200, rendementPercent: 68 }),
    ];
    const s = lotSlaughterSummary(orders, batch500);
    expect(s.rendementPct).toBe(68);
  });
});
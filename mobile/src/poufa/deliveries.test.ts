import { describe, expect, it } from 'vitest';

import type { DeliveryLineView, DeliveryView } from '@/api/poufa';
import {
  buildConfirmPayload,
  confirmRefusal,
  deliverySupplier,
  initialDrafts,
  isDiscrepancy,
  openBandHintOf,
  parseQuantity,
  pendingDeliveries,
  queuedDeliveryIds,
  sortStockRows,
} from './deliveries';

const line = (over: Partial<DeliveryLineView> = {}): DeliveryLineView => ({
  id: 'l-1',
  position: 1,
  intrantCode: 'POUSSIN_CHAIR',
  intrantLabel: 'Poussins chair',
  intrantFamily: 'POUSSIN',
  unitCode: 'TETE',
  unitLabel: 'têtes',
  quantity: 100,
  feedPhase: null,
  bagSizeKg: null,
  subsidized: true,
  subsidyRate: 0.5,
  unitValueFcfa: 600,
  supplierLotNumber: 'LOT-7',
  expirationDate: null,
  receivedQuantity: null,
  discrepancyReason: null,
  farmerCostFcfa: null,
  subsidyFcfa: null,
  inputLotId: null,
  ...over,
});

const delivery = (over: Partial<DeliveryView> = {}): DeliveryView => ({
  id: 'd-1',
  code: 'LIV-2026-0001',
  status: 'EXPEDIEE',
  source: 'ETAT_SMAG',
  supplierName: null,
  shippedAt: '2026-11-04T09:00:00.000Z',
  receivedDate: null,
  confirmedAt: null,
  hasDiscrepancy: false,
  cancelledAt: null,
  cancelReason: null,
  notes: null,
  createdAt: '2026-11-04T09:00:00.000Z',
  band: null,
  lines: [line()],
  totals: { shippedValueFcfa: 60000, farmerCostFcfa: null, subsidyFcfa: null },
  ...over,
});

describe('liste', () => {
  it('fournisseur État / SMAG par défaut', () => {
    expect(deliverySupplier(delivery())).toBe('État / SMAG');
    expect(deliverySupplier(delivery({ source: 'AUTRE' }))).toBe('Autre fournisseur');
    expect(deliverySupplier(delivery({ supplierName: 'Couvoir X' }))).toBe('Couvoir X');
  });

  it('à confirmer : expédiées seulement, plus anciennes d’abord', () => {
    const list = [
      delivery({ id: 'b', shippedAt: '2026-11-05' }),
      delivery({ id: 'c', status: 'CONFIRMEE' }),
      delivery({ id: 'a', shippedAt: '2026-11-01' }),
    ];
    expect(pendingDeliveries(list).map((d) => d.id)).toEqual(['a', 'b']);
  });

  it('confirmations en file de la ferme active', () => {
    const ops = [
      { kind: 'delivery-confirm', farmId: 'f-1', payload: { deliveryId: 'd-1' } },
      { kind: 'delivery-confirm', farmId: 'f-2', payload: { deliveryId: 'd-2' } },
      { kind: 'sale', farmId: 'f-1', payload: {} },
    ];
    expect([...queuedDeliveryIds(ops, 'f-1')]).toEqual(['d-1']);
  });
});

describe('confirmation', () => {
  const today = '2026-11-06';

  it('quantités : virgule acceptée, texte refusé', () => {
    expect(parseQuantity('12,5')).toBe(12.5);
    expect(parseQuantity(' 3 ')).toBe(3);
    expect(parseQuantity('-1')).toBeNull();
    expect(parseQuantity('abc')).toBeNull();
  });

  it('écart : même règle que le serveur', () => {
    expect(isDiscrepancy(10, 10)).toBe(false);
    expect(isDiscrepancy(10, 9.999)).toBe(true);
  });

  it('brouillons : reçu = expédié par défaut', () => {
    const [d] = initialDrafts(delivery({ lines: [line({ quantity: 12.5, intrantFamily: 'ALIMENT' })] }));
    expect(d.received).toBe('12,5');
    expect(d.reason).toBe('');
  });

  it('refuse motif manquant, poussins non entiers, dates hors bornes', () => {
    const shippedAt = '2026-11-04T09:00:00.000Z';
    const [d] = initialDrafts(delivery());
    expect(confirmRefusal({ drafts: [d], receivedDate: today, shippedAt, today })).toBeNull();
    expect(confirmRefusal({ drafts: [{ ...d, received: '98' }], receivedDate: today, shippedAt, today })).toMatch(/motif/);
    expect(confirmRefusal({ drafts: [{ ...d, received: '98', reason: 'Morts' }], receivedDate: today, shippedAt, today })).toBeNull();
    expect(confirmRefusal({ drafts: [{ ...d, received: '98,5', reason: 'Morts' }], receivedDate: today, shippedAt, today })).toMatch(/entier/);
    expect(confirmRefusal({ drafts: [d], receivedDate: '2026-11-08', shippedAt, today })).toMatch(/futur/);
    expect(confirmRefusal({ drafts: [d], receivedDate: '2026-11-07', shippedAt, today })).toBeNull();
    expect(confirmRefusal({ drafts: [d], receivedDate: '2026-11-03', shippedAt, today })).toMatch(/précéder/);
  });

  it('corps : toutes les lignes, motif seulement si écart', () => {
    const [d] = initialDrafts(delivery());
    expect(buildConfirmPayload([d], today)).toEqual({ receivedDate: today, lines: [{ lineId: 'l-1', receivedQuantity: 100 }] });
    expect(buildConfirmPayload([{ ...d, received: '97', reason: ' 3 morts ' }], today).lines).toEqual([
      { lineId: 'l-1', receivedQuantity: 97, discrepancyReason: '3 morts' },
    ]);
  });
});

describe('ouverture de bande', () => {
  it('poussins reçus sans bande : données pré-remplies', () => {
    const hint = openBandHintOf(
      delivery({ status: 'CONFIRMEE', receivedDate: '2026-11-05', lines: [line({ receivedQuantity: 98, farmerCostFcfa: 29400 })] }),
    );
    expect(hint).toMatchObject({
      deliveryId: 'd-1',
      quantityAtStart: 98,
      integrationDate: '2026-11-05',
      couvoirSupplier: 'État / SMAG',
      chickLotNumber: 'LOT-7',
      chickCostBooked: true,
    });
  });

  it('rien quand la bande est rattachée, non confirmée ou sans poussins', () => {
    expect(openBandHintOf(delivery())).toBeNull();
    expect(openBandHintOf(delivery({ status: 'CONFIRMEE', band: { id: 'b', code: null, batchName: null }, lines: [line({ receivedQuantity: 98 })] }))).toBeNull();
    expect(openBandHintOf(delivery({ status: 'CONFIRMEE', lines: [line({ intrantFamily: 'ALIMENT', receivedQuantity: 10 })] }))).toBeNull();
  });
});

describe('stock déclaratif', () => {
  it('négatifs d’abord, puis par libellé', () => {
    const row = (key: string, label: string, negative: boolean) => ({
      key,
      intrantCode: key,
      intrantFamily: 'ALIMENT',
      intrantLabel: label,
      unitCode: 'SAC',
      unitLabel: null,
      trackedSince: '2026-01-01',
      shipped: 0,
      received: 0,
      consumed: 0,
      lost: 0,
      sold: 0,
      used: 0,
      stock: 0,
      physicalStock: null,
      negative,
    });
    expect(sortStockRows([row('a', 'Démarrage', false), row('b', 'Croissance', false), row('c', 'Finition', true)]).map((r) => r.key)).toEqual([
      'c',
      'b',
      'a',
    ]);
  });
});

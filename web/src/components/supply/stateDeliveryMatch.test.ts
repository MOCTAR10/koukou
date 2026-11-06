import { describe, expect, it } from 'vitest';
import type { DeliveryLineView, DeliveryView } from '../../api/types-supply';
import { matchStateDeliveries, pendingStateDeliveries } from './stateDeliveryMatch';

const lineOf = (over: Partial<DeliveryLineView>): DeliveryLineView => ({
  id: 'l1',
  position: 1,
  intrantCode: 'ALIMENT_DEMARRAGE',
  intrantLabel: 'Aliment démarrage',
  intrantFamily: 'ALIMENT',
  unitCode: 'SAC',
  unitLabel: 'Sac',
  quantity: 20,
  feedPhase: 'DEMARRAGE',
  bagSizeKg: 50,
  subsidized: true,
  subsidyRate: 0.5,
  unitValueFcfa: 15000,
  supplierLotNumber: null,
  expirationDate: null,
  receivedQuantity: null,
  discrepancyReason: null,
  farmerCostFcfa: null,
  subsidyFcfa: null,
  inputLotId: null,
  ...over,
});

const deliveryOf = (over: Partial<DeliveryView>): DeliveryView => ({
  id: 'd1',
  code: 'LIV-1',
  status: 'EXPEDIEE',
  source: 'ETAT_SMAG',
  supplierName: null,
  shippedAt: '2026-11-01T08:00:00.000Z',
  receivedDate: null,
  confirmedAt: null,
  confirmedById: null,
  hasDiscrepancy: false,
  cancelledAt: null,
  cancelReason: null,
  notes: null,
  createdById: null,
  createdAt: '2026-11-01T08:00:00.000Z',
  farm: { id: 'f1', code: null, name: 'Ferme', provinceCode: null, provinceName: null },
  band: null,
  lines: [lineOf({})],
  totals: { shippedValueFcfa: 300000, farmerCostFcfa: null, subsidyFcfa: null },
  ...over,
});

describe('matchStateDeliveries', () => {
  it('matches feed bags and bulk with an ALIMENT line of the same phase', () => {
    const d = deliveryOf({});
    expect(matchStateDeliveries('BAG', 'DEMARRAGE', [d])).toHaveLength(1);
    expect(matchStateDeliveries('BULKER', 'DEMARRAGE', [d])).toHaveLength(1);
    expect(matchStateDeliveries('BAG', 'CROISSANCE', [d])).toHaveLength(0);
  });

  it('ignores the phase when one side does not know it', () => {
    const noPhase = deliveryOf({ lines: [lineOf({ feedPhase: null })] });
    expect(matchStateDeliveries('BAG', 'FINITION', [noPhase])).toHaveLength(1);
    expect(matchStateDeliveries('BAG', null, [deliveryOf({})])).toHaveLength(1);
    expect(matchStateDeliveries('MATIERE_PREMIERE', null, [deliveryOf({})])).toHaveLength(1);
  });

  it('maps chicks to POUSSIN and drugs to VACCIN, MEDICAMENT or AUTRE', () => {
    const d = deliveryOf({
      lines: [
        lineOf({ id: 'p', intrantFamily: 'POUSSIN', feedPhase: null }),
        lineOf({ id: 'v', intrantFamily: 'VACCIN', feedPhase: null }),
        lineOf({ id: 'm', intrantFamily: 'MEDICAMENT', feedPhase: null }),
        lineOf({ id: 'a', intrantFamily: 'AUTRE', feedPhase: null }),
      ],
    });
    expect(matchStateDeliveries('POUSSINS', null, [d]).map((m) => m.line.id)).toEqual(['p']);
    expect(matchStateDeliveries('MEDICAMENT', 'DEMARRAGE', [d]).map((m) => m.line.id)).toEqual(['v', 'm', 'a']);
    expect(matchStateDeliveries('BAG', 'DEMARRAGE', [d])).toHaveLength(0);
  });

  it('only looks at deliveries still to confirm', () => {
    const done = deliveryOf({ status: 'CONFIRMEE' });
    const cancelled = deliveryOf({ status: 'ANNULEE' });
    expect(matchStateDeliveries('BAG', 'DEMARRAGE', [done, cancelled])).toHaveLength(0);
  });
});

describe('pendingStateDeliveries', () => {
  it('keeps the pending ones, oldest first', () => {
    const rows = [
      deliveryOf({ id: 'b', code: 'LIV-2', shippedAt: '2026-11-03T08:00:00.000Z' }),
      deliveryOf({ id: 'x', status: 'CONFIRMEE' }),
      deliveryOf({ id: 'a', code: 'LIV-1', shippedAt: '2026-11-02T08:00:00.000Z' }),
    ];
    expect(pendingStateDeliveries(rows).map((d) => d.id)).toEqual(['a', 'b']);
  });
});

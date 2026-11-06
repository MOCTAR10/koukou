import { describe, expect, it } from 'vitest';

import type { DeliveryLineView, DeliveryView } from '@/api/poufa';

import {
  duplicateDeliveryWarning,
  pendingDeliveryLabel,
  pendingDeliveryMatch,
  pendingDeliveryMatches,
} from './state-deliveries';

const line = (over: Partial<DeliveryLineView> = {}): DeliveryLineView => ({
  id: 'l-1',
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
  totals: { shippedValueFcfa: 300000, farmerCostFcfa: null, subsidyFcfa: null },
  ...over,
});

const chicks = line({ id: 'l-p', position: 2, intrantCode: 'POUSSINS', intrantLabel: 'Poussins', intrantFamily: 'POUSSIN', unitCode: 'TETE', unitLabel: 'Tête', quantity: 500, feedPhase: null });
const vaccine = line({ id: 'l-v', position: 3, intrantCode: 'VACCIN', intrantLabel: 'Vaccin', intrantFamily: 'VACCIN', unitCode: 'DOSE', unitLabel: 'Dose', quantity: 1000, feedPhase: null });

describe('réception manuelle ↔ livraison de l’État en attente', () => {
  it('aliment : sac, vrac et matière première ; même phase quand les deux sont connues', () => {
    const list = [delivery()];
    expect(pendingDeliveryMatch('BAG', 'DEMARRAGE', list)?.line.id).toBe('l-1');
    expect(pendingDeliveryMatch('BULKER', 'DEMARRAGE', list)?.line.id).toBe('l-1');
    expect(pendingDeliveryMatch('MATIERE_PREMIERE', null, list)?.line.id).toBe('l-1');
    expect(pendingDeliveryMatch('BAG', 'CROISSANCE', list)).toBeNull();
    // A phase unknown on either side does not exclude the line.
    expect(pendingDeliveryMatch('BAG', 'PERSONNALISE', list)?.line.id).toBe('l-1');
    expect(pendingDeliveryMatch('BAG', 'CROISSANCE', [delivery({ lines: [line({ feedPhase: null })] })])).not.toBeNull();
  });

  it('poussins ↔ POUSSIN ; médicament ↔ vaccin, médicament, autre', () => {
    const list = [delivery({ lines: [line(), chicks, vaccine] })];
    expect(pendingDeliveryMatch('POUSSINS', null, list)?.line.id).toBe('l-p');
    expect(pendingDeliveryMatch('MEDICAMENT', null, list)?.line.id).toBe('l-v');
    expect(pendingDeliveryMatches('MEDICAMENT', null, [delivery({ lines: [line({ intrantFamily: 'AUTRE' })] })])).toHaveLength(1);
    expect(pendingDeliveryMatch('MEDICAMENT', null, [delivery()])).toBeNull();
  });

  it('livraisons expédiées seulement, la plus ancienne d’abord', () => {
    const list = [
      delivery({ id: 'late', code: 'LIV-2', shippedAt: '2026-11-05T09:00:00.000Z' }),
      delivery({ id: 'done', status: 'CONFIRMEE', shippedAt: '2026-11-01T09:00:00.000Z' }),
      delivery({ id: 'early', code: 'LIV-1', shippedAt: '2026-11-03T09:00:00.000Z' }),
    ];
    expect(pendingDeliveryMatches('BAG', 'DEMARRAGE', list).map((m) => m.delivery.id)).toEqual(['early', 'late']);
  });

  it('textes : libellé de la livraison, avertissement prix plein et subvention perdue', () => {
    expect(pendingDeliveryLabel(delivery({ lines: [line(), chicks] }))).toBe('Livraison LIV-2026-0001 du 04/11/2026 · 2 lignes');
    const w = duplicateDeliveryWarning(pendingDeliveryMatch('BAG', 'DEMARRAGE', [delivery()])!);
    expect(w).toContain('LIV-2026-0001');
    expect(w).toContain('Aliment démarrage, 20 sac');
    expect(w).toContain('prix plein');
    expect(w).toContain('subvention');
  });
});

import { describe, expect, it } from 'vitest';
import type { DeliveryLineView, DeliveryView } from '../../api/types-supply';
import { buildConfirmPayload, draftDiffers, initialConfirmDrafts, pendingFirst } from './confirmRules';

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
  subsidized: false,
  subsidyRate: null,
  unitValueFcfa: 15000,
  supplierLotNumber: 'F-1',
  expirationDate: null,
  receivedQuantity: null,
  discrepancyReason: null,
  farmerCostFcfa: null,
  subsidyFcfa: null,
  inputLotId: null,
  ...over,
});

const delivery = {
  status: 'EXPEDIEE',
  shippedAt: '2026-11-04',
  lines: [lineOf({}), lineOf({ id: 'l2', position: 2, intrantCode: 'POUSSINS', intrantLabel: 'Poussins', intrantFamily: 'POUSSIN', unitCode: 'TETE', quantity: 500, supplierLotNumber: null })],
} as Pick<DeliveryView, 'status' | 'shippedAt' | 'lines'>;

describe('buildConfirmPayload', () => {
  it('receives every line as shipped by default', () => {
    const res = buildConfirmPayload(delivery, initialConfirmDrafts(delivery), '2026-11-06', '2026-11-06');
    expect(res.errors).toEqual([]);
    expect(res.payload).toEqual({
      receivedDate: '2026-11-06',
      lines: [
        { lineId: 'l1', receivedQuantity: 20 },
        { lineId: 'l2', receivedQuantity: 500 },
      ],
    });
  });

  it('needs a reason for a discrepancy and whole chicks', () => {
    const drafts = initialConfirmDrafts(delivery).map((d) => (d.lineId === 'l1' ? { ...d, received: '18' } : { ...d, received: '480,5' }));
    expect(draftDiffers(delivery.lines[0]!, drafts[0]!)).toBe(true);
    const res = buildConfirmPayload(delivery, drafts, '2026-11-06', '2026-11-06');
    expect(res.payload).toBeNull();
    expect(res.errors).toEqual([
      "Ligne 1 (Aliment démarrage) : reçu 18 pour 20 expédié, indiquez le motif de l'écart.",
      'Ligne 2 (Poussins) : le nombre de poussins reçus doit être un entier.',
      "Ligne 2 (Poussins) : reçu 480,5 pour 500 expédié, indiquez le motif de l'écart.",
    ]);
    const ok = buildConfirmPayload(
      delivery,
      drafts.map((d) => (d.lineId === 'l1' ? { ...d, reason: '2 sacs déchirés', supplierLotNumber: 'F-2' } : { ...d, received: '480', reason: 'morts au transport' })),
      '2026-11-05',
      '2026-11-06',
    );
    expect(ok.payload?.lines).toEqual([
      { lineId: 'l1', receivedQuantity: 18, discrepancyReason: '2 sacs déchirés', supplierLotNumber: 'F-2' },
      { lineId: 'l2', receivedQuantity: 480, discrepancyReason: 'morts au transport' },
    ]);
  });

  it('refuses a reception before shipping, in the future, or on a final delivery', () => {
    const drafts = initialConfirmDrafts(delivery);
    expect(buildConfirmPayload(delivery, drafts, '2026-11-03', '2026-11-06').errors).toEqual([
      "La réception ne peut pas précéder l'expédition (2026-11-04).",
    ]);
    expect(buildConfirmPayload(delivery, drafts, '2026-11-09', '2026-11-06').errors).toEqual([
      'La date de réception ne peut pas être dans le futur.',
    ]);
    expect(buildConfirmPayload({ ...delivery, status: 'ANNULEE' }, drafts, '2026-11-06', '2026-11-06').errors[0]).toMatch(/annulée/);
  });

  it('accepts 0 received (nothing arrived) with a reason', () => {
    const drafts = initialConfirmDrafts(delivery).map((d) => (d.lineId === 'l1' ? { ...d, received: '0', reason: 'non livré' } : d));
    expect(buildConfirmPayload(delivery, drafts, '2026-11-06', '2026-11-06').payload?.lines[0]).toEqual({
      lineId: 'l1',
      receivedQuantity: 0,
      discrepancyReason: 'non livré',
    });
  });
});

describe('pendingFirst', () => {
  it('lists what to receive first, oldest first, then the rest newest first', () => {
    const rows = [
      { status: 'CONFIRMEE', shippedAt: '2026-11-01', code: 'A' },
      { status: 'EXPEDIEE', shippedAt: '2026-11-05', code: 'B' },
      { status: 'EXPEDIEE', shippedAt: '2026-11-02', code: 'C' },
      { status: 'ANNULEE', shippedAt: '2026-11-04', code: 'D' },
    ] as const;
    expect(pendingFirst(rows.map((r) => ({ ...r }))).map((r) => r.code)).toEqual(['C', 'B', 'D', 'A']);
  });
});

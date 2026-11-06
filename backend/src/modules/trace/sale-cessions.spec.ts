import { describe, expect, it } from 'vitest';
import { SaleItemProductType } from '../../common/enums/sale-item-type.enum.js';
import { saleCessionLines } from './sale-cessions.js';
import { hasSortieRecipient } from '../bandes/sortie-rules.js';

const item = (
  productType: SaleItemProductType,
  quantity: number,
  batchId: string | null,
  pieceCount: number | null = null,
) => ({ productType, quantity, batchId, pieceCount });

describe('saleCessionLines (F4, cessions from sales)', () => {
  it('one cession per band, heads of the poultry lines', () => {
    const lines = saleCessionLines([
      item(SaleItemProductType.POULET_PIECE, 10, 'b2', 10),
      item(SaleItemProductType.POULET_PIECE, 5, 'b1'),
      item(SaleItemProductType.POULET_PIECE, 3, 'b2', 3),
    ]);
    expect(lines).toEqual([
      { batchId: 'b1', count: 5, weightKg: null, carcass: false },
      { batchId: 'b2', count: 13, weightKg: null, carcass: false },
    ]);
  });

  it('live kg only when every live line of the band was sold by the kg', () => {
    expect(
      saleCessionLines([item(SaleItemProductType.POULET_KG, 42.5, 'b1', 20)]),
    ).toEqual([{ batchId: 'b1', count: 20, weightKg: 42.5, carcass: false }]);
    expect(
      saleCessionLines([
        item(SaleItemProductType.POULET_KG, 40, 'b1', 20),
        item(SaleItemProductType.POULET_PIECE, 2, 'b1', 2),
      ])[0],
    ).toMatchObject({ count: 22, weightKg: null });
  });

  it('carcasses are ceded without a live weight (the birds left at the slaughter)', () => {
    expect(
      saleCessionLines([
        item(SaleItemProductType.ABATTU_KG, 30, 'b1', 15),
        item(SaleItemProductType.ABATTU_PIECE, 4, 'b1'),
      ]),
    ).toEqual([{ batchId: 'b1', count: 19, weightKg: null, carcass: true }]);
    expect(
      saleCessionLines([
        item(SaleItemProductType.ABATTU_PIECE, 4, 'b1', 4),
        item(SaleItemProductType.POULET_KG, 10, 'b1', 5),
      ])[0],
    ).toMatchObject({ count: 9, weightKg: null, carcass: false });
  });

  it('eggs, feed, lines without band or heads are no cession', () => {
    expect(
      saleCessionLines([
        item(SaleItemProductType.OEUFS, 10, 'b1'),
        item(SaleItemProductType.PROVENDE, 2, null),
        item(SaleItemProductType.POULET_PIECE, 3, null, 3),
        item(SaleItemProductType.POULET_KG, 12, 'b1', null),
      ]),
    ).toEqual([]);
  });
});

describe('hasSortieRecipient (CDC n° 9, destinataire obligatoire)', () => {
  it('a free name or an operator', () => {
    expect(hasSortieRecipient({ recipientName: 'Marché Mont-Bouët' })).toBe(true);
    expect(hasSortieRecipient({ operatorId: 'op-1' })).toBe(true);
    expect(hasSortieRecipient({ recipientName: '  ', operatorId: null })).toBe(false);
    expect(hasSortieRecipient({})).toBe(false);
  });
});

import { SaleItemProductType } from '../../common/enums/sale-item-type.enum.js';

/**
 * Cessions created by a Fermia sale (A4 friction F4): a POS sale, an order
 * delivered (Market orders included) or a carcass sale to a customer linked
 * to a programme operator is a cession of the band's lot, like a sortie
 * towards that operator. Pure, so the grouping is unit-tested.
 */
export interface SaleCessionItem {
  productType: SaleItemProductType | string;
  quantity: number;
  pieceCount: number | null;
  batchId: string | null;
  sourceSlaughterOrderId?: string | null;
}

export interface SaleCessionLine {
  batchId: string;
  /** Heads (live birds or carcasses) ceded from that band. */
  count: number;
  /**
   * Live weight (kg) when every line was live birds sold by the kg. Never a
   * carcass weight: the band's live kg left at the slaughter already.
   */
  weightKg: number | null;
  /** Only carcasses (the birds left the band at the slaughter). */
  carcass: boolean;
}

const LIVE = new Set<string>([
  SaleItemProductType.POULET_PIECE,
  SaleItemProductType.POULET_KG,
]);
const CARCASS = new Set<string>([
  SaleItemProductType.ABATTU_PIECE,
  SaleItemProductType.ABATTU_KG,
]);
const PER_PIECE = new Set<string>([
  SaleItemProductType.POULET_PIECE,
  SaleItemProductType.ABATTU_PIECE,
]);

function heads(item: SaleCessionItem): number {
  if (item.pieceCount != null) return item.pieceCount;
  return PER_PIECE.has(item.productType) ? Math.ceil(item.quantity) : 0;
}

/**
 * One cession per band of the sale: heads of its poultry lines, live kg when
 * every live line of that band was sold by the kg. Eggs, feed and other
 * lines are no cession of the lot.
 */
export function saleCessionLines(
  items: readonly SaleCessionItem[],
): SaleCessionLine[] {
  const byBatch = new Map<
    string,
    { count: number; kg: number; liveByKg: boolean; live: boolean }
  >();
  for (const item of items) {
    const live = LIVE.has(item.productType);
    if (!item.batchId || (!live && !CARCASS.has(item.productType))) continue;
    const n = heads(item);
    if (n <= 0) continue;
    const acc = byBatch.get(item.batchId) ?? {
      count: 0,
      kg: 0,
      liveByKg: true,
      live: false,
    };
    acc.count += n;
    if (live) {
      acc.live = true;
      if (item.productType === SaleItemProductType.POULET_KG) {
        acc.kg += item.quantity;
      } else {
        acc.liveByKg = false;
      }
    } else {
      // Carcasses mixed in: no live weight for the whole cession.
      acc.liveByKg = false;
    }
    byBatch.set(item.batchId, acc);
  }
  return [...byBatch.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([batchId, acc]) => ({
      batchId,
      count: acc.count,
      weightKg: acc.live && acc.liveByKg && acc.kg > 0 ? acc.kg : null,
      carcass: !acc.live,
    }));
}

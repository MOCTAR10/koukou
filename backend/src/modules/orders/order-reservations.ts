import { EntityManager, In, Not } from 'typeorm';
import { OrderStatus } from '../../common/enums/order-status.enum.js';
import { SaleItemProductType } from '../../common/enums/sale-item-type.enum.js';
import { SlaughterStatus } from '../../common/enums/slaughter-status.enum.js';
import { SlaughterOrder } from '../slaughter/entities/slaughter-order.entity.js';
import { Order } from './entities/order.entity.js';

/** Nb d'oiseaux d'un article volaille (pièce, au kilo ou abattu). */
export function birdsOf(item: {
  productType: string;
  quantity: number;
  pieceCount?: number | null;
}): number {
  if (
    item.productType === SaleItemProductType.POULET_PIECE ||
    item.productType === SaleItemProductType.ABATTU_PIECE
  ) {
    return item.pieceCount ?? Math.ceil(item.quantity);
  }
  if (
    item.productType === SaleItemProductType.POULET_KG ||
    item.productType === SaleItemProductType.ABATTU_KG
  ) {
    return item.pieceCount ?? 0;
  }
  return 0;
}

export interface BatchReservation {
  /** Birds promised to open (not delivered, not cancelled) orders. */
  birds: number;
  /** Reference numbers of the orders holding them. */
  orderRefs: string[];
}

/**
 * Soft reservation of a batch: orders don't decrement the flock until
 * delivery, so every other flock exit (slaughter, new order) must leave
 * these birds in place. Call it after locking the batch row so a concurrent
 * order creation (which locks the batch too) is serialized.
 */
export async function batchReservation(
  em: EntityManager,
  farmId: string,
  batchId: string,
): Promise<BatchReservation> {
  const open = await em.getRepository(Order).find({
    where: {
      farmId,
      batchId,
      status: Not(In([OrderStatus.CANCELLED, OrderStatus.LIVRE])),
    },
    order: { createdAt: 'ASC' },
  });
  let birds = 0;
  const orderRefs: string[] = [];
  for (const o of open) {
    const n = (o.items ?? []).reduce((s, it) => s + birdsOf(it), 0);
    if (n > 0) {
      birds += n;
      orderRefs.push(o.referenceNumber);
    }
  }
  return { birds, orderRefs };
}

/**
 * Birds already sent to the abattoir (SENT, not yet processed): they still
 * count in quantityAlive until processing, but can't be promised to a
 * customer order anymore.
 */
export async function sentSlaughterBirds(
  em: EntityManager,
  farmId: string,
  batchId: string,
  excludeSlaughterOrderId?: string,
): Promise<number> {
  const qb = em
    .getRepository(SlaughterOrder)
    .createQueryBuilder('o')
    .select('COALESCE(SUM(o.bird_count), 0)', 'birds')
    .where('o.farm_id = :farmId', { farmId })
    .andWhere('o.batch_id = :batchId', { batchId })
    .andWhere('o.status = :status', { status: SlaughterStatus.SENT });
  if (excludeSlaughterOrderId) {
    qb.andWhere('o.id != :excludeId', { excludeId: excludeSlaughterOrderId });
  }
  const row = await qb.getRawOne<{ birds: string | number }>();
  return Number(row?.birds ?? 0);
}

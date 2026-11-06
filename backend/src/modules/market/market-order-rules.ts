import { EntityManager } from 'typeorm';
import {
  MarketBuyerStatus,
  MarketOrderState,
} from '../../common/enums/market.enum.js';
import { OrderStatus } from '../../common/enums/order-status.enum.js';
import { MarketOrder } from './entities/market-order.entity.js';

export const REQUEST_LIFETIME_MS = 48 * 60 * 60 * 1000;
export const DEPOSIT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_OPEN_REQUESTS_PER_BUYER = 10;

/** Rounded up: a deposit of 30 % never falls below 30 %. */
export function depositRequired(
  quantity: number,
  unitPriceFcfa: number,
  depositPct: number | null,
): number {
  if (!depositPct) return 0;
  return Math.ceil((quantity * unitPriceFcfa * depositPct) / 100);
}

/**
 * Units a listing has committed: accepted requests whose order isn't
 * cancelled. A deleted order releases its units too. Requests never count.
 */
export async function acceptedQuantity(
  em: EntityManager,
  listingId: string,
): Promise<number> {
  const row = await em
    .getRepository(MarketOrder)
    .createQueryBuilder('mo')
    .select('COALESCE(SUM(mo.quantity), 0)', 'quantity')
    .innerJoin('mo.order', 'o')
    .where('mo.listingId = :listingId', { listingId })
    .andWhere('mo.state = :state', { state: MarketOrderState.ACCEPTED })
    .andWhere('o.status <> :cancelled', { cancelled: OrderStatus.CANCELLED })
    .getRawOne<{ quantity: string | number }>();
  return Number(row?.quantity ?? 0);
}

/** The status a buyer sees. Read from the order, so it can't drift from it. */
export function buyerStatus(
  mo: {
    state: MarketOrderState;
    depositRequiredFcfa: number;
    depositExpiredAt: Date | null;
  },
  order: { status: OrderStatus; depositFcfa: number } | null,
): MarketBuyerStatus {
  switch (mo.state) {
    case MarketOrderState.REQUESTED:
      return MarketBuyerStatus.PENDING;
    case MarketOrderState.REJECTED:
      return MarketBuyerStatus.REJECTED;
    case MarketOrderState.WITHDRAWN:
      return MarketBuyerStatus.WITHDRAWN;
    case MarketOrderState.EXPIRED:
      return MarketBuyerStatus.REQUEST_EXPIRED;
    case MarketOrderState.ACCEPTED:
      break;
  }
  if (!order) return MarketBuyerStatus.CANCELLED;
  if (order.status === OrderStatus.CANCELLED) {
    return mo.depositExpiredAt
      ? MarketBuyerStatus.DEPOSIT_EXPIRED
      : MarketBuyerStatus.CANCELLED;
  }
  if (order.status === OrderStatus.LIVRE) return MarketBuyerStatus.DELIVERED;
  if (mo.depositRequiredFcfa > 0 && order.depositFcfa === 0) {
    return MarketBuyerStatus.AWAITING_DEPOSIT;
  }
  return MarketBuyerStatus.CONFIRMED;
}

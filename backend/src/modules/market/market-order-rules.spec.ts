import { describe, expect, it } from 'vitest';
import {
  MarketBuyerStatus,
  MarketOrderState,
} from '../../common/enums/market.enum.js';
import { OrderStatus } from '../../common/enums/order-status.enum.js';
import { buyerStatus, depositRequired } from './market-order-rules.js';

describe('depositRequired', () => {
  it('is zero without a deposit', () => {
    expect(depositRequired(10, 3000, null)).toBe(0);
  });

  it('rounds up to whole FCFA', () => {
    expect(depositRequired(1, 3333, 30)).toBe(1000);
    expect(depositRequired(10, 3000, 30)).toBe(9000);
  });
});

describe('buyerStatus', () => {
  const accepted = {
    state: MarketOrderState.ACCEPTED,
    depositRequiredFcfa: 9000,
    depositExpiredAt: null,
    cancelRequestedAt: null,
  };
  const open = { status: OrderStatus.PENDING, depositFcfa: 0 };

  it.each([
    [MarketOrderState.REQUESTED, MarketBuyerStatus.PENDING],
    [MarketOrderState.REJECTED, MarketBuyerStatus.REJECTED],
    [MarketOrderState.WITHDRAWN, MarketBuyerStatus.WITHDRAWN],
    [MarketOrderState.EXPIRED, MarketBuyerStatus.REQUEST_EXPIRED],
  ])('maps %s without an order', (state, expected) => {
    expect(buyerStatus({ ...accepted, state }, null)).toBe(expected);
  });

  it('waits for a deposit until any amount is recorded', () => {
    expect(buyerStatus(accepted, open)).toBe(MarketBuyerStatus.AWAITING_DEPOSIT);
    expect(
      buyerStatus(accepted, { status: OrderStatus.CONFIRMED, depositFcfa: 100 }),
    ).toBe(MarketBuyerStatus.CONFIRMED);
  });

  it('confirms at once when no deposit is asked', () => {
    expect(buyerStatus({ ...accepted, depositRequiredFcfa: 0 }, open)).toBe(
      MarketBuyerStatus.CONFIRMED,
    );
  });

  it('follows delivery and cancellation', () => {
    expect(
      buyerStatus(accepted, { status: OrderStatus.LIVRE, depositFcfa: 0 }),
    ).toBe(MarketBuyerStatus.DELIVERED);
    expect(
      buyerStatus(accepted, { status: OrderStatus.CANCELLED, depositFcfa: 0 }),
    ).toBe(MarketBuyerStatus.CANCELLED);
  });

  it('tells an expired deposit from a cancellation', () => {
    expect(
      buyerStatus(
        { ...accepted, depositExpiredAt: new Date() },
        { status: OrderStatus.CANCELLED, depositFcfa: 0 },
      ),
    ).toBe(MarketBuyerStatus.DEPOSIT_EXPIRED);
  });

  it('shows a cancellation request until the farm acts', () => {
    const asked = { ...accepted, cancelRequestedAt: new Date() };
    expect(
      buyerStatus(asked, { status: OrderStatus.CONFIRMED, depositFcfa: 9000 }),
    ).toBe(MarketBuyerStatus.CANCEL_REQUESTED);
    expect(
      buyerStatus(asked, { status: OrderStatus.CANCELLED, depositFcfa: 9000 }),
    ).toBe(MarketBuyerStatus.CANCELLED);
    expect(
      buyerStatus(asked, { status: OrderStatus.LIVRE, depositFcfa: 9000 }),
    ).toBe(MarketBuyerStatus.DELIVERED);
  });

  it('treats a deleted order as cancelled', () => {
    expect(buyerStatus(accepted, null)).toBe(MarketBuyerStatus.CANCELLED);
  });
});

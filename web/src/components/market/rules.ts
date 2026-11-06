import type { MarketFulfilment, MarketProduct } from '../../api/types-market';

/** Same rule as the server's depositRequired: the delivery fee isn't part of the deposit. */
export function depositFor(quantity: number, unitPriceFcfa: number, depositPct: number | null): number {
  if (!depositPct) return 0;
  return Math.ceil((quantity * unitPriceFcfa * depositPct) / 100);
}

export function orderTotal(
  quantity: number,
  unitPriceFcfa: number,
  fulfilment: MarketFulfilment,
  deliveryFeeFcfa: number,
): number {
  return quantity * unitPriceFcfa + (fulfilment === 'DELIVERY' ? deliveryFeeFcfa : 0);
}

export function unitName(product: MarketProduct, quantity = 1): string {
  const plural = quantity > 1 ? 's' : '';
  if (product === 'EGGS') return `alvéole${plural}`;
  if (product === 'CARCASS') return `carcasse${plural}`;
  return quantity > 1 ? 'oiseaux' : 'oiseau';
}

/** Time left before a deadline, in the largest units that matter. Null once it has passed. */
export function timeLeft(deadlineIso: string, now: number): string | null {
  const ms = new Date(deadlineIso).getTime() - now;
  if (ms <= 0) return null;
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${String(minutes % 60).padStart(2, '0')}`;
  return `${Math.floor(hours / 24)} jours`;
}

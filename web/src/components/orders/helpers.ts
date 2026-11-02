import type { QueryClient } from '@tanstack/react-query';

export const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmée',
  LIVRE: 'Livrée',
  CANCELLED: 'Annulée',
};

export const ORDER_CANAL_LABEL: Record<string, string> = {
  FERME: 'Retrait ferme',
  PRECOMMANDE: 'Précommande',
  LIVRAISON: 'Livraison',
};

export const UNIT_LABEL: Record<string, string> = {
  PIECE: 'pièce(s)',
  KG: 'kg',
  ALVEOLES: 'alvéole(s)',
  SAC: 'sac(s)',
};

export const PRODUCT_LABEL: Record<string, string> = {
  POULET_PIECE: 'Poulet à la pièce',
  POULET_KG: 'Poulet au kilo',
  ABATTU_PIECE: 'Abattu à la pièce',
  ABATTU_KG: 'Abattu au kilo',
  OEUFS: 'Œufs (alvéoles)',
};

export const DEFAULT_AVG_WEIGHT_KG = 1.8;

/** Local date (YYYY-MM-DD): toISOString() would shift by one day around midnight. */
export function localDateIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Lets the server answer a repeated submit with the row it already created. */
export function newIdempotencyKey(prefix: string): string {
  return `web-${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

/** Parses a whole number of FCFA or units from a text field: 0 when empty. */
export function parseWhole(text: string): number {
  const n = parseInt(text.replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

const ORDER_QUERY_ROOTS = ['orders', 'order', 'sales', 'batches', 'dashboard', 'caisse-current', 'customers'];

/** An order touches the cash desk, the flock, the customer balance and the dashboard. */
export function invalidateOrderQueries(client: QueryClient, farmId: string | null): void {
  for (const root of ORDER_QUERY_ROOTS) {
    void client.invalidateQueries({ queryKey: [root, farmId] });
  }
}

const TRANSFER_QUERY_ROOTS = ['stock-transfers', 'batches', 'slaughter', 'slaughter-orders', 'feed-stock', 'dashboard'];

/** A transfer moves stock out of its source (carcasses, eggs or feed). */
export function invalidateTransferQueries(client: QueryClient, farmId: string | null): void {
  for (const root of TRANSFER_QUERY_ROOTS) {
    void client.invalidateQueries({ queryKey: [root, farmId] });
  }
}

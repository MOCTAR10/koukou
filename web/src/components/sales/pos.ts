import type { QueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { CashSession } from '../../api/types';
import type {
  CaisseSummary,
  PointOfSaleKind,
  PromotionFull,
  StockTransfer,
} from '../../api/types-sales';

export type PosProduct = 'PIECE' | 'KG' | 'ABATTU_PIECE' | 'ABATTU_KG' | 'OEUF' | 'PROVENDE' | 'RECOLTE' | 'AUTRE';

export interface PosProductDef {
  key: PosProduct;
  label: string;
  priceUnit: string;
  unitPrice: number;
}

/** Suggested prices per point of sale kind, as on the mobile register. */
const CATALOG: Record<PointOfSaleKind, PosProductDef[]> = {
  FERME: [
    { key: 'PIECE', label: 'Sur pied (pièce)', priceUnit: 'pièce', unitPrice: 2500 },
    { key: 'KG', label: 'Sur pied (kg)', priceUnit: 'kg', unitPrice: 2200 },
    { key: 'ABATTU_PIECE', label: 'Abattu (pièce)', priceUnit: 'pièce', unitPrice: 2900 },
    { key: 'ABATTU_KG', label: 'Abattu (kg)', priceUnit: 'kg', unitPrice: 2550 },
    { key: 'OEUF', label: 'Œufs (alvéole)', priceUnit: 'alvéole', unitPrice: 2500 },
    { key: 'PROVENDE', label: 'Provende', priceUnit: 'sac', unitPrice: 4500 },
    { key: 'RECOLTE', label: 'Récolte (parcelle)', priceUnit: 'unité', unitPrice: 0 },
    { key: 'AUTRE', label: 'Autre', priceUnit: 'unité', unitPrice: 1000 },
  ],
  BOUTIQUE: [
    { key: 'ABATTU_PIECE', label: 'Abattu (pièce)', priceUnit: 'pièce', unitPrice: 3200 },
    { key: 'ABATTU_KG', label: 'Abattu (kg)', priceUnit: 'kg', unitPrice: 2800 },
    { key: 'OEUF', label: 'Œufs (alvéole)', priceUnit: 'alvéole', unitPrice: 3000 },
    { key: 'PROVENDE', label: 'Provende', priceUnit: 'sac', unitPrice: 4500 },
  ],
};

export function posCatalog(kind: PointOfSaleKind): PosProductDef[] {
  return CATALOG[kind];
}

export function productMeta(kind: PointOfSaleKind, key: PosProduct): PosProductDef {
  const list = CATALOG[kind];
  return list.find((p) => p.key === key) ?? list[0]!;
}

export interface PosLine {
  uid: string;
  product: PosProduct;
  /** What is sold, for the basket and the receipt. */
  label: string;
  /** Where it comes from (lot, order, reserve, parcel…), for the basket. */
  sourceLabel: string;
  batchId?: string;
  slaughterOrderId?: string;
  transferId?: string;
  inputLotId?: string;
  parcelleId?: string;
  unit?: 'SAC' | 'KG' | 'PIECE';
  /** Pieces, alvéoles, sacks… For the per-kg products: the number of birds. */
  qty: number;
  /** Real weight for the per-kg products: base of the amount. */
  weightKg?: number;
  unitPriceFcfa: number;
}

export function isKgProduct(p: PosProduct): boolean {
  return p === 'KG' || p === 'ABATTU_KG';
}

export function isAbattu(p: PosProduct): boolean {
  return p === 'ABATTU_PIECE' || p === 'ABATTU_KG';
}

/** Same rounding as the backend (per line, integer FCFA). */
export function lineAmount(line: Pick<PosLine, 'product' | 'qty' | 'weightKg' | 'unitPriceFcfa'>): number {
  const base = isKgProduct(line.product) ? (line.weightKg ?? 0) : line.qty;
  return Math.round(base * line.unitPriceFcfa);
}

export function subtotalOf(lines: PosLine[]): number {
  return lines.reduce((sum, l) => sum + lineAmount(l), 0);
}

export function findPromotion(
  promotions: PromotionFull[],
  code: string,
  subtotal: number,
  customerId: string | null,
  today: string,
): PromotionFull | null {
  const c = code.trim().toUpperCase();
  if (!c) return null;
  const p = promotions.find(
    (x) =>
      x.code === c &&
      x.active &&
      (x.startDate == null || x.startDate <= today) &&
      (x.endDate == null || x.endDate >= today),
  );
  if (!p) return null;
  if (p.minSubtotalFcfa != null && subtotal < p.minSubtotalFcfa) return null;
  if (p.customerId && p.customerId !== customerId) return null;
  return p;
}

/** Same rule as the server, so the cash collected equals the net total. */
export function discountFor(p: PromotionFull, subtotal: number): number {
  return p.type === 'PCT'
    ? Math.min(Math.round((subtotal * Math.min(p.value, 100)) / 100), subtotal)
    : Math.min(p.value, subtotal);
}

export function buildSaleItem(line: PosLine): Record<string, unknown> {
  const base = { label: line.label, unitPriceFcfa: line.unitPriceFcfa };
  const batchId = line.batchId ? { batchId: line.batchId } : {};
  const transfer = line.transferId ? { stockTransferId: line.transferId } : {};
  const carcass = {
    ...(line.slaughterOrderId ? { sourceSlaughterOrderId: line.slaughterOrderId } : {}),
    ...transfer,
  };
  switch (line.product) {
    case 'PIECE':
      return { ...base, ...batchId, productType: 'POULET_PIECE', unit: 'PIECE', quantity: line.qty };
    case 'KG':
      return { ...base, ...batchId, productType: 'POULET_KG', unit: 'KG', quantity: line.weightKg, pieceCount: line.qty };
    case 'ABATTU_PIECE':
      return { ...base, ...batchId, ...carcass, productType: 'ABATTU_PIECE', unit: 'PIECE', quantity: line.qty };
    case 'ABATTU_KG':
      return { ...base, ...batchId, ...carcass, productType: 'ABATTU_KG', unit: 'KG', quantity: line.weightKg, pieceCount: line.qty };
    case 'OEUF':
      return { ...base, ...batchId, ...transfer, productType: 'OEUFS', unit: 'ALVEOLES', quantity: line.qty };
    case 'PROVENDE':
      return {
        ...base,
        ...transfer,
        productType: 'PROVENDE',
        unit: line.unit === 'KG' ? 'KG' : 'SAC',
        quantity: line.qty,
        ...(line.inputLotId ? { inputLotId: line.inputLotId } : {}),
      };
    case 'RECOLTE':
      return { ...base, productType: 'RECOLTE', unit: line.unit, quantity: line.qty, parcelleId: line.parcelleId };
    default:
      return { ...base, productType: 'AUTRE', unit: 'UNITE', quantity: line.qty };
  }
}

export function transferRemaining(t: Pick<StockTransfer, 'quantity' | 'quantitySold'>): number {
  return Math.max(t.quantity - t.quantitySold, 0);
}

export function transferUnitLabel(t: Pick<StockTransfer, 'productType' | 'unit'>): string {
  if (t.productType === 'OEUFS') return 'alvéole(s)';
  if (t.productType === 'PROVENDE') return t.unit === 'KG' ? 'kg' : 'sac(s)';
  return 'carcasse(s)';
}

export function transferTitle(t: StockTransfer): string {
  if (t.productType === 'PROVENDE') return t.inputLot?.productName ?? 'Provende';
  return t.slaughterOrder?.batch?.batchName ?? t.batch?.batchName ?? 'Lot';
}

/** "2 alvéoles", "1 alvéole + 5 œufs", "moins d'une alvéole". */
export function formatEggAlveoles(eggCount: number): string {
  if (eggCount <= 0) return '0';
  const alv = Math.floor(eggCount / 30);
  const rem = eggCount % 30;
  if (alv === 0) return 'moins d’une alvéole';
  const a = `${alv.toLocaleString('fr-FR')} alvéole${alv > 1 ? 's' : ''}`;
  return rem === 0 ? a : `${a} + ${rem} œufs`;
}

export function lastClosingOf(sessions: CashSession[] | undefined): number | null {
  return sessions?.find((s) => s.closingBalanceFcfa != null)?.closingBalanceFcfa ?? null;
}

/**
 * Opens the caisse if none is open, as mobile does before collecting cash. It
 * starts from the last declared closing, never 0: the server books only the
 * change from it, so 0 would post the whole float as a withdrawal.
 */
export async function ensureCashOpen(farmId: string): Promise<void> {
  const current = await api.get<CaisseSummary | null>(`/farms/${farmId}/caisse/current`);
  if (current) return;
  const sessions = await api.get<CashSession[]>(`/farms/${farmId}/caisse/sessions`);
  await api.post(`/farms/${farmId}/caisse/open`, { openingBalanceFcfa: lastClosingOf(sessions) ?? 0 });
}

/** A sale or a payment moves the stock, the cash, the balances and the overview. */
export function invalidateCash(queryClient: QueryClient, farmId: string | null): void {
  const keys = [
    'sales',
    'batches',
    'dashboard',
    'caisse-current',
    'caisse-sessions',
    'feed-stock',
    'customers',
    'customers-summary',
    'customer-stats',
    'customer-history',
    'stock-transfers',
    'slaughter',
    'recoltes-stock',
    'advisory',
    'rentabilite',
  ];
  keys.forEach((k) => void queryClient.invalidateQueries({ queryKey: [k, farmId] }));
}

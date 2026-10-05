import { buildSaleItem, todayStr, type SaleItemPayload } from '@/api/mutations';
import { fmt } from '@/constants/theme';
import type { Promotion } from '@/api/types';

import type { PosLine, PosTotals } from './types';

/** Formatage œufs → alvéoles : "2 alvéoles", "1 alvéole + 5 œufs",
 *  "moins d'une alvéole" (reliquat < 30 œufs encore visible). */
export function formatEggAlveoles(eggCount: number): string {
  if (eggCount <= 0) return '0';
  const alv = Math.floor(eggCount / 30);
  const rem = eggCount % 30;
  if (alv === 0) return "moins d'une alvéole";
  if (rem === 0) return `${fmt(alv)} alvéole${alv > 1 ? 's' : ''}`;
  return `${fmt(alv)} alvéole${alv > 1 ? 's' : ''} + ${fmt(rem)} œufs`;
}

export function lineAmount(line: PosLine): number {
  if (line.product === 'KG' || line.product === 'ABATTU_KG') {
    return Math.round((line.weightKg ?? 0) * line.unitPriceFcfa);
  }
  return line.qty * line.unitPriceFcfa;
}

export function subtotal(lines: PosLine[]): number {
  return lines.reduce((acc, l) => acc + lineAmount(l), 0);
}

export function findPromotion(codes: Promotion[], code: string, sub: number): Promotion | null {
  const c = code.trim().toUpperCase();
  if (!c) return null;
  const p = codes.find(
    (promo) =>
      promo.code === c &&
      promo.active &&
      (promo.endDate == null || promo.endDate >= todayStr()) &&
      (promo.startDate == null || promo.startDate <= todayStr()),
  );
  if (!p) return null;
  if (p.minSubtotalFcfa != null && sub < p.minSubtotalFcfa) return null;
  return p;
}

export function discountFor(p: Promotion, sub: number): number {
  if (p.type === 'PCT') return Math.round((sub * p.value) / 100);
  return Math.min(p.value, sub);
}

export function totalsFor(lines: PosLine[], promo: Promotion | null): PosTotals {
  const sub = subtotal(lines);
  const discount = promo ? discountFor(promo, sub) : 0;
  return { subtotalFcfa: sub, discountFcfa: discount, totalFcfa: sub - discount };
}

export function buildPosSaleItems(lines: PosLine[]): SaleItemPayload[] {
  const items: SaleItemPayload[] = [];
  for (const line of lines) {
    const built = buildSaleItem(line.product, line.qty, line.unitPriceFcfa, line.batchId ?? null, {
      ...(line.weightKg != null ? { weightKg: line.weightKg } : {}),
      ...(line.slaughterOrderId ? { sourceSlaughterOrderId: line.slaughterOrderId } : {}),
      ...(line.transferId ? { stockTransferId: line.transferId } : {}),
      ...(line.unit ? { unit: line.unit } : {}),
    });
    if ('item' in built) {
      items.push(built.item);
    } else {
      throw new Error(built.error);
    }
  }
  return items;
}
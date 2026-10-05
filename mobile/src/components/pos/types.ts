import type { PosProduct } from '@/api/mutations';
import type { BatchWithMetrics, SlaughterOrder } from '@/api/types';

export interface PosLine {
  uid: string;
  product: PosProduct;
  batchId?: string;
  slaughterOrderId?: string;
  /** Réserve d'un transfert ferme → boutique (source ABATTU/OEUFS/PROVENDE en boutique). */
  transferId?: string;
  /** Unité de vente retenue (PROVENDE : 'SAC' | 'KG'). */
  unit?: 'SAC' | 'KG';
  qty: number;
  unitPriceFcfa: number;
  label: string;
}

export interface PosContext {
  lots: BatchWithMetrics[];
  pools: SlaughterOrder[];
}

export interface PosTotals {
  subtotalFcfa: number;
  discountFcfa: number;
  totalFcfa: number;
}

let lineCounter = 0;

export function newLineUid(): string {
  lineCounter += 1;
  return `pos-line-${Date.now()}-${lineCounter}`;
}
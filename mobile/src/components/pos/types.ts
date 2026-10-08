import type { PosProduct } from '@/api/mutations';
import type { BatchWithMetrics, SlaughterOrder } from '@/api/types';

export interface PosLine {
  uid: string;
  product: PosProduct;
  batchId?: string;
  slaughterOrderId?: string;
  /** Réserve d'un transfert ferme → boutique (source ABATTU/OEUFS/PROVENDE en boutique). */
  transferId?: string;
  /** Unité de vente retenue (PROVENDE : 'SAC' | 'KG', RECOLTE : 'KG' | 'PIECE' | 'SAC'). */
  unit?: 'SAC' | 'KG' | 'PIECE';
  /** Parcelle source d'une vente RECOLTE au point de vente Ferme. */
  parcelleId?: string;
  qty: number;
  unitPriceFcfa: number;
  label: string;
  /** Poids réel saisi (kg) pour POULET_KG / ABATTU_KG — base de calcul du montant. */
  weightKg?: number;
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
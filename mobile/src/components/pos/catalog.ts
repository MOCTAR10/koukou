import type { PosProduct } from '@/api/mutations';
import type { PointOfSaleKind } from '@/api/types';

export interface PosProductDef {
  key: PosProduct;
  label: string;
  unit: string;
  priceUnit: string;
  unitPrice: number;
  kind?: 'CHAIR' | 'PONDEUSE';
}

/**
 * Catalogue produit et prix conseillés par type de point de vente :
 * - FERME (poulailler) : volaille sur pied, œufs, carcasses fraîches de
 *   l'abattoir — au « prix de gros ».
 * - BOUTIQUE (externe) : carcasses transférées depuis la ferme + œufs, vendus
 *   au détail (marge boutique). Pas de volaille vivante en boutique.
 */
const CATALOG: Record<PointOfSaleKind, PosProductDef[]> = {
  FERME: [
    { key: 'PIECE', label: 'Sur pied (pièce)', unit: 'pcs', priceUnit: 'pièce', unitPrice: 2500, kind: 'CHAIR' },
    { key: 'KG', label: 'Sur pied (kg)', unit: 'oiseaux', priceUnit: 'kg', unitPrice: 2200, kind: 'CHAIR' },
    { key: 'ABATTU_PIECE', label: 'Abattu (pièce)', unit: 'pcs', priceUnit: 'pièce', unitPrice: 2900, kind: 'CHAIR' },
    { key: 'ABATTU_KG', label: 'Abattu (kg)', unit: 'oiseaux', priceUnit: 'kg', unitPrice: 2550, kind: 'CHAIR' },
    { key: 'OEUF', label: 'Œufs (alvéole)', unit: 'alv.', priceUnit: 'alvéole', unitPrice: 2500, kind: 'PONDEUSE' },
    { key: 'AUTRE', label: 'Autre', unit: 'u', priceUnit: 'unité', unitPrice: 1000 },
  ],
  BOUTIQUE: [
    { key: 'ABATTU_PIECE', label: 'Abattu (pièce)', unit: 'pcs', priceUnit: 'pièce', unitPrice: 3200, kind: 'CHAIR' },
    { key: 'ABATTU_KG', label: 'Abattu (kg)', unit: 'oiseaux', priceUnit: 'kg', unitPrice: 2800, kind: 'CHAIR' },
    { key: 'OEUF', label: 'Œufs (alvéole)', unit: 'alv.', priceUnit: 'alvéole', unitPrice: 3000, kind: 'PONDEUSE' },
    { key: 'PROVENDE', label: 'Provende', unit: 'sac', priceUnit: 'sac', unitPrice: 4500 },
    { key: 'AUTRE', label: 'Autre', unit: 'u', priceUnit: 'unité', unitPrice: 1000 },
  ],
};

export function posCatalog(kind?: PointOfSaleKind): PosProductDef[] {
  return CATALOG[kind ?? 'FERME'];
}

export function productMeta(
  kind: PointOfSaleKind | undefined,
  key: PosProduct,
): PosProductDef {
  const list = posCatalog(kind);
  return list.find((p) => p.key === key) ?? list[0];
}

/** Reste exploitable d'un transfert de carcasses (pièces non vendues). */
export function transferRemaining(quantity: number, quantitySold: number): number {
  return Math.max(quantity - quantitySold, 0);
}
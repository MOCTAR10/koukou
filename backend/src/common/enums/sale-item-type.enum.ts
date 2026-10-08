export enum SaleItemProductType {
  POULET_PIECE = 'POULET_PIECE',
  POULET_KG = 'POULET_KG',
  /** Volaille abattue (carcasse) vendue à la pièce — cull directe ou pool abattoir. */
  ABATTU_PIECE = 'ABATTU_PIECE',
  /** Volaille abattue (carcasse) vendue au kilo — cull directe ou pool abattoir. */
  ABATTU_KG = 'ABATTU_KG',
  OEUFS = 'OEUFS',
  PROVENDE = 'PROVENDE',
  /** Récolte agricole vendue au point de vente Ferme (stock rattaché à une parcelle). */
  RECOLTE = 'RECOLTE',
  AUTRE = 'AUTRE',
}

export enum SaleItemUnit {
  PIECE = 'PIECE',
  KG = 'KG',
  ALVEOLES = 'ALVEOLES',
  UNITE = 'UNITE',
  SAC = 'SAC',
}
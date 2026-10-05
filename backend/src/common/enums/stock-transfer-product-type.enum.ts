export enum StockTransferProductType {
  /** Carcasses (pool d'abattage) déplacées vers un point de vente. */
  ABATTU = 'ABATTU',
  /** Œufs (alvéoles) réservés depuis le stock dérivé d'un lot. */
  OEUFS = 'OEUFS',
  /** Provende (sacs/kg) sortie d'un lot d'intrant alimentaire. */
  PROVENDE = 'PROVENDE',
}
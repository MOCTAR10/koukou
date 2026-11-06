export enum MarketListingKind {
  /** On sale today. */
  NOW = 'NOW',
  /** Birds that will be ready on a future date. */
  PRE = 'PRE',
}

export enum MarketProduct {
  /** Live birds, per piece. */
  BIRDS = 'BIRDS',
  /** Eggs, per tray (alvéole). */
  EGGS = 'EGGS',
}

export enum MarketListingStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  PAUSED = 'PAUSED',
  CLOSED = 'CLOSED',
}

/** Why a listing isn't in the public catalogue. */
export enum MarketHiddenReason {
  NOT_PUBLISHED = 'NOT_PUBLISHED',
  FARM_SUSPENDED = 'FARM_SUSPENDED',
  FARM_NOT_VERIFIED = 'FARM_NOT_VERIFIED',
  LOT_ENDED = 'LOT_ENDED',
  SANITARY = 'SANITARY',
  DATE_PASSED = 'DATE_PASSED',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
}

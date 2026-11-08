import type { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import type { Farm } from '../farms/entities/farm.entity.js';
import type { OfficialIndicator } from './official-indicators.js';

/**
 * The official indicators of a band, for modules the bands module itself
 * imports (slaughter passport, lot P&L PDF): they resolve it lazily through
 * `ModuleRef.get(OFFICIAL_BAND_INDICATORS, { strict: false })`, so there is
 * no module or file cycle. Bound to `BandeIndicatorsService` in BandesModule.
 */
export const OFFICIAL_BAND_INDICATORS = 'OFFICIAL_BAND_INDICATORS';

export interface OfficialBandIndicatorsPort {
  compute(
    farm: Farm,
    batch: ProductionBatch,
  ): Promise<{ asOf: string; indicators: OfficialIndicator[] }>;
}

/**
 * Official production cost per kg of a band (charges / live weight produced,
 * the bilan formula `cout_production_kg`), for BatchesService: live for an
 * open band, from the frozen closure bilan for a closed one. Bound to
 * `BandeSnapshotsService` in BandesModule, resolved lazily like the port above.
 */
export const BAND_PRODUCTION_COST = 'BAND_PRODUCTION_COST';

export type ProductionCostReason =
  /** Charges recorded but no live weight produced yet (no weighing / no output). */
  | 'NO_WEIGHT_PRODUCED'
  /** No charge recorded on the band. */
  | 'NO_CHARGES'
  /** The caller may not read economic data. */
  | 'RESTRICTED'
  /** The bilan could not be computed. */
  | 'NOT_COMPUTABLE';

export interface LotProductionCost {
  /** FCFA per kg of live weight produced; null with a reason when undefined. */
  coutProductionKg: number | null;
  coutProductionReason: ProductionCostReason | null;
  /** BILAN: closure snapshot; EN_COURS: computed live; null when unavailable. */
  coutProductionSource: 'BILAN' | 'EN_COURS' | null;
}

export interface BandProductionCostPort {
  productionCost(
    farm: Farm,
    batch: ProductionBatch,
    mayWrite: boolean,
  ): Promise<LotProductionCost>;
}

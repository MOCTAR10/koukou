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

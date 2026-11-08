import type {
  LotProductionCost,
  ProductionCostReason,
} from '../indicators/official-band-indicators.port.js';
import type { BandSummary } from './band-summary.js';

/** Answer for a caller that may not read economic data. */
export const RESTRICTED_COST: LotProductionCost = {
  coutProductionKg: null,
  coutProductionReason: 'RESTRICTED',
  coutProductionSource: null,
};

export function unavailableCost(
  reason: ProductionCostReason,
): LotProductionCost {
  return {
    coutProductionKg: null,
    coutProductionReason: reason,
    coutProductionSource: null,
  };
}

/**
 * Official `cout_production_kg` of a band summary (closure bilan or live),
 * rounded to 2 decimals like the bilan; null with a reason code otherwise.
 * Pure.
 */
export function productionCostOf(
  summary: BandSummary | null,
): LotProductionCost {
  if (!summary) return unavailableCost('NOT_COMPUTABLE');
  const value =
    summary.indicators.find((i) => i.key === 'cout_production_kg')?.value ??
    null;
  if (value != null && Number.isFinite(value)) {
    return {
      coutProductionKg: Math.round(value * 100) / 100,
      coutProductionReason: null,
      coutProductionSource: summary.source,
    };
  }
  return {
    coutProductionKg: null,
    coutProductionReason:
      summary.chargesFcfa == null || summary.chargesFcfa <= 0
        ? 'NO_CHARGES'
        : 'NO_WEIGHT_PRODUCED',
    coutProductionSource: summary.source,
  };
}

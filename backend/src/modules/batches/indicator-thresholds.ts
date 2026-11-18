import { ReferenceKey } from '../../common/enums/reference-key.enum.js';

/**
 * Thresholds the clients colour the farm indicators with. Every value comes
 * from `reference_constants` (managed by the admin / owner profile in
 * PARAMETRES); the fallbacks below are the seeded defaults.
 */
export interface IndicatorThresholds {
  /** FCR above this value is red when the breed has no curve (kg/kg). */
  fcrAbsoluteWarn: number;
  /** FCR gap vs the breed curve above this (%) is red. */
  fcrDeviationWarnPct: number;
  /** FCR gap vs the breed curve below minus this (%) is green. */
  fcrDeviationGoodPct: number;
  /** Lay-rate gap below minus this (%) is amber. */
  layRateDeviationWarnPct: number;
  mortalityWarnPct: number;
  mortalityCriticalPct: number;
  waterDropWarnPct: number;
  waterDropCriticalPct: number;
  /** Expected water/feed ratio band on a daily entry (L per kg of feed). */
  waterFeedRatioMin: number;
  waterFeedRatioMax: number;
}

export const INDICATOR_THRESHOLD_KEYS: ReferenceKey[] = [
  ReferenceKey.FCR_ABSOLUTE_WARN,
  ReferenceKey.FCR_DEVIATION_WARN_PCT,
  ReferenceKey.FCR_DEVIATION_GOOD_PCT,
  ReferenceKey.LAY_RATE_DEVIATION_WARN_PCT,
  ReferenceKey.MORTALITY_WARN_PCT,
  ReferenceKey.MORTALITY_CRITICAL_PCT,
  ReferenceKey.WATER_DROP_WARN_PCT,
  ReferenceKey.WATER_DROP_CRITICAL_PCT,
  ReferenceKey.WATER_FEED_RATIO_MIN,
  ReferenceKey.WATER_FEED_RATIO_MAX,
];

/** Pure: stored constants (by key) to the thresholds block, seeded defaults. */
export function indicatorThresholds(
  byKey: Readonly<Record<string, number>>,
): IndicatorThresholds {
  return {
    fcrAbsoluteWarn: byKey[ReferenceKey.FCR_ABSOLUTE_WARN] ?? 2.2,
    fcrDeviationWarnPct: byKey[ReferenceKey.FCR_DEVIATION_WARN_PCT] ?? 10,
    fcrDeviationGoodPct: byKey[ReferenceKey.FCR_DEVIATION_GOOD_PCT] ?? 5,
    layRateDeviationWarnPct:
      byKey[ReferenceKey.LAY_RATE_DEVIATION_WARN_PCT] ?? 10,
    mortalityWarnPct: byKey[ReferenceKey.MORTALITY_WARN_PCT] ?? 1,
    mortalityCriticalPct: byKey[ReferenceKey.MORTALITY_CRITICAL_PCT] ?? 5,
    waterDropWarnPct: byKey[ReferenceKey.WATER_DROP_WARN_PCT] ?? 10,
    waterDropCriticalPct: byKey[ReferenceKey.WATER_DROP_CRITICAL_PCT] ?? 25,
    waterFeedRatioMin: byKey[ReferenceKey.WATER_FEED_RATIO_MIN] ?? 1.8,
    waterFeedRatioMax: byKey[ReferenceKey.WATER_FEED_RATIO_MAX] ?? 2.6,
  };
}

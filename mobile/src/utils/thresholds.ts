import type { IndicatorThresholds } from '@/api/types';

/**
 * Display thresholds of the indicators. The values come from the server
 * (`GET /farms/:id/dashboard` → `thresholds`, managed by the admin in the
 * reference constants); these defaults are only the seeded values, used until
 * the first answer or from an older server. Never edit one here without the
 * matching seed in the backend.
 */
export const DEFAULT_THRESHOLDS: IndicatorThresholds = {
  fcrAbsoluteWarn: 2.2,
  fcrDeviationWarnPct: 10,
  fcrDeviationGoodPct: 5,
  layRateDeviationWarnPct: 10,
  mortalityWarnPct: 1,
  mortalityCriticalPct: 5,
  waterDropWarnPct: 10,
  waterDropCriticalPct: 25,
};

export function thresholdsOf(t: IndicatorThresholds | null | undefined): IndicatorThresholds {
  return { ...DEFAULT_THRESHOLDS, ...(t ?? {}) };
}

export type Tone = 'red' | 'amber' | 'green' | 'default';

/** Tone of the farm FCR tile: the breed deviation decides, else the absolute FCR. */
export function fcrTileTone(fcr: number | null | undefined, deviationPct: number | null | undefined, t: IndicatorThresholds): Tone {
  if (fcr == null) return 'default';
  if (deviationPct != null) {
    if (deviationPct > t.fcrDeviationWarnPct) return 'red';
    return deviationPct <= -t.fcrDeviationGoodPct ? 'green' : 'default';
  }
  return fcr > t.fcrAbsoluteWarn ? 'red' : 'default';
}

/** Tone of the « Breed Intel » tile: FCR deviation first, else the lay-rate deviation. */
export function breedTone(fcrDeviationPct: number | null | undefined, layRateDeviationPct: number | null | undefined, t: IndicatorThresholds): Tone {
  if (fcrDeviationPct != null) {
    if (fcrDeviationPct > t.fcrDeviationWarnPct) return 'red';
    return fcrDeviationPct < -t.fcrDeviationGoodPct ? 'green' : 'amber';
  }
  if (layRateDeviationPct != null) return layRateDeviationPct < -t.layRateDeviationWarnPct ? 'amber' : 'green';
  return 'default';
}

export type WaterDropLevel = 'critical' | 'warn' | 'rising' | 'stable' | 'unknown';

/** Level of the day's water drop vs yesterday (positive = drop). */
export function waterDropLevel(dropPct: number | null | undefined, t: IndicatorThresholds): WaterDropLevel {
  if (dropPct == null) return 'unknown';
  if (dropPct > t.waterDropCriticalPct) return 'critical';
  if (dropPct > t.waterDropWarnPct) return 'warn';
  return dropPct < -5 ? 'rising' : 'stable';
}

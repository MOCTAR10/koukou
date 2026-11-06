import type { ProductionBatch } from '@/api/types';

/** Cycle shown when a lot carries no reference duration (lots opened before POUFA). */
export const FALLBACK_CYCLE_DAYS = { CHAIR: 84, PONDEUSE: 504 } as const;

export interface BandCycle {
  /** Age of the birds: age at opening (J+x) + days since opening. */
  ageDays: number;
  /** Reference duration of the band (BANDE_DUREE_REFERENCE_J at opening), else the fallback. */
  cycleDays: number;
  remainingDays: number;
  /** 0–100. */
  progressPercent: number;
  /** True when the duration comes from the band itself (programme parameter). */
  fromReference: boolean;
}

/**
 * Where a band stands in its cycle (pure). The reference duration counts from
 * placement, so a band opened at J+x has x days fewer to go (same rule as the
 * backend `expectedEndDate`). `daysSinceOpening` is the metrics `ageDays`,
 * which the backend counts from `integrationDate` only.
 */
export function bandCycle(input: {
  daysSinceOpening: number;
  initialAgeDays?: number | null;
  referenceDurationDays?: number | null;
  type: ProductionBatch['type'];
}): BandCycle {
  const ageDays = Math.max(0, (input.initialAgeDays ?? 0) + Math.max(0, input.daysSinceOpening));
  const reference = input.referenceDurationDays;
  const fromReference = reference != null && reference > 0;
  const cycleDays = fromReference ? reference : FALLBACK_CYCLE_DAYS[input.type];
  return {
    ageDays,
    cycleDays,
    remainingDays: Math.max(0, cycleDays - ageDays),
    progressPercent: Math.min(100, (ageDays / cycleDays) * 100),
    fromReference,
  };
}

/** Text to search a lot by: its name, its POUFA band code and its breed. */
export function lotSearchText(batch: Pick<ProductionBatch, 'batchName' | 'code' | 'breedName'>): string {
  return [batch.batchName, batch.code, batch.breedName].filter(Boolean).join(' ').toLowerCase();
}

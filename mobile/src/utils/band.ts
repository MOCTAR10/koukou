import type { ProductionBatch } from '@/api/types';

/** Cycle shown when a lot carries no reference duration (lots opened before POUFA). */
export const FALLBACK_CYCLE_DAYS = { CHAIR: 84, PONDEUSE: 504 } as const;

/** Highest age at opening the backend accepts (`CreateBatchDto.initialAgeDays`, @Max(365)). */
export const MAX_ARRIVAL_AGE_DAYS = 365;

const DAY_MS = 86_400_000;

function dayMs(isoDay: string): number {
  return Date.parse(`${isoDay.slice(0, 10)}T00:00:00Z`);
}

/** `YYYY-MM-DD` + `n` days (UTC calendar days, like the backend band dates). */
export function addIsoDays(isoDay: string, n: number): string {
  return new Date(dayMs(isoDay) + n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Age of the birds on `day` (pure, same rule as the backend `bande-rules.ts`
 * `ageOn`): age at opening (J+x, 0 for chicks) + days since `integrationDate`.
 * Use it only for a day the server did not compute: the lot metrics and the
 * band sheet already serve `ageDays`.
 */
export function ageOnDay(
  integrationDate: string,
  initialAgeDays: number | null | undefined,
  day: string,
): number {
  return (initialAgeDays ?? 0) + Math.round((dayMs(day) - dayMs(integrationDate)) / DAY_MS);
}

/**
 * Day the birds were at age 0 (J0, backend `ageZeroDay`): the opening date
 * moved back by the age at opening. A protocol step of day N falls on J0 + N.
 */
export function ageZeroDay(integrationDate: string, initialAgeDays: number | null | undefined): string {
  return addIsoDays(integrationDate, -(initialAgeDays ?? 0));
}

/**
 * « Âge à l'arrivée (jours) » typed in the lot creation form: empty = 0
 * (day-old chicks); null when it is not a whole number of days within
 * 0..MAX_ARRIVAL_AGE_DAYS (the backend would refuse it).
 */
export function parseArrivalAgeDays(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  if (!/^\d+$/.test(trimmed)) return null;
  const days = Number(trimmed);
  return days <= MAX_ARRIVAL_AGE_DAYS ? days : null;
}

export interface BandCycle {
  /** Age of the birds (the served `metrics.ageDays`, J+x included). */
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
 * Where a band stands in its cycle (pure). `ageDays` is the served
 * `metrics.ageDays`, which already includes the age at opening (J+x): never
 * add `initialAgeDays` to it. The reference duration counts from placement,
 * so a band opened at J+x has x days fewer to go (same rule as the backend
 * `expectedEndDate`).
 */
export function bandCycle(input: {
  ageDays: number;
  referenceDurationDays?: number | null;
  type: ProductionBatch['type'];
}): BandCycle {
  const ageDays = Math.max(0, input.ageDays);
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

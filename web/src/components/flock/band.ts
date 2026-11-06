import type { BatchType } from '../../api/types';

/**
 * POUFA band opening and age rule (pure), same as the backend
 * `batches/poufa/bande-rules.ts` and mobile `src/utils/band.ts`:
 * age = `initialAgeDays` (J+x at opening, 0 for day-old chicks) + days since
 * `integrationDate` (the opening / arrival day, never back-dated). J0 of the
 * birds = `integrationDate` − `initialAgeDays`; a protocol step of day N falls
 * on J0 + N. For today's age, prefer the served `metrics.ageDays`.
 */

/** Highest age at opening the backend accepts (`CreateBatchDto.initialAgeDays`, @Max(365)). */
export const MAX_ARRIVAL_AGE_DAYS = 365;

const DAY_MS = 86_400_000;

function dayMs(isoDay: string): number {
  return Date.parse(`${isoDay.slice(0, 10)}T00:00:00Z`);
}

/** `YYYY-MM-DD` + `n` calendar days. */
export function addIsoDays(isoDay: string, n: number): string {
  return new Date(dayMs(isoDay) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Age of the birds on `day`: age at opening + days since the opening. */
export function ageOnDay(integrationDate: string, initialAgeDays: number | null | undefined, day: string): number {
  return (initialAgeDays ?? 0) + Math.round((dayMs(day) - dayMs(integrationDate)) / DAY_MS);
}

/** J0 of the birds (backend `ageZeroDay`): the opening day moved back by the age at opening. */
export function ageZeroDay(integrationDate: string, initialAgeDays: number | null | undefined): string {
  return addIsoDays(integrationDate, -(initialAgeDays ?? 0));
}

/**
 * « Âge à l'arrivée (jours) » typed in the lot form: empty = 0 (day-old
 * chicks); null when it is not a whole number of days within
 * 0..MAX_ARRIVAL_AGE_DAYS (the backend would refuse it).
 */
export function parseArrivalAgeDays(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  if (!/^\d+$/.test(trimmed)) return null;
  const days = Number(trimmed);
  return days <= MAX_ARRIVAL_AGE_DAYS ? days : null;
}

export interface BandOpening {
  /** Sent as `integrationDate`: the arrival (opening) day. */
  integrationDate: string;
  /** Sent as `initialAgeDays`: the birds' age on that day (J+x). */
  initialAgeDays: number;
  /** J0 of the birds. */
  ageZeroDay: string;
  /** Age of the birds today (never below the age at opening). */
  ageToday: number;
}

/**
 * Opening of a band in the lot creation form, for a new lot (age 0 for
 * day-old chicks) and a « lot déjà en cours » alike: the feed phase, the care
 * already due and their dates follow the J+x the backend will store.
 */
export function bandOpening(input: { arrivalDay: string; arrivalAgeDays: number; today: string }): BandOpening {
  const initialAgeDays = Math.max(0, Math.trunc(input.arrivalAgeDays));
  return {
    integrationDate: input.arrivalDay.slice(0, 10),
    initialAgeDays,
    ageZeroDay: ageZeroDay(input.arrivalDay, initialAgeDays),
    ageToday: Math.max(initialAgeDays, ageOnDay(input.arrivalDay, initialAgeDays, input.today)),
  };
}

/** Date a protocol step of day `dayFrom` falls on: J0 + dayFrom (may precede the opening). */
export function stepDate(opening: Pick<BandOpening, 'ageZeroDay'>, dayFrom: number): string {
  return addIsoDays(opening.ageZeroDay, dayFrom);
}

/**
 * Age of a lot on a day the server did not compute (a back-dated daily
 * entry): the served `metrics.ageDays` for today, the J+x rule otherwise.
 */
export function lotAgeOn(
  lot: { integrationDate: string; initialAgeDays?: number | null; metrics: { ageDays: number } },
  day: string,
  today: string,
): number {
  if (day.slice(0, 10) === today.slice(0, 10)) return lot.metrics.ageDays;
  return Math.max(0, ageOnDay(lot.integrationDate, lot.initialAgeDays, day));
}

/** Feed phases advised by age (days), as on mobile. */
export const FEED_ADVICE: Record<BatchType, Array<{ label: string; from: number; to: number }>> = {
  CHAIR: [
    { label: 'Poussin (0 à 10 j)', from: 0, to: 10 },
    { label: 'Démarrage (11 à 24 j)', from: 11, to: 24 },
    { label: 'Croissance (25 à 35 j)', from: 25, to: 35 },
    { label: 'Finition (36 j et plus)', from: 36, to: 99999 },
  ],
  PONDEUSE: [
    { label: 'Poussin (0 à 10 j)', from: 0, to: 10 },
    { label: 'Démarrage (11 à 24 j)', from: 11, to: 24 },
    { label: 'Croissance (25 à 112 j)', from: 25, to: 112 },
    { label: 'Pré-ponte (113 à 126 j)', from: 113, to: 126 },
    { label: 'Ponte 1 (127 j et plus)', from: 127, to: 99999 },
  ],
};

export function feedAdviceFor(type: BatchType, ageDays: number): { label: string; from: number; to: number } {
  return FEED_ADVICE[type].find((p) => ageDays >= p.from && ageDays <= p.to) ?? FEED_ADVICE[type][0]!;
}

/** Protocol steps already due at `ageDays` (to tick as done) and the next ones. */
export function splitStepsByAge<S extends { dayFrom: number }>(steps: readonly S[], ageDays: number): { due: S[]; upcoming: S[] } {
  const sorted = [...steps].sort((a, b) => a.dayFrom - b.dayFrom);
  return { due: sorted.filter((s) => s.dayFrom <= ageDays), upcoming: sorted.filter((s) => s.dayFrom > ageDays) };
}

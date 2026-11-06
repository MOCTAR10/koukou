/**
 * Pure rules of the programme steering (POUFA plan §13, CDC 5.4): periods,
 * small-group suppression of aggregates, map colour keys, the projection to
 * the 100 000 t objective and report periods. No I/O, unit-tested.
 */
import { ReportPeriodicity } from '../../common/enums/report.enum.js';
import { isGeoJsonGeometry } from '../../common/geo/geo-geometry.js';
import { addDays, utcDay } from '../batches/poufa/bande-rules.js';
import { daysBetween } from '../batches/flock-performance.js';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Default dashboard period: the last 30 days, today included. */
export const DEFAULT_PERIOD_DAYS = 30;

/** Longest period a dashboard, a map or an export accepts. */
export const MAX_PERIOD_DAYS = 3 * 366;

export interface Period {
  from: string;
  to: string;
}

export type PeriodResult =
  { ok: true; period: Period } | { ok: false; error: string };

export function isDay(value: string): boolean {
  return DAY_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/**
 * Period of a dashboard query: `to` defaults to today, `from` to 29 days
 * before `to`. Refuses malformed dates, an inverted or too long period.
 */
export function resolvePeriod(
  from: string | undefined,
  to: string | undefined,
  today: string = utcDay(),
): PeriodResult {
  const end = to?.trim() || today;
  if (!isDay(end)) {
    return { ok: false, error: 'Date de fin invalide (attendu AAAA-MM-JJ).' };
  }
  const start = from?.trim() || addDays(end, -(DEFAULT_PERIOD_DAYS - 1));
  if (!isDay(start)) {
    return { ok: false, error: 'Date de début invalide (attendu AAAA-MM-JJ).' };
  }
  if (start > end) {
    return {
      ok: false,
      error: 'La date de début doit précéder la date de fin.',
    };
  }
  if (daysBetween(start, end) + 1 > MAX_PERIOD_DAYS) {
    return {
      ok: false,
      error: 'Période trop longue : trois ans au plus.',
    };
  }
  return { ok: true, period: { from: start, to: end } };
}

/** `a / b × 100`, one decimal; null when `b` is not positive. */
export function pct(a: number, b: number): number | null {
  return b > 0 ? Math.round((a / b) * 1000) / 10 : null;
}

/** `a / b` rounded to `digits`; null when `b` is not positive. */
export function ratio(a: number, b: number, digits = 0): number | null {
  if (!(b > 0)) return null;
  const f = 10 ** digits;
  return Math.round((a / b) * f) / f;
}

export function round(n: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/**
 * Small-group suppression of aggregates (MAEDR: « aucune donnée individuelle
 * n'est exposée »). Returns the keys whose figures must be hidden:
 * - primary: a group fed by fewer than `k` farms (but at least one);
 * - secondary: while the hidden groups together hold fewer than `k` farms,
 *   the smallest visible group is hidden too, so that a total minus the
 *   visible groups never gives back a small group's figures.
 * When the total itself comes from fewer than `k` farms, every group is hidden.
 */
export function suppressedKeys(
  groups: readonly { key: string; farms: number }[],
  k: number,
): Set<string> {
  const hidden = new Set<string>();
  const total = groups.reduce((s, g) => s + g.farms, 0);
  if (total > 0 && total < k) {
    for (const g of groups) if (g.farms > 0) hidden.add(g.key);
    return hidden;
  }
  for (const g of groups) if (g.farms > 0 && g.farms < k) hidden.add(g.key);
  const hiddenFarms = () =>
    groups.filter((g) => hidden.has(g.key)).reduce((s, g) => s + g.farms, 0);
  while (hidden.size > 0 && hiddenFarms() < k) {
    const next = groups
      .filter((g) => !hidden.has(g.key) && g.farms > 0)
      .sort((a, b) => a.farms - b.farms || a.key.localeCompare(b.key))[0];
    if (!next) break;
    hidden.add(next.key);
  }
  return hidden;
}

/** Whether a group of `farms` farms may be shown to an aggregate-only viewer. */
export function groupVisible(farms: number, k: number): boolean {
  return farms === 0 || farms >= k;
}

export type ColourLevel = 'VERT' | 'JAUNE' | 'ROUGE';

export interface Thresholds {
  jaune: number;
  rouge: number;
}

/** Mortality of the period: ROUGE from `rouge` %, JAUNE from `jaune` %. */
export function mortalityLevel(
  value: number | null,
  t: Thresholds,
): ColourLevel | null {
  if (value == null) return null;
  if (value >= t.rouge) return 'ROUGE';
  if (value >= t.jaune) return 'JAUNE';
  return 'VERT';
}

/** Completeness: ROUGE below `rouge` %, JAUNE below `jaune` %. */
export function completenessLevel(
  value: number | null,
  t: Thresholds,
): ColourLevel | null {
  if (value == null) return null;
  if (value < t.rouge) return 'ROUGE';
  if (value < t.jaune) return 'JAUNE';
  return 'VERT';
}

/**
 * Alert colour of a farm: ROUGE only with a sanitary alert published by the
 * veterinary authority (CDC §5.2, §8). Fermia's conduct alerts never colour a
 * farm: they are advice, not a sanitary verdict (POUFA lot A, audit F1).
 */
export function alertLevel(a: { published: number }): ColourLevel {
  return a.published > 0 ? 'ROUGE' : 'VERT';
}

/** Week of age (0 = days 0-6) of a band on a day of age. */
export function ageWeek(ageDays: number): number {
  return Math.floor(Math.max(0, ageDays) / 7);
}

// ---------------------------------------------------------------------------
// 100 000 t objective
// ---------------------------------------------------------------------------

export interface ProjectionInput {
  /** Places of the active farms (registry capacity, else largest band). */
  places: number;
  occupationPct: number;
  bandsPerYear: number;
  mortalityPct: number;
  exitWeightKg: number;
  growthPct: number;
  /** Live tonnes already produced (programme start → today). */
  cumulativeTonnes: number;
  /** Live tonnes produced this calendar year, up to today. */
  yearToDateTonnes: number;
  today: string;
  firstYear: number;
  lastYear: number;
  objectiveTonnes: number;
}

export interface ProjectedYear {
  year: number;
  /** Live tonnes of that year (actual so far + projected for the rest). */
  annualTonnes: number;
  /** Live tonnes produced by the programme from its start to the end of that year. */
  cumulativeTonnes: number;
  /** That year's tonnes as a share of the national objective. */
  objectiveSharePct: number | null;
}

export interface Projection {
  /** Live tonnes a full year of the current farms can produce. */
  annualPotentialTonnes: number;
  years: ProjectedYear[];
}

/**
 * Projection of the programme's output (documented method, parameters in the
 * catalog):
 *
 *   potential (t/an) = places × occupation × bands per year
 *                      × (1 − mortality) × exit weight (kg) / 1000
 *
 * Year Y after the current one produces potential × (1 + growth)^(Y − now);
 * the current year adds the remaining fraction of the year to what was
 * already produced. The cumulative total starts from the volumes actually
 * recorded. It is the programme's own share: the national objective also
 * counts every other producer.
 */
export function projectProduction(input: ProjectionInput): Projection {
  const potential =
    (Math.max(0, input.places) *
      (input.occupationPct / 100) *
      input.bandsPerYear *
      (1 - Math.min(100, Math.max(0, input.mortalityPct)) / 100) *
      input.exitWeightKg) /
    1000;
  const currentYear = Number(input.today.slice(0, 4));
  const yearStart = `${currentYear}-01-01`;
  const yearDays = daysBetween(yearStart, `${currentYear + 1}-01-01`);
  const elapsed = daysBetween(yearStart, input.today) + 1;
  const remainingFraction = Math.max(0, (yearDays - elapsed) / yearDays);
  const growth = 1 + input.growthPct / 100;

  const annualOf = (year: number): number => {
    if (year < currentYear) return 0;
    if (year === currentYear) {
      return input.yearToDateTonnes + potential * remainingFraction;
    }
    return potential * growth ** (year - currentYear);
  };

  const years: ProjectedYear[] = [];
  let cumulative = input.cumulativeTonnes;
  for (let y = currentYear; y <= input.lastYear; y++) {
    const annual = annualOf(y);
    cumulative += y === currentYear ? potential * remainingFraction : annual;
    if (y < input.firstYear) continue;
    years.push({
      year: y,
      annualTonnes: round(annual, 1),
      cumulativeTonnes: round(cumulative, 1),
      objectiveSharePct: pct(annual, input.objectiveTonnes),
    });
  }
  return { annualPotentialTonnes: round(potential, 1), years };
}

// ---------------------------------------------------------------------------
// Report periods
// ---------------------------------------------------------------------------

/** Monday of the ISO week of `day`. */
export function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const shift = (d.getUTCDay() + 6) % 7;
  return addDays(day, -shift);
}

/** The period of `periodicity` containing `day`. */
export function periodContaining(
  periodicity: ReportPeriodicity.HEBDOMADAIRE | ReportPeriodicity.MENSUEL,
  day: string,
): Period {
  if (periodicity === ReportPeriodicity.HEBDOMADAIRE) {
    const from = weekStart(day);
    return { from, to: addDays(from, 6) };
  }
  const from = `${day.slice(0, 7)}-01`;
  const [y, m] = from.split('-').map(Number);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  return { from, to: addDays(next, -1) };
}

/** The last complete period of `periodicity` before `now` (UTC). */
export function lastCompletePeriod(
  periodicity: ReportPeriodicity.HEBDOMADAIRE | ReportPeriodicity.MENSUEL,
  now: Date = new Date(),
): Period {
  const current = periodContaining(periodicity, utcDay(now));
  return periodContaining(periodicity, addDays(current.from, -1));
}

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

/** Centre of a province boundary's bounding box, or null. */
export function boundaryCentre(
  geometry: unknown,
): { latitude: number; longitude: number } | null {
  if (!isGeoJsonGeometry(geometry)) return null;
  const rings =
    geometry.type === 'Polygon'
      ? geometry.coordinates
      : geometry.coordinates.flat();
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  }
  if (!Number.isFinite(minLng)) return null;
  return {
    latitude: Math.round(((minLat + maxLat) / 2) * 1e5) / 1e5,
    longitude: Math.round(((minLng + maxLng) / 2) * 1e5) / 1e5,
  };
}

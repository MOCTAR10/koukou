/**
 * Filters of the steering screens (period, provinces, cohort, status) ↔ the
 * page URL and the API query strings. Pure, unit-tested. Mirrors the
 * server's `resolvePeriod` (default: the last 30 days, today included, at
 * most three years) so a bad period is said before any call.
 */

export interface PilotageFilters {
  /** AAAA-MM-JJ. */
  from: string;
  to: string;
  /** Province codes (`G1`…), none = every province in scope. */
  provinces: string[];
  /** COHORTE list code, '' = all. */
  cohort: string;
  /** STATUT_FERME list code, '' = all. */
  status: string;
}

/** Same as the server's `DEFAULT_PERIOD_DAYS`. */
export const DEFAULT_PERIOD_DAYS = 30;
/** Same as the server's `MAX_PERIOD_DAYS`. */
export const MAX_PERIOD_DAYS = 3 * 366;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const PROVINCE_RE = /^[A-Z0-9]{1,16}$/;
const LIST_CODE_RE = /^[A-Za-z0-9_-]{1,40}$/;

export function isDay(value: string | null | undefined): value is string {
  return !!value && DAY_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** Today in UTC (the server's days are UTC). */
export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function defaultPeriod(today: string = utcToday()): { from: string; to: string } {
  return { from: addDays(today, -(DEFAULT_PERIOD_DAYS - 1)), to: today };
}

/** Province codes of a comma list, upper-cased, deduplicated, malformed ones dropped. */
export function parseProvinceCodes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const code = part.trim().toUpperCase();
    if (PROVINCE_RE.test(code) && !out.includes(code)) out.push(code);
  }
  return out;
}

function listCode(raw: string | null): string {
  const v = raw?.trim() ?? '';
  return LIST_CODE_RE.test(v) ? v : '';
}

/** Filters of the page URL; a missing or malformed date falls back to the default period. */
export function parsePilotageParams(params: URLSearchParams, today: string = utcToday()): PilotageFilters {
  const rawTo = params.get('to');
  const to = isDay(rawTo) ? rawTo : today;
  const rawFrom = params.get('from');
  const from = isDay(rawFrom) ? rawFrom : addDays(to, -(DEFAULT_PERIOD_DAYS - 1));
  return {
    from,
    to,
    provinces: parseProvinceCodes(params.get('province')),
    cohort: listCode(params.get('cohort')),
    status: listCode(params.get('status')),
  };
}

const FILTER_KEYS = ['from', 'to', 'province', 'cohort', 'status'] as const;

/**
 * The URL parameters of `filters`, other parameters of `base` kept. The
 * default period is left out, so a saved link keeps meaning « the last 30 days ».
 */
export function pilotageParamsOf(filters: PilotageFilters, base?: URLSearchParams, today: string = utcToday()): URLSearchParams {
  const next = new URLSearchParams(base);
  for (const k of FILTER_KEYS) next.delete(k);
  const def = defaultPeriod(today);
  if (filters.to !== def.to || filters.from !== def.from) {
    next.set('from', filters.from);
    next.set('to', filters.to);
  }
  if (filters.provinces.length > 0) next.set('province', filters.provinces.join(','));
  if (filters.cohort) next.set('cohort', filters.cohort);
  if (filters.status) next.set('status', filters.status);
  return next;
}

/** French reason the period is refused (same rules as the server), or null. */
export function periodError(filters: Pick<PilotageFilters, 'from' | 'to'>): string | null {
  if (!isDay(filters.from)) return 'Date de début invalide (attendu AAAA-MM-JJ).';
  if (!isDay(filters.to)) return 'Date de fin invalide (attendu AAAA-MM-JJ).';
  if (filters.from > filters.to) return 'La date de début doit précéder la date de fin.';
  if (daysBetween(filters.from, filters.to) + 1 > MAX_PERIOD_DAYS) return 'Période trop longue : trois ans au plus.';
  return null;
}

function registryQuery(filters: Pick<PilotageFilters, 'provinces' | 'cohort' | 'status'>, q: URLSearchParams): void {
  if (filters.provinces.length > 0) q.set('province', filters.provinces.join(','));
  if (filters.cohort) q.set('cohort', filters.cohort);
  if (filters.status) q.set('status', filters.status);
}

/** `?from=…&to=…&province=…` of the dashboard, the map and the exports (period always explicit). */
export function pilotageQueryString(filters: PilotageFilters): string {
  const q = new URLSearchParams();
  q.set('from', filters.from);
  q.set('to', filters.to);
  registryQuery(filters, q);
  return `?${q.toString()}`;
}

/** The objective has no period (everything since the programme start). */
export function objectiveQueryString(filters: PilotageFilters): string {
  const q = new URLSearchParams();
  registryQuery(filters, q);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export type ExportKind = 'provinces' | 'farms' | 'bandes';
export type ExportFormat = 'csv' | 'xlsx';

export const EXPORT_KINDS: readonly ExportKind[] = ['provinces', 'farms', 'bandes'];
export const EXPORT_FORMATS: readonly ExportFormat[] = ['csv', 'xlsx'];

export const EXPORT_LABELS: Record<ExportKind, string> = {
  provinces: 'Par province',
  farms: 'Par ferme',
  bandes: 'Par bande',
};

export const FORMAT_LABELS: Record<ExportFormat, string> = { csv: 'CSV', xlsx: 'Excel' };

/** Exports an account may ask for: farm and band rows are refused to an aggregate-only view. */
export function exportKindsFor(aggregateOnly: boolean): ExportKind[] {
  return aggregateOnly ? ['provinces'] : [...EXPORT_KINDS];
}

/** `GET /pilotage/exports/{provinces,farms,bandes}.{csv,xlsx}` with the page's filters. */
export function exportPath(kind: ExportKind, format: ExportFormat, filters: PilotageFilters): string {
  return `/pilotage/exports/${kind}.${format}${pilotageQueryString(filters)}`;
}

export function exportFilename(kind: ExportKind, format: ExportFormat, filters: PilotageFilters): string {
  const name = kind === 'farms' ? 'fermes' : kind;
  return `pilotage-${name}-${filters.from}_${filters.to}.${format}`;
}

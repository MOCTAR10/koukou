import type { Role } from '../../api/client';
import type { EconomieColumns, EconomieFormat, EconomieRow } from '../../api/types-economie';
import type { MyAccess } from '../../api/types-access';
import { grantsAccess, scopeReachesFarms } from '../../app/menu-access';
import { librevilleDay } from '../../lib/libreville';

/**
 * POUFA lot A droits: pure rules of the programme economic synthesis
 * (`/app/economie`). The server stays the authority (scope, matrix).
 */

export const ECONOMIE_PATH = '/app/economie';

/** The platform admin, or an institution granted ECONOMIQUE:CONSULTER whose scope reaches farms. */
export function economieRights(
  role: Role | null | undefined,
  access?: Pick<MyAccess['profile'], 'matrix' | 'scopeKind'> | null,
): { view: boolean } {
  if (role === 'PLATFORM_ADMIN') return { view: true };
  if (role !== 'INSTITUTION' || !access) return { view: false };
  return { view: scopeReachesFarms(access.scopeKind) && grantsAccess(access, 'ECONOMIQUE', 'CONSULTER') };
}

export interface EconomieFilters {
  from: string;
  to: string;
  provinceId: string;
}

/** Default period: the 1st of the current month to today (local dates). */
export function defaultPeriod(now: Date = new Date()): { from: string; to: string } {
  const to = librevilleDay(now);
  return { from: `${to.slice(0, 7)}-01`, to };
}

/** French error of the period, or null. */
export function periodError(f: Pick<EconomieFilters, 'from' | 'to'>): string | null {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(f.from) || !re.test(f.to)) return 'Choisissez une date de début et une date de fin.';
  if (f.from > f.to) return 'La date de début doit précéder la date de fin.';
  return null;
}

function query(f: EconomieFilters): string {
  const qs = new URLSearchParams({ from: f.from, to: f.to });
  if (f.provinceId) qs.set('provinceId', f.provinceId);
  return qs.toString();
}

export function synthesePath(f: EconomieFilters): string {
  return `/programme/economie/synthese?${query(f)}`;
}

export function exportPath(f: EconomieFilters, format: EconomieFormat): string {
  return `/programme/economie/synthese/export?format=${format}&${query(f)}`;
}

export function exportFilename(f: Pick<EconomieFilters, 'from' | 'to'>, format: EconomieFormat): string {
  return `synthese-economique-${f.from}-${f.to}.${format}`;
}

/** Margin rate shown: the server's, else computed from sales and margin (null without sales). */
export function marginRate(row: Pick<EconomieRow, 'marginPct' | 'marginFcfa' | 'salesFcfa'>): number | null {
  if (row.marginPct != null) return row.marginPct;
  if (row.marginFcfa == null || !row.salesFcfa) return null;
  return Math.round((row.marginFcfa / row.salesFcfa) * 1000) / 10;
}

/** Tone of a margin: negative bad, positive good, nothing otherwise. */
export function marginTone(margin: number | null | undefined): 'good' | 'bad' | 'default' {
  if (margin == null || margin === 0) return 'default';
  return margin > 0 ? 'good' : 'bad';
}

/** Farms ordered by margin, worst first (the ones to follow up), ties by code; unknown margins last. */
export function sortByMargin<T extends Pick<EconomieRow, 'marginFcfa' | 'code'>>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const ma = a.marginFcfa ?? Number.POSITIVE_INFINITY;
    const mb = b.marginFcfa ?? Number.POSITIVE_INFINITY;
    if (ma !== mb) return ma < mb ? -1 : 1;
    return (a.code ?? '').localeCompare(b.code ?? '');
  });
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Whether a row's name, code or province matches a search (accents and case ignored). */
export function matchesSearch(row: Pick<EconomieRow, 'name' | 'code' | 'provinceName'>, q: string): boolean {
  const needle = fold(q.trim());
  if (!needle) return true;
  return [row.name, row.code, row.provinceName].some((v) => !!v && fold(v).includes(needle));
}

// POUFA lot A2 dge: the synthesis is read by column group, each following
// the caller's matrix (the server nulls a group it does not grant).

/** Column groups of the synthesis tables. */
export type EconomieView = 'ventes' | 'comptabilite' | 'market' | 'production' | 'biosecurite';

export const ECONOMIE_VIEWS: ReadonlyArray<{ key: EconomieView; label: string }> = [
  { key: 'ventes', label: 'Ventes et charges' },
  { key: 'comptabilite', label: 'Comptabilité SYSCOHADA' },
  { key: 'market', label: 'Market' },
  { key: 'production', label: 'Complétude et volumes' },
  { key: 'biosecurite', label: 'Biosécurité' },
];

/** Whether a view's group is granted (`ventes` needs the sales; the route always gives them). */
export function viewGranted(view: EconomieView, cols: EconomieColumns): boolean {
  switch (view) {
    case 'ventes':
      return cols.sales;
    case 'comptabilite':
      return !!cols.accounting;
    case 'market':
      return !!cols.market;
    case 'production':
      return !!cols.production;
    case 'biosecurite':
      return !!cols.biosecurity;
  }
}

/** The views the caller may pick, in order. */
export function availableViews(cols: EconomieColumns): EconomieView[] {
  return ECONOMIE_VIEWS.map((v) => v.key).filter((k) => viewGranted(k, cols));
}

/** The view shown: the one picked when granted, else the first granted one. */
export function effectiveView(picked: EconomieView, cols: EconomieColumns): EconomieView | null {
  if (viewGranted(picked, cols)) return picked;
  return availableViews(cols)[0] ?? null;
}

/** French names of the areas the profile does not open (for the note under the cards). */
export function missingAreas(cols: EconomieColumns): string[] {
  return [
    !cols.sales && 'les ventes',
    !cols.collected && 'la caisse',
    !cols.payroll && 'les salaires (Équipe et RH)',
    !cols.stock && 'le stock (Intrants)',
    !cols.accounting && 'la comptabilité SYSCOHADA',
    !cols.market && 'le Market',
    !cols.production && 'les saisies techniques (complétude et volumes)',
    !cols.biosecurity && 'les contrôles de biosécurité',
  ].filter((x): x is string => !!x);
}

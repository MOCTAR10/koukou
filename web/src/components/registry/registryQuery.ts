import type { LocaliteView, ProvinceView } from '../../api/types-programme';

/** Filters of the registry list, as kept in the page URL. */
export interface RegistryFilters {
  /** Province code (`G1`). */
  province: string;
  localiteId: string;
  /** COHORTE list code. */
  cohort: string;
  /** STATUT_FERME list code. */
  status: string;
  /** Class of the latest biosecurity control (`A`, `B`, `C`) or `NONE`; TECHNIQUE readers only. */
  biosecurity: string;
  q: string;
  page: number;
}

export const REGISTRY_PAGE_SIZE = 50;
/** Server cap of `pageSize` on `GET /programme/farms`. */
export const REGISTRY_MAX_PAGE_SIZE = 200;

export const EMPTY_FILTERS: RegistryFilters = { province: '', localiteId: '', cohort: '', status: '', biosecurity: '', q: '', page: 1 };

const TEXT_KEYS = ['province', 'localiteId', 'cohort', 'status', 'biosecurity', 'q'] as const;

/** Reads the filters from the page URL (`?province=G1&page=2`); anything malformed falls back to the default. */
export function parseRegistryParams(params: URLSearchParams): RegistryFilters {
  const page = Number(params.get('page'));
  const filters: RegistryFilters = { ...EMPTY_FILTERS, page: Number.isInteger(page) && page > 1 ? page : 1 };
  for (const key of TEXT_KEYS) filters[key] = params.get(key)?.trim() ?? '';
  return filters;
}

/**
 * Writes the filters back into the URL, dropping empty ones and page 1, and
 * keeping the parameters the filters don't own (`ferme`, the open sheet).
 */
export function registryParamsOf(filters: RegistryFilters, base?: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(base);
  for (const key of TEXT_KEYS) {
    const value = filters[key].trim();
    if (value) params.set(key, value);
    else params.delete(key);
  }
  if (filters.page > 1) params.set('page', String(filters.page));
  else params.delete('page');
  return params;
}

/** Query string of `GET /programme/farms` (empty filters left out, `pageSize` within the server cap). */
export function registryQueryString(filters: RegistryFilters, pageSize = REGISTRY_PAGE_SIZE): string {
  const params = new URLSearchParams();
  for (const key of TEXT_KEYS) {
    const value = filters[key].trim();
    if (value) params.set(key, value);
  }
  params.set('page', String(Math.max(1, Math.floor(filters.page))));
  params.set('pageSize', String(Math.min(REGISTRY_MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSize)))));
  return `?${params.toString()}`;
}

/**
 * Changes one filter. Any change but the page goes back to page 1, and a new
 * province drops a localité that belongs to another one.
 */
export function withFilter<K extends keyof RegistryFilters>(
  filters: RegistryFilters,
  key: K,
  value: RegistryFilters[K],
  provinces?: readonly ProvinceView[],
): RegistryFilters {
  if (key === 'page') return { ...filters, page: Math.max(1, Number(value) || 1) };
  const next: RegistryFilters = { ...filters, [key]: value, page: 1 };
  if (key === 'province' && next.localiteId) {
    const kept = localitesOf(provinces ?? [], String(value)).some((l) => l.id === next.localiteId);
    if (!kept) next.localiteId = '';
  }
  return next;
}

/** True when any filter narrows the list (to word the empty state). */
export function hasActiveFilter(filters: RegistryFilters): boolean {
  return TEXT_KEYS.some((key) => filters[key].trim() !== '');
}

/** Localités to offer: the province's, or every one (with its province) when none is chosen. */
export function localitesOf(provinces: readonly ProvinceView[], provinceCode: string): LocaliteView[] {
  if (!provinceCode) return provinces.flatMap((p) => p.localites);
  return provinces.find((p) => p.code.toUpperCase() === provinceCode.toUpperCase())?.localites ?? [];
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}

/** « 51–100 sur 152 » */
export function pageRangeLabel(total: number, page: number, pageSize: number): string {
  if (total === 0) return 'Aucune ferme';
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return `${first}–${last} sur ${total}`;
}

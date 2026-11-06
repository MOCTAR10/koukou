import type { DeliveryStatus } from '../../api/types-supply';

/**
 * Filters of the programme deliveries list, kept in the URL
 * (`/app/intrants?province=G1&statut=EXPEDIEE&ferme=<id>&du=…&au=…&page=2`)
 * and sent to `GET /programme/input-deliveries` (`province`, `status`,
 * `farmId`, `from`, `to`, `page`, `pageSize`).
 */

export const DELIVERY_PAGE_SIZE = 25;
const STATUSES: readonly DeliveryStatus[] = ['EXPEDIEE', 'CONFIRMEE', 'ANNULEE'];

export interface DeliveryFilters {
  province: string;
  status: DeliveryStatus | '';
  farmId: string;
  from: string;
  to: string;
  page: number;
}

export const NO_FILTERS: DeliveryFilters = { province: '', status: '', farmId: '', from: '', to: '', page: 1 };

const day = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');

export function parseDeliveryParams(params: URLSearchParams): DeliveryFilters {
  const status = params.get('statut') ?? '';
  const page = Number.parseInt(params.get('page') ?? '1', 10);
  return {
    province: (params.get('province') ?? '').trim().toUpperCase(),
    status: (STATUSES as readonly string[]).includes(status) ? (status as DeliveryStatus) : '',
    farmId: params.get('ferme') ?? '',
    from: day(params.get('du')),
    to: day(params.get('au')),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** URL parameters of the filters (other parameters, such as the open detail, kept). */
export function deliveryParamsOf(f: DeliveryFilters, prev?: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(prev);
  const set = (k: string, v: string) => (v ? next.set(k, v) : next.delete(k));
  set('province', f.province);
  set('statut', f.status);
  set('ferme', f.farmId);
  set('du', f.from);
  set('au', f.to);
  set('page', f.page > 1 ? String(f.page) : '');
  return next;
}

/** Query string of the server call. */
export function deliveryQueryString(f: DeliveryFilters, pageSize = DELIVERY_PAGE_SIZE): string {
  const q = new URLSearchParams();
  if (f.province) q.set('province', f.province);
  if (f.status) q.set('status', f.status);
  if (f.farmId) q.set('farmId', f.farmId);
  if (f.from) q.set('from', f.from);
  if (f.to) q.set('to', f.to);
  q.set('page', String(f.page));
  q.set('pageSize', String(pageSize));
  return `?${q.toString()}`;
}

/** A filter change goes back to page 1. */
export function withDeliveryFilter<K extends keyof DeliveryFilters>(f: DeliveryFilters, key: K, value: DeliveryFilters[K]): DeliveryFilters {
  return { ...f, [key]: value, page: key === 'page' ? (value as number) : 1 };
}

export function hasDeliveryFilter(f: DeliveryFilters): boolean {
  return !!(f.province || f.status || f.farmId || f.from || f.to);
}

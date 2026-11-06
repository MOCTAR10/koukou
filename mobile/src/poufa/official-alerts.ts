// Official sanitary alerts of a farm, display rows. Pure.
import type { RefItem, SanitaryAlertView } from '@/api/poufa';

export const ALERT_ORIGIN_LABEL: Record<string, string> = {
  MORTALITE: 'Mortalité au-dessus du seuil',
  DECLARATION: 'Suspicion déclarée',
};

/** Fallback when the STATUT_ALERTE list is not loaded (codes of the seed). */
const STATUS_FALLBACK: Record<string, string> = {
  NOUVELLE: 'Nouvelle',
  EN_ANALYSE: 'En analyse',
  CONFIRMEE: 'Confirmée',
  INFIRMEE: 'Infirmée',
  CLOSE: 'Close',
};

export interface OfficialAlertRow {
  id: string;
  code: string;
  statusLabel: string;
  /** Family CLOSE: the circuit ended. */
  closed: boolean;
  severity: string;
  originLabel: string;
  period: string;
  batchCode: string | null;
  summary: string;
  signs: string;
  published: boolean;
}

function frDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Open alerts first (by latest fact day), closed ones after. */
export function officialAlertRows(
  alerts: readonly SanitaryAlertView[],
  statuses: readonly RefItem[],
  signs: readonly RefItem[],
): OfficialAlertRow[] {
  const statusLabel = new Map(statuses.map((s) => [s.code, s.label]));
  const signLabel = new Map(signs.map((s) => [s.code, s.label]));
  return alerts
    .map((a) => {
      const closed = a.statusFamily === 'CLOSE';
      const period = a.lastFactDay && a.lastFactDay !== a.factDay ? `du ${frDay(a.factDay)} au ${frDay(a.lastFactDay)}` : `le ${frDay(a.factDay)}`;
      return {
        id: a.id,
        code: a.code,
        statusLabel: statusLabel.get(a.statusCode) ?? STATUS_FALLBACK[a.statusCode] ?? a.statusCode,
        closed,
        severity: a.severity,
        originLabel: ALERT_ORIGIN_LABEL[a.origin] ?? a.origin,
        period,
        batchCode: a.batchCode,
        summary: a.summary,
        signs: a.clinicalSigns.map((c) => signLabel.get(c) ?? c).join(', '),
        published: a.published,
        sortKey: a.lastFactDay || a.factDay,
      };
    })
    .sort((x, y) => Number(x.closed) - Number(y.closed) || y.sortKey.localeCompare(x.sortKey))
    .map(({ sortKey: _sortKey, ...row }) => row);
}

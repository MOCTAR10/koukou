import type { AlertLevel, InboxItem, NotificationEvent } from '../../api/types-surveillance';

/**
 * Where a notification leads in the web app. The server writes app routes
 * shared with mobile (`notify.service.ts`): they are mapped here, never
 * opened as is. Null: no web page for it (the item is only marked read).
 */
export interface WebTarget {
  path: string;
  /** Farm to make active first (the notification is about that farm). */
  farmId: string | null;
}

export interface RouteContext {
  /** The account reads the programme alerts page (vets, platform admin…). */
  programmeAlerts: boolean;
}

const UUID = '[0-9a-fA-F-]{36}';

export function webTargetFor(item: Pick<InboxItem, 'route' | 'farmId'>, ctx: RouteContext): WebTarget | null {
  const route = (item.route ?? '').split(/[?#]/)[0]?.replace(/\/+$/, '') ?? '';
  if (!route) return null;
  if (route === '/alerts') return { path: '/app/alerts', farmId: item.farmId };

  const alert = new RegExp(`^/sanitary-alerts/(${UUID})$`).exec(route);
  if (alert) {
    const id = alert[1]!;
    return ctx.programmeAlerts
      ? { path: `/app/surveillance?alerte=${id}`, farmId: null }
      : { path: `/app/sanitary?alerte=${id}`, farmId: item.farmId };
  }

  const declaration = new RegExp(`^/farms/(${UUID})/batches/(${UUID})/health-events$`).exec(route);
  if (declaration) {
    return { path: `/app/sanitary?lot=${declaration[2]}&onglet=maladies`, farmId: declaration[1]! };
  }

  const band = new RegExp(`^/batches/(${UUID})$`).exec(route);
  if (band) return { path: `/app/batches?lot=${band[1]}`, farmId: item.farmId };

  return null;
}

export const EVENT_SHORT_LABELS: Readonly<Record<NotificationEvent, string>> = {
  ALERT_RAISED: 'Alerte de la ferme',
  SANITARY_ALERT_CREATED: 'Alerte sanitaire',
  SANITARY_ALERT_STATUS_CHANGED: 'Alerte sanitaire',
  SANITARY_ALERT_PUBLISHED: 'Alerte publiée',
  DECLARATION_RECEIVED: 'Déclaration sanitaire',
  WEIGHING_LATE: 'Pesée',
  SYNC_CONFLICT: 'Synchronisation',
};

export function severityTone(level: AlertLevel): 'red' | 'amber' | 'emerald' {
  return level === 'ROUGE' ? 'red' : level === 'JAUNE' ? 'amber' : 'emerald';
}

/** « 9+ » past nine, nothing at zero. */
export function badgeText(count: number | null | undefined): string | null {
  if (!count || count <= 0) return null;
  return count > 9 ? '9+' : String(count);
}

/** Cursor of the next page: the oldest item's date, or null when the page wasn't full. */
export function nextCursor(items: readonly Pick<InboxItem, 'createdAt'>[], limit: number): string | null {
  if (items.length < limit) return null;
  return items[items.length - 1]?.createdAt ?? null;
}

/** Query of `GET /notifications`. */
export function inboxQuery(opts: { unread: boolean; before?: string | null; limit: number }): string {
  const params = new URLSearchParams();
  if (opts.unread) params.set('unread', 'true');
  if (opts.before) params.set('before', opts.before);
  params.set('limit', String(opts.limit));
  return params.toString();
}

// Notification inbox (§7.6): badge and tap routing. Pure.
import type { InboxItem } from '@/api/poufa';

/** Badge text: nothing at 0, « 99+ » beyond. */
export function badgeLabel(count: number | null | undefined): string | null {
  if (!count || count <= 0 || !Number.isFinite(count)) return null;
  return count > 99 ? '99+' : String(Math.floor(count));
}

const UUID = '[0-9a-fA-F-]{36}';

/**
 * Mobile screen for a route the backend stores on a notification (written
 * for every client, see notify.service.ts) or sends in a push `data.route`.
 * Unknown routes open the inbox rather than a missing screen.
 */
export function mobileRouteOf(serverRoute: string | null | undefined): string {
  const route = (serverRoute ?? '').trim();
  if (!route.startsWith('/') || route.startsWith('//')) return '/notifications';
  let m: RegExpMatchArray | null;
  if (route === '/' || route === '/(tabs)') return '/';
  if (route === '/alerts' || route === '/(tabs)/alerts') return '/alerts';
  if (route === '/tasks') return '/tasks';
  if (route === '/sync') return '/menu';
  if ((m = route.match(new RegExp(`^/notifications/(${UUID})$`)))) return `/notifications/${m[1]}`;
  if (route === '/notifications') return '/notifications';
  if (new RegExp(`^/sanitary-alerts/${UUID}$`).test(route)) return '/sanitary?tab=alertes';
  if ((m = route.match(new RegExp(`^/farms/${UUID}/batches/(${UUID})/health-events$`)))) {
    return `/sanitary?lot=${m[1]}&tab=maladies`;
  }
  if ((m = route.match(new RegExp(`^/batches/(${UUID})$`)))) return `/lot/${m[1]}`;
  // Next-visit reminders (VISIT_REMINDER / VISIT_OVERDUE).
  if (new RegExp(`^/farms/${UUID}/visits$`).test(route)) return '/visites';
  // Already a mobile route (local reminders build their own).
  if (/^\/(lot|lots|visites|sanitary|livraisons|tasks|alerts|menu|activites|provende)(\/|\?|$)/.test(route)) return route;
  if ((m = route.match(/^\/\(tabs\)(\/(lots|menu|activites|provende)(\?.*)?)$/))) return m[1];
  return '/notifications';
}

/** Inbox after one item was read here (the server reads the whole occurrence). */
export function markReadLocally(items: readonly InboxItem[], id: string, at: string): InboxItem[] {
  return items.map((i) => (i.id === id && !i.readAt ? { ...i, readAt: at } : i));
}

export function unreadOf(items: readonly InboxItem[]): number {
  return items.filter((i) => !i.readAt).length;
}

/** « il y a 5 min », « hier », « 12/10 » — `now` passed in (pure render). */
export function relativeTime(iso: string, now: Date): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const minutes = Math.floor((now.getTime() - t) / 60_000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} j`;
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '../../api/client';
import type { InboxItem, InboxPage } from '../../api/types-surveillance';
import { useAuth } from '../../auth/AuthContext';
import { ErrorNote } from '../form';
import { Loading } from '../ui';
import { InboxList } from './InboxList';
import { NOTIFICATION_KEY, useOpenNotification, useReadAll, useUnreadCount } from './notifications';
import { badgeText, inboxQuery } from './notificationRoutes';
import { useNotificationRights } from './useSurveillanceRights';

const PANEL_LIMIT = 8;

/** The Shell's bell: unread count, and the latest notifications in a small panel. */
export function NotificationBell() {
  const { user } = useAuth();
  const rights = useNotificationRights();
  const unread = useUnreadCount();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const recent = useQuery({
    queryKey: [...NOTIFICATION_KEY, 'panel', user?.id],
    queryFn: () => api.get<InboxPage>(`/notifications?${inboxQuery({ unread: false, limit: PANEL_LIMIT })}`),
    enabled: open && rights.inbox,
  });
  const opener = useOpenNotification();
  const readAll = useReadAll();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!rights.inbox) return null;
  const count = unread.data?.count ?? 0;
  const badge = badgeText(count);
  const onOpen = (item: InboxItem) =>
    void opener.open(item).then((went) => {
      if (went) setOpen(false);
    });

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        aria-label={count > 0 ? `Notifications : ${count} non lue${count > 1 ? 's' : ''}` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {badge ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {badge}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">Notifications</p>
            {count > 0 ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline disabled:opacity-60"
                disabled={readAll.isPending}
                onClick={() => readAll.mutate()}
              >
                <CheckCheck className="h-3.5 w-3.5" /> Tout marquer comme lu
              </button>
            ) : null}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {recent.isLoading ? (
              <div className="p-4">
                <Loading />
              </div>
            ) : (
              <InboxList compact items={recent.data?.items ?? []} onOpen={onOpen} />
            )}
          </div>
          <div className="px-4">
            <ErrorNote error={recent.error ?? opener.error ?? readAll.error} />
          </div>
          <Link
            to="/app/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-100 px-4 py-2.5 text-center text-sm font-semibold text-brand-700 hover:bg-slate-50"
          >
            Toutes les notifications
          </Link>
        </div>
      ) : null}
    </div>
  );
}

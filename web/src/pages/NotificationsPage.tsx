import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Bell, CheckCheck, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { api } from '../api/client';
import type { InboxItem, InboxPage } from '../api/types-surveillance';
import { useAuth } from '../auth/AuthContext';
import { PageNotOpen } from '../components/access/PageNotOpen';
import { Button, ErrorNote } from '../components/form';
import { Note, Tabs } from '../components/flock/shared';
import { InboxList } from '../components/surveillance/InboxList';
import { NOTIFICATION_KEY, useOpenNotification, useReadAll } from '../components/surveillance/notifications';
import { inboxQuery, nextCursor, webTargetFor } from '../components/surveillance/notificationRoutes';
import { useNotificationRights, useSurveillanceRights } from '../components/surveillance/useSurveillanceRights';
import { Card, Loading, PageHeader } from '../components/ui';

const PAGE_LIMIT = 30;

/** The account's in-app notifications (POUFA §7.6), every signed-in non-buyer. */
export function NotificationsPage() {
  const { user } = useAuth();
  const rights = useNotificationRights();
  const surveillance = useSurveillanceRights();
  const [unreadOnly, setUnreadOnly] = useState<'toutes' | 'non-lues'>('toutes');
  const [noPage, setNoPage] = useState<InboxItem | null>(null);
  const inbox = useInfiniteQuery({
    queryKey: [...NOTIFICATION_KEY, 'list', user?.id, unreadOnly],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.get<InboxPage>(`/notifications?${inboxQuery({ unread: unreadOnly === 'non-lues', before: pageParam, limit: PAGE_LIMIT })}`),
    getNextPageParam: (last) => nextCursor(last.items, PAGE_LIMIT),
    enabled: rights.inbox,
  });
  const opener = useOpenNotification();
  const readAll = useReadAll();

  if (rights.loading) return <Loading />;
  if (!rights.inbox) return <PageNotOpen />;

  const items = inbox.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = inbox.data?.pages[0]?.unread ?? 0;
  const onOpen = (item: InboxItem) => {
    setNoPage(webTargetFor(item, { programmeAlerts: surveillance.view }) ? null : item);
    void opener.open(item);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        icon={<Bell />}
        subtitle={unread > 0 ? `${unread} non lue${unread > 1 ? 's' : ''}` : 'Tout est lu'}
        actions={
          <div className="flex flex-wrap gap-2">
            {rights.readRules ? (
              <Link
                to="/app/notifications/regles"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <SlidersHorizontal className="h-4 w-4" /> Règles de notification
              </Link>
            ) : null}
            <Button tone="secondary" busy={readAll.isPending} disabled={unread === 0} onClick={() => readAll.mutate()}>
              <CheckCheck className="h-4 w-4" /> Tout marquer comme lu
            </Button>
          </div>
        }
      />
      <Tabs
        value={unreadOnly}
        onChange={setUnreadOnly}
        options={[
          { key: 'toutes', label: 'Toutes' },
          { key: 'non-lues', label: 'Non lues' },
        ]}
      />
      <ErrorNote error={inbox.error ?? opener.error ?? readAll.error} />
      {noPage ? <Note tone="slate">« {noPage.title} » est marquée comme lue : elle n’a pas de page dans l’application web.</Note> : null}
      <Card className="overflow-hidden">
        {inbox.isLoading ? (
          <div className="p-4">
            <Loading />
          </div>
        ) : (
          <InboxList items={items} onOpen={onOpen} />
        )}
        {inbox.hasNextPage ? (
          <div className="border-t border-slate-100 p-3 text-center">
            <Button tone="secondary" busy={inbox.isFetchingNextPage} onClick={() => void inbox.fetchNextPage()}>
              <ChevronDown className="h-4 w-4" /> Plus anciennes
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

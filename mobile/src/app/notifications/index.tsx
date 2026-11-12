import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react-native';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { StaleNotice } from '@/components/ui/StaleNotice';
import { errorMessage, toast } from '@/components/ui/Feedback';
import { PillRow } from '@/components/market/shared';
import { INBOX_KEY, UNREAD_KEY, useMarkRead, useOpenNotification } from '@/components/notifications/useInbox';
import { useAuth } from '@/auth/AuthContext';
import { fetchInbox, markAllNotificationsRead, type InboxItem } from '@/api/poufa';
import { hasInbox } from '@/poufa/access';
import { relativeTime } from '@/poufa/notifications';
import { color, palette, radii, semantic } from '@/constants/theme';

const PAGE = 30;

const SEVERITY_DOT: Record<string, string> = {
  ROUGE: palette.red[500],
  JAUNE: palette.amber[500],
  VERT: palette.green[500],
};

function Row({ item, now, farmName, onPress }: { item: InboxItem; now: Date; farmName: string | null; onPress: () => void }) {
  const unread = !item.readAt;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, unread && styles.unread, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={item.title}>
      <View style={[styles.dot, { backgroundColor: SEVERITY_DOT[item.severity] ?? color.ink[300] }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.head}>
          <AppText size="body" weight={unread ? 'bold' : 'medium'} color="text" style={{ flex: 1 }} numberOfLines={2}>
            {item.title}
          </AppText>
          <AppText size="caption" color="muted">
            {relativeTime(item.createdAt, now)}
          </AppText>
        </View>
        <AppText size="small" color="muted" numberOfLines={3}>
          {item.body}
        </AppText>
        {farmName ? (
          <AppText size="caption" color="faint">
            {farmName}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * Notification inbox (§7.6): the account's in-app notifications, unread first
 * in weight; a tap reads it and opens its screen (switching farm if needed).
 */
export default function NotificationsScreen() {
  const qc = useQueryClient();
  const { user, farms } = useAuth();
  const allowed = hasInbox(user.role);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [busy, setBusy] = useState(false);
  const markRead = useMarkRead();
  const open = useOpenNotification();
  const now = new Date();

  const inbox = useInfiniteQuery({
    queryKey: [...INBOX_KEY, user.id, filter],
    queryFn: ({ pageParam }) => fetchInbox({ unread: filter === 'unread', before: pageParam, limit: PAGE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.items.length < PAGE ? undefined : last.items[last.items.length - 1]?.createdAt),
    enabled: allowed,
  });
  const items = inbox.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = inbox.data?.pages[0]?.unread ?? 0;
  const farmName = (id: string | null) => (id && farms.length > 1 ? (farms.find((f) => f.id === id)?.name ?? null) : null);

  const tap = async (item: InboxItem) => {
    if (!item.readAt) {
      try {
        await markRead(item.id);
      } catch {
        // Reading is best effort: the screen still opens.
      }
    }
    open(item);
  };

  const readAll = async () => {
    setBusy(true);
    try {
      const r = await markAllNotificationsRead();
      toast.success(r.updated > 0 ? `${r.updated} notification${r.updated > 1 ? 's' : ''} marquée${r.updated > 1 ? 's' : ''} lue${r.updated > 1 ? 's' : ''}` : 'Tout était déjà lu');
      void qc.invalidateQueries({ queryKey: INBOX_KEY });
      void qc.invalidateQueries({ queryKey: UNREAD_KEY });
    } catch (e) {
      toast.error('Impossible de tout marquer lu', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      header={<ScreenHeader title="Notifications" subtitle={unread > 0 ? `${unread} non lue${unread > 1 ? 's' : ''}` : 'Tout est lu'} back right={<Bell size={18} color={color.ink[300]} />} />}
      refreshing={inbox.isRefetching && !inbox.isFetchingNextPage}
      onRefresh={allowed ? () => void inbox.refetch() : undefined}>
      {!allowed ? (
        <Card>
          <AppText size="body" color="muted">
            Les notifications ne concernent pas ce type de compte.
          </AppText>
        </Card>
      ) : (
        <>
          <View style={styles.toolbar}>
            <View style={{ flex: 1 }}>
              <PillRow
                options={[
                  { key: 'all', label: 'Toutes' },
                  { key: 'unread', label: 'Non lues' },
                ]}
                value={filter}
                onChange={setFilter}
              />
            </View>
            <Button label="Tout marquer lu" icon={CheckCheck} size="sm" tone="ghost" block={false} onPress={() => void readAll()} loading={busy} disabled={unread === 0} />
          </View>
          <StaleNotice show={inbox.isError && Boolean(inbox.data)} updatedAt={inbox.dataUpdatedAt} />
          {inbox.isLoading ? (
            <Spinner label="Lecture des notifications…" />
          ) : inbox.isError && !inbox.data ? (
            <Card>
              <AppText size="body" color="danger">
                {errorMessage(inbox.error)}
              </AppText>
            </Card>
          ) : items.length === 0 ? (
            <EmptyState icon={Bell} title={filter === 'unread' ? 'Aucune notification non lue' : 'Aucune notification'} description="Alertes, déclarations et rappels du programme arrivent ici." />
          ) : (
            <Card style={{ gap: 0, padding: 0, overflow: 'hidden' }}>
              {items.map((item, i) => (
                <View key={item.id} style={i > 0 ? styles.sep : undefined}>
                  <Row item={item} now={now} farmName={farmName(item.farmId)} onPress={() => void tap(item)} />
                </View>
              ))}
            </Card>
          )}
          {inbox.hasNextPage ? (
            <Button label="Notifications plus anciennes" tone="ghost" onPress={() => void inbox.fetchNextPage()} loading={inbox.isFetchingNextPage} />
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', gap: 10, padding: 14, alignItems: 'flex-start' },
  unread: { backgroundColor: semantic.primarySoft },
  pressed: { opacity: 0.7 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: radii.pill, marginTop: 7 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: semantic.border },
});

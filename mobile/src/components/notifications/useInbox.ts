import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { fetchUnreadCount, markNotificationRead, type InboxItem } from '@/api/poufa';
import { hasInbox } from '@/poufa/access';
import { mobileRouteOf } from '@/poufa/notifications';

export const INBOX_KEY = ['notifications-inbox'] as const;
export const UNREAD_KEY = ['notifications-unread'] as const;

/** Unread count of the signed-in account (badge), refreshed every minute. */
export function useUnreadCount() {
  const { signedIn, user } = useAuth();
  return useQuery({
    queryKey: [...UNREAD_KEY, user.id],
    queryFn: fetchUnreadCount,
    enabled: signedIn && hasInbox(user.role),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/**
 * Opens the screen of a notification: switches to its farm first (the screen
 * shows the active farm), then goes to the mobile route of its server route.
 */
export function useOpenNotification() {
  const { farmId, farms, setActiveFarmId } = useAuth();
  return (item: Pick<InboxItem, 'farmId' | 'route'>, mode: 'push' | 'replace' = 'push') => {
    if (item.farmId && item.farmId !== farmId && farms.some((f) => f.id === item.farmId)) setActiveFarmId(item.farmId);
    const target = mobileRouteOf(item.route);
    if (mode === 'replace') router.replace(target as never);
    else router.push(target as never);
  };
}

/** Marks one item read on the server and refreshes badge and list. */
export function useMarkRead() {
  const qc = useQueryClient();
  return async (id: string): Promise<InboxItem> => {
    const item = await markNotificationRead(id);
    void qc.invalidateQueries({ queryKey: UNREAD_KEY });
    void qc.invalidateQueries({ queryKey: INBOX_KEY });
    return item;
  };
}

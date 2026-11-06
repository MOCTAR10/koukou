import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { InboxItem } from '../../api/types-surveillance';
import { useFarm } from '../../app/FarmContext';
import { useAuth } from '../../auth/AuthContext';
import { webTargetFor } from './notificationRoutes';
import { useNotificationRights, useSurveillanceRights } from './useSurveillanceRights';

/** The caller's own inbox (domain SESSION): not farm data, keyed by the account. */
export const NOTIFICATION_KEY = ['notifications'] as const;

export const UNREAD_POLL_MS = 60_000;

/** Unread count for the bell: every ~60 s and when the window gets the focus again. */
export function useUnreadCount() {
  const { user } = useAuth();
  const rights = useNotificationRights();
  return useQuery({
    queryKey: [...NOTIFICATION_KEY, 'unread-count', user?.id],
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
    enabled: rights.inbox && !rights.loading,
    refetchInterval: UNREAD_POLL_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

/**
 * Opens a notification: marks it read (the whole occurrence, which stops its
 * SMS escalation), then goes to its web page, on its farm when it names one
 * the account reaches.
 */
export function useOpenNotification() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { farms, farmId, setFarm } = useFarm();
  const surveillance = useSurveillanceRights();
  const read = useMutation({
    mutationFn: (item: InboxItem) => (item.readAt ? Promise.resolve(item) : api.post<InboxItem>(`/notifications/${item.id}/read`)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEY }),
  });
  const open = async (item: InboxItem): Promise<boolean> => {
    await read.mutateAsync(item);
    const target = webTargetFor(item, { programmeAlerts: surveillance.view });
    if (!target) return false;
    if (target.farmId && target.farmId !== farmId && farms.some((f) => f.id === target.farmId)) setFarm(target.farmId);
    navigate(target.path);
    return true;
  };
  return { open, error: read.error, pending: read.isPending };
}

export function useReadAll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ updated: number }>('/notifications/read-all'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEY }),
  });
}

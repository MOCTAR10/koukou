import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { mobileRouteOf } from '@/poufa/notifications';

import { fetchAdvisory, fetchBatches, fetchTasks } from '@/api';
import { fetchFarmVisits } from '@/api/poufa';
import { useAuth } from '@/auth/AuthContext';
import { buildReminderPlan, ownPlannedVisitDate } from '@/notifications/plan';
import {
  applyReminderPlan,
  clearReminders,
  ensureReminderPermission,
  onReminderTapped,
  remindersSupported,
} from '@/notifications/scheduler';
import { getReminderSettings, subscribeReminderSettings } from '@/notifications/settings';

/** Planning clock, kept out of render (see the purity convention). */
function nowDate(): Date {
  return new Date();
}

/**
 * Keeps the phone's local reminders (saisie du jour, tâches, soins prévus) in
 * line with the farm data. Renders nothing. Local notifications work in Expo
 * Go and offline — no server push involved.
 */
export function LocalReminders() {
  const { signedIn, farmId, farms, setActiveFarmId, user } = useAuth();
  const settings = useSyncExternalStore(subscribeReminderSettings, getReminderSettings);
  const active = signedIn && !!farmId && settings.enabled && remindersSupported();

  const tasks = useQuery({ queryKey: ['tasks', farmId], queryFn: () => fetchTasks(farmId), enabled: active, retry: false });
  const advisory = useQuery({ queryKey: ['advisory', farmId], queryFn: () => fetchAdvisory(farmId), enabled: active, retry: false });
  const batches = useQuery({ queryKey: ['batches', farmId], queryFn: () => fetchBatches(farmId), enabled: active, retry: false });

  // Visits of the farm: the agent's own planned next visit (403 for roles that
  // cannot read them: the plan then simply has no visit reminder).
  const visits = useQuery({ queryKey: ['visits', farmId], queryFn: () => fetchFarmVisits(farmId), enabled: active, retry: false });
  const visitsSettled = visits.isSuccess || visits.isError;

  const farmName = farms.find((f) => f.id === farmId)?.name ?? 'la ferme';

  useEffect(() => {
    if (!remindersSupported()) return;
    if (!signedIn || !settings.enabled) {
      void clearReminders().catch(() => {});
      return;
    }
    // Wait for every source: a partial plan would drop valid reminders.
    if (!tasks.data || !advisory.data || !batches.data || !visitsSettled) return;
    const plan = buildReminderPlan({
      now: nowDate(),
      settings,
      farmName,
      hasActiveBatches: batches.data.some((b) => b.status !== 'CLOTURE'),
      tasks: tasks.data,
      actions: advisory.data.actions,
      plannedVisitDate: visits.data ? ownPlannedVisitDate(visits.data, user.id) : null,
    });
    let cancelled = false;
    void (async () => {
      const permission = await ensureReminderPermission(true);
      if (cancelled || permission !== 'granted') return;
      await applyReminderPlan(plan);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [signedIn, settings, farmName, tasks.data, advisory.data, batches.data, visits.data, visitsSettled, user.id]);

  // Back to foreground: refresh the sources (the day may have rolled over).
  const refetchAll = useRef(() => {});
  refetchAll.current = () => {
    void tasks.refetch();
    void advisory.refetch();
    void batches.refetch();
    void visits.refetch();
  };
  useEffect(() => {
    if (!active) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refetchAll.current();
    });
    return () => sub.remove();
  }, [active]);

  // Latest farm context for the tap handler (subscribed once).
  const farmCtx = useRef({ farmId, farms, setActiveFarmId });
  farmCtx.current = { farmId, farms, setActiveFarmId };
  useEffect(
    () =>
      onReminderTapped((route, targetFarmId) => {
        // A push for another farm: switch to it first, or the screen would
        // show the active farm's alerts/tasks instead.
        const ctx = farmCtx.current;
        if (targetFarmId && targetFarmId !== ctx.farmId && ctx.farms.some((f) => f.id === targetFarmId)) {
          ctx.setActiveFarmId(targetFarmId);
        }
        // Server routes (push `data.route`) are written for every client: map them.
        router.push(mobileRouteOf(route) as never);
      }),
    [],
  );

  return null;
}

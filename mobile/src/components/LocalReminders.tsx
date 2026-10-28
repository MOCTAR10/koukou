import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';

import { fetchAdvisory, fetchBatches, fetchTasks } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { buildReminderPlan } from '@/notifications/plan';
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
  const { signedIn, farmId, farms } = useAuth();
  const settings = useSyncExternalStore(subscribeReminderSettings, getReminderSettings);
  const active = signedIn && !!farmId && settings.enabled && remindersSupported();

  const tasks = useQuery({ queryKey: ['tasks', farmId], queryFn: () => fetchTasks(farmId), enabled: active, retry: false });
  const advisory = useQuery({ queryKey: ['advisory', farmId], queryFn: () => fetchAdvisory(farmId), enabled: active, retry: false });
  const batches = useQuery({ queryKey: ['batches', farmId], queryFn: () => fetchBatches(farmId), enabled: active, retry: false });

  const farmName = farms.find((f) => f.id === farmId)?.name ?? 'la ferme';

  useEffect(() => {
    if (!remindersSupported()) return;
    if (!signedIn || !settings.enabled) {
      void clearReminders().catch(() => {});
      return;
    }
    // Wait for every source: a partial plan would drop valid reminders.
    if (!tasks.data || !advisory.data || !batches.data) return;
    const plan = buildReminderPlan({
      now: nowDate(),
      settings,
      farmName,
      hasActiveBatches: batches.data.some((b) => b.status !== 'CLOTURE'),
      tasks: tasks.data,
      actions: advisory.data.actions,
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
  }, [signedIn, settings, farmName, tasks.data, advisory.data, batches.data]);

  // Back to foreground: refresh the sources (the day may have rolled over).
  const refetchAll = useRef(() => {});
  refetchAll.current = () => {
    void tasks.refetch();
    void advisory.refetch();
    void batches.refetch();
  };
  useEffect(() => {
    if (!active) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refetchAll.current();
    });
    return () => sub.remove();
  }, [active]);

  useEffect(
    () =>
      onReminderTapped((route) => {
        router.push(route as never);
      }),
    [],
  );

  return null;
}

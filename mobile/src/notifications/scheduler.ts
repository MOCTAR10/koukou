import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { planSignature, type ReminderPlan } from './plan';

const CHANNEL_ID = 'rappels';

export type ReminderPermission = 'granted' | 'denied' | 'unsupported';

let lastSignature: string | null = null;
let handlerInstalled = false;

/** Web has no scheduled local notifications. */
export function remindersSupported(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

function installHandler(): void {
  if (handlerInstalled) return;
  handlerInstalled = true;
  // Reminders received while the app is open still show as a banner.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Asks for permission once (Android 13+ needs a channel before the prompt).
 * `ask: false` only reads the current state.
 */
export async function ensureReminderPermission(ask: boolean): Promise<ReminderPermission> {
  if (!remindersSupported()) return 'unsupported';
  installHandler();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Rappels de la ferme',
      description: 'Saisie du jour, tâches et soins prévus',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted';
  if (!ask || !current.canAskAgain) return 'denied';
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted ? 'granted' : 'denied';
}

/** Replaces every scheduled reminder with `plan` (no-op when unchanged). */
export async function applyReminderPlan(plan: ReminderPlan): Promise<void> {
  if (!remindersSupported()) return;
  const signature = planSignature(plan);
  if (signature === lastSignature) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (plan.daily) {
    await Notifications.scheduleNotificationAsync({
      identifier: 'daily-entry',
      content: { title: plan.daily.title, body: plan.daily.body, data: { route: plan.daily.route } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: plan.daily.hour,
        minute: plan.daily.minute,
        channelId: CHANNEL_ID,
      },
    });
  }
  for (const r of plan.dated) {
    await Notifications.scheduleNotificationAsync({
      identifier: r.key,
      content: { title: r.title, body: r.body, data: { route: r.route } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: r.at,
        channelId: CHANNEL_ID,
      },
    });
  }
  lastSignature = signature;
}

export async function clearReminders(): Promise<void> {
  if (!remindersSupported()) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  lastSignature = null;
}

/** Route attached to a tapped reminder, if any. */
export function onReminderTapped(cb: (route: string) => void): () => void {
  if (!remindersSupported()) return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const route = response.notification.request.content.data?.route;
    if (typeof route === 'string') cb(route);
  });
  return () => sub.remove();
}

import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { registerPushDevice, unregisterPushDevice } from '@/api';
import { resolvePushAvailability, type PushAvailability } from './push-availability';
import { ensureReminderPermission } from './scheduler';
import { readDeviceValue, writeDeviceValue } from './settings';

/** Must match PUSH_CHANNEL_ID in backend modules/push/push.service.ts. */
const PUSH_CHANNEL_ID = 'alertes';
/** Last token registered on the server from this phone. */
const TOKEN_KEY = 'koukou.pushToken';
/** Sign-out must not hang on a dead network. */
const UNREGISTER_TIMEOUT_MS = 3000;

function easProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

export function pushAvailability(): PushAvailability {
  return resolvePushAvailability({
    os: Platform.OS,
    isExpoGo: Constants.executionEnvironment === ExecutionEnvironment.StoreClient,
    projectId: easProjectId(),
  });
}

/**
 * Gets this phone's Expo push token and attaches it to the signed-in account
 * (the server moves the token if another account used it). Returns false when
 * push is unavailable or the permission is refused.
 */
export async function registerForPush(): Promise<boolean> {
  const projectId = easProjectId();
  if (pushAvailability() !== 'ok' || !projectId) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
      name: 'Alertes et tâches',
      description: 'Alertes rouges de la ferme, tâches assignées ou en retard',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  if ((await ensureReminderPermission(true)) !== 'granted') return false;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await registerPushDevice(token, Platform.OS === 'ios' ? 'ios' : 'android');
  writeDeviceValue(TOKEN_KEY, token);
  return true;
}

/**
 * Detaches the phone from the account (sign-out, toggle off). Best effort:
 * offline, the next sign-in on this phone moves the token anyway.
 */
export async function unregisterForPush(): Promise<void> {
  const token = readDeviceValue(TOKEN_KEY);
  if (!token) return;
  try {
    await Promise.race([
      unregisterPushDevice(token),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), UNREGISTER_TIMEOUT_MS)),
    ]);
    writeDeviceValue(TOKEN_KEY, '');
  } catch {
    /* kept: retried on the next toggle-off / sign-out */
  }
}

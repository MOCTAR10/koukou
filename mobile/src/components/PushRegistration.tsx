import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { pushAvailability, registerForPush, unregisterForPush } from '@/notifications/push';
import { getReminderSettings, subscribeReminderSettings } from '@/notifications/settings';

/**
 * Attaches this phone to the signed-in account for server push (red alerts,
 * assigned / overdue tasks). Renders nothing; no-op in Expo Go Android and in
 * builds without an EAS project. Taps are routed by <LocalReminders />.
 */
export function PushRegistration() {
  const { signedIn, user } = useAuth();
  const settings = useSyncExternalStore(subscribeReminderSettings, getReminderSettings);
  const userId = signedIn ? (user?.id ?? null) : null;
  // Account the token is attached to during this app session.
  const registeredFor = useRef<string | null>(null);

  useEffect(() => {
    if (pushAvailability() !== 'ok') return;
    if (!userId) {
      // Signed out: signOut() already detached the token from the server.
      registeredFor.current = null;
      return;
    }
    if (!settings.serverPush) {
      registeredFor.current = null;
      void unregisterForPush();
      return;
    }
    const attempt = () => {
      if (registeredFor.current === userId) return;
      void registerForPush()
        .then((ok) => {
          if (ok) registeredFor.current = userId;
        })
        // Offline at launch: retried when the app comes back to the foreground.
        .catch(() => {});
    };
    attempt();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') attempt();
    });
    return () => sub.remove();
  }, [userId, settings.serverPush]);

  return null;
}

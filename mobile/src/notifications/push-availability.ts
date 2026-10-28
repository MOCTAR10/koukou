/**
 * Whether this build can receive server push (pure, tested).
 *
 * - `unsupported`: web.
 * - `expo-go`: remote push was removed from Expo Go on Android (SDK 53+).
 * - `not-configured`: no EAS project id, so no Expo push token can be issued.
 */
export type PushAvailability = 'ok' | 'unsupported' | 'expo-go' | 'not-configured';

export function resolvePushAvailability(input: {
  os: string;
  isExpoGo: boolean;
  projectId: string | null | undefined;
}): PushAvailability {
  if (input.os !== 'android' && input.os !== 'ios') return 'unsupported';
  if (input.isExpoGo && input.os === 'android') return 'expo-go';
  if (!input.projectId) return 'not-configured';
  return 'ok';
}

/** Short French explanation shown in Réglages when push is off for the build. */
export function pushUnavailableReason(availability: PushAvailability): string | null {
  switch (availability) {
    case 'ok':
      return null;
    case 'unsupported':
      return 'Les notifications du serveur sont disponibles dans l’application mobile.';
    case 'expo-go':
      return 'Les notifications du serveur demandent l’application Fermia installée (indisponibles dans Expo Go sur Android).';
    case 'not-configured':
      return 'Les notifications du serveur ne sont pas encore activées dans cette version de l’application.';
  }
}

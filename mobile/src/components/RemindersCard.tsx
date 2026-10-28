import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Linking, Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { color, spacing } from '@/constants/theme';
import { pushAvailability } from '@/notifications/push';
import { pushUnavailableReason } from '@/notifications/push-availability';
import {
  ensureReminderPermission,
  remindersSupported,
  type ReminderPermission,
} from '@/notifications/scheduler';
import {
  getReminderSettings,
  setReminderSettings,
  subscribeReminderSettings,
} from '@/notifications/settings';

const DAILY_HOURS = [17, 18, 19, 20];

/** Réglages : rappels locaux et notifications du serveur sur ce téléphone. */
export function RemindersCard() {
  const settings = useSyncExternalStore(subscribeReminderSettings, getReminderSettings);
  const [permission, setPermission] = useState<ReminderPermission | null>(null);
  const supported = remindersSupported();
  const pushReason = pushUnavailableReason(pushAvailability());

  useEffect(() => {
    if (!supported) return;
    void ensureReminderPermission(false)
      .then(setPermission)
      .catch(() => setPermission('denied'));
  }, [supported, settings.enabled, settings.serverPush]);

  if (!supported) {
    return (
      <Card tone="default" style={styles.card}>
        <AppText size="caption" color="muted">
          Les rappels sont disponibles dans l’application mobile (Android / iOS).
        </AppText>
      </Card>
    );
  }

  const toggle = async (enabled: boolean) => {
    setReminderSettings({ ...settings, enabled });
    if (enabled) setPermission(await ensureReminderPermission(true).catch(() => 'denied' as const));
  };

  const togglePush = async (serverPush: boolean) => {
    setReminderSettings({ ...settings, serverPush });
    if (serverPush) setPermission(await ensureReminderPermission(true).catch(() => 'denied' as const));
  };

  const anyOn = settings.enabled || (settings.serverPush && !pushReason);

  return (
    <Card tone="default" style={styles.card}>
      <View style={styles.row}>
        <View style={styles.main}>
          <AppText size="bodyM" weight="semibold" color="text">
            Rappels sur ce téléphone
          </AppText>
          <AppText size="caption" color="muted">
            Saisie du jour, tâches et soins prévus (7 h le jour J). Fonctionne hors ligne.
          </AppText>
        </View>
        <Switch
          value={settings.enabled}
          onValueChange={(v) => void toggle(v)}
          trackColor={{ true: color.brand[600], false: color.ink[200] }}
        />
      </View>

      {settings.enabled ? (
        <>
          <AppText size="small" weight="semibold" color="muted">
            Rappel de saisie du jour
          </AppText>
          <View style={styles.hours}>
            {DAILY_HOURS.map((h) => (
              <Pressable
                key={h}
                accessibilityRole="button"
                accessibilityState={{ selected: settings.dailyEntryHour === h }}
                onPress={() => setReminderSettings({ ...settings, dailyEntryHour: h })}>
                <Chip label={`${h} h`} tone={settings.dailyEntryHour === h ? 'brand' : 'outline'} selected={settings.dailyEntryHour === h} />
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.row}>
        <View style={styles.main}>
          <AppText size="bodyM" weight="semibold" color="text">
            Alertes et tâches (serveur)
          </AppText>
          <AppText size="caption" color="muted">
            {pushReason ??
              'Alertes rouges de la ferme, tâches qui vous sont assignées ou en retard. Demande une connexion Internet.'}
          </AppText>
        </View>
        {pushReason ? null : (
          <Switch
            value={settings.serverPush}
            onValueChange={(v) => void togglePush(v)}
            trackColor={{ true: color.brand[600], false: color.ink[200] }}
          />
        )}
      </View>

      {anyOn && permission === 'denied' ? (
        <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()}>
          <AppText size="caption" color="danger">
            Notifications bloquées pour Fermia : touchez ici pour les autoriser dans les réglages du téléphone.
          </AppText>
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  main: { flex: 1, gap: 2 },
  hours: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});

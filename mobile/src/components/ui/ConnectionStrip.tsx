import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/auth/AuthContext';
import { palette } from '@/constants/theme';
import { useConnectionPulse } from '@/offline/useConnectionPulse';
import type { PulseTone } from '@/offline/pulse';

const TONES: Record<PulseTone, { dot: string; bg: string; text: string }> = {
  online: { dot: palette.green[500], bg: palette.green[50], text: palette.green[800] },
  syncing: { dot: palette.brand[500], bg: palette.brand[50], text: palette.brand[800] },
  offline: { dot: palette.amber[500], bg: palette.amber[100], text: palette.amber[800] },
};

/** « Hors ligne · 3 en attente » → « Hors ligne · 3 »; « Synchronisation… » → « Sync… ». Pure. */
export function compactPulseLabel(label: string): string {
  return label.replace(' en attente', '').replace('Synchronisation…', 'Sync…');
}

/**
 * Connection indicator of the web app (dot + « En ligne » / « Hors ligne ·
 * n » / « Sync… » / « Tout est envoyé ») as a small pill that sits IN the
 * header row of a screen (`ScreenHeader` renders it; custom headers place it
 * themselves). It takes no row of its own and no safe-area inset.
 */
export function ConnectionPill({ style }: { style?: StyleProp<ViewStyle> }) {
  const { farmId } = useAuth();
  const { tone, label } = useConnectionPulse(farmId);
  const t = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }, style]} accessibilityRole="text" accessibilityLiveRegion="polite" accessibilityLabel={label}>
      <View style={[styles.dot, { backgroundColor: t.dot }]} />
      <AppText size="caption" weight="semibold" numberOfLines={1} style={{ color: t.text }}>
        {compactPulseLabel(label)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexShrink: 0,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
});

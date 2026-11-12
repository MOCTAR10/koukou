import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/auth/AuthContext';
import { palette, semantic } from '@/constants/theme';
import { useConnectionPulse } from '@/offline/useConnectionPulse';
import type { PulseTone } from '@/offline/pulse';

const TONES: Record<PulseTone, { dot: string; bg: string; text: string }> = {
  online: { dot: palette.green[500], bg: palette.green[50], text: palette.green[800] },
  syncing: { dot: palette.brand[500], bg: palette.brand[50], text: palette.brand[800] },
  offline: { dot: palette.amber[500], bg: palette.amber[100], text: palette.amber[800] },
};

/**
 * Connection indicator of the web app (dot + « En ligne » / « Hors ligne ·
 * n en attente » / « Synchronisation… » / « Tout est envoyé »), as one thin
 * line at the top of the tab areas. It takes the status-bar inset itself, so
 * the screens below (SafeAreaView) add no second one. Mounted once per tab
 * layout; screens do not render it.
 */
export function ConnectionStrip() {
  const insets = useSafeAreaInsets();
  const { farmId } = useAuth();
  const { tone, label } = useConnectionPulse(farmId);
  const t = TONES[tone];
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 2 }]} accessibilityRole="text" accessibilityLiveRegion="polite">
      <View style={[styles.pill, { backgroundColor: t.bg }]}>
        <View style={[styles.dot, { backgroundColor: t.dot }]} />
        <AppText size="small" weight="semibold" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.label, { color: t.text }]}>
          {label}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: semantic.bg,
    paddingBottom: 2,
    paddingHorizontal: 12,
    alignItems: 'flex-end',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { flexShrink: 1 },
});

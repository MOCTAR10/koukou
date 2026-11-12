import React from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { palette, radii } from '@/constants/theme';

/** « Hors ligne · données du 12 nov. à 09:41 » (same wording as the dashboard). */
export function staleLabel(updatedAt: number): string {
  const d = new Date(updatedAt);
  const day = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `Hors ligne · données du ${day} à ${time}`;
}

/**
 * Discreet amber notice shown while a screen displays data that could not be
 * refreshed (`query.isError && query.data`). Renders nothing otherwise.
 */
export function StaleNotice({ show, updatedAt }: { show: boolean; updatedAt: number }) {
  if (!show || !updatedAt) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{ marginVertical: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radii.md, backgroundColor: palette.amber[50] }}>
      <AppText size="small" weight="semibold" style={{ color: palette.amber[700] }}>
        {staleLabel(updatedAt)}
      </AppText>
    </View>
  );
}

import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import type { Alert } from '@/api/types';
import { palette, radii, semantic } from '@/constants/theme';
import { speak } from '@/voice/speak';
import { WarningPicto } from './pictos/Pictos';

/**
 * The one red alert of the simple home: full width, warning pictogram, the
 * title read aloud on press. No « Appeler » button yet: the app holds no phone
 * number of the farm manager or technician to call (see the slice report).
 */
export function SimpleAlertCard({ alert }: { alert: Alert }) {
  return (
    <Pressable
      onPress={() => speak(alert.message)}
      accessibilityRole="button"
      accessibilityLabel={`Alerte : ${alert.message}. Toucher pour écouter`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <WarningPicto size={72} />
      <AppText size="h3" weight="bold" color={semantic.surface} numberOfLines={4} style={styles.text}>
        {alert.message}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radii.xl,
    backgroundColor: palette.red[600],
  },
  pressed: { backgroundColor: palette.red[700] },
  text: { flex: 1 },
});

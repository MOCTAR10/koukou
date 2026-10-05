import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { AppText } from '@/components/ui/AppText';
import { color } from '@/constants/theme';

export const JOURNAL_SPANS = [7, 30, 90] as const;
export type JournalSpan = (typeof JOURNAL_SPANS)[number];

/**
 * Filtre de période compact. `PeriodBar` est conçu pour la finance (jour exact,
 * heure, feuille) : trop lourd ici où il suffit de choisir une fenêtre glissante.
 */
export function SpanFilter({
  value,
  onChange,
  options = JOURNAL_SPANS,
}: {
  value: JournalSpan;
  onChange: (span: JournalSpan) => void;
  options?: readonly JournalSpan[];
}) {
  return (
    <View style={styles.row}>
      {options.map((span) => {
        const active = span === value;
        return (
          <Pressable
            key={span}
            onPress={() => {
              if (span === value) return;
              Haptics.selectionAsync().catch(() => {});
              onChange(span);
            }}
            style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.8 }]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${span} derniers jours`}>
            <AppText size="small" weight={active ? 'bold' : 'semibold'} color={active ? 'brand' : 'muted'}>
              {span} j
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  chipActive: {
    backgroundColor: color.brand[50],
    borderColor: color.brand[200],
  },
});
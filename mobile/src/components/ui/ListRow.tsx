import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { AppText } from './AppText';
import { color, radii, semantic } from '@/constants/theme';

interface ListRowProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  right?: string;
  onPress?: () => void;
  danger?: boolean;
}

export function ListRow({ icon, title, subtitle, badge, right, onPress, danger }: ListRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button">
      <View style={[styles.icon, danger && styles.iconDanger]}>{icon}</View>
      <View style={styles.main}>
        <View style={styles.titleRow}>
          <AppText size="body" weight="semibold" color={danger ? 'danger' : 'text'} numberOfLines={1}>
            {title}
          </AppText>
          {badge}
        </View>
        {subtitle ? (
          <AppText size="caption" color="muted" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right ? (
        <AppText size="bodyM" weight="semibold" color="muted">
          {right}
        </AppText>
      ) : null}
      <ChevronRight size={18} color={color.ink[300]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    backgroundColor: semantic.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: color.border,
  },
  pressed: {
    backgroundColor: color.surfaceAlt,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: color.brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconDanger: {
    backgroundColor: color.red[50],
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});

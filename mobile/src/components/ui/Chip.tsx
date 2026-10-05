import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from './AppText';
import { color, radii } from '@/constants/theme';

export type ChipTone = 'neutral' | 'brand' | 'accent' | 'green' | 'amber' | 'red' | 'outline' | 'solid';

const CHIPS: Record<ChipTone, { bg: string; fg: string; bd?: string }> = {
  neutral: { bg: color.surfaceAlt, fg: color.ink[700] },
  brand: { bg: color.brand[100], fg: color.brand[800] },
  accent: { bg: color.accent[50], fg: color.accent[700] },
  green: { bg: color.green[50], fg: color.green[800] },
  amber: { bg: color.amber[50], fg: color.amber[800] },
  red: { bg: color.red[50], fg: color.red[700] },
  outline: { bg: 'transparent', fg: color.ink[600], bd: color.border },
  solid: { bg: color.red[600], fg: color.surface, bd: color.red[700] },
};

interface ChipProps {
  label: string;
  tone?: ChipTone;
  dot?: boolean;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function levelTone(level: 'ROUGE' | 'JAUNE' | 'VERT' | string): ChipTone {
  if (level === 'ROUGE') return 'red';
  if (level === 'JAUNE') return 'amber';
  if (level === 'VERT') return 'green';
  return 'neutral';
}

export function Chip({ label, tone = 'neutral', dot = false, selected, style }: ChipProps) {
  const c = CHIPS[tone];
  return (
    <View
      style={[
        styles.chip,
        tone === 'solid' ? styles.solid : null,
        { backgroundColor: c.bg, borderColor: c.bd ?? 'transparent' },
        selected ? styles.selected : null,
        style,
      ]}>
      {dot && <View style={[styles.dot, { backgroundColor: c.fg }]} />}
      <AppText size="small" weight={tone === 'neutral' ? 'medium' : tone === 'solid' ? 'bold' : 'semibold'} color={c.fg}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  selected: {
    borderColor: color.brand[600],
    borderWidth: 1.5,
  },
  solid: {
    shadowColor: color.red[900],
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
});
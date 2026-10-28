import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { palette, radii, semantic, shadow } from '@/constants/theme';

type Tone = 'default' | 'brand' | 'accent' | 'alert' | 'warn' | 'green' | 'plain' | 'hero';

const TONES: Record<Tone, { bg: string; bd: string }> = {
  default: { bg: semantic.surface, bd: semantic.border },
  brand: { bg: semantic.primarySoft, bd: palette.brand[100] },
  accent: { bg: semantic.accentSoft, bd: palette.accent[100] },
  alert: { bg: semantic.dangerSoft, bd: palette.red[100] },
  warn: { bg: semantic.warnSoft, bd: palette.amber[100] },
  green: { bg: semantic.successSoft, bd: palette.green[100] },
  plain: { bg: 'transparent', bd: 'transparent' },
  hero: { bg: semantic.heroBg, bd: semantic.heroBg },
};

interface CardProps {
  children: React.ReactNode;
  tone?: Tone;
  onPress?: () => void;
  padding?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * Resting surface: hairline border + a barely-there shadow on iOS/web
 * (Android elevation stays 0, see `shadow.card`). Tinted tones are flat.
 */
export function Card({ children, tone = 'default', onPress, padding = true, style, accessibilityLabel }: CardProps) {
  const baseStyle = [
    styles.card,
    tone === 'default' && shadow.card,
    padding && styles.padded,
    { backgroundColor: TONES[tone].bg, borderColor: TONES[tone].bd },
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [baseStyle, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}>
        {children}
      </Pressable>
    );
  }
  return <View style={baseStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radii.xl,
  },
  padded: {
    padding: 16,
  },
  pressed: {
    opacity: 0.94,
    transform: [{ scale: 0.99 }],
  },
});

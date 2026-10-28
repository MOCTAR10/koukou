import React from 'react';
import { Text, StyleSheet, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { fontFor, typography, tone, type ColorToken, type TextSize, type TextWeight } from '@/constants/theme';

interface AppTextProps extends TextProps {
  size?: TextSize;
  weight?: TextWeight;
  color?: string;
  align?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
}

// Tabular figures everywhere: amounts and counters keep a stable width when
// they change, which matters on a data-heavy farm dashboard.
const NUMERIC: TextStyle = { fontVariant: ['tabular-nums'] };

function baseStyle(size: TextSize, weight: TextWeight): TextStyle {
  const t = typography[size];
  return { fontSize: t.fontSize, lineHeight: t.lineHeight, letterSpacing: t.letterSpacing, ...fontFor(weight), ...NUMERIC };
}

export function AppText({
  size = 'body',
  weight = 'regular',
  color: tint = 'text',
  align,
  style,
  ...rest
}: AppTextProps) {
  const resolved = tint.startsWith('#') || tint.startsWith('rgb') ? tint : tone(tint as ColorToken);
  return (
    <Text
      {...rest}
      style={[
        baseStyle(size, weight),
        { color: resolved },
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}

export function appTextStyles(size: TextSize, weight: TextWeight, tint: string, align?: TextStyle['textAlign']) {
  const resolved = tint.startsWith('#') || tint.startsWith('rgb') ? tint : tone(tint as ColorToken);
  return StyleSheet.flatten([
    baseStyle(size, weight),
    { color: resolved },
    align ? { textAlign: align } : null,
  ]);
}

import React from 'react';
import { Text, StyleSheet, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { MAX_FONT_SCALE } from '@/constants/textScale';
import { useScreen } from '@/theme/useScreen';
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

function baseStyle(size: TextSize, weight: TextWeight, scale = 1): TextStyle {
  const t = typography[size];
  // Échelle bornée par la largeur d'écran (0,88–1,12) : un petit téléphone descend d'un cran.
  const fontSize = scale === 1 ? t.fontSize : Math.round(t.fontSize * scale);
  const lineHeight = scale === 1 ? t.lineHeight : Math.round(t.lineHeight * scale);
  return { fontSize, lineHeight, letterSpacing: t.letterSpacing, ...fontFor(weight), ...NUMERIC };
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
  const { typeScale } = useScreen();
  return (
    <Text
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      {...rest}
      style={[
        baseStyle(size, weight, typeScale),
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

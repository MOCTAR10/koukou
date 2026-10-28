import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { AppText } from '@/components/ui/AppText';
import { palette, semantic } from '@/constants/theme';

// Light lockup (wordmark + "GÉREZ VOTRE FERME"), same file as the splash.
const LOCKUP = require('@/assets/images/splash-icon.png');
const LOCKUP_RATIO = 1117 / 458;

/**
 * Navy brand panel for the auth screens. It runs under the status bar and
 * continues the native splash (same navy, same lockup), so launch → login
 * feels like one surface.
 */
export function AuthHero({ subtitle, compact = false }: { subtitle?: string; compact?: boolean }) {
  const insets = useSafeAreaInsets();
  const lockupW = compact ? 150 : 210;
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + (compact ? 20 : 44), paddingBottom: compact ? 52 : 72 }]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="authBg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={palette.brand[700]} />
            <Stop offset="1" stopColor={palette.brand[950]} />
          </LinearGradient>
          <RadialGradient id="authGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={palette.brand[400]} stopOpacity={0.32} />
            <Stop offset="1" stopColor={palette.brand[400]} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#authBg)" />
        <Circle cx="50%" cy="38%" r="170" fill="url(#authGlow)" />
      </Svg>
      <Image
        source={LOCKUP}
        style={{ width: lockupW, height: lockupW / LOCKUP_RATIO }}
        contentFit="contain"
        accessibilityLabel="Fermia, gérez votre ferme"
      />
      {subtitle ? (
        <AppText size="bodyM" align="center" color={palette.brand[200]} style={styles.subtitle}>
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingHorizontal: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
    backgroundColor: semantic.heroBg,
  },
  subtitle: {
    marginTop: 14,
    maxWidth: 300,
  },
});

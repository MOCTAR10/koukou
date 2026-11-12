import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
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
  const { width, height } = useWindowDimensions();
  // Petit écran (hauteur utile < 700 dp) ou grand texte système : bandeau plus
  // bas pour que le formulaire reste visible sans défiler. Le logo suit la
  // largeur de l'écran (jamais plus de 62 %) : il ne peut pas être rogné.
  const tight = compact || height < 700;
  const lockupW = Math.round(Math.min(tight ? 170 : 230, width * 0.62));
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + (tight ? 20 : 44), paddingBottom: tight ? 56 : 76 }]}>
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
      {/* Le fichier du logo n'a aucune marge (la feuille touche le bord haut, le F le bord gauche) : on lui en donne une. */}
      <View style={styles.lockupBox}>
        <Image
          source={LOCKUP}
          style={{ width: lockupW, height: lockupW / LOCKUP_RATIO }}
          contentFit="contain"
          accessibilityLabel="Fermia, gérez votre ferme"
        />
      </View>
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
  lockupBox: {
    padding: 6,
  },
  subtitle: {
    marginTop: 12,
    maxWidth: 320,
  },
});

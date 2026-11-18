import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { AppText } from '@/components/ui/AppText';
import { palette } from '@/constants/theme';
import { BAND_HEIGHT } from './loginLayout';

// Same field photo and ministry logos as the web sign-in (web/public).
const PHOTO = require('@/assets/images/login-poufa.webp');
const LOGO_MAEDR = require('@/assets/images/maedr-logo-full.webp');
const LOGO_MEN = require('@/assets/images/men-logo.webp');

/** Full-screen field photo under a dark top-to-bottom gradient (legibility of the band, calm behind the card). */
export function LoginBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image source={PHOTO} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={{ top: 0, left: '30%' }} accessibilityLabel="" />
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="loginShade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.brand[950]} stopOpacity={0.82} />
            <Stop offset="0.45" stopColor={palette.brand[950]} stopOpacity={0.35} />
            <Stop offset="1" stopColor={palette.brand[950]} stopOpacity={0.6} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#loginShade)" />
      </Svg>
    </View>
  );
}

/** Two ministry logos and « Programme POUFA », all on one line. */
export function ProgrammeBand() {
  return (
    <View style={styles.band}>
      <View style={styles.logo}>
        <Image source={LOGO_MAEDR} style={styles.logoImg} contentFit="contain" accessibilityLabel="Ministère de l'Agriculture, de l'Élevage et du Développement rural" />
      </View>
      <View style={styles.logo}>
        <Image source={LOGO_MEN} style={styles.logoImg} contentFit="contain" accessibilityLabel="Ministère de l'Économie numérique, de la Digitalisation et de l'Innovation" />
      </View>
      <View style={styles.rule} />
      <AppText size="bodyM" weight="bold" color="#FFFFFF" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.title}>
        Programme POUFA
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    height: BAND_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logo: {
    width: BAND_HEIGHT,
    height: BAND_HEIGHT,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    padding: 2,
  },
  logoImg: {
    flex: 1,
  },
  rule: {
    width: 1,
    height: 22,
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginHorizontal: 2,
  },
  title: {
    flex: 1,
    letterSpacing: 1,
  },
});

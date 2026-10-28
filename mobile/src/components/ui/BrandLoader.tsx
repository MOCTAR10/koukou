import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { AppText } from '@/components/ui/AppText';
import { palette } from '@/constants/theme';

interface BrandLoaderProps {
  /** Renders as a full-screen modal on top of the current screen. */
  overlay?: boolean;
}

export function BrandLoader({ overlay = false }: BrandLoaderProps) {
  const ringScale = useRef(new Animated.Value(1)).current;
  const ringOpacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(ringScale, {
            toValue: 1.25,
            duration: 1000,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(ringScale, {
            toValue: 1,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(ringOpacity, {
            toValue: 0.15,
            duration: 1000,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity, {
            toValue: 0.6,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [ringScale, ringOpacity]);

  const content = (
    <>
      <View style={styles.logoContainer}>
        <Animated.View
          style={[styles.ring, {
            transform: [{ scale: ringScale }],
            opacity: ringOpacity,
          }]}
        />
        <View style={styles.logoCard}>
          <Image
            source={require('@/assets/images/logo-nav.png')}
            style={styles.logo}
            contentFit='contain'
          />
        </View>
      </View>
      <AppText size='body' weight='bold' color='text'>Fermia</AppText>
      <AppText size='small' color='muted'>Prépare votre ferme…</AppText>
    </>
  );

  if (!overlay) {
    return <View style={styles.wrap}>{content}</View>;
  }

  return (
    <Modal transparent statusBarTranslucent animationType='fade' visible onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.card}>{content}</View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingVertical: 64,
  },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 24, 32, 0.35)',
  },
  card: {
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 36,
    paddingVertical: 32,
    borderRadius: 24,
    backgroundColor: palette.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
  },
  logoContainer: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: palette.brand[400],
  },
  logoCard: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  logo: {
    width: 40,
    height: 40,
  },
});
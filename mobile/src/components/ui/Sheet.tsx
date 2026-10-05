import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronsUpDown, X } from 'lucide-react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from './AppText';
import { color, palette, layout, radii, shadow } from '@/constants/theme';

interface SheetProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  accentColor?: string;
  footer?: React.ReactNode;
  /** Contenu fixe affiché entre le titre et la zone défilante (ex. indicateur d'étapes). */
  stickyHeader?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}

const MAX_H = 0.92;
/** Durée de l'animation de sortie — le Modal reste monté pendant ce délai. */
const EXIT_MS = 220;

export function Sheet({ visible, title, subtitle, icon, accentColor, footer, stickyHeader, onClose, children }: SheetProps) {
  const { height: screenH } = useWindowDimensions();
  // Edge-to-edge (SDK 54) : la barre système Android (3 boutons) est dessinée
  // par-dessus le contenu — le panneau doit se terminer AU-DESSUS de cette barre.
  // Dans un Modal, `useSafeAreaInsets` peut renvoyer 0 sur certains appareils :
  // on retombe sur `initialWindowMetrics` (capturé au démarrage).
  const insets = useSafeAreaInsets();
  const navPad = Math.max(insets.bottom, initialWindowMetrics?.insets.bottom ?? 0, 8);

  // Le contenu reste monté pendant l'animation de sortie, puis démontré.
  const [mounted, setMounted] = useState(visible);
  const translateY = useSharedValue(screenH);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = screenH;
      backdropOpacity.value = 0;
      translateY.value = withSpring(0, { damping: 22, stiffness: 200, mass: 0.9 });
      backdropOpacity.value = withTiming(1, { duration: 180 });
      return;
    }
    // Fermeture : glisse vers le bas, puis démontre le Modal.
    translateY.value = withDelay(0, withTiming(screenH, { duration: EXIT_MS }));
    backdropOpacity.value = withTiming(0, { duration: 160 });
    const t = setTimeout(() => setMounted(false), EXIT_MS + 20);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const sheetAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropAnim = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const [contentH, setContentH] = useState(0);
  const [viewH, setViewH] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const scrollable = viewH > 0 && contentH > viewH + 2;
  const atBottom = offsetY > 0 && offsetY + viewH >= contentH - 20;

  return (
    <Modal
      visible={mounted}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropAnim]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: 14 + navPad },
            sheetAnim,
            accentColor && styles.sheetAccent,
            accentColor && { borderTopColor: accentColor },
          ]}>
          <View style={styles.grabber} />
          {(title || icon) && (
            <View style={styles.header}>
              <View style={styles.titleWrap}>
                {icon}
                <View style={{ flex: 1 }}>
                  <AppText size="h3" weight="bold" numberOfLines={2}>
                    {title}
                  </AppText>
                  {subtitle ? (
                    <AppText size="caption" color="muted" numberOfLines={2}>
                      {subtitle}
                    </AppText>
                  ) : null}
                </View>
              </View>
              <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
                <X size={20} color={color.ink[600]} />
              </Pressable>
            </View>
          )}
          {stickyHeader ? <View style={styles.stickyHeader}>{stickyHeader}</View> : null}
          <View style={styles.bodyZone}>
            <ScrollView
              style={styles.body}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={(_w, h) => setContentH(h)}
              onLayout={(e) => setViewH(e.nativeEvent.layout.height)}
              onScroll={(e) => setOffsetY(e.nativeEvent.contentOffset.y)}
              scrollEventThrottle={16}
            >
              {children}
            </ScrollView>
            {scrollable && !atBottom ? (
              <View style={styles.scrollHint} pointerEvents="none">
                <ChevronsUpDown size={12} color="#ffffff" strokeWidth={2.4} />
                <AppText size="caption" weight="semibold" style={{ color: '#ffffff' }}>
                  Défiler
                </AppText>
              </View>
            ) : null}
          </View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(12, 35, 49, 0.45)',
  },
  grabber: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.border,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheet: {
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: layout.maxW,
    backgroundColor: palette.paper,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    maxHeight: `${MAX_H * 100}%`,
    paddingHorizontal: layout.contentPadding,
    paddingBottom: 14,
    paddingTop: 12,
    ...shadow.fab,
  },
  sheetAccent: {
    borderTopWidth: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 10,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  close: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    backgroundColor: color.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    gap: 12,
  },
  bodyZone: {
    position: 'relative',
    flexShrink: 1,
  },
  scrollHint: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(12, 35, 49, 0.62)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  stickyHeader: {
    backgroundColor: palette.paper,
    marginHorizontal: -layout.contentPadding,
    paddingHorizontal: layout.contentPadding,
    paddingBottom: 8,
  },
  footer: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
});

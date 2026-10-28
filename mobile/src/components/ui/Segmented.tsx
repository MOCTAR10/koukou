import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import * as Haptics from 'expo-haptics';

import { AppText } from './AppText';
import { color, radii, semantic } from '@/constants/theme';

export interface SegmentedOption<T extends string> {
  key: T;
  label: string;
  icon?: React.ReactNode;
  /** Accent color (hex) used for the active label/icon. Defaults to brand. */
  tint?: string;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (key: T) => void;
  /** Emit a selection haptic when the active option changes (same as the bottom tab bar). */
  haptic?: boolean;
}

interface Metric {
  x: number;
  width: number;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function Segmented<T extends string>({ options, value, onChange, haptic = false }: SegmentedProps<T>) {
  const [metrics, setMetrics] = useState<Record<string, Metric>>({});
  const translateX = useRef(new Animated.Value(0)).current;
  const pillWidth = useRef(new Animated.Value(0)).current;

  const select = (key: T) => {
    if (key === value) return;
    if (haptic) Haptics.selectionAsync().catch(() => {});
    onChange(key);
  };

  const activeKey = value;
  const target = metrics[activeKey];
  const activeTint = options.find((o) => o.key === value)?.tint ?? semantic.primary;

  useEffect(() => {
    const t = target;
    if (!t) return;
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: t.x,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(pillWidth, {
        toValue: t.width,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, target?.x, target?.width, translateX, pillWidth]);

  const onLayout = (key: T) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setMetrics((prev) => {
      const cur = prev[key];
      if (cur && Math.abs(cur.x - x) < 0.5 && Math.abs(cur.width - width) < 0.5) return prev;
      return { ...prev, [key]: { x, width } };
    });
  };

  return (
    <View style={styles.track}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.slide,
          {
            backgroundColor: hexToRgba(activeTint, 0.16),
            borderColor: hexToRgba(activeTint, 0.42),
            transform: [{ translateX }],
            width: pillWidth,
          },
        ]}
      />
      {options.map((o) => {
        const active = o.key === value;
        const tint = o.tint ?? semantic.primary;
        return (
          <React.Fragment key={o.key}>
            <Pressable
              onPress={() => select(o.key)}
              onLayout={onLayout(o.key)}
              style={styles.option}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}>
              {o.icon}
              <AppText
                size="caption"
                weight={active ? 'bold' : 'semibold'}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                style={styles.optionLabel}
                color={active ? tint : color.ink[400]}>
                {o.label}
              </AppText>
            </Pressable>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: color.surfaceAlt,
    borderRadius: radii.md,
    padding: 3,
    gap: 0,
  },
  slide: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  option: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: 32,
    borderRadius: radii.sm,
    paddingHorizontal: 2,
  },
  optionLabel: {
    fontSize: 11.5,
    lineHeight: 15,
    flexShrink: 1,
  },
});

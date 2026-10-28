import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Image, type ImageProps } from 'expo-image';

import { AppText } from './AppText';
import { radii, semantic } from '@/constants/theme';
import type { TextSize } from '@/constants/theme';

type ButtonTone = 'primary' | 'brand' | 'accent' | 'ghost' | 'danger' | 'success';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  tone?: ButtonTone;
  icon?: LucideIcon;
  image?: ImageProps['source'];
  size?: 'xs' | 'sm' | 'md' | 'lg';
  labelSize?: TextSize;
  block?: boolean;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  tone = 'primary',
  icon: Icon,
  image,
  size = 'lg',
  labelSize = 'bodyM',
  block = true,
  disabled = false,
  loading = false,
  style,
}: ButtonProps) {
  const t = TONES[tone];
  const active = !disabled && !loading;

  return (
    <Pressable
      onPress={active ? onPress : undefined}
      disabled={!active}
      style={({ pressed }) => [
        styles.button,
        block && styles.block,
        { backgroundColor: t.bg, borderColor: t.border ?? t.bg },
        size === 'lg' ? styles.lg : size === 'md' ? styles.md : size === 'sm' ? styles.sm : styles.xs,
        pressed && active && (tone === 'ghost' ? styles.ghostPressed : { backgroundColor: t.pressed }),
        pressed && active && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !active, busy: loading }}>
      {loading ? (
        <ActivityIndicator color={t.fg} />
      ) : (
        <View style={[styles.inner, size === 'xs' && styles.xsInner, size === 'sm' && styles.smInner]}>
          {image ? (
            <Image
              source={image}
              style={size === 'lg' ? styles.imageLg : size === 'md' ? styles.imageMd : styles.imageSm}
              contentFit="contain"
              accessibilityLabel=""
            />
          ) : null}
          {Icon ? <Icon size={size === 'lg' ? 20 : size === 'md' ? 17 : size === 'sm' ? 14 : 12} color={t.fg} strokeWidth={2.4} /> : null}
          <AppText size={labelSize} weight="semibold" color={t.fg}>
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

// Flat fills, no drop shadow: depth comes from colour, not from blur. Every
// filled tone keeps a white label at >= 4.2:1 (semibold), see `semantic`.
const TONES: Record<ButtonTone, { bg: string; fg: string; pressed: string; border?: string }> = {
  primary: { bg: semantic.primary, fg: semantic.textOnFill, pressed: semantic.primaryPressed },
  brand: { bg: semantic.primary, fg: semantic.textOnFill, pressed: semantic.primaryPressed },
  accent: { bg: semantic.accentFill, fg: semantic.textOnFill, pressed: '#A9520C' },
  success: { bg: semantic.successFill, fg: semantic.textOnFill, pressed: '#3D6E2B' },
  danger: { bg: semantic.dangerFill, fg: semantic.textOnFill, pressed: '#99301F' },
  ghost: { bg: semantic.surface, fg: semantic.text, pressed: semantic.surfaceAlt, border: semantic.borderStrong },
};

const styles = StyleSheet.create({
  button: {
    borderRadius: radii.md + 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  block: {
    alignSelf: 'stretch',
  },
  lg: {
    height: 52,
    paddingHorizontal: 20,
  },
  md: {
    height: 44,
    paddingHorizontal: 16,
  },
  sm: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: radii.md,
  },
  xs: {
    height: 30,
    paddingHorizontal: 10,
    borderRadius: radii.sm + 2,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  smInner: {
    gap: 6,
  },
  xsInner: {
    gap: 4,
  },
  imageLg: {
    width: 26,
    height: 26,
  },
  imageMd: {
    width: 20,
    height: 20,
  },
  imageSm: {
    width: 16,
    height: 16,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  ghostPressed: {
    backgroundColor: semantic.surfaceAlt,
  },
  disabled: {
    opacity: 0.4,
  },
});

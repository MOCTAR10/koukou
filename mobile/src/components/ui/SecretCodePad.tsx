import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Check, Delete } from 'lucide-react-native';

import { AppText } from './AppText';
import { TapScale } from './motion/TapScale';
import { appendCodeDigit, CODE_MAX, CODE_MIN, removeCodeDigit } from './secretCodePad.logic';
import { color, palette, radii, shadow, spacing } from '@/constants/theme';
import { durations, easing, enter, reduceMotion } from '@/constants/motion';

const ROWS: readonly string[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

export type SecretCodePadSize = 'md' | 'sm';

const SIZE = {
  md: { key: 66, label: 26, gap: 14, padPad: spacing.md, badge: 54 },
  sm: { key: 50, label: 22, gap: 8, padPad: 12, badge: 40 },
} as const;

interface SecretCodePadProps {
  value: string;
  onChange: (next: string) => void;
  /** Déclenché par la touche ✓ (validation explicite — codes > 6 chiffres supportés). */
  onSubmit?: () => void;
  disabled?: boolean;
  /** Nombre de points affichés avant tout chiffre saisi. */
  minLength?: number;
  maxLength?: number;
  /** La touche ✓ n'est active que si vrai (ex. code ≥ minLength). */
  submitEnabled?: boolean;
  label?: string;
  caption?: string;
  /** `md` (66px) par défaut ; `sm` (50px) pour les écrans restreints sans défilement. */
  size?: SecretCodePadSize;
}

/** Point « suivant » : respire doucement pour montrer où la saisie arrive. */
function NextDot() {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: durations.slow, easing: easing.inOut }),
      -1,
      true,
      undefined,
      reduceMotion,
    );
  }, [pulse]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.35, 1]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.82, 1]) }],
  }));

  return <Animated.View style={[styles.dot, styles.dotEmpty, styles.dotNext, style]} />;
}

interface PadKeyProps {
  onPress: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  variant: 'digit' | 'action';
  size: SecretCodePadSize;
  children: React.ReactNode;
  accessibilityLabel: string;
}

function PadKey({ onPress, onLongPress, disabled, variant, size, children, accessibilityLabel }: PadKeyProps) {
  const s = SIZE[size];
  return (
    <TapScale
      scaleTo={0.9}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.key,
        { width: s.key, height: s.key, borderRadius: s.key / 2 },
        variant === 'action' && styles.keyAction,
        disabled && styles.keyDisabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}>
      {children}
    </TapScale>
  );
}

/**
 * Pavé numérique « verre & néon » pour la saisie du code secret : la saisie est
 * dessinée dans l'app (pas de clavier système), avec retour haptique et
 * animations respectant le réglage « réduire les animations ».
 */
export function SecretCodePad({
  value,
  onChange,
  onSubmit,
  disabled = false,
  minLength = CODE_MIN,
  maxLength = CODE_MAX,
  submitEnabled = true,
  label = 'Code secret',
  caption,
  size = 'md',
}: SecretCodePadProps) {
  const s = SIZE[size];
  const slots = Math.max(minLength, value.length);
  const canSubmit = submitEnabled && !disabled && value.length >= minLength;
  const canDelete = !disabled && value.length > 0;

  const press = (digit: string) => {
    if (disabled) return;
    Haptics.selectionAsync().catch(() => {});
    onChange(appendCodeDigit(value, digit, maxLength));
  };

  const backspace = () => {
    if (!canDelete) return;
    Haptics.selectionAsync().catch(() => {});
    onChange(removeCodeDigit(value));
  };

  const clear = () => {
    if (!canDelete) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onChange('');
  };

  const submit = () => {
    if (!canSubmit || !onSubmit) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onSubmit();
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <AppText size="label" color="muted">
          {label}
        </AppText>
        {caption ? (
          <AppText size="caption" color="faint">
            {caption}
          </AppText>
        ) : null}
      </View>

      <View style={styles.dots} accessibilityLabel={`${value.length} chiffre${value.length > 1 ? 's' : ''} saisi${value.length > 1 ? 's' : ''}`}>
        {Array.from({ length: slots }).map((_, i) => {
          if (i < value.length) {
            return <Animated.View key={i} entering={enter.zoom()} style={[styles.dot, styles.dotFilled]} />;
          }
          if (i === value.length) return <NextDot key={i} />;
          return <View key={i} style={[styles.dot, styles.dotEmpty]} />;
        })}
      </View>

      <View style={[styles.pad, { gap: s.gap, paddingVertical: s.padPad, paddingHorizontal: s.padPad }]}>
        {ROWS.map((row, rIndex) => (
          <View key={rIndex} style={[styles.row, { gap: s.gap }]}>
            {row.map((digit) => (
              <PadKey
                key={digit}
                size={size}
                variant="digit"
                disabled={disabled || value.length >= maxLength}
                onPress={() => press(digit)}
                accessibilityLabel={digit}>
                <AppText weight="bold" color="text" style={{ fontSize: s.label, lineHeight: s.label + 4 }}>
                  {digit}
                </AppText>
              </PadKey>
            ))}
          </View>
        ))}

        <View style={[styles.row, { gap: s.gap }]}>
          <PadKey
            size={size}
            variant="action"
            disabled={!canDelete}
            onPress={backspace}
            onLongPress={clear}
            accessibilityLabel="Effacer le dernier chiffre">
            <Delete size={s.key * 0.36} color={canDelete ? color.brand[600] : palette.ink[300]} strokeWidth={2.2} />
          </PadKey>

          <PadKey
            size={size}
            variant="digit"
            disabled={disabled || value.length >= maxLength}
            onPress={() => press('0')}
            accessibilityLabel="0">
            <AppText weight="bold" color="text" style={{ fontSize: s.label, lineHeight: s.label + 4 }}>
              0
            </AppText>
          </PadKey>

          <PadKey
            size={size}
            variant="action"
            disabled={!canSubmit}
            onPress={submit}
            accessibilityLabel="Valider le code">
            <View
              style={[
                styles.submitBadge,
                { width: s.badge, height: s.badge, borderRadius: s.badge / 2 },
                canSubmit && styles.submitBadgeOn,
              ]}>
              <Check size={s.key * 0.36} color={canSubmit ? palette.surface : palette.ink[300]} strokeWidth={2.6} />
            </View>
          </PadKey>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  header: {
    gap: 2,
  },
  dots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    minHeight: 18,
    alignItems: 'center',
    paddingVertical: 2,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  dotEmpty: {
    borderWidth: 1.5,
    borderColor: color.brand[200],
    backgroundColor: palette.surface,
  },
  dotNext: {
    borderColor: color.brand[400],
    backgroundColor: color.brand[50],
  },
  dotFilled: {
    backgroundColor: color.brand[500],
    borderWidth: 1,
    borderColor: color.brand[300],
    shadowColor: color.brand[400],
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  pad: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: 'rgba(32,96,128,0.05)',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  key: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    ...shadow.card,
  },
  keyAction: {
    backgroundColor: 'rgba(235,244,250,0.9)',
    borderColor: color.brand[100],
  },
  keyDisabled: {
    opacity: 0.45,
  },
  submitBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceAlt,
  },
  submitBadgeOn: {
    backgroundColor: color.brand[600],
    shadowColor: color.brand[400],
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
});

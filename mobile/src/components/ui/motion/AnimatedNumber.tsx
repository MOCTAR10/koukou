import React, { useEffect } from 'react';
import { Platform, Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import Animated, { ReduceMotion, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';

export function frGroup(n: number): string {
  'worklet';
  const sign = n < 0 ? '-' : '';
  const digits = String(Math.round(Math.abs(n)));
  const parts: string[] = [];
  for (let i = digits.length; i > 0; i -= 3) parts.unshift(digits.slice(Math.max(0, i - 3), i));
  return `${sign}${parts.join('\u202F')}`;
}

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  style?: StyleProp<TextStyle>;
}

export function AnimatedNumber({ value, duration = 480, format = frGroup, style }: AnimatedNumberProps) {
  const display = useSharedValue(value);

  useEffect(() => {
    display.value = withTiming(value, { duration, reduceMotion: ReduceMotion.System });
  }, [display, value, duration]);

  const animatedProps = useAnimatedProps<TextProps & { text: string }>(() => ({ text: format(display.value) }));

  if (Platform.OS === 'web') {
    return <Text style={style}>{format(value)}</Text>;
  }

  return <Animated.Text animatedProps={animatedProps} style={style} />;
}
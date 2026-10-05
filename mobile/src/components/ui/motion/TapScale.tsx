import React from 'react';
import { Pressable, type PressableProps } from 'react-native';
import {
  createAnimatedComponent,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { durations, springed, timed } from '@/constants/motion';

const AnimatedPressable = createAnimatedComponent(Pressable);

interface TapScaleProps extends PressableProps {
  scaleTo?: number;
}

export function TapScale({ scaleTo = 0.97, style, children, onPressIn, onPressOut, disabled, ...rest }: TapScaleProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      style={[style, animatedStyle]}
      onPressIn={(e) => {
        if (!disabled) {
          scale.value = timed(scaleTo, { duration: durations.quick });
        }
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = springed(1);
        onPressOut?.(e);
      }}>
      {children}
    </AnimatedPressable>
  );
}
import {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  LinearTransition,
  ReduceMotion,
  ZoomIn,
  type AnimatableValue,
  type BaseAnimationBuilder,
  type WithSpringConfig,
  type WithTimingConfig,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

export const durations = {
  quick: 150,
  fast: 220,
  base: 320,
  slow: 480,
} as const;

export const easing = {
  out: Easing.out(Easing.cubic),
  outStrong: Easing.out(Easing.poly(4)),
  inOut: Easing.inOut(Easing.cubic),
} as const;

export const springs = {
  press: { damping: 17, stiffness: 260, mass: 0.6 } satisfies WithSpringConfig,
  card: { damping: 20, stiffness: 180, mass: 0.9 } satisfies WithSpringConfig,
  hero: { damping: 16, stiffness: 130, mass: 1 } satisfies WithSpringConfig,
} as const;

export const reduceMotion = ReduceMotion.System;

export const layout = {
  list: LinearTransition.springify().damping(springs.card.damping).stiffness(springs.card.stiffness).mass(springs.card.mass).reduceMotion(reduceMotion),
} as const;

export function timed<T extends AnimatableValue>(toValue: T, config: Partial<WithTimingConfig> = {}): T {
  return withTiming(toValue, { duration: durations.base, easing: easing.out, ...config });
}

export function springed<T extends AnimatableValue>(toValue: T, config: WithSpringConfig = {}): T {
  return withSpring(toValue, { ...springs.card, ...config } as WithSpringConfig);
}

export const enter = {
  fade: () => FadeIn.duration(durations.base).easing(easing.out).reduceMotion(reduceMotion),
  fadeDown: () => FadeInDown.duration(durations.base).easing(easing.out).reduceMotion(reduceMotion),
  fadeUp: () => FadeInUp.duration(durations.base).easing(easing.out).reduceMotion(reduceMotion),
  zoom: () => ZoomIn.duration(durations.fast).easing(easing.out).reduceMotion(reduceMotion),
} as const;

export function staggeredEnter(index: number, interval = 80): BaseAnimationBuilder {
  return FadeInDown.delay(index * interval).duration(durations.base).easing(easing.out).reduceMotion(reduceMotion);
}
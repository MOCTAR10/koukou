import type { Transition, Variants } from 'motion/react';

export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const durations = {
  fast: 0.2,
  base: 0.35,
  slow: 0.6,
} as const;

export const pageTm: Transition = {
  duration: durations.base,
  ease: EASE,
};

export const stagger: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.07, delayChildren: 0.04 },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: pageTm },
};
import '@/global.css';

import { Platform } from 'react-native';

export const palette = {
  brand: {
    50: '#EBF4FA',
    100: '#D4E6F3',
    200: '#A8CBDF',
    300: '#7BADC6',
    400: '#4F94BE',
    500: '#2F81AB',
    600: '#206080',
    700: '#1B4F6B',
    800: '#163E57',
    900: '#112E41',
    950: '#0C2331',
  },
  accent: {
    50: '#FEF3E7',
    100: '#FCE4C8',
    200: '#FBC792',
    300: '#F9A85C',
    400: '#F78D2B',
    500: '#F08010',
    600: '#E07210',
    700: '#C25F0E',
    800: '#9B4C0B',
    900: '#753908',
  },
  green: {
    50: '#F0F7EC',
    100: '#E0EFDA',
    200: '#C1DEB2',
    300: '#9FCC8C',
    400: '#7DB868',
    500: '#6CAA58',
    600: '#60A040',
    700: '#4C8A33',
    800: '#3D6E2B',
    900: '#315724',
  },
  amber: {
    50: '#FBF7E9',
    100: '#F6EDCA',
    200: '#ECD890',
    300: '#E3C45E',
    400: '#E6B423',
    500: '#E0A400',
    600: '#C08D00',
    700: '#997100',
    800: '#735600',
    900: '#533F00',
  },
  red: {
    50: '#FBF0EE',
    100: '#F8E0DB',
    200: '#EFBFB6',
    300: '#E79A8D',
    400: '#DD7362',
    500: '#D5432B',
    600: '#B93A26',
    700: '#99301F',
    800: '#7A271A',
    900: '#5C1E14',
  },
  ink: {
    900: '#10222F',
    800: '#163A4E',
    700: '#23485E',
    600: '#3C5A6E',
    500: '#58788C',
    400: '#7A96A8',
    300: '#A7BCC9',
    200: '#CDDBE3',
    100: '#E3EBF0',
  },
  paper: '#F7F9FA',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF3F6',
  border: '#DDE7EC',
} as const;

export const color = palette;

export type ColorToken =
  | 'text'
  | 'muted'
  | 'faint'
  | 'bg'
  | 'card'
  | 'surface'
  | 'surfaceAlt'
  | 'border'
  | 'brand'
  | 'accent'
  | 'success'
  | 'warn'
  | 'danger';

export function tone(t: ColorToken): string {
  switch (t) {
    case 'brand':
      return palette.brand[600];
    case 'accent':
      return palette.accent[500];
    case 'success':
      return palette.green[600];
    case 'warn':
      return palette.amber[500];
    case 'danger':
      return palette.red[500];
    case 'text':
      return palette.ink[900];
    case 'muted':
      return palette.ink[400];
    case 'faint':
      return palette.ink[300];
    case 'bg':
      return palette.paper;
    case 'card':
      return palette.surface;
    case 'surface':
      return palette.surface;
    case 'surfaceAlt':
      return palette.surfaceAlt;
    case 'border':
      return palette.border;
    default:
      return palette.ink[900];
  }
}

export const gradeColor: Record<'EXCELLENT' | 'BON' | 'MOYEN' | 'CRITIQUE', string> = {
  EXCELLENT: palette.green[500],
  BON: palette.green[600],
  MOYEN: palette.amber[500],
  CRITIQUE: palette.red[500],
};

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  massive: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  pill: 999,
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const typography = {
  display: { fontSize: 44, lineHeight: 48, fontWeight: '900' },
  h1: { fontSize: 28, lineHeight: 34, fontWeight: '800' },
  h2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  h3: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  bodyM: { fontSize: 15, lineHeight: 21, fontWeight: '500' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  small: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  label: { fontSize: 11, lineHeight: 14, fontWeight: '700' },
} as const;

export type TextSize = keyof typeof typography;
export type TextWeight = 'regular' | 'medium' | 'semibold' | 'bold';

const weightMap: Record<TextWeight, '400' | '500' | '600' | '700' | '800' | '900'> = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '800',
};

type TextStyleWeight =
  | '100'
  | '200'
  | '300'
  | '400'
  | '500'
  | '600'
  | '700'
  | '800'
  | '900';

export function resolveWeight(weight: TextWeight): TextStyleWeight {
  return weightMap[weight];
}

export const shadow = {
  card: Platform.select({
    default: {
      shadowColor: palette.brand[950],
      shadowOpacity: 0.06,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    web: {
      boxShadow: `0 4px 16px ${palette.brand[950]}0f`,
    },
  }),
  fab: Platform.select({
    default: {
      shadowColor: palette.brand[950],
      shadowOpacity: 0.3,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 6,
    },
    web: {
      boxShadow: `0 6px 18px ${palette.brand[950]}55`,
    },
  }),
  tabBar: Platform.select({
    default: {
      shadowColor: palette.brand[950],
      shadowOpacity: 0.06,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },
    web: {
      boxShadow: `0 3px 10px ${palette.brand[950]}14`,
    },
  }),
} as const;

export const layout = {
  maxW: 800,
  screenPadding: spacing.lg,
  contentPadding: spacing.lg,
  bottomInset: Platform.select({ ios: 40, android: 64, web: 24 }) ?? 24,
  /**
   * Espace sous le dernier contenu d'un écran, mesuré depuis le HAUT de la
   * barre d'onglets : la scène occupe tout l'espace au-dessus d'elle (le tab
   * bar est en flux normal dans `BottomTabView`). Il suffit de dépasser le
   * débord du FAB — son anneau monte à 35px au-dessus de la pastille.
   */
  bottomPad: 52,
} as const;

export function fmt(n: number): string {
  return n.toLocaleString('fr-FR');
}

export function fmtFcfa(n: number): string {
  return `${fmt(Math.round(n))} FCFA`;
}

export function emoji(cond?: string | null): string {
  const c = (cond ?? '').toLowerCase();
  if (c.includes('pluie')) return '🌧️';
  if (c.includes('orage')) return '⛈️';
  if (c.includes('nuage')) return '⛅';
  if (c.includes('soleil') || c.includes('clair')) return '☀️';
  return '🌤️';
}
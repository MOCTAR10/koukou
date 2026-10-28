import React from 'react';
import { Cloud, CloudLightning, CloudRain, CloudSun, Sun, type LucideIcon } from 'lucide-react-native';

import { palette } from '@/constants/theme';

/** Same condition matching as the legacy `emoji()` helper, drawn as line icons. */
function pick(condition?: string | null): { Icon: LucideIcon; tint: string } {
  const c = (condition ?? '').toLowerCase();
  if (c.includes('orage')) return { Icon: CloudLightning, tint: palette.brand[700] };
  if (c.includes('pluie')) return { Icon: CloudRain, tint: palette.brand[600] };
  if (c.includes('nuage')) return { Icon: Cloud, tint: palette.ink[500] };
  if (c.includes('soleil') || c.includes('clair')) return { Icon: Sun, tint: palette.amber[500] };
  return { Icon: CloudSun, tint: palette.amber[600] };
}

export function WeatherIcon({ condition, size = 18 }: { condition?: string | null; size?: number }) {
  const { Icon, tint } = pick(condition);
  return <Icon size={size} color={tint} strokeWidth={2} />;
}

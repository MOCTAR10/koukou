import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { ChevronDown, ChevronRight, Droplets, ShieldCheck } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { AppText } from '@/components/ui/AppText';
import { WeatherIcon } from '@/components/ui/WeatherIcon';
import { palette, radii, semantic } from '@/constants/theme';
import type { HealthGrade, MortalityStatus } from '@/api/types';

/** Label tint on the navy surface (≈ 9:1). */
export const HERO_LABEL = palette.brand[200];

/** Light steps of each ramp: readable status colours on the navy hero. */
export const HERO_TINT = {
  good: palette.green[300],
  warn: palette.amber[300],
  bad: palette.red[300],
} as const;

export const GRADE_ON_DARK: Record<HealthGrade, string> = {
  EXCELLENT: HERO_TINT.good,
  BON: HERO_TINT.good,
  MOYEN: HERO_TINT.warn,
  CRITIQUE: HERO_TINT.bad,
};
export const GRADE_LABEL: Record<HealthGrade, string> = {
  EXCELLENT: 'Excellent',
  BON: 'Bon',
  MOYEN: 'Moyen',
  CRITIQUE: 'Critique',
};
export const MORTALITY_ON_DARK: Record<MortalityStatus, string> = {
  normal: HERO_TINT.good,
  elevated: HERO_TINT.warn,
  critical: HERO_TINT.bad,
};

export interface HeroStat {
  label: string;
  value: string;
  /** Value colour; white by default. */
  tint?: string;
  /** Small coloured dot before the value (status). */
  dot?: string;
  /** Short qualifier after the value (e.g. grade). */
  suffix?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
}

interface HomeHeroProps {
  /** Domain cue: the glow turns green for agriculture. */
  domain?: 'aviculture' | 'agriculture';
  farmName: string;
  verified: boolean;
  onFarmPress: () => void;
  headline: {
    eyebrow: string;
    value: string;
    sub?: string;
    onPress?: () => void;
    accessibilityLabel?: string;
  };
  stats: HeroStat[];
  weather?: { condition?: string | null; temperatureC?: number | null; humidityPct?: number | null } | null;
  hint?: string;
}

function tap(fn?: () => void) {
  if (!fn) return undefined;
  return () => {
    Haptics.selectionAsync().catch(() => {});
    fn();
  };
}

/**
 * "Today at a glance": the one dark surface of a home screen. It carries the
 * headline number and up to three quiet stats, so everything below it can
 * stay light. Shared by the livestock and agriculture homes.
 */
export function HomeHero({ domain = 'aviculture', farmName, verified, onFarmPress, headline, stats, weather, hint }: HomeHeroProps) {
  const glow = domain === 'agriculture' ? palette.green[400] : palette.brand[400];
  const gradId = `heroBg-${domain}`;
  const glowId = `heroGlow-${domain}`;

  return (
    <View style={styles.card}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={palette.brand[800]} />
            <Stop offset="1" stopColor={palette.brand[950]} />
          </LinearGradient>
          <RadialGradient id={glowId} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={glow} stopOpacity={0.35} />
            <Stop offset="1" stopColor={glow} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradId})`} />
        <Circle cx="92%" cy="8%" r="120" fill={`url(#${glowId})`} />
      </Svg>

      {/* Farm + weather */}
      <View style={styles.topRow}>
        <Pressable
          onPress={tap(onFarmPress)}
          style={({ pressed }) => [styles.farmPill, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Ferme ${farmName}, changer de ferme`}>
          {verified ? <ShieldCheck size={13} color={HERO_TINT.good} strokeWidth={2.2} /> : null}
          <AppText size="small" weight="semibold" color={palette.brand[50]} numberOfLines={1} style={styles.shrink}>
            {farmName}
          </AppText>
          <ChevronDown size={14} color={HERO_LABEL} strokeWidth={2.2} />
        </Pressable>
        {weather ? (
          <View style={styles.inline}>
            <WeatherIcon condition={weather.condition} size={16} />
            <AppText size="small" weight="semibold" color={palette.brand[50]}>
              {weather.temperatureC ?? '—'}°
            </AppText>
            {weather.humidityPct != null ? (
              <>
                <Droplets size={11} color={HERO_LABEL} />
                <AppText size="small" color={HERO_LABEL}>
                  {weather.humidityPct}%
                </AppText>
              </>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Headline number */}
      <Pressable
        onPress={tap(headline.onPress)}
        disabled={!headline.onPress}
        style={({ pressed }) => [styles.headline, pressed && styles.pressed]}
        accessibilityRole={headline.onPress ? 'button' : 'summary'}
        accessibilityLabel={headline.accessibilityLabel ?? `${headline.eyebrow} ${headline.value}`}>
        <AppText size="label" color={HERO_LABEL} style={styles.eyebrow}>
          {headline.eyebrow}
        </AppText>
        <View style={styles.headlineRow}>
          <AppText size="display" weight="bold" color={semantic.textOnFill} numberOfLines={1} adjustsFontSizeToFit style={styles.shrink}>
            {headline.value}
          </AppText>
          {headline.onPress ? <ChevronRight size={20} color={HERO_LABEL} style={styles.headlineChevron} /> : null}
        </View>
        {headline.sub ? (
          <AppText size="caption" color={HERO_LABEL}>
            {headline.sub}
          </AppText>
        ) : null}
      </Pressable>

      {stats.length > 0 ? (
        <>
          <View style={styles.divider} />
          <View style={styles.statsRow}>
            {stats.map((s, i) => (
              <React.Fragment key={s.label}>
                {i > 0 ? <View style={styles.statDivider} /> : null}
                <Pressable
                  onPress={tap(s.onPress)}
                  disabled={!s.onPress}
                  style={({ pressed }) => [styles.stat, i === 0 && stats.length > 2 && styles.statWide, pressed && styles.pressed]}
                  accessibilityRole={s.onPress ? 'button' : 'text'}
                  accessibilityLabel={s.accessibilityLabel ?? `${s.label} : ${s.value}${s.suffix ? `, ${s.suffix}` : ''}`}>
                  <AppText size="small" color={HERO_LABEL} numberOfLines={1}>
                    {s.label}
                  </AppText>
                  <View style={styles.inline}>
                    {s.dot ? <View style={[styles.dot, { backgroundColor: s.dot }]} /> : null}
                    <AppText
                      size="bodyM"
                      weight="semibold"
                      color={s.tint ?? semantic.textOnFill}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                      style={styles.shrink}>
                      {s.value}
                    </AppText>
                    {s.suffix ? (
                      <AppText size="small" color={s.dot ?? HERO_LABEL} numberOfLines={1}>
                        {s.suffix}
                      </AppText>
                    ) : null}
                  </View>
                </Pressable>
              </React.Fragment>
            ))}
          </View>
        </>
      ) : null}

      {hint ? (
        <AppText size="small" color={HERO_LABEL} numberOfLines={2} style={styles.hint}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 4,
    borderRadius: radii.xxl,
    overflow: 'hidden',
    backgroundColor: semantic.heroBg,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  farmPill: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  shrink: {
    flexShrink: 1,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headline: {
    marginTop: 16,
    gap: 2,
  },
  eyebrow: {
    letterSpacing: 1,
  },
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headlineChevron: {
    marginTop: 4,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginVertical: 14,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  stat: {
    flex: 1,
    gap: 3,
    paddingRight: 8,
  },
  statWide: {
    flex: 1.3,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginRight: 12,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  hint: {
    marginTop: 12,
  },
  pressed: {
    opacity: 0.75,
  },
});

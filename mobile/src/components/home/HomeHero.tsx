import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { ChevronDown, ChevronRight, Droplets, ShieldCheck } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { AppText } from '@/components/ui/AppText';
import { WeatherIcon } from '@/components/ui/WeatherIcon';
import { fmt, fmtFcfa, palette, radii, semantic } from '@/constants/theme';
import type { HealthGrade, MortalityStatus } from '@/api/types';

/** Grade tints readable on the navy hero (light steps of each ramp). */
const GRADE_ON_DARK: Record<HealthGrade, string> = {
  EXCELLENT: palette.green[300],
  BON: palette.green[300],
  MOYEN: palette.amber[300],
  CRITIQUE: palette.red[300],
};
const GRADE_LABEL: Record<HealthGrade, string> = {
  EXCELLENT: 'Excellent',
  BON: 'Bon',
  MOYEN: 'Moyen',
  CRITIQUE: 'Critique',
};
const MORTALITY_ON_DARK: Record<MortalityStatus, string> = {
  normal: palette.green[300],
  elevated: palette.amber[300],
  critical: palette.red[300],
};

const LABEL = palette.brand[200];

interface HomeHeroProps {
  farmName: string;
  verified: boolean;
  onFarmPress: () => void;
  liveStock: number;
  activeLots: number;
  lotsForSale: number;
  onCheptelPress: () => void;
  collectedLabel: string;
  collectedFcfa: number;
  canCaisse: boolean;
  onCaissePress: () => void;
  healthScore: number;
  grade: HealthGrade;
  onHealthPress: () => void;
  mortalityPercent: number | null;
  mortalityStatus: MortalityStatus;
  weather?: { condition?: string | null; temperatureC?: number | null; humidityPct?: number | null } | null;
  weatherHint?: string;
}

function tap(fn: () => void) {
  return () => {
    Haptics.selectionAsync().catch(() => {});
    fn();
  };
}

/**
 * "Today at a glance": the one dark surface on the home screen. It carries
 * the three numbers a farmer checks first (live birds, cash in, health), so
 * everything below it can stay quiet.
 */
export function HomeHero(p: HomeHeroProps) {
  const gradeTint = GRADE_ON_DARK[p.grade];
  const score = Math.max(0, Math.min(100, Math.round(p.healthScore)));

  return (
    <View style={styles.card}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="heroBg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={palette.brand[800]} />
            <Stop offset="1" stopColor={palette.brand[950]} />
          </LinearGradient>
          <RadialGradient id="heroGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={palette.brand[400]} stopOpacity={0.35} />
            <Stop offset="1" stopColor={palette.brand[400]} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroBg)" />
        <Circle cx="92%" cy="8%" r="120" fill="url(#heroGlow)" />
      </Svg>

      {/* Farm + weather */}
      <View style={styles.topRow}>
        <Pressable
          onPress={tap(p.onFarmPress)}
          style={({ pressed }) => [styles.farmPill, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Ferme ${p.farmName}, changer de ferme`}>
          {p.verified ? <ShieldCheck size={13} color={palette.green[300]} strokeWidth={2.2} /> : null}
          <AppText size="small" weight="semibold" color={palette.brand[50]} numberOfLines={1} style={styles.farmName}>
            {p.farmName}
          </AppText>
          <ChevronDown size={14} color={LABEL} strokeWidth={2.2} />
        </Pressable>
        {p.weather ? (
          <View style={styles.weather}>
            <WeatherIcon condition={p.weather.condition} size={16} />
            <AppText size="small" weight="semibold" color={palette.brand[50]}>
              {p.weather.temperatureC ?? '—'}°
            </AppText>
            {p.weather.humidityPct != null ? (
              <>
                <Droplets size={11} color={LABEL} />
                <AppText size="small" color={LABEL}>
                  {p.weather.humidityPct}%
                </AppText>
              </>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Headline number */}
      <Pressable
        onPress={tap(p.onCheptelPress)}
        style={({ pressed }) => [styles.headline, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${fmt(p.liveStock)} oiseaux vivants, voir le cheptel`}>
        <AppText size="label" color={LABEL} style={styles.eyebrow}>
          CHEPTEL VIVANT
        </AppText>
        <View style={styles.headlineRow}>
          <AppText size="display" weight="bold" color={semantic.textOnFill} numberOfLines={1} adjustsFontSizeToFit>
            {fmt(p.liveStock)}
          </AppText>
          <ChevronRight size={20} color={LABEL} style={styles.headlineChevron} />
        </View>
        <AppText size="caption" color={LABEL}>
          {p.activeLots} lot{p.activeLots > 1 ? 's' : ''} actif{p.activeLots > 1 ? 's' : ''}
          {p.lotsForSale > 0 ? ` · ${p.lotsForSale} en vente` : ''}
        </AppText>
      </Pressable>

      <View style={styles.divider} />

      {/* Three quiet stats */}
      <View style={styles.statsRow}>
        <Pressable
          onPress={p.canCaisse ? tap(p.onCaissePress) : undefined}
          disabled={!p.canCaisse}
          style={({ pressed }) => [styles.stat, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`${p.collectedLabel} : ${fmtFcfa(p.collectedFcfa)}`}>
          <AppText size="small" color={LABEL} numberOfLines={1}>
            {p.collectedLabel}
          </AppText>
          <AppText size="bodyM" weight="semibold" color={semantic.textOnFill} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {fmtFcfa(p.collectedFcfa)}
          </AppText>
        </Pressable>
        <View style={styles.statDivider} />
        <Pressable
          onPress={tap(p.onHealthPress)}
          style={({ pressed }) => [styles.stat, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Santé ${score} %, ${GRADE_LABEL[p.grade]}`}>
          <AppText size="small" color={LABEL}>
            Santé
          </AppText>
          <View style={styles.inline}>
            <View style={[styles.dot, { backgroundColor: gradeTint }]} />
            <AppText size="bodyM" weight="semibold" color={semantic.textOnFill}>
              {score}%
            </AppText>
            <AppText size="small" color={gradeTint} numberOfLines={1}>
              {GRADE_LABEL[p.grade]}
            </AppText>
          </View>
        </Pressable>
        <View style={styles.statDivider} />
        <View style={[styles.stat, styles.statNarrow]}>
          <AppText size="small" color={LABEL}>
            Mortalité
          </AppText>
          <AppText size="bodyM" weight="semibold" color={MORTALITY_ON_DARK[p.mortalityStatus]}>
            {p.mortalityPercent != null ? `${p.mortalityPercent.toFixed(1)}%` : '—'}
          </AppText>
        </View>
      </View>

      {p.weatherHint ? (
        <AppText size="small" color={LABEL} numberOfLines={2} style={styles.hint}>
          {p.weatherHint}
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
  farmName: {
    flexShrink: 1,
  },
  weather: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
    flex: 1.3,
    gap: 3,
    paddingRight: 8,
  },
  statNarrow: {
    flex: 0.9,
    paddingRight: 0,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginRight: 12,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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

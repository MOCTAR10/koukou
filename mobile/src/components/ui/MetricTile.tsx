import React from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { ArrowRight } from 'lucide-react-native';

import { AppText } from './AppText';
import { Card } from './Card';
import { palette, radii, semantic } from '@/constants/theme';
import type { LucideIcon } from 'lucide-react-native';

interface MetricTileProps {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'green' | 'amber' | 'red' | 'brand' | 'accent';
  icon?: LucideIcon;
  /** Use a custom image — triggers split layout: image left, stats right. */
  iconImage?: ImageSourcePropType;
  /** Narrower stats column so the image gets more room. */
  narrowStats?: boolean;
  onPress?: () => void;
  compact?: boolean;
  /** Force 3-column layout (for 3-card rows). */
  threeCol?: boolean;
  /** Highlighted sub text with trailing arrow. */
  subHighlight?: boolean;
  /** Extra style overrides (e.g. flexBasis for 4-column rows). */
  style?: StyleProp<ViewStyle>;
  /** Max label lines (default 1). Use 2 for narrow 4-column tiles so full labels stay visible. */
  labelLines?: number;
  /** Stack the layout vertically (icon on top, label full-width) for very narrow tiles. */
  labelBelow?: boolean;
}

const TONES = {
  default: palette.ink[900],
  green: palette.green[600],
  amber: palette.amber[500],
  red: palette.red[500],
  brand: semantic.primary,
  accent: palette.accent[500],
} as const;

const TONE_BG = {
  default: 'rgba(40, 45, 51, 0.08)',
  green: 'rgba(96, 160, 64, 0.12)',
  amber: 'rgba(245, 158, 11, 0.13)',
  red: 'rgba(220, 38, 38, 0.11)',
  brand: 'rgba(32, 96, 128, 0.12)',
  accent: 'rgba(240, 128, 16, 0.13)',
} as const;

export function MetricTile({ label, value, sub, tone = 'default', icon: Icon, iconImage, narrowStats = false, onPress, compact = false, threeCol = false, subHighlight = false, style, labelLines = 1, labelBelow = false }: MetricTileProps) {
  const fg = TONES[tone];

  /* ── Split layout when iconImage is provided ── */
  if (iconImage) {
    return (
      <Card onPress={onPress} padding={false} style={[styles.tile, compact && styles.tileCompact, threeCol && styles.tileThreeCol, style]}>
        <View style={styles.splitRow}>
          <View style={[styles.splitImageWrap, narrowStats && styles.splitImageWrapWide]}>
            <Image source={iconImage} style={[styles.splitImage, narrowStats && styles.splitImageWide]} resizeMode='contain' />
          </View>
          <View style={[styles.splitStats, narrowStats && styles.splitStatsNarrow]}>
            <AppText size='small' weight='semibold' color='muted' numberOfLines={labelLines || 1} style={{ lineHeight: 14 }}>{label}</AppText>
            <AppText size='h2' weight='bold' color={fg} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55} style={{ lineHeight: 24 }}>{value}</AppText>
            {sub ? (
              <AppText size='small' color='faint' numberOfLines={1} style={{ lineHeight: 13 }}>{sub}</AppText>
            ) : null}
          </View>
        </View>
      </Card>
    );
  }

  /* ── Standard icon layout ── */
  return (
    <Card onPress={onPress} padding={false} style={[styles.tile, compact && styles.tileCompact, threeCol && styles.tileThreeCol, style]}>
      {labelBelow ? (
        /* ── Vertical layout (icon top, full-width label) for narrow tiles ── */
        <View style={[styles.inner, compact && styles.innerCompact, threeCol && styles.innerThreeCol, styles.innerStacked]}>
          {Icon ? (
            <View style={[styles.iconWrap, { backgroundColor: TONE_BG[tone] }]}>
              <Icon size={threeCol ? 12 : 15} color={fg} />
            </View>
          ) : null}
          <AppText size="small" weight="semibold" color="muted" numberOfLines={labelLines} align="center" style={styles.labelFull}>
            {label}
          </AppText>
          <AppText
            size={threeCol ? 'small' : compact ? 'body' : 'h3'}
            weight="bold"
            color={fg}
            align="center"
            style={threeCol ? styles.valueThreeCol : styles.value}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.55}
          >
            {value}
          </AppText>
          {sub ? (
            <AppText size="small" color="faint" align="center" style={styles.sub}>{sub}</AppText>
          ) : null}
        </View>
      ) : (
        <View style={[styles.inner, compact && styles.innerCompact, threeCol && styles.innerThreeCol]}>
          <View style={styles.head}>
            {Icon ? (
              <View style={[styles.iconWrap, { backgroundColor: TONE_BG[tone] }]}>
                <Icon size={threeCol ? 11 : compact ? 13 : 15} color={fg} />
              </View>
            ) : null}
            <AppText size="small" weight="semibold" color="muted" numberOfLines={labelLines} style={styles.label}>
              {label}
            </AppText>
          </View>
          <AppText
            size={threeCol ? 'small' : compact ? 'body' : 'h3'}
            weight="bold"
            color={fg}
            style={threeCol ? styles.valueThreeCol : styles.value}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.55}
          >
            {value}
          </AppText>
          {sub ? (
            <View style={styles.subRow}>
              <AppText size="small" color={subHighlight ? fg : 'faint'} weight={subHighlight ? 'semibold' : 'medium'} style={styles.sub}>
                {sub}
              </AppText>
              {subHighlight && <ArrowRight size={12} color={fg} />}
            </View>
          ) : null}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radii.lg,
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 0,
  },
  tileCompact: {
    flexBasis: '47%',
  },
  tileThreeCol: {
    flexBasis: '30%',
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  inner: {
    padding: 12,
    gap: 5,
  },
  innerCompact: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 2,
  },
  innerThreeCol: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 3,
  },
  innerStacked: {
    alignItems: 'center',
  },
  labelFull: {
    width: '100%',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 20,
  },
  iconWrap: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
  },
  value: {
    fontSize: 22,
    lineHeight: 26,
  },
  valueThreeCol: {
    fontSize: 16,
    lineHeight: 20,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  sub: {
    lineHeight: 15,
  },
  /* ── Split layout (image left half, stats right half) ── */
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderRadius: radii.lg,
    height: 78,
  },
  splitImageWrap: {
    width: '50%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  splitImageWrapWide: {
    width: '50%',
    marginLeft: -6,
    aspectRatio: undefined,
    overflow: 'hidden',
  },
  splitImage: {
    width: '90%',
    height: '90%',
    borderRadius: radii.md,
  },
  splitImageWide: {
    width: '150%',
    height: '150%',
    borderRadius: 0,
    marginLeft: '-12%',
    marginTop: '8%',
  },
  splitStats: {
    flex: 1,
    gap: 0,
    paddingVertical: 6,
    paddingRight: 14,
    paddingLeft: 10,
  },
  splitStatsNarrow: {
    paddingRight: 4,
    paddingLeft: 0,
    marginLeft: -2,
    paddingVertical: 2,
  },
});

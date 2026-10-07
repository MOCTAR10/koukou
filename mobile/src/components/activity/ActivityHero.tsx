import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Activity, TriangleAlert, Wallet } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import type { DashboardData } from '@/api/types';
import { fmt, fmtFcfa } from '@/constants/theme';
import { normalizeMortalityStatus } from '@/constants/health';
import { FEED_STOCK_CRITICAL_DAYS } from '@/constants/stock';

/** Teintes volontairement sourdes : l'écran informe, il n'alerte pas. */
const TONE_GOOD = '#A9DCBC';
const TONE_BAD = '#F0C6B8';
const TONE_WARN = '#EBD5A2';

function HeroStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.stat}>
      <AppText size="small" weight="bold" style={{ color: tone ?? 'rgba(255,255,255,0.92)' }} numberOfLines={1}>
        {value}
      </AppText>
      <AppText size="small" style={{ color: 'rgba(255,255,255,0.55)' }} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

/** Bandeau du jour : l'encaissement en accroche, le reste en lecture rapide. */
export function ActivityHero({ d, dateLabel }: { d: DashboardData; dateLabel: string }) {
  // `/dashboard` ne renvoie pas `mortalityStatus` : on normalise sur place.
  const status = normalizeMortalityStatus(d.mortalityStatus, d.mortalityPercent);
  const mortalityTone = status === 'critical' ? TONE_BAD : status === 'elevated' ? TONE_WARN : TONE_GOOD;
  const watchAlerts = d.alerts?.rouge ?? 0;

  return (
    <View style={styles.hero}>
      <View pointerEvents="none" style={styles.glow} />

      <View style={styles.heroTop}>
        <View style={styles.heroBadge}>
          <Activity size={13} color="#CBDDE9" />
          <AppText size="small" weight="semibold" style={{ color: '#CBDDE9' }} numberOfLines={1}>
            {dateLabel}
          </AppText>
        </View>
        {watchAlerts > 0 ? (
          <View style={styles.watchBadge}>
            <TriangleAlert size={12} color={TONE_WARN} />
            <AppText size="small" weight="bold" style={{ color: TONE_WARN }}>
              {watchAlerts} à surveiller
            </AppText>
          </View>
        ) : null}
      </View>

      <View style={styles.heroAmountRow}>
        <Wallet size={18} color="rgba(255,255,255,0.62)" />
        <AppText size="display" weight="bold" style={{ color: '#FFFFFF' }} numberOfLines={1}>
          {fmtFcfa(d.collectedTodayFcfa)}
        </AppText>
        <AppText size="small" style={{ color: 'rgba(255,255,255,0.55)' }} numberOfLines={1}>
          encaissé
        </AppText>
      </View>

      <View style={styles.statsRow}>
        <HeroStat label="Stock vivant" value={fmt(d.liveStock)} />
        <View style={styles.statDivider} />
        <HeroStat
          label="Autonomie provende"
          value={d.feedAutonomyDays != null ? `${Math.round(d.feedAutonomyDays)} j` : '—'}
          tone={d.feedAutonomyDays != null && d.feedAutonomyDays < FEED_STOCK_CRITICAL_DAYS ? TONE_WARN : undefined}
        />
        <View style={styles.statDivider} />
        <HeroStat
          label="Mortalité"
          value={d.mortalityPercent != null ? `${d.mortalityPercent.toFixed(1)} %` : '—'}
          tone={mortalityTone}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: '#163E57',
    borderRadius: 20,
    padding: 16,
    gap: 10,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: -80,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  watchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(235, 213, 162, 0.14)',
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  stat: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  statDivider: {
    width: 1,
    height: 26,
    marginHorizontal: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
});
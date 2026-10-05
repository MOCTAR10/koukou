import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Activity, TrendingDown, TrendingUp } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import type { DashboardData, LeaderboardRow } from '@/api/types';
import { color, gradeColor } from '@/constants/theme';

/** Vue « Rapports » : la semaine en un coup d'œil, puis le classement des lots. */
export function WeeklyReport({ d }: { d: DashboardData }) {
  return (
    <Card tone="default" style={styles.card}>
      <View style={styles.gradeRow}>
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <AppText size="caption" color="muted">
            Santé de la ferme
          </AppText>
          <AppText size="bodyM" weight="bold" color="text" numberOfLines={1}>
            {d.health.grade === 'EXCELLENT'
              ? 'Excellente'
              : d.health.grade === 'BON'
                ? 'Bonne'
                : d.health.grade === 'MOYEN'
                  ? 'Moyenne'
                  : 'À suivre'}
          </AppText>
        </View>
        <View style={[styles.gradeBadge, { backgroundColor: `${gradeColor[d.health.grade]}26` }]}>
          <AppText size="small" weight="bold" style={{ color: gradeColor[d.health.grade] }}>
            {d.health.grade}
          </AppText>
        </View>
      </View>

      <View style={styles.trendRow}>
        <Trend icon={Activity} label="mortalité" delta={d.deltas.mortalityDelta} suffix=" pts" invert />
        <Trend icon={Activity} label="ponte" delta={d.deltas.layRateDeltaPct ?? 0} suffix=" pts" />
        <Trend
          icon={Activity}
          label="provende"
          delta={d.deltas.feedDeltaKg ?? 0}
          suffix=" kg"
          invert
        />
      </View>

      <AppText size="small" color="faint" numberOfLines={2}>
        Écarts de la semaine par rapport à la précédente.
      </AppText>
    </Card>
  );
}

function Trend({
  icon: Icon,
  label,
  delta,
  suffix,
  invert,
}: {
  icon: LucideIcon;
  label: string;
  delta: number;
  suffix: string;
  invert?: boolean;
}) {
  if (!Number.isFinite(delta) || delta === 0) {
    return (
      <View style={styles.trend}>
        <Icon size={12} color={color.ink[300]} />
        <AppText size="small" color="muted" numberOfLines={1}>
          {label} stable
        </AppText>
      </View>
    );
  }
  // `invert` : une hausse est défavorable (mortalité, provende).
  const good = invert ? delta < 0 : delta > 0;
  return (
    <View style={styles.trend}>
      {delta > 0 ? <TrendingUp size={12} color={good ? '#5B8F45' : '#B37C6A'} /> : <TrendingDown size={12} color={good ? '#5B8F45' : '#B37C6A'} />}
      <AppText size="small" weight="semibold" color={good ? 'success' : 'danger'} numberOfLines={1}>
        {delta > 0 ? '+' : ''}
        {Math.round(delta * 10) / 10}
        {suffix}
      </AppText>
      <AppText size="small" color="muted" numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

/** Classement des lots sur l'indice de performance. */
export function PerformanceList({ rows }: { rows: LeaderboardRow[] }) {
  const ranked = rows
    .filter((r) => r.perfIndex != null)
    .slice(0, 5);

  if (ranked.length === 0) {
    return (
      <View style={styles.empty}>
        <AppText size="small" color="faint" align="center">
          Pas encore assez de données pour classer les lots.
        </AppText>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {ranked.map((row, i) => (
        <View key={row.batchId} style={styles.perfRow}>
          <AppText size="small" weight="bold" color="faint" style={styles.rank}>
            {i + 1}
          </AppText>
          <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <AppText size="bodyM" weight="semibold" color="text" numberOfLines={1}>
              {row.batchName ?? 'Lot'}
            </AppText>
            <AppText size="small" color="muted" numberOfLines={1}>
              {row.gmqGramsPerDay != null ? `GMQ ${Math.round(row.gmqGramsPerDay)} g/j` : `${row.ageDays} j`}
              {row.fcr != null ? ` · IC ${row.fcr.toFixed(2)}` : ''}
              {row.layRatePercent != null ? ` · ponte ${Math.round(row.layRatePercent)}%` : ''}
            </AppText>
          </View>
          <AppText size="bodyM" weight="bold" color="text" numberOfLines={1}>
            {Math.round(row.perfIndex as number)}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    padding: 14,
  },
  gradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gradeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  trendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  trend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: color.surfaceAlt,
  },
  list: {
    gap: 8,
  },
  perfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  rank: {
    width: 16,
  },
  empty: {
    paddingVertical: 18,
  },
});
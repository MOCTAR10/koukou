import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Target } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { fetchBandComparison, fetchBandHistory, fetchDeclarativeStock } from '@/api/poufa';
import { cachedRead } from '@/offline/ref-cache';
import { COMPARISON_METRICS, type CellTone } from '@/poufa/comparison';
import { CONDUITE_LABEL, HEADLINE, currentBand, findIndicator, latestComparison, officialText } from '@/poufa/official-headline';
import { color, fmt, palette, semantic } from '@/constants/theme';

const TONE_COLOR: Record<CellTone, string> = {
  better: palette.green[700],
  worse: palette.red[600],
  same: color.ink[600],
  none: color.ink[600],
};

interface Props {
  farmId: string;
  /** Feed autonomy of the farm (dashboard), shown when no declarative feed stock is tracked. */
  feedAutonomyDays: number | null;
  onOpen: (batchId: string) => void;
}

/**
 * « Ma bande en cours » (POUFA lot A indic, CDC n° 12-15 and 36): the official
 * indicators of the newest open band (programme formulas), its headcount, the
 * feed stock and the latest week compared with the programme average. Fermia's
 * own figures stay below, labelled as « indicateur de conduite (Fermia) ».
 */
export function CurrentBandCard({ farmId, feedAutonomyDays, onOpen }: Props) {
  const history = useQuery({
    queryKey: ['band-history', farmId, 'EN_COURS'],
    queryFn: () => cachedRead(`band-history.${farmId}.EN_COURS`, () => fetchBandHistory(farmId, 'EN_COURS')),
    retry: false,
  });
  const band = currentBand(history.data);
  const comparison = useQuery({
    queryKey: ['band-comparison', farmId, band?.id ?? ''],
    queryFn: () => cachedRead(`band-comparison.${farmId}.${band!.id}`, () => fetchBandComparison(farmId, band!.id)),
    enabled: !!band,
    retry: false,
  });
  const stock = useQuery({
    queryKey: ['declarative-stock', farmId],
    queryFn: () => cachedRead(`declarative-stock.${farmId}`, () => fetchDeclarativeStock(farmId)),
    retry: false,
  });

  if (!band) return null;
  const indicators = band.summary?.indicators ?? [];
  const week = latestComparison(comparison.data);
  const feed = (stock.data?.rows ?? []).filter((r) => r.intrantFamily === 'ALIMENT');
  const feedUnit = feed.length > 0 && feed.every((r) => r.unitCode === feed[0].unitCode) ? (feed[0].unitLabel ?? feed[0].unitCode) : null;
  const feedStock = feedUnit ? feed.reduce((s, r) => s + r.stock, 0) : null;

  return (
    <Card onPress={() => onOpen(band.id)} style={styles.card} accessibilityLabel="Ma bande en cours, ouvrir la bande">
      <View style={styles.head}>
        <Target size={16} color={semantic.primary} />
        <AppText size="bodyM" weight="semibold" color="text" style={{ flex: 1 }} numberOfLines={1}>
          Ma bande en cours · {band.code ?? band.batchName ?? 'Bande'}
        </AppText>
        <ChevronRight size={16} color={semantic.primary} />
      </View>
      <AppText size="small" color="muted">
        Indicateurs officiels (formules du programme){band.ageDays != null ? ` · J${band.ageDays}` : ''}
      </AppText>
      <View style={styles.grid}>
        {HEADLINE.map(({ key, label }) => (
          <View key={key} style={styles.cell}>
            <AppText size="small" color="muted">
              {label}
            </AppText>
            <AppText size="body" weight="bold" color="text">
              {officialText(findIndicator(indicators, key))}
            </AppText>
          </View>
        ))}
      </View>
      <View style={styles.row}>
        <AppText size="small" color="muted" style={{ flex: 1 }}>
          Effectif {fmt(band.quantityAlive)} / {fmt(band.quantityAtStart)}
        </AppText>
        <AppText size="small" color="muted">
          {feedStock != null
            ? `Stock aliment ${feedStock.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ${feedUnit}`
            : feedAutonomyDays != null
              ? `Autonomie aliment ${feedAutonomyDays} j`
              : 'Stock aliment —'}
        </AppText>
      </View>
      {week ? (
        <View style={styles.compare}>
          <AppText size="small" weight="semibold" color="text">
            Semaine {week.week} ({week.ages}) vs moyenne du programme
          </AppText>
          {COMPARISON_METRICS.map((m) => {
            const c = week.cells[m.key];
            return (
              <View key={m.key} style={styles.row}>
                <AppText size="small" color="muted" style={{ width: 72 }}>
                  {m.label}
                </AppText>
                <AppText size="small" weight="bold" style={{ flex: 1, color: TONE_COLOR[c.tone] }}>
                  {c.band}
                </AppText>
                <AppText size="small" color="muted">
                  Programme {c.programme}
                </AppText>
              </View>
            );
          })}
        </View>
      ) : null}
      <AppText size="small" color="faint">
        Les chiffres Fermia plus bas sont un {CONDUITE_LABEL}.
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
  cell: { width: '25%', gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  compare: { gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.ink[200], paddingTop: 8 },
});

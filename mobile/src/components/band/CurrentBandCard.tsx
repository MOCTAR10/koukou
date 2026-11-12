import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Target } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { fetchBandHistory, fetchDeclarativeStock } from '@/api/poufa';
import { cachedRead } from '@/offline/ref-cache';
import { currentBand, findIndicator, officialText } from '@/poufa/official-headline';
import { fmt, semantic } from '@/constants/theme';

interface Props {
  farmId: string;
  /** Feed autonomy of the farm (dashboard), shown when no declarative feed stock is tracked. */
  feedAutonomyDays: number | null;
  onOpen: (batchId: string) => void;
}

/**
 * « Ma bande en cours »: one compact entry to the band sheet. It names the
 * newest open band and gives what the home screen shows nowhere else
 * (headcount vs placed, viability, feed stock). Mortality, IC and GMQ are the
 * home tiles; the comparison with the programme average is in the band sheet.
 */
export function CurrentBandCard({ farmId, feedAutonomyDays, onOpen }: Props) {
  const history = useQuery({
    queryKey: ['band-history', farmId, 'EN_COURS'],
    queryFn: () => cachedRead(`band-history.${farmId}.EN_COURS`, () => fetchBandHistory(farmId, 'EN_COURS')),
    retry: false,
  });
  const band = currentBand(history.data);
  const stock = useQuery({
    queryKey: ['declarative-stock', farmId],
    queryFn: () => cachedRead(`declarative-stock.${farmId}`, () => fetchDeclarativeStock(farmId)),
    retry: false,
  });

  if (!band) return null;
  const viability = findIndicator(band.summary?.indicators ?? [], 'viabilite');
  const feed = (stock.data?.rows ?? []).filter((r) => r.intrantFamily === 'ALIMENT');
  const feedUnit = feed.length > 0 && feed.every((r) => r.unitCode === feed[0].unitCode) ? (feed[0].unitLabel ?? feed[0].unitCode) : null;
  const feedStock = feedUnit ? feed.reduce((s, r) => s + r.stock, 0) : null;
  const facts = [
    `Effectif ${fmt(band.quantityAlive)} / ${fmt(band.quantityAtStart)}`,
    viability ? `Viabilité ${officialText(viability)}` : null,
    feedStock != null
      ? `Aliment ${feedStock.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ${feedUnit}`
      : feedAutonomyDays != null
        ? `Aliment ${feedAutonomyDays} j`
        : null,
  ].filter(Boolean);

  return (
    <Card onPress={() => onOpen(band.id)} style={styles.card} accessibilityLabel="Ma bande en cours, ouvrir la bande">
      <View style={styles.head}>
        <Target size={16} color={semantic.primary} />
        <AppText size="bodyM" weight="semibold" color="text" style={{ flex: 1 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          Ma bande en cours · {band.code ?? band.batchName ?? 'Bande'}
          {band.ageDays != null ? ` · J${band.ageDays}` : ''}
        </AppText>
        <ChevronRight size={16} color={semantic.primary} />
      </View>
      <AppText size="small" color="muted" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {facts.join(' · ')}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4, marginTop: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});

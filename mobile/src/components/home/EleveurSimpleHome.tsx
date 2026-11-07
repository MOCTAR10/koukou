import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, BookOpen, Bird, HeartPulse, TrendingUp, Wheat } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MetricTile } from '@/components/ui/MetricTile';
import { useFarmProfile } from '@/hooks/useFarmProfile';
import { useQuickCapture } from '@/components/capture/QuickCaptureProvider';
import { fetchBandHistory } from '@/api/poufa';
import { cachedRead } from '@/offline/ref-cache';
import { currentBand, findIndicator, officialText } from '@/poufa/official-headline';
import { FEED_STOCK_CRITICAL_DAYS, FEED_STOCK_WARN_DAYS } from '@/constants/stock';
import { fmt, palette, semantic } from '@/constants/theme';

interface Props {
  farmId: string;
  /** Live headcount of the farm (dashboard), used when no open band answers. */
  liveStock: number;
  redAlerts: number;
  feedAutonomyDays: number | null;
  onOpenAlerts: () => void;
}

/**
 * Simple home of the éleveur, modelled on the paper sheet: the red alert first,
 * « Saisie du jour », then headcount, mortality, feed autonomy, IC and GMQ.
 * One official value per indicator (programme formulas); the rest of the
 * dashboard sits behind « Plus d’indicateurs ».
 */
export function EleveurSimpleHome({ farmId, liveStock, redAlerts, feedAutonomyDays, onOpenAlerts }: Props) {
  const { hasPermission, fermiaReadOnly } = useFarmProfile();
  const { openDaily } = useQuickCapture();
  const history = useQuery({
    queryKey: ['band-history', farmId, 'EN_COURS'],
    queryFn: () => cachedRead(`band-history.${farmId}.EN_COURS`, () => fetchBandHistory(farmId, 'EN_COURS')),
    retry: false,
  });
  const band = currentBand(history.data);
  const indicators = band?.summary?.indicators ?? [];
  const canEnter = hasPermission('saisie:creer') && !fermiaReadOnly;
  const autonomyTone =
    feedAutonomyDays == null ? 'default' : feedAutonomyDays < FEED_STOCK_CRITICAL_DAYS ? 'red' : feedAutonomyDays < FEED_STOCK_WARN_DAYS ? 'amber' : 'green';

  return (
    <View style={styles.wrap}>
      {redAlerts > 0 ? (
        <Card onPress={onOpenAlerts} style={styles.alert} accessibilityLabel="Alertes rouges à traiter, ouvrir les alertes">
          <AlertTriangle size={20} color={palette.red[500]} />
          <View style={{ flex: 1 }}>
            <AppText size="bodyM" weight="semibold" color="danger">
              {redAlerts} alerte{redAlerts > 1 ? 's' : ''} rouge{redAlerts > 1 ? 's' : ''} à traiter en priorité
            </AppText>
            <AppText size="small" color="muted">
              Consulter les alertes et leurs recommandations
            </AppText>
          </View>
        </Card>
      ) : null}
      {canEnter ? <Button label="Saisie du jour" icon={BookOpen} onPress={() => openDaily()} /> : null}
      <View style={styles.grid}>
        <MetricTile
          label="Effectif vivant"
          value={fmt(band?.quantityAlive ?? liveStock)}
          sub={band?.quantityAtStart != null ? `sur ${fmt(band.quantityAtStart)} mis en place` : undefined}
          icon={Bird}
          style={styles.half}
        />
        <MetricTile label="Mortalité" value={officialText(findIndicator(indicators, 'taux_mortalite'))} icon={HeartPulse} style={styles.half} />
        <MetricTile
          label="Autonomie provende"
          value={feedAutonomyDays != null ? `${feedAutonomyDays} j` : '—'}
          tone={autonomyTone}
          icon={Wheat}
          style={styles.half}
        />
        <MetricTile label="IC" value={officialText(findIndicator(indicators, 'ic'))} icon={Activity} style={styles.half} />
        <MetricTile label="GMQ" value={officialText(findIndicator(indicators, 'gmq_g_j'))} icon={TrendingUp} style={styles.half} />
      </View>
      <AppText size="small" color="faint">
        Valeurs officielles du programme, pour la bande en cours.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginTop: 12 },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: semantic.dangerSoft, borderColor: palette.red[200] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  half: { flexBasis: '48%', flexGrow: 1 },
});

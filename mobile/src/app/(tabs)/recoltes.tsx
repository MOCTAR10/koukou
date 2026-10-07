import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ArrowRight, Tractor } from 'lucide-react-native';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { EmptyState } from '@/components/ui/EmptyState';
import { MetricTile } from '@/components/ui/MetricTile';
import { useFarmProfile } from '@/hooks/useFarmProfile';
import { useAuth } from '@/auth/AuthContext';
import { fetchParcelles } from '@/api';
import type { Parcelle } from '@/api/types';
import {
  CROP_CATEGORY_LABELS,
  CULTURE_EMOJI,
  adviceForCulture,
  cultureStage,
  formatHarvestDate,
  PARCELLE_STATUS_LABELS,
  waterNeedLabel,
} from '@/constants/agriculture';
import { color, palette, radii } from '@/constants/theme';

const STATUS_CHIP_TONE: Record<Parcelle['status'], 'green' | 'amber' | 'neutral' | 'red'> = {
  ACTIVE: 'green',
  PREPARATION: 'amber',
  JACHERE: 'amber',
  CLOTURE: 'neutral',
};

/**
 * Planning & conseils culture : parcelles triées par échéance de récolte,
 * stade du cycle et connaissance personnalisée par type de culture
 * (comme les recommandations élevage). La journalisation quantitative des
 * récoltes (quantités, pesées, rendement) arrive en phase 2.
 */
export default function RecoltesScreen() {
  const router = useRouter();
  const { farmId } = useAuth();
  const { hasPermission } = useFarmProfile();
  const canManage = hasPermission('agri:gerer');

  const parcellesQuery = useQuery({
    queryKey: ['parcelles', farmId],
    queryFn: () => fetchParcelles(farmId),
  });
  const parcelles = React.useMemo(() => parcellesQuery.data ?? [], [parcellesQuery.data]);

  const plan = useMemo(() => {
    const withStage = parcelles
      .filter((p) => p.status !== 'CLOTURE')
      .map((p) => ({ parcelle: p, stage: cultureStage(p.plantedAt, p.culture.defaultCycleDays) }))
      .sort((a, b) => {
        // À récolter d'abord, puis les échéances les plus proches, puis non plantées.
        const aDate = a.stage?.harvestDate?.getTime() ?? Infinity;
        const bDate = b.stage?.harvestDate?.getTime() ?? Infinity;
        return aDate - bDate;
      });
    const duSoon = withStage.filter(
      ({ stage }) => stage?.key === 'A_RECOLTER' || (stage && stage.daysRemaining <= 30),
    ).length;
    const planted = withStage.filter(({ parcelle }) => parcelle.plantedAt).length;
    const totalHa = parcelles.reduce((s, p) => s + (p.areaHa ?? 0), 0);
    return { withStage, duSoon, planted, totalHa };
  }, [parcelles]);

  return (
    <Screen
      bottomPad={112}
      refreshing={parcellesQuery.isFetching}
      onRefresh={() => parcellesQuery.refetch()}
      header={
        <ScreenHeader
          title="Récoltes & suivi"
          subtitle="Échéances, stades et conseils par culture"
        />
      }>
      {parcellesQuery.isLoading ? (
        <BrandLoader />
      ) : parcelles.length === 0 ? (
        <EmptyState
          emoji="🚜"
          title="Aucune parcelle à suivre"
          description="Enregistrez vos parcelles et leurs cultures : vous verrez ici les stades de croissance, les échéances de récolte et des conseils adaptés."
          actionLabel={canManage ? 'Ajouter une parcelle' : undefined}
          onAction={canManage ? () => router.push('/parcelles') : undefined}
        />
      ) : (
        <>
          {/* ── Métriques ── */}
          <View style={styles.metrics}>
            <MetricTile
              label="Échéances à 30 j"
              value={String(plan.duSoon)}
              sub="récoltes proches"
              tone="brand"
              icon={Tractor}
              threeCol
            />
            <MetricTile
              label="Parcelles plantées"
              value={`${plan.planted}/${plan.withStage.length}`}
              sub="en cours"
              tone="green"
              icon={Tractor}
              threeCol
            />
            <MetricTile
              label="Superficie"
              value={`${plan.totalHa.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ha`}
              sub={fmtM2(plan.totalHa)}
              tone="accent"
              icon={Tractor}
              threeCol
            />
          </View>

          {/* ── Titre section ── */}
          <View style={styles.sectionRow}>
            <AppText size="body" weight="bold" color="text">Parcelles & récoltes</AppText>
            <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push('/parcelles'); }} hitSlop={8} accessibilityRole="button">
              <ArrowRight size={18} color={palette.green[600]} strokeWidth={2.4} />
            </Pressable>
          </View>

          <View style={styles.list}>
            {plan.withStage.map(({ parcelle, stage }) => (
              <PlanningCard key={parcelle.id} parcelle={parcelle} stage={stage} />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

/** Carte de suivi d'une parcelle : stade, échéance, connaissance culture. */
function PlanningCard({ parcelle, stage }: { parcelle: Parcelle; stage: ReturnType<typeof cultureStage> }) {
  const pct = stage ? Math.min(100, Math.round(stage.progress * 100)) : 0;
  const water = waterNeedLabel(parcelle.culture);
  const tips = adviceForCulture(parcelle.culture);
  const advice = tips[0] ?? null;

  return (
    <Card style={styles.planCard}>
      <View style={styles.planHeader}>
        <View style={styles.planIcon}>
          <AppText style={{ fontSize: 18 }}>{CULTURE_EMOJI[parcelle.culture.category]}</AppText>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText size="body" weight="bold" color="text" numberOfLines={1}>
            {parcelle.name}
          </AppText>
          <AppText size="small" color="muted" numberOfLines={1}>
            {parcelle.culture.name} · {CROP_CATEGORY_LABELS[parcelle.culture.category]}
          </AppText>
        </View>
        <Chip label={PARCELLE_STATUS_LABELS[parcelle.status]} tone={STATUS_CHIP_TONE[parcelle.status]} />
      </View>

      <View style={styles.planProgress}>
        <View style={styles.progressRow}>
          <AppText size="small" weight="semibold" color="text">
            {stage?.label ?? 'Non plantée'}
          </AppText>
          {stage && stage.daysRemaining > 0 && stage.key !== 'A_RECOLTER' ? (
            <AppText size="caption" color="muted">J-{stage.daysRemaining}</AppText>
          ) : null}
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${pct}%` }]} />
        </View>
        <View style={styles.progressRow}>
          <AppText size="caption" color="muted">
            {stage?.harvestDate
              ? `Récolte estimée le ${formatHarvestDate(stage.harvestDate)}`
              : parcelle.status === 'ACTIVE'
                ? 'Date de plantation à renseigner'
                : 'À préparer pour la plantation'}
          </AppText>
          {water ? <AppText size="caption" color="faint">💧 {water}</AppText> : null}
        </View>
      </View>

      {advice ? (
        <View style={styles.advice}>
          <AppText size="caption" weight="bold" color="brand">💡 Conseil</AppText>
          <AppText size="small" color="muted">{advice}</AppText>
        </View>
      ) : null}
    </Card>
  );
}

function fmtM2(totalHa: number): string {
  const m2 = Math.round(totalHa * 10_000);
  return m2 > 0 ? `${m2.toLocaleString('fr-FR')} m²` : '—';
}

const styles = StyleSheet.create({
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 8,
  },
  list: {
    gap: 10,
  },
  planCard: {
    padding: 12,
    gap: 10,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  planIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: palette.green[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  planProgress: {
    gap: 6,
    backgroundColor: color.surfaceAlt,
    borderRadius: radii.md,
    padding: 10,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  track: {
    height: 7,
    borderRadius: 4,
    backgroundColor: palette.green[100],
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: palette.green[500],
  },
  advice: {
    backgroundColor: palette.brand[50],
    borderLeftWidth: 3,
    borderLeftColor: palette.brand[500],
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
});
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ArrowRight, Plus, Tractor } from 'lucide-react-native';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { EmptyState } from '@/components/ui/EmptyState';
import { MetricTile } from '@/components/ui/MetricTile';
import { RecolteSheet } from '@/components/agriculture/RecolteSheet';
import { useFarmProfile } from '@/hooks/useFarmProfile';
import { useAuth } from '@/auth/AuthContext';
import { fetchParcelles, fetchRecoltes, fetchRecolteStock } from '@/api';
import { invalidateFarmQueries } from '@/api/invalidate';
import type { Parcelle, Recolte } from '@/api/types';
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

export const RECOLTE_UNIT_LABELS: Record<Recolte['unit'], string> = {
  KG: 'kg',
  PIECE: 'pièce(s)',
  SAC: 'sac(s)',
};

const STATUS_CHIP_TONE: Record<Parcelle['status'], 'green' | 'amber' | 'neutral' | 'red'> = {
  ACTIVE: 'green',
  PREPARATION: 'amber',
  JACHERE: 'amber',
  CLOTURE: 'neutral',
};

/**
 * Suivi des cultures + journal des récoltes : échéances, stades et conseils
 * (comme les recommandations élevage), puis la journalisation quantitative
 * des récoltes et le stock vendable par parcelle (récolté − vendu) qui
 * alimente le point de vente Ferme.
 */
export default function RecoltesScreen() {
  const router = useRouter();
  const { farmId } = useAuth();
  const { hasPermission } = useFarmProfile();
  const canManage = hasPermission('agri:gerer');
  const qc = useQueryClient();
  const [recolteSheetOpen, setRecolteSheetOpen] = useState(false);

  const parcellesQuery = useQuery({
    queryKey: ['parcelles', farmId],
    queryFn: () => fetchParcelles(farmId),
  });
  const parcelles = React.useMemo(() => parcellesQuery.data ?? [], [parcellesQuery.data]);

  const recoltesQuery = useQuery({
    queryKey: ['recoltes', farmId],
    queryFn: () => fetchRecoltes(farmId),
  });
  const recolteStockQuery = useQuery({
    queryKey: ['recoltes-stock', farmId],
    queryFn: () => fetchRecolteStock(farmId),
  });

  const recoltes = React.useMemo(() => recoltesQuery.data ?? [], [recoltesQuery.data]);
  const stock = React.useMemo(() => recolteStockQuery.data ?? [], [recolteStockQuery.data]);
  const parcelleName = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of parcelles) map.set(p.id, p.name);
    return (id: string) => map.get(id) ?? 'Parcelle';
  }, [parcelles]);

  const recentRecoltes = useMemo(
    () =>
      [...recoltes]
        .sort((a, b) => (a.harvestDate < b.harvestDate ? 1 : a.harvestDate > b.harvestDate ? -1 : 0))
        .slice(0, 12),
    [recoltes],
  );
  const totalStocked = useMemo(
    () =>
      stock.reduce((m, s) => {
        const current = m.get(`${s.parcelleId}:${s.unit}`) ?? { harvested: 0, sold: 0 };
        return m.set(`${s.parcelleId}:${s.unit}`, {
          harvested: current.harvested + s.harvested,
          sold: current.sold + s.sold,
        });
      }, new Map<string, { harvested: number; sold: number }>()),
    [stock],
  );

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
    const totalHarvestedUnits = Array.from(totalStocked.values()).length;
    return { withStage, duSoon, planted, totalHarvestedUnits };
  }, [parcelles, totalStocked]);

  return (
    <Screen
      bottomPad={112}
      refreshing={parcellesQuery.isFetching || recoltesQuery.isFetching || recolteStockQuery.isFetching}
      onRefresh={() => {
        void parcellesQuery.refetch();
        void recoltesQuery.refetch();
        void recolteStockQuery.refetch();
      }}
      header={
        <ScreenHeader
          title="Récoltes & suivi"
          subtitle="Échéances, journal des récoltes et stock vendable"
        />
      }>
      {parcellesQuery.isLoading ? (
        <BrandLoader />
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
              label="Lignes en stock"
              value={String(plan.totalHarvestedUnits)}
              sub="récolté − vendu"
              tone="accent"
              icon={Tractor}
              threeCol
            />
          </View>

          {/* ── Journal des récoltes ── */}
          {stock.length > 0 || recoltes.length > 0 ? (
            <>
              <View style={styles.sectionRow}>
                <AppText size="body" weight="bold" color="text">Journal des récoltes</AppText>
                {canManage ? (
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setRecolteSheetOpen(true);
                    }}
                    hitSlop={8}
                    accessibilityRole="button">
                    <View style={styles.addBtn}>
                      <Plus size={16} color={palette.green[600]} strokeWidth={2.6} />
                      <AppText size="small" weight="bold" color="success">Journaliser</AppText>
                    </View>
                  </Pressable>
                ) : null}
              </View>

              {stock.length > 0 ? (
                <Card style={styles.stockCard}>
                  <AppText size="caption" weight="bold" color="muted" style={{ marginBottom: 6 }}>
                    STOCK VENDABLE (AU POINT DE VENTE)
                  </AppText>
                  <View style={styles.rowWrap}>
                    {stock.map((s, i) => (
                      <Chip
                        key={`${s.parcelleId}:${s.unit}`}
                        label={`${s.parcelleName} · ${fmtStock(s.available)} ${RECOLTE_UNIT_LABELS[s.unit]} restant`}
                        tone="green"
                      />
                    ))}
                  </View>
                  <AppText size="caption" color="faint">
                    {stock.length} ligne{stock.length > 1 ? 's' : ''} de stock — vendu au POS Ferme via l’article « Récolte ».
                  </AppText>
                </Card>
              ) : recoltes.length > 0 ? (
                <AppText size="caption" color="faint" style={{ marginBottom: 8 }}>
                  Stock vendable calculé une fois une récolte journalisée (récolté − vendu).
                </AppText>
              ) : null}

              <View style={styles.list}>
                {recentRecoltes.map((r) => (
                  <RecolteRow key={r.id} recolte={r} parcelleName={parcelleName(r.parcelleId)} />
                ))}
              </View>

              {recoltes.length > recentRecoltes.length ? (
                <AppText size="caption" color="faint" style={{ marginTop: 8 }}>
                  + {recoltes.length - recentRecoltes.length} autre{recoltes.length - recentRecoltes.length > 1 ? 's' : ''} entrée
                  {recoltes.length - recentRecoltes.length > 1 ? 's' : ''} du journal.
                </AppText>
              ) : null}
            </>
          ) : null}

          {/* ── Titre section ── */}
          {parcelles.length === 0 ? (
            <EmptyState
              emoji="🚜"
              title="Aucune parcelle à suivre"
              description="Enregistrez vos parcelles et leurs cultures : vous verrez ici les stades de croissance, les échéances de récolte et des conseils adaptés."
              actionLabel={canManage ? 'Ajouter une parcelle' : undefined}
              onAction={canManage ? () => router.push('/parcelles') : undefined}
            />
          ) : (
            <>
              <View style={styles.sectionRow}>
                <AppText size="body" weight="bold" color="text">Parcelles & cultures</AppText>
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
        </>
      )}

      <RecolteSheet
        visible={recolteSheetOpen}
        parcelles={parcelles}
        onClose={() => {
          setRecolteSheetOpen(false);
          invalidateFarmQueries(qc, { farmId });
        }}
      />

      {/* FAB « Journaliser » visible même sans parcelle ni récolte. */}
      {recolteSheetOpen ? null : parcelles.length > 0 && canManage && recoltes.length === 0 && stock.length === 0 ? (
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setRecolteSheetOpen(true);
          }}
          style={styles.fab}
          accessibilityRole="button">
          <AppText style={{ fontSize: 18 }}>🌾</AppText>
          <AppText size="small" weight="bold" color="#fff">Journaliser une récolte</AppText>
        </Pressable>
      ) : null}
    </Screen>
  );
}

function RecolteRow({ recolte, parcelleName }: { recolte: Recolte; parcelleName: string }) {
  const date = new Date(recolte.harvestDate + 'T00:00:00');
  const day = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return (
    <Card style={styles.recolteCard}>
      <View style={styles.recolteHead}>
        <View style={styles.recolteIcon}>
          <AppText style={{ fontSize: 16 }}>🌾</AppText>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText size="body" weight="bold" color="text" numberOfLines={1}>
            {parcelleName}
          </AppText>
          <AppText size="small" color="muted">
            {day}
            {recolte.notes ? ` · ${recolte.notes}` : ''}
          </AppText>
        </View>
        <Chip label={`+${fmtStock(recolte.quantity)} ${RECOLTE_UNIT_LABELS[recolte.unit]}`} tone="green" />
      </View>
    </Card>
  );
}

function fmtStock(n: number): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
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
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: palette.green[50],
    borderWidth: 1,
    borderColor: palette.green[200],
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  stockCard: {
    padding: 12,
    gap: 2,
    marginBottom: 4,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  recolteCard: {
    padding: 10,
    gap: 8,
  },
  recolteHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  recolteIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    backgroundColor: palette.green[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.green[600],
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
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
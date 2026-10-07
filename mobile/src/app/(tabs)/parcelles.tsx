import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CalendarDays, ChevronRight, Layers3, Map, Plus } from 'lucide-react-native';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState } from '@/components/ui/EmptyState';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { ParcelleMap } from '@/components/agriculture/ParcelleMap';
import { ParcelleSheet } from '@/components/agriculture/ParcelleSheet';
import { useAuth } from '@/auth/AuthContext';
import { useFarmProfile } from '@/hooks/useFarmProfile';
import { fetchParcelles } from '@/api';
import type { Parcelle } from '@/api/types';
import {
  CROP_CATEGORY_LABELS,
  CULTURE_EMOJI,
  cultureStage,
  formatHarvestDate,
  PARCELLE_STATUS_LABELS,
} from '@/constants/agriculture';
import { color, palette, radii, shadow } from '@/constants/theme';

const STATUS_CHIP_TONE: Record<Parcelle['status'], 'green' | 'amber' | 'neutral' | 'red'> = {
  ACTIVE: 'green',
  PREPARATION: 'amber',
  JACHERE: 'amber',
  CLOTURE: 'neutral',
};

export default function ParcellesScreen() {
  const router = useRouter();
  const { farmId, farms } = useAuth();
  const { hasPermission } = useFarmProfile();
  const params = useLocalSearchParams<{ new?: string }>();

  const [view, setView] = useState<'liste' | 'carte'>('liste');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Parcelle | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const canManage = hasPermission('agri:gerer');

  const parcellesQuery = useQuery({
    queryKey: ['parcelles', farmId],
    queryFn: () => fetchParcelles(farmId),
  });
  const parcelles = useMemo(() => parcellesQuery.data ?? [], [parcellesQuery.data]);
  const farm = farms.find((f) => f.id === farmId) ?? null;

  // FAB → `parcelles?new=1` : ouvre la création à chaque arrivée du
  // paramètre, puis le purge pour ne pas recréer au retour sur l'onglet.
  const prevNew = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (params.new === '1' && canManage && prevNew.current !== '1') {
      setSheetOpen(true);
      router.setParams({ new: '' });
    }
    prevNew.current = params.new;
  }, [params.new, canManage, router]);

  const fruits = useMemo(() => {
    const sorted = [...parcelles].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return {
      actives: parcelles.filter((p) => p.status !== 'CLOTURE').length,
      totalHa: parcelles.reduce((s, p) => s + (p.areaHa ?? 0), 0),
      cultures: new Set(parcelles.map((p) => p.cultureId)).size,
      sorted,
    };
  }, [parcelles]);

  const selected = selectedId ? parcelles.find((p) => p.id === selectedId) ?? null : null;

  const openCreate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setEditing(null);
    setSheetOpen(true);
  };

  const openEdit = (p: Parcelle) => {
    if (!canManage) return;
    Haptics.selectionAsync().catch(() => {});
    setEditing(p);
    setSheetOpen(true);
  };

  const showOnMap = (p: Parcelle) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedId(p.id);
    setView('carte');
  };

  return (
    <Screen
      bottomPad={112}
      refreshing={parcellesQuery.isFetching}
      onRefresh={() => parcellesQuery.refetch()}
      header={
        <ScreenHeader
          title="Parcelles"
          subtitle="Terres & cultures de la ferme"
          right={
            canManage ? (
              <Pressable onPress={openCreate} style={styles.addBtn} accessibilityRole="button">
                <Plus size={18} color={color.surface} strokeWidth={2.6} />
              </Pressable>
            ) : null
          }
        />
      }>
      <View style={styles.actionsRow}>
        <View style={styles.viewSwitch}>
          <Segmented<'liste' | 'carte'>
            value={view}
            onChange={(v) => setView(v)}
            options={[
              { key: 'liste', label: 'Liste', icon: <Layers3 size={13} color={view === 'liste' ? color.green[600] : color.ink[400]} />, tint: color.green[600] },
              { key: 'carte', label: 'Carte', icon: <Map size={13} color={view === 'carte' ? color.green[600] : color.ink[400]} />, tint: color.green[600] },
            ]}
          />
        </View>
      </View>

      {parcellesQuery.isLoading ? (
        <BrandLoader />
      ) : parcelles.length === 0 ? (
        <EmptyState
          emoji="🌱"
          title="Aucune parcelle"
          description={canManage ? 'Ajoutez votre première parcelle et choisissez sa culture.' : 'Aucune parcelle enregistrée pour le moment.'}
          actionLabel={canManage ? 'Nouvelle parcelle' : undefined}
          onAction={canManage ? openCreate : undefined}
        />
      ) : (
        <>
          {/* ── Vue Liste ── */}
          {view === 'liste' ? (
            <View style={styles.list}>
              {fruits.sorted.map((p) => (
                <Card
                  key={p.id}
                  onPress={canManage ? () => openEdit(p) : undefined}
                  style={[styles.parcelleCard, selectedId === p.id && styles.parcelleCardSelected]}>
                  <View style={styles.parcelleRow}>
                    <View style={styles.parcelleIcon}>
                      <AppText style={{ fontSize: 20 }}>{CULTURE_EMOJI[p.culture.category]}</AppText>
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={styles.parcelleTitleRow}>
                        <AppText size="body" weight="bold" color="text" numberOfLines={1} style={{ flex: 1 }}>
                          {p.name}
                        </AppText>
                        <Chip label={PARCELLE_STATUS_LABELS[p.status]} tone={STATUS_CHIP_TONE[p.status]} />
                      </View>
                      <AppText size="small" color="muted" numberOfLines={1}>
                        {p.culture.name} · {CROP_CATEGORY_LABELS[p.culture.category]}
                      </AppText>
                      <View style={styles.parcelleMetaRow}>
                        <AppText size="small" weight="semibold" color="green">
                          {formatArea(p)}
                        </AppText>
                        <View style={styles.metaDot} />
                        <View style={styles.metaItem}>
                          <CalendarDays size={11} color={color.ink[400]} />
                          <AppText size="small" color="faint">
                            {p.plantedAt ? new Date(p.plantedAt).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }) : 'Non plantée'}
                          </AppText>
                        </View>
                      </View>
                      {p.status === 'ACTIVE' && p.plantedAt && (
                        <StageLine parcelle={p} />
                      )}
                    </View>
                    <View style={styles.cardActions}>
                      {canManage && <ChevronRight size={16} color={color.ink[300]} />}
                      <Pressable onPress={() => showOnMap(p)} hitSlop={6} style={styles.mapBtn} accessibilityRole="button">
                        <Map size={15} color={color.brand[600]} strokeWidth={2.2} />
                      </Pressable>
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          ) : (
            /* ── Vue Carte ── */
            <View style={styles.mapSection}>
              <ParcelleMap
                farm={farm}
                parcelles={parcelles}
                height={selected ? 300 : 380}
                selectedId={selectedId}
                onSelectParcelle={setSelectedId}
              />
              {selected ? (
                <SelectedParcelleCard
                  parcelle={selected}
                  onEdit={canManage ? () => openEdit(selected) : undefined}
                  onClear={() => setSelectedId(null)}
                />
              ) : null}
              <View style={styles.mapLegend}>
                {(['ACTIVE', 'PREPARATION', 'JACHERE', 'CLOTURE'] as Parcelle['status'][]).map((s) => (
                  <View key={s} style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: STATUS_DOT[s] }]} />
                    <AppText size="caption" color="muted">{PARCELLE_STATUS_LABELS[s]}</AppText>
                  </View>
                ))}
              </View>
            </View>
          )}
        </>
      )}

      <ParcelleSheet
        visible={sheetOpen}
        parcelle={editing}
        onClose={() => {
          setSheetOpen(false);
          setEditing(null);
        }}
      />
    </Screen>
  );
}

/** Ligne de progression du cycle : stade + échéance de récolte. */
function StageLine({ parcelle }: { parcelle: Parcelle }) {
  const stage = cultureStage(parcelle.plantedAt, parcelle.culture.defaultCycleDays);
  if (!stage) return null;
  const width = `${Math.min(100, Math.round(stage.progress * 100))}%` as `${number}%`;
  return (
    <View style={styles.stageRow}>
      <View style={styles.stageTrack}>
        <View style={[styles.stageFill, { width }]} />
      </View>
      <AppText size="caption" weight="semibold" color="muted" numberOfLines={1}>
        {stage.label} · récolte {formatHarvestDate(stage.harvestDate)}
      </AppText>
    </View>
  );
}

/** Fiche détaillée de la parcelle sélectionnée sur la carte. */
function SelectedParcelleCard({ parcelle, onEdit, onClear }: {
  parcelle: Parcelle;
  onEdit?: () => void;
  onClear: () => void;
}) {
  const stage = cultureStage(parcelle.plantedAt, parcelle.culture.defaultCycleDays);
  const pct = `${Math.min(100, Math.round((stage?.progress ?? 0) * 100))}%` as `${number}%`;
  return (
    <Card tone="green" style={styles.selectedCard}>
      <View style={styles.selectedHeader}>
        <View style={styles.selectedTitleRow}>
          <AppText style={{ fontSize: 18 }}>{CULTURE_EMOJI[parcelle.culture.category]}</AppText>
          <AppText size="body" weight="bold" color="text" numberOfLines={1} style={{ flex: 1 }}>
            {parcelle.name}
          </AppText>
          <Chip label={PARCELLE_STATUS_LABELS[parcelle.status]} tone={STATUS_CHIP_TONE[parcelle.status]} />
        </View>
        <Pressable onPress={onClear} hitSlop={8} accessibilityRole="button">
          <AppText size="small" weight="semibold" color="muted">Fermer</AppText>
        </Pressable>
      </View>
      <AppText size="small" color="muted">
        {parcelle.culture.name} · {CROP_CATEGORY_LABELS[parcelle.culture.category]} · {formatArea(parcelle)}
      </AppText>
      {stage ? (
        <>
          <View style={styles.stageRow}>
            <View style={styles.stageTrack}>
              <View style={[styles.stageFill, { width: pct }]} />
            </View>
          </View>
          <AppText size="small" color="muted">
            Stade <AppText size="small" weight="bold" color="text">{stage.label}</AppText> · récolte estimée le{' '}
            <AppText size="small" weight="bold" color="green">{formatHarvestDate(stage.harvestDate)}</AppText>
            {stage.daysRemaining > 0 ? ` (${stage.daysRemaining} j)` : ''}
          </AppText>
        </>
      ) : null}
      {onEdit ? (
        <Pressable onPress={onEdit} style={styles.selectedEdit} accessibilityRole="button">
          <AppText size="small" weight="bold" color="brand">Modifier la parcelle</AppText>
        </Pressable>
      ) : null}
    </Card>
  );
}

/** Aire au format ha + m² lisible (ex. « 1,5 ha · 15 000 m² »). */
function formatArea(p: Parcelle): string {
  const ha = p.areaHa != null ? p.areaHa.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : null;
  const m2 = p.areaM2 != null ? p.areaM2.toLocaleString('fr-FR') : null;
  if (ha == null && m2 == null) return 'Surface —';
  if (ha == null) return `${m2} m²`;
  if (m2 == null) return `${ha} ha`;
  return `${ha} ha · ${m2} m²`;
}

const STATUS_DOT: Record<Parcelle['status'], string> = {
  ACTIVE: palette.green[500],
  PREPARATION: palette.accent[500],
  JACHERE: palette.amber[500],
  CLOTURE: palette.ink[400],
};

const styles = StyleSheet.create({
  actionsRow: {
    marginVertical: 12,
  },
  viewSwitch: {
    backgroundColor: palette.surfaceAlt,
    borderRadius: radii.md,
    padding: 3,
  },
  list: {
    gap: 10,
  },
  parcelleCard: {
    padding: 12,
  },
  parcelleCardSelected: {
    borderColor: color.brand[300],
  },
  parcelleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardActions: {
    alignItems: 'center',
    gap: 10,
  },
  mapBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: palette.brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  stageTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.green[100],
    overflow: 'hidden',
  },
  stageFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: palette.green[500],
  },
  selectedCard: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 44,
    gap: 8,
    padding: 14,
    ...shadow.card,
  },
  selectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  selectedTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  selectedEdit: {
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  parcelleIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: palette.green[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  parcelleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  parcelleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: palette.border,
  },
  mapSection: {
    gap: 12,
    position: 'relative',
  },
  mapLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 2,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: palette.green[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
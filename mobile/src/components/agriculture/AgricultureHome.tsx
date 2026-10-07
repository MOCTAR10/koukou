import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Banknote, ChevronDown, ChevronRight, Layers3, MapPin, ShieldCheck, Sprout, Store } from 'lucide-react-native';

import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FarmModeSwitch } from '@/components/FarmModeSwitch';
import { FarmSelector } from '@/components/ui/FarmSelector';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { EmptyState } from '@/components/ui/EmptyState';
import { MetricTile } from '@/components/ui/MetricTile';
import { useAuth } from '@/auth/AuthContext';
import { useFarmProfile } from '@/hooks/useFarmProfile';
import { fetchCaisseCurrent, fetchParcelles } from '@/api';
import { givenName } from '@/api/format';
import type { Parcelle } from '@/api/types';
import {
  CROP_CATEGORY_LABELS,
  CULTURE_EMOJI,
  PARCELLE_STATUS_LABELS,
  adviceForCulture,
  cultureStage,
  formatHarvestDate,
} from '@/constants/agriculture';
import { color, fmtFcfa, palette, radii, shadow } from '@/constants/theme';

/** Accueil du domaine Agriculture : parcelles, surfaces, cultures en cours. */
export function AgricultureHome() {
  const router = useRouter();
  const { user, farmId, farms, setActiveFarmId } = useAuth();
  const { hasPermission } = useFarmProfile();
  const canManage = hasPermission('agri:gerer');
  const canCaisse = hasPermission('caisse:lire');
  const [farmSelectOpen, setFarmSelectOpen] = useState(false);

  const farm = farms.find((f) => f.id === farmId) ?? farms[0] ?? null;

  const parcellesQuery = useQuery({
    queryKey: ['parcelles', farmId],
    queryFn: () => fetchParcelles(farmId),
  });
  const parcelles = React.useMemo(() => parcellesQuery.data ?? [], [parcellesQuery.data]);

  // Encaissements du jour (caisse ouverte) — les fermes agro vendent aussi.
  const caisseQuery = useQuery({
    queryKey: ['caisse', farmId],
    queryFn: () => fetchCaisseCurrent(farmId),
    enabled: canCaisse,
    staleTime: 15_000,
  });
  const collectedTodayFcfa = useMemo(() => {
    const today = toDateStr(new Date());
    return (caisseQuery.data?.movements ?? [])
      .filter((m) => m.type === 'IN' && (m.movementDate ?? '').slice(0, 10) === today)
      .reduce((s, m) => s + m.amountFcfa, 0);
  }, [caisseQuery.data]);

  const stats = useMemo(() => {
    const actives = parcelles.filter(
      (p) => p.status === 'ACTIVE' || p.status === 'PREPARATION' || p.status === 'JACHERE',
    ).length;
    const totalHa = parcelles.reduce((s, p) => s + (p.areaHa ?? 0), 0);
    const culturesEnCours = new Set(
      parcelles
        .filter((p) => p.plantedAt && p.status === 'ACTIVE')
        .map((p) => p.cultureId),
    ).size;
    const recent = [...parcelles]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 4);
    return { actives, totalHa, culturesEnCours, recent };
  }, [parcelles]);

  const openParcelles = (newParcelle?: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    if (newParcelle) {
      router.push('/parcelles?new=1');
    } else {
      router.push('/parcelles');
    }
  };

  return (
    <Screen
      bottomPad={112}
      refreshing={parcellesQuery.isFetching}
      onRefresh={() => parcellesQuery.refetch()}
      header={
        <>
          <View style={styles.topRow}>
            <View style={styles.avatar}>
              <AppText style={{ fontSize: 18 }}>🌱</AppText>
            </View>
            <View style={styles.greetCol}>
              <AppText size="body" weight="bold" color="text">
                Bonjour, {givenName(user.fullName)}
              </AppText>
              <AppText size="caption" color="muted">
                Domaine Agriculture
              </AppText>
            </View>
          </View>
          <View style={styles.headerTiles}>
            <Pressable
              onPress={() => setFarmSelectOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Ma ferme"
              style={({ pressed }) => [styles.headerTile, pressed && styles.headerTilePressed]}>
              <View style={[styles.tileIcon, { backgroundColor: palette.brand[50], borderColor: palette.brand[200] }]}>
                <Store size={16} color={palette.brand[600]} strokeWidth={2.2} />
              </View>
              <View style={styles.tileBody}>
                <AppText size="label" color="muted">
                  Ma ferme
                </AppText>
                <AppText size="body" weight="bold" color="text" numberOfLines={1}>
                  {farm?.name ?? '—'}
                </AppText>
                <View style={styles.tileSubRow}>
                  <AppText size="small" color="muted" numberOfLines={1}>
                    {farm?.administrativeCity ?? 'Aucune ville'}
                  </AppText>
                  {farm?.isVerified ? (
                    <View style={styles.verifiedChip}>
                      <ShieldCheck size={11} color={palette.green[600]} />
                    </View>
                  ) : null}
                </View>
              </View>
              <ChevronDown size={16} color={palette.ink[400]} strokeWidth={2.2} />
            </Pressable>

            <Pressable
              onPress={() => {
                if (!canCaisse) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                router.push('/caisse');
              }}
              accessibilityRole="button"
              accessibilityLabel="Encaisser"
              disabled={!canCaisse}
              style={({ pressed }) => [styles.headerTile, !canCaisse && styles.headerTileMuted, pressed && canCaisse && styles.headerTilePressed]}>
              <View style={[styles.tileIcon, { backgroundColor: palette.accent[50], borderColor: palette.accent[200] }]}>
                <Banknote size={16} color={palette.accent[600]} strokeWidth={2.2} />
              </View>
              <View style={styles.tileBody}>
                <AppText size="label" color="muted">
                  Encaissé aujourd&apos;hui
                </AppText>
                <AppText size="body" weight="bold" color="text" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {fmtFcfa(collectedTodayFcfa)}
                </AppText>
                <AppText size="small" color="muted" numberOfLines={1}>
                  {canCaisse ? 'Encaisser +' : 'Consultation seule'}
                </AppText>
              </View>
              {canCaisse ? <ChevronRight size={18} color={palette.accent[600]} strokeWidth={2.4} /> : null}
            </Pressable>
          </View>
        </>
      }>
      <View style={styles.modeRow}>
        <FarmModeSwitch />
      </View>

      {parcellesQuery.isLoading ? (
        <BrandLoader />
      ) : parcelles.length === 0 ? (
        <EmptyState
          emoji="🌱"
          title="Bienvenue dans Agriculture"
          description="Enregistrez vos parcelles et leurs cultures pour suivre votre exploitation."
          actionLabel={canManage ? 'Nouvelle parcelle' : undefined}
          onAction={canManage ? () => openParcelles(true) : undefined}
        />
      ) : (
        <>
          {/* ── Métriques ── */}
          <View style={styles.metricGrid}>
            <MetricTile
              label="Parcelles actives"
              value={String(stats.actives)}
              sub={stats.actives > 1 ? 'en exploitation' : 'en exploitation'}
              tone="green"
              icon={Layers3}
              threeCol
              labelLines={2}
              onPress={() => openParcelles(false)}
            />
            <MetricTile
              label="Superficie totale"
              value={`${stats.totalHa.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ha`}
              sub={fmtM2(stats.totalHa)}
              tone="brand"
              icon={MapPin}
              threeCol
              labelLines={2}
              onPress={() => openParcelles(false)}
            />
            <MetricTile
              label="Cultures en cours"
              value={String(stats.culturesEnCours)}
              sub="plantées"
              tone="accent"
              icon={Sprout}
              threeCol
              labelLines={2}
              onPress={() => openParcelles(false)}
            />
          </View>

          {/* ── Prochaine échéance + conseil ── */}
          <NextHarvestCard parcelles={parcelles} />

          {/* ── Dernières parcelles ── */}
          <View style={styles.sectionRow}>
            <AppText size="body" weight="bold" color="text">Dernières parcelles</AppText>
            <Pressable onPress={() => openParcelles(false)} hitSlop={8} accessibilityRole="button">
              <ChevronRight size={18} color={palette.green[600]} strokeWidth={2.4} />
            </Pressable>
          </View>
          <View style={styles.list}>
            {stats.recent.map((p) => (
              <Card key={p.id} style={styles.parcelleCard}>
                <View style={styles.parcelleRow}>
                  <View style={styles.parcelleIcon}>
                    <AppText style={{ fontSize: 20 }}>{CULTURE_EMOJI[p.culture.category]}</AppText>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText size="body" weight="bold" color="text" numberOfLines={1}>
                      {p.name}
                    </AppText>
                    <AppText size="small" color="muted" numberOfLines={1}>
                      {p.culture.name} · {CROP_CATEGORY_LABELS[p.culture.category]}
                    </AppText>
                    <View style={styles.subRow}>
                      <AppText size="small" weight="semibold" color="green">
                        {formatArea(p)}
                      </AppText>
                    </View>
                  </View>
                  <StatusDot status={p.status} />
                </View>
              </Card>
            ))}
          </View>

          {canManage && (
            <View style={styles.cta}>
              <Button label="Nouvelle parcelle" tone="success" onPress={() => openParcelles(true)} />
            </View>
          )}
        </>
      )}
      <FarmSelector
        visible={farmSelectOpen}
        farms={farms}
        onClose={() => setFarmSelectOpen(false)}
        onSelect={setActiveFarmId}
      />
    </Screen>
  );
}

/** Prochaine récolte la plus proche + conseil personnalisé (lien Récoltes). */
function NextHarvestCard({ parcelles }: { parcelles: Parcelle[] }) {
  const router = useRouter();
  const next = React.useMemo(() => {
    const planted = parcelles
      .filter((p) => p.plantedAt && p.status === 'ACTIVE')
      .map((p) => ({ p, stage: cultureStage(p.plantedAt, p.culture.defaultCycleDays) }))
      .filter((x) => x.stage?.harvestDate)
      .sort((a, b) => (a.stage?.harvestDate?.getTime() ?? Infinity) - (b.stage?.harvestDate?.getTime() ?? Infinity));
    return planted[0] ?? null;
  }, [parcelles]);

  if (!next) return null;
  const tip = adviceForCulture(next.p.culture)[0];
  return (
    <Card tone="green" style={styles.harvestCard}>
      <View style={styles.harvestRow}>
        <AppText style={{ fontSize: 22 }}>{CULTURE_EMOJI[next.p.culture.category]}</AppText>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText size="caption" weight="bold" color="muted">Prochaine récolte estimée</AppText>
          <AppText size="body" weight="bold" color="text" numberOfLines={1}>
            {next.p.name} — {formatHarvestDate(next.stage?.harvestDate ?? null)}
          </AppText>
          <AppText size="small" color="muted" numberOfLines={2}>
            {tip}
          </AppText>
        </View>
        <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push('/recoltes'); }} hitSlop={8} accessibilityRole="button">
          <ChevronRight size={20} color={palette.green[600]} strokeWidth={2.6} />
        </Pressable>
      </View>
    </Card>
  );
}

function StatusDot({ status }: { status: Parcelle['status'] }) {
  const dot = {
    ACTIVE: palette.green[500],
    PREPARATION: palette.accent[500],
    JACHERE: palette.amber[500],
    CLOTURE: palette.ink[400],
  }[status];
  return (
    <View style={styles.statusWrap}>
      <View style={[styles.statusDot, { backgroundColor: dot }]} />
      <AppText size="caption" color="muted">{PARCELLE_STATUS_LABELS[status]}</AppText>
    </View>
  );
}

function fmtM2(totalHa: number): string {
  const m2 = Math.round(totalHa * 10_000);
  return m2 > 0 ? `${m2.toLocaleString('fr-FR')} m²` : '0 m²';
}

/** Date locale ISO (AAAA-MM-JJ). */
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: palette.green[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  greetCol: { flex: 1, gap: 0 },
  headerTiles: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  headerTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radii.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...shadow.card,
  },
  headerTilePressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  headerTileMuted: {
    opacity: 0.82,
  },
  tileIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileBody: {
    flex: 1,
    gap: 1,
  },
  tileSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  verifiedChip: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: palette.green[50],
    borderWidth: 1,
    borderColor: palette.green[200],
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  modeRow: { marginVertical: 12 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 8,
  },
  list: { gap: 8 },
  parcelleCard: { padding: 12 },
  parcelleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  parcelleIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: palette.green[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  harvestCard: { marginTop: 14, padding: 12 },
  harvestRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusWrap: { alignItems: 'center', gap: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  cta: { marginTop: 14 },
});
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import Animated from 'react-native-reanimated';
import {
  ArrowDown,
  ArrowUp,
  ClipboardCheck,
  Droplets,
  NotebookPen,
  Sun,
  Thermometer,
  Wallet,
} from 'lucide-react-native';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Segmented, type SegmentedOption } from '@/components/ui/Segmented';
import { Spinner } from '@/components/ui/Spinner';
import { SOURCE_LABEL } from '@/components/pos/CaisseTab';
import { ActivityHero } from '@/components/activity/ActivityHero';
import { ActionQueue } from '@/components/activity/ActionQueue';
import { BatchPulseList } from '@/components/activity/BatchPulseList';
import { JournalTimeline } from '@/components/activity/JournalTimeline';
import { PerformanceList, WeeklyReport } from '@/components/activity/WeeklyReport';
import { SpanFilter, type JournalSpan } from '@/components/activity/SpanFilter';
import { buildActionQueue, buildJournal, timeLabel } from '@/components/activity/activityFeed';
import { useAuth } from '@/auth/AuthContext';
import { fetchAdvisory, fetchCaisseCurrent, fetchDashboard, fetchTasks } from '@/api';
import { color, fmt, fmtFcfa } from '@/constants/theme';
import { enter } from '@/constants/motion';

type PanelKey = 'TACHES' | 'LOTS' | 'CAISSE' | 'RAPPORTS';

const PANEL_OPTIONS: SegmentedOption<PanelKey>[] = [
  { key: 'TACHES', label: 'Tâches' },
  { key: 'LOTS', label: 'Lots' },
  { key: 'CAISSE', label: 'Caisse' },
  { key: 'RAPPORTS', label: 'Rapports' },
];

function capitalize(value: string | null | undefined): string {
  const text = (value ?? '').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Météo de la ferme';
}

export default function ActivitesScreen() {
  const router = useRouter();
  const { farmId } = useAuth();
  const [panel, setPanel] = useState<PanelKey>('TACHES');
  const [span, setSpan] = useState<JournalSpan>(7);

  const dashboard = useQuery({ queryKey: ['dashboard', farmId], queryFn: () => fetchDashboard(farmId) });
  const caisse = useQuery({ queryKey: ['caisse', farmId], queryFn: () => fetchCaisseCurrent(farmId) });
  const tasks = useQuery({ queryKey: ['tasks', farmId], queryFn: () => fetchTasks(farmId), retry: false });
  const advisory = useQuery({ queryKey: ['advisory', farmId], queryFn: () => fetchAdvisory(farmId), retry: false });

  const d = dashboard.data;
  const c = caisse.data;

  const dateLabel = useMemo(() => {
    const label = new Date().toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }, []);

  const queue = useMemo(
    () =>
      buildActionQueue({
        healthOverview: d?.healthOverview,
        tasks: tasks.data,
        alerts: advisory.data?.alerts,
      }),
    [d?.healthOverview, tasks.data, advisory.data?.alerts],
  );

  const journal = useMemo(
    () =>
      buildJournal({
        healthOverview: d?.healthOverview,
        tasks: tasks.data,
        alerts: advisory.data?.alerts,
        sinceDays: span,
      }),
    [d?.healthOverview, tasks.data, advisory.data?.alerts, span],
  );

  const weather = d?.weather;

  const taskCounts = useMemo(() => {
    const list = tasks.data ?? [];
    return {
      aFaire: list.filter((t) => t.status === 'A_FAIRE').length,
      enCours: list.filter((t) => t.status === 'EN_COURS').length,
      faites: list.filter((t) => t.status === 'FAIT').length,
    };
  }, [tasks.data]);

  if (dashboard.isLoading) {
    return (
      <Screen bottomPad={120} header={<ScreenHeader title="Activités" subtitle="Journal & opérations" />}>
        <Spinner label="Chargement…" />
      </Screen>
    );
  }

  if (!d) {
    return (
      <Screen
        bottomPad={120}
        refreshing={dashboard.isFetching}
        onRefresh={() => {
          void dashboard.refetch();
        }}
        header={<ScreenHeader title="Activités" subtitle="Journal & opérations" />}>
        <Card tone="default" style={{ padding: 14 }}>
          <AppText size="body" color="muted">
            Impossible de charger l’activité de la ferme.
          </AppText>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      bottomPad={120}
      refreshing={dashboard.isFetching || caisse.isFetching}
      onRefresh={() => {
        void dashboard.refetch();
        void caisse.refetch();
        void tasks.refetch();
        void advisory.refetch();
      }}
      header={<ScreenHeader title="Activités" subtitle="Journal & opérations" />}>
      {/* `Screen` n'applique aucun espacement vertical entre ses enfants :
          ce stack restore la respiration entre switch, hero et panneau. */}
      <View style={styles.stack}>
        {/* ── Panneaux : un seul écran visible à la fois ───────────────────── */}
        <Segmented options={PANEL_OPTIONS} value={panel} onChange={setPanel} haptic />

        <ActivityHero d={d} dateLabel={dateLabel} />

      {/* ── Panneau « Tâches » ────────────────────────────────────────────── */}
      {panel === 'TACHES' ? (
        <Animated.View key="panneau-taches" entering={enter.fade()} style={styles.panel}>
          <View style={styles.countsRow}>
            <CountTile label="À faire" value={taskCounts.aFaire} />
            <CountTile label="En cours" value={taskCounts.enCours} />
            <CountTile label="Terminées" value={taskCounts.faites} />
          </View>

          <SectionHeader
            title="À traiter"
            subtitle={
              queue.total > 0
                ? `${queue.total} action${queue.total > 1 ? 's' : ''} en attente`
                : 'Aucune action requise'
            }
            icon={NotebookPen}
          />
          <ActionQueue queue={queue} />

          <SectionHeader title="Activité récente" icon={ClipboardCheck} />
          <SpanFilter value={span} onChange={setSpan} />
          <JournalTimeline groups={journal.groups} />
          {journal.truncatedGroups > 0 ? (
            <AppText size="small" color="faint" align="center">
              {journal.truncatedGroups} jour{journal.truncatedGroups > 1 ? 's' : ''} plus ancien
              {journal.truncatedGroups > 1 ? 's' : ''} non affiché{journal.truncatedGroups > 1 ? 's' : ''} — élargissez
              la période.
            </AppText>
          ) : null}

          <Pressable
            onPress={() => router.push('/tasks')}
            style={({ pressed }) => [styles.openAll, pressed && { opacity: 0.7 }]}
            accessibilityRole="button">
            <AppText size="small" weight="semibold" color="brand">
              Ouvrir le planning complet →
            </AppText>
          </Pressable>
        </Animated.View>
      ) : null}

      {/* ── Panneau « Lots » ──────────────────────────────────────────────── */}
      {panel === 'LOTS' ? (
        <Animated.View key="panneau-lots" entering={enter.fade()} style={styles.panel}>
          <View style={styles.countsRow}>
            <CountTile label="Stock vivant" value={fmt(d.liveStock)} />
            <CountTile label="Lots actifs" value={d.batches.actif} />
            <CountTile label="En vente" value={d.batches.enVente} />
          </View>

          <SectionHeader title="État des lots" icon={NotebookPen} />
          <BatchPulseList rows={d.healthOverview} />

          <Pressable
            onPress={() => router.push('/lots')}
            style={({ pressed }) => [styles.openAll, pressed && { opacity: 0.7 }]}
            accessibilityRole="button">
            <AppText size="small" weight="semibold" color="brand">
              Gérer les lots →
            </AppText>
          </Pressable>
        </Animated.View>
      ) : null}

      {/* ── Panneau « Caisse » ────────────────────────────────────────────── */}
      {panel === 'CAISSE' ? (
        <Animated.View key="panneau-caisse" entering={enter.fade()} style={styles.panel}>
          <SectionHeader title="Caisse du jour" icon={Wallet} />
          {c ? (
            <>
              <Card
                tone={c.session.status === 'OPEN' ? 'green' : 'default'}
                style={styles.caisseCard}>
                <View style={styles.caisseHead}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    <AppText size="body" weight="bold" color="text">
                      {c.session.status === 'OPEN' ? 'Session ouverte' : 'Session fermée'}
                    </AppText>
                    <Chip
                      label={c.session.status === 'OPEN' ? 'OUVERTE' : 'FERMÉE'}
                      tone={c.session.status === 'OPEN' ? 'green' : 'neutral'}
                      dot
                    />
                  </View>
                  <Pressable
                    onPress={() => router.push('/pos?tab=CAISSE')}
                    accessibilityRole="button">
                    <AppText size="small" weight="semibold" color="brand">
                      Ouvrir →
                    </AppText>
                  </Pressable>
                </View>

                <View style={styles.caisseRow}>
                  <View style={styles.caisseStat}>
                    <AppText size="caption" color="muted">
                      Entrées
                    </AppText>
                    <AppText size="bodyM" weight="bold" color="success" numberOfLines={1}>
                      {fmtFcfa(c.inFcfa)}
                    </AppText>
                  </View>
                  <View style={styles.caisseStat}>
                    <AppText size="caption" color="muted">
                      Sorties
                    </AppText>
                    <AppText size="bodyM" weight="bold" color="danger" numberOfLines={1}>
                      {fmtFcfa(c.outFcfa)}
                    </AppText>
                  </View>
                  <View style={[styles.caisseStat, styles.caisseStatLast]}>
                    <AppText size="caption" color="muted">
                      Solde
                    </AppText>
                    <AppText size="bodyM" weight="bold" color="text" numberOfLines={1}>
                      {fmtFcfa(c.expectedBalanceFcfa)}
                    </AppText>
                  </View>
                </View>
              </Card>

              {c.movements.length > 0 ? (
                <View style={styles.movementList}>
                  <AppText size="label" weight="bold" color="muted" style={{ paddingLeft: 4 }}>
                    MOUVEMENTS DU JOUR
                  </AppText>
                  {c.movements.slice(0, 10).map((m) => (
                    <View key={m.id} style={styles.movementRow}>
                      <View
                        style={[
                          styles.movementDot,
                          { backgroundColor: m.type === 'IN' ? color.green[50] : color.red[50] },
                        ]}>
                        {m.type === 'IN' ? (
                          <ArrowDown size={12} color={color.green[600]} />
                        ) : (
                          <ArrowUp size={12} color={color.red[500]} />
                        )}
                      </View>
                      <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
                        <AppText size="bodyM" weight="semibold" color="text" numberOfLines={1}>
                          {m.reason ?? SOURCE_LABEL[m.source] ?? 'Mouvement'}
                        </AppText>
                        <AppText size="small" color="faint" numberOfLines={1}>
                          {SOURCE_LABEL[m.source] ?? m.source} · {timeLabel(m.createdAt)}
                        </AppText>
                      </View>
                      <AppText
                        size="bodyM"
                        weight="bold"
                        color={m.type === 'IN' ? 'success' : 'danger'}
                        numberOfLines={1}>
                        {m.type === 'IN' ? '+' : '−'}
                        {fmtFcfa(m.amountFcfa)}
                      </AppText>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.movementList}>
                  <AppText size="small" color="faint" align="center">
                    Aucun mouvement enregistré sur cette session.
                  </AppText>
                </View>
              )}
            </>
          ) : (
            <Card tone="default" style={{ padding: 14 }}>
              <AppText size="body" color="muted">
                Aucune session de caisse aujourd’hui.
              </AppText>
            </Card>
          )}
        </Animated.View>
      ) : null}

      {/* ── Panneau « Rapports » ──────────────────────────────────────────── */}
      {panel === 'RAPPORTS' ? (
        <Animated.View key="panneau-rapports" entering={enter.fade()} style={styles.panel}>
          <SectionHeader title="La semaine" subtitle="Écarts vs semaine précédente" icon={NotebookPen} />
          <WeeklyReport d={d} />

          <SectionHeader title="Performance des lots" icon={ClipboardCheck} />
          <PerformanceList rows={d.leaderboard} />

          {weather ? (
            <Card tone="default" style={styles.weatherCard}>
              <View style={styles.weatherRow}>
                <Sun size={18} color={color.accent[500]} />
                <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
                  <AppText size="bodyM" weight="bold" color="text" numberOfLines={1}>
                    {capitalize(weather.condition)}
                  </AppText>
                  <AppText size="small" color="muted" numberOfLines={1}>
                    {weather.location}
                  </AppText>
                </View>
                <View style={styles.weatherTemps}>
                  <View style={styles.tempItem}>
                    <Thermometer size={12} color={color.red[500]} />
                    <AppText size="bodyM" weight="bold" color="text">
                      {Math.round(weather.temperatureC)}°
                    </AppText>
                  </View>
                  <View style={styles.tempItem}>
                    <Droplets size={12} color={color.brand[500]} />
                    <AppText size="bodyM" weight="bold" color="muted">
                      {Math.round(weather.humidityPct)} %
                    </AppText>
                  </View>
                </View>
              </View>
              {weather.rainfallMm > 0 ? (
                <View style={styles.rainNote}>
                  <AppText size="small" color="muted">
                    Pluie prévue : {weather.rainfallMm.toFixed(1)} mm — surveiller la litière et le
                    ventilation.
                  </AppText>
                </View>
              ) : null}
            </Card>
          ) : null}

          <View style={styles.countsRow}>
            <CountTile label="Bâtiments" value={fmt(d.buildingsCount)} />
            <CountTile label="Équipe" value={d.teamCount} />
            <CountTile label="Alertes" value={d.alerts.total} />
          </View>

          <Pressable
            onPress={() => router.push('/rapports')}
            style={({ pressed }) => [styles.openAll, pressed && { opacity: 0.7 }]}
            accessibilityRole="button">
            <AppText size="small" weight="semibold" color="brand">
              Ouvrir les rapports détaillés →
            </AppText>
          </Pressable>
        </Animated.View>
      ) : null}
      </View>
    </Screen>
  );
}

function CountTile({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.countTile}>
      <AppText size="bodyM" weight="bold" color="text" numberOfLines={1}>
        {value}
      </AppText>
      <AppText size="small" color="muted" numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
  },
  panel: {
    gap: 14,
  },
  countsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  countTile: {
    flex: 1,
    gap: 2,
    minWidth: 0,
    padding: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  openAll: {
    paddingVertical: 11,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  movementList: {
    gap: 2,
  },
  movementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  movementDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caisseCard: {
    gap: 12,
    padding: 14,
  },
  caisseHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  caisseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  caisseStat: {
    flex: 1,
    gap: 2,
    minWidth: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: color.border,
    paddingRight: 8,
  },
  caisseStatLast: {
    borderRightWidth: 0,
    paddingRight: 0,
  },
  weatherCard: {
    padding: 14,
  },
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  weatherTemps: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tempItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rainNote: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
});
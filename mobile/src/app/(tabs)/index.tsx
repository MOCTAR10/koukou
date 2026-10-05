import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Bird, AlertTriangle, Wheat, Egg, Banknote, BarChart3, MapPin, ShieldCheck, Activity, TrendingUp, TrendingDown, Scale, Thermometer, Users, Medal, Maximize2, Store, ChevronDown, Droplets, Building, ArrowRight, Stethoscope } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';

import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { MetricTile } from '@/components/ui/MetricTile';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { LotCard } from '@/components/LotCard';
import { EggStockCard, buildEggDailyData } from '@/components/EggStockCard';
import { Button } from '@/components/ui/Button';
import { useQuickCapture } from '@/components/capture/QuickCaptureProvider';
import { useAuth } from '@/auth/AuthContext';
import { givenName, speciesLabel } from '@/api/format';
import { color, emoji, fmt, fmtFcfa, gradeColor, palette, radii } from '@/constants/theme';import { fetchAdvisory, fetchDashboard, fetchBatches, fetchSlaughterOrders } from '@/api';
import { normalizeMortalityStatus } from '@/constants/health';
import { Spinner } from '@/components/ui/Spinner';
import { MetricInfoSheet } from '@/components/MetricInfoSheet';
import type { MetricKey } from '@/components/MetricInfoSheet';
import { CheptelModal } from '@/components/CheptelModal';
import { PeriodBar, periodWindow, toDateStr, type PeriodWindow } from '@/components/ui/PeriodBar';
import type { BatchWithMetrics, FarmWeather, HealthGrade } from '@/api/types';

function weatherHint(w: FarmWeather): string {
  const t = w.temperatureC ?? 0;
  const h = w.humidityPct;
  if (t >= 33) return 'Chaleur forte : ventilez et abreuvez bien vos oiseaux.';
  if (t >= 30) return 'Chaleur soutenue : surveillez l’abreuvement.';
  if (h != null && h >= 75) return 'Humidité élevée : pensez à ventiler les bâtiments.';
  if (h != null && h <= 35) return 'Air sec : assurez l’abreuvement des sujets.';
  return w.condition ? `Conditions : ${w.condition}.` : 'Conditions favorables pour vos élevages.';
}

// Bornes de dates stables : gérées en interne par PeriodBar.


export default function AccueilScreen() {
  const router = useRouter();
  const { openDaily, openFeed, openSale } = useQuickCapture();
  const { user, farms, farmId } = useAuth();
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [cheptelOpen, setCheptelOpen] = useState(false);
  const [metricInfo, setMetricInfo] = useState<MetricKey | null>(null);
  const [window, setWindow] = useState<PeriodWindow>(() => periodWindow(30));
  const [liveNow, setLiveNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setLiveNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const isFiltered = window.isFiltered;
  const isToday = window.to === toDateStr(liveNow);

  const formatDayShort = (d: Date) =>
    d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

  const handlePeriodChange = useCallback((w: PeriodWindow) => {
    setWindow(w);
  }, []);

  // Query params: in live mode we snap to the current minute so the dashboard
  // only refetches once per minute instead of every second (clock ticks in the UI).
  const queryDateStr = window.isFiltered ? (window.to ?? toDateStr(liveNow)) : toDateStr(liveNow);
  const queryTimeStr = window.isFiltered
    ? (window.time ?? '12:00')
    : `${String(liveNow.getHours()).padStart(2, '0')}:${String(liveNow.getMinutes()).padStart(2, '0')}`;
  const dashboard = useQuery({
    queryKey: ['dashboard', farmId, queryDateStr, queryTimeStr],
    queryFn: () => fetchDashboard(farmId, queryDateStr, queryTimeStr),
  });
  const advisory = useQuery({ queryKey: ['advisory', farmId], queryFn: () => fetchAdvisory(farmId) });
  const batchesQuery = useQuery({ queryKey: ['batches', farmId, window.isFiltered ? (window.to ?? '') : ''], queryFn: () => fetchBatches(farmId, window.isFiltered ? window.to : undefined), refetchInterval: !window.isFiltered ? 60_000 : undefined });
  const slaughterQuery = useQuery({ queryKey: ['slaughter-orders', farmId], queryFn: () => fetchSlaughterOrders(farmId) });
  const slaughterOrders = slaughterQuery.data ?? [];
  const slaughterProcessed = slaughterOrders.filter((o) => o.status === 'PROCESSED');
  const totalBirdsSlaughtered = slaughterProcessed.reduce((s, o) => s + o.birdCount, 0);
  const totalWeightKg = slaughterProcessed.reduce((s, o) => s + (o.totalWeightKg ?? 0), 0);
  const avgRendement = slaughterProcessed.filter((o) => o.rendementPercent != null).length > 0
    ? slaughterProcessed.filter((o) => o.rendementPercent != null).reduce((s, o) => s + (o.rendementPercent ?? 0), 0) / slaughterProcessed.filter((o) => o.rendementPercent != null).length
    : null;


  const farm = farms.length > 0 ? farms[0] : null;
  const d = dashboard.data;
  const topAction = advisory.data?.actions[0];

  const loading = dashboard.isLoading || advisory.isLoading;

  // --- Compute weighted averages from active batches ---
  const batches = batchesQuery.data ?? [];
  const activeBatches = batches.filter((b) => b.status !== 'CLOTURE');
  const totalLive = activeBatches.reduce((s, b) => s + b.metrics.liveCount, 0);
  // Pondérés par effectif, en ignorant les lots sans valeur (fcr/gmq/ipe null).
  const weightedAvg = (picker: (b: BatchWithMetrics) => number | null | undefined): number | null => {
    let sum = 0;
    let live = 0;
    for (const b of activeBatches) {
      const v = picker(b);
      if (v == null) continue;
      sum += v * b.metrics.liveCount;
      live += b.metrics.liveCount;
    }
    return live > 0 ? sum / live : null;
  };
  const avgFcr = weightedAvg((b) => b.metrics.fcr);
  const avgGmq = weightedAvg((b) => b.metrics.gmqGramsPerDay);
  const avgIpe = weightedAvg((b) => b.metrics.ipe);
  // Taux de ponte only for laying batches
  const layerBatches = activeBatches.filter((b) => b.type === 'PONDEUSE' && b.metrics.layRatePercent != null);
  const layerLive = layerBatches.reduce((s, b) => s + b.metrics.liveCount, 0);
  const avgLayRate = layerLive > 0
    ? layerBatches.reduce((s, b) => s + (b.metrics.layRatePercent ?? 0) * b.metrics.liveCount, 0) / layerLive
    : null;
  // Taux de ponte by type
  const pondeuseBatches = activeBatches.filter((b) => b.type === 'PONDEUSE');
  const pondeuseLive = pondeuseBatches.reduce((s, b) => s + b.metrics.liveCount, 0);
  const pondeuseLayRate = pondeuseLive > 0
    ? pondeuseBatches.reduce((s, b) => s + (b.metrics.layRatePercent ?? 0) * b.metrics.liveCount, 0) / pondeuseLive
    : null;
  const avgViability = totalLive > 0
    ? activeBatches.reduce((s, b) => s + b.metrics.viabilityPercent * b.metrics.liveCount, 0) / totalLive
    : null;

  // --- Leaderboard top performer ---
  const topPerf = d?.leaderboard?.[0] ?? null;

  // --- Max density across active batches ---
  const maxDensity = activeBatches.reduce((max, b) => Math.max(max, b.metrics.densityPerM2 ?? 0), 0);
  // --- Average age (days) across active batches ---
  const avgAgeDays = activeBatches.length > 0
    ? Math.round(activeBatches.reduce((s, b) => s + b.metrics.ageDays, 0) / activeBatches.length)
    : null;
  // --- Total feed consumed (kg) across active batches ---
  const totalFeedKg = activeBatches.reduce((s, b) => s + (b.metrics.totalFeedKg ?? 0), 0);
  const avgFeedPerBird = totalLive > 0 ? Math.round(totalFeedKg / totalLive) : null;

  // --- Best breed status deviation (closest to target) ---
  const breedEntries = (d?.healthOverview ?? []).filter((h) => h.breedStatus != null);
  const bestBreedEntry = breedEntries.length > 0
    ? breedEntries.reduce((best, h) => {
        const bs = h.breedStatus!;
        const dev = bs.fcrDeviationPct != null ? Math.abs(bs.fcrDeviationPct) : bs.layRateDeviationPct != null ? Math.abs(bs.layRateDeviationPct) : 999;
        const bestBs = best.breedStatus!;
        const bestDev = bestBs.fcrDeviationPct != null ? Math.abs(bestBs.fcrDeviationPct) : bestBs.layRateDeviationPct != null ? Math.abs(bestBs.layRateDeviationPct) : 999;
        return dev < bestDev ? h : best;
      })
    : null;

  // --- Egg daily data from layer batches ---
  const eggDailyData = d ? buildEggDailyData(totalLive, avgLayRate) : [];

  // --- Egg breakdown by category, aggregated across active batches ---
  const eggBreakdown = {
    collected: 0,
    sellable: 0,
    cracked: 0,
    small: 0,
    doubleYolk: 0,
    dirty: 0,
  };
  for (const b of activeBatches) {
    const eb = b.metrics.eggBreakdown;
    eggBreakdown.collected += eb.collected;
    eggBreakdown.sellable += eb.sellable;
    eggBreakdown.cracked += eb.cracked;
    eggBreakdown.small += eb.small;
    eggBreakdown.doubleYolk += eb.doubleYolk;
    eggBreakdown.dirty += eb.dirty;
  }

  const refresh = () => {
    void Promise.all([dashboard.refetch(), advisory.refetch(), batchesQuery.refetch()]);
  };

  const runTopAction = () => {
    if (!topAction) return;
    const batchId = topAction.batchId ?? undefined;
    switch (topAction.kind) {
      case 'VENTE':
        openSale(batchId);
        return;
      case 'SAISIE':
        openDaily(batchId);
        return;
      case 'SOIN':
        router.push('/sanitary');
        return;
      case 'STOCK_PROVENDE':
        openFeed();
        return;
      default:
        router.push('/alerts');
    }
  };

  return (
    <Screen
      bottomPad={120}
      refreshing={dashboard.isFetching || advisory.isFetching || batchesQuery.isFetching}
      onRefresh={refresh}
      header={
        <>
          <View style={styles.topRow}>
            <View style={styles.avatar}>
              <Image
                source={require('@/assets/images/logo-nav.png')}
                style={styles.avatarLogo}
                contentFit='contain'
                accessibilityLabel='Logo KouKou'
              />
            </View>
            <View style={styles.greetCol}>
              <AppText size='body' weight='bold' color='text'>
                Bonjour, {givenName(user.fullName)}
              </AppText>
            </View>
            {(d?.alerts.rouge ?? 0) + (d?.alerts.jaune ?? 0) > 0 && (
              <Pressable onPress={() => router.push('/alerts')} accessibilityRole='button' style={styles.alertBtn}>
                <AlertTriangle size={18} color={palette.amber[500]} />
                <View style={styles.alertBadge}>
                  <AppText size='small' weight='bold' color='surface'>
                    {(d?.alerts.rouge ?? 0) + (d?.alerts.jaune ?? 0)}
                  </AppText>
                </View>
              </Pressable>
            )}
          </View>
          <View style={styles.metaRow}>
            <View style={styles.farmChipRow}>
              {farms.length > 0 ? (
                <>
                  <MapPin size={12} color={palette.ink[400]} />
                  <Pressable onPress={() => Alert.alert('Ferme actuelle', farm?.name ?? 'Aucune ferme', [{ text: 'OK', style: 'cancel' }])}>
                    <AppText size='small' color='muted' style={styles.chipText}>
                      {farm!.name} · {farm!.administrativeCity}
                    </AppText>
                    {farm!.isVerified ? <ShieldCheck size={12} color={palette.green[600]} /> : null}
                  </Pressable>
                </>
              ) : null}
            </View>
            <View style={styles.encaissePill}>
              <Banknote size={14} color={palette.accent[500]} />
              <View>
                <AppText size='body' weight='bold' color='text' numberOfLines={1}>
                  {fmtFcfa(d?.collectedTodayFcfa ?? 0)}
                </AppText>
                <AppText size='caption' color='muted' numberOfLines={1}>
                  {isToday ? "Encaissé aujourd'hui" : `Encaissé le ${formatDayShort(window.to ? new Date(window.to) : liveNow)}`}
                </AppText>
              </View>
            </View>
          </View>
          <PeriodBar defaultSpan={30} onChange={handlePeriodChange} />
        </>
      }
    >

      {dashboard.isError || advisory.isError ? (
        <View style={{ marginTop: 16, gap: 10 }}>
          <AppText size='body' color='danger'>
            Impossible de charger les données de la ferme. Vérifiez la connexion au serveur.
          </AppText>
          <Button label='Réessayer' tone='brand' onPress={refresh} />
        </View>
      ) : loading || !d ? (
        <Spinner label="Chargement de votre ferme…" />
      ) : (
        <>
          {/* ── Cheptel + Lots ── */}
          <View style={styles.metricGrid}>
            <MetricTile label='Cheptel vivant' value={fmt(d.liveStock)} sub={`${d.batches.actif} lot${d.batches.actif > 1 ? 's' : ''}`} tone='green' iconImage={require('@/assets/images/chiken.jpg')} narrowStats onPress={() => setCheptelOpen(true)} compact />
            <MetricTile label='Lots actifs' value={String(d.batches.actif)} sub={`${d.batches.enVente} en vente`} tone='brand' iconImage={require('@/assets/images/poussin33.jpg')} onPress={() => router.push('/lots')} compact />
          </View>
          {/* ── Health card — Pro View ── */}
          <View style={styles.healthCard}>
            <View style={styles.healthTopRow}>
              <HealthRing score={d.health.score} grade={d.health.grade} />
              <View style={styles.healthTopInfo}>
                <View style={styles.healthTitleRow}>
                  <AppText size="body" weight="bold" color="text">Santé</AppText>
                  <View style={{ flex: 1 }} />
                  <Pressable
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); router.push('/sanitary'); }}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.healthSanitaireBtn, pressed && { opacity: 0.7 }]}
                  >
                    <Stethoscope size={13} color={palette.surface} strokeWidth={2.4} />
                    <AppText size='small' weight='semibold' color='surface' numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Centre Sanitaire</AppText>
                    <ArrowRight size={12} color={palette.surface} />
                  </Pressable>
                </View>
                {/* Grade label */}
                <AppText size="small" weight="semibold" style={{ color: gradeColor[d.health.grade] }}>
                  {d.health.grade === 'EXCELLENT' ? '🟢 Excellent' : d.health.grade === 'BON' ? '🟢 Bon' : d.health.grade === 'MOYEN' ? '🟡 Moyen' : '🔴 Critique'}
                </AppText>
              </View>
            </View>
            {/* Alert badges row */}
            <View style={styles.healthAlertRow}>
              <View style={[styles.healthAlertBadge, { backgroundColor: palette.red[50], borderColor: palette.red[200] }]}>
                <View style={[styles.healthAlertDot, { backgroundColor: palette.red[500] }]} />
                <AppText size="small" weight="semibold" color="danger">{d.health.breakdown.rouge}</AppText>
                <AppText size="small" color="muted">Rouge</AppText>
              </View>
              <View style={[styles.healthAlertBadge, { backgroundColor: palette.amber[50], borderColor: palette.amber[200] }]}>
                <View style={[styles.healthAlertDot, { backgroundColor: palette.amber[500] }]} />
                <AppText size="small" weight="semibold" color="warn">{d.health.breakdown.jaune}</AppText>
                <AppText size="small" color="muted">Jaune</AppText>
              </View>
              <View style={[styles.healthAlertBadge, {
                backgroundColor: normalizeMortalityStatus(d.mortalityStatus, d.mortalityPercent) === 'normal' ? palette.green[50] : normalizeMortalityStatus(d.mortalityStatus, d.mortalityPercent) === 'elevated' ? palette.amber[50] : palette.red[50],
                borderColor: normalizeMortalityStatus(d.mortalityStatus, d.mortalityPercent) === 'normal' ? palette.green[200] : normalizeMortalityStatus(d.mortalityStatus, d.mortalityPercent) === 'elevated' ? palette.amber[200] : palette.red[200],
              }]}>
                <View style={[styles.healthAlertDot, {
                  backgroundColor: normalizeMortalityStatus(d.mortalityStatus, d.mortalityPercent) === 'normal' ? palette.green[500] : normalizeMortalityStatus(d.mortalityStatus, d.mortalityPercent) === 'elevated' ? palette.amber[500] : palette.red[500],
                }]} />
                <AppText size="small" weight="semibold"
                  color={normalizeMortalityStatus(d.mortalityStatus, d.mortalityPercent) === 'normal' ? 'success' : normalizeMortalityStatus(d.mortalityStatus, d.mortalityPercent) === 'elevated' ? 'warn' : 'danger'}>
                  {d.mortalityPercent != null ? `${d.mortalityPercent.toFixed(1)}%` : '—'}
                </AppText>
                <AppText size="small" color="muted">Mort.</AppText>
              </View>
            </View>
            {/* Mortality progress bar */}
            <View style={styles.healthMortalityBar}>
              <View style={styles.healthMortalityTrack}>
                <View style={[styles.healthMortalityFill, {
                  width: `${Math.min(100, (d.mortalityPercent ?? 0) / 10 * 100)}%`,
                  backgroundColor: normalizeMortalityStatus(d.mortalityStatus, d.mortalityPercent) === 'normal' ? palette.green[500] : normalizeMortalityStatus(d.mortalityStatus, d.mortalityPercent) === 'elevated' ? palette.amber[500] : palette.red[500],
                }]} />
              </View>
              <AppText size="small" color="muted">Mortalité</AppText>
            </View>
            {/* Météo — pleine largeur avec un conseil lié au climat */}
            {d?.weather && (
              <View style={styles.healthWeatherRow}>
                <AppText style={{ fontSize: 15 }}>{emoji(d.weather.condition ?? '')}</AppText>
                <View style={{ flex: 1, gap: 1 }}>
                  <View style={styles.weatherMainRow}>
                    <AppText size='small' weight='bold' color='text'>{d.weather.temperatureC ?? '—'}°C</AppText>
                    {d.weather.humidityPct != null && (
                      <View style={styles.weatherHumidity}>
                        <Droplets size={9} color={palette.brand[500]} />
                        <AppText size='small' weight='semibold' color='brand'>{d.weather.humidityPct}%</AppText>
                      </View>
                    )}
                  </View>
                  <AppText size="small" color="muted" numberOfLines={2}>
                    {weatherHint(d.weather)}
                  </AppText>
                </View>
              </View>
            )}
          </View>
          <SectionHeader
            title='Statistiques'
            right={
              <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setStatsExpanded(!statsExpanded); }} accessibilityRole='button' style={[styles.expandBtn, statsExpanded && styles.expandBtnActive]}>
                <AppText size='small' weight='semibold' color={statsExpanded ? 'surface' : 'brand'}>
                  {statsExpanded ? 'Moins' : 'Plus'}
                </AppText>
                <ChevronDown size={14} color={statsExpanded ? palette.brand[50] : palette.brand[600]} style={{ transform: [{ rotate: statsExpanded ? '180deg' : '0deg' }] }} />
              </Pressable>
            }
          />

          {/* ── Performance row: IC, GMQ, IPE — always one row ── */}
          <View style={styles.metricGridNoWrap}>
            <MetricTile
              label='IC (FCR)'
              value={avgFcr != null && avgFcr > 0 ? avgFcr.toFixed(2) : '—'}
              sub={avgFcr != null && avgFcr > 2.2 ? '⚠ Élevé' : avgFcr != null && avgFcr < 1.8 ? 'Excellent' : 'Conforme'}
              tone={avgFcr != null && avgFcr > 2.2 ? 'red' : avgFcr != null && avgFcr < 1.8 ? 'green' : 'default'}
              icon={Activity}
              onPress={() => setMetricInfo('IC')}
              threeCol
            />
            <MetricTile
              label='GMQ (g/j)'
              value={avgGmq != null ? `${avgGmq.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}` : '—'}
              sub={avgGmq != null && avgGmq > 55 ? 'Croissance rapide' : avgGmq != null && avgGmq < 0 ? 'Perte de poids' : avgGmq != null ? 'Croissance normale' : undefined}
              tone={avgGmq != null && avgGmq > 55 ? 'green' : avgGmq != null && avgGmq < 0 ? 'amber' : 'default'}
              icon={TrendingUp}
              onPress={() => setMetricInfo('GMQ')}
              threeCol
            />
            <MetricTile
              label='IPE'
              value={avgIpe != null && avgIpe > 0 ? fmt(Math.round(avgIpe)) : '—'}
              sub={avgIpe != null && avgIpe > 350 ? '⚠ Coût élevé' : avgIpe != null ? 'Coût maîtrisé' : undefined}
              tone={avgIpe != null && avgIpe > 350 ? 'amber' : avgIpe != null ? 'green' : 'default'}
              icon={Scale}
              onPress={() => setMetricInfo('IPE')}
              threeCol
            />
          </View>
          {/* ── Expanded: Grouped farm details ── */}
          {statsExpanded && (
            <Card tone='default' style={styles.statsExpandedCard}>
              {/* ── Group: Lots ── */}
              <View style={styles.statsGroup}>
                <View style={[styles.statsGroupLabel, { borderLeftColor: palette.brand[500] }]}>
                  <BarChart3 size={13} color={palette.brand[600]} />
                  <AppText size='small' weight='bold' color='text'>Lots</AppText>
                </View>
                <View style={styles.statsGroupRow}>
                  <View style={styles.statsItem}>
                    <AppText size='small' color='muted'>Âge moyen</AppText>
                    <AppText size='bodyM' weight='bold' color='brand'>{avgAgeDays != null ? `${avgAgeDays} j` : '—'}</AppText>
                    <AppText size='small' color='faint'>{activeBatches.length} lot{activeBatches.length > 1 ? 's' : ''}</AppText>
                  </View>
                  <View style={styles.statsVerticalDivider} />
                  <View style={styles.statsItem}>
                    <AppText size='small' color='muted'>Densité max</AppText>
                    <View style={styles.statsValueRow}>
                      <AppText size='bodyM' weight='bold'
                        color={maxDensity > 18 ? palette.red[500] : maxDensity > 15 ? palette.amber[500] : palette.green[600]}>
                        {maxDensity > 0 ? `${maxDensity.toFixed(1)}` : '—'}
                      </AppText>
                      <AppText size='small' color='faint'>/m²</AppText>
                    </View>
                    <AppText size='small' color='faint'>oiseaux max</AppText>
                  </View>
                </View>
              </View>
              <View style={styles.statsGroupDivider} />
              {/* ── Group: Alimentation ── */}
              <View style={styles.statsGroup}>
                <View style={[styles.statsGroupLabel, { borderLeftColor: palette.green[500] }]}>
                  <Wheat size={13} color={palette.green[600]} />
                  <AppText size='small' weight='bold' color='text'>Alimentation</AppText>
                </View>
                <View style={styles.statsGroupRow}>
                  <View style={styles.statsItem}>
                    <AppText size='small' color='muted'>Autonomie</AppText>
                    <View style={styles.statsValueRow}>
                      <AppText size='bodyM' weight='bold'
                        color={d.feedAutonomyDays != null && d.feedAutonomyDays < 3 ? palette.red[500] : d.feedAutonomyDays != null && d.feedAutonomyDays < 5 ? palette.amber[500] : palette.green[600]}>
                        {d.feedAutonomyDays != null ? `${d.feedAutonomyDays} j` : '—'}
                      </AppText>
                      {d.feedAutonomyDays != null && (
                        <View style={[styles.statsChip, {
                          backgroundColor: d.feedAutonomyDays < 3 ? palette.red[50] : d.feedAutonomyDays < 5 ? palette.amber[50] : palette.green[50],
                          borderColor: d.feedAutonomyDays < 3 ? palette.red[200] : d.feedAutonomyDays < 5 ? palette.amber[200] : palette.green[200],
                        }]}>
                          <AppText size='small' weight='semibold' color={d.feedAutonomyDays < 3 ? 'danger' : d.feedAutonomyDays < 5 ? 'warn' : 'success'}>
                            {d.feedAutonomyDays < 3 ? 'Critique' : d.feedAutonomyDays < 5 ? 'Bas' : 'OK'}
                          </AppText>
                        </View>
                      )}
                    </View>
                    <AppText size='small' color='faint'>Capacité stock</AppText>
                  </View>
                  <View style={styles.statsVerticalDivider} />
                  <View style={styles.statsItem}>
                    <AppText size='small' color='muted'>Consommation</AppText>
                    <AppText size='bodyM' weight='bold' color='text'>{avgFeedPerBird != null ? `${avgFeedPerBird} g` : '—'}</AppText>
                    <AppText size='small' color='faint'>/ oiseau</AppText>
                  </View>
                </View>
              </View>
              <View style={styles.statsGroupDivider} />
              {/* ── Group: Tendances (weekly deltas) ── */}
              <View style={styles.statsGroup}>
                <View style={[styles.statsGroupLabel, { borderLeftColor: palette.amber[500] }]}>
                  <TrendingUp size={13} color={palette.amber[600]} />
                  <AppText size='small' weight='bold' color='text'>Tendances semaine</AppText>
                </View>
                <View style={styles.statsGroupRow}>
                  <View style={styles.statsItem}>
                    <AppText size='small' color='muted'>Mortalité</AppText>
                    <View style={styles.statsValueRow}>
                      <AppText size='bodyM' weight='bold'
                        color={d.deltas.mortalityDelta > 0 ? palette.red[500] : d.deltas.mortalityDelta < 0 ? palette.green[600] : 'text'}>
                        {d.deltas.mortalityThisWeek.toFixed(1)}%
                      </AppText>
                      {d.deltas.mortalityDelta !== 0 && (
                        <View style={[styles.statsChip, {
                          backgroundColor: d.deltas.mortalityDelta > 0 ? palette.red[50] : palette.green[50],
                          borderColor: d.deltas.mortalityDelta > 0 ? palette.red[200] : palette.green[200],
                        }]}>
                          {d.deltas.mortalityDelta > 0
                            ? <TrendingDown size={10} color={palette.red[500]} />
                            : <TrendingUp size={10} color={palette.green[500]} />
                          }
                          <AppText size='small' weight='semibold'
                            color={d.deltas.mortalityDelta > 0 ? 'danger' : 'success'}>
                            {d.deltas.mortalityDelta > 0 ? '+' : ''}{d.deltas.mortalityDelta.toFixed(1)}%
                          </AppText>
                        </View>
                      )}
                    </View>
                    <AppText size='small' color='faint'>vs semaine passée</AppText>
                  </View>
                  <View style={styles.statsVerticalDivider} />
                  <View style={styles.statsItem}>
                    <AppText size='small' color='muted'>Provende</AppText>
                    <View style={styles.statsValueRow}>
                      <AppText size='bodyM' weight='bold' color='text'>
                        {d.deltas.feedThisWeekKg > 0 ? `${Math.round(d.deltas.feedThisWeekKg)} kg` : '—'}
                      </AppText>
                      {d.deltas.feedDeltaKg !== 0 && (
                        <View style={[styles.statsChip, {
                          backgroundColor: d.deltas.feedDeltaKg > 0 ? palette.amber[50] : palette.green[50],
                          borderColor: d.deltas.feedDeltaKg > 0 ? palette.amber[200] : palette.green[200],
                        }]}>
                          {d.deltas.feedDeltaKg > 0
                            ? <TrendingUp size={10} color={palette.amber[500]} />
                            : <TrendingDown size={10} color={palette.green[500]} />
                          }
                          <AppText size='small' weight='semibold'
                            color={d.deltas.feedDeltaKg > 0 ? 'warn' : 'success'}>
                            {d.deltas.feedDeltaKg > 0 ? '+' : ''}{Math.round(d.deltas.feedDeltaKg)} kg
                          </AppText>
                        </View>
                      )}
                    </View>
                    <AppText size='small' color='faint'>vs semaine passée</AppText>
                  </View>
                </View>
              </View>
              <View style={styles.statsGroupDivider} />
              {/* ── Group: Infrastructures ── */}
              <View style={styles.statsGroup}>
                <View style={[styles.statsGroupLabel, { borderLeftColor: palette.ink[400] }]}>
                  <Building size={13} color={palette.ink[600]} />
                  <AppText size='small' weight='bold' color='text'>Infrastructures</AppText>
                </View>
                <View style={styles.statsGroupRow}>
                  <View style={styles.statsItem}>
                    <AppText size='small' color='muted'>Bâtiments</AppText>
                    <View style={styles.statsValueRow}>
                      <AppText size='bodyM' weight='bold' color='text'>{d.buildingsCount ?? 0}</AppText>
                      {d.totalAreaM2 != null && (
                        <AppText size='small' color='faint'>{d.totalAreaM2} m²</AppText>
                      )}
                    </View>
                    <AppText size='small' color='faint'>
                      {d.farmDensityPerM2 != null ? `Densité ${d.farmDensityPerM2.toFixed(1)}/m²` : 'Surface totale'}
                    </AppText>
                  </View>
                  <View style={styles.statsVerticalDivider} />
                  <View style={styles.statsItem}>
                    <AppText size='small' color='muted'>Eau (jour)</AppText>
                    <View style={styles.statsValueRow}>
                      <AppText size='bodyM' weight='bold'
                        color={d.waterDropPercent != null && d.waterDropPercent > 25 ? palette.red[500] : d.waterDropPercent != null && d.waterDropPercent > 10 ? palette.amber[500] : 'text'}>
                        {d.waterConsumptionTodayL != null ? `${Math.round(d.waterConsumptionTodayL)} L` : '—'}
                      </AppText>
                    </View>
                    <AppText size='small' color='faint'>
                      {d.waterDropPercent != null ? (d.waterDropPercent > 25 ? '⚠ Chute critique' : d.waterDropPercent > 10 ? '⚠ Baisse' : d.waterDropPercent < -5 ? '↑ Hausse' : 'Stable') : 'Pas de données'}
                    </AppText>
                  </View>
                </View>
              </View>
              <View style={styles.statsGroupDivider} />
              {/* ── Group: Production ── */}
              <View style={styles.statsGroup}>
                <View style={[styles.statsGroupLabel, { borderLeftColor: palette.accent[500] }]}>
                  <Store size={13} color={palette.accent[600]} />
                  <AppText size='small' weight='bold' color='text'>Abattage & Vente</AppText>
                </View>
                <View style={styles.statsGroupRow}>
                  <View style={styles.statsItem}>
                    <AppText size='small' color='muted'>Abattages</AppText>
                    <AppText size='bodyM' weight='bold' color='accent'>{slaughterProcessed.length}</AppText>
                    <AppText size='small' color='faint'>
                      {totalBirdsSlaughtered > 0 ? `${fmt(totalBirdsSlaughtered)} oiseaux` : 'Aucun'}
                    </AppText>
                  </View>
                  <View style={styles.statsVerticalDivider} />
                  <View style={styles.statsItem}>
                    <AppText size='small' color='muted'>Poids total</AppText>
                    <AppText size='bodyM' weight='bold' color='accent'>
                      {totalWeightKg > 0 ? `${Math.round(totalWeightKg)} kg` : '—'}
                    </AppText>
                    <AppText size='small' color='faint'>
                      {avgRendement != null ? `Rdt ${avgRendement.toFixed(0)}%` : 'Sans rendement'}
                    </AppText>
                  </View>
                </View>
              </View>
            </Card>
          )}
<EggStockCard
            selectedDate={liveNow}
            availableEggs={d.eggStock.availableEggs}
            availableAlveoles={d.eggStock.availableAlveoles}
            soldAlveoles={(d.eggStock.soldAlveoles ?? 0)}
            isFetching={dashboard.isFetching}
            layRatePercent={avgLayRate}
            pondeuseLayRate={pondeuseLayRate}
            dailyData={eggDailyData}
            breakdown={eggBreakdown}
          />
          <SectionHeader title='Classement' subtitle='Meilleurs lots & suivi' />
          <View style={styles.metricGrid}>
            {topPerf && (
              <MetricTile
                label='🏆 Meilleur lot'
                value={topPerf.batchName ?? '—'}
                sub={`${topPerf.species && topPerf.species !== 'POULET' ? `${topPerf.species === 'AUTRE' && topPerf.customSpecies ? topPerf.customSpecies : speciesLabel(topPerf.species)} · ` : ''}${topPerf.type === 'CHAIR' && topPerf.ipe != null ? `IPE ${fmt(Math.round(topPerf.ipe))}` : topPerf.layRatePercent != null ? `Ponte ${topPerf.layRatePercent.toFixed(0)}%` : `IC ${topPerf.fcr?.toFixed(2) ?? '—'}`}`}
                tone='green'
                icon={Medal}
                onPress={() => router.push(`/lot/${topPerf.batchId}`)}
              />
            )}
            {bestBreedEntry?.breedStatus && (
              <MetricTile
                label='Breed Intel'
                value={[bestBreedEntry.breedStatus!.breedCode, bestBreedEntry.breedStatus!.breedName].filter(Boolean).join(' · ')}
                sub={bestBreedEntry.breedStatus!.fcrDeviationPct != null ? `IC ${bestBreedEntry.breedStatus!.fcrDeviationPct > 0 ? '+' : ''}${bestBreedEntry.breedStatus!.fcrDeviationPct.toFixed(1)}% vs cible` : bestBreedEntry.breedStatus!.layRateDeviationPct != null ? `Ponte ${bestBreedEntry.breedStatus!.layRateDeviationPct > 0 ? '+' : ''}${bestBreedEntry.breedStatus!.layRateDeviationPct.toFixed(1)}% vs cible` : 'Semaine ' + bestBreedEntry.breedStatus!.week}
                tone={bestBreedEntry.breedStatus!.fcrDeviationPct != null ? (bestBreedEntry.breedStatus!.fcrDeviationPct > 10 ? 'red' : bestBreedEntry.breedStatus!.fcrDeviationPct < -5 ? 'green' : 'amber') : bestBreedEntry.breedStatus!.layRateDeviationPct != null ? (bestBreedEntry.breedStatus!.layRateDeviationPct < -10 ? 'amber' : 'green') : 'default'}
                icon={BarChart3}
                onPress={() => router.push(`/lot/${bestBreedEntry.batchId}`)}
              />
            )}
          </View>
        </>
      )}
      <MetricInfoSheet metric={metricInfo} onClose={() => setMetricInfo(null)} />
      <CheptelModal visible={cheptelOpen} batches={activeBatches} onClose={() => setCheptelOpen(false)} />
    </Screen>
  );
}

function HealthRing({ score, grade }: { score: number; grade: HealthGrade }) {
  const size = 48;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const strokeDashoffset = circumference * (1 - pct / 100);
  const ringColor = gradeColor[grade];
  return (
    <View style={styles.ring}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={color.border} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ringColor}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.ringCenter}>
        <AppText size="small" weight="bold" style={{ color: ringColor, fontSize: 13, lineHeight: 16 }}>
          {pct}%
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  avatarLogo: {
    width: 40,
    height: 40,
  },
  greetCol: {
    flex: 1,
    flexShrink: 1,
  },
  alertBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.amber[50],
    borderWidth: 1,
    borderColor: palette.amber[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: palette.red[500],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  farmChipRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 1,
  },
  chipText: {
    flexShrink: 1,
  },
  encaissePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.accent[50],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.accent[200],
    paddingHorizontal: 12,
    paddingVertical: 5,
  },

  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  metricGridNoWrap: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 8,
    marginTop: 2,
  },
  actionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  healthCard: {
    marginTop: 4,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radii.xl,
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 6,
  },
  healthTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  healthTopInfo: {
    flex: 1,
    gap: 2,
  },
  healthTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  healthAlertRow: {
    flexDirection: 'row',
    gap: 6,
  },
  healthAlertBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  healthAlertDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  healthMortalityBar: {
    gap: 2,
  },
  healthMortalityTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: palette.ink[100],
    overflow: 'hidden',
  },
  healthMortalityFill: {
    height: 3,
    borderRadius: 2,
  },
  healthWeatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.brand[50],
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  weatherMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  weatherHumidity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: palette.brand[100],
    borderRadius: radii.pill,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  healthSanitaireBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: palette.green[600],
  },
  ring: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },

  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: palette.brand[50],
    borderWidth: 1,
    borderColor: palette.brand[200],
  },
  expandBtnActive: {
    backgroundColor: palette.brand[600],
    borderColor: palette.brand[600],
  },
  recoBox: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: radii.md,
    padding: 10,
  },
  statsExpandedCard: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 0,
  },
  statsGroup: {
    gap: 8,
  },
  statsGroupLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderLeftWidth: 3,
    paddingLeft: 8,
    marginLeft: 2,
  },
  statsGroupRow: {
    flexDirection: 'row',
    gap: 0,
  },
  statsItem: {
    flex: 1,
    gap: 2,
    alignItems: 'center',
    paddingVertical: 4,
  },
  statsValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statsChip: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    borderWidth: 1,
  },
  statsVerticalDivider: {
    width: 1,
    backgroundColor: palette.ink[100],
    marginVertical: 2,
  },
  statsGroupDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.ink[100],
    marginVertical: 4,
  },
});
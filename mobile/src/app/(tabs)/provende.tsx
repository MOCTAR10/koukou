import React, { useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import {
  AlertTriangle,
  ArrowDownRight,
  Box,
  Package,
  PackageOpen,
  PackageX,
  Pill,
  Plus,
  Scale,
  TrendingUp,
  Truck,
  Wheat,
  type LucideIcon,
} from 'lucide-react-native';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, levelTone } from '@/components/ui/Chip';
import { MetricTile } from '@/components/ui/MetricTile';
import { NumberInput } from '@/components/ui/NumberInput';
import { PeriodBar, periodWindow, type PeriodWindow } from '@/components/ui/PeriodBar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/auth/AuthContext';
import { useQuickCapture } from '@/components/capture/QuickCaptureProvider';
import { useLiveMinute } from '@/hooks/useLiveMinute';
import { fetchFeedMovements, fetchFeedStock } from '@/api';
import { invalidateFarmQueries } from '@/api/invalidate';
import { FEED_ENTRY_TYPE_LABELS, FEED_PHASE_LABELS } from '@/api/format';
import { recordStockLossQueued } from '@/offline';
import type {
  FeedEntryType,
  FeedLossReason,
  FeedMovement,
  FeedMovementType,
  FeedPhase,
  FeedStockSummary,
  FeedTypeStock,
} from '@/api/types';
import { color, palette, radii, spacing } from '@/constants/theme';

const MOVEMENT_TYPE_LABEL: Record<FeedMovementType, string> = {
  CONSOMMATION: 'Consommation',
  PERTE: 'Perte',
  VENTE: 'Vente',
};

const LOSS_REASON_LABEL: Record<FeedLossReason, string> = {
  HUMIDITE: 'Humidité',
  RONGEURS: 'Rongeurs',
  AUTRE: 'Autre',
};

function Row({ label, value, strong, warn }: { label: string; value: string; strong?: boolean; warn?: boolean }) {
  return (
    <View style={styles.row}>
      <AppText size="small" color="muted">{label}</AppText>
      <AppText size="small" weight={strong ? 'semibold' : 'medium'} color={warn ? 'warn' : 'text'}>{value}</AppText>
    </View>
  );
}

const ENTRY_TYPE_ORDER: FeedEntryType[] = ['BULKER', 'BAG', 'MEDICAMENT', 'MATIERE_PREMIERE'];

const ENTRY_TYPE_META: Record<FeedEntryType, { icon: LucideIcon; label: string }> = {
  BULKER: { icon: Truck, label: 'Bulker' },
  BAG: { icon: PackageOpen, label: 'Sacs' },
  MEDICAMENT: { icon: Pill, label: 'Médic.' },
  MATIERE_PREMIERE: { icon: Box, label: 'Matière 1ʳᵉ' },
};

function TypeStatCard({ entryType, kg, count }: { entryType: FeedEntryType; kg: number; count: number }) {
  const meta = ENTRY_TYPE_META[entryType];
  const Icon = meta.icon;
  const isKg = entryType !== 'MEDICAMENT';
  const hasData = count > 0 && (isKg ? kg > 0 : true);
  const headline = !hasData ? '—' : isKg ? `${Math.round(kg).toLocaleString('fr-FR')} kg` : `${count}`;
  return (
    <View style={styles.typeStatCard}>
      <View style={styles.typeStatIcon}>
        <Icon size={18} color={hasData ? palette.accent[500] : color.ink[400]} strokeWidth={2.2} />
      </View>
      <AppText size="small" weight={hasData ? 'semibold' : 'medium'} color={hasData ? 'brand' : 'muted'} align="center" numberOfLines={1}>
        {meta.label}
      </AppText>
      <AppText size="bodyM" weight="bold" color={hasData ? 'text' : 'faint'} align="center" numberOfLines={1}>
        {headline}
      </AppText>
    </View>
  );
}

function TypeCard({ t, pricePerKg }: { t: FeedTypeStock; pricePerKg: number | null }) {
  const valorisation =
    pricePerKg !== null ? `${Math.round(t.availableKg * pricePerKg).toLocaleString('fr-FR')} FCFA` : '—';
  return (
    <Card tone={t.status === 'ROUGE' ? 'alert' : t.status === 'JAUNE' ? 'warn' : 'green'} style={styles.card}>
      <View style={styles.cardHead}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText size="body" weight="bold" color="text">
            {t.feedPhase ? FEED_PHASE_LABELS[t.feedPhase] : 'Aliment'}
          </AppText>
          <AppText size="caption" color="muted">
            Reçu {t.receivedKg} kg · consommé {t.usedKg} kg
          </AppText>
        </View>
        <Chip label={t.status} tone={levelTone(t.status)} />
      </View>

      <View style={styles.summaryStrip}>
        <View style={styles.summaryItem}>
          <AppText size="caption" color="muted">Disponible</AppText>
          <AppText size="body" weight="bold" color="text">{Math.round(t.availableKg)} kg</AppText>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <AppText size="caption" color="muted">Autonomie</AppText>
          <AppText size="body" weight="bold" color={t.autonomyDays !== null && t.autonomyDays < 5 ? 'warn' : 'text'}>
            {t.autonomyDays ?? '—'} j
          </AppText>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <AppText size="caption" color="muted">Valeur estimée</AppText>
          <AppText size="body" weight="bold" color="text">{valorisation}</AppText>
        </View>
      </View>

      <Row label="Vendu / perdu" value={`${t.soldKg} / ${t.lostKg} kg`} />

      {t.suggestedLotId && t.suggestedLotName ? (
        <View style={styles.suggestion}>
          <Wheat size={13} color={color.brand[600]} />
          <AppText size="caption" color="brand">
            À prélever en priorité (FEFO) : {t.suggestedLotName}
          </AppText>
        </View>
      ) : null}
    </Card>
  );
}

/** Insight consommation provende : rythme / jour, tendance, couverture et ordre suggéré. */
function ConsumptionInsight({ byType, mvts, refDate }: { byType: FeedTypeStock[]; mvts: FeedMovement[]; refDate?: string }) {
  const today = useMemo(() => {
    if (refDate) {
      const t = new Date(`${refDate}T12:00:00Z`);
      return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
    }
    const t = new Date();
    return new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()));
  }, [refDate]);
  const dayStr = (d: Date) => d.toISOString().slice(0, 10);
  const d7 = dayStr(new Date(today.getTime() - 7 * 86_400_000));
  const d14 = dayStr(new Date(today.getTime() - 14 * 86_400_000));

  const { avg7, days7, avg14, days14 } = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const m of mvts) {
      if (m.type !== 'CONSOMMATION' || m.quantityKg <= 0) continue;
      const d = m.date.slice(0, 10);
      byDay.set(d, (byDay.get(d) ?? 0) + m.quantityKg);
    }
    const windowAvg = (from: string) => {
      let sum = 0;
      let days = 0;
      for (const [d, kg] of byDay) {
        if (d >= from) {
          sum += kg;
          days += 1;
        }
      }
      return { avg: days > 0 ? sum / days : 0, days };
    };
    const a = windowAvg(d7);
    const b = windowAvg(d14);
    return { avg7: a.avg, days7: a.days, avg14: b.avg, days14: b.days };
  }, [mvts, d7, d14]);

  const hasCons = days7 > 0;
  const totalKg = byType.reduce((s, t) => s + t.availableKg, 0);
  const coverageDays = hasCons && avg7 > 0 ? totalKg / avg7 : null;
  const trendPct = hasCons && days14 > 0 && avg14 > 0 ? ((avg7 - avg14) / avg14) * 100 : null;

  const pricePerKg = useMemo(() => {
    const priced = mvts.filter((m) => m.valueFcfa != null && m.quantityKg > 0);
    if (priced.length === 0) return null;
    const kg = priced.reduce((s, m) => s + m.quantityKg, 0);
    const fcfa = priced.reduce((s, m) => s + (m.valueFcfa ?? 0), 0);
    return kg > 0 ? fcfa / kg : null;
  }, [mvts]);
  const costPerDay = hasCons && pricePerKg != null ? avg7 * pricePerKg : null;

  const critical = useMemo(() => {
    const withAuto = byType.filter((t) => t.autonomyDays != null);
    if (withAuto.length === 0) return null;
    return withAuto.reduce((a, b) => ((a.autonomyDays ?? 0) < (b.autonomyDays ?? 0) ? a : b));
  }, [byType]);
  const critDays = critical?.autonomyDays ?? null;
  const critRate = critical && critDays != null && critDays > 0 ? critical.availableKg / critDays : avg7;
  const need7Kg = critDays != null && critDays < 8 && critRate > 0 ? Math.ceil(critRate * 7) : null;

  const coverTone = coverageDays == null ? 'muted' : coverageDays < 5 ? 'danger' : coverageDays < 8 ? 'warn' : 'text';
  const cardTone = coverageDays != null ? (coverageDays < 5 ? 'warn' : 'green') : 'default';

  return (
    <Card tone={cardTone} style={styles.insightCard}>
      <View style={styles.insightHead}>
        <View style={styles.insightIcon}>
          <TrendingUp size={16} color={palette.brand[600]} strokeWidth={2.3} />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <AppText size="body" weight="bold" color="text">Consommation & couverture</AppText>
          <AppText size="caption" color="muted">Rythme des {Math.max(days7, 1)} derniers jours de relevés</AppText>
        </View>
        {trendPct != null ? (
          <Chip
            label={`${trendPct >= 0 ? '▲ +' : '▼ '}${trendPct.toFixed(0)} %`}
            tone={Math.abs(trendPct) > 10 ? 'amber' : 'neutral'}
          />
        ) : null}
      </View>

      <View style={styles.summaryStrip}>
        <View style={styles.summaryItem}>
          <AppText size="caption" color="muted">Consommation / jour</AppText>
          <AppText size="body" weight="bold" color={hasCons ? 'text' : 'faint'}>
            {hasCons ? `${Math.round(avg7)} kg` : '—'}
          </AppText>
          <AppText size="caption" color="muted">{hasCons ? 'moyenne relevée' : 'saisies du jour'}</AppText>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <AppText size="caption" color="muted">Couverture du stock</AppText>
          <AppText size="body" weight="bold" color={coverTone}>
            {coverageDays != null ? `${Math.round(coverageDays)} j` : '—'}
          </AppText>
          <AppText size="caption" color="muted">à ce rythme</AppText>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <AppText size="caption" color="muted">Coût estimé / jour</AppText>
          <AppText size="body" weight="bold" color={costPerDay != null ? 'text' : 'faint'}>
            {costPerDay != null ? `${Math.round(costPerDay).toLocaleString('fr-FR')} FCFA` : '—'}
          </AppText>
          <AppText size="caption" color="muted">{pricePerKg != null ? `≈ ${Math.round(pricePerKg)} FCFA/kg` : 'prix inconnu'}</AppText>
        </View>
      </View>

      {need7Kg != null && critical && critDays != null ? (
        <View style={[styles.insightTip, { backgroundColor: color.amber[50], borderColor: palette.amber[200] }]}>
          <AlertTriangle size={14} color={palette.amber[700]} />
          <AppText size="small" style={{ color: palette.amber[700], flex: 1, lineHeight: 17 }}>
            <AppText size="small" weight="bold">{FEED_PHASE_LABELS[critical.feedPhase]} : {Math.round(critDays)} j restants.</AppText>
            {' '}Prévoyez ≈ {need7Kg.toLocaleString('fr-FR')} kg (soit ~{Math.ceil(need7Kg / 50)} sacs de 50 kg) pour couvrir 7 jours.
          </AppText>
        </View>
      ) : critical ? (
        <AppText size="small" style={{ color: critDays != null && critDays < 8 ? palette.amber[700] : palette.green[700], lineHeight: 17 }}>
          {critDays != null && critDays < 8 ? 'Stock suffisant mais à surveiller —' : 'Stock suffisant —'} minimum {Math.round(critDays ?? 0)} j d’autonomie ({critical.feedPhase ? FEED_PHASE_LABELS[critical.feedPhase] : 'aliment'}).
        </AppText>
      ) : (
        <AppText size="small" color="muted" style={{ lineHeight: 17 }}>
          Aucun stock suivi : ajoutez des entrées de provende pour calculer l’autonomie et la recommandation.
        </AppText>
      )}
    </Card>
  );
}

export default function ProvendeScreen() {
  const { farmId } = useAuth();
  const queryClient = useQueryClient();
  const { openFeed } = useQuickCapture();

  const [view, setView] = useState<'stock' | 'mouvements'>('stock');
  const [subView, setSubView] = useState<'lots' | 'journal'>('lots');
  const [window, setWindow] = useState<PeriodWindow>(() => periodWindow('all'));
  const firstWindowRef = useRef(true);

  const handlePeriodChange = (w: PeriodWindow) => {
    setWindow(w);
    if (firstWindowRef.current) {
      firstWindowRef.current = false;
      return;
    }
  };

  const stock = useQuery({
    queryKey: ['feed-stock', farmId],
    queryFn: () => fetchFeedStock(farmId),
  });
  const movements = useQuery({
    queryKey: ['feed-stock', 'movements', farmId],
    queryFn: () => fetchFeedMovements(farmId),
  });

  useLiveMinute(() => {
    if (window.isFiltered) return;
    void stock.refetch();
    void movements.refetch();
  });

  const s: FeedStockSummary | undefined = stock.data;
  const byType = useMemo(() => s?.byType ?? [], [s]);
  const lots = useMemo(() => s?.lots ?? [], [s]);
  const mvts = movements.data ?? [];

  const pricePerKgOf = (t: FeedPhase): number | null => {
    const ms = mvts.filter((m) => m.feedPhase === t && m.valueFcfa != null && m.quantityKg > 0);
    if (ms.length === 0) return null;
    const totalKg = ms.reduce((sum, m) => sum + m.quantityKg, 0);
    const totalFcfa = ms.reduce((sum, m) => sum + (m.valueFcfa ?? 0), 0);
    return totalFcfa / totalKg;
  };

  const summary = useMemo(() => {
    const totalKg = byType.reduce((s2, t) => s2 + t.availableKg, 0);
    const priced = byType
      .map((t) => ({ t, p: pricePerKgOf(t.feedPhase) }))
      .filter((x) => x.p !== null);
    const totalFcfa = priced.reduce((s2, x) => s2 + x.t.availableKg * (x.p ?? 0), 0);
    const low = byType.filter((t) => t.autonomyDays !== null && t.autonomyDays < 5).length;
    return { totalKg, totalFcfa, active: byType.length, low };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byType, mvts]);

  const typeStats = useMemo(() => {
    const defaultRows: Record<FeedEntryType, { kg: number; count: number }> = {
      BULKER: { kg: 0, count: 0 },
      BAG: { kg: 0, count: 0 },
      MEDICAMENT: { kg: 0, count: 0 },
      MATIERE_PREMIERE: { kg: 0, count: 0 },
    };
    for (const l of lots) {
      const row = defaultRows[l.entryType] ?? defaultRows.BULKER;
      row.count += 1;
      row.kg += l.availableKg;
    }
    return defaultRows;
  }, [lots]);

  const [lossOpen, setLossOpen] = useState(false);
  const [lossLotId, setLossLotId] = useState('');
  const [lossQty, setLossQty] = useState(0);
  const [lossUnit, setLossUnit] = useState<'KG' | 'SAC'>('KG');
  const [lossReason, setLossReason] = useState<FeedLossReason>('HUMIDITE');
  const [lossNotes, setLossNotes] = useState('');
  const [lossSaving, setLossSaving] = useState(false);
  const [lossError, setLossError] = useState<string | null>(null);

  const lockableLots = lots.filter((l) => l.availableKg > 0);
  const effectiveLot = lockableLots.find((l) => l.id === lossLotId) ?? lockableLots[0];
  const lossCap = lossUnit === 'SAC' ? (effectiveLot ? Math.floor(effectiveLot.availableKg / 50) || 1 : 100) : effectiveLot ? Math.max(1, Math.floor(effectiveLot.availableKg)) : 2000;

  const submitLoss = async () => {
    setLossError(null);
    if (!effectiveLot) {
      setLossError('Aucun lot disponible en stock pour déclarer une perte.');
      return;
    }
    if (lossQty <= 0) {
      setLossError('Indiquez une quantité à retirer.');
      return;
    }
    setLossSaving(true);
    try {
      const result = await recordStockLossQueued(farmId, {
        inputLotId: effectiveLot.id,
        quantity: lossQty,
        unit: lossUnit,
        reason: lossReason,
        notes: lossNotes.trim() || undefined,
      });
      if (result.status === 'sent') {
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: ['feed-stock'] }),
          invalidateFarmQueries(queryClient, { farmId }),
        ]);
      }
      setLossOpen(false);
      setLossQty(0);
      setLossNotes('');
    } catch (e) {
      setLossError(e instanceof Error ? e.message : 'Erreur lors de la déclaration de perte.');
    } finally {
      setLossSaving(false);
    }
  };

  const fmtDate = (d?: string | null) => (d ? d.slice(5).replace('-', '/') : '—');

  // ── Filtre par fenêtre (barre de date en haut) ──
  const inPeriod = (d?: string | null): boolean => {
    if (!d) return window.span === 'all' && !window.isFiltered;
    const day = d.slice(0, 10);
    if (window.span === 'all') return !window.isFiltered || day === window.to;
    if (!window.from) return true;
    return day >= window.from && day <= (window.to ?? '');
  };
  const visibleMvts = mvts.filter((m) => inPeriod(m.date));
  const mvtsFiltered = window.span !== 'all' || window.isFiltered;

  return (
    <Screen
      bottomPad={120}
      refreshing={stock.isFetching}
      onRefresh={() => void stock.refetch()}
      header={
        <>
          {/* ── HEADER + DATE BAR (fixes, comme Accueil) ── */}
          <View style={styles.customHeader}>
            <Image source={require('@/assets/images/logo-nav.png')} style={styles.headerLogo} />
            <View style={{ flex: 1 }}>
              <AppText size="h2" weight="bold" color="text" numberOfLines={1}>
                Provende
              </AppText>
              <AppText size="small" color="muted" numberOfLines={1}>
                Stock & inventaire · pertes & mouvements
              </AppText>
            </View>
          </View>
          <PeriodBar defaultSpan="all" onChange={handlePeriodChange} />
        </>
      }
    >
      <View style={styles.tabBar}>
        <Segmented
          options={[
            { key: 'stock', label: 'Stock', icon: <Wheat size={17} color={view === 'stock' ? color.brand[600] : color.ink[400]} /> },
            { key: 'mouvements', label: 'Mouvements', icon: <ArrowDownRight size={17} color={view === 'mouvements' ? color.brand[600] : color.ink[400]} /> },
          ]}
          value={view}
          onChange={setView}
          haptic
        />
      </View>

{stock.isLoading ? (
        <Spinner label="Chargement du stock…" />
      ) : stock.isError ? (
        <AppText size="small" color="danger">
          Lecture de l’inventaire impossible. Vérifiez la connexion au serveur.
        </AppText>
      ) : view === 'stock' ? (
        <>
          {/* Statistiques par type d'entrée (en tête) */}
          <View style={styles.typeStatGrid}>
            {ENTRY_TYPE_ORDER.map((et) => {
              const st = typeStats[et];
              return <TypeStatCard key={et} entryType={et} kg={st.kg} count={st.count} />;
            })}
          </View>

          {/* Synthèse globale */}
          {byType.length > 0 ? (
            <Card tone="brand" style={styles.hero}>
              <Metric label="Disponible" value={Math.round(summary.totalKg).toLocaleString('fr-FR')} unit="kg" tint={color.brand[600]} />
              <View style={styles.summaryDivider} />
              <Metric label="Valeur estimée" value={summary.totalFcfa > 0 ? `${Math.round(summary.totalFcfa).toLocaleString('fr-FR')}` : '—'} unit={summary.totalFcfa > 0 ? 'FCFA' : undefined} tint={color.brand[600]} />
              <View style={styles.summaryDivider} />
              <Metric label="Phases" value={String(summary.active)} unit="actives" tint={color.brand[600]} />
            </Card>
          ) : null}

          <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            openFeed();
          }}
          style={styles.cta}>
            <View style={styles.ctaBadge}>
              <Plus size={18} color={palette.surface} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText size="body" weight="semibold" color="text" numberOfLines={1}>
                Nouvelle entrée de provende
              </AppText>
            </View>
            <ArrowDownRight size={16} color={color.ink[400]} style={styles.ctaArrow} />
          </Pressable>

          <Card tone="warn" style={[styles.card, styles.lossCard]} onPress={() => setLossOpen(true)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <PackageX size={15} color={color.red[600]} />
              <View style={{ flex: 1, gap: 1 }}>
                <AppText size="label" weight="semibold" color="text">
                  Déclarer une perte
                </AppText>
                <AppText size="small" color="muted" numberOfLines={2}>
                  {summary.low > 0
                    ? `${summary.low} phase${summary.low > 1 ? 's' : ''} sous 5 j d’autonomie. Sacs gâtés à sortir de l’inventaire.`
                    : 'Sacs gâtés (humidité, rongeurs…) à sortir de l’inventaire — traçabilité conservée.'}
                </AppText>
              </View>
            </View>
          </Card>

          <View style={styles.metricGrid}>
            <MetricTile
              label="Stock total"
              value={`${summary.totalKg} kg`}
              sub={`${summary.active} type${summary.active > 1 ? 's' : ''}`}
              tone="brand"
              icon={Wheat}
            />
            <MetricTile
              label="Autonomie"
              value={(() => {
                const min = byType.filter((t) => t.autonomyDays != null).reduce((m, t) => Math.min(m, t.autonomyDays!), Infinity);
                return min === Infinity ? '—' : `${min} j`;
              })()}
              sub={(() => {
                const min = byType.filter((t) => t.autonomyDays != null).reduce((m, t) => Math.min(m, t.autonomyDays!), Infinity);
                if (min === Infinity) return 'Suffisant';
                return min < 3 ? '⚠ Critique' : min < 5 ? 'Stock bas' : 'Suffisant';
              })()}
              tone={(() => {
                const min = byType.filter((t) => t.autonomyDays != null).reduce((m, t) => Math.min(m, t.autonomyDays!), Infinity);
                if (min === Infinity) return 'green';
                return min < 3 ? 'red' : min < 5 ? 'amber' : 'green';
              })()}
              icon={Package}
            />
          </View>

          {byType.length > 0 ? <ConsumptionInsight byType={byType} mvts={visibleMvts} refDate={window.isFiltered ? window.to : undefined} /> : null}

          <SectionHeader title="Inventaire par type" subtitle="Autonomie en jours · valeur estimée au prix moyen" />
          <View style={{ gap: 10 }}>
            {byType.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Scale size={22} color={color.ink[300]} />
                <AppText size="caption" color="muted" align="center">
                  Aucun stock de provende enregistré.
                </AppText>
              </View>
            ) : (
              byType.map((t) => <TypeCard key={t.feedPhase} t={t} pricePerKg={pricePerKgOf(t.feedPhase)} />)
            )}
          </View>
        </>
      ) : (
        <>
          <View style={styles.subTabBar}>
            <Segmented
              options={[
                { key: 'lots', label: 'Lots de provende', icon: <Package size={17} color={subView === 'lots' ? color.brand[600] : color.ink[400]} /> },
                { key: 'journal', label: 'Journal des mouvements', icon: <ArrowDownRight size={17} color={subView === 'journal' ? color.brand[600] : color.ink[400]} /> },
              ]}
              value={subView}
              onChange={setSubView}
              haptic
            />
          </View>

          {subView === 'lots' ? (
            <>
              <SectionHeader title="Lots de provende" subtitle="Traçabilité HACCP : fournisseur, n° lot, péremption" />
              <View style={{ gap: 10 }}>
                {lots.length === 0 ? (
                  <View style={styles.emptyWrap}>
                    <Package size={22} color={color.ink[300]} />
                    <AppText size="caption" color="muted" align="center">
                      Aucun lot d’aliment saisi.
                    </AppText>
                  </View>
                ) : (
                  lots.map((l) => (
                    <Card key={l.id} tone="default" style={styles.card}>
                      <View style={styles.cardHead}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <AppText size="body" weight="bold" color="text" numberOfLines={1}>
                            {l.productName ?? (l.feedPhase ? FEED_PHASE_LABELS[l.feedPhase as FeedPhase] : 'Provende')}
                          </AppText>
                          <AppText size="caption" color="muted" numberOfLines={1}>
                            {l.supplier ?? 'Fournisseur inconnu'} · n° {l.supplierLotNumber ?? '—'}
                            {l.batchId ? ' · lot ferme lié' : ''}
                          </AppText>
                        </View>
                        {l.expired ? <Chip label="Périmé" tone="red" /> : <Chip label={FEED_ENTRY_TYPE_LABELS[l.entryType] ?? l.entryType} tone={l.entryType === 'MEDICAMENT' ? 'accent' : 'brand'} />}
                      </View>
                      <View style={{ gap: 2 }}>
                        <Row label="Quantité reçue" value={`${l.quantity} ${l.unit?.toLowerCase() ?? ''}`} />
                        <Row label="Restant" value={`${Math.round(l.availableKg)} kg`} strong />
                        <Row
                          label="Reçu le / péremption"
                          value={`${fmtDate(l.receivedDate)} · ${fmtDate(l.expirationDate)}`}
                          warn={l.expired}
                        />
                      </View>
                    </Card>
                  ))
                )}
              </View>
            </>
          ) : (
            <>
              <SectionHeader title="Journal des mouvements" subtitle="Consommations liées, pertes et ventes (valeur tracée)" />
              <View style={{ gap: 10 }}>
                {visibleMvts.length === 0 ? (
                  <View style={styles.emptyWrap}>
                    <ArrowDownRight size={22} color={color.ink[300]} />
                    <AppText size="caption" color="muted" align="center">
                      {mvtsFiltered ? 'Aucun mouvement sur la période sélectionnée.' : 'Aucun mouvement enregistré.'}
                    </AppText>
                  </View>
                ) : (
                  visibleMvts.map((m: FeedMovement) => (
                    <Card key={m.id} tone={m.type === 'PERTE' ? 'warn' : 'default'} style={styles.card}>
                      <View style={styles.cardHead}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <AppText
                            size="body"
                            weight={m.type === 'PERTE' ? 'semibold' : 'medium'}
                            color={m.type === 'PERTE' ? 'danger' : 'text'}>
                            {m.type === 'PERTE' ? '−' : ''}
                            {Math.round(m.quantityKg)} kg · {m.productName ?? '—'}
                          </AppText>
                          <AppText size="caption" color="muted">
                            {m.feedPhase ? FEED_PHASE_LABELS[m.feedPhase] : '—'} · {fmtDate(m.date)}
                            {m.reason && m.reason in LOSS_REASON_LABEL ? ` · ${LOSS_REASON_LABEL[m.reason as FeedLossReason]}` : ''}
                          </AppText>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          <Chip
                            label={MOVEMENT_TYPE_LABEL[m.type]}
                            tone={m.type === 'PERTE' ? 'red' : m.type === 'VENTE' ? 'amber' : 'neutral'}
                          />
                          {m.valueFcfa != null ? (
                            <AppText size="caption" weight="semibold" color="text">
                              {m.valueFcfa.toLocaleString('fr-FR')} FCFA
                            </AppText>
                          ) : null}
                        </View>
                      </View>
                    </Card>
                  ))
                )}
              </View>
            </>
          )}
        </>
      )}

      <Sheet
        visible={lossOpen}
        onClose={() => setLossOpen(false)}
        title="Déclarer une perte"
        subtitle="Sacs gâtés sortis de l’inventaire"
        icon={<PackageX size={22} color={color.red[600]} />}>
        <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
          <View style={{ gap: spacing.lg }}>
            <View style={{ gap: 6 }}>
              <AppText size="label" color="muted">
                LOT CONCERNÉ
              </AppText>
              <View style={styles.lotsRow}>
                {lockableLots.map((l) => (
                  <Pressable
                    key={l.id}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setLossLotId(l.id);
                    }}
                    accessibilityRole="button">
                    <Chip
                      label={`${l.productName ?? (l.feedPhase ? FEED_PHASE_LABELS[l.feedPhase as FeedPhase] : 'Provende')} · ${Math.round(l.availableKg)} kg`}
                      tone={effectiveLot?.id === l.id ? 'accent' : 'brand'}
                      selected={effectiveLot?.id === l.id}
                      style={styles.lotChip}
                    />
                  </Pressable>
                ))}
                {lockableLots.length === 0 ? (
                  <AppText size="caption" color="muted">
                    Aucun lot avec du stock restant.
                  </AppText>
                ) : null}
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <AppText size="label" color="muted">
                QUANTITÉ RETIRÉE
              </AppText>
              <Segmented
                options={[
                  { key: 'KG', label: 'kg' },
                  { key: 'SAC', label: 'sacs' },
                ]}
                value={lossUnit}
                onChange={setLossUnit}
                haptic
              />
              <NumberInput
                value={lossQty > 0 ? String(lossQty) : ''}
                onChangeText={(t) => {
                  setLossQty(Math.min(parseInt(t, 10) || 0, lossCap));
                  setLossError(null);
                }}
                suffix={lossUnit === 'SAC' ? 'sacs' : 'kg'}
                placeholder="0"
              />
            </View>

            <View style={{ gap: 6 }}>
              <AppText size="label" color="muted">
                CAUSE
              </AppText>
              <Segmented
                options={(Object.keys(LOSS_REASON_LABEL) as FeedLossReason[]).map((r) => ({
                  key: r,
                  label: LOSS_REASON_LABEL[r],
                }))}
                value={lossReason}
                onChange={setLossReason}
                haptic
              />
            </View>

            <Card>
              <TextInput
                value={lossNotes}
                onChangeText={setLossNotes}
                placeholder="Note (ex. 2 sacs mouillés en fond de magasin)"
                placeholderTextColor={color.ink[300]}
                style={styles.input}
                editable={!lossSaving}
              />
            </Card>

            {lossError ? (
              <AppText size="small" color="danger">
                {lossError}
              </AppText>
            ) : null}

            <View style={styles.actions}>
              <Button label="Annuler" tone="ghost" size="md" block={false} onPress={() => setLossOpen(false)} disabled={lossSaving} />
              <View style={{ flex: 1 }}>
                <Button
                  label="Valider la perte"
                  tone="accent"
                  icon={ArrowDownRight}
                  loading={lossSaving}
                  onPress={() => void submitLoss()}
                />
              </View>
            </View>
          </View>
        </ScrollView>
      </Sheet>
    </Screen>
  );
}

function Metric({ label, value, unit, tint }: { label: string; value: string; unit?: string; tint: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <AppText size="caption" color="muted">
        {label}
      </AppText>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
        <AppText size="h3" weight="bold" color="text">
          {value}
        </AppText>
        {unit ? (
          <AppText size="caption" color={tint}>
            {unit}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  headerLogo: {
    width: 38,
    height: 38,
  },
  tabBar: {
    marginBottom: 12,
  },
  subTabBar: {
    marginBottom: 16,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
    paddingVertical: 16,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  typeStatGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  typeStatCard: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: color.surfaceAlt,
  },
  typeStatIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 2,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: color.accent[300],
    backgroundColor: color.accent[50],
    marginBottom: 12,
  },
  ctaBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.accent[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaArrow: {
    marginLeft: 'auto',
  },
  card: {
    gap: 8,
    padding: 14,
  },
  lossCard: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  insightCard: {
    gap: 10,
    padding: 14,
    marginBottom: 12,
  },
  insightHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  insightIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightTip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  summaryStrip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    backgroundColor: color.surfaceAlt,
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  summaryItem: {
    flex: 1,
    gap: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: palette.border,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  emptyWrap: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
  },
  lotsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  lotChip: {},
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    fontSize: 15,
    color: color.ink[800],
    backgroundColor: color.surface,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
});

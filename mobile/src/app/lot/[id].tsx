import React, { useMemo, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import {
  Activity,
  AlertTriangle,
  Check,
  Clock,
  DollarSign,
  Droplets,
  Egg,
  FileText,
  HeartPulse,
  Info,
  Layers,
  PenLine,
  Pill,
  Scale,
  ShoppingCart,
  Stethoscope,
  Syringe,
  Target,
  TrendingUp,
  Warehouse,
  Weight,
  Wheat,
} from 'lucide-react-native';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { MetricTile } from '@/components/ui/MetricTile';
import { Segmented } from '@/components/ui/Segmented';
import { Spinner } from '@/components/ui/Spinner';
import { LineChart } from '@/components/ui/LineChart';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Button } from '@/components/ui/Button';
import { AlertCard } from '@/components/AlertCard';
import { PeriodBar, periodWindow, toDateStr, type PeriodWindow } from '@/components/ui/PeriodBar';
import { useQuickCapture } from '@/components/capture/QuickCaptureProvider';
import { useAuth } from '@/auth/AuthContext';
import { color, palette, radii, fmt, fmtFcfa } from '@/constants/theme';
import { normalizeMortalityStatus } from '@/constants/health';
import { breedImageForLot } from '@/constants/breedImages';
import { lotSlaughterSummary } from '@/utils/slaughterInsights';
import { SlaughterInfoCard } from '@/components/slaughter/SlaughterLotInfo';
import {
  fetchAdvisory,
  fetchBatch,
  fetchBatchHealth,
  fetchBreedStandards,
  fetchBuildings,
  fetchCurve,
  fetchDashboard,
  fetchFeedStock,
  fetchHealthEvents,
  fetchPondage,
  fetchProphylaxis,
  fetchProtocols,
  fetchRentabiliteBatch,
  fetchSanitaryProgram,
  fetchSlaughterOrders,
  fetchTreatments,
} from '@/api';
import { downloadPdf } from '@/api/pdf';
import type {
  Alert as LotAlert,
  BatchPnl,
  BatchType,
  BreedStandard,
  BreedStatus,
  FeedLotStock,
  PondageSummary,
  ProphylaxisEvent,
  ProtocolStep,
  SanitaryProtocol,
  SanitaryProtocolWithSteps,
  TreatmentRecord,
} from '@/api/types';
import { SPECIES_LABELS } from '@/api/format';

// ── Tabs ──
type MainTab = 'overview' | 'curves' | 'history' | 'health';
const MAIN_TABS: { key: MainTab; label: string; icon: typeof Clock }[] = [
  { key: 'overview', label: 'Vue', icon: Layers },
  { key: 'curves', label: 'Courbes', icon: Activity },
  { key: 'history', label: 'Historique', icon: Clock },
  { key: 'health', label: 'Sanitaire', icon: HeartPulse },
];

// ── History filter ──
type HistoryFilter = 'all' | 'treatments' | 'health';
const HISTORY_FILTERS: { key: HistoryFilter; label: string }[] = [
  { key: 'all', label: 'Tout' },
  { key: 'treatments', label: 'Soins' },
  { key: 'health', label: 'Santé' },
];

// ── Legend ──
const LEGEND: { key: string; label: string; explain: string }[] = [
  { key: 'ic', label: 'Indice de Consommation (IC)', explain: "kg d'aliment consommé pour produire 1 kg de poids vif. Plus il est bas, plus le lot est efficace." },
  { key: 'gmq', label: 'Gain Moyen Quotidien (GMQ)', explain: 'Grammes pris par oiseau et par jour. Il mesure la vitesse de croissance.' },
  { key: 'ipe', label: 'Indice de Performance Européen (IPE)', explain: 'Score global combinant viabilité, croissance et IC.' },
  { key: 'viab', label: 'Viabilité', explain: "Pourcentage d'oiseaux toujours vivants par rapport au départ." },
  { key: 'ponte', label: 'Taux de ponte', explain: 'Œufs pondus par poule et par jour, en pourcentage.' },
];

const CARE_LABEL: Record<string, string> = {
  VACCIN: 'Vaccin', MEDICAMENT: 'Médicament', VITAMINE: 'Vitamine', ANTIBIOTIQUE: 'Antibiotique', AUTRE: 'Autre',
};
const HEALTH_KIND_LABEL: Record<string, string> = {
  MALADIE: 'Maladie', MORTALITE: 'Mortalité', REFORME: 'Abattage', SYMPTOME: 'Symptôme', VISITE_VETO: 'Visite veto', AUTRE: 'Autre',
};
const CARE_WINDOW_DAYS = 7;

type CareAlertItem = { level: 'ROUGE' | 'JAUNE'; message: string; recommendation: string; date: string };

function defaultProtocolFor(
  protocols: SanitaryProtocol[] | undefined,
  species: string,
  type: BatchType,
): SanitaryProtocol | undefined {
  return (
    protocols?.find((p) => p.species === species && p.type === type && p.isDefault) ??
    protocols?.find((p) => p.species === species && p.type === type) ??
    protocols?.find((p) => p.type === type)
  );
}

// Dérive les alertes sanitaires du lot (soins en retard / à prévoir) à partir
// de la prophylaxie ET du protocole — independamment de l'advisory backend.
function deriveCareAlerts(
  prophylaxis: ProphylaxisEvent[] | undefined,
  program: SanitaryProtocolWithSteps | undefined,
  treatments: TreatmentRecord[] | undefined,
  ageDays: number,
): CareAlertItem[] {
  const items: CareAlertItem[] = [];
  const today = new Date().toISOString().slice(0, 10);

  // L'état « en retard » provient du serveur (EN_RETARD, bascule après le
  // délai de grâce utilité du statut officiel) — pas d'une dérivation locale
  // (0 j) qui divergerait de l'écran Sanitaire (1 j).
  const late = (prophylaxis ?? []).filter((p) => p.status === 'EN_RETARD');
  for (const p of late) {
    items.push({
      level: 'ROUGE',
      message: `${CARE_LABEL[p.careType] ?? 'Soin'} en retard : ${p.name} (prévu le ${p.scheduledDate})`,
      recommendation: 'Réaliser ce soin au plus tôt pour rester conforme au protocole.',
      date: p.scheduledDate,
    });
  }

  if (program) {
    const events = prophylaxis ?? [];
    // Une étape est « couverte » dès qu'un soin la mentionne (réalisé OU déjà
    // planifié) : un calendrier existe, plus d'alerte « à réaliser ».
    const coveredByStep = new Set(
      events.filter((p) => p.protocolStepId).map((p) => p.protocolStepId as string),
    );
    const coveredNames = new Set(
      [...events.map((p) => p.name), ...(treatments ?? []).map((t) => t.productName)]
        .map((n) => n.trim().toLowerCase()),
    );
    const isCovered = (s: ProtocolStep) => coveredByStep.has(s.id) || coveredNames.has(s.name.trim().toLowerCase());

    const steps = program.steps.filter((s) => s.active);
    const due = steps
      .filter((s) => !isCovered(s) && s.dayFrom <= ageDays)
      .sort((a, b) => a.dayFrom - b.dayFrom);
    const soon = steps
      .filter((s) => !isCovered(s) && s.dayFrom > ageDays && s.dayFrom <= ageDays + CARE_WINDOW_DAYS)
      .sort((a, b) => a.dayFrom - b.dayFrom);

    for (const s of due) {
      items.push({
        level: 'ROUGE',
        message: `${CARE_LABEL[s.careType] ?? 'Soin'} à réaliser (J${s.dayFrom}) : ${s.name}`,
        recommendation: 'Planifier sans attendre : ce soin doit être réalisé pour rester conforme.',
        date: today,
      });
    }
    for (const s of soon) {
      items.push({
        level: 'JAUNE',
        message: `${CARE_LABEL[s.careType] ?? 'Soin'} à prévoir (J${s.dayFrom}) : ${s.name}`,
        recommendation: 'Prévoir un passage cette semaine avant la date du soin.',
        date: today,
      });
    }
  }
  return items;
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════

export default function LotDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const batchId = String(id ?? '');
  const { openDaily, openSale } = useQuickCapture();
  const { farmId } = useAuth();

  // ── Fenêtre partagée PeriodBar (déclarée avant les requêtes : elles en dépendent) ──
  const [period, setPeriod] = useState<PeriodWindow>(() => periodWindow('all'));
  const asOf = period.isFiltered && period.to ? period.to : undefined;

  // ── Queries ──
  const batchQ = useQuery({ queryKey: ['batch', farmId, batchId, asOf ?? ''], queryFn: () => fetchBatch(farmId, batchId, asOf), enabled: !!batchId });
  const curveQ = useQuery({ queryKey: ['curve', farmId, batchId], queryFn: () => fetchCurve(farmId, batchId), enabled: !!batchId });
  const advisoryQ = useQuery({ queryKey: ['advisory', farmId], queryFn: () => fetchAdvisory(farmId) });
  const healthQ = useQuery({ queryKey: ['batch-health', farmId, batchId, asOf ?? ''], queryFn: () => fetchBatchHealth(farmId, batchId, asOf), enabled: !!batchId });
  const treatmentsQ = useQuery({ queryKey: ['treatments', farmId, batchId], queryFn: () => fetchTreatments(farmId, batchId), enabled: !!batchId });
  const prophylaxisQ = useQuery({ queryKey: ['prophylaxis', farmId, batchId], queryFn: () => fetchProphylaxis(farmId, batchId), enabled: !!batchId });
  const healthEventsQ = useQuery({ queryKey: ['health-events', farmId, batchId], queryFn: () => fetchHealthEvents(farmId, batchId), enabled: !!batchId });
  const slaughterQ = useQuery({ queryKey: ['slaughter-orders', farmId], queryFn: () => fetchSlaughterOrders(farmId), staleTime: 60_000 });

  // ── New queries for lot metrics ──
  const rentabQ = useQuery({ queryKey: ['rentabilite-batch', farmId, batchId], queryFn: () => fetchRentabiliteBatch(farmId, batchId), enabled: !!batchId });
  const feedStockQ = useQuery({ queryKey: ['feed-stock', farmId], queryFn: () => fetchFeedStock(farmId) });
  const dashboardQ = useQuery({ queryKey: ['dashboard', farmId, asOf ?? '', period.time ?? ''], queryFn: () => fetchDashboard(farmId, asOf, period.time), staleTime: 30_000 });
  const buildingsQ = useQuery({ queryKey: ['buildings', farmId], queryFn: () => fetchBuildings(farmId) });

  // ── State ──
  const [mainTab, setMainTab] = useState<MainTab>('overview');
  const [curveTab, setCurveTab] = useState<'weight' | 'fcr' | 'water' | 'mortality' | 'eggs'>('weight');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [healthFilter, setHealthFilter] = useState<'all' | 'event' | 'care'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const b = batchQ.data;
  const m = b?.metrics;
  const isLayer = b?.type === 'PONDEUSE';
  const buildingName = useMemo(
    () => (b?.buildingId ? buildingsQ.data?.find((bd) => bd.id === b.buildingId)?.name ?? null : null),
    [b?.buildingId, buildingsQ.data],
  );
  const eb = m?.eggBreakdown;
  const eggTotal = eb?.collected ?? 0;
  const eggCracked = eb?.cracked ?? 0;
  const eggCasse = eggTotal > 0 ? Math.round((eggCracked / eggTotal) * 100) : 0;
  const eggRows = [
    { key: 'sellable', label: 'Commercialisables', count: eb?.sellable ?? 0, color: palette.green[600] },
    { key: 'small', label: 'Petits œufs', count: eb?.small ?? 0, color: palette.brand[500] },
    { key: 'doubleYolk', label: 'Double jaune', count: eb?.doubleYolk ?? 0, color: palette.amber[500] },
    { key: 'dirty', label: 'Œufs sales', count: eb?.dirty ?? 0, color: color.ink[400] },
    { key: 'cracked', label: 'Fêlés / abîmés', count: eb?.cracked ?? 0, color: palette.red[500] },
  ];
  const eggPct = (count: number) => (eggTotal > 0 ? Math.round((count / eggTotal) * 100) : 0);

  const pondageQ = useQuery({ queryKey: ['pondage', farmId, batchId], queryFn: () => fetchPondage(farmId, batchId), enabled: !!batchId && isLayer });

  // ── Protocol (soins dus / à venir) ──
  const protocolsQ = useQuery({
    queryKey: ['sanitary-protocols', b?.species, b?.type],
    queryFn: () => fetchProtocols(b?.species ?? 'POULET', b?.type ?? 'CHAIR'),
    staleTime: 60_000,
    enabled: !!b,
  });
  const defaultProtocol = useMemo(
    () => defaultProtocolFor(protocolsQ.data, b?.species ?? 'POULET', b?.type ?? 'CHAIR'),
    [protocolsQ.data, b?.species, b?.type],
  );
  // Le programme « à réaliser » est celui réellement appliqué au lot (protocolId
  // des événements) ; on ne retombe sur le protocole par défaut qu'à défaut.
  const appliedProgramId = useMemo(
    () =>
      (prophylaxisQ.data ?? []).map((p) => p.protocolId).find(Boolean) ??
      defaultProtocol?.id,
    [prophylaxisQ.data, defaultProtocol?.id],
  );
  const programQ = useQuery({
    queryKey: ['sanitary-program', appliedProgramId],
    queryFn: () => fetchSanitaryProgram(appliedProgramId!),
    enabled: appliedProgramId != null,
    staleTime: 60_000,
  });
  const careAlerts = useMemo(
    () => deriveCareAlerts(prophylaxisQ.data, programQ.data, treatmentsQ.data, m?.ageDays ?? 0),
    [prophylaxisQ.data, programQ.data, treatmentsQ.data, m?.ageDays],
  );

  // ── Derived lot metrics ──
  const breedStatus: BreedStatus | null = useMemo(() => {
    const row = dashboardQ.data?.healthOverview?.find((r) => r.batchId === batchId);
    return row?.breedStatus ?? null;
  }, [dashboardQ.data, batchId]);

  const breedIdForStandards = breedStatus?.breedId ?? null;
  const standardsQ = useQuery({
    queryKey: ['breed-standards', breedIdForStandards],
    queryFn: () => fetchBreedStandards(breedIdForStandards!),
    enabled: !!breedIdForStandards,
  });

  // ── Cycle progress (week X / Y from breed standards) ──
  const cycleInfo = useMemo(() => {
    const std: BreedStandard[] = standardsQ.data ?? [];
    const age = m?.ageDays ?? 0;
    const totalWeeks = std.length > 0 ? Math.max(...std.map((s) => s.week)) : isLayer ? 72 : 12;
    const currentWeek = Math.min(Math.max(Math.ceil(age / 7), 1), totalWeeks);
    const pct = Math.min(100, (age / (totalWeeks * 7)) * 100);
    return { currentWeek, totalWeeks, pct };
  }, [standardsQ.data, m?.ageDays, isLayer]);

  const lotFeedLots: FeedLotStock[] = useMemo(() => {
    return (feedStockQ.data?.lots ?? []).filter((l) => l.batchId === batchId);
  }, [feedStockQ.data, batchId]);

  const pnl: BatchPnl | null = rentabQ.data ?? null;
  const quantityAtStart = b?.quantityAtStart ?? 0;

  // ── Synthèse abattage ──
  const slaughterSummary = useMemo(
    () => lotSlaughterSummary(slaughterQ.data ?? [], b ?? { id: batchId, quantityAlive: 0 }),
    [slaughterQ.data, b, batchId],
  );

  // Prix d'achat par unité (poussins) — explique un Net négatif : ex. 1500/u.
  const chickUnitPriceFcfa = useMemo(() => {
    if (pnl?.enrichment.chickCostFcfa != null && quantityAtStart > 0) {
      return Math.round(pnl.enrichment.chickCostFcfa / quantityAtStart);
    }
    return null;
  }, [pnl, quantityAtStart]);
  const pondage: PondageSummary | null = pondageQ.data ?? null;

  // ── Date filtering (fenêtre partagée PeriodBar) ──
  const dateRange = useMemo(() => ({
    from: period.from ? new Date(`${period.from}T00:00:00`) : null,
    to: period.to ? new Date(`${period.to}T23:59:59`) : null,
  }), [period.from, period.to]);

  // ── Filtered curve data ──
  const filteredWeekly = useMemo(() => {
    const weeks = curveQ.data?.weekly ?? [];
    const { from, to } = dateRange;
    if (!from && !to) return weeks;
    return weeks.filter((w) => {
      const d = new Date(w.weekStart);
      return (!from || d >= from) && (!to || d <= to);
    });
  }, [curveQ.data, dateRange]);

  // ── Water consumption (from filtered weekly curve data) ──
  const waterSummary = useMemo(() => {
    const weeks = filteredWeekly;
    const totalWater = weeks.reduce((s, w) => s + (w.waterL || 0), 0);
    const current = weeks[0];
    const previous = weeks[1];
    let deltaPct: number | null = null;
    if (current && previous && previous.waterL > 0) {
      deltaPct = ((current.waterL - previous.waterL) / previous.waterL) * 100;
    }
    return { totalWater, currentWeekL: current?.waterL ?? 0, deltaPct };
  }, [filteredWeekly]);

  const labelDay = (ws: string) => ws.slice(5).replace('-', '/');

  const weightPoints = useMemo(() => filteredWeekly.filter((w) => w.avgWeightKg != null).map((w) => ({ x: labelDay(w.weekStart), y: w.avgWeightKg! })), [filteredWeekly]);
  const fcrPoints = useMemo(() => filteredWeekly.filter((w) => w.fcrCumulative != null).map((w) => ({ x: labelDay(w.weekStart), y: w.fcrCumulative! })), [filteredWeekly]);
  const waterPoints = useMemo(() => filteredWeekly.filter((w) => w.waterL > 0).map((w) => ({ x: labelDay(w.weekStart), y: w.waterL })), [filteredWeekly]);
  const mortalityPoints = useMemo(() => filteredWeekly.filter((w) => w.deaths >= 0).map((w) => ({ x: labelDay(w.weekStart), y: w.deaths })), [filteredWeekly]);
  const eggsPoints = useMemo(() => {
    if (!isLayer) return [];
    const weekly = pondageQ.data?.weekly ?? [];
    const { from, to } = dateRange;
    const scoped = (!from && !to) ? weekly : weekly.filter((w) => {
      const d = new Date(w.weekStart);
      return (!from || d >= from) && (!to || d <= to);
    });
    return scoped.filter((w) => w.collected > 0).map((w) => ({ x: labelDay(w.weekStart), y: w.collected }));
  }, [pondageQ.data, dateRange, isLayer]);

  // ── Latest avg weight (kg), for the overview tile / mini-chart ──
  const avgWeightKg = useMemo(() => {
    const pts = weightPoints;
    return pts.length > 0 ? pts[0].y : null;
  }, [weightPoints]);

  // ── Lay-rate points (pondeuse) for the overview mini-chart ──
  const layRatePoints = useMemo(() => {
    if (!isLayer) return [];
    const weekly = pondageQ.data?.weekly ?? [];
    const { from, to } = dateRange;
    const scoped = (!from && !to) ? weekly : weekly.filter((w) => {
      const d = new Date(w.weekStart);
      return (!from || d >= from) && (!to || d <= to);
    });
    return scoped
      .filter((w) => w.layRatePercent != null)
      .map((w) => ({ x: w.weekStart.slice(5).replace('-', '/'), y: w.layRatePercent! }));
  }, [pondageQ.data, dateRange, isLayer]);

  // ── History items (merged timeline) ──
  const historyItems = useMemo(() => {
    const items: { date: string; kind: string; label: string; detail: string; icon: typeof Clock; tone: string }[] = [];

    // Treatments
    for (const t of treatmentsQ.data ?? []) {
      items.push({
        date: t.administeredAt?.slice(0, 10) ?? '',
        kind: 'treatment',
        label: t.productName,
        detail: `${CARE_LABEL[t.careType] ?? t.careType}${t.dosage ? ` · ${t.dosage}` : ''}`,
        icon: Syringe,
        tone: 'brand',
      });
    }

    // Prophylaxis events (completed)
    for (const p of prophylaxisQ.data ?? []) {
      if (p.status === 'FAIT') {
        items.push({
          date: p.completedAt?.slice(0, 10) ?? p.scheduledDate,
          kind: 'prophylaxis',
          label: p.name,
          detail: `${CARE_LABEL[p.careType] ?? p.careType} · ${p.scheduledDate}`,
          icon: Pill,
          tone: 'green',
        });
      } else if (p.status === 'EN_RETARD') {
        items.push({
          date: p.scheduledDate,
          kind: 'prophylaxis_late',
          label: `${p.name} (en retard)`,
          detail: `${CARE_LABEL[p.careType] ?? p.careType} · prévu le ${p.scheduledDate}`,
          icon: AlertTriangle,
          tone: 'red',
        });
      }
    }

    // Health events
    for (const e of healthEventsQ.data ?? []) {
      items.push({
        date: e.occurredAt?.slice(0, 10) ?? '',
        kind: 'health',
        label: e.title,
        detail: `${HEALTH_KIND_LABEL[e.kind] ?? e.kind}${e.quantity ? ` · ${e.quantity} oiseaux` : ''}`,
        icon: Stethoscope,
        tone: e.severity === 'ROUGE' ? 'red' : e.severity === 'JAUNE' ? 'amber' : 'green',
      });
    }

    // Slaughter orders (métriques d'abattage dans l'historique du lot)
    for (const o of slaughterQ.data ?? []) {
      if (o.batchId !== batchId || o.status === 'CANCELLED') continue;
      items.push({
        date: o.processedAt?.slice(0, 10) ?? o.plannedDate,
        kind: 'slaughter',
        label: `Abattage · ${o.referenceNumber}`,
        detail: `${o.destination === 'INTERNE' ? 'Interne' : 'Externe'}${o.slaughterType === 'ABATTU' ? ' · abattu' : ' · vivant'} · ${o.birdCount} oiseaux${o.carcassWeightKg != null ? ` · ${o.carcassWeightKg} kg carcasse` : ''}${o.rendementPercent != null ? ` · ${o.rendementPercent.toFixed(1)} % rendement` : ''}`,
        icon: Scale,
        tone: o.status === 'PROCESSED' ? 'green' : o.status === 'SENT' ? 'amber' : 'brand',
      });
    }

    items.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));
    return items;
  }, [treatmentsQ.data, prophylaxisQ.data, healthEventsQ.data, slaughterQ.data, batchId]);

  const filteredHistory = useMemo(() => {
    const from = dateRange.from ? toDateStr(dateRange.from) : null;
    const to = dateRange.to ? toDateStr(dateRange.to) : null;
    const inRange = (d: string) => !d || (!from && !to) || ((!from || d >= from) && (!to || d <= to));
    const scoped = historyItems.filter((h) => inRange(h.date));
    if (historyFilter === 'treatments') return scoped.filter((h) => h.kind === 'treatment' || h.kind === 'prophylaxis' || h.kind === 'prophylaxis_late');
    if (historyFilter === 'health') return scoped.filter((h) => h.kind === 'health');
    return scoped;
  }, [historyItems, historyFilter, dateRange]);

  // ── Suivi sanitaire (unifié : événements + prophylaxie, triés par date asc) ──
  const healthTimeline = useMemo(() => {
    const items: { key: string; date: string; category: 'event' | 'care'; icon: typeof Clock; title: string; chipLabel: string; chipTone: 'red' | 'amber' | 'green' | 'brand'; detail: string }[] = [];
    const from = dateRange.from ? toDateStr(dateRange.from) : null;
    const to = dateRange.to ? toDateStr(dateRange.to) : null;
    const inRange = (d: string) => !d || (!from && !to) || ((!from || d >= from) && (!to || d <= to));
    for (const e of healthEventsQ.data ?? []) {
      const date = e.occurredAt?.slice(0, 10) ?? '';
      if (!inRange(date)) continue;
      items.push({
        key: `e-${e.id}`,
        date,
        category: 'event',
        icon: Stethoscope,
        title: e.title,
        chipLabel: HEALTH_KIND_LABEL[e.kind] ?? e.kind,
        chipTone: e.severity === 'ROUGE' ? 'red' : e.severity === 'JAUNE' ? 'amber' : 'green',
        detail: [e.quantity ? `${e.quantity} oiseaux` : '', e.status === 'RESOLU' ? 'Résolu' : '', e.treatmentGiven ? `Traitement : ${e.treatmentGiven}` : ''].filter(Boolean).join(' · '),
      });
    }
    for (const p of prophylaxisQ.data ?? []) {
      if (p.status === 'ANNULE') continue;
      const date = p.status === 'FAIT' ? p.completedAt?.slice(0, 10) ?? p.scheduledDate : p.scheduledDate;
      if (!inRange(date)) continue;
      items.push({
        key: `p-${p.id}`,
        date,
        category: 'care',
        icon: Pill,
        title: p.name,
        chipLabel: p.status === 'FAIT' ? 'Fait' : p.status === 'EN_RETARD' ? 'En retard' : 'Programmé',
        chipTone: p.status === 'FAIT' ? 'green' : p.status === 'EN_RETARD' ? 'red' : 'brand',
        detail: [CARE_LABEL[p.careType] ?? p.careType, p.dosage].filter(Boolean).join(' · '),
      });
    }
    items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return items;
  }, [healthEventsQ.data, prophylaxisQ.data, dateRange]);

  const filteredHealth = useMemo(() => {
    if (healthFilter === 'all') return healthTimeline;
    return healthTimeline.filter((t) => t.category === healthFilter);
  }, [healthTimeline, healthFilter]);

  // ── Lot alerts ──
  const lotAlerts = useMemo(() => {
    const advisoryAlerts = (advisoryQ.data?.alerts ?? []).filter((a) => a.batchId === batchId);
    const derived: LotAlert[] = careAlerts.map((c, i) => ({
      id: `san-care-${i}-${c.date}`,
      farmId,
      batchId,
      batchName: b?.batchName ?? null,
      kind: 'PROPHYLAXIE',
      level: c.level,
      status: 'ACTIVE' as const,
      message: c.message,
      recommendation: c.recommendation,
      why: [],
      createdAt: c.date,
    }));
    const dedupe = (a: LotAlert) => `${a.kind}|${a.level}|${a.message}`;
    const seen = new Set<string>();
    return [...advisoryAlerts, ...derived]
      .filter((a) => (seen.has(dedupe(a)) ? false : (seen.add(dedupe(a)), true)));
  }, [advisoryQ.data, batchId, careAlerts, farmId, b?.batchName]);

  // ── PDF ──
  const downloadPasseport = async () => {
    setPdfBusy(true);
    try {
      await downloadPdf(`/farms/${farmId}/batches/${batchId}/passeport`, `passeport-${batchId}.pdf`);
      Alert.alert('Passeport sanitaire', 'PDF prêt.');
    } catch (e) { Alert.alert('Erreur', e instanceof Error ? e.message : 'Inattendue.'); }
    finally { setPdfBusy(false); }
  };

  // ── Loading / Error ──
  if (!b) {
    return (
      <Screen>
        <ScreenHeader title="Lot" back />
        {batchQ.isLoading ? <Spinner label="Chargement du lot…" /> : <AppText size="body" color="muted">Lot introuvable.</AppText>}
      </Screen>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <Screen
      bottomPad={140}
      header={
        <>
          {/* ── HEADER + FILTRE PÉRIODE (fixes, comme Accueil) ── */}
          <ScreenHeader
            title={b.batchName ?? 'Lot'}
            back
            right={<Chip label={b.status === 'EN_VENTE' ? 'En vente' : 'Actif'} tone={b.status === 'EN_VENTE' ? 'green' : 'brand'} />}
          />
          <PeriodBar defaultSpan="all" onChange={setPeriod} style={{ marginTop: 2 }} />
        </>
      }
    >

      {/* ── HERO ── */}
      <Card tone="brand" style={styles.heroCard}>
        <View style={styles.heroSplit}>
          {breedImageForLot(b.breedName, b.species) ? (
            <View style={styles.heroImageWrap}>
              <Image source={breedImageForLot(b.breedName, b.species)!} style={styles.heroImage} resizeMode="cover" />
              <View style={styles.heroAgeBadge}>
                <AppText size="small" weight="bold" color="#FFFFFF">J{m?.ageDays ?? 0}</AppText>
              </View>
            </View>
          ) : null}
          <View style={styles.heroStats}>
            <View style={styles.heroBadgesRow}>
              <View style={[styles.heroTypeBadge, styles.heroTypeBadgeChair, isLayer && styles.heroTypeBadgeLayer]}>
                <AppText size="caption" weight="bold" color={isLayer ? color.accent[700] : color.brand[800]}>
                  {isLayer ? 'Pondeuse' : 'Chair'}
                </AppText>
              </View>
              {buildingName && (
                <View style={styles.heroBuildingBadge}>
                  <AppText size="caption" weight="bold" color={palette.brand[700]} numberOfLines={1} style={styles.heroBuildingText}>
                    {buildingName}
                  </AppText>
                </View>
              )}
            </View>
            <View style={styles.heroSpeciesTag}>
              <AppText size="label" weight="bold" color="brand" style={{ flexShrink: 1, minWidth: 0 }}>
                {b.species && b.species !== 'POULET' ? (b.species === 'AUTRE' && b.customSpecies ? b.customSpecies : SPECIES_LABELS[b.species]) : SPECIES_LABELS.POULET}
              </AppText>
              {(b.breedCode || b.breedName) ? <View style={styles.heroTitleSep} /> : null}
              {b.breedCode ? (
                <AppText size="label" weight="bold" color="accent" style={{ flexShrink: 1, minWidth: 0 }}>{b.breedCode}</AppText>
              ) : null}
              {b.breedName ? <View style={styles.heroTitleSep} /> : null}
              {b.breedName ? (
                <AppText size="label" weight="medium" color="muted" style={{ flexShrink: 1, minWidth: 0 }}>{b.breedName}</AppText>
              ) : null}
            </View>
            <View style={styles.heroMainRow}>
              <HeroStat value={fmt(m?.liveCount ?? 0)} label="vivants" small />
              <View style={styles.heroStatSep} />
              <HeroStat
                value={`${(m?.mortalityPercent ?? 0).toLocaleString('fr-FR')} %`}
                label="mortalité"
                tone={normalizeMortalityStatus(m?.mortalityStatus, m?.mortalityPercent) === 'normal' ? 'text' : 'danger'}
                small
              />
              <View style={styles.heroStatSep} />
              <HeroStat value={(m?.fcr ?? 0).toLocaleString('fr-FR')} label="IC" small />
              <View style={styles.heroStatSep} />
              {isLayer ? (
                <HeroStat value={m?.layRatePercent != null ? `${m.layRatePercent.toLocaleString('fr-FR')} %` : '—'} label="Taux de ponte" tone={m?.layRatePercent != null && m.layRatePercent >= 100 ? 'danger' : 'text'} small />
              ) : (
                <HeroStat value={m?.ipe != null ? m.ipe.toLocaleString('fr-FR') : '—'} label="IPE" small />
              )}
            </View>
          </View>
        </View>
        <View style={styles.healthStrip}>
          {healthQ.data && (
            <View style={styles.healthScorePill}>
              <HeartPulse size={13} color={healthQ.data.healthScore >= 80 ? palette.green[600] : healthQ.data.healthScore >= 60 ? palette.amber[500] : palette.red[500]} />
              <AppText size="small" weight="bold" color="text">Santé {healthQ.data.healthScore}/100</AppText>
            </View>
          )}
          <View style={styles.heroActions}>
            <Button label="Saisir" size="xs" labelSize="caption" tone="brand" icon={PenLine} block={false} onPress={() => openDaily(batchId)} />
            <Button label="Encaisser" size="xs" labelSize="caption" tone="accent" icon={ShoppingCart} block={false} onPress={() => openSale(batchId)} />
          </View>
        </View>
        <AppText size="caption" color="muted">
          Début : {b.integrationDate} · {fmt(b.quantityAtStart)} sujets
        </AppText>
        <View style={styles.heroPassportRow}>
          <Button label="Passeport sanitaire (PDF)" size="sm" tone="brand" icon={FileText} block onPress={() => void downloadPasseport()} disabled={pdfBusy} loading={pdfBusy} />
        </View>
      </Card>

      {/* ── CYCLE PROGRESS ── */}
      <View style={styles.cycleCard}>
        <View style={styles.cycleHeader}>
          <AppText size="small" weight="semibold" color="brand">Semaine {cycleInfo.currentWeek}/{cycleInfo.totalWeeks}</AppText>
          <AppText size="small" color="muted">{cycleInfo.pct.toFixed(0)} % du cycle</AppText>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${cycleInfo.pct}%`, backgroundColor: isLayer ? palette.accent[500] : palette.brand[600] }]} />
        </View>
      </View>

      {/* ── MAIN TABS ── */}
      <View style={styles.tabRow}>
        {MAIN_TABS.map((t) => {
          const active = mainTab === t.key;
          const Icon = t.icon;
          return (
            <Pressable key={t.key} onPress={() => setMainTab(t.key)} style={[styles.tabBtn, active && styles.tabBtnActive]} accessibilityRole="tab">
              <Icon size={16} color={active ? palette.brand[600] : color.ink[400]} />
              <AppText size="small" weight={active ? 'bold' : 'medium'} color={active ? 'brand' : 'muted'}>{t.label}</AppText>
            </Pressable>
          );
        })}
      </View>

      

      {/* ══════════════════ TAB: OVERVIEW ══════════════════ */}
      {mainTab === 'overview' && (
        <View style={styles.overviewStack}>
          {/* Metric tiles */}
          <View style={styles.metricGrid}>
            <MetricTile label="GMQ" value={m?.gmqGramsPerDay ? `${m.gmqGramsPerDay.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} g` : '—'} icon={TrendingUp} tone="brand" threeCol />
            <MetricTile label="IPE" value={(m?.ipe ?? 0).toLocaleString('fr-FR')} icon={Activity} tone="accent" threeCol />
            <MetricTile label="Viabilité" value={`${(m?.viabilityPercent ?? 100).toLocaleString('fr-FR')} %`} icon={HeartPulse} tone={(m?.viabilityPercent ?? 100) >= 95 ? 'green' : 'amber'} threeCol />
            <MetricTile label="Poids moyen" value={avgWeightKg != null ? `${avgWeightKg.toFixed(1)} kg` : '—'} icon={Weight} tone="brand" threeCol labelLines={2} />
            <MetricTile label="Aliment/bird" value={healthQ.data?.feedPerBirdGrams != null && healthQ.data.feedPerBirdGrams > 0 ? `${Math.round(healthQ.data.feedPerBirdGrams)} g/j` : '—'} icon={Wheat} tone="default" threeCol labelLines={2} />
            <MetricTile label="Densité" value={m?.densityPerM2 ? `${m.densityPerM2.toFixed(1)}/m²` : '—'} icon={Layers} tone="default" threeCol />
          </View>

          {/* ── ABATTAGE — synthèse ordres ── */}
          <SlaughterInfoCard summary={slaughterSummary} showEmpty />

          {/* ── ŒUFS — répartition détaillée ── */}
          <Card style={styles.eggCard}>
            <View style={styles.healthHeader}>
              <Egg size={16} color={palette.accent[500]} />
              <AppText size="body" weight="bold" color="brand">Œufs</AppText>
              {eggTotal > 0 && (
                <AppText size="small" color="muted" style={{ marginLeft: 'auto' }}>
                  ≈ {Math.floor((eb?.sellable ?? 0) / 30).toLocaleString('fr-FR')} alvéoles
                </AppText>
              )}
            </View>

            {eggTotal > 0 ? (
              <>
                <View style={styles.waterStatRow}>
                <View style={styles.waterStat}>
                  <AppText size="small" color="muted">Récolte brute</AppText>
                  <AppText size="body" weight="bold" color="text" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{fmt(eggTotal)}</AppText>
                </View>
                {isLayer && (
                  <View style={styles.waterStat}>
                    <AppText size="small" color="muted">Taux ponte</AppText>
                    <AppText size="body" weight="bold" color="accent" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{m?.layRatePercent != null ? `${m.layRatePercent.toLocaleString('fr-FR')} %` : '—'}</AppText>
                  </View>
                )}
                <View style={styles.waterStat}>
                  <AppText size="small" color="muted">Casse</AppText>
                  <AppText size="body" weight="bold" color={eggCasse >= 10 ? 'danger' : eggCasse > 0 ? 'amber' : 'success'}>{eggCasse} %</AppText>
                </View>
                <View style={styles.waterStat}>
                  <AppText size="small" color="muted">Fêlés</AppText>
                  <AppText size="body" weight="bold" color="text">{fmt(eggCracked)}</AppText>
                </View>
              </View>

              {isLayer && pondage && (
                <View style={styles.waterStatRow}>
                  <View style={styles.waterStat}>
                    <AppText size="small" color="muted">Œufs/poule</AppText>
                    <AppText size="body" weight="bold" color="text">{pondage.eggsPerHen ?? '—'}</AppText>
                  </View>
                  <View style={styles.waterStat}>
                    <AppText size="small" color="muted">Tx commercialisable</AppText>
                    <AppText size="body" weight="bold" color="text">{pondage.sellableRatioPercent != null ? `${pondage.sellableRatioPercent.toFixed(1)} %` : '—'}</AppText>
                  </View>
                </View>
              )}

              <View style={styles.eggSegBar}>
                {eggRows.map((r) =>
                  r.count > 0 ? <View key={r.key} style={[styles.eggSegFill, { backgroundColor: r.color, flex: r.count }]} /> : null,
                )}
              </View>

              <View style={{ gap: 8 }}>
                {eggRows.map((r) => (
                  <View key={r.key} style={{ gap: 3 }}>
                    <View style={styles.eggRow}>
                      <View style={[styles.eggRowDot, { backgroundColor: r.color }]} />
                      <AppText size="small" color="text" style={{ flex: 1 }}>{r.label}</AppText>
                      <AppText size="small" weight="bold" color="text">{r.count.toLocaleString('fr-FR')}</AppText>
                      <AppText size="caption" color="muted" style={styles.eggRowPct}>{eggPct(r.count)}%</AppText>
                    </View>
                    <View style={styles.eggMiniBar}>
                      <View
                        style={[
                          styles.eggMiniFill,
                          { backgroundColor: r.color, width: `${r.count > 0 ? Math.max(1, (r.count / eggTotal) * 100) : 0}%` },
                        ]}
                      />
                    </View>
                  </View>
                ))}
              </View>
              </>
            ) : (
              <View style={styles.eggEmpty}>
                <Egg size={18} color={palette.ink[300]} />
                <AppText size="small" weight="semibold" color="muted">Pas encore de récolte d{'\u2019'}œufs</AppText>
                <AppText size="caption" color="faint">Les œufs apparaîtront après la première saisie quotidienne.</AppText>
              </View>
            )}
          </Card>

          {/* Mini trend preview — weight (chair) / lay rate (pondeuse) */}
          {(weightPoints.length >= 2 || layRatePoints.length >= 2) && (
            <Card style={styles.miniChartCard}>
              <View style={styles.healthHeader}>
                {isLayer ? <Egg size={16} color={palette.accent[500]} /> : <Weight size={16} color={palette.brand[600]} />}
                <AppText size="body" weight="bold" color="brand">{isLayer ? 'Ponte par semaine' : 'Poids moyen par semaine'}</AppText>
                {!isLayer && avgWeightKg != null && (
                  <AppText size="small" weight="bold" color="brand" style={{ marginLeft: 'auto' }}>{avgWeightKg.toFixed(1)} kg</AppText>
                )}
              </View>
              <LineChart points={isLayer ? layRatePoints : weightPoints} height={110} stroke={isLayer ? palette.accent[500] : palette.brand[600]} unit={isLayer ? 'taux de ponte %' : 'poids (kg)'} format={(v) => (isLayer ? `${v.toFixed(0)}%` : v.toFixed(1))} />
            </Card>
          )}

          {/* Consommation d'eau — compact */}
          {(waterSummary.totalWater > 0 || healthQ.data?.waterLPerBird != null) && (
            <Card style={{ gap: 8 }}>
              <View style={styles.healthHeader}>
                <Droplets size={16} color={palette.brand[500]} />
                <AppText size="body" weight="bold" color="brand">{'Consommation d\u2019eau'}</AppText>
              </View>
              <View style={styles.waterStatRow}>
                <View style={styles.waterStat}>
                  <AppText size="small" color="muted">Total</AppText>
                  <AppText size="body" weight="bold" color="text" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{waterSummary.totalWater > 0 ? `${fmt(Math.round(waterSummary.totalWater))} L` : '—'}</AppText>
                </View>
                <View style={styles.waterStat}>
                  <AppText size="small" color="muted">L/oiseau/j</AppText>
                  <AppText size="body" weight="bold" color="text">{healthQ.data?.waterLPerBird != null ? `${healthQ.data.waterLPerBird} L` : '—'}</AppText>
                </View>
                <View style={styles.waterStat}>
                  <AppText size="small" color="muted">Tendance</AppText>
                  <AppText size="body" weight="bold" color={waterSummary.deltaPct == null ? 'text' : waterSummary.deltaPct > 25 ? 'danger' : waterSummary.deltaPct > 10 ? 'amber' : waterSummary.deltaPct < -5 ? 'success' : 'text'}>
                    {waterSummary.deltaPct != null ? `${waterSummary.deltaPct > 0 ? '+' : ''}${waterSummary.deltaPct.toFixed(1)} %` : '—'}
                  </AppText>
                </View>
              </View>
            </Card>
          )}

          {/* Health tips */}
          {healthQ.data && (
            <Card style={{ gap: 6 }}>
              <View style={styles.healthHeader}>
                <HeartPulse size={16} color={palette.brand[600]} />
                <AppText size="body" weight="bold" color="brand">Conseils & alertes</AppText>
              </View>
              {healthQ.data.tips.slice(0, 3).map((tip, i) => (
                <View key={i} style={styles.slimTipRow}>
                  {tip.level === 'ROUGE' ? <AlertTriangle size={13} color={palette.red[500]} /> : tip.level === 'JAUNE' ? <Info size={13} color={palette.amber[500]} /> : <Check size={13} color={palette.green[500]} />}
                  <AppText size="small" color="muted" style={{ flex: 1, lineHeight: 16 }}>{tip.text}</AppText>
                </View>
              ))}
            </Card>
          )}

          {/* Breed status — comparison vs target */}
          {breedStatus && (
            <Card style={{ gap: 8 }}>
              <View style={styles.healthHeader}>
                <Target size={16} color={palette.brand[600]} />
                <AppText size="body" weight="bold" color="brand">Référence souche — Semaine {breedStatus.week}</AppText>
              </View>
              {breedStatus.actualAvgWeightKg != null && breedStatus.targetAvgWeightKg != null && (
                <View style={styles.tipRow}>
                  <AppText size="small" color="muted" style={{ flex: 1 }}>Poids (réel {breedStatus.actualAvgWeightKg} kg / cible {breedStatus.targetAvgWeightKg} kg)</AppText>
                  <AppText size="body" weight="bold" color={breedStatus.avgWeightDeviationPct != null && breedStatus.avgWeightDeviationPct < 0 ? 'danger' : 'success'}>
                    {breedStatus.avgWeightDeviationPct != null ? `${breedStatus.avgWeightDeviationPct > 0 ? '+' : ''}${breedStatus.avgWeightDeviationPct.toFixed(1)} %` : '—'}
                  </AppText>
                </View>
              )}
              {breedStatus.actualFcr != null && breedStatus.targetFcr != null && (
                <View style={styles.tipRow}>
                  <AppText size="small" color="muted" style={{ flex: 1 }}>IC (réel {breedStatus.actualFcr} / cible {breedStatus.targetFcr})</AppText>
                  <AppText size="body" weight="bold" color={breedStatus.fcrDeviationPct != null && breedStatus.fcrDeviationPct > 0 ? 'danger' : 'success'}>
                    {breedStatus.fcrDeviationPct != null ? `${breedStatus.fcrDeviationPct > 0 ? '+' : ''}${breedStatus.fcrDeviationPct.toFixed(1)} %` : '—'}
                  </AppText>
                </View>
              )}
              {isLayer && breedStatus.actualLayRatePercent != null && breedStatus.targetLayRatePercent != null && (
                <View style={styles.tipRow}>
                  <AppText size="small" color="muted" style={{ flex: 1 }}>Ponte (réel {breedStatus.actualLayRatePercent} % / cible {breedStatus.targetLayRatePercent} %)</AppText>
                  <AppText size="body" weight="bold" color={breedStatus.layRateDeviationPct != null && breedStatus.layRateDeviationPct < 0 ? 'danger' : 'success'}>
                    {breedStatus.layRateDeviationPct != null ? `${breedStatus.layRateDeviationPct > 0 ? '+' : ''}${breedStatus.layRateDeviationPct.toFixed(1)} %` : '—'}
                  </AppText>
                </View>
              )}
            </Card>
          )}

          {/* Rentabilité — P&L (topline + condensed) */}
          {pnl && (
            <Card style={{ gap: 10 }}>
              <View style={styles.healthHeader}>
                <DollarSign size={16} color={palette.accent[500]} />
                <AppText size="body" weight="bold" color="brand">Rentabilité</AppText>
              </View>
              <View style={styles.pnlTopline}>
                <View style={styles.pnlNet}>
                  <AppText size="small" color="muted">Net</AppText>
                  <AppText size="h3" weight="bold" color={pnl.netFcfa >= 0 ? 'success' : 'danger'}>{fmtFcfa(pnl.netFcfa)}</AppText>
                </View>
                <View style={styles.pnlNet}>
                  <AppText size="small" color="muted">Prix/u (achat)</AppText>
                  <AppText size="body" weight="bold" color="text" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{chickUnitPriceFcfa != null ? `${fmt(chickUnitPriceFcfa)} /u` : '—'}</AppText>
                </View>
              </View>
              <View style={styles.pnlGrid}>
                <View style={styles.healthStat}>
                  <AppText size="small" color="muted">Revenu</AppText>
                  <AppText size="body" weight="bold" color="text">{fmtFcfa(pnl.revenueFcfa)}</AppText>
                </View>
                <View style={styles.healthStat}>
                  <AppText size="small" color="muted">Coût/kg</AppText>
                  <AppText size="body" weight="bold" color="text">{pnl.costPerKgFcfa != null ? fmtFcfa(pnl.costPerKgFcfa) : '—'}</AppText>
                </View>
                <View style={styles.healthStat}>
                  <AppText size="small" color="muted">Vendus</AppText>
                  <AppText size="body" weight="bold" color="text">{fmt(pnl.birdsSold + pnl.eggsSold)}</AppText>
                </View>
                <View style={styles.healthStat}>
                  <AppText size="small" color="muted">Kg vendus</AppText>
                  <AppText size="body" weight="bold" color="text">{pnl.kgSold > 0 ? `${pnl.kgSold.toLocaleString('fr-FR')} kg` : '—'}</AppText>
                </View>
                <View style={styles.healthStat}>
                  <AppText size="small" color="muted">Marge</AppText>
                  <AppText size="body" weight="bold" color={pnl.marginPct != null && pnl.marginPct < 0 ? 'danger' : 'text'}>
                    {pnl.marginPct != null ? `${pnl.marginPct.toFixed(1)} %` : '—'}
                  </AppText>
                </View>
              </View>
            </Card>
          )}

          {/* Feed stock — per lot */}
          {lotFeedLots.length > 0 && (
            <Card style={{ gap: 8 }}>
              <View style={styles.healthHeader}>
                <Warehouse size={16} color={palette.brand[600]} />
                <AppText size="body" weight="bold" color="brand">Stock aliment lot</AppText>
              </View>
              {lotFeedLots.map((lot) => (
                <View key={lot.id} style={styles.tipRow}>
                  <AppText size="small" color="muted" style={{ flex: 1 }}>
                    {lot.productName}{lot.feedPhase ? ` · ${lot.feedPhase.replaceAll('_', ' ')}` : ''}
                  </AppText>
                  <AppText size="body" weight="bold" color="text">{fmt(lot.availableKg)} kg</AppText>
                </View>
              ))}
            </Card>
          )}
        </View>
      )}

      {/* ══════════════════ TAB: CURVES ══════════════════ */}
      {mainTab === 'curves' && (
        <>
          {/* Curve selector */}

          {/* Curve selector */}
          <Card style={{ gap: 10 }}>
            <Segmented
              options={[
                { key: 'weight', label: 'Poids' },
                { key: 'fcr', label: 'IC' },
                { key: 'water', label: 'Eau' },
                { key: 'mortality', label: 'Mortalité' },
                ...(isLayer ? [{ key: 'eggs' as const, label: 'Œufs' }] : []),
              ]}
              value={curveTab}
              onChange={setCurveTab}
            />
            {curveTab === 'weight' && <LineChart points={weightPoints} stroke={color.brand[600]} unit="kg" format={(v) => (v * 1000).toFixed(0)} />}
            {curveTab === 'fcr' && <LineChart points={fcrPoints} stroke={color.accent[600]} unit="kg aliment / kg poids" format={(v) => v.toLocaleString('fr-FR')} />}
            {curveTab === 'water' && <LineChart points={waterPoints} stroke={color.brand[500]} unit="L / semaine" format={(v) => v.toLocaleString('fr-FR')} />}
            {curveTab === 'mortality' && <LineChart points={mortalityPoints} stroke={palette.red[500]} unit="morts / semaine" format={(v) => v.toLocaleString('fr-FR')} />}
            {curveTab === 'eggs' && isLayer && <LineChart points={eggsPoints} stroke={color.accent[500]} unit="œufs" format={(v) => v.toLocaleString('fr-FR')} />}
          </Card>

          {/* Metrics legend */}
          <SectionHeader title="Métriques" subtitle="Touchez ℹ pour comprendre" />
          <Card padding={false} style={styles.legend}>
            {LEGEND.filter((l) => !(!isLayer && l.key === 'ponte')).map((l, i, arr) => {
              const value = l.key === 'ic' ? (m?.fcr ?? 0).toLocaleString('fr-FR')
                : l.key === 'gmq' ? (m?.gmqGramsPerDay ? `${m.gmqGramsPerDay.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} g/j` : '—')
                : l.key === 'ipe' ? (m?.ipe ?? 0).toLocaleString('fr-FR')
                : l.key === 'viab' ? `${(m?.viabilityPercent ?? 100).toLocaleString('fr-FR')} %`
                : m?.layRatePercent != null ? `${m.layRatePercent} %` : '—';
              const open = expanded === l.key;
              return (
                <View key={l.key} style={[styles.legendRow, i < arr.length - 1 && styles.legendBorder]}>
                  <Pressable style={styles.legendMain} onPress={() => setExpanded(open ? null : l.key)} accessibilityRole="button">
                    <View style={{ flex: 1 }}>
                      <AppText size="body" weight="medium" color="text">{l.label}</AppText>
                      {open && <AppText size="small" color="muted" style={{ marginTop: 4 }}>{l.explain}</AppText>}
                    </View>
                    <AppText size="body" weight="bold" color={l.key === 'ponte' && m?.layRatePercent != null && m.layRatePercent >= 100 ? 'danger' : 'brand'}>{value}</AppText>
                    <Info size={16} color={color.ink[400]} />
                  </Pressable>
                </View>
              );
            })}
          </Card>
        </>
      )}

      {/* ══════════════════ TAB: HISTORY ══════════════════ */}
      {mainTab === 'history' && (
        <>
          {/* History filter */}
          <View style={styles.filterRow}>
            {HISTORY_FILTERS.map((f) => {
              const active = historyFilter === f.key;
              return (
                <Pressable key={f.key} onPress={() => setHistoryFilter(f.key)} style={({ pressed }) => [styles.filterBtn, active && styles.filterBtnActive, pressed && styles.filterBtnPressed]}>
                  <AppText size="small" weight={active ? 'bold' : 'medium'} color={active ? 'surface' : 'muted'}>{f.label}</AppText>
                </Pressable>
              );
            })}
          </View>

          {/* Timeline */}
          {filteredHistory.length === 0 ? (
            <Card style={{ alignItems: 'center', padding: 20 }}>
              <AppText size="body" color="muted">Aucun événement sur cette période.</AppText>
            </Card>
          ) : (
            <View style={styles.timeline}>
              {filteredHistory.map((item, i) => {
                const Icon = item.icon;
                return (
                  <View key={`${item.date}-${item.kind}-${i}`} style={styles.timelineItem}>
                    <View style={[styles.timelineDot, { backgroundColor: item.tone === 'red' ? palette.red[500] : item.tone === 'amber' ? palette.amber[500] : item.tone === 'green' ? palette.green[500] : palette.brand[500] }]} />
                    {i < filteredHistory.length - 1 && <View style={styles.timelineLine} />}
                    <View style={styles.timelineContent}>
                      <View style={styles.timelineHeader}>
                        <Icon size={14} color={item.tone === 'red' ? palette.red[500] : item.tone === 'amber' ? palette.amber[500] : item.tone === 'green' ? palette.green[500] : palette.brand[600]} />
                        <AppText size="body" weight="semibold" color="text" style={{ flex: 1 }}>{item.label}</AppText>
                        <AppText size="small" color="faint">{item.date}</AppText>
                      </View>
                      <AppText size="small" color="muted">{item.detail}</AppText>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}

      {/* ══════════════════ TAB: HEALTH ══════════════════ */}
      {mainTab === 'health' && (
        <>
          {/* Alerte sanitaire (soins en retard / à prévoir) */}
          {careAlerts.length > 0 && (
            <Card tone={careAlerts.some((c) => c.level === 'ROUGE') ? 'alert' : 'warn'} style={{ gap: 8 }}>
              <View style={styles.eventHeader}>
                <Stethoscope size={14} color={careAlerts.some((c) => c.level === 'ROUGE') ? palette.red[500] : palette.amber[500]} />
                <AppText size="body" weight="semibold" color="text" style={{ flex: 1 }}>Alerte sanitaire</AppText>
                <Chip
                  label={careAlerts.some((c) => c.level === 'ROUGE') ? 'Soin à réaliser' : 'Soin à prévoir'}
                  tone={careAlerts.some((c) => c.level === 'ROUGE') ? 'red' : 'amber'}
                />
              </View>
              {careAlerts.slice(0, 3).map((c, i) => (
                <AppText key={i} size="bodyM" color="ink" style={{ flex: 1 }}>{c.message}</AppText>
              ))}
            </Card>
          )}

          {/* Health score card */}
          {healthQ.data && (
            <Card style={{ gap: 8 }}>
              <View style={styles.healthHeader}>
                <HeartPulse size={16} color={palette.brand[600]} />
                <AppText size="body" weight="bold" color="brand">Score santé : {healthQ.data.healthScore}/100</AppText>
              </View>
              <View style={styles.healthGrid}>
                <View style={styles.healthStat}>
                  <AppText size="small" color="muted">Mortalité</AppText>
                  <AppText size="body" weight="bold" color={normalizeMortalityStatus(healthQ.data.mortalityStatus, healthQ.data.mortalityPercent) === 'normal' ? 'text' : 'danger'}>
                    {healthQ.data.mortalityPercent.toLocaleString('fr-FR')} %
                  </AppText>
                </View>
                <View style={styles.healthStat}>
                  <AppText size="small" color="muted">Viabilité</AppText>
                  <AppText size="body" weight="bold" color="text">
                    {healthQ.data.viabilityPercent.toLocaleString('fr-FR')} %
                  </AppText>
                </View>
                <View style={styles.healthStat}>
                  <AppText size="small" color="muted">IC</AppText>
                  <AppText size="body" weight="bold" color="text">
                    {healthQ.data.fcr?.toLocaleString('fr-FR') ?? '—'}
                  </AppText>
                </View>
                {isLayer && (
                  <View style={styles.healthStat}>
                    <AppText size="small" color="muted">Ponte</AppText>
                    <AppText size="body" weight="bold" color="text">
                      {healthQ.data.layRatePercent?.toLocaleString('fr-FR') ?? '—'} %
                    </AppText>
                  </View>
                )}
              </View>
            </Card>
          )}

          {/* Suivi sanitaire — événements + prophylaxie unifiés (triés par date) */}
          <SectionHeader title="Suivi sanitaire" subtitle={`${filteredHealth.length} élément(s)`} />
          <View style={styles.filterRow}>
            {([
              { key: 'all', label: 'Tout' },
              { key: 'event', label: 'Événements' },
              { key: 'care', label: 'Prophylaxie' },
            ] as const).map((f) => {
              const active = healthFilter === f.key;
              return (
                <Pressable key={f.key} onPress={() => setHealthFilter(f.key)} style={({ pressed }) => [styles.filterBtn, active && styles.filterBtnActive, pressed && styles.filterBtnPressed]}>
                  <AppText size="small" weight={active ? 'bold' : 'medium'} color={active ? 'surface' : 'muted'}>{f.label}</AppText>
                </Pressable>
              );
            })}
          </View>
          {filteredHealth.length === 0 ? (
            <Card style={{ alignItems: 'center', padding: 16 }}>
              <AppText size="body" color="muted">Aucun élément sanitaire enregistré.</AppText>
            </Card>
          ) : (
            filteredHealth.slice(0, 15).map((t) => {
              const Icon = t.icon;
              return (
                <Card key={t.key} tone={t.chipTone === 'red' ? 'alert' : t.chipTone === 'amber' ? 'warn' : t.chipTone === 'green' ? 'green' : 'default'} style={{ gap: 4 }}>
                  <View style={styles.eventHeader}>
                    <Icon size={14} color={t.chipTone === 'red' ? palette.red[500] : t.chipTone === 'amber' ? palette.amber[500] : t.chipTone === 'green' ? palette.green[500] : palette.brand[600]} />
                    <AppText size="body" weight="semibold" color="text" style={{ flex: 1 }}>{t.title}</AppText>
                    <Chip label={t.chipLabel} tone={t.chipTone} />
                  </View>
                  <AppText size="small" color="muted">
                    {t.date}{t.detail ? ` · ${t.detail}` : ''}
                  </AppText>
                </Card>
              );
            })
          )}
        </>
      )}

      {/* ── ALERTS ── */}
      {lotAlerts.length > 0 && mainTab === 'overview' && (
        <>
          <SectionHeader title="Alertes" subtitle={`${lotAlerts.length} signalement(s)`} />
          <View style={{ gap: 10 }}>
            {lotAlerts.map((a) => <AlertCard key={a.id} alert={a} onAcknowledge={() => void advisoryQ.refetch()} />)}
          </View>
        </>
      )}
    </Screen>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════

function HeroStat({ value, label, tone = 'text', small = false }: { value: string; label: string; tone?: string; small?: boolean }) {
  return (
    <View style={styles.heroStat}>
      <AppText size="h2" weight="bold" color={tone} style={small ? styles.heroValueSmall : styles.heroValue}>{value}</AppText>
      <AppText size="small" color="muted">{label}</AppText>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  // Hero
  heroCard: { gap: 10 },
  heroSplit: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heroImageWrap: { width: 76, height: 76, borderRadius: radii.lg, overflow: 'hidden' },
  heroImage: { width: 76, height: 76, borderRadius: radii.lg },
  heroAgeBadge: { position: 'absolute', left: 5, bottom: 5, backgroundColor: 'rgba(12,35,49,0.72)', borderRadius: radii.pill, paddingHorizontal: 7, paddingVertical: 2 },
  heroStats: { flex: 1, gap: 8, justifyContent: 'center', minWidth: 0 },
  heroBadgesRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  heroSpeciesTag: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 2, minWidth: 0 },
  heroTypeBadge: { borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  heroTypeBadgeChair: { backgroundColor: palette.brand[100], borderColor: palette.brand[200] },
  heroTypeBadgeLayer: { backgroundColor: color.accent[50], borderColor: color.accent[100] },
  heroBuildingBadge: { borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, backgroundColor: palette.brand[50], borderColor: palette.brand[200] },
  heroBuildingText: { maxWidth: 150, flexShrink: 1 },
  heroTitleSep: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(12,35,49,0.18)' },
  heroMainRow: { flexDirection: 'row', alignItems: 'stretch' },
  heroStatSep: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: 'rgba(12,35,49,0.12)', marginVertical: 2 },
  heroStat: { flex: 1, gap: 1, alignItems: 'center' },
  heroValue: { fontSize: 20, lineHeight: 24 },
  heroValueSmall: { fontSize: 16, lineHeight: 20 },
  healthStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(12,35,49,0.08)' },
  healthScorePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: palette.surface },
  heroActions: { flexDirection: 'row', gap: 8, marginLeft: 'auto', flexShrink: 1, flexWrap: 'wrap', justifyContent: 'flex-end' },
  heroPassportRow: { marginTop: 4, alignItems: 'flex-start' },

  // Cycle progress
  cycleCard: { gap: 6 },
  cycleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: palette.surfaceAlt, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },

  // Mini chart
  miniChartCard: { gap: 10 },

  // Water compact
  waterStatRow: { flexDirection: 'row', gap: 12 },
  waterStat: { flex: 1, gap: 2 },

  // P&L
  pnlTopline: { flexDirection: 'row', alignItems: 'flex-end', gap: 20 },
  pnlNet: { flex: 1, gap: 2 },
  pnlGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, borderTopWidth: 1, borderTopColor: color.border, paddingTop: 10 },

  // Main tabs
  tabRow: { flexDirection: 'row', gap: 4, marginTop: 12, marginBottom: 8 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderRadius: radii.md, backgroundColor: palette.surfaceAlt },
  tabBtnActive: { backgroundColor: palette.brand[50], borderWidth: 1, borderColor: palette.brand[200] },

  // Metrics grid
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  overviewStack: { gap: 12 },

  // History filter
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radii.pill, backgroundColor: palette.surfaceAlt, borderWidth: 1, borderColor: palette.border },
  filterBtnActive: { backgroundColor: palette.brand[600], borderColor: palette.brand[600] },
  filterBtnPressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },

  // Timeline
  timeline: { gap: 0 },
  timelineItem: { flexDirection: 'row', position: 'relative', paddingLeft: 20, paddingBottom: 16 },
  timelineDot: { position: 'absolute', left: 0, top: 4, width: 10, height: 10, borderRadius: 5 },
  timelineLine: { position: 'absolute', left: 4, top: 14, bottom: 0, width: 2, backgroundColor: palette.border },
  timelineContent: { flex: 1, gap: 2 },
  timelineHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  // Health
  healthHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  healthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  healthStat: { flexBasis: '45%', gap: 2 },

  // Œufs
  eggCard: { gap: 10 },
  eggEmpty: { alignItems: 'center', gap: 4, paddingVertical: 12 },
  eggSegBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: palette.accent[50] },
  eggSegFill: { height: '100%' },
  eggRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eggRowDot: { width: 10, height: 10, borderRadius: 5 },
  eggRowPct: { width: 40, textAlign: 'right' },
  eggMiniBar: { height: 4, borderRadius: 999, overflow: 'hidden', backgroundColor: palette.border },
  eggMiniFill: { height: 4, borderRadius: 999 },

  // Tips
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slimTipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },

  // Events
  eventHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  // Legend
  legend: { overflow: 'hidden' },
  legendRow: { paddingHorizontal: 14 },
  legendBorder: { borderBottomWidth: 1, borderBottomColor: color.border },
  legendMain: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
});

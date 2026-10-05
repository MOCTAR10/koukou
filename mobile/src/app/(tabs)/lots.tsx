import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery, useQueryClient, useQueries, keepPreviousData } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Bird,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  ChevronUp,
  Clock,
  Coins,
  Droplets,
  Egg,
  Gauge,
  HeartPulse,
  Info,
  Layers,
  ListOrdered,
  PackageCheck,
  Plus,
  Receipt,
  RotateCcw,
  Scale,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  SortAsc,
  SortDesc,
  Stethoscope,
  Syringe,
  TrendingDown,
  TrendingUp,
  Wallet,
  Warehouse,
  Wheat,
  X,
  ClipboardList,
} from 'lucide-react-native';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { PulsarDot } from '@/components/ui/PulsarDot';
import { Sheet } from '@/components/ui/Sheet';
import { PeriodBar, periodWindow, toDateStr, type PeriodBarHandle, type PeriodWindow } from '@/components/ui/PeriodBar';
import { color, fmt, palette, radii } from '@/constants/theme';
import { useAuth } from '@/auth/AuthContext';
import { useLiveMinute } from '@/hooks/useLiveMinute';
import { fetchBatches, fetchBatchHealth, fetchBuildings, fetchExpenses, fetchOrders, fetchProphylaxis, fetchProtocols, fetchRentabiliteBatch, fetchRentabiliteOverview, fetchSales, fetchSanitaryProgram, fetchSlaughterOrders, fetchTreatments } from '@/api';
import { completeProphylaxis } from '@/api/mutations';
import { invalidateFarmQueries } from '@/api/invalidate';
import type { BatchHealth, BatchPnl, BatchStatus, BatchType, BatchWithMetrics, Expense, OrderCanal, OrderFull, OrderStatus, OverviewPnl, ProphylaxisEvent, ProtocolStep, ReadyReason, SaleSummary, SanitaryProtocol, SanitaryProtocolWithSteps, Species, TreatmentRecord } from '@/api/types';
import { speciesLabel } from '@/api/format';
import { SPECIES_IMAGES } from '@/constants/speciesImages';
import { BREED_IMAGES, breedImageForLot } from '@/constants/breedImages';
import { normalizeMortalityStatus } from '@/constants/health';
import { lotSlaughterSummary, type LotSlaughterSummary } from '@/utils/slaughterInsights';
import { SlaughterBadge, SlaughterInfoCard } from '@/components/slaughter/SlaughterLotInfo';
import { CreateLotSheet } from '@/components/CreateLotSheet';
import { useCreateCenter } from '@/components/create/CreateCenter';
import { useQuickCapture } from '@/components/capture/QuickCaptureProvider';

// ── Filters ──
type FilterType = 'all' | 'active' | 'selling' | 'chair' | 'layer';
const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'active', label: 'Actifs' },
  { key: 'selling', label: 'En vente' },
  { key: 'chair', label: 'Chair' },
  { key: 'layer', label: 'Pondeuses' },
];

// ── Sort ──
type SortKey = 'name' | 'age' | 'mortality' | 'fcr' | 'liveCount' | 'health';
type SortDir = 'asc' | 'desc';
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Nom' },
  { key: 'age', label: 'Âge' },
  { key: 'mortality', label: 'Mortalité' },
  { key: 'fcr', label: 'IC' },
  { key: 'liveCount', label: 'Vivants' },
  { key: 'health', label: 'Santé' },
];

// ── Breed cycle lengths (days) ──
const CHAIR_CYCLE_DAYS = 84; // ~12 weeks
const LAYER_CYCLE_DAYS = 504; // ~72 weeks
const FINANCE_WINDOW_DAYS = 30; // fenêtre financière par défaut

// ── Production stage (stade) thresholds ──
const CHAIR_READY_DAYS = 35; // matches backend VENTE_AGE_MIN_DAYS
const LAYER_DEMARRAGE_DAYS = 56; // ~8 weeks poussinière
const LAYER_PONTE_DAYS = 134; // ~19 weeks
const LAYER_REFORME_DAYS = 420; // ~60 weeks

type StageTone = 'brand' | 'accent' | 'green' | 'amber';
function batchStage(b: { type: BatchType; status: BatchStatus; metrics: { ageDays: number } }): { label: string; tone: StageTone } {
  if (b.status === 'EN_VENTE') return { label: 'Prêt à la vente', tone: 'green' };
  const age = b.metrics.ageDays;
  if (b.type === 'PONDEUSE') {
    if (age <= LAYER_DEMARRAGE_DAYS) return { label: 'Démarrage', tone: 'brand' };
    if (age < LAYER_PONTE_DAYS) return { label: 'Croissance', tone: 'brand' };
    if (age < LAYER_REFORME_DAYS) return { label: 'Ponte', tone: 'accent' };
    return { label: 'Réforme', tone: 'amber' };
  }
  if (age < 14) return { label: 'Démarrage', tone: 'brand' };
  if (age < 28) return { label: 'Croissance', tone: 'brand' };
  if (age < CHAIR_READY_DAYS) return { label: 'Finition', tone: 'accent' };
  return { label: 'Prêt à la vente', tone: 'green' };
}

// ── Libellé parlant pour le lot (sous-titre de la carte) ──
function kindLabel(b: { type: BatchType; species?: Species | null; customSpecies?: string | null }): string {
  const customName = b.species === 'AUTRE' && b.customSpecies ? b.customSpecies : null;
  const base = customName ?? speciesLabel(b.species ?? 'POULET');
  const group = b.type === 'PONDEUSE' ? 'pondeuses' : 'de chair';
  if (customName) return `${base} ${group}`;
  const plural = base.toLowerCase().endsWith('s') ? base : `${base}s`;
  return `${plural} ${group}`;
}

// ── Pillule unique la plus décisive (une seule, priorisée, en français) ──
type StatusPillTone = 'green' | 'red' | 'amber' | 'accent';
type StatusPill = { tone: StatusPillTone; icon: typeof BadgeCheck; label: string } | null;

const STATUS_PILL_TONES: Record<StatusPillTone, { fg: string; bg: string; border: string }> = {
  green: { fg: palette.green[700], bg: palette.green[50], border: palette.green[200] },
  red: { fg: palette.red[600], bg: palette.red[50], border: palette.red[200] },
  amber: { fg: palette.amber[700], bg: palette.amber[50], border: palette.amber[200] },
  accent: { fg: palette.accent[700], bg: palette.accent[50], border: palette.accent[200] },
};

const STAGE_CHIP_TONES: Record<StageTone, { fg: string; bg: string; border: string }> = {
  brand: { fg: palette.brand[700], bg: palette.brand[50], border: palette.brand[200] },
  accent: { fg: palette.accent[700], bg: palette.accent[50], border: palette.accent[200] },
  green: { fg: palette.green[700], bg: palette.green[50], border: palette.green[200] },
  amber: { fg: palette.amber[700], bg: palette.amber[50], border: palette.amber[200] },
};

function batchStatusPill(b: BatchWithMetrics): StatusPill {
  const m = b.metrics;
  if (b.status === 'EN_VENTE') return { tone: 'green', icon: BadgeCheck, label: 'En vente' };
  if (m.readyReason === 'SANITARY') return { tone: 'red', icon: AlertTriangle, label: 'Vente suspendue — contre-indication sanitaire' };
  if (m.readyReason === 'FCR') return { tone: 'amber', icon: Info, label: 'IC au-dessus du seuil de vente' };
  if (m.readyForSale && m.readyReason === 'READY') return { tone: 'green', icon: BadgeCheck, label: 'Prêt à vendre' };
  if (m.status === 'ROUGE') return { tone: 'red', icon: AlertTriangle, label: 'Indicateurs critiques' };
  if (m.status === 'JAUNE') return { tone: 'amber', icon: Info, label: 'À surveiller' };
  return null;
}

// ── Helpers (module scope — no Date.now/Math.random inside render) ──
function dateFr(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${Number(d)}/${Number(m)}/${y}` : iso;
}

function compactFcfa(n: number): string {
  if (n >= 1_000_000) {
    const v = (n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
    return `${v}M`;
  }
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return n.toLocaleString('fr-FR');
}

function StarLabel({ label }: { label: string }) {
  const parts = label.split('★');
  if (parts.length === 1) {
    return <AppText size="caption" color="faint" numberOfLines={1}>{label}</AppText>;
  }
  return (
    <AppText size="caption" color="faint" numberOfLines={1}>
      {parts.map((p, i) => (
        <Text key={i}>
          {p}
          {i < parts.length - 1 ? <Text style={{ color: palette.amber[500] }}>★</Text> : null}
        </Text>
      ))}
    </AppText>
  );
}

function recentSales(s?: SaleSummary[]): SaleSummary[] {
  return [...(s ?? [])].sort((a, b) => b.saleDate.localeCompare(a.saleDate)).slice(0, 5);
}

function recentExpenses(e?: Expense[]): Expense[] {
  return [...(e ?? [])].sort((a, b) => b.expenseDate.localeCompare(a.expenseDate)).slice(0, 5);
}

function openOrders(o?: OrderFull[]): OrderFull[] {
  return (o ?? []).filter((x) => x.status === 'PENDING' || x.status === 'CONFIRMED');
}

function toFmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Fenêtre précédente de même longueur (jour-à-jour pour une vue "Jour", période-à-période sinon). */
function shiftWindow(fromISO: string | undefined, toISO: string | undefined): { from: string | undefined; to: string | undefined } {
  if (!fromISO || !toISO) return { from: undefined, to: undefined };
  const [fy, fm, fd] = fromISO.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = toISO.slice(0, 10).split('-').map(Number);
  const from = new Date(fy, fm - 1, fd);
  const to = new Date(ty, tm - 1, td);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const prevTo = new Date(from.getTime() - 86_400_000);
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * 86_400_000);
  return { from: toFmtDate(prevFrom), to: toFmtDate(prevTo) };
}

function deltaPct(cur: number | undefined, prev: number | undefined): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'À confirmer',
  CONFIRMED: 'Confirmée',
  LIVRE: 'Livrée',
  CANCELLED: 'Annulée',
};

const CANAL_LABELS: Record<OrderCanal, string> = {
  FERME: 'Ferme',
  LIVRAISON: 'Livraison',
  PRECOMMANDE: 'Précommande',
};

const READY_REASON_LABELS: Record<ReadyReason, string> = {
  READY: 'Prêt à la vente',
  TOO_YOUNG: 'Trop jeune (âge minimum 35 jours)',
  FCR: 'Indice de consommation au-dessus du seuil de vente',
  SANITARY: 'Contre-indication sanitaire',
  N_A: 'Non applicable (pondeuses en ponte normale)',
};

// ── Soins à afficher en mode compact (vaccin / médicament / retard) ──
const CARE_LABELS: Record<string, string> = {
  VACCIN: 'Vaccin', MEDICAMENT: 'Médicament', VITAMINE: 'Vitamine', ANTIBIOTIQUE: 'Antibiotique',
};
const CARE_WINDOW_DAYS = 7; // soins PLANIFIÉS dans les N prochains jours → chip "à venir"

type CareChipData = { tone: 'red' | 'amber'; label: string; eventId?: string };

const careLabel = (careType: string) => CARE_LABELS[careType] ?? 'Soin';

// Sépare l'action (« Vaccin en retard », « Vaccin à prévoir ») du détail
// (« J21 (Gumboro) », « 2026-09-20 · +1 ») pour un affichage sur deux lignes.
const splitCareLabel = (label: string): { action: string; detail: string } => {
  const i = label.indexOf(' · ');
  return i === -1 ? { action: label, detail: '' } : { action: label.slice(0, i), detail: label.slice(i + 3) };
};

// Les dates sanitaires sont stockées en UTC (YYYY-MM-DD) côté serveur.
const fromUtc = (epochMs: number) => new Date(epochMs).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

function careChips(prophylaxis: ProphylaxisEvent[] | undefined): CareChipData[] {
  const chips: CareChipData[] = [];
  if (!prophylaxis || prophylaxis.length === 0) return chips;

  // La référence « aujourd'hui » est UTC (les dates sont stockées en UTC côté
  // serveur) ; l'état « en retard » fait foi du statut serveur (EN_RETARD,
  // bascule après le délai de grâce prophylaxie_retard_warn_days) — pas d'une
  // dérivation locale.
  const today = fromUtc(Date.now());
  const horizon = fromUtc(Date.now() + CARE_WINDOW_DAYS * 86_400_000);

  const late = prophylaxis.filter((p) => p.status === 'EN_RETARD');
  if (late.length > 0) {
    const first = late.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0];
    chips.push({ tone: 'red', eventId: first.id, label: late.length > 1 ? `${late.length} soins en retard` : `${careLabel(first.careType)} en retard` });
  }

  const upcoming = prophylaxis.filter(
    (p) => p.status === 'PLANIFIE' && p.scheduledDate >= today && p.scheduledDate <= horizon,
  );
  if (upcoming.length > 0) {
    const first = upcoming.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0];
    chips.push({
      tone: 'amber',
      eventId: first.id,
      label: upcoming.length > 1 ? `${careLabel(first.careType)} à faire · ${dateFr(first.scheduledDate)} +${upcoming.length - 1}` : `${careLabel(first.careType)} à faire · ${dateFr(first.scheduledDate)}`,
    });
  }
  return chips;
}

// ── Protocole → soins dus / à venir (couvre les lots sans soins planifiés) ──

function defaultProtocolFor(
  protocols: SanitaryProtocol[] | undefined,
  species: string,
  type: BatchType,
): SanitaryProtocol | undefined {
  return (
    protocols?.find((p) => p.species === species && p.type === type && p.isDefault) ??
    protocols?.find((p) => p.species === species && p.type === type) ??
    protocols?.find((p) => p.type === type && p.isDefault) ??
    protocols?.find((p) => p.type === type)
  );
}

function protocolCareChips(
  program: SanitaryProtocolWithSteps | undefined,
  ageDays: number,
  prophylaxis: ProphylaxisEvent[] | undefined,
  treatments: TreatmentRecord[] | undefined,
): CareChipData[] {
  if (!program) return [];
  const events = prophylaxis ?? [];
  // Une étape est « couverte » dès qu'un soin la mentionne : FAIT (réalisé) ou
  // simplement PLANIFIÉ/EN_RETARD (un calendrier existe, plus de chip « à
  // réaliser » — le suivi passe à la liste des soins).
  const coveredByStep = new Set(
    events
      .filter((p) => p.protocolStepId)
      .map((p) => p.protocolStepId as string),
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

  const chips: CareChipData[] = [];
  if (due.length > 0) {
    const first = due[0];
    chips.push({
      tone: 'red',
      label: `${careLabel(first.careType)} à réaliser · J${first.dayFrom} (${first.name})`,
    });
  }
  if (soon.length > 0) {
    const first = soon[0];
    chips.push({
      tone: 'amber',
      label: soon.length > 1
        ? `${careLabel(first.careType)} à prévoir · J${first.dayFrom} +${soon.length - 1}`
        : `${careLabel(first.careType)} à prévoir · J${first.dayFrom} (${first.name})`,
    });
  }
  return chips;
}

// ── Insight santé : prochain vaccin / médicament ──
type CareInsight = { tone: 'red' | 'amber' | 'neutral'; main: string; sub: string };
const MEDICAL_CARE_TYPES = new Set(['VACCIN', 'MEDICAMENT', 'ANTIBIOTIQUE']);

function nextCareInsight(
  batch: { integrationDate: string; metrics: { ageDays: number } },
  prophylaxis: ProphylaxisEvent[] | undefined,
  treatments: TreatmentRecord[] | undefined,
  program: SanitaryProtocolWithSteps | undefined,
): CareInsight | null {
  const events = prophylaxis ?? [];
  const medical = events.filter((p) => MEDICAL_CARE_TYPES.has(p.careType));
  const integration = batch.integrationDate ? batch.integrationDate.slice(0, 10) : undefined;
  const today = fromUtc(Date.now());
  const jOf = (iso: string) => (integration ? daysBetween(integration, iso) + 1 : null);
  const sorted = (arr: ProphylaxisEvent[]) => [...arr].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  const late = sorted(medical.filter((p) => p.status === 'EN_RETARD'));
  if (late[0]) {
    return { tone: 'red', main: `${careLabel(late[0].careType)} en retard · ${late[0].name}`, sub: 'à faire dès que possible' };
  }

  const pending = sorted(medical.filter((p) => p.status === 'PLANIFIE' && p.scheduledDate >= today));
  if (pending[0]) {
    const n = pending[0];
    const j = jOf(n.scheduledDate);
    return {
      tone: 'amber',
      main: `${careLabel(n.careType)} à prévoir · ${n.name}`,
      sub: j != null ? `programmé à J${j} · ${dateFr(n.scheduledDate)}` : `programmé le ${dateFr(n.scheduledDate)}`,
    };
  }

  // Aucun soin dû sur le calendrier → prochaine étape non couverte du protocole appliqué.
  if (program) {
    const coveredByStep = new Set(events.filter((p) => p.protocolStepId).map((p) => p.protocolStepId as string));
    const coveredNames = new Set(
      [...events.map((p) => p.name), ...(treatments ?? []).map((t) => t.productName)].map((n) => n.trim().toLowerCase()),
    );
    const isCovered = (s: ProtocolStep) => coveredByStep.has(s.id) || coveredNames.has(s.name.trim().toLowerCase());
    const next = program.steps
      .filter((s) => s.active && MEDICAL_CARE_TYPES.has(s.careType) && !isCovered(s) && s.dayFrom > batch.metrics.ageDays)
      .sort((a, b) => a.dayFrom - b.dayFrom)[0];
    if (next) {
      return {
        tone: 'neutral',
        main: 'Aucun vaccin requis aujourd’hui',
        sub: `prochain : ${careLabel(next.careType)} ${next.name} · J${next.dayFrom}`,
      };
    }
  }

  return { tone: 'neutral', main: 'Aucun soin planifié', sub: 'toutes les vaccinations programmées sont à jour' };
}

// ── Vue d'ensemble : agrégats moyens/par espèces sur une liste de lots ──
// (liste en direct OU reconstituée à une date via ?asOf=)
function buildOverviewSummary(list: BatchWithMetrics[]): OverviewSummary {
  if (list.length === 0) return null;
  const totalBirds = list.reduce((s, b) => s + b.metrics.liveCount, 0);
  const avgOf = (pick: (m: BatchWithMetrics['metrics']) => number | null | undefined) => {
    const vals = list.map((b) => pick(b.metrics)).filter((v): v is number => v != null);
    return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };
  const avgFcr = avgOf((m) => m.fcr);
  const avgGmq = avgOf((m) => m.gmqGramsPerDay);
  const avgLayRate = avgOf((m) => m.layRatePercent);
  const avgMortality = avgOf((m) => m.mortalityPercent);
  const activeCount = list.filter((b) => b.status === 'ACTIF').length;
  const sellingCount = list.filter((b) => b.status === 'EN_VENTE').length;
  const labelByKey = new Map<string, string>();
  const birdsByKey = new Map<string, number>();
  const eggsByKey = new Map<string, number>();
  const feedByKey = new Map<string, number>();
  const laySumByKey = new Map<string, { sum: number; n: number }>();
  for (const b of list) {
    const key = `${b.species ?? 'POULET'}|${b.type}`;
    if (!labelByKey.has(key)) {
      labelByKey.set(key, kindLabel(b));
    }
    birdsByKey.set(key, (birdsByKey.get(key) ?? 0) + b.metrics.liveCount);
    eggsByKey.set(key, (eggsByKey.get(key) ?? 0) + (b.metrics.eggsCollectedTotal ?? 0));
    feedByKey.set(key, (feedByKey.get(key) ?? 0) + (b.metrics.totalFeedKg ?? 0));
    const lr = b.metrics.layRatePercent;
    if (lr != null) {
      const cur = laySumByKey.get(key) ?? { sum: 0, n: 0 };
      cur.sum += lr;
      cur.n += 1;
      laySumByKey.set(key, cur);
    }
  }
  const speciesGroups = [...labelByKey.entries()].map(([key, label]) => {
    const lay = laySumByKey.get(key);
    return {
      label,
      birds: birdsByKey.get(key) ?? 0,
      eggs: eggsByKey.get(key) ?? 0,
      feedKg: feedByKey.get(key) ?? 0,
      layRate: lay && lay.n > 0 ? lay.sum / lay.n : null,
    };
  });
  const totalEggs = [...eggsByKey.values()].reduce((s, v) => s + v, 0);
  const totalFeedKg = [...feedByKey.values()].reduce((s, v) => s + v, 0);
  const birdDays = list.reduce((s, b) => s + Math.max(0, b.metrics.liveCount) * Math.max(1, b.metrics.ageDays), 0);
  const feedPerBirdDay = totalFeedKg > 0 && birdDays > 0 ? (totalFeedKg * 1000) / birdDays : null;
  const readyBatches = list.filter((b) => b.metrics.readyForSale);
  const readyCount = readyBatches.length;
  const readyBirds = readyBatches.reduce((s, b) => s + b.metrics.liveCount, 0);
  const redCount = list.filter((b) => b.metrics.status === 'ROUGE').length;
  const yellowCount = list.filter((b) => b.metrics.status === 'JAUNE').length;
  return { totalBirds, totalEggs, totalFeedKg, feedPerBirdDay, avgMortality, avgFcr, avgGmq, avgLayRate, count: list.length, activeCount, sellingCount, speciesGroups, readyCount, readyBirds, redCount, yellowCount };
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════

export default function LotsScreen() {
  const router = useRouter();
  const { farmId } = useAuth();
  const { openCreateBuilding } = useCreateCenter();
  const batches = useQuery({ queryKey: ['batches', farmId], queryFn: () => fetchBatches(farmId) });
  const buildings = useQuery({ queryKey: ['buildings', farmId], queryFn: () => fetchBuildings(farmId) });

  // ── State ──
  const [filter, setFilter] = useState<FilterType>('all');
  const [speciesFilter, setSpeciesFilter] = useState<Species | 'all'>('all');
  const [healthFilter, setHealthFilter] = useState<'all' | 'VERT' | 'JAUNE' | 'ROUGE'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('age');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showCreate, setShowCreate] = useState(false);
  const [detailLotId, setDetailLotId] = useState<string | null>(null);
  const [eggLotId, setEggLotId] = useState<string | null>(null);
  const [showOverview, setShowOverview] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showFinanceSheet, setShowFinanceSheet] = useState(false);
  const [finMode, setFinMode] = useState<'jour' | 'periode'>('jour');
  const [finHelpOpen, setFinHelpOpen] = useState(false);
  const [period, setPeriod] = useState<PeriodWindow>(() => periodWindow(FINANCE_WINDOW_DAYS));
  const [search, setSearch] = useState('');
  const firstWindowRef = useRef(true);
  const periodBarRef = useRef<PeriodBarHandle>(null);

  const handleFinanceApplied = (source: 'single' | 'range') => {
    if (source === 'single') setFinMode('jour');
    else setFinMode('periode');
  };

  const openFinanceSheet = () => {
    Haptics.selectionAsync().catch(() => {});
    setShowFinanceSheet(true);
  };

  const handlePeriodChange = (w: PeriodWindow) => {
    setPeriod(w);
    if (firstWindowRef.current) {
      firstWindowRef.current = false;
      return;
    }
    if (finMode === 'periode') {
      const todayStr = toDateStr(new Date());
      if (w.isFiltered && w.from != null && w.from === w.to && w.to === todayStr) {
        setFinMode('jour');
      }
    }
  };

  const openCreate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setShowCreate(true);
  };

  const periodLabel = period.span === 'all'
    ? (period.isFiltered ? 'Tout historique' : 'Tout historique · en direct')
    : period.isFiltered
      ? `Du ${dateFr(period.from ?? '')} au ${dateFr(period.to ?? '')}`
      : `Du ${dateFr(period.from ?? '')} au ${dateFr(period.to ?? '')} · en direct`;
  const finLabel = finMode === 'jour'
    ? period.isFiltered
      ? `Jour du ${dateFr(period.to ?? '')}`
      : `Aujourd'hui ★ · ${dateFr(period.to ?? '')}`
    : periodLabel;

  // ── Finance data (période ou jour actif) ──
  const finFrom = finMode === 'jour' ? period.to : period.from;
  const finTo = period.to;
  const pnl = useQuery({
    queryKey: ['rentabilite-overview', farmId, finMode, finFrom, finTo],
    queryFn: () => fetchRentabiliteOverview(farmId, finFrom, finTo),
    placeholderData: keepPreviousData,
  });
  const salesQ = useQuery({
    queryKey: ['sales', farmId, finMode, finFrom, finTo],
    queryFn: () => fetchSales(farmId, finFrom, finTo),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const expensesQ = useQuery({
    queryKey: ['expenses', farmId, finMode, finFrom, finTo],
    queryFn: () => fetchExpenses(farmId, finFrom, finTo),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const ordersQ = useQuery({ queryKey: ['orders', farmId], queryFn: () => fetchOrders(farmId), staleTime: 30_000 });

  // ── Comparaison à la fenêtre précédente (même longueur) ──
  const prevWin = useMemo(() => shiftWindow(finFrom ?? undefined, finTo), [finFrom, finTo]);
  const prevPnl = useQuery({
    queryKey: ['rentabilite-overview-prev', farmId, finMode, prevWin.from, prevWin.to],
    queryFn: () => fetchRentabiliteOverview(farmId, prevWin.from, prevWin.to),
    enabled: prevWin.from != null,
    placeholderData: keepPreviousData,
  });
  const dEncaissPct = deltaPct(pnl.data?.collectedFcfa, prevPnl.data?.collectedFcfa);
  const dNetPct = deltaPct(pnl.data?.netFcfa, prevPnl.data?.netFcfa);
  const hasCompare = prevPnl.data != null && (dEncaissPct != null || dNetPct != null);

  useLiveMinute(() => {
    if (period.isFiltered) return;
    void batches.refetch();
    void ordersQ.refetch();
    void pnl.refetch();
    void salesQ.refetch();
    void expensesQ.refetch();
  });

  // ── Filter & Sort ──
  const applyFilter = useCallback(
    (list: BatchWithMetrics[]): BatchWithMetrics[] => {
      let result = list;
      if (filter === 'active') result = result.filter((b) => b.status === 'ACTIF');
      if (filter === 'selling') result = result.filter((b) => b.status === 'EN_VENTE');
      if (filter === 'chair') result = result.filter((b) => b.type === 'CHAIR');
      if (filter === 'layer') result = result.filter((b) => b.type === 'PONDEUSE');
      if (speciesFilter !== 'all') result = result.filter((b) => b.species === speciesFilter);
      if (healthFilter !== 'all') result = result.filter((b) => b.metrics.status === healthFilter);
      return result;
    },
    [filter, speciesFilter, healthFilter],
  );
  const filteredList = useMemo(() => applyFilter(batches.data ?? []), [applyFilter, batches.data]);

  // ── Filter counts (sur la liste complète, indépendants des filtres actifs) ──
  const filterCounts = useMemo(() => {
    const all = batches.data ?? [];
    return {
      total: all.length,
      active: all.filter((b) => b.status === 'ACTIF').length,
      selling: all.filter((b) => b.status === 'EN_VENTE').length,
      chair: all.filter((b) => b.type === 'CHAIR').length,
      layer: all.filter((b) => b.type === 'PONDEUSE').length,
      green: all.filter((b) => b.metrics.status === 'VERT').length,
      yellow: all.filter((b) => b.metrics.status === 'JAUNE').length,
      red: all.filter((b) => b.metrics.status === 'ROUGE').length,
    };
  }, [batches.data]);
  const speciesCounts = useMemo(() => {
    const counts: Partial<Record<Species, number>> = {};
    for (const b of batches.data ?? []) {
      counts[b.species] = (counts[b.species] ?? 0) + 1;
    }
    return counts;
  }, [batches.data]);
  const availableSpecies = useMemo(
    () => (Object.entries(speciesCounts).filter(([, n]) => n > 0).map(([s]) => s) as Species[]),
    [speciesCounts],
  );

  const shown = useMemo(() => {
    let list = filteredList;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((b) => (b.batchName ?? '').toLowerCase().includes(q) || (b.breedName ?? '').toLowerCase().includes(q));
    }

    list = [...list].sort((a, b) => {
      const mA = a.metrics;
      const mB = b.metrics;
      let cmp = 0;
      if (sortKey === 'name') cmp = (a.batchName ?? '').localeCompare(b.batchName ?? '');
      else if (sortKey === 'age') cmp = mA.ageDays - mB.ageDays;
      else if (sortKey === 'mortality') cmp = mA.mortalityPercent - mB.mortalityPercent;
      else if (sortKey === 'fcr') cmp = (mA.fcr ?? 0) - (mB.fcr ?? 0);
      else if (sortKey === 'liveCount') cmp = mA.liveCount - mB.liveCount;
      else if (sortKey === 'health') cmp = (mA.status === 'VERT' ? 3 : mA.status === 'JAUNE' ? 2 : 1) - (mB.status === 'VERT' ? 3 : mB.status === 'JAUNE' ? 2 : 1);
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return list;
  }, [filteredList, sortKey, sortDir, search]);

  // ── Slim summary totals (Vue d'ensemble, sur le filtre — pas la recherche) ──
  const summary = useMemo(() => buildOverviewSummary(filteredList), [filteredList]);

  // ── Vue d'ensemble datée (option B) : quand une période/journal est filtré,
  // la sheet reconstruit le cheptel à cette date via GET /batches?asOf= — la
  // Finance/Revenus reste pilotée par la fenêtre PeriodBar. ──
  const overviewLive = !period.isFiltered;
  const overviewDate = period.to ?? fromUtc(Date.now());
  const overviewBatches = useQuery({
    queryKey: ['batches', farmId, 'overview', overviewLive ? 'live' : overviewDate],
    queryFn: () => fetchBatches(farmId, overviewLive ? undefined : overviewDate),
    enabled: !overviewLive,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  const overviewList = useMemo(() => {
    if (overviewLive) return filteredList;
    return applyFilter(overviewBatches.data ?? []);
  }, [overviewLive, filteredList, applyFilter, overviewBatches.data]);
  const overviewSummary = useMemo(() => buildOverviewSummary(overviewList), [overviewList]);

  // ── Farm-wide stats (tuiles, indépendantes du filtre) ──
  const farmStats = useMemo(() => {
    const list = batches.data ?? [];
    const totalBirds = list.reduce((s, b) => s + b.metrics.liveCount, 0);
    const totalEggs = list.reduce((s, b) => s + (b.metrics.eggsCollectedTotal ?? 0), 0);
    const chairCount = list.filter((b) => b.type === 'CHAIR').reduce((s, b) => s + b.metrics.liveCount, 0);
    const pondeuseCount = list.filter((b) => b.type === 'PONDEUSE').reduce((s, b) => s + b.metrics.liveCount, 0);
    const pondeuseBatches = list.filter((b) => b.type === 'PONDEUSE' && b.metrics.layRatePercent != null);
    const pondeuseLive = pondeuseBatches.reduce((s, b) => s + b.metrics.liveCount, 0);
    const avgLayRatePondeuse = pondeuseLive > 0
      ? pondeuseBatches.reduce((s, b) => s + (b.metrics.layRatePercent ?? 0) * b.metrics.liveCount, 0) / pondeuseLive
      : null;
    const activeCount = list.filter((b) => b.status === 'ACTIF').length;
    const sellingCount = list.filter((b) => b.status === 'EN_VENTE').length;
    const readyBirds = list.filter((b) => b.metrics.readyForSale).reduce((s, b) => s + b.metrics.liveCount, 0);
    const totalAlveoles = Math.floor(totalEggs / 30);
    return { totalBirds, totalEggs, chairCount, pondeuseCount, avgLayRatePondeuse, activeCount, sellingCount, readyBirds, totalAlveoles };
  }, [batches.data]);

  // Empty-state helpers
  const hasAnyBatch = (batches.data?.length ?? 0) > 0;
  const hasBuilding = (buildings.data?.length ?? 0) > 0;
  const filterLabel = FILTERS.find((f) => f.key === filter)?.label.toLowerCase() ?? 'filtre';
  const hasAdvancedFilters = speciesFilter !== 'all' || healthFilter !== 'all';

  return (
    <Screen
      bottomPad={120}
      refreshing={batches.isFetching}
      onRefresh={() => void batches.refetch()}
      header={
        <>
          {/* ── HEADER (fixe, comme Accueil) ── */}
          <ScreenHeader
            title="Lots"
            subtitle={`${batches.data?.length ?? 0} lot(s) · suivi zootechnique`}
            left={<Image source={require('@/assets/images/logo-nav.png')} style={styles.headerLogo} accessibilityLabel="Logo KouKou" />}
            right={
              <Pressable onPress={openCreate} style={styles.createBtn} accessibilityRole='button'>
                <Plus size={18} color={palette.brand[50]} />
                <AppText size='small' weight='bold' color='surface'>Nouveau</AppText>
              </Pressable>
            }
          />

          {/* ── DATE BAR (fixe) : en direct par défaut, décalage par jour, picker date & heure ── */}
          <PeriodBar ref={periodBarRef} defaultSpan={FINANCE_WINDOW_DAYS} onChange={handlePeriodChange} onApplied={handleFinanceApplied} />
        </>
      }
    >
      {/* ── STATS TILES (ferme) — au-dessus de la finance ── */}
      <View style={styles.slimTileRow}>
        <View style={styles.slimTile}>
          <View style={styles.slimTileHead}>
            <View style={styles.slimTileTitleWrap}>
              <View style={[styles.slimTileIcon, { backgroundColor: 'rgba(96, 160, 64, 0.12)' }]}>
                <Bird size={15} color={palette.green[600]} />
              </View>
              <AppText style={styles.slimTileTitle} color={palette.green[700]}>Volaille</AppText>
            </View>
            <View style={[styles.slimTileCount, { borderColor: palette.green[600] + '45', backgroundColor: palette.green[600] + '12' }]}>
              <AppText style={styles.slimTileCountText} color={palette.green[700]}>{farmStats.activeCount + farmStats.sellingCount} lots</AppText>
            </View>
          </View>
          <AppText style={styles.slimTileValue} color={palette.green[700]}>{fmt(farmStats.totalBirds)}</AppText>
          <AppText style={styles.slimTileCaption} color="muted">
            {farmStats.readyBirds > 0
              ? `oiseaux vivants · ${fmt(farmStats.readyBirds)} prêts`
              : 'oiseaux vivants'}
          </AppText>
          <View style={styles.slimTileDivider} />
          {farmStats.totalBirds > 0 ? (
            <>
              <View style={styles.slimTileBar}>
                {farmStats.chairCount > 0 && (
                  <View style={[styles.slimTileBarSeg, { flex: farmStats.chairCount, backgroundColor: palette.green[500] }]} />
                )}
                {farmStats.pondeuseCount > 0 && (
                  <View style={[styles.slimTileBarSeg, { flex: farmStats.pondeuseCount, backgroundColor: palette.accent[500] }]} />
                )}
                {farmStats.chairCount === 0 && farmStats.pondeuseCount === 0 && (
                  <View style={[styles.slimTileBarSeg, { flex: 1, backgroundColor: palette.border }]} />
                )}
              </View>
              <View style={styles.slimTileLegend}>
                {farmStats.chairCount > 0 && (
                  <View style={styles.slimTileLegendItem}>
                    <View style={[styles.slimTileLegendDot, { backgroundColor: palette.green[500] }]} />
                    <AppText style={styles.slimTileLegendText} color={palette.green[700]}>{fmt(farmStats.chairCount)} chair</AppText>
                  </View>
                )}
                {farmStats.pondeuseCount > 0 && (
                  <View style={styles.slimTileLegendItem}>
                    <View style={[styles.slimTileLegendDot, { backgroundColor: palette.accent[500] }]} />
                    <AppText style={styles.slimTileLegendText} color={palette.accent[700]}>{fmt(farmStats.pondeuseCount)} pondeuse</AppText>
                  </View>
                )}
              </View>
            </>
          ) : (
            <AppText style={styles.slimTileLegendText} color="faint">aucun lot actif</AppText>
          )}
        </View>
        <View style={styles.slimTile}>
          <View style={styles.slimTileHead}>
            <View style={styles.slimTileTitleWrap}>
              <View style={[styles.slimTileIcon, { backgroundColor: 'rgba(240, 128, 16, 0.13)' }]}>
                <Egg size={15} color={palette.accent[500]} />
              </View>
              <AppText style={styles.slimTileTitle} color={palette.accent[700]}>Œufs</AppText>
            </View>
            <View style={[styles.slimTileCount, { borderColor: palette.accent[500] + '45', backgroundColor: palette.accent[500] + '12' }]}>
              <AppText style={styles.slimTileCountText} color={palette.accent[700]}>
                {farmStats.totalEggs >= 30
                  ? `${fmt(farmStats.totalAlveoles)} alvéole${farmStats.totalAlveoles !== 1 ? 's' : ''}`
                  : farmStats.totalEggs > 0
                    ? 'œufs en vrac'
                    : 'pas de collecte'}
              </AppText>
            </View>
          </View>
          <AppText style={styles.slimTileValue} color={palette.accent[600]}>{farmStats.totalEggs > 0 ? fmt(farmStats.totalEggs) : '—'}</AppText>
          <AppText style={styles.slimTileCaption} color="muted">récolte cumulée</AppText>
          <View style={styles.slimTileDivider} />
          {farmStats.avgLayRatePondeuse != null ? (
            <>
              <View style={styles.slimTileBar}>
                <View style={[styles.slimTileBarSeg, { flex: Math.min(100, farmStats.avgLayRatePondeuse), backgroundColor: palette.accent[500] }]} />
                {farmStats.avgLayRatePondeuse < 100 && (
                  <View style={[styles.slimTileBarSeg, { flex: 100 - Math.min(100, farmStats.avgLayRatePondeuse), backgroundColor: palette.accent[100] }]} />
                )}
              </View>
              <View style={styles.slimTileLegend}>
                <View style={styles.slimTileLegendItem}>
                  <View style={[styles.slimTileLegendDot, { backgroundColor: palette.accent[500] }]} />
                  <AppText style={styles.slimTileLegendText} color={palette.accent[700]}>{farmStats.avgLayRatePondeuse.toFixed(0)} % ponte</AppText>
                </View>
              </View>
            </>
          ) : (
            <AppText style={styles.slimTileLegendText} color="faint">
              {farmStats.totalEggs > 0 ? 'taux de ponte non renseigné' : 'aucune collecte'}
            </AppText>
          )}
        </View>
      </View>

      {/* ── FINANCE (en direct : 4 KPI · la feuille de détails s'ouvre en bas) ── */}
      <View style={styles.financeWrap}>
        <Pressable
          onPress={openFinanceSheet}
          style={({ pressed }) => [styles.financeHead, pressed && styles.financeHeadPressed]}
          accessibilityRole="button"
          accessibilityLabel="Finances — voir le détail en feuille">
          <View style={styles.financeHeadIcon}>
            <Wallet size={15} color={palette.brand[600]} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText size="small" weight="bold" color="brand">Finance</AppText>
            <StarLabel label={finLabel} />
          </View>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setFinHelpOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Aide — comprendre la Finance"
            hitSlop={8}
            style={({ pressed }) => [styles.financeHelpBtn, pressed && styles.financeHelpBtnPressed]}>
            <Info size={14} color={palette.brand[600]} />
          </Pressable>
          <View style={styles.financeToggleBtn}>
            <AppText size="caption" weight="bold" color="brand">Détails</AppText>
            <ChevronRight size={13} color={palette.brand[600]} />
          </View>
        </Pressable>
      </View>

      <Card padding={false} style={styles.financeCard} onPress={openFinanceSheet}>
        <View style={styles.financeStrip}>
          <FinanceCell label="Recettes" value={compactFcfa(pnl.data?.sales.totalFcfa ?? 0)} sub={`${pnl.data?.sales.count ?? 0} vente(s)`} fg={palette.brand[600]} icon={Wallet} />
          <View style={styles.financeDivider} />
          <FinanceCell label="Encaissé" value={compactFcfa(pnl.data?.collectedFcfa ?? 0)} sub="encaissé" fg={palette.green[600]} icon={Coins} />
          <View style={styles.financeDivider} />
          <FinanceCell
            label="Créances"
            value={compactFcfa(pnl.data?.outstandingFcfa ?? 0)}
            sub={(pnl.data?.outstandingFcfa ?? 0) > 0 ? 'reste à encaisser' : 'tout payé'}
            fg={(pnl.data?.outstandingFcfa ?? 0) > 0 ? palette.amber[500] : palette.green[600]}
            icon={TrendingDown}
          />
          <View style={styles.financeDivider} />
          <FinanceCell
            label="Net"
            value={compactFcfa(pnl.data?.netFcfa ?? 0)}
            sub={(pnl.data?.netFcfa ?? 0) >= 0 ? 'bénéfice' : 'déficit'}
            fg={(pnl.data?.netFcfa ?? 0) >= 0 ? palette.green[600] : palette.red[500]}
            icon={(pnl.data?.netFcfa ?? 0) >= 0 ? TrendingUp : TrendingDown}
          />
        </View>
        {hasCompare && (
          <View style={styles.financeCardFooter}>
            <AppText size="caption" color="faint">vs période précédente</AppText>
            {dEncaissPct != null && (
              <View style={[styles.compareChip, dEncaissPct >= 0 ? styles.compareChipUp : styles.compareChipDown]}>
                {dEncaissPct >= 0 ? <TrendingUp size={11} color={palette.green[600]} /> : <TrendingDown size={11} color={palette.red[500]} />}
                <AppText size="caption" weight="bold" color={dEncaissPct >= 0 ? palette.green[600] : palette.red[500]}>
                  {dEncaissPct > 0 ? '+' : ''}{dEncaissPct.toFixed(0)}% encaissé
                </AppText>
              </View>
            )}
            {dNetPct != null && (
              <View style={[styles.compareChip, dNetPct >= 0 ? styles.compareChipUp : styles.compareChipDown]}>
                {dNetPct >= 0 ? <TrendingUp size={11} color={palette.green[600]} /> : <TrendingDown size={11} color={palette.red[500]} />}
                <AppText size="caption" weight="bold" color={dNetPct >= 0 ? palette.green[600] : palette.red[500]}>
                  {dNetPct > 0 ? '+' : ''}{dNetPct.toFixed(0)}% net
                </AppText>
              </View>
            )}
          </View>
        )}
      </Card>

      {/* ── STATS · VUE D'ENSEMBLE (trigger → bottom sheet) ── */}
      <StatsPanel summary={summary} hasAnyBatch={hasAnyBatch} filterLabel={filterLabel} onOpen={() => { Haptics.selectionAsync().catch(() => {}); setShowOverview(true); }} />

      <CreateLotSheet visible={showCreate} onClose={() => setShowCreate(false)} />

      <FilterSortSheet
        visible={showFilterSheet}
        onClose={() => setShowFilterSheet(false)}
        filter={filter}
        setFilter={setFilter}
        speciesFilter={speciesFilter}
        setSpeciesFilter={setSpeciesFilter}
        healthFilter={healthFilter}
        setHealthFilter={setHealthFilter}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortToggle={(s) => {
          if (sortKey === s) setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
          else { setSortKey(s); setSortDir('desc'); }
        }}
        filterCounts={filterCounts}
        speciesCounts={speciesCounts}
        availableSpecies={availableSpecies}
      />

      <OverviewSheet
        visible={showOverview}
        onClose={() => setShowOverview(false)}
        summary={overviewSummary}
        lots={overviewList}
        farmId={farmId}
        filterLabel={filterLabel}
        revenueFcfa={pnl.data?.sales.totalFcfa ?? null}
        revenueLabel={finLabel}
        overviewDate={overviewDate}
        overviewLive={overviewLive}
        onShowSelling={() => { setShowOverview(false); setFilter('selling'); }}
      />

      {/* ── FILTERS + SORT ── */}
      <View style={styles.searchWrap}>
        <Search size={16} color={color.ink[400]} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher une bande…"
          placeholderTextColor={color.ink[300]}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={10}>
            <X size={16} color={color.ink[400]} />
          </Pressable>
        )}
      </View>
      {/* ── FILTRES + TRI · barre compacte ── */}
      <View style={styles.controlRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScrollView} contentContainerStyle={styles.filterScroll}>
          {FILTERS.map((f) => (
            <FilterPill
              key={f.key}
              label={f.label}
              count={f.key === 'all' ? filterCounts.total : filterCounts[f.key]}
              active={filter === f.key}
              compact
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setFilter(f.key); }}
            />
          ))}
        </ScrollView>
        <Pressable
          onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowFilterSheet(true); }}
          accessibilityRole="button"
          accessibilityLabel="Plus de filtres et tri"
          style={[styles.sortToggle, hasAdvancedFilters && styles.sortToggleActive]}>
          {hasAdvancedFilters ? <View style={styles.advancedDot} /> : null}
          <SlidersHorizontal size={16} color={hasAdvancedFilters ? palette.brand[600] : color.ink[500]} />
        </Pressable>
      </View>

      {/* ── LOT LIST ── */}
      {batches.isLoading ? (
        <Spinner label="Chargement des lots…" />
      ) : !hasAnyBatch ? (
        <LotEmptyState
          hasBuilding={hasBuilding}
          buildingsLoading={buildings.isLoading}
          onCreateLot={openCreate}
          onCreateBuilding={openCreateBuilding}
        />
      ) : (
        <View style={{ gap: 10 }}>
          {shown.map((b) => (
            <LotCardWithHealth key={b.id} batch={b} farmId={farmId}
              buildingName={b.buildingId ? buildings.data?.find((bd) => bd.id === b.buildingId)?.name ?? null : null}
              onPress={() => router.push(`/lot/${b.id}`)}
              detailOpen={detailLotId === b.id} onOpenDetail={() => setDetailLotId(b.id)} onCloseDetail={() => setDetailLotId(null)}
              onOpenEggs={() => { Haptics.selectionAsync().catch(() => {}); setDetailLotId(null); setEggLotId(b.id); }}
              onPlanCare={() => { Haptics.selectionAsync().catch(() => {}); router.push({ pathname: '/sanitary', params: { lot: b.id, plan: '1' } }); }} />
          ))}
          {shown.length === 0 ? (
            <EmptyState
              emoji="🐔"
              title={search.trim() ? `Aucun résultat pour « ${search.trim()} »` : `Aucun lot ${filter === 'all' ? 'enregistré' : filterLabel}`}
              description={search.trim() ? 'Vérifiez l’orthographe ou modifiez les filtres.' : filter === 'all' ? 'Créez un lot depuis le bouton +' : 'Retirez le filtre pour afficher tous les lots.'}
            />
          ) : null}
        </View>
      )}

      <FinanceSheet
        visible={showFinanceSheet}
        onClose={() => setShowFinanceSheet(false)}
        pnl={pnl.data}
        sales={salesQ.data}
        expenses={expensesQ.data}
        orders={ordersQ.data}
        finLabel={finLabel}
      />
      <FinanceInfoSheet visible={finHelpOpen} onClose={() => setFinHelpOpen(false)} />
      <EggBreakdownSheet lot={shown.find((b) => b.id === eggLotId) ?? null} onClose={() => setEggLotId(null)} />
    </Screen>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// EMPTY STATE (no lots yet)
// ═══════════════════════════════════════════════════════════════════════

function LotEmptyState({ hasBuilding, buildingsLoading, onCreateLot, onCreateBuilding }: {
  hasBuilding: boolean; buildingsLoading: boolean; onCreateLot: () => void; onCreateBuilding: () => void;
}) {
  return (
    <View style={{ gap: 10 }}>
      <Card style={{ gap: 12, padding: 16, alignItems: 'center' }}>
        <View style={styles.emptyEmojiCircle}>
          <AppText style={styles.emptyEmoji}>🐔</AppText>
        </View>
        <AppText size="body" weight="bold" color="text" style={styles.emptyTitle}>
          Aucun lot enregistré
        </AppText>
        <AppText size="small" color="muted" style={styles.emptyDesc}>
          Créez votre premier lot pour suivre les effectifs, les métriques zootechniques et les alertes de la ferme.
        </AppText>

        <View style={styles.emptySteps}>
          <EmptyStep icon={Warehouse} done={hasBuilding} label="Bâtiment" desc={hasBuilding ? 'Bâtiment disponible' : 'Un bâtiment est requis avant de créer un lot'} />
          <EmptyStep icon={Bird} done={false} label="Lot" desc="Bande de poulets à suivre" />
          <EmptyStep icon={TrendingUp} label="Métriques" desc="IC, GMQ, mortalité, ponte, alertes" />
        </View>

        {!hasBuilding && !buildingsLoading && (
          <View style={styles.emptyWarn}>
            <AlertTriangle size={14} color={palette.amber[600]} />
            <AppText size="small" color="amber" style={{ flex: 1 }}>
              Aucun bâtiment enregistré. Créez-en un d{'\u2019'}abord — il est obligatoire pour démarrer un lot.
            </AppText>
          </View>
        )}

        {hasBuilding && (
          <Button label="Créer mon premier lot" tone="brand" size="lg" icon={Plus} onPress={onCreateLot} />
        )}
        {!hasBuilding && !buildingsLoading && (
          <Button label="Créer un bâtiment" tone="brand" size="lg" icon={Building2} onPress={onCreateBuilding} />
        )}
      </Card>
    </View>
  );
}

function EmptyStep({ icon: Icon, label, desc, done }: { icon: typeof Clock; label: string; desc: string; done?: boolean }) {
  return (
    <View style={styles.emptyStep}>
      <View style={[styles.emptyStepIcon, done && styles.emptyStepIconDone]}>
        <Icon size={16} color={done ? palette.green[600] : color.ink[500]} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText size="small" weight="semibold" color={done ? 'success' : 'text'}>
          {done ? `${label} ✓` : label}
        </AppText>
        <AppText size="small" color="faint">{desc}</AppText>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// LOT CARD WITH HEALTH
// ═══════════════════════════════════════════════════════════════════════

function LotCardWithHealth({ batch, farmId, buildingName, onPress, detailOpen, onOpenDetail, onCloseDetail, onOpenEggs, onPlanCare }: {
  batch: BatchWithMetrics; farmId: string; buildingName?: string | null; onPress: () => void; detailOpen: boolean; onOpenDetail: () => void; onCloseDetail: () => void; onOpenEggs: () => void; onPlanCare: () => void;
}) {
  const queryClient = useQueryClient();
  const completeCare = useCallback((eventId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    void completeProphylaxis(farmId, batch.id, eventId)
      .then(() => invalidateFarmQueries(queryClient, { farmId, batchId: batch.id }))
      .catch(() => {});
  }, [farmId, batch.id, queryClient]);
  const healthQ = useQuery({
    queryKey: ['batch-health', farmId, batch.id],
    queryFn: () => fetchBatchHealth(farmId, batch.id),
    staleTime: 60_000,
  });
  const prophylQ = useQuery({
    queryKey: ['prophylaxis', farmId, batch.id],
    queryFn: () => fetchProphylaxis(farmId, batch.id),
    staleTime: 60_000,
  });
  const treatmentsQ = useQuery({
    queryKey: ['treatments', farmId, batch.id],
    queryFn: () => fetchTreatments(farmId, batch.id),
    staleTime: 60_000,
  });
  const protocolsQ = useQuery({
    queryKey: ['sanitary-protocols', batch.species, batch.type],
    queryFn: () => fetchProtocols(batch.species ?? 'POULET', batch.type),
    staleTime: 60_000,
  });
  const defaultProtocol = useMemo(
    () => defaultProtocolFor(protocolsQ.data, batch.species ?? 'POULET', batch.type),
    [protocolsQ.data, batch.species, batch.type],
  );
  // Le programme « à vérifier » est celui réellement appliqué au lot : les
  // événements planifiés pointent le protocole d'origine (protocolId). On ne
  // retombe sur le protocole par défaut que si aucun soin n'a été généré.
  const appliedProgramId = useMemo(
    () =>
      (prophylQ.data ?? []).map((p) => p.protocolId).find(Boolean) ??
      defaultProtocol?.id,
    [prophylQ.data, defaultProtocol?.id],
  );
  const programQ = useQuery({
    queryKey: ['sanitary-program', appliedProgramId],
    queryFn: () => fetchSanitaryProgram(appliedProgramId!),
    enabled: appliedProgramId != null,
    staleTime: 60_000,
  });
  const pnlQ = useQuery({
    queryKey: ['rentabilite-batch', farmId, batch.id],
    queryFn: () => fetchRentabiliteBatch(farmId, batch.id),
    enabled: detailOpen,
    staleTime: 60_000,
  });
  const slaughterQ = useQuery({
    queryKey: ['slaughter-orders', farmId],
    queryFn: () => fetchSlaughterOrders(farmId),
    staleTime: 60_000,
  });
  const slaughterSummary = useMemo(() => lotSlaughterSummary(slaughterQ.data ?? [], batch), [slaughterQ.data, batch]);
  return (
    <>
      <LotCard batch={batch} buildingName={buildingName} health={healthQ.data} prophylaxis={prophylQ.data} treatments={treatmentsQ.data} program={programQ.data} onPress={onPress} onCompleteCare={completeCare} onOpenDetail={onOpenDetail} onOpenEggs={onOpenEggs} onPlanCare={onPlanCare} slaughterSummary={slaughterSummary} />
      <LotDetailSheet visible={detailOpen} batch={batch} health={healthQ.data} pnl={pnlQ.data} prophylaxis={prophylQ.data} treatments={treatmentsQ.data} program={programQ.data} onClose={onCloseDetail} onOpenEggs={onOpenEggs} onPlanCare={onPlanCare} slaughterSummary={slaughterSummary} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// LOT CARD
// ═══════════════════════════════════════════════════════════════════════

function LotCard({ batch, buildingName, health, prophylaxis, treatments, program, onPress, onCompleteCare, onOpenDetail, onOpenEggs, onPlanCare, slaughterSummary }: {
  batch: BatchWithMetrics; buildingName?: string | null; health?: BatchHealth; prophylaxis?: ProphylaxisEvent[]; treatments?: TreatmentRecord[]; program?: SanitaryProtocolWithSteps; onPress: () => void; onCompleteCare?: (eventId: string) => void; onOpenDetail: () => void; onOpenEggs: () => void; onPlanCare?: () => void; slaughterSummary?: LotSlaughterSummary;
}) {
  const m = batch.metrics;
  const isLayer = batch.type === 'PONDEUSE';
  const spec = batch.species ?? 'POULET';
  const customName = spec === 'AUTRE' && batch.customSpecies ? batch.customSpecies : null;
  const specLabel = customName ?? speciesLabel(spec);
  const cycleDays = isLayer ? LAYER_CYCLE_DAYS : CHAIR_CYCLE_DAYS;
  const ageProgress = Math.min(100, (m.ageDays / cycleDays) * 100);

  // Pillule de statut : la décision la plus utile à connaître d'un coup d'œil.
  const pill = batchStatusPill(batch);

  // Health score color
  const healthScore = health?.healthScore ?? null;
  const healthColor = healthScore != null ? (healthScore >= 80 ? palette.green[600] : healthScore >= 60 ? palette.amber[500] : palette.red[500]) : color.ink[300];

  // Status indicator
  const statusColor = m.status === 'VERT' ? palette.green[500] : m.status === 'JAUNE' ? palette.amber[500] : palette.red[500];

  // Accent unifié : la pillule de statut pilote la bordure de la carte.
  const cardAccent = pill ? STATUS_PILL_TONES[pill.tone].fg : statusColor;

  // Production stage
  const stage = batchStage(batch);

  // Soins à signaler en mode compact (retard / à venir / protocole)
  const careData = useMemo(() => {
    const merged = [...careChips(prophylaxis), ...protocolCareChips(program, m.ageDays, prophylaxis, treatments)];
    const seen = new Set<string>();
    return merged.filter((c) => (seen.has(c.label) ? false : (seen.add(c.label), true)));
  }, [prophylaxis, program, m.ageDays, treatments]);

  // Compte strict des soins EN_RETARD (statut serveur) → badge rouge distinct.
  const lateCount = (prophylaxis ?? []).filter((p) => p.status === 'EN_RETARD').length;

  // Conseil « prochain vaccin » : affiché quand aucune alerte soin n'occupe la carte.
  const nextVaccine = useMemo(
    () => nextCareInsight(batch, prophylaxis, treatments, program),
    [batch, prophylaxis, treatments, program],
  );

  // Un « calendrier de soins » existe dès qu'une échéance (réalisée, planifiée
  // ou en retard) est rattachée au lot. À défaut → insight « planifier ».
  const hasCareCalendar = (prophylaxis ?? []).some((p) => p.status !== 'ANNULE');

  return (
    <Card onPress={onPress} padding={false} style={[styles.lotCard, { borderLeftWidth: 4, borderLeftColor: cardAccent }]}>
      {/* ── HEADER: Espèce (visuel) + nom + identité + stats compactes ── */}
      <View style={styles.lotHeader}>
        <View style={styles.speciesTile}>
          {breedImageForLot(batch.breedName, batch.species) ? (
            <Image source={breedImageForLot(batch.breedName, batch.species)!} style={styles.speciesTileImg} resizeMode="cover" />
          ) : (
            <View style={[styles.speciesTileFallback, { backgroundColor: isLayer ? color.green[50] : color.brand[50] }]}>
              <AppText size="small" weight="bold" color={isLayer ? palette.green[700] : palette.brand[600]} numberOfLines={2} style={styles.speciesTileText}>
                {specLabel}
              </AppText>
            </View>
          )}
        </View>

        <View style={styles.lotHeaderMid}>
          <AppText size="body" weight="bold" color="text">
            {batch.batchName ?? 'Lot'}
          </AppText>
          <AppText color="muted" style={{ fontSize: 11, lineHeight: 14 }} allowFontScaling={false}>
            {[batch.breedCode, batch.breedName, isLayer ? 'Pondeuse' : 'Chair'].filter(Boolean).join(' · ')}
          </AppText>
        </View>

        <View style={styles.lotHeaderRight}>
          <BadgeChip icon={CalendarDays} value={`J${m.ageDays}`} color={palette.brand[600]} />
          {healthScore != null && (
            <BadgeChip icon={HeartPulse} value={healthScore} color={healthColor} />
          )}
          {lateCount > 0 && (
            <BadgeChip icon={AlertTriangle} value={lateCount} color={palette.red[500]} />
          )}
          {m.alerts > 0 && (
            <BadgeChip icon={AlertTriangle} value={m.alerts} color={palette.amber[600]} />
          )}
        </View>
      </View>

      {/* ── STATUT + STADE (chips, une seule décision + l'étape de production) ── */}
      <View style={styles.chipRow}>
        {pill && (
          <View style={[styles.statusPill, { backgroundColor: STATUS_PILL_TONES[pill.tone].bg, borderColor: STATUS_PILL_TONES[pill.tone].border }]}>
            <pill.icon size={13} color={STATUS_PILL_TONES[pill.tone].fg} />
            <AppText size="small" weight="bold" color={STATUS_PILL_TONES[pill.tone].fg}>
              {pill.label}
            </AppText>
          </View>
        )}
        <View style={[styles.stageChip, { backgroundColor: STAGE_CHIP_TONES[stage.tone].bg, borderColor: STAGE_CHIP_TONES[stage.tone].border }]}>
          <AppText size="small" weight="bold" color={STAGE_CHIP_TONES[stage.tone].fg}>
            {stage.label}
          </AppText>
        </View>
        {buildingName && (
          <View style={[styles.buildingChip, { backgroundColor: palette.brand[50], borderColor: palette.brand[200] }]}>
            <Building2 size={12} color={palette.brand[700]} />
            <AppText size="small" weight="bold" color={palette.brand[700]} numberOfLines={1} style={styles.buildingChipText}>
              {buildingName}
            </AppText>
          </View>
        )}
        {slaughterSummary ? <SlaughterBadge summary={slaughterSummary} /> : null}
      </View>

      {/* ── SOINS à venir / en retard (slim, seulement si pertinent) ── */}
      {careData.length > 0 && (
        <View style={styles.careStack}>
          {careData.map((c, i) => (
            <CareRow key={i} tone={c.tone} label={c.label} eventId={c.eventId} pulse={i === 0 && careData.some((x) => x.tone === 'red')} onComplete={onCompleteCare} />
          ))}
        </View>
      )}

      {/* ── PROCHAIN VACCIN (advice, calendrier déjà mis en place) ── */}
      {careData.length === 0 && hasCareCalendar && nextVaccine && (
        <View style={[styles.nextVaccineRow, { backgroundColor: nextVaccine.tone === 'amber' ? palette.amber[50] : palette.accent[50], borderColor: nextVaccine.tone === 'amber' ? palette.amber[100] : palette.accent[100] }]}>
          <Syringe size={12} color={nextVaccine.tone === 'amber' ? palette.amber[600] : palette.accent[600]} />
          <View style={{ flex: 1, gap: 1 }}>
            <AppText size="label" weight="bold" color={nextVaccine.tone === 'amber' ? palette.amber[700] : palette.accent[800]}>
              {nextVaccine.main}
            </AppText>
            <AppText size="caption" color="muted">{nextVaccine.sub}</AppText>
          </View>
        </View>
      )}

      {/* ── AUCUN SOIN PLANIFIÉ → insight + lien vers Centre sanitaire ── */}
      {!hasCareCalendar && onPlanCare && <PlanCareButton onPress={onPlanCare} />}

      {/* ── PROGRESS BAR: Age vs Cycle ── */}
      <View style={styles.progressWrap}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${ageProgress}%`, backgroundColor: statusColor }]} />
        </View>
        <AppText size="small" color="faint">{Math.max(0, cycleDays - m.ageDays)}j restants · {ageProgress.toFixed(0)}%</AppText>
      </View>

      {/* ── MAIN METRICS (fortes) ── */}
      <View style={styles.metricRow}>
        <MetricBlock label="Vivants" value={fmt(m.liveCount)} icon={Bird} tone="brand" compact />
        <MetricBlock label="Mortalité" value={`${m.mortalityPercent.toLocaleString('fr-FR')} %`} icon={HeartPulse}
          tone={normalizeMortalityStatus(m.mortalityStatus, m.mortalityPercent) === 'normal' ? 'green' : normalizeMortalityStatus(m.mortalityStatus, m.mortalityPercent) === 'elevated' ? 'amber' : 'red'} compact />
        <PonteMetric
          label={isLayer ? 'Taux de ponte' : 'Œufs produits'}
          value={m.layRatePercent != null ? `${m.layRatePercent.toLocaleString('fr-FR')} %` : m.eggsCollectedTotal > 0 ? fmt(m.eggsCollectedTotal) : '—'}
          onPress={onOpenEggs} />
      </View>

      {/* ── SECONDARY METRICS (petites) ── */}
      <View style={styles.miniMetricRow}>
        <MiniMetric label="IC" value={m.fcr != null && m.fcr > 0 ? m.fcr.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '—'} icon={Scale} />
        <MiniMetric label="Alim/oiseau" value={health && health.feedPerBirdGrams > 0 ? `${Math.round(health.feedPerBirdGrams)} g/j` : '—'} icon={Wheat} />
        <MiniMetric label="GMQ" value={m.gmqGramsPerDay ? `${m.gmqGramsPerDay.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} g` : '—'} icon={TrendingUp} />
      </View>

      {/* ── BOTTOM: Détails (bottom sheet) + density + feed ── */}
      <Pressable onPress={onOpenDetail} style={styles.lotBottom}>
        <AppText size="small" color="faint">
          {m.densityPerM2 ? `${m.densityPerM2.toFixed(1)}/m²` : ''}
          {m.totalFeedKg > 0 ? ` · ${m.totalFeedKg.toLocaleString('fr-FR')} kg` : ''}
        </AppText>
        <View style={[styles.expandPill, { backgroundColor: palette.brand[600] }]}>
          <ChevronRight size={16} color={palette.brand[50]} />
          <AppText size="small" weight="bold" color="surface">Détails</AppText>
        </View>
      </Pressable>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════

function CareRow({ tone, label, pulse, eventId, onComplete }: { tone: 'red' | 'amber'; label: string; pulse: boolean; eventId?: string; onComplete?: (eventId: string) => void }) {
  const fg = tone === 'red' ? palette.red[600] : palette.amber[600];
  const bg = tone === 'red' ? palette.red[50] : palette.amber[50];
  return (
    <View style={[styles.careRow, { backgroundColor: bg }]}>
      {pulse && <PulsarDot color={palette.red[500]} size={12} />}
      <Syringe size={12} color={fg} />
      <AppText size="label" weight="bold" color={fg} style={{ flex: 1 }}>{label}</AppText>
      {eventId && onComplete ? (
        <Pressable
          onPress={() => onComplete(eventId)}
          style={styles.careDonePill}
          accessibilityRole="button"
          accessibilityLabel="Marquer ce soin comme fait"
        >
          <Check size={12} color={palette.green[700]} />
          <AppText size="label" weight="bold" color="success">Fait</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

function PanelCell({ value, label, sub, icon: Icon, tone }: { value: string; label: string; sub?: string; icon: typeof Clock; tone: 'brand' | 'accent' | 'green' | 'red' | 'amber' | 'muted' }) {
  const fg = tone === 'accent' ? palette.accent[500] : tone === 'red' ? palette.red[500] : tone === 'amber' ? palette.amber[500] : tone === 'green' ? palette.green[600] : tone === 'muted' ? color.ink[400] : palette.brand[600];
  const bg = tone === 'accent' ? palette.accent[50] : tone === 'red' ? palette.red[50] : tone === 'amber' ? palette.amber[50] : tone === 'green' ? palette.green[50] : tone === 'muted' ? palette.surfaceAlt : palette.brand[50];
  const chipBg = tone === 'accent' ? palette.accent[100] : tone === 'red' ? palette.red[100] : tone === 'amber' ? palette.amber[100] : tone === 'green' ? palette.green[100] : tone === 'muted' ? palette.ink[200] : palette.brand[100];
  return (
    <View style={[styles.panelCell, { backgroundColor: bg }]}>
      <View style={[styles.panelCellIcon, { backgroundColor: chipBg }]}>
        <Icon size={14} color={fg} />
      </View>
      <View style={styles.panelCellText}>
        <AppText size="body" weight="bold" color={fg} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{value}</AppText>
        <AppText size="caption" color="muted" numberOfLines={1}>{label}</AppText>
        {sub ? <AppText size="caption" color="faint" numberOfLines={1}>{sub}</AppText> : null}
      </View>
    </View>
  );
}

type OverviewSummary = {
  totalBirds: number;
  avgMortality: number | null;
  avgFcr: number | null;
  avgGmq: number | null;
  avgLayRate: number | null;
  count: number;
  activeCount: number;
  sellingCount: number;
  speciesGroups: { label: string; birds: number; eggs: number; layRate: number | null; feedKg: number }[];
  totalEggs: number;
  totalFeedKg: number;
  feedPerBirdDay: number | null;
  readyCount: number;
  readyBirds: number;
  redCount: number;
  yellowCount: number;
} | null;

const DIST_COLORS = [palette.brand[600], palette.accent[500], palette.green[600], palette.amber[500], palette.red[500], palette.ink[400]];

function FilterPill({ label, count, active, onPress, dotColor, compact }: { label: string; count: number; active: boolean; onPress: () => void; dotColor?: string; compact?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.filterChip, compact && styles.filterChipCompact, active && styles.filterChipActive]}>
      {dotColor && <View style={[styles.filterDot, { backgroundColor: dotColor }]} />}
      <AppText size="small" weight={active ? 'bold' : 'medium'} color={active ? 'surface' : 'muted'} numberOfLines={1}>{label}</AppText>
      <View style={[styles.filterChipCount, compact && styles.filterChipCountCompact, active && styles.filterChipCountActive]}>
        <AppText size="small" weight="bold" color={active ? 'surface' : 'muted'}>{count}</AppText>
      </View>
    </Pressable>
  );
}

function FilterSortSheet({ visible, onClose, filter, setFilter, speciesFilter, setSpeciesFilter, healthFilter, setHealthFilter, sortKey, sortDir, onSortToggle, filterCounts, speciesCounts, availableSpecies }: {
  visible: boolean;
  onClose: () => void;
  filter: FilterType;
  setFilter: (f: FilterType) => void;
  speciesFilter: Species | 'all';
  setSpeciesFilter: (s: Species | 'all') => void;
  healthFilter: 'all' | 'VERT' | 'JAUNE' | 'ROUGE';
  setHealthFilter: (h: 'all' | 'VERT' | 'JAUNE' | 'ROUGE') => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onSortToggle: (s: SortKey) => void;
  filterCounts: { total: number; active: number; selling: number; chair: number; layer: number; green: number; yellow: number; red: number };
  speciesCounts: Partial<Record<Species, number>>;
  availableSpecies: Species[];
}) {
  const hasAny = filter !== 'all' || speciesFilter !== 'all' || healthFilter !== 'all';
  const reset = () => { setFilter('all'); setSpeciesFilter('all'); setHealthFilter('all'); };
  return (
    <Sheet
      visible={visible}
      title="Filtrer & trier"
      subtitle={hasAny ? 'filtres actifs' : 'affinez la liste des lots'}
      accentColor={palette.brand[500]}
      icon={
        <View style={[styles.sheetIconTile, { backgroundColor: palette.brand[50] }]}>
          <SlidersHorizontal size={18} color={palette.brand[600]} />
        </View>
      }
      onClose={onClose}
      footer={
        <View style={styles.sheetFooter}>
          <View style={styles.sheetActionRow}>
            <Pressable
              onPress={() => { Haptics.selectionAsync().catch(() => {}); reset(); }}
              style={({ pressed }) => [styles.sheetActionBtn, pressed && { opacity: 0.8 }]}
              accessibilityRole="button">
              <RotateCcw size={15} color={color.ink[500]} />
              <AppText size="small" weight="bold" color={color.ink[600]}>Réinitialiser</AppText>
            </Pressable>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.sheetPrimaryBtn, pressed && { opacity: 0.85 }]}
              accessibilityRole="button">
              <AppText size="body" weight="bold" color="surface">Voir les lots</AppText>
            </Pressable>
          </View>
        </View>
      }
    >
      <View style={styles.filterSection}>
        <DetailSectionTitle label="Statut" icon={Bird} color={palette.brand[600]} />
        <View style={styles.chipWrap}>
          {FILTERS.map((f) => (
            <FilterPill key={f.key} label={f.label} count={f.key === 'all' ? filterCounts.total : filterCounts[f.key]} active={filter === f.key} onPress={() => { Haptics.selectionAsync().catch(() => {}); setFilter(f.key); }} />
          ))}
        </View>
      </View>
      {availableSpecies.length > 1 && (
        <View style={styles.filterSection}>
          <DetailSectionTitle label="Espèce" icon={Layers} color={palette.accent[500]} />
          <View style={styles.chipWrap}>
            <FilterPill label="Toutes" count={filterCounts.total} active={speciesFilter === 'all'} onPress={() => { Haptics.selectionAsync().catch(() => {}); setSpeciesFilter('all'); }} />
            {availableSpecies.map((sp) => (
              <FilterPill key={sp} label={speciesLabel(sp)} count={speciesCounts[sp] ?? 0} active={speciesFilter === sp} onPress={() => { Haptics.selectionAsync().catch(() => {}); setSpeciesFilter(speciesFilter === sp ? 'all' : sp); }} />
            ))}
          </View>
        </View>
      )}
      <View style={styles.filterSection}>
        <DetailSectionTitle label="Santé" icon={Stethoscope} color={palette.green[600]} />
        <View style={styles.chipWrap}>
          <FilterPill label="Toutes" count={filterCounts.total} active={healthFilter === 'all'} onPress={() => { Haptics.selectionAsync().catch(() => {}); setHealthFilter('all'); }} />
          <FilterPill label="Vert" count={filterCounts.green} dotColor={palette.green[500]} active={healthFilter === 'VERT'} onPress={() => { Haptics.selectionAsync().catch(() => {}); setHealthFilter(healthFilter === 'VERT' ? 'all' : 'VERT'); }} />
          <FilterPill label="Jaune" count={filterCounts.yellow} dotColor={palette.amber[500]} active={healthFilter === 'JAUNE'} onPress={() => { Haptics.selectionAsync().catch(() => {}); setHealthFilter(healthFilter === 'JAUNE' ? 'all' : 'JAUNE'); }} />
          <FilterPill label="Rouge" count={filterCounts.red} dotColor={palette.red[500]} active={healthFilter === 'ROUGE'} onPress={() => { Haptics.selectionAsync().catch(() => {}); setHealthFilter(healthFilter === 'ROUGE' ? 'all' : 'ROUGE'); }} />
        </View>
      </View>
      <View style={styles.filterSection}>
        <DetailSectionTitle label="Trier par" icon={SlidersHorizontal} color={color.ink[600]} />
        <View style={styles.chipWrap}>
          {SORT_OPTIONS.map((s) => (
            <Pressable key={s.key} onPress={onSortToggle.bind(null, s.key)} style={[styles.sortChip, sortKey === s.key && styles.sortChipActive]}>
              <AppText size="small" weight={sortKey === s.key ? 'bold' : 'medium'} color={sortKey === s.key ? 'brand' : 'muted'}>{s.label}</AppText>
              {sortKey === s.key && (sortDir === 'desc' ? <SortDesc size={12} color={palette.brand[600]} /> : <SortAsc size={12} color={palette.brand[600]} />)}
            </Pressable>
          ))}
        </View>
      </View>
    </Sheet>
  );
}

function StatsPanel({ summary, hasAnyBatch, filterLabel, onOpen }: { summary: OverviewSummary; hasAnyBatch: boolean; filterLabel: string; onOpen: () => void }) {
  if (!summary) {
    return (
      <Card style={styles.statsCard}>
        <View style={styles.financeHeaderRow}>
          <View style={styles.panelHeaderLeft}>
            <View style={styles.panelHeaderIcon}>
              <Activity size={14} color={palette.brand[600]} />
            </View>
            <AppText size="small" weight="bold" color="brand">Vue d’ensemble</AppText>
          </View>
        </View>
        <View style={styles.statsEmpty}>
          <AppText size="small" color="faint">
            {hasAnyBatch ? `Aucun lot dans le filtre « ${filterLabel} »` : 'Aucun lot créé pour l’instant'}
          </AppText>
          <AppText size="caption" color="faint">Les indicateurs moyens apparaîtront ici dès qu’un lot est suivi.</AppText>
        </View>
      </Card>
    );
  }

  return (
    <Card style={styles.statsCard}>
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => [styles.panelHeaderRow, styles.panelHeaderRowActive, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="Ouvrir la vue d’ensemble"
      >
        <View style={styles.panelHeaderLeft}>
          <View style={[styles.panelHeaderIcon, styles.panelHeaderIconActive]}>
            <Image source={require('@/assets/images/logo-white.png')} style={styles.ovHeaderLogo} resizeMode="contain" />
          </View>
          <AppText size="small" weight="bold" color="brand">Vue d’ensemble</AppText>
        </View>
        <View style={{ flex: 1 }} />
        <View style={[styles.summaryPill, styles.summaryPillActive]}>
          <AppText size="caption" weight="bold" color="surface">{summary.count} lots · {summary.activeCount} actifs</AppText>
        </View>
        <View style={[styles.panelChevron, styles.panelChevronActive]}>
          <ChevronUp size={14} color={palette.brand[50]} />
        </View>
      </Pressable>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// OVERVIEW SHEET (vue d'ensemble : zootechnie, œufs, aliment, sanitaire)
// ═══════════════════════════════════════════════════════════════════════

function OverviewSheet({ visible, summary, lots, farmId, filterLabel, revenueFcfa, revenueLabel, overviewDate, overviewLive, onClose, onShowSelling }: {
  visible: boolean;
  summary: OverviewSummary | null;
  lots: BatchWithMetrics[];
  farmId: string;
  filterLabel: string;
  revenueFcfa: number | null;
  revenueLabel: string;
  overviewDate: string;
  overviewLive: boolean;
  onClose: () => void;
  onShowSelling?: () => void;
}) {
  const prophylList = useQueries({
    queries: lots.map((b) => ({
      queryKey: ['prophylaxis', farmId, b.id],
      queryFn: () => fetchProphylaxis(farmId, b.id),
      staleTime: 60_000,
    })),
  });
  const healthList = useQueries({
    queries: lots.map((b) => ({
      queryKey: ['batch-health', farmId, b.id],
      queryFn: () => fetchBatchHealth(farmId, b.id),
      staleTime: 60_000,
    })),
  });

  // Protocoles par (espèce, type) — mêmes clés que la carte lot (cache partagé).
  const speciesTypeKeys = useMemo(
    () => [...new Set(lots.map((b) => `${b.species ?? 'POULET'}|${b.type}`))],
    [lots],
  );
  const protocolList = useQueries({
    queries: speciesTypeKeys.map((key) => {
      const [species, type] = key.split('|');
      return {
        queryKey: ['sanitary-protocols', species, type],
        queryFn: () => fetchProtocols(species, type),
        staleTime: 60_000,
      };
    }),
  });
  const treatmentList = useQueries({
    queries: lots.map((b) => ({
      queryKey: ['treatments', farmId, b.id],
      queryFn: () => fetchTreatments(farmId, b.id),
      staleTime: 60_000,
    })),
  });
// Programme appliqué à chaque lot : celui d'origine des soins, sinon le
  // protocole par défaut de (espèce, type) — même logique que la carte lot.
  const appliedProgramIds = useMemo(() => {
    if (prophylList.length === 0) return [];
    return lots.map((b, i) => {
      const key = `${b.species ?? 'POULET'}|${b.type}`;
      const protocols = protocolList[speciesTypeKeys.indexOf(key)]?.data;
      const defaultProtocol = defaultProtocolFor(protocols, b.species ?? 'POULET', b.type);
      return (
        (prophylList[i].data ?? []).map((p) => p.protocolId).find(Boolean) ??
        defaultProtocol?.id ??
        null
      );
    });
  }, [lots, speciesTypeKeys, protocolList, prophylList]);
  // Un seul appel par programme (évite les requêtes dupliquées quand plusieurs
  // lots partagent le même protocole).
  const programIds = useMemo(
    () => [...new Set(appliedProgramIds.filter((id): id is string => id != null))],
    [appliedProgramIds],
  );
  const programList = useQueries({
    queries: programIds.map((id) => ({
      queryKey: ['sanitary-program', id],
      queryFn: () => fetchSanitaryProgram(id),
      staleTime: 60_000,
    })),
  });

  const lotCares = useMemo(() => {
    if (prophylList.length === 0) return [];
    const programById = new Map<string, { data?: SanitaryProtocolWithSteps; isLoading: boolean }>();
    programIds.forEach((id, i) => programById.set(id, programList[i]));
    return lots.map((b, i) => {
      const ev = prophylList[i].data ?? [];
      const program = appliedProgramIds[i] != null ? programById.get(appliedProgramIds[i]!) : undefined;
      const merged = [
        ...careChips(ev),
        ...protocolCareChips(program?.data, b.metrics.ageDays, ev, treatmentList[i].data),
      ];
      const seen = new Set<string>();
      return merged.filter((c) => (seen.has(c.label) ? false : (seen.add(c.label), true)));
    });
  }, [lots, prophylList, appliedProgramIds, programIds, programList, treatmentList]);

  const lateTotal = lotCares.reduce((s, c) => s + (c.some((x) => x.tone === 'red') ? 1 : 0), 0);
  const dueTotal = lotCares.reduce(
    (s, c) => s + (c.some((x) => x.tone === 'amber') && !c.some((x) => x.tone === 'red') ? 1 : 0),
    0,
  );

  let feedGramSum = 0;
  let feedBirds = 0;
  let feedAvail = 0;
  healthList.forEach((q, i) => {
    const g = q.data?.feedPerBirdGrams;
    if (g != null && g > 0) {
      feedGramSum += g * lots[i].metrics.liveCount;
      feedBirds += lots[i].metrics.liveCount;
      feedAvail += 1;
    }
  });
  const feedPerBirdDay = feedBirds > 0 && feedAvail > 0 ? feedGramSum / feedBirds : (summary?.feedPerBirdDay ?? null);

  if (!summary) return null;

  const liveBirds = summary.totalBirds > 0 ? summary.totalBirds : 1;
  const readyShare = summary.totalBirds > 0 ? summary.readyBirds / summary.totalBirds : 0;
  const groups = summary.speciesGroups.map((g) => ({
    ...g,
    items: lots.filter((b) => kindLabel(b) === g.label),
  }));

  return (
    <Sheet
      visible={visible}
      title="Vue d’ensemble"
      subtitle={`${filterLabel} · ${summary.count} lot(s) · ${fmt(summary.totalBirds)} oiseaux`}
      accentColor={palette.brand[700]}
      icon={
        <View style={[styles.sheetIconTile, { backgroundColor: palette.brand[600] }]}>
          <Image source={require('@/assets/images/logo-white.png')} style={styles.ovSheetLogo} resizeMode="contain" />
        </View>
      }
      onClose={onClose}
    >
      {/* ── DATE ── */}
      <View style={styles.ovMetaRow}>
        <View style={styles.ovMetaChip}>
          {overviewLive ? (
            <View style={styles.ovLiveDot} />
          ) : (
            <CalendarDays size={12} color={palette.brand[600]} />
          )}
          <AppText size="caption" weight="semibold" color="muted">{overviewLive ? 'En direct' : 'Date'}</AppText>
          <View style={styles.ovMetaDivider} />
          <AppText size="caption" weight="bold" color={palette.brand[700]}>{dateFr(overviewDate)}</AppText>
        </View>
      </View>

      {!overviewLive && (
        <View style={styles.ovMetaNote}>
          <Info size={11} color={palette.accent[500]} />
          <AppText size="caption" color="faint">
            Cheptel et performances reconstitués ici — la Finance et les Revenus correspondent à la période choisie ({revenueLabel}).
          </AppText>
        </View>
      )}

      {/* ── KPI GRID (tous types) ── */}
      <View style={styles.panelCellGrid}>
        <PanelCell
          value={summary.avgMortality != null ? `${summary.avgMortality.toLocaleString('fr-FR')} %` : '—'}
          label="Mortalité moyenne"
          icon={HeartPulse}
          tone={summary.avgMortality != null ? (summary.avgMortality > 5 ? 'red' : summary.avgMortality > 1 ? 'amber' : 'green') : 'muted'}
        />
        <PanelCell
          value={summary.avgFcr != null ? summary.avgFcr.toLocaleString('fr-FR') : '—'}
          label="IC moyen"
          icon={Scale}
          tone={summary.avgFcr != null ? (summary.avgFcr > 2.5 ? 'red' : summary.avgFcr > 2.0 ? 'amber' : 'green') : 'muted'}
        />
        <PanelCell
          value={summary.avgGmq != null ? `${summary.avgGmq.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} g` : '—'}
          label="GMQ moyen"
          icon={TrendingUp}
          tone={summary.avgGmq != null ? 'brand' : 'muted'}
        />
        <PanelCell
          value={summary.avgLayRate != null ? `${summary.avgLayRate.toLocaleString('fr-FR')}%` : '—'}
          label="Ponte moyenne"
          sub="toutes bandes"
          icon={Egg}
          tone={summary.avgLayRate != null ? 'accent' : 'muted'}
        />
      </View>

      {/* ── ALERTES ── */}
      <View style={styles.alertStrip}>
        {summary.redCount > 0 && (
          <View style={[styles.alertChip, { backgroundColor: palette.red[50], borderColor: palette.red[200] }]}>
            <AlertTriangle size={12} color={palette.red[500]} />
            <AppText size="small" weight="bold" color={palette.red[500]}>{summary.redCount} critique(s)</AppText>
          </View>
        )}
        {summary.yellowCount > 0 && (
          <View style={[styles.alertChip, { backgroundColor: palette.amber[50], borderColor: palette.amber[200] }]}>
            <Info size={12} color={palette.amber[500]} />
            <AppText size="small" weight="bold" color={palette.amber[500]}>{summary.yellowCount} à surveiller</AppText>
          </View>
        )}
        {summary.redCount === 0 && summary.yellowCount === 0 && (
          <View style={[styles.alertChip, { backgroundColor: palette.green[50], borderColor: palette.green[200] }]}>
            <BadgeCheck size={12} color={palette.green[600]} />
            <AppText size="small" weight="bold" color={palette.green[600]}>Tout est OK</AppText>
          </View>
        )}
      </View>

      {/* ── PRÊTS À VENDRE ── */}
      <DetailSectionTitle label="Vente" color={palette.green[600]} icon={BadgeCheck} />
      <Pressable
        onPress={summary.readyCount > 0 && onShowSelling ? () => { Haptics.selectionAsync().catch(() => {}); onShowSelling(); } : undefined}
        disabled={summary.readyCount === 0 || !onShowSelling}
        style={({ pressed }) => [
          styles.readyBanner,
          summary.readyCount > 0 ? styles.readyBannerOn : styles.readyBannerOff,
          pressed && summary.readyCount > 0 && { opacity: 0.85 },
        ]}
        accessibilityRole="button"
        accessibilityState={{ disabled: summary.readyCount === 0 || !onShowSelling }}
      >
        <View style={[styles.readyBannerIcon, summary.readyCount > 0 ? styles.readyBannerIconOn : styles.readyBannerIconOff]}>
          <BadgeCheck size={14} color={summary.readyCount > 0 ? palette.green[600] : color.ink[400]} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText size="small" weight="bold" color={summary.readyCount > 0 ? palette.green[600] : 'muted'}>
            {summary.readyCount > 0 ? `${summary.readyCount} lot(s) · ${fmt(summary.readyBirds)} oiseaux prêts` : 'Aucun lot prêt'}
          </AppText>
          <View style={styles.progressTrack}>
            <View style={[styles.readyFill, { width: `${Math.round(readyShare * 100)}%`, backgroundColor: summary.readyCount > 0 ? palette.green[600] : palette.ink[200] }]} />
          </View>
        </View>
        <View style={styles.readyShareRight}>
          <AppText size="body" weight="bold" color={summary.readyCount > 0 ? palette.green[600] : 'faint'}>
            {Math.round(readyShare * 100)}%
          </AppText>
          {summary.readyCount > 0 && onShowSelling && (
            <View style={styles.readyGoto}>
              <AppText size="caption" weight="bold" color={palette.brand[600]}>Voir</AppText>
              <ChevronRight size={12} color={palette.brand[600]} />
            </View>
          )}
        </View>
      </Pressable>

      <View style={styles.ovRevenueCard}>
        <View style={styles.ovRevenueIcon}>
          <Wallet size={14} color={palette.brand[600]} />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <AppText size="body" weight="bold" color={palette.brand[700]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {revenueFcfa != null ? `${compactFcfa(revenueFcfa)} FCFA` : '—'}
          </AppText>
          <AppText size="caption" color="muted" numberOfLines={1}>Revenus · {revenueLabel}</AppText>
        </View>
      </View>

      {/* ── CONSOMMATION ALIMENTAIRE ── */}
      <View style={{ gap: 8 }}>
        <DetailSectionTitle label="Consommation alimentaire" color={palette.brand[600]} icon={Wheat} />
        <View style={styles.ovFeedRow}>
          <View style={styles.ovFeedStat}>
            <AppText size="body" weight="bold" color={palette.brand[700]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {summary.totalFeedKg > 0 ? `${fmt(summary.totalFeedKg)} kg` : '—'}
            </AppText>
            <AppText size="caption" color="muted" numberOfLines={1}>aliment distribué</AppText>
          </View>
          <View style={styles.ovFeedDivider} />
          <View style={styles.ovFeedStat}>
            <AppText size="body" weight="bold" color={palette.brand[700]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {feedPerBirdDay != null ? `${feedPerBirdDay.toFixed(0)} g` : '—'}
            </AppText>
            <AppText size="caption" color="muted" numberOfLines={1}>par oiseau / jour</AppText>
          </View>
        </View>
        {summary.speciesGroups.filter((g) => g.feedKg > 0).length > 1 && (
          <View style={styles.distBar}>
            {summary.speciesGroups.map((g, i) =>
              g.feedKg > 0 ? (
                <View
                  key={g.label}
                  style={[styles.distSeg, { width: `${Math.max(1, Math.round((g.feedKg / Math.max(1, summary.totalFeedKg)) * 100))}%`, backgroundColor: DIST_COLORS[i % DIST_COLORS.length] }]}
                />
              ) : null,
            )}
          </View>
        )}
      </View>

      {/* ── ESPÈCES & SOUCHES ── */}
      <View style={styles.speciesWrap}>
        <DetailSectionTitle label="Espèces & souches" color={palette.accent[600]} icon={Egg} />
        <View style={styles.distBar}>
          {summary.speciesGroups.map((g, i) => (
            <View
              key={g.label}
              style={[styles.distSeg, { width: g.birds > 0 ? `${Math.max(1, Math.round((g.birds / liveBirds) * 100))}%` : 0, backgroundColor: DIST_COLORS[i % DIST_COLORS.length] }]}
            />
          ))}
        </View>
        {groups.map((g, i) => {
          const fg = DIST_COLORS[i % DIST_COLORS.length];
          const sp = g.items[0]?.species;
          // Les items regroupés par espèce+type partagent souvent la souche :
          // s'il n'y en a qu'une, on porte son visuel sur l'en-tête du groupe.
          const groupBreeds = [...new Set(g.items.map((b) => b.breedName?.trim()).filter(Boolean))] as string[];
          const groupImg = groupBreeds.length === 1
            ? (BREED_IMAGES[groupBreeds[0]] ?? (sp ? SPECIES_IMAGES[sp] : null))
            : (sp ? SPECIES_IMAGES[sp] : null);
          return (
            <View key={g.label} style={styles.ovSpeciesCard}>
              <View style={styles.ovSpeciesHead}>
                {groupImg ? (
                  <Image source={groupImg} style={styles.ovSpeciesImg} resizeMode="cover" />
                ) : (
                  <View style={[styles.speciesChipDot, { backgroundColor: fg }]} />
                )}
                <AppText size="small" weight="bold" color="text" style={{ flexShrink: 1 }}>{g.label}</AppText>
                <AppText size="caption" weight="bold" color={palette.brand[700]}>{fmt(g.birds)}</AppText>
                <AppText size="caption" weight="semibold" color="faint">{Math.round((g.birds / liveBirds) * 100)}%</AppText>
              </View>
              <View style={styles.ovSpeciesEggs}>
                <Egg size={11} color={palette.accent[500]} />
                <AppText size="caption" weight="semibold" color="accent">
                  {g.eggs > 0 ? `${fmt(g.eggs)} œufs` : 'Aucun œuf collecté'}
                </AppText>
                {g.layRate != null ? <AppText size="caption" weight="semibold" color="faint">{g.layRate.toFixed(0)}% ponte</AppText> : null}
                {g.feedKg > 0 ? <AppText size="caption" weight="semibold" color="faint">{fmt(g.feedKg)} kg alim.</AppText> : null}
              </View>
              {g.items.map((b) => (
                <View key={b.id} style={styles.ovStrainRow}>
                  <View style={{ flex: 1, gap: 1 }}>
                    <AppText size="small" weight="bold" color="text">
                      {[b.breedCode, b.breedName].filter(Boolean).join(' · ') || '—'}
                    </AppText>
                    <AppText size="caption" color="faint">
                      {b.type === 'CHAIR' ? 'Chair' : 'Pondeuse'} · J{b.metrics.ageDays}
                      {b.metrics.fcr != null ? ` · IC ${b.metrics.fcr.toLocaleString('fr-FR')}` : ''}
                      {(b.metrics.eggsCollectedTotal ?? 0) > 0 ? ` · ${fmt(b.metrics.eggsCollectedTotal ?? 0)} œufs` : ''}
                    </AppText>
                  </View>
                  <AppText size="small" weight="bold" color="text">{fmt(b.metrics.liveCount)}</AppText>
                  <AppText size="caption" color="faint" style={{ width: 52, textAlign: 'right' }}>oiseaux</AppText>
                </View>
              ))}
            </View>
          );
        })}
      </View>

      {/* ── ŒUFS PAR ESPÈCE ── */}
      {summary.totalEggs > 0 && (
        <View style={styles.speciesWrap}>
          <View style={styles.speciesSectionTitle}>
            <Egg size={12} color={palette.accent[500]} />
            <AppText size="caption" weight="bold" color={palette.accent[600]}>Œufs par espèce</AppText>
          </View>
          <View style={styles.eggDistBar}>
            {summary.speciesGroups.map((g, i) =>
              g.eggs > 0 ? (
                <View
                  key={g.label}
                  style={[
                    styles.distSeg,
                    { width: `${Math.max(4, Math.round((g.eggs / summary.totalEggs) * 100))}%`, backgroundColor: DIST_COLORS[i % DIST_COLORS.length] },
                  ]}
                />
              ) : null,
            )}
          </View>
          <View style={styles.speciesGrid}>
            {summary.speciesGroups
              .filter((g) => g.eggs > 0)
              .map((g, i) => (
                <View key={g.label} style={styles.speciesChip}>
                  <View style={[styles.speciesChipDot, { backgroundColor: DIST_COLORS[i % DIST_COLORS.length] }]} />
                  <AppText size="caption" weight="semibold" color="muted" numberOfLines={1} style={{ flexShrink: 1 }}>{g.label}</AppText>
                  <AppText size="caption" weight="bold" color={palette.accent[600]}>{fmt(g.eggs)}</AppText>
                  <AppText size="caption" weight="semibold" color="faint">{g.layRate != null ? `${g.layRate.toFixed(0)}% ponte` : '—'}</AppText>
                </View>
              ))}
          </View>
        </View>
      )}

      {/* ── SANITAIRE (vaccins & médicaments, synchro Centre sanitaire) ── */}
      <View style={styles.speciesWrap}>
        <DetailSectionTitle label="Sanitaire" color={lateTotal > 0 ? palette.red[500] : dueTotal > 0 ? palette.amber[500] : palette.green[600]} icon={Syringe} />
        <View style={styles.alertStrip}>
          {lateTotal > 0 && (
            <View style={[styles.alertChip, { backgroundColor: palette.red[50], borderColor: palette.red[200] }]}>
              <AlertTriangle size={12} color={palette.red[500]} />
              <AppText size="small" weight="bold" color={palette.red[500]}>{lateTotal} à traiter</AppText>
            </View>
          )}
          {dueTotal > 0 && (
            <View style={[styles.alertChip, { backgroundColor: palette.amber[50], borderColor: palette.amber[200] }]}>
              <Info size={12} color={palette.amber[500]} />
              <AppText size="small" weight="bold" color={palette.amber[500]}>{dueTotal} à prévoir (7 j)</AppText>
            </View>
          )}
          {lateTotal === 0 && dueTotal === 0 && (
            <View style={[styles.alertChip, { backgroundColor: palette.green[50], borderColor: palette.green[200] }]}>
              <BadgeCheck size={12} color={palette.green[600]} />
              <AppText size="small" weight="bold" color={palette.green[600]}>Tout est à jour</AppText>
            </View>
          )}
        </View>
        {lots.length > 0 && (
          <View style={styles.ovSanCard}>
            <View style={styles.ovSanHead}>
              <View style={styles.ovSanHeadL}>
                <Syringe size={13} color={palette.brand[600]} />
                <AppText size="caption" weight="bold" color="text">Statut par lot</AppText>
              </View>
              <AppText size="caption" color="faint">{lots.length} lot{lots.length > 1 ? 's' : ''}</AppText>
            </View>
            {lots.map((b, i) => {
              const chips = lotCares[i] ?? [];
              const top = chips[0] ?? null;
              const loading = prophylList[i].isLoading || (appliedProgramIds[i] != null && (programList[programIds.indexOf(appliedProgramIds[i]!)]?.isLoading ?? false));
              const tone = top?.tone ?? 'green';
              const fg = tone === 'red' ? palette.red[500] : tone === 'amber' ? palette.amber[500] : palette.green[600];
              const bg = tone === 'red' ? palette.red[50] : tone === 'amber' ? palette.amber[50] : palette.green[50];
              const { action, detail } = top ? splitCareLabel(top.label) : { action: loading ? 'Chargement…' : 'À jour', detail: '' };
              return (
                <View key={b.id} style={[styles.ovSanRow, i < lots.length - 1 && styles.ovSanRowBordered]}>
                  <View style={[styles.ovSanIcon, { backgroundColor: bg }]}>
                    {top ? (tone === 'red' ? <AlertTriangle size={14} color={fg} /> : <Clock size={14} color={fg} />) : loading ? <Clock size={14} color={color.ink[300]} /> : <Check size={14} color={fg} />}
                  </View>
                  <View style={styles.ovSanIdent}>
                    <AppText size="small" weight="bold" color="text">{b.batchName ?? b.id}</AppText>
                    <AppText size="caption" color="faint">{kindLabel(b)} · J{b.metrics.ageDays}</AppText>
                  </View>
                  <View style={styles.ovSanRight}>
                    <AppText size="caption" weight="bold" color={fg}>{action}</AppText>
                    {detail ? <AppText size="caption" color="faint">{detail}</AppText> : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* ── STATUT ── */}
      <View style={styles.bandRow}>
        <BandChip label={`${summary.activeCount} actif(s)`} tone="brand" />
        {summary.sellingCount > 0 && <BandChip label={`${summary.sellingCount} en vente`} tone="accent" />}
      </View>
    </Sheet>
  );
}

function MetricBlock({ label, value, icon: Icon, tone, compact }: { label: string; value: string; icon: typeof Clock; tone: string; compact?: boolean }) {
  const fg = tone === 'red' ? palette.red[500] : tone === 'amber' ? palette.amber[500] : tone === 'green' ? palette.green[600] : tone === 'accent' ? palette.accent[500] : palette.brand[600];
  const bg = tone === 'red' ? palette.red[50] : tone === 'amber' ? palette.amber[50] : tone === 'green' ? palette.green[50] : tone === 'accent' ? palette.accent[50] : palette.brand[50];
  return (
    <View style={[styles.metricBlock, compact && styles.metricBlockCompact, { backgroundColor: bg }]}>
      <Icon size={compact ? 16 : 14} color={fg} />
      <AppText size={compact ? 'caption' : 'body'} weight="bold" color={fg} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{value}</AppText>
      <AppText size={compact ? 'caption' : 'small'} color="muted" numberOfLines={1}>{label}</AppText>
    </View>
  );
}

function PonteMetric({ label = 'Taux de ponte', value, onPress }: { label?: string; value: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.layMetricBlock, pressed && styles.layMetricPressed]}
    >
      <Egg size={11} color={palette.accent[500]} />
      <AppText size="caption" weight="bold" color={palette.accent[600]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{value}</AppText>
      <AppText size="caption" color="muted" numberOfLines={1}>{label}</AppText>
      <View style={styles.layMetricCta}>
        <AppText size="label" weight="bold" color={palette.accent[600]}>Répartition</AppText>
        <ChevronRight size={9} color={palette.accent[600]} />
      </View>
    </Pressable>
  );
}

function BadgeChip({ icon: Icon, value, color }: { icon: typeof Clock; value: string | number; color: string }) {
  return (
    <View style={[styles.headerBadge, { backgroundColor: color + '18', borderColor: color + '40' }]}>
      <Icon size={12} color={color} />
      <AppText size="small" weight="bold" color={color}>{value}</AppText>
    </View>
  );
}

function MiniMetric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Clock }) {
  return (
    <View style={styles.miniMetric}>
      <Icon size={10} color={color.ink[300]} />
      <AppText size="caption" color="muted" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.miniMetricLabel}>{label}</AppText>
      <AppText size="small" weight="bold" color="text" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.miniMetricValue}>{value}</AppText>
    </View>
  );
}

function SecondaryMetric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Clock }) {
  return (
    <View style={styles.secondaryMetric}>
      <Icon size={12} color={color.ink[400]} />
      <View style={styles.secondaryMetricText}>
        <AppText size="small" weight="semibold" color="text" numberOfLines={1} ellipsizeMode="tail" style={{ flexShrink: 1 }}>{value}</AppText>
        <AppText size="small" color="faint" numberOfLines={1} ellipsizeMode="tail" style={{ flexShrink: 1 }}>{label}</AppText>
      </View>
    </View>
  );
}

function BandChip({ label, tone = 'brand' }: { label: string; tone?: 'brand' | 'accent' | 'green' | 'amber' | 'red' | 'muted' }) {
  const dot = tone === 'accent' ? palette.accent[500] : tone === 'green' ? palette.green[600] : tone === 'amber' ? palette.amber[500] : tone === 'red' ? palette.red[500] : tone === 'muted' ? color.ink[300] : palette.brand[500];
  return (
    <View style={styles.bandChip}>
      <View style={[styles.bandChipDot, { backgroundColor: dot }]} />
      <AppText size="caption" color="muted">{label}</AppText>
    </View>
  );
}

function FinanceCell({ label, value, sub, fg, icon: Icon }: { label: string; value: string; sub?: string; fg: string; icon: typeof Wallet }) {
  return (
    <View style={styles.financeCell}>
      <View style={styles.financeCellHead}>
        <Icon size={11} color={fg} />
        <AppText size="caption" weight="semibold" color="faint" numberOfLines={1} style={styles.financeCellLabel}>{label}</AppText>
      </View>
      <AppText size="body" weight="bold" color={fg} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.financeCellValue}>{value}</AppText>
      {sub ? <AppText size="caption" color="faint" numberOfLines={1} style={styles.financeCellSub}>{sub}</AppText> : null}
    </View>
  );
}

function FinanceStat({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  const fg = positive == null ? color.ink[700] : positive ? palette.green[600] : palette.red[500];
  return (
    <View style={styles.financeStat}>
      <AppText size="body" weight="bold" color={fg}>{value}</AppText>
      <AppText size="caption" color="muted">{label}</AppText>
    </View>
  );
}

function FinanceRow({ left, right, caption, divider = false, last = false }: { left: string; right: string; caption?: string; divider?: boolean; last?: boolean }) {
  return (
    <View style={[styles.financeItemRow, divider && !last && styles.financeItemRowDivider]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText size="small" color="text">{left}</AppText>
        {caption ? <AppText size="caption" color="faint">{caption}</AppText> : null}
      </View>
      <AppText size="small" weight="bold" color="text">{right}</AppText>
    </View>
  );
}

function FinanceBlock({ title, icon: Icon, count, children }: { title: string; icon: typeof Wallet; count?: number; children: React.ReactNode }) {
  return (
    <View style={styles.financeBlock}>
      <View style={styles.financeBlockTitle}>
        <View style={styles.financeBlockIcon}>
          <Icon size={13} color={palette.brand[600]} />
        </View>
        <AppText size="small" weight="bold" color="text" style={{ flex: 1 }}>{title}</AppText>
        {count != null ? (
          <View style={styles.financeCountBadge}>
            <AppText size="caption" weight="bold" color="muted">{count}</AppText>
          </View>
        ) : null}
      </View>
      <View style={{ gap: 4 }}>{children}</View>
    </View>
  );
}

function FinanceInfoSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} title='Lire la Finance' onClose={onClose}>
      <View style={{ gap: 12 }}>
        <View style={{ gap: 4 }}>
          <AppText size='small' color='text'>• Recettes : ventes facturées.</AppText>
          <AppText size='small' color='text'>• Encaissé : argent reçu en caisse.</AppText>
          <AppText size='small' color='text'>• Créances : ventes non payées.</AppText>
          <AppText size='small' color='text'>• Net : Recettes − dépenses.</AppText>
        </View>
        <AppText size='small' color='muted'>La barre de date en haut choisit la fenêtre (jour seul ou intervalle).</AppText>
        <AppText size='small' color='muted'>« Détails » liste ventes, dépenses et commandes de la période.</AppText>
      </View>
    </Sheet>
  );
}

// Détail Finance en feuille (pro), même langage que la Vue d'ensemble.
function FinanceSheet({ visible, pnl, sales, expenses, orders, finLabel, onClose }: {
  visible: boolean;
  pnl: OverviewPnl | undefined;
  sales?: SaleSummary[];
  expenses?: Expense[];
  orders?: OrderFull[];
  finLabel: string;
  onClose: () => void;
}) {
  const netFcfa = pnl?.netFcfa ?? 0;
  const netColor = netFcfa >= 0 ? palette.green[600] : palette.red[500];
  const topProducts = pnl?.breakdown.byProduct ?? [];
  const topExpenses = pnl?.breakdown.byExpenseCategory ?? [];
  const byMethod = pnl?.breakdown.byPaymentMethod ?? [];
  const salesList = recentSales(sales);
  const expensesList = recentExpenses(expenses);
  const ordersList = openOrders(orders);

  return (
    <Sheet
      visible={visible}
      title="Finance"
      subtitle={finLabel}
      accentColor={palette.brand[700]}
      icon={
        <View style={[styles.sheetIconTile, { backgroundColor: palette.brand[600] }]}>
          <Wallet size={18} color={palette.brand[50]} />
        </View>
      }
      onClose={onClose}
    >
      <View style={{ gap: 12 }}>
        {/* ── RÉSULTAT NET (hero) + les 3 autres KPI ── */}
        <View style={styles.sheetFinCard}>
          <View style={styles.sheetNetRow}>
            <View style={[styles.sheetNetIcon, { backgroundColor: netFcfa >= 0 ? palette.green[50] : palette.red[50] }]}>
              {netFcfa >= 0 ? <TrendingUp size={16} color={netColor} /> : <TrendingDown size={16} color={netColor} />}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText size="caption" color="muted" numberOfLines={1}>Résultat net</AppText>
              <AppText size="h3" weight="bold" color={netColor} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {compactFcfa(netFcfa)} FCFA
              </AppText>
            </View>
            <View style={[styles.sheetNetPill, { backgroundColor: netFcfa >= 0 ? palette.green[50] : palette.red[50], borderColor: netFcfa >= 0 ? palette.green[200] : palette.red[200] }]}>
              <AppText size="caption" weight="bold" color={netColor}>{netFcfa >= 0 ? 'bénéfice' : 'déficit'}</AppText>
            </View>
          </View>
          <View style={styles.sheetFinDivider} />
          <View style={styles.financeStrip}>
            <FinanceCell label="Recettes" value={compactFcfa(pnl?.sales.totalFcfa ?? 0)} sub={`${pnl?.sales.count ?? 0} vente(s)`} fg={palette.brand[600]} icon={Wallet} />
            <View style={styles.financeDivider} />
            <FinanceCell label="Encaissé" value={compactFcfa(pnl?.collectedFcfa ?? 0)} sub="encaissé" fg={palette.green[600]} icon={Coins} />
            <View style={styles.financeDivider} />
            <FinanceCell
              label="Créances"
              value={compactFcfa(pnl?.outstandingFcfa ?? 0)}
              sub={(pnl?.outstandingFcfa ?? 0) > 0 ? 'reste à encaisser' : 'tout payé'}
              fg={(pnl?.outstandingFcfa ?? 0) > 0 ? palette.amber[500] : palette.green[600]}
              icon={TrendingDown}
            />
          </View>
        </View>

        <FinanceBlock title="Top produits" icon={TrendingUp} count={topProducts.slice(0, 3).length}>
          {topProducts.slice(0, 3).map((p, i) => (
            <FinanceRow
              key={`${p.label}-${i}`}
              left={`${p.label} (${fmt(p.quantity)})`}
              right={compactFcfa(p.amountFcfa)}
              divider
              last={i === topProducts.slice(0, 3).length - 1}
            />
          ))}
          {topProducts.length === 0 && <FinanceRow left="Aucun produit vendu sur la période" right="" divider last />}
        </FinanceBlock>

        <FinanceBlock title="Top dépenses par poste" icon={Receipt} count={topExpenses.slice(0, 4).length}>
          {topExpenses.slice(0, 4).map((c, i) => (
            <FinanceRow
              key={`${c.label}-${i}`}
              left={c.label}
              right={compactFcfa(c.amountFcfa)}
              divider
              last={i === topExpenses.slice(0, 4).length - 1}
            />
          ))}
          {topExpenses.length === 0 && <FinanceRow left="Aucun poste de dépense sur la période" right="" divider last />}
        </FinanceBlock>

        <FinanceBlock title="Encaissements par moyen" icon={Coins} count={byMethod.length}>
          {byMethod.map((m2, i) => (
            <FinanceRow
              key={m2.method}
              left={m2.label}
              right={compactFcfa(m2.amountFcfa)}
              divider
              last={i === byMethod.length - 1}
            />
          ))}
          {byMethod.length === 0 && <FinanceRow left="Aucun encaissement sur la période" right="" divider last />}
        </FinanceBlock>

        <FinanceBlock title="Ventes récentes" icon={PackageCheck} count={salesList.length}>
          {salesList.map((s, i) => (
            <FinanceRow
              key={s.id}
              left={`${s.referenceNumber} · ${s.customer?.fullName ?? 'Comptoir'}`}
              caption={s.saleDate}
              right={compactFcfa(s.totalAmountFcfa)}
              divider
              last={i === salesList.length - 1}
            />
          ))}
          {salesList.length === 0 && <FinanceRow left="Aucune vente sur la période" right="" divider last />}
        </FinanceBlock>

        <FinanceBlock title="Dépenses récentes" icon={Receipt} count={expensesList.length}>
          {expensesList.map((exp, i) => (
            <FinanceRow
              key={exp.id}
              left={exp.label ?? exp.category}
              caption={`${exp.category} · ${exp.expenseDate}`}
              right={compactFcfa(exp.amountFcfa)}
              divider
              last={i === expensesList.length - 1}
            />
          ))}
          {expensesList.length === 0 && <FinanceRow left="Aucune dépense sur la période" right="" divider last />}
        </FinanceBlock>

        <FinanceBlock title="Commandes en cours" icon={ListOrdered} count={ordersList.length}>
          {ordersList.map((o, i) => (
            <FinanceRow
              key={o.id}
              left={`${o.referenceNumber} · ${CANAL_LABELS[o.canal]}`}
              caption={`${STATUS_LABELS[o.status]}${o.depositFcfa > 0 ? ` · acompte ${compactFcfa(o.depositFcfa)}` : ''}`}
              right={compactFcfa(o.totalAmountFcfa)}
              divider
              last={i === ordersList.length - 1}
            />
          ))}
          {ordersList.length === 0 && <FinanceRow left="Aucune commande ouverte" right="" divider last />}
        </FinanceBlock>

        <View style={styles.financeFootnote}>
          <Info size={12} color={palette.brand[500]} />
          <AppText size="caption" color="faint" style={{ flex: 1 }}>
            Encaissé = paiements confirmés sur la période · Net = CA facturé − dépenses
          </AppText>
        </View>
      </View>
    </Sheet>
  );
}

function EggBreakdownSheet({ lot, onClose }: { lot: BatchWithMetrics | null; onClose: () => void }) {
  const b = lot?.metrics.eggBreakdown;
  const collected = b?.collected ?? 0;
  const rows = [
    { key: 'sellable', label: 'Commercialisables', count: b?.sellable ?? 0, color: palette.green[600] },
    { key: 'small', label: 'Petits œufs', count: b?.small ?? 0, color: palette.brand[500] },
    { key: 'doubleYolk', label: 'Double jaune', count: b?.doubleYolk ?? 0, color: palette.amber[500] },
    { key: 'dirty', label: 'Œufs sales', count: b?.dirty ?? 0, color: color.ink[400] },
    { key: 'cracked', label: 'Fêlés / abîmés', count: b?.cracked ?? 0, color: palette.red[500] },
  ];
  const pct = (count: number) => (collected > 0 ? Math.round((count / collected) * 100) : 0);
  return (
    <Sheet
      visible={lot != null}
      title="Répartition des œufs"
      subtitle={lot ? `${lot.batchName ?? 'Lot'} · vie de la bande · J${lot.metrics.ageDays}` : undefined}
      accentColor={palette.accent[500]}
      icon={
        <View style={[styles.sheetIconTile, { backgroundColor: palette.accent[50] }]}>
          <Egg size={20} color={palette.accent[500]} />
        </View>
      }
      onClose={onClose}
    >
      {collected === 0 ? (
        <View style={{ gap: 10 }}>
          <View style={styles.eggTotalPill}>
            <AppText size="body" weight="bold" color="text">0 œuf collecté</AppText>
          </View>
          <AppText size="small" color="muted">Aucun œuf déclaré sur cette bande. La répartition apparaîtra dès les premières saisies.</AppText>
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          <View style={{ gap: 6 }}>
            <View style={styles.eggTotalPill}>
              <Egg size={14} color={palette.accent[500]} />
              <AppText size="body" weight="bold" color="text">{collected.toLocaleString('fr-FR')} œufs collectés</AppText>
            </View>
            <AppText size="caption" color="faint">
              ≈ {Math.floor((b?.sellable ?? 0) / 30).toLocaleString('fr-FR')} alvéoles commercialisables · {pct(b?.sellable ?? 0)}% de qualité
            </AppText>
          </View>

          <View style={styles.eggBar}>
            {rows.map((r) =>
              r.count > 0 ? <View key={r.key} style={[styles.eggBarSeg, { backgroundColor: r.color, flex: r.count }]} /> : null,
            )}
          </View>

          <View style={{ gap: 10 }}>
            {rows.map((r) => (
              <View key={r.key} style={{ gap: 4 }}>
                <View style={styles.eggRow}>
                  <View style={[styles.eggRowDot, { backgroundColor: r.color }]} />
                  <AppText size="small" color="text" style={{ flex: 1 }}>{r.label}</AppText>
                  <AppText size="small" weight="bold" color="text">{r.count.toLocaleString('fr-FR')}</AppText>
                  <AppText size="caption" color="muted" style={styles.eggRowPct}>{pct(r.count)}%</AppText>
                </View>
                <View style={styles.eggRowBar}>
                  <View
                    style={[
                      styles.eggRowBarFill,
                      { backgroundColor: r.color, width: `${collected > 0 ? Math.max(1, (r.count / collected) * 100) : 0}%` },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
          <AppText size="caption" color="faint">Les œufs non commercialisables sont écartés de la vente et des commandes.</AppText>
        </View>
      )}
    </Sheet>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// LOT DETAIL SHEET (aperçu rapide : métriques secondaires, santé, P&L)
// ═══════════════════════════════════════════════════════════════════════

function DetailSectionTitle({ label, color, icon: Icon }: { label: string; color: string; icon: typeof Clock }) {
  return (
    <View style={styles.detailSectionTitle}>
      <View style={[styles.detailSectionTitleDot, { backgroundColor: color }]} />
      <AppText size="small" weight="bold" color="muted" style={styles.detailSectionTitleText}>{label}</AppText>
    </View>
  );
}

function HeroMetric({ label, value, tone, icon: Icon }: { label: string; value: string; tone: string; icon: typeof Clock }) {
  return (
    <View style={styles.heroMetric}>
      <Icon size={13} color={tone} />
      <AppText size="bodyM" weight="bold" color={tone} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</AppText>
      <AppText size="caption" color="muted" numberOfLines={1}>{label}</AppText>
    </View>
  );
}

function PlanCareButton({ onPress }: { onPress: () => void }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 650, useNativeDriver: false }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);
  const bg = pulse.interpolate({ inputRange: [0, 1], outputRange: [palette.green[50], palette.green[100]] });
  const border = pulse.interpolate({ inputRange: [0, 1], outputRange: [palette.green[200], palette.green[400]] });
  const iconBg = pulse.interpolate({ inputRange: [0, 1], outputRange: [palette.green[100], palette.green[200]] });
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Planifier un traitement pour ce lot"
      style={({ pressed }) => [pressed && { opacity: 0.75 }]}
    >
      <Animated.View style={[styles.planCareRow, { backgroundColor: bg, borderColor: border }]}>
        <Animated.View style={[styles.planCareIcon, { backgroundColor: iconBg }]}>
          <Syringe size={13} color={palette.green[600]} />
        </Animated.View>
        <View style={{ flex: 1, gap: 1 }}>
          <AppText size="label" weight="bold" color={palette.green[800]}>
            Aucun soin planifié pour ce lot
          </AppText>
          <AppText size="caption" color="muted">
            Planifiez un traitement (vaccination conseillée)
          </AppText>
        </View>
        <View style={styles.planCareCta}>
          <AppText size="label" weight="bold" color={palette.brand[600]}>Planifier</AppText>
          <ChevronRight size={12} color={palette.brand[600]} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

function LotDetailSheet({ visible, batch, health, pnl, prophylaxis, treatments, program, onClose, onOpenEggs, onPlanCare, slaughterSummary }: {
  visible: boolean; batch: BatchWithMetrics; health?: BatchHealth; pnl?: BatchPnl; prophylaxis?: ProphylaxisEvent[]; treatments?: TreatmentRecord[]; program?: SanitaryProtocolWithSteps; onClose: () => void; onOpenEggs: () => void; onPlanCare?: () => void; slaughterSummary?: LotSlaughterSummary;
}) {
  const router = useRouter();
  const { openDaily, openSale } = useQuickCapture();
  const m = batch.metrics;
  const stage = batchStage(batch);
  const openFull = () => {
    onClose();
    router.push(`/lot/${batch.id}`);
  };
  // Visuel du lot : image de la souche si dispo, sinon espèce.
  const speciesImage = breedImageForLot(batch.breedName, batch.species);
  return (
    <Sheet
      visible={visible}
      title={batch.batchName ?? 'Lot'}
      subtitle={`${[batch.breedCode, batch.breedName, kindLabel(batch)].filter(Boolean).join(' · ')} · ${stage.label} · J${m.ageDays}`}
      accentColor={m.status === 'ROUGE' ? palette.red[500] : m.status === 'JAUNE' ? palette.amber[500] : palette.brand[500]}
      icon={speciesImage ? (
        <View style={styles.sheetIconTile}>
          <Image source={speciesImage} style={styles.sheetIcon} resizeMode="cover" />
        </View>
      ) : (
        <View style={[styles.sheetIconTile, { backgroundColor: palette.brand[50] }]}>
          <Bird size={20} color={palette.brand[600]} />
        </View>
      )}
      onClose={onClose}
      footer={
        <View style={styles.sheetFooter}>
          <View style={styles.sheetActionRow}>
            <Pressable
              onPress={() => {
                onClose();
                openDaily(batch.id);
              }}
              style={({ pressed }) => [styles.sheetActionBtn, pressed && { opacity: 0.8 }]}
              accessibilityRole="button"
            >
              <ClipboardList size={15} color={palette.brand[600]} />
              <AppText size="small" weight="bold" color={palette.brand[600]}>Saisir aujourd&apos;hui</AppText>
            </Pressable>
            <Pressable
              onPress={() => {
                onClose();
                openSale(batch.id);
              }}
              style={({ pressed }) => [styles.sheetActionBtn, pressed && { opacity: 0.8 }]}
              accessibilityRole="button"
            >
              <ShoppingCart size={15} color={palette.accent[600]} />
              <AppText size="small" weight="bold" color={palette.accent[600]}>Vendre</AppText>
            </Pressable>
          </View>
          <Pressable
            onPress={openFull}
            style={({ pressed }) => [styles.sheetPrimaryBtn, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
          >
            <AppText size="body" weight="bold" color="surface">Ouvrir la fiche du lot</AppText>
            <View style={styles.sheetPrimaryBtnIcon}>
              <ChevronRight size={16} color={palette.brand[600]} />
            </View>
          </Pressable>
        </View>
      }
    >
      {slaughterSummary ? (
        <View style={styles.sheetSlaughter}>
          <SlaughterInfoCard summary={slaughterSummary} />
        </View>
      ) : null}
      <LotExpandedDetail batch={batch} health={health} pnl={pnl} prophylaxis={prophylaxis} treatments={treatments} program={program} onOpenEggs={onOpenEggs} onPlanCare={onPlanCare} />
    </Sheet>
  );
}

function LotExpandedDetail({ batch, health, pnl, prophylaxis, treatments, program, onOpenEggs, onPlanCare }: {
  batch: BatchWithMetrics; health?: BatchHealth; pnl?: BatchPnl; prophylaxis?: ProphylaxisEvent[]; treatments?: TreatmentRecord[]; program?: SanitaryProtocolWithSteps; onOpenEggs: () => void; onPlanCare?: () => void;
}) {
  const m = batch.metrics;
  const isLayer = batch.type === 'PONDEUSE';
  const careInsight = nextCareInsight(batch, prophylaxis, treatments, program);
  const hasCareCalendar = (prophylaxis ?? []).some((p) => p.status !== 'ANNULE');
  const chickUnitPrice = pnl && pnl.enrichment.chickCostFcfa != null && batch.quantityAtStart > 0
    ? Math.round(pnl.enrichment.chickCostFcfa / batch.quantityAtStart)
    : null;
  const eb = m.eggBreakdown;
  const eggTotal = eb.collected;
  const eggCracked = eb.cracked;
  const eggCasse = eggTotal > 0 ? Math.round((eggCracked / eggTotal) * 100) : 0;
  const pill = batchStatusPill(batch);

  const pillFg = pill ? STATUS_PILL_TONES[pill.tone].fg : color.ink[500];
  const pillBg = pill ? STATUS_PILL_TONES[pill.tone].bg : palette.surfaceAlt;
  const pillBorder = pill ? STATUS_PILL_TONES[pill.tone].border : palette.border;
  const PillIcon = pill ? pill.icon : Activity;
  const pillLabel = pill ? pill.label : 'En élevage';

  const mortTone =
    normalizeMortalityStatus(m.mortalityStatus, m.mortalityPercent) === 'normal'
      ? palette.green[600]
      : normalizeMortalityStatus(m.mortalityStatus, m.mortalityPercent) === 'elevated'
        ? palette.amber[500]
        : palette.red[500];
  const layTone = m.layRatePercent != null ? palette.accent[600] : color.ink[400];

  const readyTone = m.readyReason === 'READY' ? palette.green[600] : m.readyReason === 'SANITARY' ? palette.red[500] : m.readyReason === 'FCR' ? palette.amber[500] : color.ink[500];
  const readyBg = m.readyReason === 'READY' ? palette.green[50] : m.readyReason === 'SANITARY' ? palette.red[50] : m.readyReason === 'FCR' ? palette.amber[50] : palette.surfaceAlt;
  const readyBorder = m.readyReason === 'READY' ? palette.green[200] : m.readyReason === 'SANITARY' ? palette.red[200] : m.readyReason === 'FCR' ? palette.amber[200] : palette.border;
  const readyIconBg = m.readyReason === 'READY' ? palette.green[100] : m.readyReason === 'SANITARY' ? palette.red[100] : m.readyReason === 'FCR' ? palette.amber[100] : palette.ink[100];
  const readyIcon = m.readyForSale && m.readyReason === 'READY'
    ? <PackageCheck size={16} color={palette.green[600]} />
    : m.readyReason === 'SANITARY'
      ? <AlertTriangle size={16} color={palette.red[500]} />
      : m.readyReason === 'FCR'
        ? <Info size={16} color={palette.amber[500]} />
        : <Clock size={16} color={color.ink[400]} />;
  const readyLabel = READY_REASON_LABELS[m.readyReason];

  return (
    <View style={styles.expandedSection}>
      {/* ── HERO ── */}
      <View style={styles.detailHero}>
        <View style={styles.heroTopRow}>
          <View style={[styles.heroStatus, { backgroundColor: pillBg, borderColor: pillBorder }]}>
            <PillIcon size={13} color={pillFg} />
            <AppText size="small" weight="bold" color={pillFg} numberOfLines={1} style={{ flexShrink: 1 }}>{pillLabel}</AppText>
          </View>
          <BadgeChip icon={CalendarDays} value={`J${m.ageDays}`} color={palette.brand[600]} />
        </View>
        <View style={styles.heroMetrics}>
          <HeroMetric label="Vivants" value={fmt(m.liveCount)} icon={Bird} tone={palette.brand[600]} />
          <View style={styles.heroDivider} />
          <HeroMetric label="Mortalité" value={`${m.mortalityPercent.toLocaleString('fr-FR')} %`} icon={HeartPulse} tone={mortTone} />
          <View style={styles.heroDivider} />
          <HeroMetric
            label={isLayer ? 'Taux de ponte' : 'Œufs'}
            value={m.layRatePercent != null ? `${m.layRatePercent.toLocaleString('fr-FR')} %` : eggTotal > 0 ? fmt(eggTotal) : '—'}
            icon={Egg}
            tone={isLayer ? layTone : eggTotal > 0 ? palette.accent[600] : color.ink[400]}
          />
        </View>
      </View>

      <View style={styles.divider} />

      {/* ── INDICATEURS ── */}
      <DetailSectionTitle label="Indicateurs" icon={Gauge} color={palette.brand[600]} />
      <View style={styles.secondaryGrid}>
        <SecondaryMetric label="IPE" value={m.ipe != null ? m.ipe.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : '—'} icon={Activity} />
        <SecondaryMetric label="Viabilité" value={`${m.viabilityPercent.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`} icon={HeartPulse} />
        <SecondaryMetric label="IC" value={m.fcr != null && m.fcr > 0 ? m.fcr.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '—'} icon={Scale} />
        <SecondaryMetric label="GMQ" value={m.gmqGramsPerDay ? `${m.gmqGramsPerDay.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} g` : '—'} icon={TrendingUp} />
        <SecondaryMetric label="Aliment" value={m.totalFeedKg > 0 ? `${m.totalFeedKg.toLocaleString('fr-FR')} kg` : '—'} icon={Wheat} />
        <SecondaryMetric label="Alim/oiseau" value={health && health.feedPerBirdGrams > 0 ? `${Math.round(health.feedPerBirdGrams)} g/j` : '—'} icon={Droplets} />
        <SecondaryMetric label="Densité" value={m.densityPerM2 ? `${m.densityPerM2.toFixed(1)}/m²` : '—'} icon={Layers} />
      </View>

      {/* ── ŒUFS ── */}
      <View style={styles.divider} />
      <DetailSectionTitle label="Œufs" icon={Egg} color={palette.accent[500]} />
      <View style={styles.panelCellGrid}>
        {isLayer && <PanelCell label="Taux ponte" value={m.layRatePercent != null ? `${m.layRatePercent.toLocaleString('fr-FR')} %` : '—'} icon={Egg} tone="accent" />}
        <PanelCell label="Récolte brute" value={eggTotal > 0 ? fmt(eggTotal) : '—'} icon={PackageCheck} tone="brand" />
        <PanelCell label="Casse" value={eggTotal > 0 ? `${eggCasse} %` : '—'} icon={TrendingDown} tone={eggCasse >= 10 ? 'red' : eggCasse > 0 ? 'amber' : 'green'} />
        <PanelCell label="Fêlés" value={eggTotal > 0 ? fmt(eggCracked) : '—'} icon={AlertTriangle} tone="muted" />
      </View>
      <Pressable
        onPress={onOpenEggs}
        accessibilityRole="button"
        accessibilityLabel="Voir la répartition des œufs"
        style={({ pressed }) => [styles.eggSheetLink, styles.eggSheetFullLink, pressed && { opacity: 0.7 }]}
      >
        <AppText size="small" weight="bold" color="text" style={{ flex: 1 }}>Répartition des œufs par catégorie</AppText>
        <View style={styles.eggSheetLinkTag}>
          <AppText size="label" weight="bold" color={palette.accent[600]}>Ouvrir</AppText>
          <ChevronRight size={9} color={palette.accent[600]} />
        </View>
      </Pressable>

      {/* ── SANTÉ ── */}
      {health && (
        <>
          <View style={styles.divider} />
          <DetailSectionTitle label="Santé" icon={Stethoscope} color={palette.green[600]} />
          <View style={styles.secondaryGrid}>
            {health.waterLPerBird ? <SecondaryMetric label="Eau/oiseau" value={`${health.waterLPerBird} L/j`} icon={Droplets} /> : null}
            <SecondaryMetric label="Morts sem." value={`${m.totalDeaths}`} icon={HeartPulse} />
            {health.healthScore != null && <SecondaryMetric label="Score santé" value={`${health.healthScore}/100`} icon={Stethoscope} />}
          </View>
          {!hasCareCalendar && onPlanCare ? (
            <PlanCareButton onPress={onPlanCare} />
          ) : careInsight && (
            <View style={[styles.tipRow, styles.tipRowCard, { borderColor: careInsight.tone === 'red' ? palette.red[200] : careInsight.tone === 'amber' ? palette.amber[200] : palette.border }]}>
              {careInsight.tone === 'red'
                ? <AlertTriangle size={14} color={palette.red[500]} />
                : careInsight.tone === 'amber'
                  ? <Syringe size={14} color={palette.amber[500]} />
                  : <Syringe size={14} color={palette.green[600]} />}
              <View style={{ flex: 1, gap: 1 }}>
                <AppText size="small" weight="bold" color={careInsight.tone === 'red' ? 'danger' : careInsight.tone === 'amber' ? 'amber' : palette.green[700]}>
                  {careInsight.main}
                </AppText>
                <AppText size="caption" color="muted">{careInsight.sub}</AppText>
              </View>
            </View>
          )}
          {health.tips.length > 0 && (
            <View style={styles.tipList}>
              {health.tips.slice(0, 2).map((tip, i) => (
                <View
                  key={i}
                  style={[styles.tipRow, styles.tipRowCard, { borderColor: tip.level === 'ROUGE' ? palette.red[200] : tip.level === 'JAUNE' ? palette.amber[200] : palette.border }]}
                >
                  {tip.level === 'ROUGE'
                    ? <AlertTriangle size={14} color={palette.red[500]} />
                    : tip.level === 'JAUNE'
                      ? <Info size={14} color={palette.amber[500]} />
                      : <Check size={14} color={palette.green[600]} />}
                  <AppText size="small" color={tip.level === 'ROUGE' ? 'danger' : tip.level === 'JAUNE' ? 'amber' : 'muted'} style={{ flex: 1 }}>{tip.text}</AppText>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {/* ── COMMERCIALISATION ── */}
      <View style={styles.divider} />
      <DetailSectionTitle label="Commercialisation" icon={PackageCheck} color={readyTone} />
      <View style={[styles.readyBanner, { backgroundColor: readyBg, borderColor: readyBorder }]}>
        <View style={[styles.readyBannerIcon, { backgroundColor: readyIconBg }]}>
          {readyIcon}
        </View>
        <View style={{ flex: 1 }}>
          <AppText size="small" weight="bold" color={readyTone}>{readyLabel}</AppText>
          {m.readyForSale && batch.readyForSaleAt ? (
            <AppText size="caption" color="muted">Disponible depuis le {dateFr(batch.readyForSaleAt)}</AppText>
          ) : null}
        </View>
        <ChevronRight size={18} color={color.ink[300]} />
      </View>

      {/* ── RÉSULTAT DU LOT ── */}
      {pnl && (
        <>
          <View style={styles.divider} />
          <DetailSectionTitle label="Résultat du lot" icon={Wallet} color={palette.accent[600]} />
          <View style={styles.pnlCard}>
            <View style={styles.pnlHead}>
              <AppText size="small" weight="bold" color="text">{fmt(pnl.birdsSold)} oiseaux vendus</AppText>
              <AppText size="caption" color="faint">{fmt(pnl.kgSold)} kg · {fmt(pnl.eggsSold)} œufs</AppText>
            </View>
            <View style={styles.financeStatRow}>
              <FinanceStat label="Revenus" value={compactFcfa(pnl.revenueFcfa)} />
              <FinanceStat label="Coûts" value={compactFcfa(pnl.expensesFcfa)} />
              <FinanceStat label="Net" value={compactFcfa(pnl.netFcfa)} positive={pnl.netFcfa >= 0} />
              {pnl.marginPct != null && <FinanceStat label="Marge" value={`${pnl.marginPct.toLocaleString('fr-FR')} %`} />}
            </View>
            {(pnl.costPerKgFcfa != null || pnl.enrichment.chickCostFcfa != null || pnl.enrichment.feedLotsCostFcfa != null) && (
              <View style={styles.financeFootRow}>
                {pnl.costPerKgFcfa != null && (
                  <View style={styles.financeFootCell}>
                    <AppText size="caption" color="faint">Coût de revient</AppText>
                    <AppText size="small" weight="bold" color="text">{pnl.costPerKgFcfa.toLocaleString('fr-FR')} FCFA/kg</AppText>
                  </View>
                )}
                {(pnl.enrichment.chickCostFcfa != null || pnl.enrichment.feedLotsCostFcfa != null) && (
                  <View style={[styles.financeFootCell, styles.financeFootCellRight]}>
                    <AppText size="caption" color="faint">Intrants</AppText>
                    <AppText size="small" weight="bold" color="text">
                      poussins {compactFcfa(pnl.enrichment.chickCostFcfa ?? 0)}
                      {chickUnitPrice != null ? ` (${chickUnitPrice.toLocaleString('fr-FR')} FCFA/u)` : ''}
                      {pnl.enrichment.feedLotsCostFcfa != null ? ` · aliments ${compactFcfa(pnl.enrichment.feedLotsCostFcfa)}` : ''}
                    </AppText>
                  </View>
                )}
              </View>
            )}
          </View>
          {pnl.breakdown.byProduct.length > 0 && (
            <>
              <View style={styles.divider} />
              <AppText size="small" weight="bold" color="muted">Ventes par produit</AppText>
              {pnl.breakdown.byProduct.map((p, i) => (
                <FinanceRow key={`${p.label}-${i}`} left={`${p.label} (${fmt(p.quantity)})`} right={compactFcfa(p.amountFcfa)} />
              ))}
            </>
          )}
          {pnl.breakdown.byExpenseCategory.length > 0 && (
            <>
              <View style={styles.divider} />
              <AppText size="small" weight="bold" color="muted">Dépenses par poste</AppText>
              {pnl.breakdown.byExpenseCategory.map((c, i) => (
                <FinanceRow key={`${c.label}-${i}`} left={c.label} right={compactFcfa(c.amountFcfa)} />
              ))}
            </>
          )}
        </>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  headerLogo: {
    width: 38,
    height: 38,
  },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: palette.brand[600], borderRadius: radii.pill,
    paddingHorizontal: 12, paddingVertical: 6,
  },

  // Stats tiles (ferme) — cartes pro
  slimTileRow: { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 4 },
  slimTile: {
    flex: 1,
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.lg,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 2,
  },
  slimTileHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: 4 },
  slimTileTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  slimTileIcon: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  slimTileTitle: { fontSize: 9.5, lineHeight: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  slimTileCount: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 1, borderRadius: radii.pill, borderWidth: 1 },
  slimTileCountText: { fontSize: 9, lineHeight: 11, fontWeight: '700' },
  slimTileValue: { fontSize: 26, lineHeight: 30, fontWeight: '800' },
  slimTileCaption: { fontSize: 10, lineHeight: 13 },
  slimTileDivider: { height: 1, backgroundColor: palette.border, marginVertical: 8, alignSelf: 'stretch' },
  slimTileBar: { flexDirection: 'row', height: 6, borderRadius: radii.pill, overflow: 'hidden', backgroundColor: palette.border, marginBottom: 6 },
  slimTileBarSeg: { height: '100%' },
  slimTileLegend: { flexDirection: 'row', gap: 8 },
  slimTileLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  slimTileLegendDot: { width: 6, height: 6, borderRadius: 3 },
  slimTileLegendText: { fontSize: 9.5, lineHeight: 12, fontWeight: '600' },

  // Stats panel (Vue d'ensemble)
  statsCard: { gap: 10, marginTop: 16, marginBottom: 8 },
  statsEmpty: { alignItems: 'center', gap: 2, paddingVertical: 8 },
  panelHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  panelHeaderIcon: { width: 24, height: 24, borderRadius: 8, backgroundColor: palette.brand[50], alignItems: 'center', justifyContent: 'center' },
  ovHeaderLogo: { width: 14, height: 14, tintColor: '#FFFFFF' },
  ovSheetLogo: { width: 22, height: 22, tintColor: '#FFFFFF' },
  summaryPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: palette.surfaceAlt },
  panelCellGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  panelCell: { flexBasis: '46%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0, padding: 10, borderRadius: radii.lg },
  panelCellIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  panelCellText: { flex: 1, gap: 0, minWidth: 0 },
  panelHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelHeaderRowActive: { backgroundColor: palette.brand[50], borderRadius: radii.lg, paddingHorizontal: 8, paddingVertical: 6 },
  panelHeaderIconActive: { backgroundColor: palette.brand[600] },
  summaryPillActive: { backgroundColor: palette.brand[600] },
  panelChevron: { width: 24, height: 24, borderRadius: 8, backgroundColor: palette.brand[50], alignItems: 'center', justifyContent: 'center' },
  panelChevronActive: { backgroundColor: palette.brand[600] },
  alertStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  alertChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.pill, borderWidth: 1, flexShrink: 0 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: palette.ink[100], overflow: 'hidden' },
  readyFill: { height: '100%', borderRadius: 3 },
  readyShareRight: { alignItems: 'flex-end', gap: 2 },
  readyGoto: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  speciesWrap: { gap: 8 },
  speciesSectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  distBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: palette.ink[100] },
  eggDistBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: palette.accent[50] },
  distSeg: { height: '100%' },
  bandRow: { flexBasis: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  bandChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: palette.surfaceAlt },
  bandChipDot: { width: 5, height: 5, borderRadius: 3 },
  speciesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  speciesChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: palette.brand[50], borderWidth: 1, borderColor: palette.brand[100] },
  speciesChipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.brand[500] },
  ovFeedRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: radii.lg, backgroundColor: palette.brand[50], borderWidth: 1, borderColor: palette.brand[100] },
  ovFeedStat: { flex: 1, gap: 2 },
  ovFeedDivider: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: palette.brand[100] },
  ovMetaRow: { flexDirection: 'row', alignItems: 'center' },
  ovMetaChip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', padding: 6 },
  ovMetaDivider: { width: 1, height: 10, backgroundColor: palette.border },
  ovLiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.green[500] },
  ovMetaNote: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 6, paddingBottom: 2 },
  ovRevenueCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radii.lg, backgroundColor: palette.surfaceAlt, borderWidth: 1, borderColor: palette.border },
  ovRevenueIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: palette.brand[50], alignItems: 'center', justifyContent: 'center' },
  ovSpeciesCard: { gap: 2, padding: 8, borderRadius: radii.lg, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.border },
  ovSpeciesHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 4 },
  ovSpeciesImg: { width: 28, height: 28, borderRadius: 8 },
  ovSpeciesEggs: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingBottom: 4 },
  ovStrainRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
  ovSanCard: { borderRadius: radii.lg, borderWidth: 1, borderColor: palette.border, overflow: 'hidden', backgroundColor: palette.paper },
  ovSanHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 9, backgroundColor: palette.surfaceAlt, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
  ovSanHeadL: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ovSanRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, minWidth: 0 },
  ovSanRowBordered: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
  ovSanIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  ovSanIdent: { flex: 1, gap: 1, minWidth: 0 },
  ovSanRight: { alignItems: 'flex-end', gap: 2, flexShrink: 1, maxWidth: '54%', minWidth: 0 },
  readyBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: radii.lg, borderWidth: 1 },
  readyBannerOn: { backgroundColor: palette.green[50], borderColor: palette.green[200] },
  readyBannerOff: { backgroundColor: palette.surfaceAlt, borderColor: palette.border },
  readyBannerIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  readyBannerIconOn: { backgroundColor: palette.green[100] },
  readyBannerIconOff: { backgroundColor: palette.ink[100] },

  // Controls
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 10, paddingHorizontal: 12, paddingVertical: 9, borderRadius: radii.lg, backgroundColor: palette.surfaceAlt, borderWidth: 1, borderColor: palette.border },
  searchInput: { flex: 1, fontSize: 14, color: color.ink[700], padding: 0 },
  controlRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  filterScrollView: { flex: 1 },
  filterScroll: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: palette.surfaceAlt, borderWidth: 1, borderColor: palette.border },
  filterChipCompact: { paddingHorizontal: 10, paddingVertical: 5 },
  filterChipActive: { backgroundColor: palette.brand[600], borderColor: palette.brand[600] },
  filterDot: { width: 8, height: 8, borderRadius: 4 },
  filterChipCount: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: radii.pill, backgroundColor: 'rgba(32, 96, 128, 0.10)', minWidth: 18, alignItems: 'center' },
  filterChipCountCompact: { minWidth: 16, paddingHorizontal: 5 },
  filterChipCountActive: { backgroundColor: 'rgba(255, 255, 255, 0.22)' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filterSection: { gap: 6 },
  sortToggle: { padding: 8, borderRadius: radii.md, backgroundColor: palette.surfaceAlt, position: 'relative' },
  sortToggleActive: { backgroundColor: palette.brand[50], borderWidth: 1, borderColor: palette.brand[200] },
  advancedDot: { position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: 4, backgroundColor: palette.brand[600] },
  sortChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: palette.surfaceAlt, borderWidth: 1, borderColor: palette.border },
  sortChipActive: { backgroundColor: palette.brand[50], borderColor: palette.brand[200] },

  // Lot card
  lotCard: { padding: 10, gap: 6, overflow: 'hidden' },
  lotHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  speciesTile: { width: 40, height: 40, borderRadius: radii.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  speciesTileImg: { width: 40, height: 40, borderRadius: radii.md },
  speciesTileFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', padding: 4 },
  speciesTileText: { textAlign: 'center' },
  lotHeaderMid: { flex: 1, minWidth: 0, gap: 1 },
  lotHeaderRight: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 3 },
  chipRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', maxWidth: '100%', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, borderWidth: 1 },
  stageChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', maxWidth: '100%', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, borderWidth: 1 },
  buildingChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', maxWidth: '100%', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, borderWidth: 1 },
  buildingChipText: { maxWidth: 140, flexShrink: 1 },
  careStack: { gap: 4 },
  careRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.md },
  nextVaccineRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radii.md, borderWidth: 1 },
  planCareRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 6, borderRadius: radii.md, backgroundColor: palette.accent[50], borderWidth: 1, borderColor: palette.accent[100] },
  planCareIcon: { width: 24, height: 24, borderRadius: radii.sm, backgroundColor: palette.accent[100], alignItems: 'center', justifyContent: 'center' },
  planCareCta: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: palette.paper },
  careDonePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: palette.green[100], paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill },
  headerBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },

  // Progress bar
  progressWrap: { gap: 3 },
  progressBar: { height: 3, borderRadius: 2, backgroundColor: palette.surfaceAlt, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },

  // Metrics
  metricRow: { flexDirection: 'row', gap: 4 },
  metricBlock: { flex: 1, alignItems: 'center', gap: 2, padding: 8, borderRadius: radii.md },
  metricBlockCompact: { padding: 4, gap: 1, borderRadius: radii.sm, justifyContent: 'center' },
  layMetricBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    padding: 4,
    borderRadius: radii.sm,
    backgroundColor: palette.accent[50],
    borderWidth: 1,
    borderColor: palette.accent[200],
  },
  layMetricPressed: { opacity: 0.65, backgroundColor: palette.accent[100] },
  layMetricCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: palette.accent[100],
    borderRadius: radii.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
  eggSheetLink: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.accent[50],
    borderWidth: 1,
    borderColor: palette.accent[200],
    borderRadius: radii.md,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  eggSheetLinkTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: palette.accent[100],
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
  },
  eggSheetFullLink: { paddingVertical: 8 },
  eggTotalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: palette.accent[50],
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  eggBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: radii.pill,
    overflow: 'hidden',
    backgroundColor: palette.surfaceAlt,
  },
  eggBarSeg: {},
  eggRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  eggRowBar: {
    height: 4,
    borderRadius: radii.pill,
    overflow: 'hidden',
    backgroundColor: palette.surfaceAlt,
  },
  eggRowBarFill: { height: 4, borderRadius: radii.pill },
  eggRowDot: { width: 10, height: 10, borderRadius: radii.pill },
  eggRowPct: { width: 40, textAlign: 'right' },
  miniMetricRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniMetric: { flex: 1, minWidth: 0, alignItems: 'center', gap: 1 },
  miniMetricLabel: { fontSize: 8.5, lineHeight: 11, textAlign: 'center' },
  miniMetricValue: { fontSize: 11, lineHeight: 15, textAlign: 'center' },
  expandPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.pill },

  // Lot detail sheet
  sheetIconTile: { width: 42, height: 42, borderRadius: radii.md, backgroundColor: palette.brand[50], alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sheetIcon: { width: 42, height: 42 },
  sheetFooter: { gap: 8 },
  sheetActionRow: { flexDirection: 'row', gap: 8 },
  sheetActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radii.lg, backgroundColor: palette.surfaceAlt, borderWidth: 1, borderColor: palette.border, paddingVertical: 11, paddingHorizontal: 8 },
  sheetPrimaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: radii.lg, backgroundColor: palette.brand[600], paddingVertical: 14, paddingHorizontal: 16 },
  sheetPrimaryBtnIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: palette.paper, alignItems: 'center', justifyContent: 'center' },

  // Expanded
  expandedSection: { gap: 12 },
  divider: { height: 1, backgroundColor: palette.border, marginVertical: 2 },
  detailSectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  detailSectionTitleDot: { width: 4, height: 14, borderRadius: 2 },
  detailSectionTitleText: { letterSpacing: 0.5, textTransform: 'uppercase' },
  detailHero: { backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.border, borderRadius: radii.lg, padding: 12, gap: 10 },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heroStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.pill, borderWidth: 1, maxWidth: '72%' },
  heroMetrics: { flexDirection: 'row', alignItems: 'stretch' },
  heroMetric: { flex: 1, alignItems: 'center', gap: 1, minWidth: 0 },
  heroDivider: { width: 1, backgroundColor: palette.border, marginVertical: 2 },
  secondaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  secondaryMetric: { flexDirection: 'row', alignItems: 'center', gap: 6, flexBasis: '46%', flexGrow: 1, minWidth: 0, backgroundColor: palette.surfaceAlt, borderRadius: radii.lg, paddingVertical: 8, paddingHorizontal: 10 },
  secondaryMetricText: { flex: 1, minWidth: 0 },
  tipList: { gap: 6 },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  tipRowCard: { flex: 1, paddingVertical: 10, paddingHorizontal: 10, borderRadius: radii.lg, borderWidth: 1, backgroundColor: palette.paper },
  pnlCard: { gap: 10, padding: 12, borderRadius: radii.lg, backgroundColor: palette.surfaceAlt, borderWidth: 1, borderColor: palette.border },
  pnlHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  financeFootRow: { flexDirection: 'row', gap: 10 },
  financeFootCell: { flex: 1, gap: 2 },
  financeFootCellRight: { alignItems: 'flex-end' },

  // Finance section (KPI strip + détail)
  financeWrap: { gap: 2 },
  financeHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  financeHeadPressed: { opacity: 0.85 },
  financeHeadIcon: { width: 26, height: 26, borderRadius: 8, backgroundColor: palette.brand[50], alignItems: 'center', justifyContent: 'center' },
  financeHelpBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: palette.brand[50],
    borderWidth: 1, borderColor: palette.brand[200],
    alignItems: 'center', justifyContent: 'center',
  },
  financeHelpBtnPressed: { opacity: 0.7 },
  financeToggleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: palette.brand[50],
    borderWidth: 1, borderColor: palette.brand[200],
  },
  financeCard: { paddingVertical: 10, paddingHorizontal: 4, marginTop: 2 },
  financeStrip: { flexDirection: 'row', alignItems: 'stretch' },
  financeDivider: { width: 1, alignSelf: 'stretch', backgroundColor: palette.border, marginVertical: 2 },
  financeCell: { flex: 1, minWidth: 0, gap: 1, paddingHorizontal: 8, paddingVertical: 2 },
  financeCellHead: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  financeCellLabel: { fontSize: 9, lineHeight: 12, textTransform: 'uppercase', letterSpacing: 0.3, flexShrink: 1 },
  financeCellValue: { fontSize: 13, lineHeight: 16 },
  financeCellSub: { fontSize: 9.5, lineHeight: 12 },
  financeCardFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8, paddingTop: 8, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: palette.border },
  compareChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: radii.pill, borderWidth: 1,
  },
  compareChipUp: { backgroundColor: palette.green[50], borderColor: palette.green[200] },
  compareChipDown: { backgroundColor: palette.red[50], borderColor: palette.red[200] },
  sheetFinCard: { backgroundColor: palette.surfaceAlt, borderRadius: radii.lg, padding: 12, gap: 10 },
  sheetNetRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sheetNetIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sheetNetPill: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: radii.pill, borderWidth: 1,
  },
  sheetFinDivider: { height: 1, backgroundColor: palette.border },
  sheetSlaughter: { marginBottom: 12 },
  financeFootnote: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderTopWidth: 1, borderTopColor: palette.border,
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12,
  },
  financeHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  financeStatRow: { flexDirection: 'row', gap: 8 },
  financeStat: { flex: 1, alignItems: 'center', gap: 1, padding: 8, borderRadius: radii.md, backgroundColor: palette.paper },
  financeBlock: { gap: 8 },
  financeBlockTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  financeBlockIcon: { width: 24, height: 24, borderRadius: 7, backgroundColor: palette.brand[50], alignItems: 'center', justifyContent: 'center' },
  financeCountBadge: { minWidth: 20, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: palette.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  financeItemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 },
  financeItemRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border, paddingBottom: 7, marginBottom: 4 },

  // Readiness
  readyLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pnlHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  // Bottom
  lotBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 6 },

  // Empty state
  emptyEmojiCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: palette.brand[50],
    alignItems: 'center', justifyContent: 'center',
    marginTop: 4,
  },
  emptyEmoji: { fontSize: 32 },
  emptyTitle: { textAlign: 'center' },
  emptyDesc: { textAlign: 'center', lineHeight: 18 },
  emptySteps: { alignSelf: 'stretch', gap: 8, marginTop: 4 },
  emptyStep: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emptyStepIcon: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyStepIconDone: { backgroundColor: palette.green[50] },
  emptyWarn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: palette.amber[50],
    borderWidth: 1, borderColor: palette.amber[200],
    borderRadius: radii.md,
    padding: 10,
    alignSelf: 'stretch',
  },
});

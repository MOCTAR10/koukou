import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as Haptics from 'expo-haptics';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  Check,
  CheckCircle2,
  CalendarDays,
  Copy,
  Droplets,
  Egg,
  EggOff,
  Info,
  Lightbulb,
  RefreshCw,
  Scale,
  Shrink,
  Skull,
  Target,
  Truck,
  Wheat,
  type LucideIcon,
} from 'lucide-react-native';

import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { NumberInput } from '../ui/NumberInput';
import { Segmented } from '../ui/Segmented';
import { StepProgress, type StepDef } from '../ui/StepProgress';
import { useAuth } from '@/auth/AuthContext';
import { fetchBatches, fetchBreedStandards, fetchDailyEntries, fetchFeedStock } from '@/api';
import { invalidateFarmQueries } from '@/api/invalidate';
import { FEED_PHASE_LABELS } from '@/api/format';
import { buildDailyEntryPayload, todayStr, type DailyEntryValues } from '@/api/mutations';
import type { BatchWithMetrics, FeedPhase } from '@/api/types';
import { queueDailyEntry } from '@/offline';
import { color, palette, radii, spacing } from '@/constants/theme';
import { breedImageForLot } from '@/constants/breedImages';
import { EGGS_PER_ALVEOL, FEED_STOCK_CRITICAL_DAYS, FEED_STOCK_WARN_DAYS } from '@/constants/stock';
import { estimateDailyFeedPerBirdKg, type FeedRecommendation } from '@/zootechnics/feed-recommendation';

interface DailyEntrySheetProps {
  initialBatchId?: string;
  onClose: () => void;
  /** Reçoit l'indicateur d'étapes à afficher en zone fixe du Sheet (ne défile pas). */
  onStickyChange?: (node: React.ReactNode) => void;
  /** Reçoit la barre d'actions (Retour / Suivant / Enregistrer) à fixer en pied de Sheet. */
  onFooterChange?: (node: React.ReactNode) => void;
}

const baseline: DailyEntryValues = {
  deaths: 0,
  feedKg: 0,
  feedSacs: 0,
  bagSizeKg: 50,
  waterL: 0,
  weightG: 0,
  eggs: 0,
  eggsCracked: 0,
  eggsSmall: 0,
  eggsDoubleYolk: 0,
  eggsDirty: 0,
  feedPhase: null,
  inputLotId: null,
  skipStockDeduction: false,
};

/** Tailles de sacs de provende proposées lors d'une saisie en sacs. */
const BAG_SIZES = [10, 25, 40, 50];

const STEPS: StepDef[] = [
  { key: 'morts', label: 'Morts', icon: <Skull size={15} color={palette.red[600]} strokeWidth={2.3} /> },
  { key: 'aliments', label: 'Aliments\n& Eau', icon: <Wheat size={15} color={color.amber[600]} strokeWidth={2.3} /> },
  { key: 'oeufs', label: 'Œufs', icon: <Egg size={15} color={color.accent[500]} strokeWidth={2.3} /> },
  { key: 'poids', label: 'Poids', icon: <Scale size={15} color={palette.green[600]} strokeWidth={2.3} /> },
];

/** Phase conseillée selon l'âge du lot (même logique que la création de lot). */
function suggestedPhaseFor(b: BatchWithMetrics | undefined): FeedPhase {
  if (!b) return 'DEMARRAGE';
  const age = b.metrics.ageDays;
  if (b.type === 'PONDEUSE') {
    if (age <= 10) return 'POUSSIN';
    if (age <= 24) return 'DEMARRAGE';
    if (age <= 112) return 'CROISSANCE';
    if (age <= 126) return 'PRE_PONTE';
    return 'PONTE_PHASE_1';
  }
  if (age <= 10) return 'POUSSIN';
  if (age <= 24) return 'DEMARRAGE';
  if (age <= 35) return 'CROISSANCE';
  return 'FINITION';
}

/** Phases pertinentes pour le type de lot (au lieu des 9 d'office). */
function phasesForLot(b: BatchWithMetrics | undefined): FeedPhase[] {
  if (!b) return ['DEMARRAGE'];
  return b.type === 'PONDEUSE'
    ? ['POUSSIN', 'DEMARRAGE', 'CROISSANCE', 'PRE_PONTE', 'PONTE_PHASE_1', 'PONTE_PHASE_2', 'PONTE_PHASE_3', 'PERSONNALISE']
    : ['POUSSIN', 'DEMARRAGE', 'CROISSANCE', 'FINITION', 'PERSONNALISE'];
}

/** Date locale YYYY-MM-DD (sans décalage UTC). */
function fmtLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + days);
  return c;
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function fmtDayShort(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/** Écart (jours) entre deux dates ISO. */
function utcDaysBetween(fromDate: string, toDate: string): number {
  const [fy, fm, fd] = fromDate.split('-').map(Number);
  const [ty, tm, td] = toDate.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** Borne les phases à celle du lot quand la phase saisie n'existe plus. */
function normalizePhase(phase: FeedPhase | null | undefined, allowed: FeedPhase[]): FeedPhase | null {
  return phase && allowed.includes(phase) ? phase : null;
}

// ── Sous-composants ──────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  done,
  accent = color.brand[600],
  right,
}: {
  icon: LucideIcon;
  title: string;
  done: boolean;
  accent?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHead}>
      <View style={[styles.sectionIcon, { backgroundColor: `${accent}14` }]}>
        <Icon size={15} color={accent} strokeWidth={2.3} />
      </View>
      <AppText size="body" weight="bold" color="text" style={{ flex: 1 }}>
        {title}
      </AppText>
      {right}
      {done ? <CheckCircle2 size={17} color={palette.green[600]} /> : null}
    </View>
  );
}

/** Libellé de champ avec icône (alvéoles/écarts) ou image (photo de la collecte). */
function FieldIconLabel({
  icon: Icon,
  image,
  label,
  tint,
}: {
  icon?: LucideIcon;
  image?: ImageSourcePropType;
  label: string;
  tint: string;
}) {
  return (
    <View style={styles.fieldLabelRow}>
      {image ? (
        <Image source={image} style={styles.fieldLabelImg} resizeMode="contain" />
      ) : Icon ? (
        <Icon size={13} color={tint} strokeWidth={2.3} />
      ) : null}
      <AppText size="caption" color="muted">{label}</AppText>
    </View>
  );
}

function Hint({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'amber' | 'danger' | 'success' | 'brand' }) {
  const c =
    tone === 'amber' ? palette.amber[700]
    : tone === 'danger' ? palette.red[600]
    : tone === 'success' ? palette.green[600]
    : tone === 'brand' ? palette.brand[600]
    : color.ink[500];
  return (
    <AppText size="small" style={{ color: c, lineHeight: 17 }}>
      {children}
    </AppText>
  );
}

/** Encadré de conseil (aiguille l'utilisateur, non bloquant). */
function TipBox({ icon: Icon, tone = 'brand', children }: { icon: LucideIcon; tone?: 'brand' | 'amber' | 'success'; children: React.ReactNode }) {
  const bg = tone === 'amber' ? color.amber[50] : tone === 'success' ? palette.green[50] : palette.brand[50];
  const fg = tone === 'amber' ? palette.amber[700] : tone === 'success' ? palette.green[700] : palette.brand[700];
  return (
    <View style={[styles.tipBox, { backgroundColor: bg, borderColor: `${fg}22` }]}>
      <Icon size={15} color={fg} strokeWidth={2.3} />
      <AppText size="small" style={{ color: fg, flex: 1, lineHeight: 17 }}>
        {children}
      </AppText>
    </View>
  );
}

/** Mini KPI aligné + tendance (▲/▼ vs référence). */
function Kpi({
  icon: Icon,
  label,
  value,
  deltaPct,
  deltaTone = 'auto',
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  deltaPct?: number | null;
  deltaTone?: 'auto' | 'success' | 'danger';
}) {
  const up = deltaPct != null && deltaPct > 0;
  const flat = deltaPct == null;
  const c = deltaPct == null
    ? color.ink[300]
    : deltaTone === 'auto'
      ? up ? palette.green[600] : palette.red[600]
      : deltaTone === 'success' ? palette.green[600] : palette.red[600];
  return (
    <View style={styles.kpi}>
      <View style={[styles.kpiIcon, { backgroundColor: `${color.ink[500]}14` }]}>
        <Icon size={13} color={color.ink[500]} strokeWidth={2.3} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText size="caption" color="faint">{label}</AppText>
        <AppText size="small" weight="bold" color="text">{value}</AppText>
        {flat ? null : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            {up ? <ArrowUpRight size={10} color={c} /> : <ArrowDownRight size={10} color={c} />}
            <AppText size="caption" style={{ color: c }}>{Math.abs(deltaPct ?? 0).toFixed(0)}%</AppText>
          </View>
        )}
      </View>
    </View>
  );
}

/** Normes eau/aliment : litres d'eau bus pour 1 kg d'aliment distribué. */
const WATER_MIN = 1.5;
const WATER_LO = 1.8;
const WATER_HI = 2.6;
const WATER_MAX = 2.7;

const fmtRatio = (n: number) => n.toFixed(1).replace('.', ',');

/** Insight eau/aliment : norme 1,8–2,6 L pour 1 kg d'aliment, valeur + marqueur + lecture simple. */
function RatioBar({ ratio }: { ratio: number }) {
  const toPct = (x: number) => Math.max(0, Math.min(1, (x - WATER_MIN) / (WATER_MAX - WATER_MIN)));
  const pct = toPct(ratio);
  const loPct = toPct(WATER_LO);
  const hiPct = toPct(WATER_HI);
  const zone =
    ratio < WATER_LO ? (ratio < 1.2 ? 'lowCritical' : 'low')
    : ratio > WATER_HI ? (ratio > 3.5 ? 'highCritical' : 'high')
    : 'ok';
  const zColor = zone === 'ok' ? palette.green[600] : zone === 'low' || zone === 'high' ? palette.amber[600] : palette.red[600];
  const badge =
    zone === 'ok' ? 'Dans la norme'
    : zone === 'low' ? 'Eau faible'
    : zone === 'lowCritical' ? 'Eau critique'
    : zone === 'high' ? 'Eau en excès'
    : 'Excès critique';
  const message =
    zone === 'ok'
      ? 'Consommation d’eau normale pour l’aliment distribué.'
      : zone === 'low'
        ? 'Eau faible pour l’aliment donné — vérifiez les abreuvoirs et la santé du lot (l’eau chute toujours en premier).'
        : zone === 'lowCritical'
          ? 'Eau nettement insuffisante — risque de déshydratation, agir sans attendre.'
          : zone === 'high'
            ? 'Au-dessus de la norme — fuite d’abreuvoir ou forte chaleur (fréquent en climat chaud).'
            : 'Excès d’eau très marqué — vérifiez les fuites d’abreuvoirs.';

  return (
    <View style={styles.ratioWrap}>
      <View style={styles.ratioHead}>
        <View style={{ flex: 1 }}>
          <AppText size="caption" color="faint">Eau bue / aliment donné (L par kg)</AppText>
          <AppText size="body" weight="bold" style={{ color: zColor }}>{fmtRatio(ratio)} ×</AppText>
        </View>
        <View style={[styles.ratioBadge, { backgroundColor: `${zColor}1A` }]}>
          <AppText size="caption" weight="bold" style={{ color: zColor }}>{badge}</AppText>
        </View>
      </View>

      <View style={styles.ratioArea}>
        <View style={styles.ratioTrack}>
          <View style={[styles.ratioZone, { left: 0, width: `${loPct * 100}%`, backgroundColor: color.amber[50] }]} />
          <View style={[styles.ratioZone, { left: `${loPct * 100}%`, width: `${(hiPct - loPct) * 100}%`, backgroundColor: palette.green[100] }]} />
          <View style={[styles.ratioZone, { left: `${hiPct * 100}%`, width: `${(1 - hiPct) * 100}%`, backgroundColor: color.amber[50] }]} />
          <View style={[styles.ratioTick, { left: `${loPct * 100}%` }]} />
          <View style={[styles.ratioTick, { left: `${hiPct * 100}%` }]} />
        </View>
        <View style={[styles.ratioDot, { left: `${pct * 100}%`, backgroundColor: zColor }]} />
      </View>

      <View style={styles.ratioScale}>
        <AppText size="caption" color="faint" style={styles.ratioScaleEnd}>1,5</AppText>
        <AppText size="caption" color="faint" style={[styles.ratioScaleTick, { left: `${loPct * 100}%` }]}>1,8</AppText>
        <AppText size="caption" color="faint" style={[styles.ratioScaleTick, { left: `${hiPct * 100}%` }]}>2,6</AppText>
        <AppText size="caption" color="faint" style={[styles.ratioScaleEnd, styles.ratioScaleEndRight]}>2,7+</AppText>
      </View>

      <Hint tone={zone === 'ok' ? 'success' : zone === 'low' || zone === 'high' ? 'amber' : 'danger'}>{message}</Hint>
    </View>
  );
}

function fmtAdviceKg(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString('fr-FR') : n.toFixed(1).replace('.', ',');
}

// Recommandation d'aliment du jour, dérivée de la connaissance souche (courbe
// poids × IC) et de l'effectif vivant — comparée à la quantité saisie.
function FeedAdviceCard({
  rec,
  enteredKg,
  ageDays,
  liveCount,
  breedName,
  isLayer,
  extended = false,
  weightG = null,
  targetWeightKg = null,
  weightDevPct = null,
}: {
  rec: FeedRecommendation;
  enteredKg: number;
  ageDays: number;
  liveCount: number;
  breedName: string | null;
  isLayer: boolean;
  extended?: boolean;
  weightG?: number | null;
  targetWeightKg?: number | null;
  weightDevPct?: number | null;
}) {
  const { perBirdG, totalKgPerDay, week, kind } = rec;

  const weightShown = extended && weightG != null && weightG > 0 && targetWeightKg != null && weightDevPct != null;
  const wColor = weightShown
    ? Math.abs(weightDevPct as number) <= 10 ? palette.green[600]
    : Math.abs(weightDevPct as number) <= 20 ? color.amber[600]
    : color.red[600]
    : null;

  let badge: { label: string; zColor: string } | null = null;
  let devPct: number | null = null;
  if (enteredKg > 0 && totalKgPerDay != null && totalKgPerDay > 0) {
    devPct = ((enteredKg - totalKgPerDay) / totalKgPerDay) * 100;
    const abs = Math.abs(devPct);
    if (abs <= 15) {
      badge = { label: 'Dose cohérente', zColor: palette.green[600] };
    } else if (devPct > 0) {
      badge = { label: `+${devPct.toFixed(0)} % au-dessus`, zColor: devPct > 45 ? color.red[600] : color.amber[600] };
    } else {
      badge = { label: `${devPct.toFixed(0)} % en dessous`, zColor: devPct < -45 ? color.red[600] : color.amber[600] };
    }
  }

  const cardTone =
    badge == null
      ? 'default'
      : badge.zColor === palette.green[600] ? 'green'
      : badge.zColor === color.red[600] ? 'alert'
      : 'warn';

  const badgeHint =
    badge == null
      ? ''
      : badge.zColor === palette.green[600]
        ? 'Bon dosage pour l’effectif et l’âge du lot — poursuivez.'
        : devPct != null && devPct < 0 && devPct > -45
          ? 'En dessous du besoin estimé — revérifiez la quantité distribuée (sacs, matière sèche).'
          : devPct != null && devPct < 0
            ? 'Nettement sous le besoin — un aliment insuffisant pèse sur la croissance du lot.'
            : devPct != null && devPct > 45
              ? 'Nettement au-dessus du besoin estimé — sacs non comptés ou double saisie ?'
              : 'Un peu au-dessus du besoin — contrôlez les sacs à vide et le gaspillage.';

  const sourceMsg =
    kind === 'fcr'
      ? `Estimation d’après la courbe de croissance de la souche${breedName ? ` (${breedName})` : ''} — poids × IC, semaine ${week}.`
      : kind === 'weight'
        ? `Estimation ≈ ${isLayer ? '5' : '4'} % du poids vif (${rec.referenceWeightKg != null ? 'poids du lot' : 'poids cible souche'}).`
        : null;

  return (
    <Card tone={cardTone} style={styles.corrCard}>
      <View style={styles.feedAdviceHead}>
        <Target size={15} color={color.brand[600]} strokeWidth={2.3} />
        <AppText style={{ fontSize: 15, fontWeight: '600', color: color.ink[800], flex: 1 }}>
          Recommandation du jour
        </AppText>
        <View style={styles.ageChip}>
          <AppText size="caption" weight="bold" color="muted">J{ageDays} · S{week ?? '—'} · {liveCount} sujets</AppText>
        </View>
      </View>

      {perBirdG != null && totalKgPerDay != null ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <AppText size="body" weight="bold" style={{ fontSize: 22, color: color.ink[900] }}>
              ≈ {fmtAdviceKg(totalKgPerDay)} kg / jour
            </AppText>
            <AppText size="caption" color="faint">{perBirdG} g / oiseau</AppText>
          </View>
          <AppText size="caption" color="faint">{sourceMsg}</AppText>

          {enteredKg > 0 ? (
            <View style={styles.feedAdviceCompare}>
              <AppText size="body" color="muted">Saisi : {fmtAdviceKg(enteredKg)} kg</AppText>
              {badge ? (
                <View style={[styles.ratioBadge, { backgroundColor: `${badge.zColor}1A` }]}>
                  <AppText size="caption" weight="bold" style={{ color: badge.zColor }}>{badge.label}</AppText>
                </View>
              ) : null}
            </View>
          ) : null}

          {extended ? (
            <>
              {weightShown && wColor ? (
                <View style={styles.feedAdviceCompare}>
                  <Scale size={13} color={color.ink[400]} />
                  <AppText size="body" color="muted">Poids pesé : {fmtAdviceKg((weightG as number) / 1000)} kg</AppText>
                  <View style={[styles.ratioBadge, { backgroundColor: `${wColor}1A` }]}>
                    <AppText size="caption" weight="bold" style={{ color: wColor }}>
                      {(weightDevPct as number) >= 0 ? '+' : ''}{(weightDevPct as number).toFixed(0)} % vs souche
                    </AppText>
                  </View>
                </View>
              ) : null}
              <View style={styles.feedAdviceCompare}>
                <Droplets size={13} color="#2196D9" />
                <AppText size="body" color="muted">
                  Eau conseillée : ≈ {fmtAdviceKg(Math.ceil(totalKgPerDay * WATER_LO))}–
                  {fmtAdviceKg(Math.floor(totalKgPerDay * WATER_HI))} L / jour
                </AppText>
                <View style={[styles.ratioBadge, { backgroundColor: `${palette.brand[600]}1A` }]}>
                  <AppText size="caption" weight="bold" color="brand">norme 1,8–2,6 L / kg</AppText>
                </View>
              </View>
            </>
          ) : null}

          {badge ? (
            <Hint tone={badge.zColor === palette.green[600] ? 'success' : badge.zColor === color.red[600] ? 'danger' : 'amber'}>
              {badgeHint}
            </Hint>
          ) : enteredKg > 0 ? null : (
            <Hint tone="brand">Indiquez la quantité donnée pour comparer au besoin estimé du lot.</Hint>
          )}
        </>
      ) : (
        <Hint tone="amber">
          Pas encore de recommandation pour cette souche — une pesée du lot permet d’estimer le besoin quotidien
          (~{isLayer ? '5' : '4'} % du poids vif).
        </Hint>
      )}
    </Card>
  );
}

// ── Composant principal ──────────────────────────────────────────────────

export function DailyEntrySheet({ initialBatchId, onClose, onStickyChange, onFooterChange }: DailyEntrySheetProps) {
  const { farmId } = useAuth();
  const queryClient = useQueryClient();

  const batchesQuery = useQuery({ queryKey: ['batches', farmId], queryFn: () => fetchBatches(farmId) });
  const batches = (batchesQuery.data ?? []).filter((b) => b.status !== 'CLOTURE');

  const feedStockQuery = useQuery({
    queryKey: ['feed-stock', farmId],
    queryFn: () => fetchFeedStock(farmId),
    staleTime: 60_000,
  });
  const feedStock = feedStockQuery.data;

  const [lotId, setLotId] = useState(initialBatchId ?? '');
  const lot = batches.find((b) => b.id === lotId) ?? batches[0];

  // ── Assistant : étape courante (0..3) ──
  const [step, setStep] = useState(0);

  // ── Date de saisie : aujourd'hui / hier / custom (upsert serveur par date) ──
  const [dateMode, setDateMode] = useState<'today' | 'yesterday' | 'custom'>('today');
  const [customDate, setCustomDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const entryDateStr =
    dateMode === 'today' ? todayStr()
    : dateMode === 'yesterday' ? fmtLocalDate(addDays(new Date(), -1))
    : fmtLocalDate(customDate);
  const entryDateLabel = fmtDay(new Date(entryDateStr + 'T12:00:00'));

  // ── Valeurs de la saisie ──
  const [values, setValues] = useState<DailyEntryValues>(baseline);
  const [modeFeed, setModeFeed] = useState<'kg' | 'sacs'>('kg');
  const [bagSizeKg, setBagSizeKg] = useState<number>(50);
  const [prefilled, setPrefilled] = useState<string | null>(null); // `${lotId}|${date}` déjà rempli
  const [saved, setSaved] = useState(false);
  const [queued, setQueued] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Saisie déjà enregistrée pour ce lot + cette date ?
  const entriesQuery = useQuery({
    queryKey: ['daily-entries', lot?.id],
    queryFn: () => fetchDailyEntries(farmId, lot!.id),
    enabled: !!lot,
  });

  const existingEntry = useMemo(
    () => (entriesQuery.data ?? []).find((e) => e.entryDate === entryDateStr) ?? null,
    [entriesQuery.data, entryDateStr],
  );
  const yesterdayEntry = useMemo(
    () => (entriesQuery.data ?? []).find((e) => e.entryDate === fmtLocalDate(addDays(new Date(entryDateStr + 'T12:00:00'), -1))) ?? null,
    [entriesQuery.data, entryDateStr],
  );
  const recentEntries = useMemo(() => {
    return (entriesQuery.data ?? [])
      .filter((e) => e.entryDate < entryDateStr)
      .sort((a, b) => b.entryDate.localeCompare(a.entryDate))
      .slice(0, 7);
  }, [entriesQuery.data, entryDateStr]);

  // Pré-remplissage depuis la saisie existante du jour (édition au lieu d'aveugle).
  useEffect(() => {
    if (!lot) return;
    const stamp = `${lot.id}|${entryDateStr}`;
    if (prefilled === stamp) return;
    const rec = existingEntry;
    const suggested = suggestedPhaseFor(lot);
    const allowed = phasesForLot(lot);
    if (rec) {
      setValues({
        ...baseline,
        deaths: rec.deaths ?? 0,
        feedKg: rec.feedQuantity ?? 0,
        waterL: rec.waterL ?? 0,
        weightG: rec.avgWeightKg != null ? Math.round(rec.avgWeightKg * 1000) : 0,
        eggs: rec.eggsCollected ?? 0,
        eggsCracked: rec.eggsCracked ?? 0,
        eggsSmall: rec.eggsSmall ?? 0,
        eggsDoubleYolk: rec.eggsDoubleYolk ?? 0,
        eggsDirty: rec.eggsDirty ?? 0,
        feedPhase: normalizePhase((rec.feedPhase as FeedPhase | null) ?? suggested, allowed),
        inputLotId: rec.skipStockDeduction ? null : (rec.inputLotId ?? null),
        skipStockDeduction: rec.skipStockDeduction ?? false,
      });
      setModeFeed(rec.feedUnit === 'SAC' ? 'sacs' : 'kg');
      if (rec.feedUnit === 'SAC') {
        // Équivalent sacs pour repartir de l'unité d'origine (poids du sac mémorisé, sinon 50 kg).
        const bk = rec.bagSizeKg ?? 50;
        setBagSizeKg(bk);
        setValues((v) => ({ ...v, feedSacs: Math.round((rec.feedQuantity ?? 0) / bk), bagSizeKg: bk }));
      }
    } else {
      setValues({ ...baseline, feedPhase: normalizePhase(suggested, allowed) });
    }
    setPrefilled(stamp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lot?.id, entryDateStr, existingEntry]);

  // ── Contexte du lot (le « Pro » : on sait toujours ce qu'on manipule) ──
  const ctx = useMemo(() => {
    if (!lot) return null;
    const m = lot.metrics;
    const week = Math.floor(m.ageDays / 7) + 1;
    return {
      week,
      live: m.liveCount,
      start: lot.quantityAtStart,
      age: m.ageDays,
      mortalityPct: m.mortalityPercent,
      isLayer: lot.type === 'PONDEUSE',
      species: lot.species,
      breedName: lot.breedName,
      breedCode: lot.breedCode,
    };
  }, [lot]);

  const standardsQuery = useQuery({
    queryKey: ['breed-standards', lot?.breedId ?? null],
    queryFn: () => fetchBreedStandards(lot!.breedId!),
    enabled: !!lot?.breedId,
  });
  const standardRow = useMemo(() => {
    const std = standardsQuery.data;
    if (!std || std.length === 0 || !ctx) return null;
    const exact = std.find((s) => s.week === ctx.week);
    if (exact) return exact;
    return [...std].reverse().find((s) => s.week <= ctx.week) ?? null;
  }, [standardsQuery.data, ctx]);
  const targetWeightKg = standardRow?.targetAvgWeightKg ?? null;
  const targetLayRatePct = standardRow?.targetLayRatePercent ?? null;

  // ── Aliment : suggestion FEFO + autonomie de la phase ──
  const allowedPhases = phasesForLot(lot);
  const feedPhase = normalizePhase(values.feedPhase ?? suggestedPhaseFor(lot), allowedPhases) ?? suggestedPhaseFor(lot);
  const suggestedFeedLotId = feedStock?.byType.find((x) => x.feedPhase === feedPhase)?.suggestedLotId ?? null;
  const chosenFeedLotId = values.inputLotId == null ? suggestedFeedLotId : values.inputLotId;
  const phaseStock = feedStock?.byType.find((x) => x.feedPhase === feedPhase) ?? null;
  const chosenLot = feedStock?.lots.find((l) => l.id === chosenFeedLotId) ?? null;
  const isAuto = values.inputLotId == null;
  const feedLotsOfType = (feedStock?.lots ?? [])
    .filter((l) => l.feedPhase === feedPhase && l.availableKg > 0)
    .sort((a, b) => {
      if (a.id === suggestedFeedLotId) return -1;
      if (b.id === suggestedFeedLotId) return 1;
      return b.availableKg - a.availableKg;
    });

  // ── Analyses en direct ──
  const feedKgEquivalent = modeFeed === 'kg' ? values.feedKg : values.feedSacs * (bagSizeKg || 50);
  const waterRatio = values.waterL > 0 && feedKgEquivalent > 0 ? values.waterL / feedKgEquivalent : null;
  const mortalityPctOfLive = ctx && ctx.live > 0 ? (values.deaths / ctx.live) * 100 : null;
  const deathsExceedLive = !!ctx && values.deaths >= ctx.live;
  const weightDevPct =
    values.weightG > 0 && targetWeightKg
      ? ((values.weightG / 1000 - targetWeightKg) / targetWeightKg) * 100
      : null;
  const waterDropVsYesterday =
    yesterdayEntry && yesterdayEntry.waterL > 0 && values.waterL > 0
      ? ((values.waterL - yesterdayEntry.waterL) / yesterdayEntry.waterL) * 100
      : null;

  const gPerBirdNow =
    feedKgEquivalent > 0 && ctx && ctx.live > 0 ? feedKgEquivalent * 1000 / ctx.live : null;
  const lPerBirdNow =
    values.waterL > 0 && ctx && ctx.live > 0 ? values.waterL / ctx.live : null;

  // Références 7 derniers jours (saisies déjà enregistrées, avant la date séléctionnée).
  const avgFeedGPerBird = useMemo(() => {
    const rf = recentEntries.filter((e) => (e.feedQuantity ?? 0) > 0);
    if (!rf.length || !ctx || ctx.live <= 0) return null;
    return (rf.reduce((s, e) => s + e.feedQuantity, 0) / rf.length) * 1000 / ctx.live;
  }, [recentEntries, ctx]);
  const avgLPerBird = useMemo(() => {
    const rw = recentEntries.filter((e) => (e.waterL ?? 0) > 0);
    if (!rw.length || !ctx || ctx.live <= 0) return null;
    return rw.reduce((s, e) => s + e.waterL, 0) / rw.length / ctx.live;
  }, [recentEntries, ctx]);
  const avgRatio = useMemo(() => {
    const rr = recentEntries.filter((e) => (e.waterL ?? 0) > 0 && (e.feedQuantity ?? 0) > 0);
    if (!rr.length) return null;
    const totW = rr.reduce((s, e) => s + e.waterL, 0);
    const totF = rr.reduce((s, e) => s + e.feedQuantity, 0);
    return totF > 0 ? totW / totF : null;
  }, [recentEntries]);
  const avgMortPerDay = useMemo(
    () => (recentEntries.length ? recentEntries.reduce((s, e) => s + (e.deaths ?? 0), 0) / recentEntries.length : null),
    [recentEntries],
  );
  const lastWeightEntry = useMemo(
    () => recentEntries.find((e) => e.avgWeightKg != null) ?? null,
    [recentEntries],
  );
  const prevWeightG = lastWeightEntry?.avgWeightKg != null ? lastWeightEntry.avgWeightKg * 1000 : null;

  // ── Recommandation aliment du jour (connaissance souche + âge + effectif) ──
  const weighedWeightKg =
    values.weightG > 0 ? values.weightG / 1000
    : prevWeightG != null ? prevWeightG / 1000
    : null;
  const feedRec = useMemo(
    () =>
      estimateDailyFeedPerBirdKg({
        ageDays: ctx?.age ?? 0,
        isLayer: ctx?.isLayer ?? false,
        liveCount: ctx?.live ?? 0,
        weighedWeightKg,
        standards: standardsQuery.data ?? [],
      }),
    [ctx?.age, ctx?.isLayer, ctx?.live, weighedWeightKg, standardsQuery.data],
  );

  const gPerBirdDevPct =
    gPerBirdNow != null && avgFeedGPerBird != null && avgFeedGPerBird > 0
      ? ((gPerBirdNow - avgFeedGPerBird) / avgFeedGPerBird) * 100
      : null;
  const lPerBirdDevPct =
    lPerBirdNow != null && avgLPerBird != null && avgLPerBird > 0
      ? ((lPerBirdNow - avgLPerBird) / avgLPerBird) * 100
      : null;

  // ── Œufs ──
  const eggTrays = Math.floor(values.eggs / EGGS_PER_ALVEOL);
  const eggLoose = values.eggs % EGGS_PER_ALVEOL;
  const rejectTotal =
    values.eggsCracked + values.eggsSmall + values.eggsDoubleYolk + values.eggsDirty;
  const rejectsExceed = rejectTotal > values.eggs;
  const eggsSellable = Math.max(0, values.eggs - rejectTotal);
  const layRatePct = ctx && ctx.live > 0 && values.eggs > 0 ? (values.eggs / ctx.live) * 100 : null;
  const layDevPct = layRatePct != null && targetLayRatePct != null ? layRatePct - targetLayRatePct : null;
  // Ponctions impossibles à l'échelle d'un lot : œufs > effectif ou = effectif
  // (= taux 100 %, signe d'une double saisie œufs/effectif).
  const layOverLive = ctx != null && values.eggs > ctx.live;
  const layEqualsLive = ctx != null && ctx.live > 0 && values.eggs === ctx.live;

  // ── Poids ──
  const weightDeltaG = values.weightG > 0 && prevWeightG != null ? values.weightG - prevWeightG : null;

  // Corrélations poids ↔ autres saisies (biomasse, aliment, œufs, croissance).
  const daysSinceLastWeight =
    values.weightG > 0 && prevWeightG != null && lastWeightEntry?.entryDate != null
      ? utcDaysBetween(lastWeightEntry.entryDate, entryDateStr)
      : null;
  const adgGPerDay =
    weightDeltaG != null && daysSinceLastWeight != null && daysSinceLastWeight > 0
      ? weightDeltaG / daysSinceLastWeight
      : null;
  const flockBiomassKg =
    ctx && ctx.live > 0 && values.weightG > 0 ? (ctx.live * values.weightG) / 1000 : null;
  const feedPctOfBiomass =
    feedKgEquivalent > 0 && flockBiomassKg != null && flockBiomassKg > 0
      ? (feedKgEquivalent / flockBiomassKg) * 100
      : null;
  const eggMassKg = ctx?.isLayer && values.eggs > 0 ? (values.eggs * 60) / 1000 : null;
  const feedNeedMinG = values.weightG > 0 ? values.weightG * 0.03 : null;
  const feedNeedMaxG = values.weightG > 0 ? values.weightG * 0.05 : null;

  // ── Contexte date sélectionnée ──
  const daysFromNow = useMemo(() => {
    const t = new Date();
    const todayUTC = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
    const [y, m, d] = entryDateStr.split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - todayUTC) / 86_400_000);
  }, [entryDateStr]);
  const entryAgeDays = lot ? utcDaysBetween(lot.integrationDate, entryDateStr) : null;

  const remainingPreview =
    chosenLot && feedKgEquivalent > 0
      ? Math.max(0, chosenLot.availableKg - feedKgEquivalent)
      : chosenLot?.availableKg ?? null;

  const hasAnything =
    values.deaths > 0 || values.feedKg > 0 || values.feedSacs > 0 || values.waterL > 0 ||
    values.weightG > 0 || values.eggs > 0 || values.eggsCracked > 0 || values.eggsSmall > 0 ||
    values.eggsDoubleYolk > 0 || values.eggsDirty > 0;

  const completed = useMemo<boolean[]>(
    () => [
      values.deaths > 0,
      feedKgEquivalent > 0 || values.waterL > 0,
      values.eggs > 0,
      values.weightG > 0,
    ],
    [values.deaths, feedKgEquivalent, values.waterL, values.eggs, values.weightG],
  );

  // ── Indicateur d'étapes : hoisté dans la zone fixe du Sheet (ne défile pas) ──
  const onSelectStep = useCallback(
    (i: number) => {
      if (i < step) {
        setStep(i);
        setError(null);
      }
    },
    [step],
  );
  const stepsNode = useMemo(
    () => (
      <StepProgress steps={STEPS} activeIndex={step} completed={completed} onSelect={onSelectStep} />
    ),
    [step, completed, onSelectStep],
  );
  useEffect(() => {
    if (!onStickyChange) return;
    onStickyChange(stepsNode);
    return () => onStickyChange(undefined);
  }, [stepsNode, onStickyChange]);

  const success = useCallback(
    (wasQueued: boolean) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setQueued(wasQueued);
      setSaved(true);
      setTimeout(onClose, 1300);
    },
    [onClose],
  );

  const save = useCallback(async () => {
    if (!lot) return;
    if (!hasAnything) {
      setError('Rien à enregistrer : saisissez au moins une valeur.');
      return;
    }
    if (deathsExceedLive) {
      setError(`Impossible : ${values.deaths} morts dépasse l'effectif vivant (${ctx?.live}).`);
      return;
    }
    if (rejectsExceed) {
      setError(`Écarts (${rejectTotal}) supérieurs au total d’œufs collectés (${values.eggs}).`);
      return;
    }
    const payload = buildDailyEntryPayload(
      { ...values, bagSizeKg, feedPhase, inputLotId: values.skipStockDeduction ? undefined : chosenFeedLotId },
      { isLayer: lot.type === 'PONDEUSE', feedMode: modeFeed, entryDate: entryDateStr },
    );
    setSaving(true);
    setError(null);
    try {
      const result = await queueDailyEntry(farmId, lot.id, payload);
      if (result.status === 'sent') invalidateFarmQueries(queryClient, { farmId, batchId: lot.id });
      success(result.status === 'queued');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la sauvegarde.');
      setSaving(false);
    }
  }, [
    lot, hasAnything, deathsExceedLive, rejectsExceed, rejectTotal,
    values, ctx?.live, feedPhase, chosenFeedLotId, bagSizeKg, modeFeed, entryDateStr,
    farmId, queryClient, success,
  ]);

  // ── Action bar : hoistée en pied fixe du Sheet (toujours visible, ne défile pas) ──
  const actionsNode = useMemo(
    () => (
      <View style={{ gap: 10 }}>
        {error ? (
          <View style={styles.errorBanner}>
            <AlertTriangle size={14} color={palette.red[600]} />
            <AppText size="small" color="danger" style={{ flex: 1 }}>{error}</AppText>
          </View>
        ) : null}
        <View style={styles.actions}>
          {step > 0 ? (
            <Button label="Retour" tone="ghost" size="md" block={false} onPress={() => { setStep((s) => s - 1); setError(null); }} disabled={saving} />
          ) : null}
          <View style={{ flex: 1 }}>
            {step < STEPS.length - 1 ? (
              <Button
                label="Suivant"
                tone="brand"
                disabled={saving}
                onPress={() => {
                  if (step === 0 && deathsExceedLive) {
                    setError(`Impossible : ${values.deaths} morts dépasse l'effectif vivant (${ctx?.live}).`);
                    return;
                  }
                  setStep((s) => s + 1);
                  setError(null);
                }}
              />
            ) : (
              <Button
                label={existingEntry ? 'Mettre à jour la saisie' : 'Enregistrer la saisie'}
                tone="accent"
                loading={saving}
                disabled={!hasAnything || deathsExceedLive || rejectsExceed}
                onPress={() => void save()}
              />
            )}
          </View>
        </View>
      </View>
    ),
    [error, step, saving, existingEntry, hasAnything, deathsExceedLive, rejectsExceed, ctx?.live, values.deaths, save],
  );
  useEffect(() => {
    if (!onFooterChange) return;
    onFooterChange(saved || batches.length === 0 ? undefined : actionsNode);
    return () => onFooterChange(undefined);
  }, [actionsNode, onFooterChange, saved, batches.length]);

  const set = (key: keyof DailyEntryValues) => (n: number) => {
    setValues((v) => ({ ...v, [key]: n }));
    setError(null);
  };

  const setEggsFromTrays = (t: string) => {
    const trays = Math.max(0, parseInt(t, 10) || 0);
    setValues((v) => ({ ...v, eggs: trays * EGGS_PER_ALVEOL + (v.eggs % EGGS_PER_ALVEOL) }));
    setError(null);
  };
  // ≥ 30 œufs en vrac : bascule automatiquement en alvéole(s) pleine(s).
  const setEggsFromLoose = (t: string) => {
    const loose = Math.max(0, parseInt(t, 10) || 0);
    setValues((v) => ({ ...v, eggs: Math.floor(v.eggs / EGGS_PER_ALVEOL) * EGGS_PER_ALVEOL + loose }));
    setError(null);
  };

  const pickBatch = (b: BatchWithMetrics) => {
    Haptics.selectionAsync().catch(() => {});
    setLotId(b.id);
    setStep(0);
    setError(null);
  };

  const pickDate = (m: 'today' | 'yesterday') => {
    Haptics.selectionAsync().catch(() => {});
    setDateMode(m);
    setError(null);
  };

  const onCustomDateChange = (_e: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (date) {
      setCustomDate(date);
      setDateMode('custom');
      setError(null);
    }
  };

  if (saved) {
    return (
      <View style={styles.savedWrap}>
        <Check size={54} color={palette.green[600]} strokeWidth={3} />
        <AppText size="h3" weight="bold" color="text">
          Saisie enregistrée
        </AppText>
        <AppText size="caption" color="muted" align="center">
          {queued
            ? 'Mise en attente · sera synchronisée le retour en ligne'
            : `Envoyée au serveur et analysée · ${entryDateLabel}`}
        </AppText>
      </View>
    );
  }

  if (batches.length === 0) {
    return (
      <View style={styles.savedWrap}>
        <AlertTriangle size={40} color={palette.amber[600]} />
        <AppText size="h3" weight="bold" color="text">Aucun lot actif</AppText>
        <AppText size="caption" color="muted" align="center">
          Créez un lot depuis l’écran Lots pour commencer les saisies journalières.
        </AppText>
      </View>
    );
  }

  const lotImg = lot ? breedImageForLot(lot.breedName, lot.species) : null;
  const dateRelative = daysFromNow === 0 ? "Aujourd'hui" : daysFromNow === 1 ? 'Hier' : `Il y a ${daysFromNow} jours`;

  return (
    <View style={{ gap: spacing.md }}>

      {/* ── 1. ASSISTANT (indicateur d'étapes) — fallback quand onStickyChange absent ── */}
      {!onStickyChange ? stepsNode : null}

      {/* ── 2. CONTEXTE : lots ── */}
      <View style={styles.lotRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 8 }}>
          {batches.map((b) => (
            <Pressable key={b.id} onPress={() => pickBatch(b)} accessibilityRole="button">
              <Chip label={b.batchName ?? b.id} tone="brand" selected={lot?.id === b.id} style={styles.lotChip} />
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* ── 3. DATE + contexte temps ── */}
      <View style={styles.dateRow}>
        {(['today', 'yesterday'] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => pickDate(m)}
            style={[styles.dateBtn, dateMode === m && styles.dateBtnActive]}
            accessibilityRole="button">
            <AppText size="small" weight={dateMode === m ? 'bold' : 'medium'} color={dateMode === m ? 'surface' : 'muted'}>
              {m === 'today' ? "Aujourd'hui" : 'Hier'}
            </AppText>
          </Pressable>
        ))}
        <Pressable
          onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowDatePicker(true); }}
          style={[styles.dateBtn, dateMode === 'custom' && styles.dateBtnActive]}
          accessibilityRole="button">
          <CalendarDays size={13} color={dateMode === 'custom' ? palette.surface : color.ink[500]} />
          <AppText size="small" weight={dateMode === 'custom' ? 'bold' : 'medium'} color={dateMode === 'custom' ? 'surface' : 'muted'}>
            {dateMode === 'custom' ? fmtDayShort(customDate) : 'Autre date'}
          </AppText>
        </Pressable>
        {showDatePicker ? (
          <DateTimePicker
            value={customDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onCustomDateChange}
            maximumDate={new Date()}
            locale="fr-FR"
          />
        ) : null}
      </View>

      {/* Insight sur la période sélectionnée */}
      <View style={styles.dateInsight}>
        {entryAgeDays != null ? (
          <View style={styles.dateInsightPill}>
            <AppText size="caption" weight="bold" color="brand">J{entryAgeDays}</AppText>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <AppText size="caption" weight="semibold" color="muted">
            {entryDateLabel} · {dateRelative}
          </AppText>
          <AppText size="caption" color="faint">
            {daysFromNow === 0
              ? 'Période de saisie actuelle — les saisies plus anciennes restent modifiables.'
              : `Vous complétez une saisie passée — les analyses s'adapteront à cette date.`}
          </AppText>
        </View>
      </View>

      {/* Carte contexte : tout ce qu'il faut savoir avant de saisir */}
      {lot && ctx ? (
        <Card tone="brand" style={styles.ctxCard}>
          {lotImg ? <Image source={lotImg} style={styles.ctxImg} resizeMode="cover" /> : null}
          <View style={{ flex: 1, gap: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <AppText size="body" weight="bold" color="text" numberOfLines={1}>
                {lot.batchName ?? 'Lot'}
              </AppText>
              <View style={styles.ageChip}>
                <AppText size="caption" weight="bold" color="brand">J{ctx.age} · S{ctx.week}</AppText>
              </View>
            </View>
            <AppText size="caption" color="muted" numberOfLines={1}>
              {[ctx.breedCode, ctx.breedName, ctx.isLayer ? 'Pondeuse' : 'Chair'].filter(Boolean).join(' · ')}
            </AppText>
            <View style={styles.ctxStats}>
              <View style={styles.ctxStat}>
                <AppText size="small" weight="bold" color="text">{ctx.live.toLocaleString('fr-FR')}</AppText>
                <AppText size="caption" color="faint">vivants</AppText>
              </View>
              <View style={styles.ctxDivider} />
              <View style={styles.ctxStat}>
                <AppText size="small" weight="bold" color="text">{ctx.start.toLocaleString('fr-FR')}</AppText>
                <AppText size="caption" color="faint">départ</AppText>
              </View>
              <View style={styles.ctxDivider} />
              <View style={styles.ctxStat}>
                <AppText size="small" weight="bold" color={ctx.mortalityPct > 5 ? 'danger' : 'text'}>
                  {ctx.mortalityPct.toFixed(1)}%
                </AppText>
                <AppText size="caption" color="faint">mortalité</AppText>
              </View>
            </View>
          </View>
        </Card>
      ) : null}

      {existingEntry ? (
        <View style={styles.existingBanner}>
          <Info size={14} color={palette.brand[600]} />
          <Hint tone="brand">
            Saisie du {fmtDayShort(new Date(entryDateStr + 'T12:00:00'))} déjà enregistrée — les valeurs sont pré-remplies et seront mises à jour.
          </Hint>
        </View>
      ) : null}

      {/* ── ÉTAPE 1 : MORTS ── */}
      {step === 0 ? (
        <View style={styles.section}>
          <SectionHeader icon={Skull} title="Morts" done={values.deaths > 0} accent={palette.red[500]} />
          <NumberInput
            value={values.deaths > 0 ? String(values.deaths) : ''}
            onChangeText={(t) => set('deaths')(t ? parseInt(t, 10) : 0)}
            suffix="oiseaux"
            placeholder="0"
          />
          {deathsExceedLive ? (
            <Hint tone="danger">Impossible : dépasse l’effectif vivant ({ctx?.live.toLocaleString('fr-FR')}).</Hint>
          ) : mortalityPctOfLive != null && mortalityPctOfLive > 0.5 ? (
            <Hint tone={mortalityPctOfLive >= 3 ? 'danger' : 'amber'}>
              {mortalityPctOfLive.toFixed(1)} % du cheptel en une journée — {mortalityPctOfLive >= 3 ? 'vérifiez eau, température et comportement sans attendre.' : 'surveillez de près la consommation d\u2019eau aujourd\u2019hui.'}
            </Hint>
          ) : values.deaths === 0 ? (
            <Hint>Aucune perte — laissez à 0 si tout va bien.</Hint>
          ) : null}
          {values.deaths > 0 && avgMortPerDay != null ? (
            <Hint tone={Math.abs(values.deaths - avgMortPerDay) <= Math.max(avgMortPerDay * 0.5, 1) ? 'muted' : 'amber'}>
              {values.deaths === avgMortPerDay
                ? `Dans la moyenne des 7 derniers jours (${avgMortPerDay.toFixed(1)} morts/j).`
                : values.deaths > avgMortPerDay
                  ? `Au-dessus de la moyenne 7 j (${avgMortPerDay.toFixed(1)} morts/j) — suivez l'évolution.`
                  : `Sous la moyenne des 7 derniers jours (${avgMortPerDay.toFixed(1)} morts/j).`}
            </Hint>
          ) : null}
          <TipBox icon={Lightbulb} tone="brand">
            Un taux ~0,5 %/jour est courant en zone humide. Au-delà de 1 %/jour, suspectez eau, chaleur ou maladie.
          </TipBox>
        </View>
      ) : null}

      {/* ── ÉTAPE 2 : ALIMENTS & EAU ── */}
      {step === 1 ? (
        <View style={styles.section}>
          <SectionHeader
            icon={Wheat}
            title="Aliments & Eau"
            done={feedKgEquivalent > 0 || values.waterL > 0}
            accent={color.amber[600]}
            right={phaseStock?.autonomyDays != null ? (
              <View style={[styles.autoChip, phaseStock.autonomyDays < FEED_STOCK_CRITICAL_DAYS ? styles.autoCrit : phaseStock.autonomyDays < FEED_STOCK_WARN_DAYS ? styles.autoWarn : null]}>
                <AppText size="caption" weight="bold" color={phaseStock.autonomyDays < FEED_STOCK_CRITICAL_DAYS ? 'danger' : phaseStock.autonomyDays < FEED_STOCK_WARN_DAYS ? 'amber' : 'muted'}>
                  {Math.round(phaseStock.autonomyDays)} j stock
                </AppText>
              </View>
            ) : null}
          />

          {/* Provenance : stock interne vs achat externe */}
          <View style={{ gap: 6 }}>
            <AppText size="label" weight="semibold" color="muted">Provenance de la provende</AppText>
            <Segmented
              options={[
                { key: 'interne', label: 'Stock interne', tint: palette.brand[600] },
                { key: 'externe', label: 'Achat externe', tint: palette.amber[600] },
              ]}
              value={values.skipStockDeduction ? 'externe' : 'interne'}
              onChange={(k) => {
                Haptics.selectionAsync().catch(() => {});
                const isExternal = k === 'externe';
                setValues((v) => ({ ...v, skipStockDeduction: isExternal, inputLotId: isExternal ? undefined : v.inputLotId }));
                setError(null);
              }}
            />
          </View>

          {values.skipStockDeduction ? (
            <TipBox icon={Truck} tone="amber">
              Achat ponctuel non déclaré au stock : la consommation {feedKgEquivalent > 0 ? `(${feedKgEquivalent} kg)` : ''} sera
              enregistrée mais AUCUN lot interne ne sera déduit. Enregistrez l’entrée depuis « Provende & stock » si vous voulez le suivre.
            </TipBox>
          ) : (
            <>
              <View style={{ gap: 6 }}>
                <AppText size="label" weight="semibold" color="muted">
                  Lot de provende (stock interne)
                </AppText>
                <View style={styles.chipWrap}>
                  <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); setValues((v) => ({ ...v, inputLotId: undefined })); }} accessibilityRole="button">
                    <Chip label="Auto (FEFO) ✓" tone="neutral" selected={chosenFeedLotId === suggestedFeedLotId && values.inputLotId !== chosenFeedLotId} style={styles.lotChip} />
                  </Pressable>
                  {feedLotsOfType.map((l) => {
                    const label = `${l.productName} · ${Math.round(l.availableKg)} kg`;
                    const suggested = l.id === suggestedFeedLotId;
                    return (
                      <Pressable key={l.id} onPress={() => { Haptics.selectionAsync().catch(() => {}); setValues((v) => ({ ...v, inputLotId: l.id })); }} accessibilityRole="button">
                        <Chip
                          label={suggested && values.inputLotId !== l.id ? `${label} ✓` : label}
                          tone={chosenFeedLotId === l.id ? 'accent' : 'brand'}
                          selected={chosenFeedLotId === l.id}
                          style={styles.lotChip}
                        />
                      </Pressable>
                    );
                  })}
                </View>
                {feedLotsOfType.length === 0 ? (
                  <Hint>Aucun stock de {FEED_PHASE_LABELS[feedPhase].toLowerCase()} — la déduction se fera au niveau ferme (FEFO).</Hint>
                ) : null}
              </View>

              {isAuto && chosenLot ? (
                <TipBox icon={Boxes} tone="brand">
                  <AppText size="small" weight="semibold" style={{ color: palette.brand[700] }}>Auto (FEFO) — First Expire, First Out.</AppText>{' '}
                  L’app déduit d’abord le lot qui expire le plus tôt pour éviter les pertes. Pour cette saisie :{' '}
                  <AppText size="small" weight="semibold" style={{ color: palette.brand[700] }}>{chosenLot.productName}</AppText> ·{' '}
                  {Math.round(chosenLot.availableKg)} kg restants
                  {chosenLot.expirationDate ? ` · expiration ${chosenLot.expirationDate.slice(0, 10)}` : ''}.
                </TipBox>
              ) : isAuto ? (
                <TipBox icon={Boxes} tone="brand">
                  <AppText size="small" weight="semibold" style={{ color: palette.brand[700] }}>Auto (FEFO) — First Expire, First Out.</AppText>{' '}
                  Aucun lot interne pour la phase {FEED_PHASE_LABELS[feedPhase].toLowerCase()} avec du stock : la consommation sera suivie au niveau
                  ferme et déduite dès qu’un lot de cette phase sera disponible.
                </TipBox>
              ) : chosenLot ? (
                <TipBox icon={CheckCircle2} tone="success">
                  <AppText size="small" weight="semibold" style={{ color: palette.green[700] }}>Lot choisi : {chosenLot.productName}.</AppText>{' '}
                  La consommation de cette saisie sera déduite de ce lot ({Math.round(chosenLot.availableKg)} kg disponibles) —{' '}
                  {chosenLot.id === suggestedFeedLotId
                    ? "c'est le lot que FEFO aurait sélectionné."
                    : 'la déduction FEFO automatique est remplacée, ce lot sera débité en premier.'}
                </TipBox>
              ) : null}

              {chosenLot && remainingPreview != null ? (
                <Card tone="default" style={styles.stockPreview}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText size="caption" color="faint">Restant après cette saisie</AppText>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                      <AppText size="body" weight="bold" color="text">≈ {Math.round(remainingPreview)} kg</AppText>
                      <AppText size="caption" color="muted">/ {Math.round(chosenLot.availableKg)} kg dispo</AppText>
                    </View>
                  </View>
                  <RefreshCw size={14} color={palette.brand[500]} />
                </Card>
              ) : null}
            </>
          )}

          {/* Phase d'aliment */}
          <View style={{ gap: 6 }}>
            <AppText size="label" weight="semibold" color="muted">Phase d’aliment</AppText>
            <View style={styles.chipWrap}>
              {allowedPhases.map((t) => {
                const suggested = t === suggestedPhaseFor(lot);
                const active = t === feedPhase;
                return (
                  <Pressable
                    key={t}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setValues((v) => ({ ...v, feedPhase: t, inputLotId: undefined })); }}
                    accessibilityRole="button">
                    <Chip
                      label={suggested && !active ? `${FEED_PHASE_LABELS[t]} ✓` : FEED_PHASE_LABELS[t]}
                      tone={active ? 'accent' : 'neutral'}
                      selected={active}
                      style={styles.phaseChip}
                    />
                  </Pressable>
                );
              })}
            </View>
            {feedPhase !== suggestedPhaseFor(lot) ? (
              <Pressable
                onPress={() => setValues((v) => ({ ...v, feedPhase: suggestedPhaseFor(lot), inputLotId: undefined }))}
                style={styles.suggestRow}>
                <Info size={12} color={palette.amber[600]} />
                <Hint tone="amber">
                  Recommandée à J{ctx?.age} : {FEED_PHASE_LABELS[suggestedPhaseFor(lot)]} — appuyez pour appliquer.
                </Hint>
              </Pressable>
            ) : null}
          </View>

          {/* Quantité d'aliment */}
          <Segmented
            options={[{ key: 'kg', label: 'kg' }, { key: 'sacs', label: 'sacs' }]}
            value={modeFeed}
            onChange={(m) => {
              setModeFeed(m as 'kg' | 'sacs');
              setError(null);
            }}
          />
          {modeFeed === 'sacs' ? (
            <View style={{ gap: 6 }}>
              <AppText size="label" weight="semibold" color="muted">Poids d’un sac</AppText>
              <View style={styles.chipWrap}>
                {BAG_SIZES.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setBagSizeKg(s); }}
                    accessibilityRole="button">
                    <Chip
                      label={`${s} kg`}
                      tone="neutral"
                      selected={bagSizeKg === s}
                      style={styles.lotChip}
                    />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          <NumberInput
            value={modeFeed === 'kg'
              ? (values.feedKg > 0 ? String(values.feedKg) : '')
              : (values.feedSacs > 0 ? String(values.feedSacs) : '')}
            onChangeText={(t) => {
              if (modeFeed === 'kg') set('feedKg')(t ? parseFloat(t) : 0);
              else set('feedSacs')(t ? parseInt(t, 10) : 0);
            }}
            suffix={modeFeed === 'kg' ? 'kg' : 'sacs'}
            decimal={modeFeed === 'kg'}
            placeholder="0"
          />
          {modeFeed === 'sacs' && values.feedSacs > 0 ? (
            <Hint tone="brand">
              {values.feedSacs} sac{values.feedSacs > 1 ? 's' : ''} de {bagSizeKg} kg ≈{' '}
              {(values.feedSacs * (bagSizeKg || 50)).toLocaleString('fr-FR')} kg
            </Hint>
          ) : null}

          {/* Recommandation aliment du jour */}
          {ctx ? (
            <FeedAdviceCard
              rec={feedRec}
              enteredKg={feedKgEquivalent}
              ageDays={ctx.age}
              liveCount={ctx.live}
              breedName={ctx.breedName}
              isLayer={ctx.isLayer}
            />
          ) : null}

          {/* Eau */}
          <View style={styles.waterRow}>
            <View style={styles.waterIcon}>
              <Droplets size={15} color="#2196D9" strokeWidth={2.3} />
            </View>
            <AppText style={{ fontSize: 15, fontWeight: '600', color: color.ink[800], flex: 1 }}>Eau consommée</AppText>
          </View>
          <NumberInput
            value={values.waterL > 0 ? String(values.waterL) : ''}
            onChangeText={(t) => set('waterL')(t ? parseFloat(t) : 0)}
            suffix="L"
            decimal
            placeholder="0"
          />

          {/* Corrélation eau/aliment en direct */}
          {(feedKgEquivalent > 0 || values.waterL > 0) && ctx ? (
            <Card
              tone={waterRatio == null ? 'default' : waterRatio >= WATER_LO && waterRatio <= WATER_HI ? 'green' : waterRatio < 1.2 || waterRatio > 3.5 ? 'alert' : 'warn'}
              style={styles.corrCard}>
              {waterRatio != null ? (
                <RatioBar ratio={waterRatio} />
              ) : feedKgEquivalent > 0 ? (
                <Hint>Saisissez l’eau consommée (L) pour calculer le ratio eau/aliment — premier indicateur de santé.</Hint>
              ) : (
                <Hint>Saisissez l’aliment (kg ou sacs) pour calculer le ratio eau/aliment.</Hint>
              )}

              <View style={styles.corrGrid}>
                <Kpi
                  icon={Wheat}
                  label="Aliment / oiseau / jour"
                  value={gPerBirdNow != null ? `${gPerBirdNow.toFixed(0)} g` : '—'}
                  deltaPct={gPerBirdDevPct}
                />
                <Kpi
                  icon={Droplets}
                  label="Eau / oiseau / jour"
                  value={lPerBirdNow != null ? `${lPerBirdNow.toFixed(2)} L` : '—'}
                  deltaPct={lPerBirdDevPct}
                  deltaTone="danger"
                />
              </View>
              <AppText size="caption" color="faint">
                {recentEntries.length > 0
                  ? `Référence : moyenne des ${Math.min(recentEntries.length, 7)} dernières saisies${avgRatio != null ? ` — ratio eau/aliment moyen ${fmtRatio(avgRatio)}×` : ''}.`
                  : 'Première saisie : la référence se construira dès les prochaines saisies.'}
              </AppText>
            </Card>
          ) : null}

          {waterDropVsYesterday != null && waterDropVsYesterday <= -10 ? (
            <Hint tone={waterDropVsYesterday <= -20 ? 'danger' : 'amber'}>
              Baisse de {Math.abs(waterDropVsYesterday).toFixed(0)} % vs hier — un effondrement de l’eau est le premier signal d’alerte.
            </Hint>
          ) : null}
        </View>
      ) : null}

      {/* ── ÉTAPE 3 : ŒUFS ── */}
      {step === 2 ? (
        <View style={styles.section}>
          <SectionHeader
            icon={Egg}
            title="Ponte"
            done={values.eggs > 0}
            accent={color.accent[500]}
            right={values.eggs > 0 ? (
              <AppText size="caption" weight="bold" color="muted">
                {eggsSellable.toLocaleString('fr-FR')} commercialisables
              </AppText>
            ) : null}
          />

          <AppText size="label" weight="semibold" color="muted">Collecte du jour (1 alvéole = 30 œufs)</AppText>
          <View style={styles.trayRow}>
            <View style={styles.rejectCell}>
              <FieldIconLabel image={require('@/assets/images/alveole2.jpg')} label="Alvéoles pleines" tint={palette.brand[600]} />
              <NumberInput
                value={eggTrays > 0 ? String(eggTrays) : ''}
                onChangeText={setEggsFromTrays}
                suffix="alvéoles"
                placeholder="0"
              />
            </View>
            <View style={styles.rejectCell}>
              <FieldIconLabel image={require('@/assets/images/oeuf2.jpg')} label="Œufs en vrac" tint={color.accent[500]} />
              <NumberInput
                value={eggLoose > 0 ? String(eggLoose) : ''}
                onChangeText={setEggsFromLoose}
                suffix="œufs"
                placeholder="0"
              />
            </View>
          </View>
          <Hint>
            1 alvéole = 30 œufs. Saisissez le nombre réel : dès 30 œufs en vrac, ils basculent automatiquement en alvéole(s) pleine(s).
          </Hint>
          {values.eggs > 0 ? (
            <View style={styles.eggTotal}>
              <AppText size="small" weight="bold" color="text">
                Total : {values.eggs.toLocaleString('fr-FR')} œufs
              </AppText>
              <AppText size="caption" color="muted">
                ≈ {Math.floor(values.eggs / EGGS_PER_ALVEOL)} alvéole(s) + {values.eggs % EGGS_PER_ALVEOL} œuf(s) · {eggsSellable.toLocaleString('fr-FR')} vendables
              </AppText>
            </View>
          ) : null}

          {values.eggs > 0 ? (
            <View style={styles.rejects}>
              <AppText size="label" weight="semibold" color="muted">Écarts par type (déduits des vendables)</AppText>
              <View style={styles.rejectGrid}>
                <View style={styles.rejectCell}>
                  <FieldIconLabel icon={EggOff} label="Cassés / fêlés" tint={palette.red[600]} />
                  <NumberInput
                    value={values.eggsCracked ? String(values.eggsCracked) : ''}
                    onChangeText={(t) => set('eggsCracked')(Math.min(parseInt(t, 10) || 0, values.eggs))}
                  />
                </View>
                <View style={styles.rejectCell}>
                  <FieldIconLabel icon={Shrink} label="Petits" tint={color.amber[600]} />
                  <NumberInput
                    value={values.eggsSmall ? String(values.eggsSmall) : ''}
                    onChangeText={(t) => set('eggsSmall')(Math.min(parseInt(t, 10) || 0, values.eggs))}
                  />
                </View>
                <View style={styles.rejectCell}>
                  <FieldIconLabel icon={Copy} label="2 jaunes" tint={palette.brand[600]} />
                  <NumberInput
                    value={values.eggsDoubleYolk ? String(values.eggsDoubleYolk) : ''}
                    onChangeText={(t) => set('eggsDoubleYolk')(Math.min(parseInt(t, 10) || 0, values.eggs))}
                  />
                </View>
                <View style={styles.rejectCell}>
                  <FieldIconLabel icon={Droplets} label="Sales" tint={color.accent[500]} />
                  <NumberInput
                    value={values.eggsDirty ? String(values.eggsDirty) : ''}
                    onChangeText={(t) => set('eggsDirty')(Math.min(parseInt(t, 10) || 0, values.eggs))}
                  />
                </View>
              </View>
            </View>
          ) : (
            <Hint>{ctx?.isLayer ? 'Collecte du jour — les écarts se déduisent automatiquement des vendables.' : 'Saisie utile pour les lots de reproducteurs ou en fin de cycle.'}</Hint>
          )}

          {rejectsExceed ? (
            <Hint tone="danger">Écarts ({rejectTotal}) supérieurs au total collecté ({values.eggs}).</Hint>
          ) : rejectTotal > 0 && values.eggs > 0 ? (
            <Hint tone={rejectTotal / values.eggs > 0.08 ? 'amber' : 'muted'}>
              {((rejectTotal / values.eggs) * 100).toFixed(1)} % d’écarts — objectif &lt; 5 % ; &gt; 8 % : vérifiez nids, litière et manipulation.
            </Hint>
          ) : null}

          {layOverLive ? (
            <Hint tone="danger">
              {values.eggs} œufs pour {ctx?.live} oiseau(x) — plus d’œufs que l’effectif vivant : vérifiez la collecte (risque de double saisie).
            </Hint>
          ) : layEqualsLive ? (
            <Hint tone="amber">
              Ponte à 100 % du jour ({values.eggs} œufs = {ctx?.live} oiseaux) — invraisemblable à l’échelle d’un lot, vérifiez les quantités.
            </Hint>
          ) : null}

          {layRatePct != null && ctx?.isLayer ? (
            <Hint tone={layDevPct != null && layDevPct < -8 ? 'amber' : 'success'}>
              Taux de ponte du jour : {layRatePct.toFixed(1)} %
              {targetLayRatePct != null ? ` (objectif S${ctx.week} : ${targetLayRatePct.toFixed(0)} %)` : ''}
              {layDevPct != null ? (layDevPct >= 0 ? ' — dans/sur les standards.' : ' — sous les standards, surveillez alimentation & eau.') : '.'}
            </Hint>
          ) : null}
        </View>
      ) : null}

      {/* ── ÉTAPE 4 : POIDS ── */}
      {step === 3 ? (
        <View style={styles.section}>
          <SectionHeader
            icon={Scale}
            title="Poids moyen"
            done={values.weightG > 0}
            accent={palette.green[600]}
            right={targetWeightKg != null ? (
              <View style={styles.targetChip}>
                <Target size={11} color={palette.brand[600]} />
                <AppText size="caption" weight="bold" color="brand">
                  S{ctx?.week} : {targetWeightKg.toFixed(2)} kg
                </AppText>
              </View>
            ) : null}
          />
          <TipBox icon={Lightbulb} tone="brand">
            Pesez un <AppText size="small" weight="semibold" style={{ color: palette.brand[700] }}>échantillon d’au moins 30 sujets représentatifs</AppText>, le même
            jour & à la même heure chaque semaine, de préférence avant la distribution de l’aliment.
          </TipBox>
          <NumberInput
            value={values.weightG > 0 ? String(values.weightG) : ''}
            onChangeText={(t) => set('weightG')(t ? parseInt(t, 10) : 0)}
            suffix="g / oiseau"
            placeholder="0"
          />
          {weightDevPct != null ? (
            <Hint tone={Math.abs(weightDevPct) <= 10 ? 'success' : Math.abs(weightDevPct) <= 20 ? 'amber' : 'danger'}>
              {weightDevPct >= 0 ? '+' : ''}{weightDevPct.toFixed(0)} % vs objectif souche{' '}
              {Math.abs(weightDevPct) <= 10 ? '— sur la courbe.' : weightDevPct < -20 ? '— retard important, vérifiez alimentation et santé.' : '— écart notable.'}
            </Hint>
          ) : targetWeightKg == null ? (
            <Hint>Pas de référence souche pour ce lot — comparez avec vos pesées précédentes.</Hint>
          ) : null}
          {weightDeltaG != null ? (
            <Hint tone={weightDeltaG >= 0 ? 'success' : weightDeltaG < -100 ? 'danger' : 'amber'}>
              {weightDeltaG >= 0 ? '+' : ''}{weightDeltaG.toFixed(0)} g vs dernière pesée ({lastWeightEntry?.entryDate.slice(0, 10)}) —{' '}
              {weightDeltaG >= 0 ? 'gain régulier.' : 'perte de poids, à surveiller.'}
            </Hint>
          ) : prevWeightG == null ? (
            <Hint>Première pesée enregistrée pour ce lot.</Hint>
          ) : null}

          {/* Recommandation aliment ←→ poids ←→ eau (connaissance souche) */}
          {ctx ? (
            <FeedAdviceCard
              rec={feedRec}
              enteredKg={feedKgEquivalent}
              ageDays={ctx.age}
              liveCount={ctx.live}
              breedName={ctx.breedName}
              isLayer={ctx.isLayer}
              extended
              weightG={values.weightG}
              targetWeightKg={targetWeightKg}
              weightDevPct={weightDevPct}
            />
          ) : null}

          {values.weightG > 0 && ctx ? (
            <Card tone="default">
              <View style={styles.corrGrid}>
                {flockBiomassKg != null ? (
                  <Kpi
                    icon={Scale}
                    label="Cheptel (biomasse)"
                    value={`${flockBiomassKg.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} kg`}
                    deltaPct={weightDevPct}
                  />
                ) : null}
                {eggMassKg != null ? (
                  <Kpi icon={Egg} label="Masse ovulaire / jour" value={`${eggMassKg.toFixed(1)} kg`} />
                ) : null}
              </View>
              {feedNeedMinG != null && feedNeedMaxG != null ? (
                <Hint tone={gPerBirdNow != null && (gPerBirdNow < feedNeedMinG * 0.7 || gPerBirdNow > feedNeedMaxG * 1.5) ? 'amber' : 'brand'}>
                  Besoin estimé à {values.weightG.toLocaleString('fr-FR')} g : {feedNeedMinG.toFixed(0)}–{feedNeedMaxG.toFixed(0)} g d’aliment / oiseau / jour
                  (3–5 % du poids vif)
                  {gPerBirdNow != null
                    ? gPerBirdNow < feedNeedMinG * 0.7
                      ? ` — saisi ${gPerBirdNow.toFixed(0)} g : sous-estimé, vérifiez la saisie de l’aliment ou du poids.`
                      : gPerBirdNow > feedNeedMaxG * 1.5
                        ? ` — saisi ${gPerBirdNow.toFixed(0)} g : au-dessus du besoin (jeunes gallinacés habituel ? sinon vérifiez la saisie).`
                        : ` — saisi ${gPerBirdNow.toFixed(0)} g : cohérent.`
                    : ' — comparez avec l’aliment réellement distribué (Étape 2).'}
                </Hint>
              ) : null}
              {feedPctOfBiomass != null ? (
                <Hint tone={feedPctOfBiomass >= 2 && feedPctOfBiomass <= 12 ? 'success' : 'amber'}>
                  Aliment du jour ≈ {feedPctOfBiomass.toFixed(0)} % de cette biomasse (typique 3–8 %/jour selon âge et espèce) —{' '}
                  {feedPctOfBiomass < 2
                    ? 'très bas pour ce poids, re-vérifiez l’aliment ou le poids saisi.'
                    : feedPctOfBiomass > 12
                      ? 'très élevé (jeunes sujets ? sinon double saisie ?).'
                      : 'cohérent avec le poids.'}
                </Hint>
              ) : null}
              {adgGPerDay != null ? (
                <Hint tone={adgGPerDay < 0 ? 'danger' : adgGPerDay > 120 ? 'amber' : 'success'}>
                  Croissance : {adgGPerDay >= 0 ? '+' : ''}{adgGPerDay.toFixed(0)} g/jour sur {daysSinceLastWeight} j (vs pesée du{' '}
                  {lastWeightEntry?.entryDate.slice(0, 10)}) —{' '}
                  {adgGPerDay < 0
                    ? 'perte de poids, investiguez (alimentation, santé).'
                    : adgGPerDay > 120
                      ? 'gain très rapide, vérifiez la saisie.'
                      : 'progression cohérente.'}
                </Hint>
              ) : null}
              {weightDevPct != null && Math.abs(weightDevPct) > 50 ? (
                <Hint tone="danger">
                  Écart de {weightDevPct.toFixed(0)} % vs objectif, hors plage plausible — re-pesez un échantillon de 30 sujets (saisie en g, sans virgule).
                </Hint>
              ) : null}
            </Card>
          ) : null}
        </View>
      ) : null}

            {/* En mode standalone (sans Sheet hôte), la barre d'actions suit le contenu scrollable. */}
      {onFooterChange ? null : actionsNode}
    </View>
  );
}

const styles = StyleSheet.create({
  // Contexte
  lotRow: { flexDirection: 'row' },
  lotChip: {},
  dateRow: { flexDirection: 'row', gap: 6 },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: radii.pill,
    backgroundColor: color.surfaceAlt, borderWidth: 1, borderColor: color.border,
  },
  dateBtnActive: { backgroundColor: color.brand[600], borderColor: color.brand[600] },
  dateInsight: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: color.surfaceAlt, borderRadius: radii.md,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  dateInsightPill: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: radii.pill,
    backgroundColor: palette.brand[50],
  },
  ctxCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  ctxImg: { width: 52, height: 52, borderRadius: radii.md, backgroundColor: palette.brand[50] },
  ageChip: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: radii.pill,
    backgroundColor: palette.brand[50],
  },
  ctxStats: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  ctxStat: { alignItems: 'flex-start', gap: 0 },
  ctxDivider: { width: 1, height: 18, backgroundColor: color.border },
  existingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: palette.brand[50], borderRadius: radii.md,
    paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: palette.brand[100],
  },
  // Sections
  section: { gap: spacing.sm, paddingVertical: 2 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  phaseChip: { paddingHorizontal: 10, paddingVertical: 5 },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  autoChip: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill,
    backgroundColor: color.surfaceAlt,
  },
  autoWarn: { backgroundColor: color.amber[50] },
  autoCrit: { backgroundColor: color.red[50] },
  targetChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill,
    backgroundColor: palette.brand[50],
  },
  waterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  waterIcon: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#2196D914', alignItems: 'center', justifyContent: 'center',
  },
  tipBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    borderRadius: radii.md, paddingHorizontal: 10, paddingVertical: 9,
    borderWidth: 1,
  },
  kpi: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, flex: 1 },
  kpiIcon: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  corrCard: { gap: spacing.sm, padding: 12 },
  feedAdviceHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  feedAdviceCompare: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  corrGrid: { flexDirection: 'row', gap: 12 },
  ratioWrap: { gap: 6 },
  ratioHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ratioBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill },
  ratioArea: { position: 'relative' },
  ratioTrack: { height: 10, borderRadius: 5, backgroundColor: color.surfaceAlt, overflow: 'hidden' },
  ratioZone: { position: 'absolute', top: 0, height: 10 },
  ratioDot: {
    position: 'absolute', top: -3, width: 14, height: 14, borderRadius: 7, marginLeft: -7,
    borderWidth: 2, borderColor: '#FFFFFF',
    shadowColor: palette.brand[950], shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  ratioTick: { position: 'absolute', top: 0, height: 10, width: 1.5, backgroundColor: color.ink[300] },
  ratioScale: { position: 'relative', height: 14 },
  ratioScaleTick: { position: 'absolute', top: 0, width: 26, marginLeft: -13, textAlign: 'center' },
  ratioScaleEnd: { position: 'absolute', top: 0, left: 0 },
  ratioScaleEndRight: { left: undefined, right: 0 },
  stockPreview: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 },
  // Œufs
  trayRow: { flexDirection: 'row', gap: 8 },
  eggTotal: { backgroundColor: color.surfaceAlt, borderRadius: radii.md, paddingHorizontal: 10, paddingVertical: 8 },
  rejects: { gap: 6 },
  rejectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rejectCell: { flexBasis: '47%', flexGrow: 1, gap: 2 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fieldLabelImg: { width: 24, height: 24, borderRadius: 5 },
  // Divers
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: color.red[50], borderRadius: radii.md,
    paddingHorizontal: 10, paddingVertical: 10,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  savedWrap: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.huge },
});
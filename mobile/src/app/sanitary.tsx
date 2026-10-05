import React, { useEffect, useRef, useState } from 'react';
import { Animated, Alert, Image, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import {
  Activity,
  Calendar,
  CalendarX,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  ClipboardPlus,
  Circle,
  Egg,
  Filter,
  HeartPulse,
  History,
  Info,
  Pencil,
  Pill,
  Plus,
  RotateCcw,
  Scale,
  ShieldCheck,
  Stethoscope,
  Syringe,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wheat,
} from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, levelTone } from '@/components/ui/Chip';
import { FCRGauge } from '@/components/ui/FCRGauge';
import { NumberInput } from '@/components/ui/NumberInput';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Sheet } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Spinner';
import { Segmented } from '@/components/ui/Segmented';
import { MetricTile } from '@/components/ui/MetricTile';
import { PeriodBar, periodWindow, type PeriodWindow } from '@/components/ui/PeriodBar';
import { LineChart } from '@/components/ui/LineChart';
import { useAuth } from '@/auth/AuthContext';
import { canManageFarm } from '@/api/roles';
import { useLiveMinute } from '@/hooks/useLiveMinute';
import {
  fetchBatches,
  fetchBatchHealth,
  fetchFarmInputs,
  fetchHealthEvents,
  fetchProphylaxis,
  fetchProtocols,
  fetchSanitaryProgram,
  fetchTreatments,
} from '@/api';
import { invalidateFarmQueries } from '@/api/invalidate';
import { speciesLabel } from '@/api/format';
import { breedImageForLot } from '@/constants/breedImages';
import {
  cancelProphylaxis,
  completeProphylaxis,
  createHealthEvent,
  createManualSchedule,
  deleteHealthEvent,
  deleteSchedule,
  generateProphylaxis,
  generateVaccineProgram,
  rescheduleProphylaxis,
  resolveHealthEvent,
  todayStr,
  updateSchedule,
} from '@/api/mutations';
import type { CreateHealthEventInput, CreateManualScheduleInput } from '@/api/mutations';
import type {
  AlertLevel,
  BatchHealth,
  BatchWithMetrics,
  CareType,
  DiseaseSeverity,
  HealthEvent,
  HealthEventKind,
  InputLot,
  ProphylaxisEvent,
  SanitaryProtocolWithSteps,
  TreatmentRecord,
} from '@/api/types';
import { color, palette } from '@/constants/theme';
import { normalizeMortalityStatus } from '@/constants/health';
type TabKey = 'sante' | 'check' | 'maladies' | 'traitements';

const TAB_OPTIONS: { key: TabKey; label: string; icon: (active: boolean) => React.ReactNode; description: string; tint?: 'green' | 'red' }[] = [
  { key: 'sante', label: 'Santé', icon: (active) => <HeartPulse size={22} color={active ? palette.surface : color.ink[500]} strokeWidth={2.2} />, description: 'Score, métriques, mortalité' },
  { key: 'check', label: 'Check', icon: (active) => <Activity size={22} color={active ? palette.surface : color.ink[500]} strokeWidth={2.2} />, description: 'Analyse & recommandations' },
  { key: 'maladies', label: 'Maladies', icon: (active) => <Stethoscope size={22} color={active ? palette.surface : color.ink[500]} strokeWidth={2.2} />, description: 'Événements & symptômes', tint: 'red' as const },
  { key: 'traitements', label: 'Traitements', icon: (active) => <Syringe size={22} color={active ? palette.surface : color.ink[500]} strokeWidth={2.2} />, description: 'Calendrier & soins' },
];

const CARE_TYPE_LABEL: Record<CareType, string> = {
  VACCIN: 'Vaccin',
  MEDICAMENT: 'Médicament',
  VITAMINE: 'Vitamine',
  ANTIBIOTIQUE: 'Antibiotique',
  AUTRE: 'Autre',
};

const STATUS_LABEL: Record<string, string> = {
  PLANIFIE: 'Programmé',
  FAIT: 'Fait',
  EN_RETARD: 'En retard',
  ANNULE: 'Annulé',
};

const ROUTE_OPTIONS = [
  'Injection sous-cutanée',
  'Injection intramusculaire',
  'Goutte œil / narine',
  'Eau de boisson',
  'Voile alaire',
  'Oral / aliment',
];

/** Directives de réussite de la vaccination en zone chaude (Gabon). */
const GABON_DIRECTIVES = [
  'Chaîne du froid : conservez les vaccins entre 2 et 8 °C (glacière + accumulateurs).',
  'Eau propre sans chlore ; ajoutez 2,5 g/l de lait écrémé en poudre avant utilisation.',
  'Ne vaccinez jamais des oiseaux malades ou stressés ; déparasitez avant les rappels.',
  'Pas d’antibiotiques 3 j avant / 7 j après un vaccin vivant (multivitamines à la place).',
];

const KIND_LABEL: Record<HealthEventKind, string> = {
  MALADIE: 'Maladie',
  MORTALITE: 'Mortalité',
  REFORME: 'Abattage',
  SYMPTOME: 'Symptôme',
  VISITE_VETO: 'Visite veto',
  AUTRE: 'Autre',
};

const KIND_CHIP_TONE: Record<HealthEventKind, 'red' | 'green' | 'amber' | 'outline'> = {
  MALADIE: 'red',
  MORTALITE: 'red',
  REFORME: 'red',
  SYMPTOME: 'amber',
  VISITE_VETO: 'green',
  AUTRE: 'outline',
};

type EventKindChoice = 'MALADIE' | 'MORTALITE' | 'REFORME';

const EVENT_OPTIONS: { key: EventKindChoice; label: string; tint: string }[] = [
  { key: 'MALADIE', label: 'Maladie', tint: palette.red[600] },
  { key: 'MORTALITE', label: 'Mortalité', tint: palette.red[600] },
  { key: 'REFORME', label: 'Abattage', tint: palette.red[600] },
];

type EventFilterKey = 'ALL' | EventKindChoice;

const EVENT_FILTERS: { key: EventFilterKey; label: string }[] = [
  { key: 'ALL', label: 'Tous' },
  { key: 'MALADIE', label: 'Maladie' },
  { key: 'MORTALITE', label: 'Mortalité' },
  { key: 'REFORME', label: 'Abattage' },
];

const DISEASES: string[] = [
  'Newcastle disease',
  "Marek's disease",
  'Infectious bursal disease',
  'Ranikhet',
  'Coccidiosis',
  'Salmonellosis',
  'Fowl pox',
  'Infectious bronchitis',
  'Avian influenza',
  'Mycoplasma',
];

const CUSTOM_DISEASE = '__custom';

const SYMPTOM_OPTIONS: string[] = [
  'Détresse respiratoire',
  'Diarrhée',
  'Léthargie',
  'Gonflement tête/face',
  'Baisse de ponte',
  'Perte de poids',
  'Plumes hérissées',
  'Morts brutales',
  'Paralysie/tremblements',
  'Toux/éternuements',
];

const DISEASE_SEVERITY_OPTIONS: { key: DiseaseSeverity; label: string; tone: 'green' | 'amber' | 'red' }[] = [
  { key: 'LOW', label: 'Faible', tone: 'green' },
  { key: 'MEDIUM', label: 'Moyenne', tone: 'amber' },
  { key: 'HIGH', label: 'Élevée', tone: 'red' },
  { key: 'CRITICAL', label: 'Critique', tone: 'red' },
];

const DISEASE_SEVERITY_LABEL: Record<DiseaseSeverity, string> = {
  LOW: 'Faible',
  MEDIUM: 'Moyenne',
  HIGH: 'Élevée',
  CRITICAL: 'Critique',
};

const DISEASE_SEVERITY_TO_LEVEL: Record<DiseaseSeverity, AlertLevel> = {
  LOW: 'VERT',
  MEDIUM: 'JAUNE',
  HIGH: 'ROUGE',
  CRITICAL: 'ROUGE',
};

const MORTALITY_CAUSES: { key: string; label: string }[] = [
  { key: 'MALADIE', label: 'Maladie' },
  { key: 'HEAT_STRESS', label: 'Stress thermique' },
  { key: 'INJURY', label: 'Blessure' },
  { key: 'PREDATOR', label: 'Prédateur' },
  { key: 'UNKNOWN', label: 'Inconnue' },
];

const MORTALITY_CAUSE_LABEL: Record<string, string> = Object.fromEntries(
  MORTALITY_CAUSES.map((c) => [c.key, c.label]),
);

const KIND_ICON: Record<HealthEventKind, React.ReactNode> = {
  MALADIE: <Stethoscope size={16} color={color.red[500]} />,
  MORTALITE: <HeartPulse size={16} color={color.red[500]} />,
  REFORME: <Trash2 size={16} color={color.accent[600]} />,
  SYMPTOME: <Activity size={16} color={color.amber[500]} />,
  VISITE_VETO: <ShieldCheck size={16} color={color.green[600]} />,
  AUTRE: <ClipboardPlus size={16} color={color.ink[400]} />,
};

function addUtcDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function parseIsoLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtFrDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

function isoFromLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function scoreToken(score: number): 'success' | 'warn' | 'danger' {
  if (score >= 80) return 'success';
  if (score >= 60) return 'warn';
  return 'danger';
}

function scoreHex(score: number): string {
  if (score >= 80) return palette.green[600];
  if (score >= 60) return palette.amber[500];
  return palette.red[500];
}

// Les dates sanitaires sont stockées en UTC (YYYY-MM-DD) côté serveur.
const fromUtc = (epochMs: number) => new Date(epochMs).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

type CareStatus = {
  lateCount: number;
  doneCount: number;
  pendingCount: number;
  next: ProphylaxisEvent | null;
  nextAtDay: number | null;
  upToDate: boolean;
};

function careStatus(events: ProphylaxisEvent[] | undefined, integrationDate: string): CareStatus {
  const active = (events ?? []).filter((p) => p.status !== 'ANNULE');
  const today = fromUtc(Date.now());
  const late = active.filter((p) => p.status === 'EN_RETARD');
  const done = active.filter((p) => p.status === 'FAIT');
  const pending = active.filter((p) => p.status === 'PLANIFIE' && p.scheduledDate >= today);
  const next = [...late, ...pending].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0] ?? null;
  const nextAtDay = next && integrationDate ? daysBetween(integrationDate.slice(0, 10), next.scheduledDate) + 1 : null;
  return { lateCount: late.length, doneCount: done.length, pendingCount: pending.length, next, nextAtDay, upToDate: late.length === 0 };
}

function EventCard({
  e,
  busy,
  canDelete,
  onComplete,
  onCancel,
  onReschedule,
  onEdit,
  onDelete,
}: {
  e: ProphylaxisEvent;
  busy: boolean;
  canDelete: boolean;
  onComplete: () => void;
  onCancel: () => void;
  onReschedule: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const done = e.status === 'FAIT';
  const cancelled = e.status === 'ANNULE';
  const tone = levelTone(e.status === 'EN_RETARD' ? 'ROUGE' : e.status === 'PLANIFIE' ? 'JAUNE' : 'VERT');
  return (
    <Card tone={done ? 'green' : cancelled ? 'plain' : e.status === 'EN_RETARD' ? 'warn' : 'default'} style={styles.card}>
      <View style={styles.head}>
        <View style={styles.badge}>
          {done ? <Check size={16} color={color.green[600]} /> : <Pill size={16} color={e.status === 'EN_RETARD' ? color.red[500] : color.brand[600]} />}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.head}>
            <AppText size="body" weight="semibold" color="text" style={{ flex: 1 }}>
              {e.name}
            </AppText>
            <Chip label={STATUS_LABEL[e.status] ?? e.status} tone={tone} dot />
          </View>
          <AppText size="caption" color="muted">
            {CARE_TYPE_LABEL[e.careType] ?? e.careType}
            {e.dosage ? ` · ${e.dosage}` : ''}
            {e.withdrawalDays > 0 ? ` · délai d’attente ${e.withdrawalDays} j` : ''}
          </AppText>
          <View style={styles.rowWrap}>
            <Chip
              label={e.source === 'PROGRAM' ? 'Programme' : 'Manuel'}
              tone={e.source === 'PROGRAM' ? 'brand' : 'neutral'}
              selected={false}
              style={{ marginBottom: 0 }}
            />
            {e.decrementStock && e.medicationLotId ? (
              <Chip
                label={`Stock : −${e.medicationQty ?? 0} ${e.medicationUnit ?? ''}`}
                tone="amber"
                style={{ marginBottom: 0 }}
              />
            ) : null}
          </View>
          <AppText size="caption" color="muted">
            {e.scheduledDate}
            {e.completedAt ? ` · réalisé le ${e.completedAt.slice(0, 10)}` : ''}
          </AppText>
        </View>
      </View>
      {!done && !cancelled ? (
        <View style={styles.actions}>
          <Button label="Compléter" tone="success" size="md" block={false} icon={Check} onPress={onComplete} disabled={busy} />
          <Button label="Reporter +1 j" tone="brand" size="md" block={false} icon={RotateCcw} onPress={onReschedule} disabled={busy} />
          <Button label="Éditer" tone="ghost" size="md" block={false} icon={Pencil} onPress={onEdit} disabled={busy} />
          <Button label="Annuler" tone="ghost" size="md" block={false} icon={CalendarX} onPress={onCancel} disabled={busy} />
          {canDelete ? (
            <Button label="Supprimer" tone="danger" size="md" block={false} icon={Trash2} onPress={onDelete} disabled={busy} />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function TreatmentCard({ t }: { t: TreatmentRecord }) {
  return (
    <View style={styles.treatRow}>
      <View style={styles.badge}>
        <Pill size={16} color={t.careType === 'ANTIBIOTIQUE' ? color.accent[600] : color.brand[600]} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <AppText size="body" weight="semibold" color="text">
          {t.productName}
        </AppText>
        <AppText size="caption" color="muted">
          {CARE_TYPE_LABEL[t.careType] ?? t.careType}
          {t.dosage ? ` · ${t.dosage}` : ''} · {t.administeredAt?.slice(0, 10)}
        </AppText>
        {t.withdrawalDays > 0 ? (
          <AppText size="caption" color="warn">
            Délai d’attente {t.withdrawalDays} j · vente suspendue jusqu’au {t.withdrawalEndDate?.slice(0, 10) ?? '—'}
          </AppText>
        ) : null}
        {t.notes ? (
          <AppText size="caption" color="faint">
            {t.notes}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

function CheckRow({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <Pressable onPress={onToggle} style={styles.checkRow} accessibilityRole="checkbox" accessibilityState={{ checked }}>
      <View style={[styles.checkbox, checked && styles.checkboxOn]}>
        {checked ? <Check size={12} color={palette.surface} /> : null}
      </View>
      <AppText size="body" color="text" style={{ flex: 1 }}>
        {label}
      </AppText>
    </Pressable>
  );
}

function FormLabel({ text, tone = 'red' }: { text: string; tone?: 'red' | 'green' }) {
  return (
    <View style={styles.formLabel}>
      <View style={[styles.formLabelBar, tone === 'green' && { backgroundColor: palette.green[600] }]} />
      <AppText size="label" weight="bold" color={tone === 'green' ? 'success' : 'danger'} style={styles.formLabelText}>
        {text}
      </AppText>
    </View>
  );
}

function DiseaseFields({
  disease,
  setDisease,
  customDisease,
  setCustomDisease,
  showDiseasePicker,
  setShowDiseasePicker,
  diseaseSeverity,
  setDiseaseSeverity,
  symptomSel,
  setSymptomSel,
  treatment,
  setTreatment,
  vetConsulted,
  setVetConsulted,
  vetName,
  setVetName,
  resolvedNow,
  setResolvedNow,
}: {
  disease: string;
  setDisease: (s: string) => void;
  customDisease: string;
  setCustomDisease: (s: string) => void;
  showDiseasePicker: boolean;
  setShowDiseasePicker: (b: boolean) => void;
  diseaseSeverity: DiseaseSeverity;
  setDiseaseSeverity: (s: DiseaseSeverity) => void;
  symptomSel: string[];
  setSymptomSel: (s: string[]) => void;
  treatment: string;
  setTreatment: (s: string) => void;
  vetConsulted: boolean;
  setVetConsulted: (b: boolean) => void;
  vetName: string;
  setVetName: (s: string) => void;
  resolvedNow: boolean;
  setResolvedNow: (b: boolean) => void;
}) {
  const effectiveDisease = disease === CUSTOM_DISEASE ? customDisease : disease;
  return (
    <>
      <FormLabel text="MALADIE *" />
      <Pressable onPress={() => setShowDiseasePicker(true)} style={styles.selectBtn} accessibilityRole="button">
        <View style={{ flex: 1 }}>
          <AppText size="body" weight="semibold" color={effectiveDisease ? 'text' : 'faint'} numberOfLines={1}>
            {effectiveDisease || 'Choisir une maladie…'}
          </AppText>
        </View>
        <ChevronDown size={18} color={palette.red[500]} />
      </Pressable>
      {disease === CUSTOM_DISEASE ? (
        <TextInput
          value={customDisease}
          onChangeText={setCustomDisease}
          placeholder="Nom de la maladie (maladie personnalisée)"
          placeholderTextColor={color.ink[300]}
          style={styles.input}
        />
      ) : null}

      <FormLabel text="SÉVÉRITÉ *" />
      <View style={styles.rowWrap}>
        {DISEASE_SEVERITY_OPTIONS.map((s) => (
          <Pressable key={s.key} onPress={() => setDiseaseSeverity(s.key)} accessibilityRole="button">
            <Chip label={s.label} tone={diseaseSeverity === s.key ? s.tone : 'outline'} style={styles.chip} />
          </Pressable>
        ))}
      </View>

      <FormLabel text="SYMPTÔMES (OPTIONNEL)" />
      <View style={styles.rowWrap}>
        {SYMPTOM_OPTIONS.map((sym) => {
          const selected = symptomSel.includes(sym);
          return (
            <Pressable
              key={sym}
              onPress={() => setSymptomSel(selected ? symptomSel.filter((x) => x !== sym) : [...symptomSel, sym])}
              accessibilityRole="button">
              <Chip label={sym} tone={selected ? 'amber' : 'outline'} style={styles.chip} />
            </Pressable>
          );
        })}
      </View>

      <FormLabel text="TRAITEMENT ADMINISTRÉ (OPTIONNEL)" />
      <TextInput
        value={treatment}
        onChangeText={setTreatment}
        placeholder="Médicament ou traitement donné (optionnel)"
        placeholderTextColor={color.ink[300]}
        style={styles.input}
      />

      <FormLabel text="VÉTÉRINAIRE (OPTIONNEL)" />
      <CheckRow checked={vetConsulted} onToggle={() => setVetConsulted(!vetConsulted)} label="Vétérinaire consulté" />
      {vetConsulted ? (
        <TextInput
          value={vetName}
          onChangeText={setVetName}
          placeholder="Nom du vétérinaire (optionnel)"
          placeholderTextColor={color.ink[300]}
          style={styles.input}
        />
      ) : null}

      <CheckRow checked={resolvedNow} onToggle={() => setResolvedNow(!resolvedNow)} label="Événement résolu" />
    </>
  );
}

function HealthEventRow({
  e,
  canDelete,
  busy,
  onResolve,
  onDelete,
}: {
  e: HealthEvent;
  canDelete: boolean;
  busy: boolean;
  onResolve: () => void;
  onDelete: () => void;
}) {
  const resolved = e.status === 'RESOLU';
  return (
    <Card tone={resolved ? 'plain' : 'alert'} style={styles.card}>
      <View style={styles.head}>
        <View style={styles.badge}>{KIND_ICON[e.kind]}</View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.head}>
            <AppText size="body" weight="semibold" color="text" style={{ flex: 1 }}>
              {e.title}
            </AppText>
            <Chip label={KIND_LABEL[e.kind] ?? e.kind} tone={KIND_CHIP_TONE[e.kind]} dot />
          </View>
          <AppText size="caption" color="muted">
            {KIND_LABEL[e.kind] ?? e.kind}
            {e.kind === 'MALADIE' && e.diseaseSeverity ? ` · ${DISEASE_SEVERITY_LABEL[e.diseaseSeverity]}` : ''}
            {e.quantity > 0 ? ` · ${e.quantity} oiseau(x)` : ''} · {e.occurredAt}
          </AppText>
          {e.symptoms ? (
            <AppText size="caption" color="muted">
              {e.symptoms}
            </AppText>
          ) : null}
          {e.kind === 'MALADIE' && (e.treatmentGiven || e.vetName || e.vetConsulted) ? (
            <AppText size="caption" color={resolved ? 'faint' : 'danger'}>
              {e.treatmentGiven ? `Traitement : ${e.treatmentGiven}` : ''}
              {e.treatmentGiven && (e.vetName || e.vetConsulted) ? ' · ' : ''}
              {e.vetName ? `Vétérinaire : ${e.vetName}` : e.vetConsulted ? 'Vétérinaire consulté' : ''}
            </AppText>
          ) : null}
          {e.description ? (
            <AppText size="caption" color="faint">
              {e.description}
            </AppText>
          ) : null}
          <Chip label={resolved ? 'Résolu' : 'En cours'} tone={levelTone(resolved ? 'VERT' : 'ROUGE')} dot />
        </View>
      </View>
      <View style={styles.actions}>
        {!resolved ? (
          <Button label="Marquer résolu" tone="success" size="md" block={false} icon={Check} onPress={onResolve} disabled={busy} />
        ) : null}
        {canDelete ? (
          <Button label="Supprimer" tone="danger" size="md" block={false} icon={Trash2} onPress={onDelete} disabled={busy} />
        ) : null}
      </View>
    </Card>
  );
}

function FadeIn({ children }: { children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(ty, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [opacity, ty]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY: ty }] }}>{children}</Animated.View>
  );
}

export default function SanitaryScreen() {
  const router = useRouter();
  const { farmId, user } = useAuth();
  const queryClient = useQueryClient();
  const isProprietaire = canManageFarm(user?.role);

  const [window, setWindow] = useState<PeriodWindow>(() => periodWindow('all'));
  const firstWindowRef = useRef(true);

  const batchesQuery = useQuery({ queryKey: ['batches', farmId, window.isFiltered ? (window.to ?? '') : ''], queryFn: () => fetchBatches(farmId, window.isFiltered ? window.to : undefined) });
  const lots = (batchesQuery.data ?? []).filter((b) => b.status === 'ACTIF' || b.status === 'EN_VENTE');

  const [lotId, setLotId] = useState('');
  const lot = lots.find((b) => b.id === lotId) ?? lots[0];
  const batchId = lot?.id ?? '';

  // Accès « planifier un soin » profond depuis une carte lot (?lot=..&plan=1).
  const { lot: lotParam, plan: planParam } = useLocalSearchParams<{ lot?: string; plan?: string }>();

  const [tab, setTab] = useState<TabKey>('sante');

  const handlePeriodChange = (w: PeriodWindow) => {
    setWindow(w);
    if (firstWindowRef.current) {
      firstWindowRef.current = false;
      return;
    }
  };

  const inPeriod = (dateStr: string): boolean => {
    const day = dateStr.slice(0, 10);
    if (window.span === 'all') return !window.isFiltered || day === window.to;
    if (!window.from) return true;
    return day >= window.from && day <= (window.to ?? '');
  };

  const health = useQuery({
    queryKey: ['health', farmId, batchId, window.isFiltered ? (window.to ?? '') : ''],
    queryFn: () => fetchBatchHealth(farmId, batchId, window.isFiltered ? window.to : undefined),
    enabled: batchId !== '',
  });
  const events = useQuery({
    queryKey: ['health-events', farmId, batchId],
    queryFn: () => fetchHealthEvents(farmId, batchId),
    enabled: batchId !== '',
  });
  const calendar = useQuery({
    queryKey: ['sanitary', farmId, batchId],
    queryFn: () => fetchProphylaxis(farmId, batchId),
    enabled: batchId !== '',
  });
  const treatments = useQuery({
    queryKey: ['treatments', farmId, batchId],
    queryFn: () => fetchTreatments(farmId, batchId),
    enabled: batchId !== '',
  });

  useLiveMinute(() => {
    if (window.isFiltered) return;
    void batchesQuery.refetch();
    if (batchId !== '') {
      void health.refetch();
      void events.refetch();
      void calendar.refetch();
      void treatments.refetch();
    }
  });

  const [kind, setKind] = useState<EventKindChoice>('MALADIE');
  const [occurredAt, setOccurredAt] = useState('');
  const [quantity, setQuantity] = useState('');
  const [eventNotes, setEventNotes] = useState('');

  const [treatFilter, setTreatFilter] = useState<'ALL' | CareType>('ALL');
  const [treatFilterOpen, setTreatFilterOpen] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [eventLotId, setEventLotId] = useState('');
  const [showEventDate, setShowEventDate] = useState(false);
  const [disease, setDisease] = useState('');
  const [customDisease, setCustomDisease] = useState('');
  const [showDiseasePicker, setShowDiseasePicker] = useState(false);
  const [diseaseSeverity, setDiseaseSeverity] = useState<DiseaseSeverity>('HIGH');
  const [symptomSel, setSymptomSel] = useState<string[]>([]);
  const [treatment, setTreatment] = useState('');
  const [vetConsulted, setVetConsulted] = useState(false);
  const [vetName, setVetName] = useState('');
  const [resolvedNow, setResolvedNow] = useState(false);
  const [mortalityCause, setMortalityCause] = useState('');
  const [cullReason, setCullReason] = useState('');
  const [eventFilter, setEventFilter] = useState<EventFilterKey>('ALL');

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ProphylaxisEvent | null>(null);
  const [wizardSeq, setWizardSeq] = useState(0);

  const openCreateWizard = () => {
    setEditingEvent(null);
    setWizardSeq((n) => n + 1);
    setWizardOpen(true);
  };
  const openEditWizard = (e: ProphylaxisEvent) => {
    setEditingEvent(e);
    setWizardOpen(true);
  };
  const closeWizard = () => {
    setWizardOpen(false);
    setEditingEvent(null);
  };

  // Lien profond depuis une carte lot : présélectionne le lot ciblé puis ouvre
  // le planificateur de soins pour ce lot.
  const deepPlanOpened = useRef(false);
  useEffect(() => {
    if (!lotParam) return;
    if (batchesQuery.isSuccess && lots.some((b) => b.id === lotParam)) {
      setLotId(lotParam);
    }
  }, [lotParam, batchesQuery.isSuccess, lots]);

  useEffect(() => {
    if (planParam !== '1' || deepPlanOpened.current || batchId === '') return;
    if (lotParam && lotId !== lotParam) return;
    deepPlanOpened.current = true;
    openCreateWizard();
  }, [planParam, lotParam, batchId, lotId]);

  const deleteScheduleEvent = (e: ProphylaxisEvent) => {
    if (!batchId) return;
    Alert.alert(
      'Supprimer le soin',
      'Cette échéance sera supprimée (action Propriétaire). Le stock est restitué si une sortie « Sortir du stock » y était liée.',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () =>
            void (async () => {
              setBusy(e.id);
              setError(null);
              try {
                await deleteSchedule(farmId, batchId, e.id);
                await invalidateFarmQueries(queryClient, { farmId, batchId });
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Suppression impossible.');
              } finally {
                setBusy(null);
              }
            })(),
        },
      ],
    );
  };

  const invalidate = async (b: string) => {
    await invalidateFarmQueries(queryClient, { farmId, batchId: b });
  };

  const onRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['batches', farmId] }),
      queryClient.invalidateQueries({ queryKey: ['health', farmId, batchId] }),
      queryClient.invalidateQueries({ queryKey: ['health-events', farmId, batchId] }),
      queryClient.invalidateQueries({ queryKey: ['sanitary', farmId, batchId] }),
      queryClient.invalidateQueries({ queryKey: ['prophylaxis', farmId, batchId] }),
      queryClient.invalidateQueries({ queryKey: ['treatments', farmId, batchId] }),
    ]);
  };

  const act = async (
    action: 'complete' | 'cancel' | 'reschedule' | 'generate',
    event?: ProphylaxisEvent,
  ) => {
    if (!batchId) return;
    setError(null);
    if (action === 'cancel') {
      Alert.alert('Annuler le soin', 'Le soin ne sera pas réalisé. Confirmer ?', [
        { text: 'Non', style: 'cancel' },
        { text: 'Annuler le soin', style: 'destructive', onPress: () => void run() },
      ]);
      return;
    }
    await run();
    async function run() {
      if (!batchId) return;
      const eventId = event?.id;
      if (action !== 'generate' && !eventId) return;
      setBusy(eventId ?? 'generate');
      try {
        if (action === 'complete') {
          await completeProphylaxis(farmId, batchId, eventId!, { completedAt: todayStr() });
        } else if (action === 'reschedule') {
          await rescheduleProphylaxis(farmId, batchId, eventId!, addUtcDays(event!.scheduledDate, 1));
        } else if (action === 'cancel') {
          await cancelProphylaxis(farmId, batchId, eventId!, 'Annulé depuis le mobile');
        } else {
          await generateProphylaxis(farmId, batchId);
        }
        await invalidate(batchId);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur lors de la mise à jour du soin.');
      } finally {
        setBusy(null);
      }
    }
  };

  const saveEvent = async () => {
    const lotNow = lots.find((b) => b.id === (eventLotId || batchId)) ?? lot;
    if (!lotNow) return;
    const date = occurredAt.trim() || todayStr();
    const qty = quantity.trim() ? Number(quantity.trim()) : 0;
    if (quantity.trim() && (!Number.isFinite(qty) || qty < 0 || qty % 1 !== 0)) {
      setError('La quantité doit être un nombre entier positif.');
      return;
    }
    setError(null);

    if (kind === 'MALADIE') {
      const name = (disease === CUSTOM_DISEASE ? customDisease : disease).trim();
      if (name.length < 2) {
        setError('Sélectionnez ou saisissez la maladie.');
        return;
      }
    } else if (qty <= 0) {
      setError(kind === 'REFORME' ? 'Indiquez le nombre d’oiseaux abattus.' : 'Indiquez le nombre d’oiseaux morts.');
      return;
    }

    let title = '';
    let description: string | undefined;
    let symptomsJoined = '';
    let payloadSeverity: AlertLevel = 'JAUNE';
    const diseaseFields: Partial<CreateHealthEventInput> = {};

    if (kind === 'MALADIE') {
      const name = (disease === CUSTOM_DISEASE ? customDisease : disease).trim();
      title = name;
      payloadSeverity = DISEASE_SEVERITY_TO_LEVEL[diseaseSeverity];
      symptomsJoined = symptomSel.join(', ');
      Object.assign(diseaseFields, {
        disease: name,
        diseaseSeverity,
        ...(treatment.trim() ? { treatmentGiven: treatment.trim() } : {}),
        vetConsulted,
        ...(vetConsulted && vetName.trim() ? { vetName: vetName.trim() } : {}),
        resolved: resolvedNow,
      });
    } else if (kind === 'MORTALITE') {
      title = mortalityCause ? `Mortalité — ${MORTALITY_CAUSE_LABEL[mortalityCause]}` : 'Pic de mortalité';
      if (mortalityCause) description = MORTALITY_CAUSE_LABEL[mortalityCause];
    } else {
      title = 'Abattage sanitaire';
      if (cullReason.trim()) description = cullReason.trim();
    }

    setBusy('event');
    try {
      await createHealthEvent(farmId, lotNow.id, {
        kind,
        occurredAt: date,
        quantity: Math.floor(qty),
        severity: payloadSeverity,
        title,
        ...(description ? { description } : {}),
        ...(symptomsJoined ? { symptoms: symptomsJoined } : {}),
        ...(eventNotes.trim() ? { notes: eventNotes.trim() } : {}),
        ...diseaseFields,
      });
      setFormOpen(false);
      setOccurredAt('');
      setQuantity('');
      setEventNotes('');
      setDisease('');
      setCustomDisease('');
      setSymptomSel([]);
      setTreatment('');
      setVetConsulted(false);
      setVetName('');
      setResolvedNow(false);
      setMortalityCause('');
      setCullReason('');
      setDiseaseSeverity('HIGH');
      await invalidate(lotNow.id);
      if ((kind === 'MORTALITE' || kind === 'REFORME') && qty > 0) {
        const birds = Math.floor(qty);
        const lotName = lotNow.batchName ?? 'ce lot';
        const remaining = Math.max(0, (lotNow.quantityAlive ?? 0) - birds);
        Alert.alert(
          'Effectif du lot mis à jour',
          kind === 'REFORME'
            ? `${birds} oiseaux abattus (réforme sanitaire) retirés de « ${lotName} ».\nEffectif vivant restant estimé : ${remaining} oiseaux.\nMaintenez la surveillance : eau et aliment à volonté pour le reste du lot, isolez tout sujet affaibli.`
            : `${birds} oiseaux morts enregistrés sur « ${lotName} ».\nEffectif vivant restant estimé : ${remaining} oiseaux.\nEn cas de pic de mortalité répété (> 1 % du lot), renforcez la surveillance ; au-delà de 5 %, contactez un vétérinaire.`,
          [{ text: 'OK', style: 'cancel' }],
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l’enregistrement de l’événement.');
    } finally {
      setBusy(null);
    }
  };

  const resolveHealth = async (e: HealthEvent) => {
    if (!batchId) return;
    setError(null);
    setBusy(`res-${e.id}`);
    try {
      await resolveHealthEvent(farmId, batchId, e.id);
      await invalidate(batchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la résolution.');
    } finally {
      setBusy(null);
    }
  };

  const removeHealth = async (e: HealthEvent) => {
    if (!batchId) return;
    Alert.alert(
      'Supprimer l’événement',
      e.kind === 'REFORME'
        ? 'La suppression d’un abattage réintègre l’effectif vivant. Continuer ?'
        : 'Cet événement sanitaire sera supprimé. Continuer ?',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setError(null);
              setBusy(`del-${e.id}`);
              try {
                await deleteHealthEvent(farmId, batchId, e.id);
                await invalidate(batchId);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Erreur lors de la suppression.');
              } finally {
                setBusy(null);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <Screen
      refreshing={batchesQuery.isFetching && !batchesQuery.isLoading}
      onRefresh={() => void onRefresh()}
      header={
        <>
          {/* ── HEADER + DATE BAR (fixes, comme Accueil) ── */}
          <View style={styles.customHeader}>
            <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button">
              <ChevronLeft size={22} color={color.ink[800]} />
            </Pressable>
            <Image source={require('@/assets/images/logo-nav.png')} style={styles.headerLogo} />
            <View style={{ flex: 1 }}>
              <AppText size="h2" weight="bold" color="text" numberOfLines={1}>
                Sanitaire
              </AppText>
              <AppText size="small" color="muted" numberOfLines={1}>
                Prophylaxie, maladies & traitements
              </AppText>
            </View>
            <Activity size={18} color={color.ink[300]} />
          </View>
          <PeriodBar defaultSpan="all" onChange={handlePeriodChange} />
        </>
      }
    >
      {batchesQuery.isLoading ? (
        <Spinner label="Chargement du calendrier…" />
      ) : (
        <>
          <View style={styles.cardTabs}>
            {TAB_OPTIONS.map((t) => {
              const active = t.key === tab;
              const isRed = t.tint === 'red';
              return (
                <Pressable
                  key={t.key}
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); setTab(t.key); }}
                  style={[styles.cardTab, active && (isRed ? styles.cardTabActiveRed : styles.cardTabActive)]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}>
                  <View style={[styles.cardTabIcon, active && (isRed ? styles.cardTabIconActiveRed : styles.cardTabIconActive)]}>
                    {t.icon(active)}
                  </View>
                  <AppText
                    size="small"
                    weight={active ? 'semibold' : 'medium'}
                    color={active ? (isRed ? 'danger' : 'success') : 'muted'}
                    align="center">
                    {t.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {lots.length > 0 && (
            <>
              <AppText size="label" color="muted" style={{ marginBottom: 6 }}>
                LOT
              </AppText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.lotCarousel}
                style={{ flexGrow: 0 }}>
                {lots.map((b) => {
                  const spec = b.species ?? 'POULET';
                  const active = lot?.id === b.id;
                  return (
                    <Pressable
                      key={b.id}
                      onPress={() => setLotId(b.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={({ pressed }) => [
                        styles.lotCarouselItem,
                        active && styles.lotCarouselItemActive,
                        pressed && styles.lotCarouselItemPressed,
                      ]}>
                      <View style={styles.lotCarouselImg}>
                        {breedImageForLot(b.breedName, b.species) ? (
                          <Image source={breedImageForLot(b.breedName, b.species)!} style={styles.lotCarouselImgImg} resizeMode="cover" />
                        ) : (
                          <View style={styles.lotCarouselImgFallback}>
                            <AppText size="label" weight="bold" color="brand" numberOfLines={2} style={styles.lotCarouselImgText}>
                              {speciesLabel(spec)}
                            </AppText>
                          </View>
                        )}
                      </View>
                      <AppText
                        size="label"
                        weight="semibold"
                        color="text"
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.7}
                        style={styles.lotCarouselName}>
                        {b.batchName ?? b.id}
                      </AppText>
                      <AppText
                        size="label"
                        color={active ? 'brand' : 'muted'}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.7}
                        style={styles.lotCarouselSouche}>
                        {b.breedName ?? speciesLabel(spec)}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          )}

          {error ? (
            <AppText size="small" color="danger" style={{ marginBottom: 8 }}>
              {error}
            </AppText>
          ) : null}

          <FadeIn key={`${tab}-${window.span}-${window.isFiltered}-${window.from ?? ''}`}>
          {(() => {
            const filteredEvents = (events.data ?? []).filter((e) => inPeriod(e.occurredAt));
            const filteredCalendar = (calendar.data ?? []).filter((e) => inPeriod(e.scheduledDate));
            const filteredTreatments = (treatments.data ?? []).filter((t) => inPeriod(t.administeredAt?.slice(0, 10) ?? ''));

          return (<>
          {tab === 'sante' ? (
            <SanteTab health={health.data as BatchHealth | undefined} loading={health.isLoading} lotName={lot?.batchName ?? ''} prophylaxis={calendar.data} integrationDate={lot?.integrationDate ?? ''} />
          ) : null}

          {tab === 'check' ? (
            <CheckTab health={health.data as BatchHealth | undefined} loading={health.isLoading} lotName={lot?.batchName ?? ''} />
          ) : null}

          {tab === 'maladies' ? (
            <MaladiesTab
              events={filteredEvents}
              loading={events.isLoading}
              lotName={lot?.batchName ?? ''}
              isProprietaire={isProprietaire}
              busy={busy}
              lots={lots}
              defaultLotId={batchId}
              formOpen={formOpen}
              setFormOpen={setFormOpen}
              kind={kind}
              setKind={setKind}
              eventLotId={eventLotId}
              setEventLotId={setEventLotId}
              occurredAt={occurredAt}
              setOccurredAt={setOccurredAt}
              showEventDate={showEventDate}
              setShowEventDate={setShowEventDate}
              quantity={quantity}
              setQuantity={setQuantity}
              disease={disease}
              setDisease={setDisease}
              customDisease={customDisease}
              setCustomDisease={setCustomDisease}
              showDiseasePicker={showDiseasePicker}
              setShowDiseasePicker={setShowDiseasePicker}
              diseaseSeverity={diseaseSeverity}
              setDiseaseSeverity={setDiseaseSeverity}
              symptomSel={symptomSel}
              setSymptomSel={setSymptomSel}
              treatment={treatment}
              setTreatment={setTreatment}
              vetConsulted={vetConsulted}
              setVetConsulted={setVetConsulted}
              vetName={vetName}
              setVetName={setVetName}
              resolvedNow={resolvedNow}
              setResolvedNow={setResolvedNow}
              mortalityCause={mortalityCause}
              setMortalityCause={setMortalityCause}
              cullReason={cullReason}
              setCullReason={setCullReason}
              eventNotes={eventNotes}
              setEventNotes={setEventNotes}
              eventFilter={eventFilter}
              setEventFilter={setEventFilter}
              onSave={() => void saveEvent()}
              onResolve={(e) => void resolveHealth(e)}
              onDelete={(e) => void removeHealth(e)}
            />
          ) : null}

          {tab === 'traitements' ? (
            <>
              <SectionHeader
                title="Calendrier de soins"
                icon={Calendar}
                iconColor={palette.green[600]}
                iconBg={palette.green[50]}
              />
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); openCreateWizard(); }}
                disabled={busy !== null}
                style={({ pressed }) => [styles.scheduleCta, pressed && styles.scheduleCtaPressed]}
                accessibilityRole="button">
                <View style={styles.scheduleCtaIcon}>
                  <Syringe size={20} color={palette.green[600]} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText size="bodyM" weight="bold" color={palette.surface}>
                    Planifier un soin
                  </AppText>
                  <AppText size="small" color={palette.green[100]} numberOfLines={1} adjustsFontSizeToFit>
                    Vaccination Gabon · manuel · multi-lots
                  </AppText>
                </View>
                <Plus size={22} color={palette.surface} strokeWidth={2.6} />
              </Pressable>
              {calendar.isLoading ? (
                <Spinner label="Lecture du calendrier…" />
              ) : (
                <View style={{ gap: 10 }}>
                  {filteredCalendar.length === 0 ? (
                    <Card tone="default" style={styles.emptyCard}>
                      <View style={styles.emptyCardRow}>
                        <View style={styles.emptyCardIcon}>
                          <Calendar size={18} color={palette.green[500]} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <AppText size="body" weight="semibold" color="text">
                            Aucun soin programmé
                          </AppText>
                          <AppText size="small" color="muted" style={{ marginTop: 2 }}>
                            Sélectionnez « Planifier un soin » pour un programme de vaccination ou un soin manuel.
                          </AppText>
                        </View>
                      </View>
                    </Card>
                  ) : (
                    filteredCalendar.map((e) => (
                      <EventCard
                        key={e.id}
                        e={e}
                        busy={busy === e.id}
                        canDelete={isProprietaire}
                        onComplete={() => void act('complete', e)}
                        onReschedule={() => void act('reschedule', e)}
                        onCancel={() => void act('cancel', e)}
                        onEdit={() => openEditWizard(e)}
                        onDelete={() => deleteScheduleEvent(e)}
                      />
                    ))
                  )}
                </View>
              )}

              <SectionHeader
                title="Historique des traitements"
                subtitle={lot?.batchName ?? ''}
                icon={History}
                iconColor={palette.green[600]}
                iconBg={palette.green[50]}
                right={
                  <Pressable
                    onPress={() => setTreatFilterOpen((o) => !o)}
                    accessibilityRole="button"
                    style={[
                      styles.filterBtn,
                      (treatFilter !== 'ALL' || treatFilterOpen) && styles.filterBtnActive,
                    ]}>
                    <Filter size={16} color={treatFilter !== 'ALL' || treatFilterOpen ? palette.green[600] : color.ink[400]} strokeWidth={2.4} />
                  </Pressable>
                }
              />
              {treatFilterOpen ? (
                <View style={[styles.rowWrap, { marginBottom: 10 }]}>
                  <Pressable onPress={() => setTreatFilter('ALL')} accessibilityRole="button">
                    <Chip label="Tous" tone={treatFilter === 'ALL' ? 'green' : 'neutral'} selected={treatFilter === 'ALL'} style={styles.chip} />
                  </Pressable>
                  {(Object.keys(CARE_TYPE_LABEL) as CareType[]).map((k) => (
                    <Pressable key={k} onPress={() => setTreatFilter(treatFilter === k ? 'ALL' : k)} accessibilityRole="button">
                      <Chip label={CARE_TYPE_LABEL[k]} tone={treatFilter === k ? 'green' : 'neutral'} selected={treatFilter === k} style={styles.chip} />
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <Card tone="default" style={{ paddingVertical: 6, gap: 0 }}>
                {filteredTreatments.filter((t) => treatFilter === 'ALL' || t.careType === treatFilter).length === 0 ? (
                  <AppText size="caption" color="muted" style={{ padding: 12 }}>
                    {treatFilter === 'ALL'
                      ? 'Aucun traitement enregistré pour ce lot.'
                      : `Aucun soin « ${CARE_TYPE_LABEL[treatFilter] ?? treatFilter} » enregistré pour ce lot.`}
                  </AppText>
                ) : (
                  filteredTreatments
                    .filter((t) => treatFilter === 'ALL' || t.careType === treatFilter)
                    .map((t) => <TreatmentCard key={t.id} t={t} />)
                )}
              </Card>
            </>
          ) : null}
          </>
          ); })()}
          </FadeIn>
        </>
      )}
      {wizardOpen && !editingEvent ? (
        <CreateScheduleWizard
          key={`create-${wizardSeq}`}
          visible
          farmId={farmId}
          lots={lots}
          currentLot={lot}
          onClose={closeWizard}
        />
      ) : null}
      {wizardOpen && editingEvent ? (
        <EditScheduleSheet
          key={`edit-${editingEvent.id}`}
          visible
          farmId={farmId}
          event={editingEvent}
          onClose={closeWizard}
        />
      ) : null}
    </Screen>
  );
}

function WizardHeader({ title, step, total }: { title: string; step?: number; total?: number }) {
  return (
    <View style={styles.formTitleRow}>
      <View style={[styles.badge, { backgroundColor: palette.green[50] }]}>
        <Syringe size={16} color={palette.green[600]} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText size="body" weight="bold" color="text">
          {title}
        </AppText>
        {step !== undefined && total !== undefined ? (
          <AppText size="caption" color="muted">
            Étape {step}/{total}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

function protocolDateFor(lot: BatchWithMetrics | undefined, dayFrom: number): string {
  return lot ? addUtcDays(lot.integrationDate, dayFrom) : '';
}

function ProgramPreview({
  program,
  lot,
}: {
  program: SanitaryProtocolWithSteps | undefined;
  lot: BatchWithMetrics | undefined;
}) {
  if (!program) return null;
  const today = todayStr();
  const rows = program.steps.map((s) => {
    const date = protocolDateFor(lot, s.dayFrom);
    const passed = date !== '' && date < today;
    return { s, date, passed };
  });
  return (
    <Card tone="default" style={styles.wizCard}>
      {rows.map(({ s, date, passed }) => (
        <View key={s.id} style={styles.treatRow}>
          <View style={styles.badge}>
            {passed ? <CalendarX size={15} color={palette.amber[600]} /> : <Calendar size={15} color={palette.green[600]} />}
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <AppText size="body" weight="semibold" color="text">
              {s.name}
            </AppText>
            <AppText size="caption" color="muted">
              {s.route ? `${s.route} · ` : ''}
              {s.dosage ?? 'dosage à confirmer'} · J{s.dayFrom}
              {s.dayTo > s.dayFrom ? `–${s.dayTo}` : ''}
            </AppText>
            {date ? (
              <AppText size="caption" color={passed ? 'warn' : 'muted'}>
                {passed ? `Date déjà passée (${fmtFrDate(date)}) → sera sauté` : `${fmtFrDate(date)} · planifié`}
              </AppText>
            ) : null}
          </View>
        </View>
      ))}
      <AppText size="caption" color="faint" style={{ paddingHorizontal: 4, paddingTop: 2 }}>
        Non bloquant : les étapes déjà planifiées ou réalisées pour ces lots seront automatiquement sautées.
      </AppText>
    </Card>
  );
}

function CreateScheduleWizard({
  visible,
  farmId,
  lots,
  currentLot,
  onClose,
}: {
  visible: boolean;
  farmId: string;
  lots: BatchWithMetrics[];
  currentLot: BatchWithMetrics | undefined;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [type, setType] = useState<CareType>('VACCIN');
  const [stockMode, setStockMode] = useState<'stock' | 'externe'>('externe');
  const [medLotId, setMedLotId] = useState('');
  const [medQty, setMedQty] = useState('1');
  const [medUnit, setMedUnit] = useState('dose');
  const [selLots, setSelLots] = useState<string[]>(
    currentLot ? [currentLot.id] : [],
  );
  const [mode, setMode] = useState<'programme' | 'manuel'>('programme');
  const [programId, setProgramId] = useState('');
  const [name, setName] = useState('');
  const [route, setRoute] = useState('');
  const [dosage, setDosage] = useState('');
  const [withdrawal, setWithdrawal] = useState(0);
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(todayStr());
  const [showDate, setShowDate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const inputsQuery = useQuery({
    queryKey: ['inputs', farmId],
    queryFn: () => fetchFarmInputs(farmId),
  });
  const medLots = (inputsQuery.data ?? []).filter(
    (i: InputLot) => i.entryType === 'MEDICAMENT',
  );

  const selLotObjs = lots.filter((l) => selLots.includes(l.id));
  const selSpecies = [...new Set(selLotObjs.map((l) => l.species))];
  const selTypes = [...new Set(selLotObjs.map((l) => l.type))];
  const selSpeciesLabel =
    selSpecies.length === 1
      ? selSpecies[0] === 'AUTRE'
        ? (selLotObjs[0]?.customSpecies ?? speciesLabel(selSpecies[0]))
        : speciesLabel(selSpecies[0])
      : selSpecies.length > 1
        ? `${selSpecies.length} espèces`
        : '';
  const singleSpecies = selSpecies.length === 1 ? selSpecies[0] : null;
  const singleType = selTypes.length === 1 ? selTypes[0] : null;
  const canUsePrograms = singleSpecies !== null && singleType !== null;
  const activeMode: 'programme' | 'manuel' =
    mode === 'programme' && canUsePrograms ? 'programme' : 'manuel';
  const previewLot = selLotObjs[0] ?? currentLot;

  const programsQuery = useQuery({
    queryKey: ['protocols', singleSpecies, singleType],
    queryFn: () => fetchProtocols(singleSpecies ?? undefined, singleType ?? undefined),
    enabled: canUsePrograms,
  });
  const programs = (programsQuery.data ?? []).filter((p) =>
    (p.code ?? '').startsWith('vacc-'),
  );
  const programDetail = useQuery({
    queryKey: ['protocols', programId],
    queryFn: () => fetchSanitaryProgram(programId),
    enabled: programId !== '',
  });

  const toggleLot = (id: string) => {
    setSelLots((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  };

  const fromStock = type === 'MEDICAMENT' && stockMode === 'stock';
  const selectedMed = medLots.find((l) => l.id === medLotId);

  const toggleProgram = (id: string) => setProgramId((cur) => (cur === id ? '' : id));

  const onDateChange = (e: DateTimePickerEvent, value?: Date) => {
    setShowDate(false);
    if (value) setDate(isoFromLocal(value));
  };

  const submit = async () => {
    setErr(null);
    if (selLots.length === 0) {
      setErr('Sélectionnez au moins un lot.');
      return;
    }
    if (activeMode === 'programme') {
      if (!programId) {
        setErr('Sélectionnez le programme pré-chargé.');
        return;
      }
    } else {
      if (name.trim().length < 2) {
        setErr('Donnez un intitulé au soin (ex. Rappel Newcastle).');
        return;
      }
      if (!date) {
        setErr('Choisissez la date du soin.');
        return;
      }
    }
    if (fromStock) {
      if (!medLotId) {
        setErr('Sélectionnez le lot de médicament à sortir du stock.');
        return;
      }
      const qty = Number(medQty);
      if (!Number.isFinite(qty) || qty <= 0 || qty > (selectedMed?.quantity ?? 0)) {
        setErr(
          `Quantité invalide — il reste ${selectedMed?.quantity ?? 0} ${selectedMed?.doseUnit ?? medUnit} de « ${selectedMed?.productName ?? ''} ».`,
        );
        return;
      }
    }

    setBusy(true);
    try {
      if (activeMode === 'programme') {
        const res = await generateVaccineProgram(farmId, programId, selLots);
        for (const lid of selLots) {
          await invalidateFarmQueries(queryClient, { farmId, batchId: lid });
        }
        Alert.alert(
          'Programme appliqué',
          `${res.planned} soin(s) planifié(s)${res.skipped > 0 ? ` · ${res.skipped} étape(s) sautée(s) (dates déjà passées ou déjà réalisées)` : ''}${res.programName ? `\n${res.programName}` : ''}.`,
        );
      } else {
        const payload: CreateManualScheduleInput = {
          lotIds: selLots,
          careType: type,
          name: name.trim(),
          scheduledDate: date,
          ...(route ? { route } : {}),
          ...(dosage.trim() ? { dosage: dosage.trim() } : {}),
          ...(withdrawal > 0 ? { withdrawalDays: withdrawal } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        };
        if (fromStock) {
          payload.decrementStock = true;
          payload.medicationLotId = medLotId;
          payload.medicationQty = Number(medQty);
          payload.medicationUnit = selectedMed?.doseUnit ?? medUnit;
        } else {
          payload.decrementStock = false;
        }
        await createManualSchedule(farmId, payload);
        for (const lid of selLots) {
          await invalidateFarmQueries(queryClient, { farmId, batchId: lid });
        }
        Alert.alert(
          'Soin planifié',
          `${selLots.length} lot(s) concerné(s)${fromStock ? ` · sortie de stock de ${payload.medicationQty} ${payload.medicationUnit ?? ''}` : ''}.`,
        );
      }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur lors de la planification.');
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    if (step === 0) {
      if (selLots.length === 0) {
        setErr('Sélectionnez au moins un lot.');
        return;
      }
      if (fromStock && !medLotId) {
        setErr('Sélectionnez le lot de médicament à sortir du stock.');
        return;
      }
    }
    if (step === 1 && activeMode === 'programme' && !programId) {
      setErr('Sélectionnez le programme pré-chargé à appliquer.');
      return;
    }
    setErr(null);
    setStep((s) => s + 1);
  };

  return (
    <Sheet
      visible={visible}
      title="Planifier un soin"
      subtitle={activeMode === 'programme' ? 'Programme pré-chargé de vaccination' : 'Soin manuel'}
      icon={<Syringe size={18} color={palette.green[600]} />}
      onClose={onClose}>
      {step === 0 ? (
        <>
          <WizardHeader title="Type de soin & lots" step={1} total={3} />
          <FormLabel text="TYPE DE SOIN *" tone="green" />
          <View style={styles.rowWrap}>
            {(['VACCIN', 'MEDICAMENT'] as CareType[]).map((k) => (
              <Pressable key={k} onPress={() => setType(k)} accessibilityRole="button">
                <Chip label={CARE_TYPE_LABEL[k]} tone={type === k ? 'brand' : 'neutral'} selected={type === k} style={styles.chip} />
              </Pressable>
            ))}
          </View>
          {type === 'MEDICAMENT' ? (
            <>
              <FormLabel text="PROVENANCE" tone="green" />
              <View style={styles.rowWrap}>
                <Pressable onPress={() => setStockMode('stock')} accessibilityRole="button">
                  <Chip label="Sortir du stock" tone={stockMode === 'stock' ? 'accent' : 'neutral'} selected={stockMode === 'stock'} style={styles.chip} />
                </Pressable>
                <Pressable onPress={() => setStockMode('externe')} accessibilityRole="button">
                  <Chip label="Externe au stock" tone={stockMode === 'externe' ? 'green' : 'neutral'} selected={stockMode === 'externe'} style={styles.chip} />
                </Pressable>
              </View>
              {fromStock ? (
                <>
                  <FormLabel text="LOT DE MÉDICAMENT *" tone="green" />
                  {inputsQuery.isLoading ? (
                    <Spinner label="Lecture du stock…" />
                  ) : medLots.length === 0 ? (
                    <AppText size="caption" color="warn">
                      Aucun médicament en stock. Enregistrez un intrant « Médicament » (écran Stock) ou choisissez « Externe au stock ».
                    </AppText>
                  ) : (
                    <View style={styles.rowWrap}>
                      {medLots.map((l) => (
                        <Pressable key={l.id} onPress={() => { setMedLotId(l.id); if (l.doseUnit) setMedUnit(l.doseUnit); }} accessibilityRole="button">
                          <Chip
                            label={`${l.productName} (${l.quantity} ${l.doseUnit ?? ''})`}
                            tone={medLotId === l.id ? 'accent' : 'neutral'}
                            selected={medLotId === l.id}
                            style={styles.chip}
                          />
                        </Pressable>
                      ))}
                    </View>
                  )}
                  {selectedMed ? (
                    <>
                      <FormLabel text="QUANTITÉ (DOSES) *" tone="green" />
                      <NumberInput
                        value={medQty}
                        onChangeText={(t) => setMedQty(t)}
                        suffix={medUnit}
                        placeholder="1"
                        editable={!busy}
                      />
                    </>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
          <FormLabel text="LOTS CONCERNÉS *" tone="green" />
          {lots.length === 0 ? (
            <AppText size="caption" color="warn">Aucun lot actif dans cette ferme.</AppText>
          ) : (
            <>
              <View style={{ gap: 8 }}>
                {lots.map((b) => {
                  const selected = selLots.includes(b.id);
                  const speciesName = b.customSpecies ?? speciesLabel(b.species);
                  return (
                    <Pressable
                      key={b.id}
                      onPress={() => toggleLot(b.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={({ pressed }) => [
                        styles.wizLotCard,
                        selected && { borderColor: palette.green[500], backgroundColor: palette.green[50] },
                        pressed && { opacity: 0.8 },
                      ]}
                    >
                      {breedImageForLot(b.breedName, b.species) ? (
                        <Image source={breedImageForLot(b.breedName, b.species)!} style={styles.wizLotImg} resizeMode="cover" />
                      ) : (
                        <View style={[styles.wizLotImg, styles.wizLotImgFallback]}>
                          <AppText size="small" weight="bold" color={b.type === 'CHAIR' ? palette.brand[700] : palette.green[700]} numberOfLines={1}>
                            {speciesName.slice(0, 3).toUpperCase()}
                          </AppText>
                        </View>
                      )}
                      <View style={{ flex: 1, gap: 4 }}>
                        <AppText size="body" weight="bold" color="text" numberOfLines={1}>{b.batchName ?? b.id}</AppText>
                        <View style={styles.rowWrap}>
                          <Chip label={b.type === 'CHAIR' ? 'Chair' : 'Pondeuse'} tone="neutral" style={styles.chip} />
                          <Chip label={b.breedName ?? speciesName} tone="accent" style={styles.chip} />
                        </View>
                      </View>
                      {selected ? (
                        <CheckCircle2 size={20} color={palette.green[500]} />
                      ) : (
                        <Circle size={20} color={palette.ink[200]} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
              {selLots.length > 0 && selSpeciesLabel ? (
                <AppText size="caption" color={selSpecies.length > 1 ? 'warn' : 'muted'} style={{ marginTop: 6 }}>
                  {selSpecies.length > 1
                    ? 'Plusieurs espèces sélectionnées — les programmes pré-chargés sont spécifiques à l’espèce.'
                    : `Espèce : ${selSpeciesLabel}${selTypes.length === 1 ? ` · ${selTypes[0] === 'CHAIR' ? 'Chair' : 'Pondeuse'}` : ''}`}
                </AppText>
              ) : null}
            </>
          )}
        </>
      ) : null}

      {step === 1 ? (
        <>
          <WizardHeader title="Programme ou soin manuel ?" step={2} total={3} />
          <View style={styles.rowWrap}>
            <Pressable
              onPress={() => { if (canUsePrograms) setMode('programme'); }}
              disabled={!canUsePrograms}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canUsePrograms, selected: activeMode === 'programme' }}>
              <Chip label="Programme pré-chargé" tone={activeMode === 'programme' ? 'brand' : 'neutral'} selected={activeMode === 'programme'} style={styles.chip} />
            </Pressable>
            <Pressable onPress={() => setMode('manuel')} accessibilityRole="button">
              <Chip label="Manuel" tone={activeMode === 'manuel' ? 'green' : 'neutral'} selected={activeMode === 'manuel'} style={styles.chip} />
            </Pressable>
          </View>
          {activeMode === 'programme' ? (
            <Card tone="brand" style={[{ marginTop: 10 }]}>
              <View style={styles.head}>
                <Info size={15} color={palette.brand[600]} />
                <AppText size="label" weight="bold" color="brand" style={{ flex: 1 }}>
                  C&apos;est quoi un programme pré-chargé ?
                </AppText>
              </View>
              <AppText size="caption" color="muted">
                C&apos;est une orientation vaccinale : il planifie automatiquement les rappels conseillés selon l&apos;espèce. Aucune obligation — vous pouvez aussi créer votre propre soin manuel.
              </AppText>
            </Card>
          ) : null}
          {selSpecies.length > 1 ? (
            <Card tone="warn" style={[styles.wizBanner, { marginTop: 10 }]}>
              <View style={styles.head}>
                <Info size={15} color={palette.amber[700]} />
                <AppText size="label" weight="bold" color="warn" style={{ flex: 1 }}>
                  Espèces mélangées
                </AppText>
              </View>
              <AppText size="caption" color="muted">
                Les lots sélectionnés sont de plusieurs espèces. Les programmes pré-chargés étant spécifiques à l’espèce, utilisez le soin manuel ou ne retenez que des lots de la même espèce.
              </AppText>
            </Card>
          ) : null}
          {activeMode === 'programme' ? (
            <>
              <FormLabel text="PROGRAMME (VACCINATION GABON) *" tone="green" />
              {programsQuery.isLoading ? (
                <Spinner label="Lecture des programmes…" />
              ) : programs.length === 0 ? (
                <AppText size="caption" color="warn">
                  Aucun programme pré-chargé pour {selSpeciesLabel ? `l’${selSpeciesLabel}` : 'ce type de volaille'}.
                </AppText>
              ) : (
                <View style={styles.rowWrap}>
                  {programs.map((p) => (
                    <Pressable key={p.id} onPress={() => toggleProgram(p.id)} accessibilityRole="button">
                      <Chip
                        label={p.name}
                        tone={programId === p.id ? 'brand' : 'neutral'}
                        selected={programId === p.id}
                        style={styles.chip}
                      />
                    </Pressable>
                  ))}
                </View>
              )}
              {programDetail.data ? (
                <>
                  <FormLabel text="APERÇU DES ÉTAPES" tone="green" />
                  <ProgramPreview program={programDetail.data} lot={previewLot} />
                </>
              ) : null}
              <Card tone="warn" style={styles.wizBanner}>
                <View style={styles.head}>
                  <Info size={15} color={palette.amber[700]} />
                  <AppText size="label" weight="bold" color="warn" style={{ flex: 1 }}>
                    Directives de réussite — climat chaud
                  </AppText>
                </View>
                {GABON_DIRECTIVES.map((d, i) => (
                  <AppText key={d} size="caption" color="muted">
                    {i + 1}. {d}
                  </AppText>
                ))}
              </Card>
            </>
          ) : (
            <>
              <FormLabel text="INTITULÉ (VACCIN / MÉDICAMENT) *" tone="green" />
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="ex. Rappel Newcastle ND + BI"
                placeholderTextColor={color.ink[300]}
                style={styles.input}
                editable={!busy}
              />
              <FormLabel text="DATE *" tone="green" />
              <Pressable onPress={() => setShowDate(true)} style={styles.selectBtn} accessibilityRole="button">
                <Calendar size={15} color={palette.green[600]} />
                <AppText size="body" weight="semibold" color="text" style={{ flex: 1 }}>
                  {fmtFrDate(date || todayStr())}
                </AppText>
                <ChevronDown size={16} color={palette.green[600]} />
              </Pressable>
              {showDate ? (
                <DateTimePicker
                  value={parseIsoLocal(date || todayStr())}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onDateChange}
                  minimumDate={new Date()}
                  locale="fr-FR"
                />
              ) : null}
              <FormLabel text="VOIE D’ADMINISTRATION" tone="green" />
              <View style={styles.rowWrap}>
                {ROUTE_OPTIONS.map((r) => (
                  <Pressable key={r} onPress={() => setRoute((cur) => (cur === r ? '' : r))} accessibilityRole="button">
                    <Chip label={r} tone={route === r ? 'green' : 'neutral'} selected={route === r} style={styles.chip} />
                  </Pressable>
                ))}
              </View>
              <FormLabel text="DOSAGE / POSOLOGIE (OPTIONNEL)" tone="green" />
              <TextInput
                value={dosage}
                onChangeText={setDosage}
                placeholder="ex. 1 dose/sujet, 100 g / 100 L"
                placeholderTextColor={color.ink[300]}
                style={styles.input}
                editable={!busy}
              />
              <FormLabel text="DÉLAI D’ATTENTE AVANT VENTE (JOURS)" tone="green" />
              <NumberInput
                value={withdrawal > 0 ? String(withdrawal) : ''}
                onChangeText={(t) => setWithdrawal(Math.min(parseInt(t, 10) || 0, 30))}
                suffix="j"
                placeholder="0"
                editable={!busy}
              />
              <FormLabel text="NOTES (OPTIONNEL)" tone="green" />
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Souche, remarques terrain…"
                placeholderTextColor={color.ink[300]}
                style={styles.input}
                editable={!busy}
                multiline
              />
            </>
          )}
        </>
      ) : null}

      {step === 2 ? (
        <>
          <WizardHeader title="Vérifiez avant de planifier" step={3} total={3} />
          <Card tone="default" style={styles.wizCard}>
            <View style={styles.treatRow}>
              <View style={styles.badge}>
                <AppText size="caption" weight="bold" color="brand">{type === 'VACCIN' ? 'VC' : 'MED'}</AppText>
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <AppText size="body" weight="semibold" color="text">
                  {activeMode === 'programme'
                    ? programDetail.data?.name ?? 'Programme'
                    : name.trim() || 'Soin manuel'}
                </AppText>
                <AppText size="caption" color="muted">
                  {CARE_TYPE_LABEL[type]}
                  {activeMode === 'manuel' ? ` · le ${fmtFrDate(date || todayStr())}` : ''}
                  {fromStock ? ` · sortie de stock ${Number(medQty) || 0} ${medUnit}` : ' · externe au stock'}
                  {route ? ` · ${route}` : ''}
                  {dosage.trim() ? ` · ${dosage.trim()}` : ''}
                  {withdrawal > 0 ? ` · délai d’attente ${withdrawal} j` : ''}
                  {selSpeciesLabel && selSpecies.length === 1 ? ` · ${selSpeciesLabel}${selTypes.length === 1 ? ` ${selTypes[0] === 'CHAIR' ? 'Chair' : 'Pondeuse'}` : ''}` : ''}
                </AppText>
              </View>
            </View>
            <View style={styles.treatRow}>
              <View style={styles.badge}>
                <Calendar size={15} color={palette.green[600]} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText size="label" weight="bold" color="text">Lots concernés ({selLots.length})</AppText>
                {selLots.map((id) => (
                  <AppText key={id} size="caption" color="muted">
                    • {lots.find((b) => b.id === id)?.batchName ?? id}
                    {lots.find((b) => b.id === id)
                      ? ` — ${lots.find((b) => b.id === id)!.species === 'AUTRE'
                          ? (lots.find((b) => b.id === id)!.customSpecies ?? speciesLabel(lots.find((b) => b.id === id)!.species))
                          : speciesLabel(lots.find((b) => b.id === id)!.species)}`
                      : ''}
                  </AppText>
                ))}
              </View>
            </View>
            {activeMode === 'programme' ? (
              <AppText size="caption" color="faint" style={{ paddingHorizontal: 4 }}>
                Les étapes aux dates déjà passées ou déjà réalisées seront automatiquement sautées (non bloquant).
              </AppText>
            ) : null}
          </Card>
          {activeMode === 'programme' && programDetail.data ? (
            <>
              <FormLabel text="ÉTAPES DU PROGRAMME" tone="green" />
              <ProgramPreview program={programDetail.data} lot={previewLot} />
            </>
          ) : null}
        </>
      ) : null}

      {err ? (
        <AppText size="caption" color="danger" style={{ marginTop: 8 }}>
          {err}
        </AppText>
      ) : null}

      <View style={styles.actions}>
        <Button
          label={step === 0 ? 'Annuler' : 'Précédent'}
          tone="ghost"
          icon={ChevronUp}
          block={false}
          style={styles.actionsPrev}
          onPress={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
          disabled={busy}
        />
        {step < 2 ? (
          <Button
            label="Suivant"
            tone="brand"
            icon={ChevronDown}
            block={false}
            style={styles.actionsNext}
            onPress={next}
            disabled={busy}
          />
        ) : (
          <Button
            label={activeMode === 'programme' ? 'Appliquer le programme' : 'Planifier le soin'}
            tone="success"
            icon={Check}
            block={false}
            style={styles.actionsNext}
            onPress={() => void submit()}
            disabled={busy}
            loading={busy}
          />
        )}
      </View>
    </Sheet>
  );
}

function EditScheduleSheet({
  visible,
  farmId,
  event,
  onClose,
}: {
  visible: boolean;
  farmId: string;
  event: ProphylaxisEvent;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<CareType>(event.careType);
  const [name, setName] = useState(event.name);
  const [route, setRoute] = useState<string>(event.route ?? '');
  const [dosage, setDosage] = useState<string>(event.dosage ?? '');
  const [withdrawal, setWithdrawal] = useState<number>(event.withdrawalDays ?? 0);
  const [notes, setNotes] = useState<string>(event.notes ?? '');
  const [date, setDate] = useState(event.scheduledDate);
  const [showDate, setShowDate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onDateChange = (e: DateTimePickerEvent, value?: Date) => {
    setShowDate(false);
    if (value) setDate(isoFromLocal(value));
  };

  const save = async () => {
    setErr(null);
    if (name.trim().length < 2) {
      setErr('Donnez un intitulé au soin.');
      return;
    }
    setBusy(true);
    try {
      await updateSchedule(farmId, event.batchId, event.id, {
        careType: type,
        name: name.trim(),
        ...(route ? { route } : {}),
        ...(dosage.trim() ? { dosage: dosage.trim() } : {}),
        ...(withdrawal > 0 ? { withdrawalDays: withdrawal } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        scheduledDate: date,
      });
      await invalidateFarmQueries(queryClient, { farmId, batchId: event.batchId });
      Alert.alert('Soin mis à jour', 'La nouvelle date reprogramme l’échéance si nécessaire.');
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Édition impossible (soin réalisé ?).');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title="Éditer le soin"
      subtitle={CARE_TYPE_LABEL[event.careType] ?? event.careType}
      icon={<Pencil size={18} color={color.brand[600]} />}
      onClose={onClose}>
      <WizardHeader title="Soin planifié" />
      <FormLabel text="TYPE DE SOIN" />
      <View style={styles.rowWrap}>
        {(['VACCIN', 'MEDICAMENT'] as CareType[]).map((k) => (
          <Pressable key={k} onPress={() => setType(k)} accessibilityRole="button">
            <Chip label={CARE_TYPE_LABEL[k]} tone={type === k ? 'brand' : 'neutral'} selected={type === k} style={styles.chip} />
          </Pressable>
        ))}
      </View>
      <FormLabel text="INTITULÉ *" tone="green" />
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="ex. Rappel Newcastle ND + BI"
        placeholderTextColor={color.ink[300]}
        style={styles.input}
        editable={!busy}
      />
      <FormLabel text="DATE *" tone="green" />
      <Pressable onPress={() => setShowDate(true)} style={styles.selectBtn} accessibilityRole="button">
        <Calendar size={15} color={palette.green[600]} />
        <AppText size="body" weight="semibold" color="text" style={{ flex: 1 }}>
          {fmtFrDate(date || todayStr())}
        </AppText>
        <ChevronDown size={16} color={palette.green[600]} />
      </Pressable>
      {showDate ? (
        <DateTimePicker
          value={parseIsoLocal(date || todayStr())}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onDateChange}
          minimumDate={new Date()}
          locale="fr-FR"
        />
      ) : null}
      <FormLabel text="VOIE D'ADMINISTRATION" tone="green" />
      <View style={styles.rowWrap}>
        {ROUTE_OPTIONS.map((r) => (
          <Pressable key={r} onPress={() => setRoute((cur) => (cur === r ? '' : r))} accessibilityRole="button">
            <Chip label={r} tone={route === r ? 'green' : 'neutral'} selected={route === r} style={styles.chip} />
          </Pressable>
        ))}
      </View>
      <FormLabel text="DOSAGE / POSOLOGIE (OPTIONNEL)" tone="green" />
      <TextInput
        value={dosage}
        onChangeText={setDosage}
        placeholder="ex. 1 dose/sujet, 100 g / 100 L"
        placeholderTextColor={color.ink[300]}
        style={styles.input}
        editable={!busy}
      />
      <FormLabel text="DÉLAI D’ATTENTE AVANT VENTE (JOURS)" tone="green" />
      <NumberInput
        value={withdrawal > 0 ? String(withdrawal) : ''}
        onChangeText={(t) => setWithdrawal(Math.min(parseInt(t, 10) || 0, 30))}
        suffix="j"
        placeholder="0"
        editable={!busy}
      />
      <FormLabel text="NOTES (OPTIONNEL)" tone="green" />
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Souche, remarques terrain…"
        placeholderTextColor={color.ink[300]}
        style={styles.input}
        editable={!busy}
        multiline
      />
      {err ? (
        <AppText size="caption" color="danger" style={{ marginTop: 8 }}>
          {err}
        </AppText>
      ) : null}
      <View style={styles.actions}>
        <Button label="Annuler" tone="ghost" onPress={onClose} disabled={busy} />
        <Button label="Enregistrer" tone="success" icon={Check} onPress={() => void save()} disabled={busy} loading={busy} />
      </View>
    </Sheet>
  );
}

function CareStatusCard({ events, integrationDate }: { events: ProphylaxisEvent[] | undefined; integrationDate: string }) {
  const s = careStatus(events, integrationDate);
  const total = (events ?? []).filter((p) => p.status !== 'ANNULE').length;
  const fg = s.lateCount > 0 ? palette.red[500] : s.pendingCount > 0 ? palette.amber[600] : palette.green[600];
  const bg = s.lateCount > 0 ? palette.red[50] : s.pendingCount > 0 ? palette.amber[50] : palette.green[50];

  return (
    <Card tone="default" style={styles.tipsCard}>
      <View style={styles.head}>
        <View style={[styles.badge, { backgroundColor: bg }]}>
          <Syringe size={16} color={fg} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText size="body" weight="semibold" color="text">Vaccins & médicaments</AppText>
          <AppText size="caption" color="muted">Prophylaxie du lot · reflétée dans le Score santé</AppText>
        </View>
        {s.lateCount > 0 ? (
          <View style={[styles.carePill, { backgroundColor: palette.red[50], borderColor: palette.red[200] }]}>
            <AppText size="label" weight="bold" color="danger">{s.lateCount} en retard</AppText>
          </View>
        ) : (
          <View style={[styles.carePill, { backgroundColor: palette.green[50], borderColor: palette.green[200] }]}>
            <ShieldCheck size={12} color={palette.green[600]} />
            <AppText size="label" weight="bold" color="success">À jour</AppText>
          </View>
        )}
      </View>

      {total === 0 ? (
        <AppText size="small" color="muted" style={{ marginTop: 10 }}>
          Aucun soin planifié pour ce lot. Utilisez « Planifier un soin » pour appliquer un programme pré-chargé ou créer un soin manuel.
        </AppText>
      ) : (
        <>
          <AppText size="small" weight="semibold" color="text" style={{ marginTop: 10 }}>
            {s.next
              ? `Prochain : ${CARE_TYPE_LABEL[s.next.careType] ?? 'Soin'} ${s.next.name}${s.nextAtDay != null ? ` · J${s.nextAtDay}` : ''} · ${fmtFrDate(s.next.scheduledDate)}`
              : 'Programme terminé — toutes les étapes sont réalisées.'}
          </AppText>
          <AppText size="caption" color="muted" style={{ marginTop: 2 }}>
            {s.doneCount}/{total} soin(s) réalisé(s){s.pendingCount > 0 ? ` · ${s.pendingCount} à venir` : ''}
          </AppText>
          <View style={styles.careTrack}>
            <View
              style={[
                styles.careFill,
                { width: `${total > 0 ? Math.round((s.doneCount / total) * 100) : 0}%`, backgroundColor: fg },
              ]}
            />
          </View>
        </>
      )}
    </Card>
  );
}

function SanteTab({ health, loading, lotName, prophylaxis, integrationDate }: { health: BatchHealth | undefined; loading: boolean; lotName: string; prophylaxis: ProphylaxisEvent[] | undefined; integrationDate: string }) {
  if (loading) return <Spinner label="Calcul des indicateurs santé…" />;

  const empty = !health;
  const score = health?.healthScore ?? 0;
  const trends = health?.trends ?? { dates: [], mortality: [], eggs: [] };
  const mortStatus = normalizeMortalityStatus(
    health?.mortalityStatus,
    health?.mortalityPercent,
  );

  return (
    <>
      <SectionHeader title="Santé & métriques" subtitle={lotName} />
      <Card tone="default" style={styles.scoreCard}>
        <View style={styles.scoreRow}>
          <View style={styles.scoreLeft}>
            <View style={styles.badge}>
              <HeartPulse size={18} color={empty ? color.ink[300] : scoreHex(score)} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText size="body" weight="semibold" color="text">
                Score santé
              </AppText>
              <AppText size="caption" color="muted">
                {empty ? 'Aucune donnée' : `${health.ageDays}j · ${health.liveCount} vivants`}
              </AppText>
            </View>
            <AppText size="h3" weight="bold" color={empty ? 'muted' : scoreToken(score)}>
              {empty ? '—' : `${score}`}
            </AppText>
            <AppText size="small" color="muted">/100</AppText>
          </View>
          <View style={styles.scoreDivider} />
          <View style={styles.viabilityBadge}>
            <HeartPulse size={14} color={palette.green[600]} />
            <AppText size="small" weight="semibold" color="muted" align="center">
              Viabilité
            </AppText>
            <AppText size="bodyM" weight="bold" color="green" align="center">
              {empty ? '—' : `${Math.round(health!.viabilityPercent)}%`}
            </AppText>
          </View>
        </View>
      </Card>

      <View style={styles.metricRow}>
        <Card tone="default" style={styles.fcrCard}>
          <AppText size="small" weight="semibold" color="muted" align="center">FCR (IC)</AppText>
          <FCRGauge value={health?.fcr ?? null} size={110} />
        </Card>
        <MetricTile label="Consommation" value={`${Math.round(health?.feedPerBirdGrams ?? 0)} g`} sub="par oiseau / jour" tone="brand" icon={Wheat} />
      </View>
      <View style={styles.metricRow}>
        <MetricTile label="Plateaux" value={String(health?.trays ?? 0)} sub={`${health?.eggsCollectedTotal ?? 0} œufs`} tone="accent" icon={Egg} threeCol />
        <MetricTile label="Taux ponte" value={health?.layRatePercent != null ? `${health.layRatePercent.toFixed(1)}%` : '—'} sub="sur 7 j" tone="accent" icon={TrendingUp} threeCol />
        <MetricTile label="Mortalité" value={`${(health?.mortalityPercent ?? 0).toFixed(1)}%`} tone={mortStatus === 'normal' ? 'green' : mortStatus === 'elevated' ? 'amber' : 'red'} icon={TrendingDown} threeCol />
      </View>

      <SectionHeader title="Conseils du jour" />
      <Card tone="default" style={styles.tipsCard}>
        {empty ? (
          <AppText size="small" color="muted">Saisissez des données pour recevoir des conseils.</AppText>
        ) : (
          health!.tips.map((t, i) =>
            t.level === 'VERT' ? (
              <AppText key={i} size="small" color="muted">• {t.text}</AppText>
            ) : t.level === 'JAUNE' ? (
              <AppText key={i} size="small" color="warn">• {t.text}</AppText>
            ) : (
              <AppText key={i} size="small" color="danger">• {t.text}</AppText>
            ),
          )
        )}
      </Card>

      <SectionHeader title="Vaccins & médicaments" />
      <CareStatusCard events={prophylaxis} integrationDate={integrationDate} />

      <SectionHeader title="Mortalité · 7 jours" />
      <Card tone="default" style={styles.chartCard}>
        <LineChart
          points={trends.dates.map((d, i) => ({ x: d.slice(5), y: trends.mortality[i] }))}
          stroke={color.red[500]}
          unit="oiseaux morts / jour"
        />
      </Card>

      <SectionHeader title="Ramassage d’œufs · 7 jours" />
      <Card tone="default" style={styles.chartCard}>
        <LineChart
          points={trends.dates.map((d, i) => ({ x: d.slice(5), y: trends.eggs[i] }))}
          stroke={color.accent[500]}
          unit="œufs / jour"
        />
      </Card>
    </>
  );
}

function CheckTab({ health, loading, lotName }: { health: BatchHealth | undefined; loading: boolean; lotName: string }) {
  if (loading) return <Spinner label="Analyse du lot…" />;
  const empty = !health;

  return (
    <>
      <SectionHeader title="Check par lot" subtitle={lotName} />
      <Card tone="default" style={styles.tipsCard}>
        <AppText size="body" weight="semibold" color="text" style={{ marginBottom: 6 }}>
          Analyse
        </AppText>
        {empty ? (
          <AppText size="small" color="muted">Saisissez des données pour générer l&apos;analyse.</AppText>
        ) : (
          health!.check.insights.map((s, i) => (
            <AppText key={i} size="small" color="muted">• {s}</AppText>
          ))
        )}
      </Card>
      <Card tone="default" style={styles.tipsCard}>
        <AppText size="body" weight="semibold" color="text" style={{ marginBottom: 6 }}>
          Recommandations
        </AppText>
        {empty ? (
          <AppText size="small" color="muted">Les recommandations apparaîtront après la première saisie.</AppText>
        ) : (
          health!.check.advice.map((s, i) => (
            <AppText key={i} size="small" color="brand">• {s}</AppText>
          ))
        )}
      </Card>
      <Card tone="default" style={styles.tipsCard}>
        <AppText size="body" weight="semibold" color="text" style={{ marginBottom: 6 }}>
          Conduite à suivre
        </AppText>
        {empty ? (
          <AppText size="small" color="muted">Aucun conseil pour le moment.</AppText>
        ) : (
          health!.tips.map((t, i) => (
            <AppText key={i} size="small" color={t.level === 'ROUGE' ? 'danger' : t.level === 'JAUNE' ? 'warn' : 'muted'}>
              • {t.text}
            </AppText>
          ))
        )}
      </Card>
    </>
  );
}

function MaladiesTab({
  events,
  loading,
  lotName,
  isProprietaire,
  busy,
  lots,
  defaultLotId,
  formOpen,
  setFormOpen,
  kind,
  setKind,
  eventLotId,
  setEventLotId,
  occurredAt,
  setOccurredAt,
  showEventDate,
  setShowEventDate,
  quantity,
  setQuantity,
  disease,
  setDisease,
  customDisease,
  setCustomDisease,
  showDiseasePicker,
  setShowDiseasePicker,
  diseaseSeverity,
  setDiseaseSeverity,
  symptomSel,
  setSymptomSel,
  treatment,
  setTreatment,
  vetConsulted,
  setVetConsulted,
  vetName,
  setVetName,
  resolvedNow,
  setResolvedNow,
  mortalityCause,
  setMortalityCause,
  cullReason,
  setCullReason,
  eventNotes,
  setEventNotes,
  eventFilter,
  setEventFilter,
  onSave,
  onResolve,
  onDelete,
}: {
  events: HealthEvent[];
  loading: boolean;
  lotName: string;
  isProprietaire: boolean;
  busy: string | null;
  lots: { id: string; batchName: string | null }[];
  defaultLotId: string;
  formOpen: boolean;
  setFormOpen: (b: boolean) => void;
  kind: EventKindChoice;
  setKind: (k: EventKindChoice) => void;
  eventLotId: string;
  setEventLotId: (s: string) => void;
  occurredAt: string;
  setOccurredAt: (s: string) => void;
  showEventDate: boolean;
  setShowEventDate: (b: boolean) => void;
  quantity: string;
  setQuantity: (s: string) => void;
  disease: string;
  setDisease: (s: string) => void;
  customDisease: string;
  setCustomDisease: (s: string) => void;
  showDiseasePicker: boolean;
  setShowDiseasePicker: (b: boolean) => void;
  diseaseSeverity: DiseaseSeverity;
  setDiseaseSeverity: (s: DiseaseSeverity) => void;
  symptomSel: string[];
  setSymptomSel: (s: string[]) => void;
  treatment: string;
  setTreatment: (s: string) => void;
  vetConsulted: boolean;
  setVetConsulted: (b: boolean) => void;
  vetName: string;
  setVetName: (s: string) => void;
  resolvedNow: boolean;
  setResolvedNow: (b: boolean) => void;
  mortalityCause: string;
  setMortalityCause: (s: string) => void;
  cullReason: string;
  setCullReason: (s: string) => void;
  eventNotes: string;
  setEventNotes: (s: string) => void;
  eventFilter: EventFilterKey;
  setEventFilter: (f: EventFilterKey) => void;
  onSave: () => void;
  onResolve: (e: HealthEvent) => void;
  onDelete: (e: HealthEvent) => void;
}) {
  const formLotId = eventLotId || defaultLotId;
  const filtered = eventFilter === 'ALL' ? events : events.filter((e) => e.kind === eventFilter);
  const onEventDateChange = (_e: DateTimePickerEvent, date?: Date) => {
    setShowEventDate(false);
    if (date) setOccurredAt(isoFromLocal(date));
  };

  const rotateAnim = useRef(new Animated.Value(0)).current;

  const toggleForm = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (!eventLotId) setEventLotId(defaultLotId);
    const next = !formOpen;
    setFormOpen(next);
    Animated.spring(rotateAnim, {
      toValue: next ? 1 : 0,
      friction: 5,
      tension: 60,
      useNativeDriver: true,
    }).start();
  };

  const iconRotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  return (
    <>
      <SectionHeader title="Événements sanitaires" subtitle={lotName} />
      <View style={styles.addBtn}>
        <Pressable
          onPress={toggleForm}
          style={({ pressed }) => [
            styles.addBtnInner,
            formOpen ? styles.addBtnInnerOpen : styles.addBtnInnerClosed,
            pressed && styles.addBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityState={{ expanded: formOpen }}>
          <Animated.View style={{ transform: [{ rotate: iconRotation }] }}>
            <Plus size={20} color={formOpen ? palette.red[600] : palette.surface} strokeWidth={2.4} />
          </Animated.View>
          <AppText size="body" weight="bold" color={formOpen ? 'danger' : 'card'} style={{ flex: 1 }}>
            {formOpen ? 'Fermer' : 'Ajouter un événement'}
          </AppText>
        </Pressable>
      </View>

      {formOpen ? (
        <Card tone="default" style={styles.formCard}>
          <View style={styles.formTitleRow}>
            <View style={[styles.badge, { backgroundColor: palette.red[50] }]}>
              <ClipboardPlus size={18} color={palette.red[600]} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText size="h3" weight="bold" color="text">
                Nouvel événement
              </AppText>
              <AppText size="caption" weight="semibold" color="muted">
                Renseignez le lot et le type d’événement sanitaire
              </AppText>
            </View>
          </View>

          <FormLabel text="TYPE D’ÉVÉNEMENT *" />
          <Segmented options={EVENT_OPTIONS} value={kind} onChange={setKind} haptic />

          <FormLabel text="LOT *" />
          <View style={styles.rowWrap}>
            {lots.map((b) => {
              const active = formLotId === b.id;
              return (
                <Pressable key={b.id} onPress={() => setEventLotId(b.id)} accessibilityRole="button">
                  <Chip label={b.batchName ?? 'Lot sans nom'} tone={active ? 'red' : 'outline'} style={styles.chip} />
                </Pressable>
              );
            })}
          </View>

          <FormLabel text="DATE *" />
          <Pressable onPress={() => setShowEventDate(true)} style={styles.selectBtn} accessibilityRole="button">
            <Calendar size={15} color={palette.red[500]} />
            <AppText size="body" weight="semibold" color="text" style={{ flex: 1 }}>
              {fmtFrDate(occurredAt || todayStr())}
            </AppText>
            <ChevronDown size={16} color={palette.red[500]} />
          </Pressable>
          {showEventDate ? (
            <DateTimePicker
              value={parseIsoLocal(occurredAt || todayStr())}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onEventDateChange}
              maximumDate={new Date()}
              locale="fr-FR"
            />
          ) : null}

          {kind === 'MALADIE' ? (
            <DiseaseFields
              disease={disease}
              setDisease={setDisease}
              customDisease={customDisease}
              setCustomDisease={setCustomDisease}
              showDiseasePicker={showDiseasePicker}
              setShowDiseasePicker={setShowDiseasePicker}
              diseaseSeverity={diseaseSeverity}
              setDiseaseSeverity={setDiseaseSeverity}
              symptomSel={symptomSel}
              setSymptomSel={setSymptomSel}
              treatment={treatment}
              setTreatment={setTreatment}
              vetConsulted={vetConsulted}
              setVetConsulted={setVetConsulted}
              vetName={vetName}
              setVetName={setVetName}
              resolvedNow={resolvedNow}
              setResolvedNow={setResolvedNow}
            />
          ) : null}

          {kind === 'MORTALITE' ? (
            <>
              <FormLabel text="NOMBRE D’OISEAUX MORTS *" />
              <TextInput
                value={quantity}
                onChangeText={setQuantity}
                placeholder="ex. 5"
                placeholderTextColor={color.ink[300]}
                style={styles.input}
                editable={busy === null}
                keyboardType="number-pad"
              />
              <FormLabel text="CAUSE (OPTIONNEL)" />
              <View style={styles.rowWrap}>
                {MORTALITY_CAUSES.map((c) => (
                  <Pressable key={c.key} onPress={() => setMortalityCause(c.key)} accessibilityRole="button">
                    <Chip label={c.label} tone={mortalityCause === c.key ? 'red' : 'outline'} style={styles.chip} />
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {kind === 'REFORME' ? (
            <>
              <FormLabel text="NOMBRE D’OISEAUX ABATTUS *" />
              <TextInput
                value={quantity}
                onChangeText={setQuantity}
                placeholder="ex. 10"
                placeholderTextColor={color.ink[300]}
                style={styles.input}
                editable={busy === null}
                keyboardType="number-pad"
              />
              <FormLabel text="RAISON (OPTIONNEL)" />
              <TextInput
                value={cullReason}
                onChangeText={setCullReason}
                placeholder="Motif de l’abattage (ex. oiseaux affaiblis)"
                placeholderTextColor={color.ink[300]}
                style={styles.input}
                editable={busy === null}
              />
            </>
          ) : null}

          <FormLabel text="NOTES (OPTIONNEL)" />
          <TextInput
            value={eventNotes}
            onChangeText={setEventNotes}
            placeholder="Notes / observations supplémentaires"
            placeholderTextColor={color.ink[300]}
            style={styles.input}
            editable={busy === null}
          />

          <Button
            label="Enregistrer l’événement"
            tone="danger"
            icon={ClipboardPlus}
            onPress={onSave}
            disabled={busy !== null}
            loading={busy === 'event'}
          />
          <AppText size="caption" color="faint" style={{ textAlign: 'center' }}>
            Posté sur le serveur.
          </AppText>
        </Card>
      ) : null}

      <Sheet visible={showDiseasePicker} title="Maladie" subtitle="Choisir la maladie" onClose={() => setShowDiseasePicker(false)}>
        <View style={{ gap: 2, paddingVertical: 8 }}>
          {DISEASES.map((d) => (
            <Pressable
              key={d}
              onPress={() => {
                setDisease(d);
                setShowDiseasePicker(false);
              }}
              style={styles.sheetRow}
              accessibilityRole="button">
              <AppText size="body" color="text">
                {d}
              </AppText>
            </Pressable>
          ))}
          <Pressable
            onPress={() => {
              setDisease(CUSTOM_DISEASE);
              setShowDiseasePicker(false);
            }}
            style={styles.sheetRow}
            accessibilityRole="button">
            <AppText size="body" weight="semibold" color="brand">
              Maladie personnalisée…
            </AppText>
          </Pressable>
        </View>
      </Sheet>

      <View style={styles.filterTitle}>
        <Filter size={13} color={palette.accent[600]} strokeWidth={2.4} />
        <AppText size="small" weight="bold" color="muted" style={styles.formLabelText}>
          FILTRES
        </AppText>
      </View>
      <View style={styles.filterRow}>
        {EVENT_FILTERS.map((f) => (
          <Pressable key={f.key} onPress={() => setEventFilter(f.key)} accessibilityRole="button">
            <Chip label={f.label} tone={eventFilter === f.key ? 'solid' : 'outline'} style={styles.chip} />
          </Pressable>
        ))}
      </View>

      <Card tone="default" style={{ paddingVertical: 6, gap: 0, marginTop: 8 }}>
        {loading ? (
          <Spinner label="Lecture des événements…" />
        ) : filtered.length === 0 ? (
          <AppText size="caption" color="muted" style={{ padding: 12 }}>
            Aucun événement sanitaire pour ce filtre.
          </AppText>
        ) : (
          filtered.map((e) => (
            <HealthEventRow
              key={e.id}
              e={e}
              canDelete={isProprietaire}
              busy={busy !== null}
              onResolve={() => onResolve(e)}
              onDelete={() => onDelete(e)}
            />
          ))
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    padding: 14,
  },
  formCard: {
    gap: 12,
    padding: 16,
    borderWidth: 1.5,
    borderColor: palette.red[200],
  },
  scoreCard: {
    padding: 0,
    marginBottom: 14,
    overflow: 'hidden',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
  },
  scoreDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: palette.border,
    marginVertical: 10,
  },
  viabilityBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minWidth: 80,
  },
  fcrCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 0,
    gap: 2,
  },
  tipsCard: {
    gap: 8,
    padding: 14,
  },
  chartCard: {
    padding: 14,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  chip: {
    marginBottom: 2,
  },
  lotCarousel: {
    gap: 8,
    paddingRight: 2,
    paddingBottom: 2,
  },
  lotCarouselItem: {
    width: 92,
    alignItems: 'center',
    gap: 4,
    padding: 8,
    borderRadius: 12,
    backgroundColor: palette.surface,
    borderWidth: 2,
    borderColor: palette.border,
  },
  lotCarouselItemActive: {
    borderColor: palette.brand[600],
    backgroundColor: palette.brand[50],
  },
  lotCarouselItemPressed: {
    opacity: 0.7,
  },
  lotCarouselImg: {
    width: 44,
    height: 44,
    borderRadius: 999,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceAlt,
  },
  lotCarouselImgImg: {
    width: '100%',
    height: '100%',
  },
  lotCarouselImgFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  lotCarouselImgText: {
    textAlign: 'center',
  },
  lotCarouselName: {
    fontSize: 10,
    lineHeight: 12,
  },
  lotCarouselSouche: {
    fontSize: 9,
    lineHeight: 11,
  },
  emptyCard: {
    padding: 14,
    gap: 0,
  },
  emptyCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  emptyCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: palette.green[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: color.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLogo: {
    width: 38,
    height: 38,
  },
  cardTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  cardTab: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: color.surfaceAlt,
  },
  cardTabActive: {
    backgroundColor: palette.green[50],
    borderColor: palette.green[300],
    borderWidth: 1.5,
  },
  cardTabActiveRed: {
    backgroundColor: palette.red[50],
    borderColor: palette.red[300],
    borderWidth: 1.5,
  },
  cardTabIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 2,
  },
  cardTabIconActive: {
    backgroundColor: palette.green[600],
    borderColor: palette.green[700],
  },
  cardTabIconActiveRed: {
    backgroundColor: palette.red[600],
    borderColor: palette.red[700],
  },
  metricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 10,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: color.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  careTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: palette.ink[100],
    overflow: 'hidden',
    marginTop: 8,
  },
  careFill: {
    height: '100%',
    borderRadius: 999,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  actionsPrev: {
    flex: 1,
    borderWidth: 1.5,
  },
  actionsNext: {
    flex: 1.5,
  },
  treatRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  input: {
    height: 46,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 15,
    color: color.ink[800],
    backgroundColor: color.surface,
    marginBottom: 14,
  },
  addBtn: {
    marginTop: 8,
  },
  scheduleCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 62,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: palette.green[600],
    shadowColor: palette.green[900],
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
    marginBottom: 14,
  },
  scheduleCtaPressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.88,
  },
  scheduleCtaIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: {
    borderColor: palette.green[300],
    backgroundColor: palette.green[50],
  },
  addBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  addBtnInnerClosed: {
    backgroundColor: palette.red[600],
    shadowColor: palette.red[900],
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  addBtnInnerOpen: {
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: palette.red[300],
  },
  addBtnPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.92,
  },
  formLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  formLabelBar: {
    width: 3,
    height: 14,
    borderRadius: 2,
    backgroundColor: palette.red[500],
  },
  formLabelText: {
    letterSpacing: 0.4,
  },
  formTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    borderWidth: 1,
    borderColor: palette.green[200],
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: color.surface,
    marginBottom: 14,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  filterTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
    marginTop: 2,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: palette.border,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: color.brand[600],
    borderColor: color.brand[600],
  },
  sheetRow: {
    paddingVertical: 13,
    paddingHorizontal: 6,
    borderRadius: 12,
  },
  wizCard: {
    gap: 0,
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  wizLotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: color.surface,
  },
  wizLotImg: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: color.brand[50],
  },
  wizLotImgFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  wizBanner: {
    gap: 6,
    padding: 12,
    marginTop: 8,
  },
});

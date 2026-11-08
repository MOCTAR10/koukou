import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { parseDecimalFr } from '../../lib/number';
import { api } from '../../api/client';
import type {
  AlertLevel,
  Breed,
  BreedStandard,
  Building,
  CareType,
  FeedEntryType,
  FeedLossReason,
  FeedMovementType,
  HealthEventKind,
  Lot,
  ProphylaxisEvent,
  ProphylaxisStatus,
  ReadyReason,
} from '../../api/types-flock';
import { useFarm } from '../../app/FarmContext';
import { useCanRead } from '../../app/useMenuAccess';
import { classNames } from '../../lib/format';
import { Card, IconTile, type IconTone } from '../ui';
import { inlineInputCls, DateInput } from '../form';
import { librevilleDay, shiftDay } from '../../lib/libreville';

export const EGGS_PER_ALVEOL = 30;

export const SPECIES_LABEL: Record<string, string> = {
  POULET: 'Poulet',
  PINTADE: 'Pintade',
  DINDE: 'Dinde',
  CAILLE: 'Caille',
  CANARD: 'Canard',
  OIE: 'Oie',
  FAISAN: 'Faisan',
  AUTRE: 'Autre (volailles)',
};

export const TYPE_LABEL: Record<string, string> = { CHAIR: 'Chair', PONDEUSE: 'Pondeuse' };

export const FEED_PHASE_LABEL: Record<string, string> = {
  POUSSIN: 'Poussin',
  DEMARRAGE: 'Démarrage',
  CROISSANCE: 'Croissance',
  PRE_PONTE: 'Pré-ponte',
  PONTE_PHASE_1: 'Ponte 1',
  PONTE_PHASE_2: 'Ponte 2',
  PONTE_PHASE_3: 'Ponte 3',
  FINITION: 'Finition',
  PERSONNALISE: 'Personnalisé',
};

export const FEED_PHASES = Object.keys(FEED_PHASE_LABEL);

export function phaseLabel(p: string | null | undefined, custom?: string | null): string {
  if (!p) return '—';
  if (p === 'PERSONNALISE' && custom) return custom;
  return FEED_PHASE_LABEL[p] ?? 'Autre';
}

export const ENTRY_TYPE_LABEL: Record<FeedEntryType, string> = {
  BULKER: 'Bulker',
  BAG: 'Sacs',
  MEDICAMENT: 'Médicament',
  MATIERE_PREMIERE: 'Matière première',
};

export const CARE_TYPE_LABEL: Record<CareType, string> = {
  VACCIN: 'Vaccin',
  MEDICAMENT: 'Médicament',
  VITAMINE: 'Vitamine',
  ANTIBIOTIQUE: 'Antibiotique',
  AUTRE: 'Autre',
};
export const CARE_TYPES = Object.keys(CARE_TYPE_LABEL) as CareType[];

export const CARE_STATUS_LABEL: Record<ProphylaxisStatus, string> = {
  PLANIFIE: 'Programmé',
  FAIT: 'Fait',
  EN_RETARD: 'En retard',
  ANNULE: 'Annulé',
};

export const HEALTH_KIND_LABEL: Record<HealthEventKind, string> = {
  MALADIE: 'Maladie',
  MORTALITE: 'Mortalité',
  REFORME: 'Abattage',
  SYMPTOME: 'Symptôme',
  VISITE_VETO: 'Visite vétérinaire',
  AUTRE: 'Autre',
};

export const LOSS_REASON_LABEL: Record<FeedLossReason, string> = {
  HUMIDITE: 'Humidité',
  RONGEURS: 'Rongeurs',
  AUTRE: 'Autre',
};

export const MOVEMENT_TYPE_LABEL: Record<FeedMovementType, string> = {
  CONSOMMATION: 'Consommation',
  PERTE: 'Perte',
  VENTE: 'Vente',
};

export const READY_REASON_LABEL: Record<ReadyReason, string> = {
  READY: 'Prêt à la vente',
  TOO_YOUNG: 'Trop jeune (âge minimum 35 jours)',
  FCR: 'Indice de consommation au-dessus du seuil de vente',
  SANITARY: 'Contre-indication sanitaire',
  N_A: 'Non applicable (pondeuses en ponte normale)',
};

export const LEVEL_LABEL: Record<AlertLevel, string> = {
  ROUGE: 'Critique',
  JAUNE: 'À surveiller',
  VERT: 'Bon',
};

/** Local calendar date (toISOString would give yesterday before 01:00 in Gabon, UTC+1). */
export function localYmd(d: Date = new Date()): string {
  return librevilleDay(d);
}

/** Sanitary dates are stored and compared in UTC by the server. */
export function utcYmd(epochMs: number = Date.now()): string {
  return librevilleDay(epochMs);
}

export function addLocalDays(ymd: string, days: number): string {
  return shiftDay(ymd, days);
}

export function addUtcDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86_400_000,
  );
}

/** Blank field = undefined, comma accepted as a decimal separator. */
export function parseNum(raw: string): number | undefined {
  // Strict French reader: « 1 200,5 » parses, « 1,2,3 » or « abc » is undefined (never a silent 0).
  return parseDecimalFr(raw) ?? undefined;
}

/** A typed number that doesn't read: for an inline « Nombre invalide » hint. */
export function isInvalidNum(raw: string): boolean {
  return raw.trim() !== '' && parseDecimalFr(raw) === null;
}

export function lotName(b: { batchName?: string | null } | null | undefined): string {
  return b?.batchName ?? 'Lot sans nom';
}

export function speciesName(b: { species?: string | null; customSpecies?: string | null }): string {
  if (b.species === 'AUTRE' && b.customSpecies) return b.customSpecies;
  return SPECIES_LABEL[b.species ?? 'POULET'] ?? 'Volaille';
}

export function kindLabel(b: { type: string; species?: string | null; customSpecies?: string | null }): string {
  const base = speciesName(b);
  const group = b.type === 'PONDEUSE' ? 'pondeuses' : 'de chair';
  if (b.species === 'AUTRE') return b.customSpecies ? `${base} ${group}` : `Volailles ${group}`;
  const plural = base.toLowerCase().endsWith('s') ? base : `${base}s`;
  return `${plural} ${group}`;
}

export type Tone = 'emerald' | 'amber' | 'red' | 'brand' | 'slate';

const TONES: Record<Tone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
};

/** Past this many characters, a pill may wrap inside a table (`pill-wrap`). */
const PILL_WRAP_AT = 16;

export function Pill({ tone = 'slate', children }: { tone?: Tone; children: ReactNode }) {
  const long = typeof children === 'string' && children.length > PILL_WRAP_AT;
  return (
    <span
      className={classNames(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1',
        long ? 'pill-wrap' : 'whitespace-nowrap',
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Same icons as the mobile tips: red = warning, yellow = info, green = fine. */
export function levelIcon(level: string | null | undefined): ReactNode {
  return level === 'ROUGE' ? <AlertTriangle /> : level === 'JAUNE' ? <Info /> : <CheckCircle2 />;
}

export function levelTone(level: string | null | undefined): Tone {
  return level === 'ROUGE' ? 'red' : level === 'JAUNE' ? 'amber' : level === 'VERT' ? 'emerald' : 'slate';
}

export function batchStage(b: Lot): { label: string; tone: Tone } {
  if (b.status === 'CLOTURE') return { label: 'Clôturé', tone: 'slate' };
  if (b.status === 'EN_VENTE') return { label: 'Prêt à la vente', tone: 'emerald' };
  const age = b.metrics.ageDays;
  if (b.type === 'PONDEUSE') {
    if (age <= 56) return { label: 'Démarrage', tone: 'brand' };
    if (age < 134) return { label: 'Croissance', tone: 'brand' };
    if (age < 420) return { label: 'Ponte', tone: 'amber' };
    return { label: 'Réforme', tone: 'amber' };
  }
  if (age < 14) return { label: 'Démarrage', tone: 'brand' };
  if (age < 28) return { label: 'Croissance', tone: 'brand' };
  if (age < 35) return { label: 'Finition', tone: 'amber' };
  return { label: 'Prêt à la vente', tone: 'emerald' };
}

/** The single most decisive status of a lot, in French. */
export function batchStatusPill(b: Lot): { label: string; tone: Tone } | null {
  const m = b.metrics;
  if (b.status === 'CLOTURE') return null;
  if (b.status === 'EN_VENTE') return { tone: 'emerald', label: 'En vente' };
  if (m.readyReason === 'SANITARY') return { tone: 'red', label: 'Vente suspendue : contre-indication sanitaire' };
  if (m.readyReason === 'FCR') return { tone: 'amber', label: 'IC au-dessus du seuil de vente' };
  if (m.readyForSale && m.readyReason === 'READY') return { tone: 'emerald', label: 'Prêt à vendre' };
  if (m.status === 'ROUGE') return { tone: 'red', label: 'Indicateurs critiques' };
  if (m.status === 'JAUNE') return { tone: 'amber', label: 'À surveiller' };
  return null;
}

export function careChip(
  events: ProphylaxisEvent[] | undefined,
): { label: string; tone: Tone; eventId: string } | null {
  if (!events?.length) return null;
  const label = (c: CareType) => CARE_TYPE_LABEL[c] ?? 'Soin';
  const late = events
    .filter((p) => p.status === 'EN_RETARD')
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  if (late[0]) {
    return {
      tone: 'red',
      eventId: late[0].id,
      label: late.length > 1 ? `${late.length} soins en retard` : `${label(late[0].careType)} en retard`,
    };
  }
  const today = utcYmd();
  const horizon = utcYmd(Date.now() + 7 * 86_400_000);
  const soon = events
    .filter((p) => p.status === 'PLANIFIE' && p.scheduledDate >= today && p.scheduledDate <= horizon)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  if (soon[0]) {
    return {
      tone: 'amber',
      eventId: soon[0].id,
      label: `${label(soon[0].careType)} à faire${soon.length > 1 ? ` +${soon.length - 1}` : ''}`,
    };
  }
  return null;
}

/** Same defaults as the backend rule (VIDE_SANITAIRE_MIN_DAYS / MAX_DAYS). */
export function videSanitaireHint(input: {
  activeLots: number;
  lastLotEndedAt: string | null | undefined;
  placementDate: string;
}): { tone: Tone; text: string } {
  const min = 14;
  const rec = 21;
  if (input.activeLots > 0) {
    return {
      tone: 'amber',
      text: 'Bâtiment encore occupé : pas de vide sanitaire avant ce lot (risque de transmission entre bandes).',
    };
  }
  if (!input.lastLotEndedAt) {
    return {
      tone: 'slate',
      text: `Aucun lot précédent dans ce bâtiment. Après un lot, prévoir ${min} à ${rec} jours de vide sanitaire.`,
    };
  }
  const days = Math.max(0, daysBetween(input.lastLotEndedAt, input.placementDate));
  if (days < min) {
    const left = min - days;
    return {
      tone: 'red',
      text: `Vide sanitaire de ${days} jour${days > 1 ? 's' : ''} seulement à cette date : attendre encore ${left} jour${left > 1 ? 's' : ''} (minimum ${min}).`,
    };
  }
  if (days < rec) {
    return { tone: 'amber', text: `Vide sanitaire de ${days} jours à cette date : acceptable, idéalement ${rec} jours.` };
  }
  return { tone: 'emerald', text: `Vide sanitaire de ${days} jours à cette date : parfait.` };
}

export function Note({ tone = 'slate', icon, children }: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
  const cls: Record<Tone, string> = {
    emerald: 'bg-emerald-50 text-emerald-800',
    amber: 'bg-amber-50 text-amber-800',
    red: 'bg-red-50 text-red-700',
    brand: 'bg-brand-50 text-brand-800',
    slate: 'bg-slate-50 text-slate-600',
  };
  if (icon) {
    return (
      <div className={classNames('flex items-start gap-2 rounded-lg px-3 py-2 text-sm', cls[tone])}>
        <span aria-hidden="true" className="mt-0.5 shrink-0 [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>
        <div className="min-w-0">{children}</div>
      </div>
    );
  }
  return <div className={classNames('rounded-lg px-3 py-2 text-sm', cls[tone])}>{children}</div>;
}

export function Tabs<K extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ key: K; label: string; icon?: ReactNode }>;
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1" role="tablist">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={value === o.key}
          onClick={() => onChange(o.key)}
          className={classNames(
            'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition [&>svg]:h-4 [&>svg]:w-4',
            value === o.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Metric({
  label,
  value,
  sub,
  tone,
  icon,
  image,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'good' | 'warn' | 'bad';
  icon?: ReactNode;
  image?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 px-3 py-2">
      {/* flex-wrap: in a narrow cell the label drops under the tile instead of overflowing. */}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] uppercase tracking-wide text-slate-500">
        {image ? (
          <img src={image} alt="" loading="lazy" className="h-7 w-7 shrink-0 rounded-md bg-white object-contain ring-1 ring-slate-200" />
        ) : null}
        {icon ? (
          <IconTile icon={icon} size="sm" tone={tone === 'good' ? 'green' : tone === 'warn' ? 'amber' : tone === 'bad' ? 'red' : 'brand'} />
        ) : null}
        <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
      </p>
      <p
        className={classNames(
          'mt-0.5 text-base font-bold tabular-nums',
          tone === 'good'
            ? 'text-emerald-600'
            : tone === 'warn'
              ? 'text-amber-600'
              : tone === 'bad'
                ? 'text-red-600'
                : 'text-slate-800',
        )}
      >
        {value}
      </p>
      {sub ? <p className="text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}

export function SectionCard({
  title,
  subtitle,
  actions,
  children,
  flush = false,
  icon,
  iconTone = 'brand',
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  icon?: ReactNode;
  iconTone?: IconTone;
}) {
  return (
    <Card className={flush ? 'overflow-hidden' : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon ? <IconTile icon={icon} tone={iconTone} size="sm" /> : null}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
            {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
          </div>
        </div>
        {actions}
      </div>
      <div className={flush ? undefined : 'p-4'}>{children}</div>
    </Card>
  );
}

/** Form field whose label carries mobile's small field icon or photo. */
export function IconField({
  label,
  icon,
  image,
  hint,
  children,
  className,
}: {
  label: string;
  icon?: ReactNode;
  image?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={classNames('block', className)}>
      <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
        {image ? <img src={image} alt="" loading="lazy" className="h-6 w-6 shrink-0 rounded-md bg-white object-contain ring-1 ring-slate-200" /> : null}
        {icon ? (
          <span aria-hidden="true" className="shrink-0 text-slate-400 [&>svg]:h-3.5 [&>svg]:w-3.5">
            {icon}
          </span>
        ) : null}
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

export interface Period {
  span: 'all' | 7 | 30;
  /** Explicit end date; null means "live". */
  to: string | null;
}

export const LIVE_PERIOD: Period = { span: 'all', to: null };

export function periodBounds(p: Period): { from: string | null; to: string | null } {
  const end = p.to ?? localYmd();
  if (p.span === 'all') return { from: null, to: p.to };
  return { from: addLocalDays(end, -(p.span - 1)), to: end };
}

export function inPeriod(p: Period, date: string | null | undefined): boolean {
  if (!date) return p.span === 'all' && !p.to;
  const { from, to } = periodBounds(p);
  const day = date.slice(0, 10);
  return (!from || day >= from) && (!to || day <= to);
}

/** Simple period filter: whole history, last days, optionally up to a past date. */
export function PeriodBar({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const spans: Array<{ key: Period['span']; label: string }> = [
    { key: 'all', label: 'Tout' },
    { key: 7, label: '7 jours' },
    { key: 30, label: '30 jours' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex gap-1 rounded-lg bg-slate-100 p-0.5">
        {spans.map((s) => (
          <button
            key={String(s.key)}
            type="button"
            onClick={() => onChange({ ...value, span: s.key })}
            className={classNames(
              'rounded-md px-2.5 py-1 text-xs font-medium',
              value.span === s.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1.5 text-xs text-slate-500">
        Jusqu'au
        <DateInput
          
          max={localYmd()}
          value={value.to ?? ''}
          onChange={(e) => onChange({ ...value, to: e.target.value || null })}
          className={classNames(inlineInputCls, 'w-auto py-1 text-xs')}
        />
      </label>
      {value.to ? (
        <button
          type="button"
          onClick={() => onChange({ ...value, to: null })}
          className="text-xs font-medium text-brand-700 hover:underline"
        >
          Revenir à aujourd'hui
        </button>
      ) : null}
    </div>
  );
}

/** Invalidates every query of the farm (all keys carry farmId as 2nd element). */
export function useInvalidateFarm(): () => Promise<void> {
  const { farmId } = useFarm();
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === farmId });
}

export function useLots(asOf?: string | null) {
  const { farmId } = useFarm();
  const breeds = useBreeds();
  // TECHNIQUE: a profile without it (the veterinary services) gets no lot list.
  const canRead = useCanRead();
  return useQuery({
    queryKey: asOf ? ['batches', farmId, asOf] : ['batches', farmId],
    queryFn: () => api.get<Lot[]>(`/farms/${farmId}/batches${asOf ? `?asOf=${asOf}` : ''}`),
    enabled: !!farmId && canRead('TECHNIQUE'),
    // The batch payload carries breedId only.
    select: (rows) =>
      rows.map((r) => {
        const breed = breeds.data?.find((b) => b.id === r.breedId);
        return { ...r, breedName: breed?.name ?? null, breedCode: breed?.refCode ?? null };
      }),
  });
}

export function useBuildings() {
  const { farmId } = useFarm();
  const canRead = useCanRead();
  return useQuery({
    queryKey: ['buildings', farmId],
    queryFn: () => api.get<Building[]>(`/farms/${farmId}/buildings`),
    enabled: !!farmId && canRead('REGISTRE'),
  });
}

export function useBreeds() {
  const { farmId } = useFarm();
  const canRead = useCanRead();
  return useQuery({
    queryKey: ['breeds', farmId],
    queryFn: () => api.get<Breed[]>(`/breeds?farmId=${encodeURIComponent(farmId ?? '')}`),
    enabled: !!farmId && canRead('TECHNIQUE'),
  });
}

export function useBreedStandards(breedId: string | null | undefined) {
  const { farmId } = useFarm();
  const canRead = useCanRead();
  return useQuery({
    queryKey: ['breed-standards', farmId, breedId],
    queryFn: async () => {
      const res = await api.get<{ standards: BreedStandard[] }>(
        `/breeds/${breedId}/standards?farmId=${encodeURIComponent(farmId ?? '')}`,
      );
      return res.standards;
    },
    enabled: !!farmId && !!breedId && canRead('TECHNIQUE'),
  });
}

/** Tracks which action of a list is running and its last server error. */
export function useAsyncAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, run };
}

export function lotOption(b: Lot): string {
  return `${lotName(b)} · ${kindLabel(b)} · ${b.metrics.liveCount.toLocaleString('fr-FR')} vivants`;
}

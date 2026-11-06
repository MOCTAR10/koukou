import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  Bird,
  Calendar,
  CalendarX,
  Camera,
  Check,
  Droplets,
  Egg,
  Filter,
  HeartPulse,
  History,
  Lightbulb,
  Pencil,
  Pill as PillIcon,
  Plus,
  RotateCcw,
  Scale,
  ScrollText,
  ShieldCheck,
  ShieldPlus,
  Stethoscope,
  Syringe,
  Trash2,
  TrendingDown,
  Wheat,
} from 'lucide-react';
import { api } from '../api/client';
import type {
  BatchHealth,
  CareType,
  HealthEvent,
  ProphylaxisEvent,
  SanitaryProtocol,
  TreatmentRecord,
} from '../api/types-flock';
import type { SanitaryLotView } from '../api/types-surveillance';
import { DeclarationPhotos } from '../components/surveillance/DeclarationPhotos';
import { FarmOfficialAlerts } from '../components/surveillance/FarmOfficialAlerts';
import { isDeclarationRefusal, signLabels } from '../components/surveillance/declaration';
import { useSanitaryList } from '../components/surveillance/queries';
import { isOpenLot, lotRefOption, refFromLot, refFromSanitaryLot, type SanitaryLotRef } from '../components/surveillance/sanitaryLot';
import { useFarm } from '../app/FarmContext';
import { useFarmProfile } from '../app/useFarmProfile';
import { useCanRead } from '../app/useMenuAccess';
import { BarChart } from '../components/Charts';
import { vetDecision } from '../components/flock/vetDecision';
import { ConfirmModal, EditScheduleModal, HealthEventModal, PlanCareModal } from '../components/flock/SanitaryModals';
import { CompleteCareModal } from '../components/flock/CompleteCareModal';
import {
  EMPTY_PRODUCT_LIST_NOTE,
  REFERENCE_STEP_HINT,
  REFERENCE_STEP_LABEL,
  UNKNOWN_PRODUCT_LIST_NOTE,
  canRemoveCare,
  postponedLabel,
  treatmentBody,
  treatmentPeriodLabel,
  withdrawalEndPreview,
} from '../components/flock/sanitaryRecords';
import { useAuth } from '../auth/AuthContext';
import { useIdempotencyKey } from '../lib/idempotency';
import { sendOrQueue, showQueuedNotice } from '../offline';
import {
  CARE_STATUS_LABEL,
  CARE_TYPES,
  CARE_TYPE_LABEL,
  HEALTH_KIND_LABEL,
  IconField,
  LEVEL_LABEL,
  kindLabel,
  LIVE_PERIOD,
  Metric,
  Note,
  type Period,
  PeriodBar,
  Pill,
  SectionCard,
  Tabs,
  addUtcDays,
  inPeriod,
  levelIcon,
  levelTone,
  localYmd,
  useAsyncAction,
  useInvalidateFarm,
  useLots,
  utcYmd,
} from '../components/flock/shared';
import { Button, ErrorNote, Field, Modal, inputCls, DateInput } from '../components/form';
import { DataTable, EmptyState, Loading, PageHeader, PhotoThumb, Td, Th } from '../components/ui';
import { lotImage } from '../lib/animalImages';
import { dateFr, num } from '../lib/format';

type TabKey = 'sante' | 'check' | 'maladies' | 'calendrier' | 'traitements';
const TAB_KEYS: readonly TabKey[] = ['sante', 'check', 'maladies', 'calendrier', 'traitements'];

const STATUS_RANK: Record<string, number> = { EN_RETARD: 0, PLANIFIE: 1, FAIT: 2, ANNULE: 3 };

const QUEUED_TREATMENT_MESSAGE = 'Traitement enregistré hors ligne : il sera envoyé au retour de la connexion.';

export function SanitaryPage() {
  const { farmId } = useFarm();
  const { hasPermission } = useFarmProfile();
  const canReport = hasPermission('sanitaire:gerer', 'sanitaire:signaler');
  // The farm's lots are a TECHNIQUE route: a profile without it (the veterinary
  // services) picks its band from the SANITAIRE list instead.
  const canListLots = useCanRead()('TECHNIQUE');
  const [params, setParams] = useSearchParams();
  const lots = useLots();
  const sanitaryLots = useQuery({
    queryKey: ['sanitary-lots', farmId, 'open'],
    queryFn: () => api.get<SanitaryLotView[]>(`/farms/${farmId}/sanitary/lots?open=true`),
    enabled: !!farmId && !canListLots,
  });
  const lotSource = canListLots ? lots : sanitaryLots;
  const active = useMemo<SanitaryLotRef[]>(
    () =>
      canListLots
        ? (lots.data ?? []).filter((b) => isOpenLot(b.status)).map(refFromLot)
        : (sanitaryLots.data ?? []).map((b) => refFromSanitaryLot(b)),
    [canListLots, lots.data, sanitaryLots.data],
  );
  const [picked, setPicked] = useState(params.get('lot') ?? '');
  const [tab, setTab] = useState<TabKey>(TAB_KEYS.includes(params.get('onglet') as TabKey) ? (params.get('onglet') as TabKey) : 'sante');
  const [period, setPeriod] = useState<Period>(LIVE_PERIOD);
  const [planning, setPlanning] = useState(false);
  const [reporting, setReporting] = useState(false);
  const lot = active.find((b) => b.id === picked) ?? active[0] ?? null;

  // A notification opens a band's events (`?lot=…&onglet=maladies`), even when the page is already open.
  const lotParam = params.get('lot');
  const tabParam = params.get('onglet');
  useEffect(() => {
    if (lotParam) setPicked(lotParam);
  }, [lotParam]);
  useEffect(() => {
    if (tabParam && TAB_KEYS.includes(tabParam as TabKey)) setTab(tabParam as TabKey);
  }, [tabParam]);
  // POUFA lot A indic: « Déclarer aux services vétérinaires » from a MALADIE advice opens the declaration (`?declarer=1`).
  const declareParam = params.get('declarer');
  useEffect(() => {
    if (declareParam !== '1') return;
    setReporting(true);
    const next = new URLSearchParams(params);
    next.delete('declarer');
    setParams(next, { replace: true });
  }, [declareParam, params, setParams]);
  const alertParam = params.get('alerte');
  const closeAlert = () => {
    const next = new URLSearchParams(params);
    next.delete('alerte');
    setParams(next, { replace: true });
  };

  // The lot page deep-links here to open the planning form directly.
  const wantsPlan = params.get('plan') === '1';
  useEffect(() => {
    if (wantsPlan && lotSource.isSuccess) {
      setPlanning(true);
      const lotParam = params.get('lot');
      setParams(lotParam ? { lot: lotParam } : {}, { replace: true });
    }
  }, [wantsPlan, lotSource.isSuccess, params, setParams]);

  const health = useQuery({
    queryKey: ['health', farmId, lot?.id, period.to],
    queryFn: () => api.get<BatchHealth>(`/farms/${farmId}/batches/${lot?.id}/health${period.to ? `?asOf=${period.to}` : ''}`),
    enabled: !!farmId && !!lot,
  });
  const prophylaxis = useQuery({
    queryKey: ['prophylaxis', farmId, lot?.id],
    queryFn: () => api.get<ProphylaxisEvent[]>(`/farms/${farmId}/batches/${lot?.id}/prophylaxis`),
    enabled: !!farmId && !!lot,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sanitaire"
        icon={<ScrollText />}
        subtitle="Santé des lots, soins et traitements"
        actions={
          canReport ? (
            <div className="flex gap-2">
              <Button tone="secondary" disabled={!lot} onClick={() => setReporting(true)}>
                <Plus className="h-4 w-4" /> Signaler un événement
              </Button>
              <Button disabled={active.length === 0} onClick={() => setPlanning(true)}>
                <Syringe className="h-4 w-4" /> Planifier un soin
              </Button>
            </div>
          ) : undefined
        }
      />
      {/* Official alerts of the farm (POUFA), apart from Fermia's advisory alerts. */}
      <FarmOfficialAlerts openAlertId={alertParam} onCloseAlert={closeAlert} />
      <ErrorNote error={lotSource.error} />
      {lotSource.isLoading ? (
        <Loading label="Chargement des lots…" />
      ) : !lot ? (
        <EmptyState message={canListLots ? 'Aucun lot actif : créez un lot pour suivre sa santé.' : 'Aucune bande ouverte dans cette ferme.'} icon={<Activity />} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-0 max-w-full items-center gap-2">
              <PhotoThumb src={lotImage(lot.breedName, lot.species)} />
              <select className={`${inputCls} !w-[30rem] min-w-0 max-w-full`} aria-label="Lot" value={lot.id} onChange={(e) => setPicked(e.target.value)}>
                {active.map((b) => (
                  <option key={b.id} value={b.id}>
                    {lotRefOption(b, kindLabel(b))}
                  </option>
                ))}
              </select>
            </div>
            <PeriodBar value={period} onChange={setPeriod} />
          </div>
          <Tabs<TabKey>
            value={tab}
            onChange={setTab}
            options={[
              { key: 'sante', label: 'Santé', icon: <HeartPulse /> },
              { key: 'check', label: 'Check', icon: <Activity /> },
              { key: 'maladies', label: 'Maladies', icon: <Stethoscope /> },
              { key: 'calendrier', label: 'Calendrier', icon: <Calendar /> },
              { key: 'traitements', label: 'Traitements', icon: <Syringe /> },
            ]}
          />
          {tab === 'sante' ? <HealthPanel lot={lot} health={health.data} loading={health.isLoading} error={health.error} events={prophylaxis.data ?? []} /> : null}
          {tab === 'check' ? <CheckPanel health={health.data} loading={health.isLoading} /> : null}
          {tab === 'maladies' ? <EventsPanel lot={lot} period={period} onAdd={() => setReporting(true)} /> : null}
          {tab === 'calendrier' ? <CalendarPanel lot={lot} events={prophylaxis.data} loading={prophylaxis.isLoading} error={prophylaxis.error} period={period} onPlan={() => setPlanning(true)} /> : null}
          {tab === 'traitements' ? <TreatmentsPanel lot={lot} period={period} /> : null}
        </>
      )}
      {planning && canReport ? <PlanCareModal lots={active} initialLotId={lot?.id} onClose={() => setPlanning(false)} /> : null}
      {reporting && lot && canReport ? <HealthEventModal lot={lot} onClose={() => setReporting(false)} /> : null}
    </div>
  );
}

function HealthPanel({
  lot,
  health,
  loading,
  error,
  events,
}: {
  lot: SanitaryLotRef;
  health: BatchHealth | undefined;
  loading: boolean;
  error: unknown;
  events: ProphylaxisEvent[];
}) {
  if (loading) return <Loading label="Calcul de la santé du lot…" />;
  if (!health) return <ErrorNote error={error} />;
  const late = events.filter((e) => e.status === 'EN_RETARD');
  const today = utcYmd();
  const horizon = utcYmd(Date.now() + 7 * 86_400_000);
  const soon = events.filter((e) => e.status === 'PLANIFIE' && e.scheduledDate.slice(0, 10) >= today && e.scheduledDate.slice(0, 10) <= horizon);
  const score = health.healthScore;
  const isLayer = lot.type === 'PONDEUSE';
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <SectionCard title="État du lot" icon={<HeartPulse />} subtitle={`J${health.ageDays}`}>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Metric label="Score de santé" icon={<HeartPulse />} value={`${num(score, 0)} / 100`} tone={score >= 80 ? 'good' : score >= 60 ? 'warn' : 'bad'} />
            <Metric label="Vivants" icon={<Bird />} value={num(health.liveCount)} />
            <Metric label="Mortalité" icon={<TrendingDown />} value={`${num(health.mortalityPercent)} %`} />
            <Metric label="Viabilité" icon={<HeartPulse />} value={`${num(health.viabilityPercent)} %`} />
            <Metric label="Indice de consommation" icon={<Scale />} value={health.fcr != null ? num(health.fcr, 2) : '—'} />
            <Metric label="Aliment / oiseau" icon={<Wheat />} value={`${num(health.feedPerBirdGrams, 0)} g`} />
            <Metric label="Eau / oiseau" icon={<Droplets />} value={health.waterLPerBird != null ? `${num(health.waterLPerBird, 2)} L` : '—'} />
            {isLayer ? (
              <Metric label="Taux de ponte" icon={<Egg />} value={health.layRatePercent != null ? `${num(health.layRatePercent)} %` : '—'} sub={`${num(health.trays, 0)} alvéoles`} />
            ) : null}
          </div>
        </SectionCard>
        <div className="grid gap-4 md:grid-cols-2">
          <SectionCard title="Mortalité sur 7 jours" icon={<TrendingDown />} iconTone="red">
            <BarChart data={health.trends.mortality} labels={health.trends.dates.map((d) => d.slice(8, 10))} height={140} color="#64748b" peakColor="#dc2626" unit="têtes / jour" />
          </SectionCard>
          {isLayer ? (
            <SectionCard title="Œufs sur 7 jours" icon={<Egg />} iconTone="accent">
              <BarChart data={health.trends.eggs} labels={health.trends.dates.map((d) => d.slice(8, 10))} height={140} color="#0f766e" unit="œufs / jour" />
            </SectionCard>
          ) : null}
        </div>
      </div>
      <div className="space-y-4">
        <SectionCard title="Soins" icon={<Syringe />}>
          <div className="grid grid-cols-2 gap-2">
            <Metric label="En retard" icon={<AlertTriangle />} value={late.length} tone={late.length > 0 ? 'bad' : 'good'} />
            <Metric label="Sous 7 jours" icon={<Calendar />} value={soon.length} tone={soon.length > 0 ? 'warn' : undefined} />
          </div>
        </SectionCard>
        <SectionCard title="Conseils et alertes" icon={<Lightbulb />}>
          {health.tips.length === 0 ? (
            <p className="text-sm text-slate-500">Rien à signaler.</p>
          ) : (
            <div className="space-y-2">
              {health.tips.map((t) => (
                <Note key={t.text} tone={levelTone(t.level)} icon={levelIcon(t.level)}>
                  {t.text}
                </Note>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function CheckPanel({ health, loading }: { health: BatchHealth | undefined; loading: boolean }) {
  if (loading) return <Loading label="Analyse du lot…" />;
  if (!health) return null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SectionCard title="Constats" icon={<Activity />}>
        {health.check.insights.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun constat particulier.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-4 text-sm text-slate-700">
            {health.check.insights.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        )}
      </SectionCard>
      <SectionCard title="Recommandations" icon={<Lightbulb />}>
        {health.check.advice.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune recommandation pour le moment.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-4 text-sm text-slate-700">
            {health.check.advice.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function EventsPanel({ lot, period, onAdd }: { lot: SanitaryLotRef; period: Period; onAdd: () => void }) {
  const { farmId } = useFarm();
  const { hasPermission } = useFarmProfile();
  const canManage = hasPermission('sanitaire:gerer');
  const invalidate = useInvalidateFarm();
  const action = useAsyncAction();
  const [toDelete, setToDelete] = useState<HealthEvent | null>(null);
  const [photosOf, setPhotosOf] = useState<HealthEvent | null>(null);
  const signs = useSanitaryList('SIGNE_CLINIQUE');
  const events = useQuery({
    queryKey: ['health-events', farmId, lot.id],
    queryFn: () => api.get<HealthEvent[]>(`/farms/${farmId}/batches/${lot.id}/health-events`),
    enabled: !!farmId,
  });
  const rows = (events.data ?? []).filter((e) => inPeriod(period, e.occurredAt));
  const base = `/farms/${farmId}/batches/${lot.id}/health-events`;

  return (
    <SectionCard
      title="Maladies et événements"
      icon={<Stethoscope />}
      flush
      actions={
        hasPermission('sanitaire:gerer', 'sanitaire:signaler') ? (
          <Button tone="secondary" onClick={onAdd}>
            <Plus className="h-4 w-4" /> Signaler
          </Button>
        ) : undefined
      }
    >
      {isDeclarationRefusal(events.error) ? (
        <div className="p-4">
          <EmptyState message={events.error instanceof Error ? events.error.message : ''} icon={<Stethoscope />} />
        </div>
      ) : (
        <ErrorNote error={events.error ?? action.error} />
      )}
      {events.isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <div className="p-4">
          <EmptyState message="Aucun événement de santé sur cette période." icon={<Stethoscope />} />
        </div>
      ) : (
        <DataTable>
            <thead className="bg-slate-50">
              <tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Événement</Th>
                <Th>Oiseaux</Th>
                <Th>Gravité</Th>
                <Th>État</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-t border-slate-100 align-top">
                  <Td>{dateFr(e.occurredAt)}</Td>
                  <Td label="Type">{HEALTH_KIND_LABEL[e.kind]}</Td>
                  <Td label="Événement" className="max-w-md">
                    <span className="font-medium">{e.title}</span>
                    {e.suspicion ? (
                      <span className="ml-1.5">
                        <Pill tone="red">Suspicion</Pill>
                      </span>
                    ) : null}
                    {e.clinicalSigns?.length ? (
                      <span className="block text-xs text-slate-500">Signes cliniques : {signLabels(e.clinicalSigns, signs.data ?? []).join(', ')}</span>
                    ) : null}
                    {e.symptoms ? <span className="block text-xs text-slate-500">Symptômes : {e.symptoms}</span> : null}
                    {e.description ? <span className="block text-xs text-slate-500">{e.description}</span> : null}
                    {e.treatmentGiven ? <span className="block text-xs text-slate-500">Traitement : {e.treatmentGiven}</span> : null}
                    {e.vetConsulted ? (
                      <span className="block text-xs text-slate-500">Vétérinaire consulté{e.vetName ? ` : ${e.vetName}` : ''}</span>
                    ) : null}
                    {e.notes ? <span className="block text-xs text-slate-500">{e.notes}</span> : null}
                  </Td>
                  <Td label="Oiseaux">{e.quantity > 0 ? num(e.quantity, 0) : '—'}</Td>
                  <Td label="Gravité">
                    <Pill tone={levelTone(e.severity)}>{LEVEL_LABEL[e.severity]}</Pill>
                  </Td>
                  <Td label="État">
                    <Pill tone={e.status === 'RESOLU' ? 'emerald' : 'amber'}>{e.status === 'RESOLU' ? 'Résolu' : 'En cours'}</Pill>
                    <span className="mt-1 block" title={e.vetReviewComment ?? undefined}>
                      <Pill tone={vetDecision(e.vetReviewStatus).tone}>{vetDecision(e.vetReviewStatus).label}</Pill>
                    </span>
                    {e.vetReviewComment ? <span className="block text-xs text-slate-500">{e.vetReviewComment}</span> : null}
                  </Td>
                  <Td className="whitespace-nowrap text-right">
                    <Button tone="secondary" className="mr-1" onClick={() => setPhotosOf(e)}>
                      <Camera className="h-4 w-4" /> Photos{e.photos?.length ? ` (${e.photos.length})` : ''}
                    </Button>
                    {e.status !== 'RESOLU' && canManage ? (
                      <Button
                        tone="secondary"
                        className="mr-1"
                        busy={action.busy === `r-${e.id}`}
                        onClick={() =>
                          void action.run(`r-${e.id}`, async () => {
                            await api.patch(`${base}/${e.id}/resolve`);
                            await invalidate();
                          })
                        }
                      >
                        <Check className="h-4 w-4" /> Résoudre
                      </Button>
                    ) : null}
                    {canManage ? (
                      <Button tone="secondary" onClick={() => setToDelete(e)}>
                        <Trash2 className="h-4 w-4" /> Supprimer
                      </Button>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
      )}
      {photosOf && farmId ? (
        <Modal side title={`Photos · ${photosOf.title}`} onClose={() => setPhotosOf(null)}>
          <DeclarationPhotos
            farmId={farmId}
            batchId={lot.id}
            eventId={photosOf.id}
            photos={(events.data ?? []).find((x) => x.id === photosOf.id)?.photos ?? photosOf.photos ?? []}
            canAdd={hasPermission('sanitaire:gerer', 'sanitaire:signaler')}
            canDelete={canManage}
          />
        </Modal>
      ) : null}
      {toDelete ? (
        <ConfirmModal
          title="Supprimer cet événement ?"
          message={
            toDelete.kind === 'REFORME'
              ? "La suppression d'un abattage réintègre ces oiseaux dans l'effectif vivant."
              : `« ${toDelete.title} » sera définitivement supprimé.`
          }
          confirmLabel="Supprimer"
          confirmIcon={<Trash2 className="h-4 w-4" />}
          busy={action.busy === 'delete'}
          error={action.error}
          onClose={() => setToDelete(null)}
          onConfirm={() =>
            void action.run('delete', async () => {
              await api.del(`${base}/${toDelete.id}`);
              await invalidate();
              setToDelete(null);
            })
          }
        />
      ) : null}
    </SectionCard>
  );
}

function CalendarPanel({
  lot,
  events,
  loading,
  error,
  period,
  onPlan,
}: {
  lot: SanitaryLotRef;
  events: ProphylaxisEvent[] | undefined;
  loading: boolean;
  error: unknown;
  period: Period;
  onPlan: () => void;
}) {
  const { farmId } = useFarm();
  const { hasPermission } = useFarmProfile();
  const canManage = hasPermission('sanitaire:gerer');
  const canReport = hasPermission('sanitaire:gerer', 'sanitaire:signaler');
  // POUFA lot A2 sante: a reference step is withdrawn by the vets (matrix), never by the farm.
  const isInstitution = useAuth().user?.role === 'INSTITUTION';
  const invalidate = useInvalidateFarm();
  const action = useAsyncAction();
  const [editing, setEditing] = useState<ProphylaxisEvent | null>(null);
  const [completing, setCompleting] = useState<ProphylaxisEvent | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'cancel' | 'delete'; event: ProphylaxisEvent } | null>(null);
  const [protocolId, setProtocolId] = useState('');

  const base = `/farms/${farmId}/batches/${lot.id}`;
  const protocols = useQuery({
    queryKey: ['protocols', farmId, lot.species, lot.type],
    queryFn: () =>
      api.get<SanitaryProtocol[]>(
        `/sanitary/protocols?farmId=${encodeURIComponent(farmId ?? '')}&species=${lot.species}&type=${lot.type}`,
      ),
    enabled: !!farmId,
  });
  const generate = useMutation({
    mutationFn: () => api.post(`${base}/prophylaxis/generate`, { protocolId: protocolId || undefined }),
    onSuccess: invalidate,
  });

  const run = (key: string, fn: () => Promise<unknown>) =>
    void action.run(key, async () => {
      await fn();
      await invalidate();
    });

  const rows = [...(events ?? [])]
    .filter((e) => inPeriod(period, e.scheduledDate))
    .sort(
      (a, b) =>
        (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) || a.scheduledDate.localeCompare(b.scheduledDate),
    );

  return (
    <SectionCard
      title="Calendrier des soins"
      icon={<Calendar />}
      flush
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {canManage ? (
            <>
              <select className={`${inputCls} !w-56`} aria-label="Protocole" value={protocolId} onChange={(e) => setProtocolId(e.target.value)}>
                <option value="">Protocole par défaut</option>
                {(protocols.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Button tone="secondary" busy={generate.isPending} onClick={() => generate.mutate()}>
                <ShieldPlus className="h-4 w-4" /> Générer le calendrier
              </Button>
            </>
          ) : null}
          {canReport ? (
            <Button onClick={onPlan}>
              <Syringe className="h-4 w-4" /> Planifier
            </Button>
          ) : null}
        </div>
      }
    >
      <ErrorNote error={error ?? generate.error ?? action.error} />
      {loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <div className="p-4">
          <EmptyState message="Aucun soin sur cette période. Générez le calendrier ou planifiez un soin." icon={<Calendar />} />
        </div>
      ) : (
        <DataTable>
            <thead className="bg-slate-50">
              <tr>
                <Th>Date prévue</Th>
                <Th>Soin</Th>
                <Th>Type</Th>
                <Th>Voie et dosage</Th>
                <Th>Origine</Th>
                <Th>Statut</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const open = e.status === 'PLANIFIE' || e.status === 'EN_RETARD';
                return (
                  <tr key={e.id} className="border-t border-slate-100 align-top">
                    <Td>
                      {dateFr(e.scheduledDate)}
                      {postponedLabel(e, dateFr) ? (
                        <span className="block text-xs text-amber-700">{postponedLabel(e, dateFr)}</span>
                      ) : null}
                      {e.completedAt ? (
                        <span className="block text-xs text-slate-500">
                          fait le {dateFr(e.completedAt)}
                          {e.animalCount != null ? ` · ${num(e.animalCount)} animaux` : ''}
                        </span>
                      ) : null}
                    </Td>
                    <Td label="Soin" className="font-medium">{e.name}</Td>
                    <Td label="Type">{CARE_TYPE_LABEL[e.careType]}</Td>
                    <Td label="Voie et dosage">{[e.route, e.dosage].filter(Boolean).join(' · ') || '—'}</Td>
                    <Td label="Origine">
                      <Pill tone={e.isReference ? 'brand' : undefined}>
                        {e.isReference ? REFERENCE_STEP_LABEL : e.protocolId ? 'Programme' : 'Manuel'}
                      </Pill>
                      {e.decrementStock ? (
                        <span className="ml-1">
                          <Pill tone="brand">Stock</Pill>
                        </span>
                      ) : null}
                    </Td>
                    <Td label="Statut">
                      <Pill tone={e.status === 'FAIT' ? 'emerald' : e.status === 'EN_RETARD' ? 'red' : e.status === 'ANNULE' ? 'slate' : 'brand'}>
                        {CARE_STATUS_LABEL[e.status]}
                      </Pill>
                    </Td>
                    <Td className="whitespace-nowrap text-right">
                      {open ? (
                        <div className="flex justify-end gap-1">
                          {canReport ? (
                            <Button onClick={() => setCompleting(e)}>
                              <Check className="h-4 w-4" /> Fait
                            </Button>
                          ) : null}
                          {canManage ? (
                            <>
                          <Button
                            tone="secondary"
                            busy={action.busy === `p-${e.id}`}
                            onClick={() =>
                              run(`p-${e.id}`, () =>
                                api.patch(`${base}/prophylaxis/${e.id}`, { scheduledDate: addUtcDays(e.scheduledDate, 1) }),
                              )
                            }
                          >
                            <RotateCcw className="h-4 w-4" /> +1 j
                          </Button>
                          <Button tone="secondary" onClick={() => setEditing(e)}>
                            <Pencil className="h-4 w-4" /> Modifier
                          </Button>
                          {canRemoveCare(e, isInstitution) ? (
                            <>
                              <Button tone="secondary" onClick={() => setConfirm({ kind: 'cancel', event: e })}>
                                <CalendarX className="h-4 w-4" /> Annuler
                              </Button>
                              <Button tone="secondary" onClick={() => setConfirm({ kind: 'delete', event: e })}>
                                <Trash2 className="h-4 w-4" /> Supprimer
                              </Button>
                            </>
                          ) : (
                            <span title={REFERENCE_STEP_HINT} className="inline-flex items-center">
                              <ShieldCheck className="h-4 w-4 text-brand-600" aria-label={REFERENCE_STEP_HINT} />
                            </span>
                          )}
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
      )}
      {editing ? <EditScheduleModal lot={lot} event={editing} onClose={() => setEditing(null)} /> : null}
      {completing ? <CompleteCareModal lot={lot} event={completing} onClose={() => setCompleting(null)} /> : null}
      {confirm ? (
        <ConfirmModal
          title={confirm.kind === 'cancel' ? 'Annuler ce soin ?' : 'Supprimer ce soin ?'}
          message={
            confirm.kind === 'cancel'
              ? `« ${confirm.event.name} » restera dans l'historique, marqué comme annulé.`
              : `« ${confirm.event.name} » sera définitivement retiré du calendrier.`
          }
          confirmLabel={confirm.kind === 'cancel' ? 'Annuler le soin' : 'Supprimer'}
          confirmIcon={confirm.kind === 'cancel' ? <CalendarX className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
          busy={action.busy === 'confirm'}
          error={action.error}
          onClose={() => setConfirm(null)}
          onConfirm={() =>
            void action.run('confirm', async () => {
              if (confirm.kind === 'cancel') {
                await api.post(`${base}/prophylaxis/${confirm.event.id}/cancel`, { reason: 'Annulé depuis le web' });
              } else {
                await api.del(`${base}/vaccine-schedules/${confirm.event.id}`);
              }
              await invalidate();
              setConfirm(null);
            })
          }
        />
      ) : null}
    </SectionCard>
  );
}

function TreatmentsPanel({ lot, period }: { lot: SanitaryLotRef; period: Period }) {
  const { farmId } = useFarm();
  const { hasPermission } = useFarmProfile();
  const canRecord = hasPermission('sanitaire:gerer', 'sanitaire:signaler');
  const invalidate = useInvalidateFarm();
  const idempotency = useIdempotencyKey('treatment');
  const [careFilter, setCareFilter] = useState<'all' | CareType>('all');
  const [careType, setCareType] = useState<CareType>('ANTIBIOTIQUE');
  const [productCode, setProductCode] = useState('');
  const [productName, setProductName] = useState('');
  const [dosage, setDosage] = useState('');
  const [route, setRoute] = useState('');
  const [administeredAt, setAdministeredAt] = useState(localYmd());
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [animalCount, setAnimalCount] = useState(lot.liveCount > 0 ? String(lot.liveCount) : '');
  const [withdrawal, setWithdrawal] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  // CDC 23: the products of the veterinary services' list; free text only while it is empty.
  const products = useSanitaryList('PRODUIT_TRAITEMENT', canRecord);
  const productList = products.data ?? (products.isError ? null : undefined);

  const treatments = useQuery({
    queryKey: ['treatments', farmId, lot.id],
    queryFn: () => api.get<TreatmentRecord[]>(`/farms/${farmId}/batches/${lot.id}/treatments`),
    enabled: !!farmId,
  });
  const form = {
    careType,
    productCode,
    productName,
    dosage,
    route,
    administeredAt,
    endDate,
    reason,
    animalCount,
    withdrawalDays: withdrawal,
    notes,
  };
  const add = useMutation({
    mutationFn: async () => {
      const built = treatmentBody(form, productList ?? null);
      if (!built.ok) throw new Error(built.error);
      const body = { ...built.body, idempotencyKey: idempotency.keyFor({ ...built.body, lot: lot.id }) };
      return sendOrQueue<TreatmentRecord>({
        kind: 'treatment',
        farmId: farmId!,
        path: `/farms/${farmId}/batches/${lot.id}/treatments`,
        body,
        label: `Traitement · ${lot.batchName ?? lot.code ?? 'Lot'}`,
      });
    },
    onSuccess: async (res) => {
      idempotency.settle();
      if (res.status === 'queued') showQueuedNotice(QUEUED_TREATMENT_MESSAGE);
      else await invalidate();
      setProductCode('');
      setProductName('');
      setDosage('');
      setRoute('');
      setEndDate('');
      setReason('');
      setWithdrawal('');
      setNotes('');
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const built = treatmentBody(form, productList ?? null);
    setFormError(built.ok ? null : built.error);
    if (built.ok) add.mutate();
  };

  const rows = (treatments.data ?? []).filter(
    (t) => inPeriod(period, t.administeredAt) && (careFilter === 'all' || t.careType === careFilter),
  );
  const today = localYmd();
  const holdUntil = withdrawalEndPreview(administeredAt, endDate, withdrawal);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className={canRecord ? 'lg:col-span-2' : 'lg:col-span-3'}>
        <SectionCard
          title="Historique des traitements"
          icon={<History />}
          flush
          actions={
            <div className="flex items-center gap-1.5">
              <Filter className="h-4 w-4 text-slate-400" />
              <select
                className={`${inputCls} !w-44`}
                aria-label="Type de soin"
                value={careFilter}
                onChange={(e) => setCareFilter(e.target.value as 'all' | CareType)}
              >
                <option value="all">Tous les soins</option>
                {CARE_TYPES.map((c) => (
                  <option key={c} value={c}>
                    {CARE_TYPE_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          <ErrorNote error={treatments.error} />
          {treatments.isLoading ? (
            <Loading />
          ) : rows.length === 0 ? (
            <div className="p-4">
              <EmptyState message="Aucun traitement sur cette période." icon={<Syringe />} />
            </div>
          ) : (
            <DataTable>
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Dates</Th>
                    <Th>Produit et motif</Th>
                    <Th>Type</Th>
                    <Th className="hidden lg:table-cell">Animaux</Th>
                    <Th className="hidden lg:table-cell">Voie et dosage</Th>
                    <Th>Fin d'attente</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => {
                    const holding = t.withdrawalEndDate != null && t.withdrawalEndDate.slice(0, 10) >= today;
                    return (
                      <tr key={t.id} className="border-t border-slate-100 align-top">
                        <Td>{treatmentPeriodLabel(t.administeredAt, t.endDate ?? null, dateFr)}</Td>
                        <Td label="Produit et motif" className="font-medium">
                          {t.productName}
                          {t.reason ? <span className="block text-xs font-normal text-slate-600">Motif : {t.reason}</span> : null}
                          {t.notes ? <span className="block text-xs font-normal text-slate-500">{t.notes}</span> : null}
                        </Td>
                        <Td label="Type">{CARE_TYPE_LABEL[t.careType]}</Td>
                        <Td label="Animaux" className="md:max-lg:hidden">
                          {t.animalCount != null ? num(t.animalCount) : '—'}
                        </Td>
                        <Td label="Voie et dosage" className="md:max-lg:hidden">
                          {[t.route, t.dosage].filter(Boolean).join(' · ') || '—'}
                        </Td>
                        <Td label="Fin d'attente">
                          {t.withdrawalEndDate && t.withdrawalDays > 0 ? (
                            <Pill tone={holding ? 'amber' : 'slate'}>{dateFr(t.withdrawalEndDate)}</Pill>
                          ) : (
                            '—'
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
          )}
        </SectionCard>
      </div>
      {canRecord ? (
      <SectionCard title="Enregistrer un traitement" icon={<Syringe />}>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Type de soin">
            <select className={inputCls} value={careType} onChange={(e) => setCareType(e.target.value as CareType)}>
              {CARE_TYPES.map((c) => (
                <option key={c} value={c}>
                  {CARE_TYPE_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
          {productList && productList.length > 0 ? (
            <IconField label="Produit *" icon={<PillIcon />}>
              <select className={inputCls} value={productCode} onChange={(e) => setProductCode(e.target.value)} required>
                <option value="">Choisir dans la liste des vétérinaires</option>
                {productList.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.label}
                  </option>
                ))}
              </select>
            </IconField>
          ) : (
            <>
              <IconField label="Produit *" icon={<PillIcon />}>
                <input
                  className={inputCls}
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  disabled={productList === undefined && products.isLoading}
                  required
                />
              </IconField>
              {productList === undefined && products.isLoading ? null : (
                <Note tone="amber" icon={<AlertTriangle />}>
                  {productList === null ? UNKNOWN_PRODUCT_LIST_NOTE : EMPTY_PRODUCT_LIST_NOTE}
                </Note>
              )}
            </>
          )}
          <Field label="Motif *">
            <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. : diarrhée, prévention" required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <IconField label="Début *" icon={<Calendar />}>
              <DateInput className={inputCls} max={today} value={administeredAt} onChange={(e) => setAdministeredAt(e.target.value)} required />
            </IconField>
            <IconField label="Fin" icon={<Calendar />}>
              <DateInput className={inputCls} min={administeredAt} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </IconField>
            <IconField label="Animaux traités *" icon={<Bird />}>
              <input className={inputCls} inputMode="numeric" value={animalCount} onChange={(e) => setAnimalCount(e.target.value.replace(/\D/g, ''))} required />
            </IconField>
            <Field label="Délai d'attente (j)">
              <input className={inputCls} inputMode="numeric" value={withdrawal} onChange={(e) => setWithdrawal(e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field label="Dosage">
              <input className={inputCls} value={dosage} onChange={(e) => setDosage(e.target.value)} />
            </Field>
            <Field label="Voie">
              <input className={inputCls} value={route} onChange={(e) => setRoute(e.target.value)} />
            </Field>
          </div>
          {holdUntil ? (
            <p className="text-xs text-amber-700">Vente suspendue jusqu'au {dateFr(holdUntil)} (délai compté depuis le dernier jour du traitement).</p>
          ) : null}
          <Field label="Notes">
            <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <ErrorNote error={formError ?? add.error} />
          <Button type="submit" busy={add.isPending}>
            <Check className="h-4 w-4" /> Enregistrer
          </Button>
        </form>
      </SectionCard>
      ) : null}
    </div>
  );
}

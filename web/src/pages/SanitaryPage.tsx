import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, ShieldPlus, Syringe } from 'lucide-react';
import { api } from '../api/client';
import type {
  BatchHealth,
  CareType,
  HealthEvent,
  Lot,
  ProphylaxisEvent,
  SanitaryProtocol,
  TreatmentRecord,
} from '../api/types-flock';
import { useFarm } from '../app/FarmContext';
import { BarChart } from '../components/Charts';
import { ConfirmModal, EditScheduleModal, HealthEventModal, PlanCareModal } from '../components/flock/SanitaryModals';
import {
  CARE_STATUS_LABEL,
  CARE_TYPES,
  CARE_TYPE_LABEL,
  HEALTH_KIND_LABEL,
  LEVEL_LABEL,
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
  levelTone,
  localYmd,
  lotOption,
  useAsyncAction,
  useInvalidateFarm,
  useLots,
  utcYmd,
} from '../components/flock/shared';
import { Button, ErrorNote, Field, inputCls } from '../components/form';
import { EmptyState, Loading, PageHeader, Td, Th } from '../components/ui';
import { dateFr, num } from '../lib/format';

type TabKey = 'sante' | 'check' | 'maladies' | 'calendrier' | 'traitements';

const STATUS_RANK: Record<string, number> = { EN_RETARD: 0, PLANIFIE: 1, FAIT: 2, ANNULE: 3 };

export function SanitaryPage() {
  const { farmId } = useFarm();
  const [params, setParams] = useSearchParams();
  const lots = useLots();
  const active = useMemo(() => (lots.data ?? []).filter((b) => b.status === 'ACTIF' || b.status === 'EN_VENTE'), [lots.data]);
  const [picked, setPicked] = useState(params.get('lot') ?? '');
  const [tab, setTab] = useState<TabKey>('sante');
  const [period, setPeriod] = useState<Period>(LIVE_PERIOD);
  const [planning, setPlanning] = useState(false);
  const [reporting, setReporting] = useState(false);
  const lot = active.find((b) => b.id === picked) ?? active[0] ?? null;

  // The lot page deep-links here to open the planning form directly.
  const wantsPlan = params.get('plan') === '1';
  useEffect(() => {
    if (wantsPlan && lots.isSuccess) {
      setPlanning(true);
      const lotParam = params.get('lot');
      setParams(lotParam ? { lot: lotParam } : {}, { replace: true });
    }
  }, [wantsPlan, lots.isSuccess, params, setParams]);

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
        subtitle="Santé des lots, soins et traitements"
        actions={
          <div className="flex gap-2">
            <Button tone="secondary" disabled={!lot} onClick={() => setReporting(true)}>
              <Plus className="h-4 w-4" /> Signaler un événement
            </Button>
            <Button disabled={active.length === 0} onClick={() => setPlanning(true)}>
              <Syringe className="h-4 w-4" /> Planifier un soin
            </Button>
          </div>
        }
      />
      <ErrorNote error={lots.error} />
      {lots.isLoading ? (
        <Loading label="Chargement des lots…" />
      ) : !lot ? (
        <EmptyState message="Aucun lot actif : créez un lot pour suivre sa santé." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <select className={`${inputCls} !w-[30rem] max-w-full`} aria-label="Lot" value={lot.id} onChange={(e) => setPicked(e.target.value)}>
              {active.map((b) => (
                <option key={b.id} value={b.id}>
                  {lotOption(b)}
                </option>
              ))}
            </select>
            <PeriodBar value={period} onChange={setPeriod} />
          </div>
          <Tabs<TabKey>
            value={tab}
            onChange={setTab}
            options={[
              { key: 'sante', label: 'Santé' },
              { key: 'check', label: 'Check' },
              { key: 'maladies', label: 'Maladies' },
              { key: 'calendrier', label: 'Calendrier' },
              { key: 'traitements', label: 'Traitements' },
            ]}
          />
          {tab === 'sante' ? <HealthPanel lot={lot} health={health.data} loading={health.isLoading} error={health.error} events={prophylaxis.data ?? []} /> : null}
          {tab === 'check' ? <CheckPanel health={health.data} loading={health.isLoading} /> : null}
          {tab === 'maladies' ? <EventsPanel lot={lot} period={period} onAdd={() => setReporting(true)} /> : null}
          {tab === 'calendrier' ? <CalendarPanel lot={lot} events={prophylaxis.data} loading={prophylaxis.isLoading} error={prophylaxis.error} period={period} onPlan={() => setPlanning(true)} /> : null}
          {tab === 'traitements' ? <TreatmentsPanel lot={lot} period={period} /> : null}
        </>
      )}
      {planning ? <PlanCareModal lots={active} initialLotId={lot?.id} onClose={() => setPlanning(false)} /> : null}
      {reporting && lot ? <HealthEventModal lot={lot} onClose={() => setReporting(false)} /> : null}
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
  lot: Lot;
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
        <SectionCard title="État du lot" subtitle={`J${health.ageDays}`}>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Metric label="Score de santé" value={`${num(score, 0)} / 100`} tone={score >= 80 ? 'good' : score >= 60 ? 'warn' : 'bad'} />
            <Metric label="Vivants" value={num(health.liveCount)} />
            <Metric label="Mortalité" value={`${num(health.mortalityPercent)} %`} />
            <Metric label="Viabilité" value={`${num(health.viabilityPercent)} %`} />
            <Metric label="Indice de consommation" value={health.fcr != null ? num(health.fcr, 2) : '—'} />
            <Metric label="Aliment / oiseau" value={`${num(health.feedPerBirdGrams, 0)} g`} />
            <Metric label="Eau / oiseau" value={health.waterLPerBird != null ? `${num(health.waterLPerBird, 2)} L` : '—'} />
            {isLayer ? (
              <Metric label="Taux de ponte" value={health.layRatePercent != null ? `${num(health.layRatePercent)} %` : '—'} sub={`${num(health.trays, 0)} alvéoles`} />
            ) : null}
          </div>
        </SectionCard>
        <div className="grid gap-4 md:grid-cols-2">
          <SectionCard title="Mortalité sur 7 jours">
            <BarChart data={health.trends.mortality} labels={health.trends.dates.map((d) => d.slice(8, 10))} height={140} color="#dc2626" />
          </SectionCard>
          {isLayer ? (
            <SectionCard title="Œufs sur 7 jours">
              <BarChart data={health.trends.eggs} labels={health.trends.dates.map((d) => d.slice(8, 10))} height={140} color="#d97706" />
            </SectionCard>
          ) : null}
        </div>
      </div>
      <div className="space-y-4">
        <SectionCard title="Soins">
          <div className="grid grid-cols-2 gap-2">
            <Metric label="En retard" value={late.length} tone={late.length > 0 ? 'bad' : 'good'} />
            <Metric label="Sous 7 jours" value={soon.length} tone={soon.length > 0 ? 'warn' : undefined} />
          </div>
        </SectionCard>
        <SectionCard title="Conseils et alertes">
          {health.tips.length === 0 ? (
            <p className="text-sm text-slate-500">Rien à signaler.</p>
          ) : (
            <div className="space-y-2">
              {health.tips.map((t) => (
                <Note key={t.text} tone={levelTone(t.level)}>
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
      <SectionCard title="Constats">
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
      <SectionCard title="Recommandations">
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

function EventsPanel({ lot, period, onAdd }: { lot: Lot; period: Period; onAdd: () => void }) {
  const { farmId } = useFarm();
  const invalidate = useInvalidateFarm();
  const action = useAsyncAction();
  const [toDelete, setToDelete] = useState<HealthEvent | null>(null);
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
      flush
      actions={
        <Button tone="secondary" onClick={onAdd}>
          <Plus className="h-4 w-4" /> Signaler
        </Button>
      }
    >
      <ErrorNote error={events.error ?? action.error} />
      {events.isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <div className="p-4">
          <EmptyState message="Aucun événement de santé sur cette période." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
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
                  <Td>{HEALTH_KIND_LABEL[e.kind]}</Td>
                  <Td className="max-w-md">
                    <span className="font-medium">{e.title}</span>
                    {e.symptoms ? <span className="block text-xs text-slate-500">Symptômes : {e.symptoms}</span> : null}
                    {e.description ? <span className="block text-xs text-slate-500">{e.description}</span> : null}
                    {e.treatmentGiven ? <span className="block text-xs text-slate-500">Traitement : {e.treatmentGiven}</span> : null}
                    {e.vetConsulted ? (
                      <span className="block text-xs text-slate-500">Vétérinaire consulté{e.vetName ? ` : ${e.vetName}` : ''}</span>
                    ) : null}
                    {e.notes ? <span className="block text-xs text-slate-500">{e.notes}</span> : null}
                  </Td>
                  <Td>{e.quantity > 0 ? num(e.quantity, 0) : '—'}</Td>
                  <Td>
                    <Pill tone={levelTone(e.severity)}>{LEVEL_LABEL[e.severity]}</Pill>
                  </Td>
                  <Td>
                    <Pill tone={e.status === 'RESOLU' ? 'emerald' : 'amber'}>{e.status === 'RESOLU' ? 'Résolu' : 'En cours'}</Pill>
                  </Td>
                  <Td className="whitespace-nowrap text-right">
                    {e.status !== 'RESOLU' ? (
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
                        Résoudre
                      </Button>
                    ) : null}
                    <Button tone="secondary" onClick={() => setToDelete(e)}>
                      Supprimer
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {toDelete ? (
        <ConfirmModal
          title="Supprimer cet événement ?"
          message={
            toDelete.kind === 'REFORME'
              ? "La suppression d'un abattage réintègre ces oiseaux dans l'effectif vivant."
              : `« ${toDelete.title} » sera définitivement supprimé.`
          }
          confirmLabel="Supprimer"
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
  lot: Lot;
  events: ProphylaxisEvent[] | undefined;
  loading: boolean;
  error: unknown;
  period: Period;
  onPlan: () => void;
}) {
  const { farmId } = useFarm();
  const invalidate = useInvalidateFarm();
  const action = useAsyncAction();
  const [editing, setEditing] = useState<ProphylaxisEvent | null>(null);
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
      flush
      actions={
        <div className="flex flex-wrap items-center gap-2">
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
          <Button onClick={onPlan}>
            <Syringe className="h-4 w-4" /> Planifier
          </Button>
        </div>
      }
    >
      <ErrorNote error={error ?? generate.error ?? action.error} />
      {loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <div className="p-4">
          <EmptyState message="Aucun soin sur cette période. Générez le calendrier ou planifiez un soin." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
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
                      {e.completedAt ? <span className="block text-xs text-slate-500">fait le {dateFr(e.completedAt)}</span> : null}
                    </Td>
                    <Td className="font-medium">{e.name}</Td>
                    <Td>{CARE_TYPE_LABEL[e.careType]}</Td>
                    <Td>{[e.route, e.dosage].filter(Boolean).join(' · ') || '—'}</Td>
                    <Td>
                      <Pill>{e.protocolId ? 'Programme' : 'Manuel'}</Pill>
                      {e.decrementStock ? (
                        <span className="ml-1">
                          <Pill tone="brand">Stock</Pill>
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <Pill tone={e.status === 'FAIT' ? 'emerald' : e.status === 'EN_RETARD' ? 'red' : e.status === 'ANNULE' ? 'slate' : 'brand'}>
                        {CARE_STATUS_LABEL[e.status]}
                      </Pill>
                    </Td>
                    <Td className="whitespace-nowrap text-right">
                      {open ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            busy={action.busy === `c-${e.id}`}
                            onClick={() =>
                              run(`c-${e.id}`, () => api.post(`${base}/prophylaxis/${e.id}/complete`, { completedAt: utcYmd() }))
                            }
                          >
                            Fait
                          </Button>
                          <Button
                            tone="secondary"
                            busy={action.busy === `p-${e.id}`}
                            onClick={() =>
                              run(`p-${e.id}`, () =>
                                api.patch(`${base}/prophylaxis/${e.id}`, { scheduledDate: addUtcDays(e.scheduledDate, 1) }),
                              )
                            }
                          >
                            +1 j
                          </Button>
                          <Button tone="secondary" onClick={() => setEditing(e)}>
                            Modifier
                          </Button>
                          <Button tone="secondary" onClick={() => setConfirm({ kind: 'cancel', event: e })}>
                            Annuler
                          </Button>
                          <Button tone="secondary" onClick={() => setConfirm({ kind: 'delete', event: e })}>
                            Supprimer
                          </Button>
                        </div>
                      ) : null}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing ? <EditScheduleModal lot={lot} event={editing} onClose={() => setEditing(null)} /> : null}
      {confirm ? (
        <ConfirmModal
          title={confirm.kind === 'cancel' ? 'Annuler ce soin ?' : 'Supprimer ce soin ?'}
          message={
            confirm.kind === 'cancel'
              ? `« ${confirm.event.name} » restera dans l'historique, marqué comme annulé.`
              : `« ${confirm.event.name} » sera définitivement retiré du calendrier.`
          }
          confirmLabel={confirm.kind === 'cancel' ? 'Annuler le soin' : 'Supprimer'}
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

function TreatmentsPanel({ lot, period }: { lot: Lot; period: Period }) {
  const { farmId } = useFarm();
  const invalidate = useInvalidateFarm();
  const [careFilter, setCareFilter] = useState<'all' | CareType>('all');
  const [careType, setCareType] = useState<CareType>('ANTIBIOTIQUE');
  const [productName, setProductName] = useState('');
  const [dosage, setDosage] = useState('');
  const [route, setRoute] = useState('');
  const [administeredAt, setAdministeredAt] = useState(localYmd());
  const [withdrawal, setWithdrawal] = useState('');
  const [notes, setNotes] = useState('');

  const treatments = useQuery({
    queryKey: ['treatments', farmId, lot.id],
    queryFn: () => api.get<TreatmentRecord[]>(`/farms/${farmId}/batches/${lot.id}/treatments`),
    enabled: !!farmId,
  });
  const add = useMutation({
    mutationFn: () =>
      api.post(`/farms/${farmId}/batches/${lot.id}/treatments`, {
        careType,
        productName: productName.trim(),
        dosage: dosage.trim() || undefined,
        route: route.trim() || undefined,
        administeredAt,
        withdrawalDays: parseInt(withdrawal, 10) || 0,
        notes: notes.trim() || undefined,
      }),
    onSuccess: async () => {
      await invalidate();
      setProductName('');
      setDosage('');
      setRoute('');
      setWithdrawal('');
      setNotes('');
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (productName.trim()) add.mutate();
  };

  const rows = (treatments.data ?? []).filter(
    (t) => inPeriod(period, t.administeredAt) && (careFilter === 'all' || t.careType === careFilter),
  );
  const today = localYmd();

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <SectionCard
          title="Historique des traitements"
          flush
          actions={
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
          }
        >
          <ErrorNote error={treatments.error} />
          {treatments.isLoading ? (
            <Loading />
          ) : rows.length === 0 ? (
            <div className="p-4">
              <EmptyState message="Aucun traitement sur cette période." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Date</Th>
                    <Th>Produit</Th>
                    <Th>Type</Th>
                    <Th>Voie et dosage</Th>
                    <Th>Fin d'attente</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => {
                    const holding = t.withdrawalEndDate != null && t.withdrawalEndDate.slice(0, 10) >= today;
                    return (
                      <tr key={t.id} className="border-t border-slate-100 align-top">
                        <Td>{dateFr(t.administeredAt)}</Td>
                        <Td className="font-medium">
                          {t.productName}
                          {t.notes ? <span className="block text-xs font-normal text-slate-500">{t.notes}</span> : null}
                        </Td>
                        <Td>{CARE_TYPE_LABEL[t.careType]}</Td>
                        <Td>{[t.route, t.dosage].filter(Boolean).join(' · ') || '—'}</Td>
                        <Td>
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
              </table>
            </div>
          )}
        </SectionCard>
      </div>
      <SectionCard title="Enregistrer un traitement">
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
          <Field label="Produit *">
            <input className={inputCls} value={productName} onChange={(e) => setProductName(e.target.value)} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dosage">
              <input className={inputCls} value={dosage} onChange={(e) => setDosage(e.target.value)} />
            </Field>
            <Field label="Voie">
              <input className={inputCls} value={route} onChange={(e) => setRoute(e.target.value)} />
            </Field>
            <Field label="Date *">
              <input className={inputCls} type="date" max={today} value={administeredAt} onChange={(e) => setAdministeredAt(e.target.value)} required />
            </Field>
            <Field label="Délai d'attente (j)">
              <input className={inputCls} inputMode="numeric" value={withdrawal} onChange={(e) => setWithdrawal(e.target.value.replace(/\D/g, ''))} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <ErrorNote error={add.error} />
          <Button type="submit" busy={add.isPending} disabled={!productName.trim()}>
            Enregistrer
          </Button>
        </form>
      </SectionCard>
    </div>
  );
}

import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bell,
  Bird,
  CircleCheck,
  ClipboardCheck,
  Droplets,
  Medal,
  NotebookPen,
  Sun,
  Thermometer,
  Wallet,
  Wheat,
} from 'lucide-react';
import { api } from '../api/client';
import type { AdvisoryResponse, CaisseSummary, FarmTask, FlockDashboard } from '../api/types-flock';
import { useFarm } from '../app/FarmContext';
import { useFarmProfile } from '../app/useFarmProfile';
import { useCanRead } from '../app/useMenuAccess';
import { showsCollectedToday } from '../app/economicVisibility';
import { buildActionQueue, buildJournal } from '../components/flock/activityFeed';
import { Metric, Pill, Tabs, levelTone } from '../components/flock/shared';
import { ErrorNote } from '../components/form';
import { Card, DataTable, EmptyState, IconTile, Loading, PageHeader, Td, Th, type IconTone } from '../components/ui';
import { dateTimeFr, fcfa, num } from '../lib/format';

type Panel = 'taches' | 'lots' | 'caisse' | 'rapports';

const SOURCE_LABEL: Record<string, string> = {
  SALE_PAYMENT: 'Vente',
  MANUAL: 'Manuel',
  REFUND: 'Remboursement',
  EXPENSE: 'Dépense',
};
const KIND_LABEL = { saisie: 'Saisie', tache: 'Tâche', alerte: 'Alerte' };
const KIND_ICON = {
  saisie: <NotebookPen className="h-4 w-4" />,
  tache: <ClipboardCheck className="h-4 w-4" />,
  alerte: <Bell className="h-4 w-4" />,
};
const KIND_TONE: Record<keyof typeof KIND_LABEL, IconTone> = { saisie: 'brand', tache: 'green', alerte: 'red' };

const ZONE_LABEL: Record<string, string> = {
  CONFORT: 'Confort thermique',
  PRUDENCE: 'Prudence',
  MODERE: 'Stress modéré',
  SEVERE: 'Stress sévère',
  DANGER: 'Danger canicule',
};
const zoneLabel = (z: string) => ZONE_LABEL[z] ?? 'Prévision météo';

const moreLink = (to: string, label: string) => (
  <Link to={to} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
    {label} <ArrowRight className="h-3.5 w-3.5" />
  </Link>
);

const iconValue = (icon: ReactNode, value: ReactNode) => (
  <span className="inline-flex items-center gap-1.5">
    {icon}
    {value}
  </span>
);

function SectionCard({
  title,
  subtitle,
  icon,
  actions,
  children,
  flush = false,
}: {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <Card className={flush ? 'overflow-hidden' : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <IconTile icon={icon} size="sm" />
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

const deltaText = (v: number | null | undefined, unit: string, digits = 1) =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${num(v, digits)}${unit}`;

export function ActivitiesPage() {
  const { farmId } = useFarm();
  const { hasPermission } = useFarmProfile();
  // The cash register is Fermia-only (VENTES).
  const canRead = useCanRead();
  const canReadCash = canRead('VENTES');
  const canCaisse = hasPermission('caisse:lire') && canReadCash;
  const [panel, setPanel] = useState<Panel>('taches');
  const [span, setSpan] = useState<7 | 30 | 90>(7);

  const dashboard = useQuery({
    queryKey: ['dashboard', farmId],
    queryFn: () => api.get<FlockDashboard>(`/farms/${farmId}/dashboard`),
    enabled: !!farmId,
  });
  const tasks = useQuery({
    queryKey: ['tasks', farmId],
    queryFn: () => api.get<FarmTask[]>(`/farms/${farmId}/tasks`),
    enabled: !!farmId,
  });
  const advisory = useQuery({
    queryKey: ['advisory', farmId],
    queryFn: () => api.get<AdvisoryResponse>(`/farms/${farmId}/advisory/next-actions`),
    enabled: !!farmId,
    retry: false,
  });
  const caisse = useQuery({
    queryKey: ['caisse-current', farmId],
    queryFn: () => api.get<CaisseSummary>(`/farms/${farmId}/caisse/current`),
    enabled: !!farmId && canCaisse,
    retry: false,
  });

  const d = dashboard.data;
  const queue = useMemo(
    () => buildActionQueue({ healthOverview: d?.healthOverview, tasks: tasks.data, alerts: advisory.data?.actions }),
    [d?.healthOverview, tasks.data, advisory.data?.actions],
  );
  const journal = useMemo(
    () =>
      buildJournal({
        healthOverview: d?.healthOverview,
        tasks: tasks.data,
        alerts: advisory.data?.actions,
        generatedAt: advisory.data?.generatedAt,
        sinceDays: span,
      }),
    [d?.healthOverview, tasks.data, advisory.data, span],
  );
  const counts = useMemo(() => {
    const list = tasks.data ?? [];
    return {
      todo: list.filter((t) => t.status === 'A_FAIRE').length,
      doing: list.filter((t) => t.status === 'EN_COURS').length,
      done: list.filter((t) => t.status === 'FAIT').length,
    };
  }, [tasks.data]);

  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const title = today.charAt(0).toUpperCase() + today.slice(1);

  if (dashboard.isLoading) return <Loading label="Chargement de l'activité…" />;
  if (!d) {
    return (
      <div className="space-y-5">
        <PageHeader title="Activités" subtitle="Journal et opérations" icon={<NotebookPen className="h-6 w-6" />} />
        <ErrorNote error={dashboard.error} />
      </div>
    );
  }
  const c = caisse.data;
  const w = d.weather;

  return (
    <div className="space-y-5">
      <PageHeader title="Activités" subtitle={title} icon={<NotebookPen className="h-6 w-6" />} />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {showsCollectedToday(d.collectedTodayFcfa, canRead) ? (
          <Metric label="Encaissé aujourd'hui" value={iconValue(<Wallet className="h-4 w-4 text-slate-400" />, fcfa(d.collectedTodayFcfa))} />
        ) : null}
        <Metric label="Stock vivant" value={iconValue(<Bird className="h-4 w-4 text-slate-400" />, num(d.liveStock))} />
        <Metric
          label="Autonomie aliment"
          value={iconValue(<Wheat className="h-4 w-4 text-slate-400" />, d.feedAutonomyDays != null ? `${num(d.feedAutonomyDays)} j` : '—')}
        />
        <Metric
          label="Mortalité"
          value={iconValue(<Activity className="h-4 w-4 text-slate-400" />, d.mortalityPercent != null ? `${num(d.mortalityPercent)} %` : '—')}
        />
        <Metric label="Alertes critiques" value={iconValue(<AlertTriangle className="h-4 w-4" />, d.alerts.rouge)} tone={d.alerts.rouge > 0 ? 'bad' : 'good'} />
      </div>
      <Tabs<Panel>
        value={panel}
        onChange={setPanel}
        options={[
          { key: 'taches', label: 'Tâches' },
          { key: 'lots', label: 'Lots' },
          ...(canCaisse ? [{ key: 'caisse' as const, label: 'Caisse' }] : []),
          { key: 'rapports', label: 'Rapports' },
        ]}
      />

      {panel === 'taches' ? (
        <>
          <ErrorNote error={tasks.error ?? advisory.error} />
          <div className="grid grid-cols-3 gap-2">
            <Metric label="À faire" value={counts.todo} />
            <Metric label="En cours" value={counts.doing} />
            <Metric label="Terminées" value={counts.done} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard
              title="À traiter"
              icon={<NotebookPen className="h-4 w-4" />}
              subtitle={queue.length > 0 ? `${queue.length} action${queue.length > 1 ? 's' : ''} en attente` : 'Aucune action requise'}
              actions={moreLink('/app/tasks', 'Ouvrir le planning complet')}
            >
              {queue.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-slate-500">
                  <CircleCheck className="h-4 w-4 text-emerald-600" /> Tout est à jour.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {queue.map((a) => (
                    <li key={a.id} className="py-2">
                      <Link to={a.href} className="flex items-start justify-between gap-3 hover:opacity-80">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <IconTile icon={KIND_ICON[a.kind]} tone={a.priority === 'CRITIQUE' ? 'red' : 'amber'} size="sm" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800">{a.title}</p>
                            <p className="text-xs text-slate-500">{a.detail}</p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {a.badge ? <span className="text-xs text-slate-500">{a.badge}</span> : null}
                          <Pill tone={a.priority === 'CRITIQUE' ? 'red' : 'amber'}>{a.priority === 'CRITIQUE' ? 'Critique' : 'Important'}</Pill>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
            <SectionCard
              title="Activité récente"
              icon={<ClipboardCheck className="h-4 w-4" />}
              actions={
                <Tabs
                  value={String(span) as '7' | '30' | '90'}
                  onChange={(k) => setSpan(Number(k) as 7 | 30 | 90)}
                  options={[
                    { key: '7', label: '7 jours' },
                    { key: '30', label: '30 jours' },
                    { key: '90', label: '90 jours' },
                  ]}
                />
              }
            >
              {journal.groups.length === 0 ? (
                <p className="text-sm text-slate-500">Rien sur cette période.</p>
              ) : (
                <div className="space-y-3">
                  {journal.groups.map((g) => (
                    <div key={g.key}>
                      <p className="mb-1 text-xs font-semibold text-slate-500">{g.label}</p>
                      <ul className="space-y-2">
                        {g.entries.map((e) => (
                          <li key={e.id} className="flex items-start justify-between gap-3 text-sm">
                            <div className="flex min-w-0 items-start gap-2.5">
                              <IconTile icon={KIND_ICON[e.kind]} tone={KIND_TONE[e.kind]} size="sm" />
                              <div className="min-w-0">
                                {e.href ? (
                                  <Link to={e.href} className="font-medium text-slate-800 hover:underline">
                                    {e.title}
                                  </Link>
                                ) : (
                                  <span className="font-medium text-slate-800">{e.title}</span>
                                )}
                                <p className="text-xs text-slate-500">{e.detail}</p>
                              </div>
                            </div>
                            <Pill>{KIND_LABEL[e.kind]}</Pill>
                          </li>
                        ))}
                      </ul>
                      {g.totalEntries > g.entries.length ? (
                        <p className="mt-1 text-xs text-slate-400">et {g.totalEntries - g.entries.length} autre(s)</p>
                      ) : null}
                    </div>
                  ))}
                  {journal.truncatedGroups > 0 ? (
                    <p className="text-xs text-slate-400">
                      {journal.truncatedGroups} jour(s) plus ancien(s) non affiché(s).
                    </p>
                  ) : null}
                </div>
              )}
            </SectionCard>
          </div>
        </>
      ) : null}

      {panel === 'lots' ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Stock vivant" value={num(d.liveStock)} />
            <Metric label="Lots actifs" value={d.batches.actif} />
            <Metric label="En vente" value={d.batches.enVente} />
          </div>
          <SectionCard title="État des lots" icon={<NotebookPen className="h-4 w-4" />} flush actions={moreLink('/app/batches', 'Gérer les lots')}>
            {d.healthOverview.length === 0 ? (
              <div className="p-4">
                <EmptyState message="Aucun lot actif." icon={<Bird className="h-6 w-6" />} />
              </div>
            ) : (
              <DataTable>
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>Lot</Th>
                      <Th>Âge</Th>
                      <Th>Vivants</Th>
                      <Th className="hidden lg:table-cell">Morts (semaine)</Th>
                      <Th>Mortalité</Th>
                      <Th>Alertes</Th>
                      <Th>Dernière saisie</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.healthOverview.map((r) => (
                      <tr key={r.batchId} className="border-t border-slate-100">
                        <Td className="font-medium">
                          <Link to={`/app/batches?lot=${r.batchId}`} className="text-brand-700 hover:underline">
                            {r.batchName ?? 'Lot sans nom'}
                          </Link>
                        </Td>
                        <Td label="Âge">J{r.ageDays}</Td>
                        <Td label="Vivants">{num(r.liveCount)}</Td>
                        <Td label="Morts (semaine)" className="md:max-lg:hidden">{num(r.weekDeaths, 0)}</Td>
                        <Td label="Mortalité">{num(r.mortalityPercent)} %</Td>
                        <Td label="Alertes">
                          {r.alertesRouges > 0 ? <Pill tone={levelTone('ROUGE')}>{r.alertesRouges} critiques</Pill> : null}{' '}
                          {r.alertesJaunes > 0 ? <Pill tone={levelTone('JAUNE')}>{r.alertesJaunes} à surveiller</Pill> : null}
                          {r.alertesRouges + r.alertesJaunes === 0 ? '—' : null}
                        </Td>
                        <Td label="Dernière saisie">
                          {r.lastEntryLagDays == null ? (
                            <Pill tone="amber">Aucune saisie</Pill>
                          ) : r.lastEntryLagDays > 0 ? (
                            <Pill tone={r.lastEntryLagDays >= 3 ? 'red' : 'amber'}>Aucune saisie depuis {r.lastEntryLagDays} j</Pill>
                          ) : (
                            <Pill tone="emerald">À jour</Pill>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
            )}
          </SectionCard>
        </>
      ) : null}

      {panel === 'caisse' && canCaisse ? (
        <SectionCard
          title="Caisse du jour"
          icon={<Wallet className="h-4 w-4" />}
          actions={moreLink('/app/finance/caisse', 'Ouvrir la caisse')}
        >
          {c ? (
            <div className="space-y-3">
              <Pill tone={c.session.status === 'OPEN' ? 'emerald' : 'slate'}>
                {c.session.status === 'OPEN' ? 'Session ouverte' : 'Session fermée'}
              </Pill>
              <div className="grid grid-cols-3 gap-2">
                <Metric label="Entrées" value={iconValue(<ArrowDown className="h-4 w-4" />, fcfa(c.inFcfa))} tone="good" />
                <Metric label="Sorties" value={iconValue(<ArrowUp className="h-4 w-4" />, fcfa(c.outFcfa))} tone="bad" />
                <Metric label="Solde" value={iconValue(<Wallet className="h-4 w-4 text-slate-400" />, fcfa(c.expectedBalanceFcfa))} />
              </div>
              {c.movements.length === 0 ? (
                <p className="text-sm text-slate-500">Aucun mouvement enregistré sur cette session.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {c.movements.slice(0, 10).map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <IconTile
                          icon={m.type === 'IN' ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
                          tone={m.type === 'IN' ? 'green' : 'red'}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-800">{m.reason ?? SOURCE_LABEL[m.source] ?? 'Mouvement'}</p>
                          <p className="text-xs text-slate-500">
                            {SOURCE_LABEL[m.source] ?? 'Autre'} · {dateTimeFr(m.createdAt)}
                          </p>
                        </div>
                      </div>
                      <span className={m.type === 'IN' ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600'}>
                        {m.type === 'IN' ? '+' : '−'}
                        {fcfa(m.amountFcfa)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : caisse.isLoading ? (
            <Loading />
          ) : (
            <p className="text-sm text-slate-500">Aucune session de caisse aujourd'hui.</p>
          )}
        </SectionCard>
      ) : null}

      {panel === 'rapports' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard
            title="Cette semaine"
            subtitle="Comparé à la semaine précédente"
            icon={<NotebookPen className="h-4 w-4" />}
            actions={hasPermission('compta:rapports') ? moreLink('/app/reports', 'Tous les rapports') : undefined}
          >
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Mortalité" value={num(d.deltas.mortalityThisWeek, 0)} sub={deltaText(d.deltas.mortalityDelta, ' morts', 0)} />
              <Metric
                label="Ponte"
                value={d.deltas.layRateThisWeekPct != null ? `${num(d.deltas.layRateThisWeekPct)} %` : '—'}
                sub={deltaText(d.deltas.layRateDeltaPct, ' pts')}
              />
              <Metric label="Aliment" value={`${num(d.deltas.feedThisWeekKg, 0)} kg`} sub={deltaText(d.deltas.feedDeltaKg, ' kg', 0)} />
              <Metric label="Bâtiments" value={d.buildingsCount} />
              <Metric label="Équipe" value={d.teamCount} />
              <Metric label="Alertes" value={d.alerts.total} />
            </div>
          </SectionCard>
          <SectionCard title="Météo" icon={<Sun className="h-4 w-4" />}>
            {w?.available && w.today ? (
              <div className="space-y-2">
                <Pill tone={levelTone(w.today.level)}>{zoneLabel(w.today.zone)}</Pill>
                <div className="grid grid-cols-3 gap-2">
                  <Metric label="Température" value={iconValue(<Thermometer className="h-4 w-4 text-slate-400" />, `${num(w.today.tempC, 0)} °C`)} />
                  <Metric label="Humidité" value={iconValue(<Droplets className="h-4 w-4 text-slate-400" />, `${num(w.today.humidityPct, 0)} %`)} />
                  <Metric label="Indice de chaleur" value={num(w.today.thi, 0)} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Météo indisponible.</p>
            )}
          </SectionCard>
          <div className="lg:col-span-2">
            <SectionCard title="Classement des lots" subtitle="Indice de performance" icon={<ClipboardCheck className="h-4 w-4" />} flush>
              {d.leaderboard.length === 0 ? (
                <div className="p-4">
                  <EmptyState message="Pas encore de classement." icon={<Medal className="h-6 w-6" />} />
                </div>
              ) : (
                <DataTable>
                    <thead className="bg-slate-50">
                      <tr>
                        <Th>Rang</Th>
                        <Th>Lot</Th>
                        <Th>Indice</Th>
                        <Th>IC</Th>
                        <Th>GMQ</Th>
                        <Th>Ponte</Th>
                        <Th>Mortalité</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.leaderboard.map((r, i) => (
                        <tr key={r.batchId} className="border-t border-slate-100">
                          <Td>{i + 1}</Td>
                          <Td label="Lot" className="font-medium">{r.batchName ?? 'Lot sans nom'}</Td>
                          <Td label="Indice">{r.perfIndex != null ? num(r.perfIndex, 0) : '—'}</Td>
                          <Td label="IC">{r.fcr != null ? num(r.fcr, 2) : '—'}</Td>
                          <Td label="GMQ">{r.gmqGramsPerDay != null ? `${num(r.gmqGramsPerDay, 0)} g/j` : '—'}</Td>
                          <Td label="Ponte">{r.layRatePercent != null ? `${num(r.layRatePercent)} %` : '—'}</Td>
                          <Td label="Mortalité">{num(r.mortalityPercent)} %</Td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
              )}
            </SectionCard>
          </div>
        </div>
      ) : null}
    </div>
  );
}

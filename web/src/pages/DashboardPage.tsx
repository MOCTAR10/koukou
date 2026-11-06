import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Activity,
  AlertTriangle,
  Banknote,
  Calendar,
  CalendarClock,
  LayoutDashboard,
  Medal,
  RotateCcw,
  ShieldAlert,
  Stethoscope,
  TrendingUp,
  Wheat,
  Users,
} from 'lucide-react';
import { api } from '../api/client';
import type { BatchCurve } from '../api/types';
import type {
  AdvisoryNextActions,
  CarcassPool,
  CustomerSummary,
  OverviewPnl,
  OwnerDashboard,
  PosBatch,
} from '../api/types-sales';
import { useFarm } from '../app/FarmContext';
import { useFarmProfile } from '../app/useFarmProfile';
import { Card, DataTable, EmptyState, Loading, PageHeader, PhotoThumb, StatCard, StatusBadge, Td, Th } from '../components/ui';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { Donut, LineChart } from '../components/Charts';
import { ErrorNote } from '../components/form';
import { ActionQueue, EggStockPanel, OwnerStats, PerformanceTiles, Ranking, WeatherCard } from '../components/sales/DashboardPanels';
import { CheptelModal, mainSpeciesImage } from '../components/flock/CheptelModal';
import { HEALTH_LABEL } from '../components/sales/labels';
import { batchPhoto } from '../components/sales/pos';
import { AlertLevelBadge } from '../components/sales/shared';
import { EGG_IMAGES } from '../lib/animalImages';
import { classNames, dateFr, fcfa, num, pct, statusLabel } from '../lib/format';
import { stagger, staggerItem } from '../lib/motion';
import { useMediaQuery } from '../lib/useMediaQuery';

/** Local calendar date (Gabon is UTC+1: toISOString is "yesterday" before 01:00). */
function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function localToday(): string {
  return localIso(new Date());
}

/** The n days up to today, oldest first. */
function lastDays(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(localIso(d));
  }
  return out;
}

/** Livestock only: the crops view (« Évolution ») is hidden on the POUFA instance. */
export function DashboardPage() {
  return (
    <div className="space-y-4">
      <LivestockDashboard />
    </div>
  );
}

function LivestockDashboard() {
  const { farmId } = useFarm();
  const { hasPermission } = useFarmProfile();
  const canReports = hasPermission('compta:rapports');
  const canClients = hasPermission('compta:client');
  const [selectedDate, setSelectedDate] = useState(localToday);
  const isToday = selectedDate === localToday();
  const dash = useQuery({
    queryKey: ['dashboard', farmId, selectedDate],
    queryFn: () => api.get<OwnerDashboard>(`/farms/${farmId}/dashboard?date=${selectedDate}`),
    enabled: !!farmId,
    refetchInterval: 60_000,
  });
  const [curveBatchId, setCurveBatchId] = useState<string>('');
  const [cheptelOpen, setCheptelOpen] = useState(false);
  // Two columns need the room: below this, the rail would squeeze the amounts in the main column.
  const wide = useMediaQuery('(min-width: 1440px)');

  const advisory = useQuery({
    queryKey: ['advisory', farmId],
    queryFn: () => api.get<AdvisoryNextActions>(`/farms/${farmId}/advisory/next-actions`),
    enabled: !!farmId,
  });
  const batches = useQuery({
    queryKey: ['batches', farmId, isToday ? '' : selectedDate],
    queryFn: () => api.get<PosBatch[]>(`/farms/${farmId}/batches${isToday ? '' : `?asOf=${selectedDate}`}`),
    enabled: !!farmId,
  });
  const slaughter = useQuery({
    queryKey: ['slaughter', farmId],
    queryFn: () => api.get<CarcassPool[]>(`/farms/${farmId}/slaughter-orders`),
    enabled: !!farmId,
  });
  const pnlFrom = lastDays(30)[0]!;
  const pnl = useQuery({
    queryKey: ['rentabilite', farmId, pnlFrom, selectedDate],
    queryFn: () => api.get<OverviewPnl>(`/farms/${farmId}/rentabilite/overview?from=${pnlFrom}&to=${selectedDate}`),
    enabled: !!farmId && canReports,
  });
  const clients = useQuery({
    queryKey: ['customers-summary', farmId],
    queryFn: () => api.get<CustomerSummary>(`/farms/${farmId}/customers/summary`),
    enabled: !!farmId && canClients,
  });
  const batchList = useMemo(() => batches.data ?? [], [batches.data]);
  // The backend has no daily egg series: sum the entries of the laying lots, as mobile does.
  const layerIds = batchList.filter((b) => b.status !== 'CLOTURE' && b.type === 'PONDEUSE').map((b) => b.id);
  const eggSeries = useQuery({
    queryKey: ['egg-daily-series', farmId, layerIds.join(',')],
    enabled: layerIds.length > 0,
    queryFn: async () => {
      const days = lastDays(7);
      const totals = new Map(days.map((date) => [date, 0]));
      const all = await Promise.all(
        layerIds.map((id) =>
          api.get<Array<{ entryDate: string; eggsCollected: number | null }>>(`/farms/${farmId}/batches/${id}/daily-entries`),
        ),
      );
      for (const entries of all) {
        for (const e of entries) {
          const day = e.entryDate.slice(0, 10);
          if (totals.has(day)) totals.set(day, (totals.get(day) ?? 0) + (e.eggsCollected ?? 0));
        }
      }
      return days.map((date) => ({ date, count: totals.get(date) ?? 0 }));
    },
  });

  const activeBatches = useMemo(
    () =>
      dash.data?.healthOverview.filter((b) => b.status !== 'CLOTURE') ?? [],
    [dash.data],
  );

  // Default to the first active lot, and ignore a choice left over from
  // another farm (it would request that farm's batch under this one).
  const selectedCurveBatch = activeBatches.some((b) => b.batchId === curveBatchId)
    ? curveBatchId
    : (activeBatches[0]?.batchId ?? '');

  const curve = useQuery({
    queryKey: ['curve', farmId, selectedCurveBatch],
    queryFn: () => api.get<BatchCurve>(`/farms/${farmId}/batches/${selectedCurveBatch}/curve`),
    enabled: !!farmId && !!selectedCurveBatch,
  });

  if (dash.isError) {
    return (
      <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
        Impossible de charger le tableau de bord : {(dash.error as Error).message}
      </p>
    );
  }
  if (dash.isLoading || !dash.data) {
    return <Loading label="Chargement du tableau de bord…" />;
  }

  const d = dash.data;
  const liveLots = batchList.filter((b) => b.status !== 'CLOTURE');
  // Dashboard rows carry no breed or species: the photo comes from the lot itself.
  const lotPhoto = (batchId: string) => batchPhoto(batchList.find((b) => b.id === batchId));

  const kpis = (
      <motion.div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 min-[1800px]:grid-cols-6"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={staggerItem}>
          <StatCard
            label="Cheptel vivant"
            value={<AnimatedNumber value={d.liveStock} format={num} />}
            hint={`${d.batches.actif} lot(s) actif(s) · Voir le détail`}
            image={mainSpeciesImage(liveLots)}
            onClick={() => setCheptelOpen(true)}
            actionLabel={`${num(d.liveStock)} oiseaux vivants, voir le cheptel`}
            tone="accent"
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            label="Mortalité"
            value={pct(d.mortalityPercent)}
            hint={`Viabilité ${d.viabilityPercent != null ? pct(d.viabilityPercent) : '—'}`}
            icon={<Activity className="h-5 w-5" />}
            tone={d.mortalityPercent != null && d.mortalityPercent > 5 ? 'bad' : 'default'}
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            label="Autonomie provende"
            value={d.feedAutonomyDays != null ? `${num(d.feedAutonomyDays)} j` : '—'}
            icon={<Wheat className="h-5 w-5" />}
            tone={d.feedAutonomyDays != null && d.feedAutonomyDays < 3 ? 'warn' : 'default'}
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            label="Encaissé du jour"
            value={<AnimatedNumber value={d.collectedTodayFcfa} format={fcfa} />}
            icon={<Banknote className="h-5 w-5" />}
            tone="good"
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            label="Équipe"
            value={num(d.teamCount)}
            icon={<Users className="h-5 w-5" />}
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            label="Œufs de stock"
            value={`${num(d.eggStock.availableAlveoles)} alv.`}
            hint={`~${num(d.eggStock.availableEggs)} œufs`}
            image={EGG_IMAGES.alveole}
            tone="accent"
          />
        </motion.div>
      </motion.div>
  );
  const health = (
        <Card className="p-4 lg:col-span-1 min-[1440px]:col-auto">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Stethoscope className="h-4 w-4 text-brand-600" /> Santé de la ferme
          </h2>
          <div className="flex items-center justify-around gap-4">
            <Donut
              value={d.health.score}
              total={100}
              label={HEALTH_LABEL[d.health.grade] ?? '—'}
            />
            <ul className="space-y-1.5 text-sm">
              <li className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> {d.health.breakdown.rouge} alerte(s) rouge(s)
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> {d.health.breakdown.jaune} alerte(s) jaune(s)
              </li>
              <li className="flex items-center gap-2">
                <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
                {d.health.breakdown.saisiesManquantes} saisie(s) manquante(s)
              </li>
            </ul>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
            <div className="rounded-lg bg-slate-50 py-2">
              <p className="text-slate-500">Mortalité (s.)</p>
              <p className={classNames('font-semibold', d.deltas.mortalityDelta > 0 ? 'text-red-600' : 'text-emerald-600')}>
                {d.deltas.mortalityThisWeek} ({d.deltas.mortalityDelta > 0 ? '+' : ''}
                {d.deltas.mortalityDelta})
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 py-2">
              <p className="text-slate-500">Aliment (s.)</p>
              <p className="font-semibold text-slate-700">
                {num(d.deltas.feedThisWeekKg)} kg
              </p>
            </div>
          </div>
        </Card>
  );
  const curve_card = (
        <Card className="p-4 lg:col-span-2 min-[1440px]:col-auto">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <TrendingUp className="h-4 w-4 text-brand-600" /> Courbe de croissance (poids moyen / IC)
            </h2>
            <select
              value={selectedCurveBatch}
              onChange={(e) => setCurveBatchId(e.target.value)}
              className="max-w-[220px] rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-brand-500"
            >
              {activeBatches.map((b) => (
                <option key={b.batchId} value={b.batchId}>
                  {b.batchName ?? 'Lot'}
                </option>
              ))}
            </select>
          </div>
          {curve.data?.weekly.length ? (
            <>
              <LineChart
                data={curve.data.weekly.map((w) => w.avgWeightKg ?? null)}
                labels={curve.data.weekly.map((w) =>
                  new Date(`${w.weekStart}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
                )}
                valueFmt={(v) => `${v.toFixed(2)} kg`}
              />
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500 sm:grid-cols-4">
                <div>Vivants : <b>{num(curve.data.liveCount)}</b></div>
                <div>Poids J1 : <b>{curve.data.startWeightKg} kg</b></div>
                <div>
                  IC cumulé :{' '}
                  <b>{curve.data.weekly[curve.data.weekly.length - 1]?.fcrCumulative ?? '—'}</b>
                </div>
                <div>
                  Semaines : <b>{curve.data.weekly.length}</b>
                </div>
              </div>
            </>
          ) : (
            <EmptyState message="Pas encore de données de croissance (saisies hebdomadaires)." icon={<TrendingUp className="h-6 w-6" />} />
          )}
        </Card>
  );
  const tables_row = (
      <div className="grid gap-4 min-[1360px]:grid-cols-2 min-[1440px]:grid-cols-1 min-[1800px]:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Medal className="h-4 w-4 text-brand-600" /> Palmarès des lots
            </h2>
          </div>
          <DataTable>
              <thead className="bg-slate-50">
                <tr>
                  <Th>Lot</Th>
                  <Th>Type</Th>
                  <Th>Âge</Th>
                  <Th>Perf.</Th>
                  <Th>IC</Th>
                  <Th>Vivants</Th>
                </tr>
              </thead>
              <tbody>
                {d.leaderboard.map((b) => (
                  <tr key={b.batchId} className="border-t border-slate-100">
                    <Td className="font-medium">
                      <div className="flex items-center gap-2">
                        <PhotoThumb src={lotPhoto(b.batchId)} size="sm" />
                        <span className="min-w-0">{b.batchName ?? 'Lot'}</span>
                      </div>
                    </Td>
                    <Td label="Type"><StatusBadge status={b.type} /></Td>
                    <Td label="Âge" className="whitespace-nowrap">{b.ageDays} j</Td>
                    <Td label="Perf." className="font-semibold">{b.perfIndex != null ? num(b.perfIndex) : '—'}</Td>
                    <Td label="IC">{b.fcr != null ? num(b.fcr, 2) : '—'}</Td>
                    <Td label="Vivants">{num(b.liveCount)}</Td>
                  </tr>
                ))}
                {d.leaderboard.length === 0 ? (
                  <tr>
                    <Td className="py-8 text-center text-slate-400" >
                      Aucun lot
                    </Td>
                  </tr>
                ) : null}
              </tbody>
            </DataTable>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <ShieldAlert className="h-4 w-4 text-brand-600" /> Vigilance lots
            </h2>
          </div>
          <DataTable>
              <thead className="bg-slate-50">
                <tr>
                  <Th>Lot</Th>
                  <Th>Statut</Th>
                  <Th>Alertes</Th>
                  <Th>Dernière saisie</Th>
                </tr>
              </thead>
              <tbody>
                {d.healthOverview.slice(0, 8).map((b) => (
                  <tr key={b.batchId} className="border-t border-slate-100">
                    <Td className="font-medium">
                      <div className="flex items-center gap-2">
                        <PhotoThumb src={lotPhoto(b.batchId)} size="sm" />
                        <div className="min-w-0">
                          <div>{b.batchName ?? 'Lot'}</div>
                          <div className="text-xs text-slate-400">
                            {statusLabel(b.type)} · {b.ageDays} j · {num(b.liveCount)} vivants
                          </div>
                        </div>
                      </div>
                    </Td>
                    <Td label="Statut"><StatusBadge status={b.status} /></Td>
                    <Td label="Alertes">
                      <div className="flex items-center gap-1">
                        {b.alertesRouges > 0 ? <AlertLevelBadge level="ROUGE" /> : null}
                        {b.alertesJaunes > 0 ? <AlertLevelBadge level="JAUNE" /> : null}
                        {b.alertesRouges === 0 && b.alertesJaunes === 0 ? <span className="text-xs text-slate-400">—</span> : null}
                      </div>
                    </Td>
                    <Td label="Dernière saisie">
                      <div className="text-xs">{dateFr(b.lastEntryDate)}</div>
                      {b.lastEntryLagDays && b.lastEntryLagDays > 0 ? (
                        <div className="text-xs font-medium text-amber-600">
                          {b.lastEntryLagDays} j de retard
                        </div>
                      ) : null}
                    </Td>
                  </tr>
                ))}
                {d.healthOverview.length === 0 ? (
                  <tr>
                    <Td className="py-8 text-center text-slate-400">
                      Aucun lot
                    </Td>
                  </tr>
                ) : null}
              </tbody>
            </DataTable>
        </Card>
      </div>
  );
  const priority = d.alerts.rouge > 0 ? (
        <Card className="flex items-start gap-3 border-red-200 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="font-semibold text-red-700">
              {d.alerts.rouge} alerte(s) rouge(s) à traiter en priorité
            </p>
            <Link to="/app/alerts" className="text-sm font-medium text-red-600 underline">
              Consulter les alertes et leurs recommandations
            </Link>
          </div>
        </Card>
  ) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tableau de bord"
        subtitle={`Situation de la ferme · mis à jour ${dateFr(d.generatedAt)}`}
        icon={<LayoutDashboard className="h-6 w-6" />}
        actions={
          <>
            <Calendar className="h-4 w-4 text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              max={localToday()}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
            />
            {!isToday && (
              <button
                onClick={() => setSelectedDate(localToday())}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Aujourd’hui
              </button>
            )}
          </>
        }
      />

      <ErrorNote error={batches.error ?? slaughter.error ?? pnl.error ?? clients.error} />

      {wide ? (
        <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-6 min-[1800px]:grid-cols-[minmax(0,1fr)_400px]">
          <div className="space-y-6">
            {kpis}
            <PerformanceTiles batches={batchList} />
            {curve_card}
            {layerIds.length > 0 ? <EggStockPanel stock={d.eggStock} batches={batchList} series={eggSeries.data ?? []} /> : null}
            {tables_row}
            <OwnerStats dash={d} batches={batchList} slaughter={slaughter.data ?? []} pnl={pnl.data} clients={clients.data} showFinance={canReports} showClients={canClients} />
          </div>
          <div className="space-y-6">
            {priority}
            <WeatherCard weather={d.weather} />
            {health}
            <ActionQueue advisory={advisory.data} error={advisory.isError} />
            <Ranking dash={d} batches={batchList} typeLabel={statusLabel} />
          </div>
        </div>
      ) : (
        <>
          {priority}
          {kpis}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <WeatherCard weather={d.weather} />
            <PerformanceTiles batches={batchList} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {health}
            {curve_card}
          </div>
          <ActionQueue advisory={advisory.data} error={advisory.isError} />
          {layerIds.length > 0 ? <EggStockPanel stock={d.eggStock} batches={batchList} series={eggSeries.data ?? []} /> : null}
          <Ranking dash={d} batches={batchList} typeLabel={statusLabel} />
          {tables_row}
          <OwnerStats dash={d} batches={batchList} slaughter={slaughter.data ?? []} pnl={pnl.data} clients={clients.data} showFinance={canReports} showClients={canClients} />
        </>
      )}

      {cheptelOpen ? (
        <CheptelModal
          batches={batches.data ? liveLots : undefined}
          error={batches.error}
          onClose={() => setCheptelOpen(false)}
        />
      ) : null}
    </div>
  );
}
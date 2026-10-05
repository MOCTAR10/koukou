import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  Activity,
  AlertTriangle,
  Banknote,
  Bird,
  Calendar,
  CalendarClock,
  Egg,
  ShieldAlert,
  Wheat,
  Users,
} from 'lucide-react';
import { api } from '../api/client';
import type { BatchCurve, DashboardData } from '../api/types';
import { useFarm } from '../app/FarmContext';
import { Card, EmptyState, LevelBadge, Loading, StatCard, StatusBadge, Th, Td } from '../components/ui';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { Donut, LineChart } from '../components/Charts';
import { classNames, dateFr, fcfa, num, pct } from '../lib/format';
import { stagger, staggerItem } from '../lib/motion';

const HEALTH_LABEL: Record<string, string> = {
  EXCELLENT: 'Excellente',
  BON: 'Bonne',
  MOYEN: 'Moyenne',
  CRITIQUE: 'Critique',
};

export function DashboardPage() {
  const { farmId } = useFarm();
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const isToday = selectedDate === new Date().toISOString().slice(0, 10);
  const dash = useQuery({
    queryKey: ['dashboard', farmId, selectedDate],
    queryFn: () => api.get<DashboardData>(`/farms/${farmId}/dashboard?date=${selectedDate}`),
    enabled: !!farmId,
    refetchInterval: 60_000,
  });
  const [curveBatchId, setCurveBatchId] = useState<string>('');

  const curve = useQuery({
    queryKey: ['curve', farmId, curveBatchId],
    queryFn: () => api.get<BatchCurve>(`/farms/${farmId}/batches/${curveBatchId}/curve`),
    enabled: !!farmId && !!curveBatchId,
  });

  const activeBatches = useMemo(
    () =>
      dash.data?.healthOverview.filter((b) => b.status !== 'CLOTURE') ?? [],
    [dash.data],
  );

  const selectedCurveBatch = curveBatchId || activeBatches[0]?.batchId || '';

  if (dash.isLoading || !dash.data) {
    return <Loading label="Chargement du tableau de bord…" />;
  }

  const d = dash.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Tableau de bord</h1>
          <p className="mt-1 text-sm text-slate-500">
            Situation de la ferme · mis à jour {dateFr(d.generatedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-slate-400" />
          <input
            type="date"
            value={selectedDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-sky-500"
          />
          {!isToday && (
            <button
              onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))}
              className="rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100"
            >
              Aujourd'hui
            </button>
          )}
        </div>
      </div>

      <motion.div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={staggerItem}>
          <StatCard
            label="Cheptel vivant"
            value={<AnimatedNumber value={d.liveStock} format={num} />}
            hint={`${d.batches.actif} lot(s) actif(s)`}
            icon={<Bird className="h-5 w-5" />}
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
            icon={<Egg className="h-5 w-5" />}
            tone="accent"
          />
        </motion.div>
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Santé de la ferme</h2>
          <div className="flex items-center justify-around gap-4">
            <Donut
              value={d.health.score}
              total={100}
              label={HEALTH_LABEL[d.health.grade] ?? d.health.grade}
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

        <Card className="p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-700">
              Courbe de croissance (poids moyen / IC)
            </h2>
            <select
              value={selectedCurveBatch}
              onChange={(e) => setCurveBatchId(e.target.value)}
              className="max-w-[220px] rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-sky-500"
            >
              {activeBatches.map((b) => (
                <option key={b.batchId} value={b.batchId}>
                  {b.batchName ?? `Lot ${b.batchId.slice(0, 8)}`}
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
                color="#0284c7"
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
            <EmptyState message="Pas encore de données de croissance (saisies hebdomadaires)." />
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">Palmarès des lots</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
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
                      {b.batchName ?? b.batchId.slice(0, 8)}
                    </Td>
                    <Td><StatusBadge status={b.type} /></Td>
                    <Td>{b.ageDays} j</Td>
                    <Td className="font-semibold">{b.perfIndex != null ? num(b.perfIndex) : '—'}</Td>
                    <Td>{b.fcr != null ? num(b.fcr, 2) : '—'}</Td>
                    <Td>{num(b.liveCount)}</Td>
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
            </table>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">Vigilance lots</h2>
            <ShieldAlert className="h-4 w-4 text-slate-400" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
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
                      <div>{b.batchName ?? b.batchId.slice(0, 8)}</div>
                      <div className="text-xs text-slate-400">
                        {b.type} · {b.ageDays} j · {num(b.liveCount)} vivants
                      </div>
                    </Td>
                    <Td><StatusBadge status={b.status} /></Td>
                    <Td>
                      <div className="flex items-center gap-1">
                        {b.alertesRouges > 0 ? <LevelBadge level="ROUGE" /> : null}
                        {b.alertesJaunes > 0 ? <LevelBadge level="JAUNE" /> : null}
                        {b.alertesRouges === 0 && b.alertesJaunes === 0 ? <span className="text-xs text-slate-400">—</span> : null}
                      </div>
                    </Td>
                    <Td>
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
            </table>
          </div>
        </Card>
      </div>

      {d.alerts.rouge > 0 ? (
        <Card className="flex items-start gap-3 border-red-200 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="font-semibold text-red-700">
              {d.alerts.rouge} alerte(s) rouge(s) à traiter en priorité
            </p>
            <p className="text-sm text-red-600">
              Consultez la page Alertes pour les recommandations.
            </p>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Bird,
  Check,
  Clock,
  Coins,
  Copy,
  Droplets,
  Egg,
  Factory,
  FileText,
  Gauge,
  HeartPulse,
  Layers,
  Lock,
  PackageCheck,
  PenLine,
  Pencil,
  Receipt,
  Scale,
  ShieldCheck,
  ShoppingCart,
  Shrink,
  Skull,
  Stethoscope,
  Syringe,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
  Warehouse,
  Weight,
  Wheat,
} from 'lucide-react';
import { api } from '../../api/client';
import type { FeedStockSummary } from '../../api/types';
import type {
  AdvisoryResponse,
  BatchHealth,
  BatchPnl,
  DailyEntryRecord,
  FlockDashboard,
  HealthEvent,
  Lot,
  LotCurve,
  PondageSummary,
  ProphylaxisEvent,
  ProtocolStep,
  SanitaryProtocol,
  SanitaryProtocolWithSteps,
  SlaughterOrderFull,
  TreatmentRecord,
} from '../../api/types-flock';
import { useFarm } from '../../app/FarmContext';
import { useFarmProfile } from '../../app/useFarmProfile';
import { useCanRead } from '../../app/useMenuAccess';
import { EGG_IMAGES, lotImage } from '../../lib/animalImages';
import { dateFr, fcfa, num } from '../../lib/format';
import { BarChart, LineChart } from '../Charts';
import { Button, ErrorNote, Modal } from '../form';
import { DataTable, EmptyState, IconTile, Loading, PhotoThumb, Td, Th, type IconTone } from '../ui';
import { DailyEntryModal } from './DailyEntryModal';
import { ageWeek } from './feedRecommendation';
import {
  CARE_STATUS_LABEL,
  CARE_TYPE_LABEL,
  EGGS_PER_ALVEOL,
  HEALTH_KIND_LABEL,
  LEVEL_LABEL,
  Metric,
  Note,
  Pill,
  READY_REASON_LABEL,
  SectionCard,
  Tabs,
  type Tone,
  batchStage,
  batchStatusPill,
  careChip,
  daysBetween,
  kindLabel,
  levelIcon,
  levelTone,
  localYmd,
  lotName,
  phaseLabel,
  useAsyncAction,
  useBreedStandards,
  useBuildings,
  useInvalidateFarm,
  utcYmd,
} from './shared';

type TabKey = 'vue' | 'courbes' | 'saisies' | 'historique' | 'sanitaire';

export function LotDetail({ lot, onBack }: { lot: Lot; onBack: () => void }) {
  const { farmId } = useFarm();
  const { hasPermission } = useFarmProfile();
  const invalidate = useInvalidateFarm();
  const [tab, setTab] = useState<TabKey>('vue');
  const [entry, setEntry] = useState<{ date?: string } | null>(null);
  const [closing, setClosing] = useState(false);
  const [confirmSelling, setConfirmSelling] = useState(false);
  const pdf = useAsyncAction();
  // An institution opens the lots with TECHNIQUE: its sanitary side needs SANITAIRE too.
  const sanitary = useCanRead()('SANITAIRE');

  const buildings = useBuildings();
  const building = buildings.data?.find((b) => b.id === lot.buildingId) ?? null;
  const prophylaxis = useQuery({
    queryKey: ['prophylaxis', farmId, lot.id],
    queryFn: () => api.get<ProphylaxisEvent[]>(`/farms/${farmId}/batches/${lot.id}/prophylaxis`),
    enabled: !!farmId && sanitary,
  });
  const standards = useBreedStandards(lot.breedId);

  const toSale = useMutation({
    mutationFn: () => api.post(`/farms/${farmId}/batches/${lot.id}/vente`),
    onSuccess: async () => {
      await invalidate();
      setConfirmSelling(false);
    },
  });

  const stage = batchStage(lot);
  const pill = batchStatusPill(lot);
  const care = careChip(prophylaxis.data);
  const isActive = lot.status !== 'CLOTURE';
  const totalWeeks = standards.data?.length
    ? standards.data[standards.data.length - 1].week
    : lot.type === 'PONDEUSE'
      ? 72
      : 12;
  const week = ageWeek(lot.metrics.ageDays);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Tous les lots
      </button>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-4">
            <PhotoThumb src={lotImage(lot.breedName, lot.species)} size="lg" className="!h-20 !w-20" />
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-slate-900">{lotName(lot)}</h2>
              <p className="text-sm text-slate-500">
                {kindLabel(lot)} · {lot.breedName ?? lot.customBreed ?? 'Souche non renseignée'}
                {building ? ` · ${building.name}` : ''} · démarré le {dateFr(lot.integrationDate)} avec{' '}
                {num(lot.quantityAtStart)} oiseaux
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Pill tone={stage.tone}>{stage.label}</Pill>
                {pill ? <Pill tone={pill.tone}>{pill.label}</Pill> : null}
                {care && isActive ? (
                  <Pill tone={care.tone}>
                    <Syringe className="mr-1 h-3 w-3" />
                    {care.label}
                  </Pill>
                ) : null}
                {lot.metrics.alerts > 0 ? (
                  <Pill tone="red">
                    <AlertTriangle className="mr-1 h-3 w-3" />
                    {lot.metrics.alerts} alerte{lot.metrics.alerts > 1 ? 's' : ''}
                  </Pill>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isActive && hasPermission('saisie:creer') ? (
              <Button onClick={() => setEntry({})}>
                <PenLine className="h-4 w-4" /> Saisir
              </Button>
            ) : null}
            {hasPermission('vente:creer') ? (
              <Link
                to="/app/finance/ventes"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ShoppingCart className="h-4 w-4" /> Encaisser
              </Link>
            ) : null}
            <Button
              tone="secondary"
              busy={pdf.busy === 'passeport'}
              onClick={() =>
                void pdf.run('passeport', () =>
                  api.download(`/farms/${farmId}/batches/${lot.id}/passeport`, `passeport-${lotName(lot)}.pdf`),
                )
              }
            >
              <FileText className="h-4 w-4" /> Passeport PDF
            </Button>
            {isActive && hasPermission('sanitaire:lecture') && hasPermission('sanitaire:gerer', 'sanitaire:signaler') ? (
              <Link
                to={`/app/sanitary?lot=${lot.id}&plan=1`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Syringe className="h-4 w-4" /> Planifier un soin
              </Link>
            ) : null}
            {lot.status === 'ACTIF' && hasPermission('production:gerer') ? (
              <Button tone="secondary" onClick={() => setConfirmSelling(true)}>
                <BadgeCheck className="h-4 w-4" /> Passer en vente
              </Button>
            ) : null}
            {isActive && hasPermission('production:gerer') ? (
              <Button tone="danger" onClick={() => setClosing(true)}>
                <Lock className="h-4 w-4" /> Clôturer
              </Button>
            ) : null}
          </div>
        </div>
        <ErrorNote error={pdf.error} />
        {isActive ? (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-slate-500">
              <span>
                Semaine {Math.min(week, totalWeeks)} sur {totalWeeks} · J{lot.metrics.ageDays}
              </span>
              <span>{READY_REASON_LABEL[lot.metrics.readyReason]}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-brand-500"
                style={{ width: `${Math.min(100, (week / totalWeeks) * 100)}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        options={[
          { key: 'vue', label: 'Vue', icon: <Layers /> },
          { key: 'courbes', label: 'Courbes', icon: <Activity /> },
          { key: 'saisies', label: 'Saisies', icon: <PenLine /> },
          { key: 'historique', label: 'Historique', icon: <Clock /> },
          ...(sanitary ? [{ key: 'sanitaire' as const, label: 'Sanitaire', icon: <HeartPulse /> }] : []),
        ]}
      />

      {tab === 'vue' ? <OverviewTab lot={lot} /> : null}
      {tab === 'courbes' ? <CurvesTab lot={lot} /> : null}
      {tab === 'saisies' ? <EntriesTab lot={lot} onEdit={(date) => setEntry({ date })} /> : null}
      {tab === 'historique' ? <HistoryTab lot={lot} /> : null}
      {tab === 'sanitaire' && sanitary ? <HealthTab lot={lot} events={prophylaxis.data ?? []} /> : null}

      {entry ? <DailyEntryModal initialBatchId={lot.id} initialDate={entry.date} onClose={() => setEntry(null)} /> : null}
      {closing ? <CloseLotModal lot={lot} onClose={() => setClosing(false)} /> : null}
      {confirmSelling ? (
        <Modal title="Passer ce lot en vente ?" onClose={() => setConfirmSelling(false)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {lotName(lot)} passera au statut « En vente » : ses oiseaux seront proposés à la vente. Les critères
              sanitaires sont vérifiés par le serveur.
            </p>
            <ErrorNote error={toSale.error} />
            <div className="flex justify-end gap-2">
              <Button tone="secondary" onClick={() => setConfirmSelling(false)}>
                Annuler
              </Button>
              <Button busy={toSale.isPending} onClick={() => toSale.mutate()}>
                <BadgeCheck className="h-4 w-4" /> Passer en vente
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function CloseLotModal({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const { farmId } = useFarm();
  const invalidate = useInvalidateFarm();
  const close = useMutation({
    mutationFn: () => api.post(`/farms/${farmId}/batches/${lot.id}/cloture`),
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });
  return (
    <Modal title="Clôturer ce lot ?" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          {lotName(lot)} sera clôturé avec ses {num(lot.metrics.liveCount)} oiseaux vivants. Un lot clôturé ne reçoit
          plus de saisies. Cette action ne peut pas être annulée.
        </p>
        <ErrorNote error={close.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button tone="danger" busy={close.isPending} onClick={() => close.mutate()}>
            <Lock className="h-4 w-4" /> Clôturer le lot
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function useEntries(lotId: string) {
  const { farmId } = useFarm();
  return useQuery({
    queryKey: ['daily-entries', farmId, lotId],
    queryFn: () => api.get<DailyEntryRecord[]>(`/farms/${farmId}/batches/${lotId}/daily-entries`),
    enabled: !!farmId,
  });
}

function useHealth(lotId: string) {
  const { farmId } = useFarm();
  const canRead = useCanRead();
  return useQuery({
    queryKey: ['health', farmId, lotId],
    queryFn: () => api.get<BatchHealth>(`/farms/${farmId}/batches/${lotId}/health`),
    enabled: !!farmId && canRead('SANITAIRE'),
  });
}

function useSlaughterOrders() {
  const { farmId } = useFarm();
  const canRead = useCanRead();
  return useQuery({
    queryKey: ['slaughter-orders', farmId],
    queryFn: () => api.get<SlaughterOrderFull[]>(`/farms/${farmId}/slaughter-orders`),
    enabled: !!farmId && canRead('TRACABILITE'),
  });
}

function OverviewTab({ lot }: { lot: Lot }) {
  const { farmId } = useFarm();
  const { hasPermission } = useFarmProfile();
  const canRead = useCanRead();
  const canReports = hasPermission('compta:rapports') && canRead('ECONOMIQUE');
  const invalidate = useInvalidateFarm();
  const m = lot.metrics;
  const isLayer = lot.type === 'PONDEUSE';
  const entries = useEntries(lot.id);
  const health = useHealth(lot.id);
  const slaughter = useSlaughterOrders();
  const pnl = useQuery({
    queryKey: ['rentabilite-batch', farmId, lot.id],
    queryFn: () => api.get<BatchPnl>(`/farms/${farmId}/rentabilite/batches/${lot.id}`),
    enabled: !!farmId && canReports,
  });
  const pondage = useQuery({
    queryKey: ['pondage', farmId, lot.id],
    queryFn: () => api.get<PondageSummary>(`/farms/${farmId}/batches/${lot.id}/pondage`),
    enabled: !!farmId && isLayer,
  });
  const dashboard = useQuery({
    queryKey: ['dashboard', farmId],
    queryFn: () => api.get<FlockDashboard>(`/farms/${farmId}/dashboard`),
    enabled: !!farmId,
  });
  const advisory = useQuery({
    queryKey: ['advisory', farmId],
    queryFn: () => api.get<AdvisoryResponse>(`/farms/${farmId}/advisory/next-actions`),
    enabled: !!farmId,
  });
  const stock = useQuery({
    queryKey: ['feed-stock', farmId],
    queryFn: () => api.get<FeedStockSummary>(`/farms/${farmId}/feed-stock`),
    enabled: !!farmId && canRead('INTRANTS'),
  });

  const ack = useAsyncAction();
  const alerts = (advisory.data?.actions ?? []).filter(
    (a) => a.batchId === lot.id && a.alertId && !a.acknowledged && a.level !== 'VERT',
  );
  const breedStatus = dashboard.data?.healthOverview?.find((h) => h.batchId === lot.id)?.breedStatus ?? null;
  const orders = (slaughter.data ?? []).filter((o) => o.batchId === lot.id && o.status !== 'CANCELLED');
  const processed = orders.filter((o) => o.status === 'PROCESSED');
  const rows = entries.data ?? [];
  const weighing = m.lastWeighingDate ? rows.find((r) => r.entryDate.slice(0, 10) === m.lastWeighingDate?.slice(0, 10)) : null;
  const feedPerBird = m.liveCount > 0 ? (m.totalFeedKg * 1000) / m.liveCount : null;

  const water = useMemo(() => {
    const withWater = rows.filter((r) => r.waterL > 0).sort((a, b) => b.entryDate.localeCompare(a.entryDate));
    if (withWater.length === 0) return null;
    const total = withWater.reduce((s, r) => s + r.waterL, 0);
    const recent = withWater.slice(0, 7);
    const avg = recent.reduce((s, r) => s + r.waterL, 0) / recent.length;
    const previous = withWater.slice(7, 14);
    const prevAvg = previous.length ? previous.reduce((s, r) => s + r.waterL, 0) / previous.length : null;
    return {
      total,
      perBird: m.liveCount > 0 ? avg / m.liveCount : null,
      trend: prevAvg ? ((avg - prevAvg) / prevAvg) * 100 : null,
    };
  }, [rows, m.liveCount]);

  const recentEggs = useMemo(
    () =>
      rows
        .filter((r) => r.eggsCollected > 0)
        .sort((a, b) => a.entryDate.localeCompare(b.entryDate))
        .slice(-14),
    [rows],
  );

  const lastEggs = recentEggs[recentEggs.length - 1];
  const eggs = m.eggBreakdown;
  const collected = eggs?.collected ?? m.eggsCollectedTotal;
  const crackedPct = collected > 0 && eggs ? (eggs.cracked / collected) * 100 : null;
  const weighingAge = m.lastWeighingDate ? daysBetween(m.lastWeighingDate, localYmd()) : null;

  const lotFeed = (stock.data?.lots ?? []).filter((l) => l.batchId === lot.id);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <SectionCard title="Performance" icon={<Gauge />}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Vivants" icon={<Bird />} value={num(m.liveCount)} sub={`sur ${num(lot.quantityAtStart)}`} />
            <Metric
              label="Mortalité"
              icon={<HeartPulse />}
              value={`${num(m.mortalityPercent)} %`}
              sub={`${num(m.totalDeaths)} morts`}
              tone={m.mortalityPercent >= 5 ? 'bad' : m.mortalityPercent >= 3 ? 'warn' : 'good'}
            />
            <Metric label="Viabilité" icon={<HeartPulse />} value={`${num(m.viabilityPercent)} %`} />
            <Metric label="Indice de consommation" icon={<Scale />} value={m.fcr != null ? num(m.fcr, 2) : '—'} />
            <Metric label="GMQ" icon={<TrendingUp />} value={m.gmqGramsPerDay != null ? `${num(m.gmqGramsPerDay, 0)} g/j` : '—'} />
            <Metric
              label="IPE"
              icon={<Activity />}
              value={m.ipe != null ? num(m.ipe, 0) : '—'}
              sub={m.ipeTarget != null ? `cible ${num(m.ipeTarget, 0)}` : undefined}
            />
            <Metric
              label="Poids moyen"
              icon={<Weight />}
              value={weighing?.avgWeightKg != null ? `${num(weighing.avgWeightKg, 2)} kg` : '—'}
              sub={m.lastWeighingDate ? `${dateFr(m.lastWeighingDate)}${m.lastWeighingAgeDays != null ? ` (J${m.lastWeighingAgeDays})` : ''}` : 'aucune pesée'}
            />
            <Metric
              label="Aliment / oiseau"
              icon={<Wheat />}
              value={feedPerBird != null ? `${num(feedPerBird, 0)} g` : '—'}
              sub={`${num(m.totalFeedKg)} kg au total`}
            />
            <Metric label="Densité" icon={<Layers />} value={m.densityPerM2 != null ? `${num(m.densityPerM2)}/m²` : '—'} />
            {isLayer ? (
              <Metric label="Taux de ponte" icon={<Egg />} value={m.layRatePercent != null ? `${num(m.layRatePercent)} %` : '—'} />
            ) : null}
          </div>
          {lot.status !== 'CLOTURE' && (weighingAge == null || weighingAge > 7) ? (
            <div className="mt-3">
              <Note tone="amber" icon={<Scale />}>
                {weighingAge == null
                  ? "Aucune pesée enregistrée : le poids et le GMQ du lot restent inconnus."
                  : `Dernière pesée il y a ${weighingAge} jours : une pesée par semaine garde le suivi fiable.`}
              </Note>
            </div>
          ) : null}
        </SectionCard>

        {isLayer || collected > 0 ? (
          <SectionCard title="Production d'œufs" icon={<Egg />} iconTone="accent">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Récolte du jour" image={EGG_IMAGES.oeuf} value={lastEggs ? num(lastEggs.eggsCollected, 0) : '—'} sub={lastEggs ? dateFr(lastEggs.entryDate) : undefined} />
              <Metric label="Total collecté" image={EGG_IMAGES.alveole} value={num(collected, 0)} sub={`≈ ${num(collected / EGGS_PER_ALVEOL, 0)} alvéoles`} />
              <Metric label="Commercialisables" icon={<PackageCheck />} value={pondage.data?.sellableRatioPercent != null ? `${num(pondage.data.sellableRatioPercent)} %` : '—'} />
              <Metric label="Casse" icon={<TrendingDown />} value={crackedPct != null ? `${num(crackedPct)} %` : '—'} sub={eggs ? `${num(eggs.cracked, 0)} fêlés` : undefined} />
              <Metric label="Œufs / poule" icon={<Egg />} value={pondage.data?.eggsPerHen != null ? num(pondage.data.eggsPerHen) : '—'} />
              {eggs ? (
                <>
                  <Metric label="Petits" icon={<Shrink />} value={num(eggs.small, 0)} />
                  <Metric label="Double jaune" icon={<Copy />} value={num(eggs.doubleYolk, 0)} />
                  <Metric label="Sales" icon={<Droplets />} value={num(eggs.dirty, 0)} />
                </>
              ) : null}
            </div>
            {recentEggs.length > 1 ? (
              <div className="mt-3">
                <BarChart
                  data={recentEggs.map((r) => r.eggsCollected)}
                  labels={recentEggs.map((r) => r.entryDate.slice(8, 10))}
                  height={120}
                  color="#d97706"
                />
              </div>
            ) : null}
          </SectionCard>
        ) : null}

        {water ? (
          <SectionCard title="Eau" icon={<Droplets />}>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Total bu" icon={<Droplets />} value={`${num(water.total, 0)} L`} />
              <Metric label="Par oiseau et par jour" icon={<Droplets />} value={water.perBird != null ? `${num(water.perBird, 2)} L` : '—'} />
              <Metric
                label="Tendance sur 7 jours"
                icon={water.trend != null && water.trend < 0 ? <TrendingDown /> : <TrendingUp />}
                value={water.trend != null ? `${water.trend >= 0 ? '+' : ''}${num(water.trend, 0)} %` : '—'}
                tone={water.trend != null && water.trend <= -15 ? 'warn' : undefined}
              />
            </div>
          </SectionCard>
        ) : null}

        {orders.length > 0 ? (
          <SectionCard title="Abattage" icon={<Factory />}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Ordres" icon={<FileText />} value={orders.length} />
              <Metric label="Traités" icon={<Check />} value={processed.length} />
              <Metric label="Oiseaux traités" icon={<Bird />} value={num(processed.reduce((s, o) => s + o.birdCount, 0))} />
              <Metric
                label="Carcasse"
                icon={<Scale />}
                value={`${num(processed.reduce((s, o) => s + (o.carcassWeightKg ?? 0), 0))} kg`}
              />
            </div>
          </SectionCard>
        ) : null}

        {canReports ? (
        <SectionCard title="Rentabilité du lot" icon={<Wallet />} iconTone="accent">
          <ErrorNote error={pnl.error} />
          {pnl.data ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Revenus" icon={<Wallet />} value={fcfa(pnl.data.revenueFcfa)} />
              <Metric label="Dépenses" icon={<Receipt />} value={fcfa(pnl.data.expensesFcfa)} />
              <Metric label="Résultat net" icon={pnl.data.netFcfa >= 0 ? <TrendingUp /> : <TrendingDown />} value={fcfa(pnl.data.netFcfa)} tone={pnl.data.netFcfa >= 0 ? 'good' : 'bad'} />
              <Metric label="Marge" icon={<Gauge />} value={pnl.data.marginPct != null ? `${num(pnl.data.marginPct)} %` : '—'} />
              <Metric label="Coût au kg" icon={<Coins />} value={pnl.data.costPerKgFcfa != null ? fcfa(pnl.data.costPerKgFcfa) : '—'} />
              <Metric label="Kg vendus" icon={<Scale />} value={num(pnl.data.kgSold)} />
              <Metric label="Oiseaux vendus" icon={<Bird />} value={num(pnl.data.birdsSold)} />
              <Metric label="Œufs vendus" image={EGG_IMAGES.oeuf} value={num(pnl.data.eggsSold, 0)} />
            </div>
          ) : pnl.isLoading ? (
            <Loading />
          ) : null}
        </SectionCard>
        ) : null}
      </div>

      <div className="space-y-4">
        {health.data ? (
          <SectionCard title="Santé du lot" icon={<HeartPulse />}>
            <div className="flex items-baseline gap-2">
              <span
                className={
                  health.data.healthScore >= 80
                    ? 'text-3xl font-bold text-emerald-600'
                    : health.data.healthScore >= 60
                      ? 'text-3xl font-bold text-amber-600'
                      : 'text-3xl font-bold text-red-600'
                }
              >
                {num(health.data.healthScore, 0)}
              </span>
              <span className="text-sm text-slate-500">/ 100</span>
            </div>
            {health.data.tips.length > 0 ? (
              <div className="mt-3 space-y-2">
                {health.data.tips.slice(0, 3).map((t) => (
                  <Note key={t.text} tone={levelTone(t.level)} icon={levelIcon(t.level)}>
                    {t.text}
                  </Note>
                ))}
              </div>
            ) : null}
          </SectionCard>
        ) : null}

        <SectionCard title="Alertes du lot" icon={<AlertTriangle />} iconTone="amber">
          <ErrorNote error={ack.error} />
          {alerts.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune alerte active pour ce lot.</p>
          ) : (
            <div className="space-y-2">
              {alerts.map((a) => (
                <div key={a.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Pill tone={levelTone(a.level)}>{LEVEL_LABEL[a.level]}</Pill>
                      <p className="mt-1 text-sm font-medium text-slate-800">{a.title}</p>
                      <p className="text-xs text-slate-500">{a.description}</p>
                    </div>
                    <Button
                      tone="secondary"
                      className="shrink-0"
                      busy={ack.busy === a.id}
                      onClick={() =>
                        void ack.run(a.id, async () => {
                          await api.post(`/farms/${farmId}/alerts/${a.alertId}/acknowledge`);
                          await invalidate();
                        })
                      }
                    >
                      <Check className="h-4 w-4" /> Acquitter
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {breedStatus ? (
          <SectionCard title="Référence de la souche" icon={<Target />} subtitle={`Semaine ${breedStatus.week}`}>
            <div className="space-y-2">
              <RefRow label="Poids" actual={breedStatus.actualAvgWeightKg} target={breedStatus.targetAvgWeightKg} dev={breedStatus.avgWeightDeviationPct} unit=" kg" digits={2} higherIsBetter />
              <RefRow label="IC" actual={breedStatus.actualFcr} target={breedStatus.targetFcr} dev={breedStatus.fcrDeviationPct} digits={2} />
              {isLayer ? (
                <RefRow label="Ponte" actual={breedStatus.actualLayRatePercent} target={breedStatus.targetLayRatePercent} dev={breedStatus.layRateDeviationPct} unit=" %" digits={1} higherIsBetter />
              ) : null}
            </div>
          </SectionCard>
        ) : null}

        <SectionCard title="Aliment du lot" icon={<Warehouse />}>
          {lotFeed.length > 0 ? (
            <ul className="space-y-1 text-sm text-slate-700">
              {lotFeed.map((l) => (
                <li key={l.id} className="flex justify-between gap-2">
                  <span className="truncate">
                    {l.productName}
                    {l.feedPhase ? <span className="text-slate-500"> · {phaseLabel(l.feedPhase)}</span> : null}
                  </span>
                  <span className="tabular-nums text-slate-500">{num(l.availableKg)} kg</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">
              {num(m.totalFeedKg)} kg consommés. Le stock de provende est commun à la ferme.
            </p>
          )}
          {hasPermission('stock:gerer') ? (
            <Link to="/app/stock" className="mt-2 inline-block text-xs font-medium text-brand-700 hover:underline">
              Voir le stock
            </Link>
          ) : null}
        </SectionCard>

        {lot.couvoirSupplier || lot.chickLotNumber || lot.hatchDate || lot.chickUnitPriceFcfa != null ? (
          <SectionCard title="Traçabilité" icon={<ShieldCheck />}>
            <dl className="space-y-1 text-sm">
              {lot.couvoirSupplier ? <Row label="Couvoir" value={lot.couvoirSupplier} /> : null}
              {lot.chickLotNumber ? <Row label="N° de lot" value={lot.chickLotNumber} /> : null}
              {lot.hatchDate ? <Row label="Éclosion" value={dateFr(lot.hatchDate)} /> : null}
              {lot.chickUnitPriceFcfa != null ? <Row label="Prix du poussin" value={fcfa(lot.chickUnitPriceFcfa)} /> : null}
            </dl>
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function RefRow({
  label,
  actual,
  target,
  dev,
  unit = '',
  digits,
  higherIsBetter = false,
}: {
  label: string;
  actual: number | null;
  target: number | null;
  dev: number | null;
  unit?: string;
  digits: number;
  higherIsBetter?: boolean;
}) {
  const bad = dev != null && (higherIsBetter ? dev < -10 : dev > 10);
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="tabular-nums text-slate-800">
        {actual != null ? `${num(actual, digits)}${unit}` : '—'}
        <span className="text-slate-400"> / {target != null ? `${num(target, digits)}${unit}` : '—'}</span>
        {dev != null ? (
          <span className={bad ? ' text-red-600' : ' text-emerald-600'}>
            {' '}
            ({dev >= 0 ? '+' : ''}
            {num(dev, 0)} %)
          </span>
        ) : null}
      </span>
    </div>
  );
}

function CurvesTab({ lot }: { lot: Lot }) {
  const { farmId } = useFarm();
  const isLayer = lot.type === 'PONDEUSE';
  const curve = useQuery({
    queryKey: ['curve', farmId, lot.id],
    queryFn: () => api.get<LotCurve>(`/farms/${farmId}/batches/${lot.id}/curve`),
    enabled: !!farmId,
  });
  const pondage = useQuery({
    queryKey: ['pondage', farmId, lot.id],
    queryFn: () => api.get<PondageSummary>(`/farms/${farmId}/batches/${lot.id}/pondage`),
    enabled: !!farmId && isLayer,
  });

  if (curve.isLoading) return <Loading label="Chargement des courbes…" />;
  if (curve.error) return <ErrorNote error={curve.error} />;
  const weekly = curve.data?.weekly ?? [];
  if (weekly.length === 0) {
    return <EmptyState message="Pas encore de données : les courbes apparaissent après les premières saisies." icon={<Activity />} />;
  }
  const labels = weekly.map((_, i) => `S${i + 1}`);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Poids moyen (kg)" icon={<Weight />} hint="Chaque point est une pesée saisie.">
        <Line data={weekly.map((w) => w.avgWeightKg)} labels={labels} fmt={(v) => `${num(v, 2)} kg`} color="#2563eb" />
      </ChartCard>
      <ChartCard title="Indice de consommation" icon={<Scale />} hint="Aliment consommé par kg de poids produit. Plus il est bas, mieux c'est.">
        <Line data={weekly.map((w) => w.fcrCumulative)} labels={labels} fmt={(v) => num(v, 2)} color="#d97706" />
      </ChartCard>
      <ChartCard title="Eau (L par oiseau)" icon={<Droplets />} hint="Une baisse brutale annonce souvent un problème de santé.">
        <Line data={weekly.map((w) => w.waterLPerBird)} labels={labels} fmt={(v) => `${num(v, 2)} L`} color="#0891b2" />
      </ChartCard>
      <ChartCard title="Morts par semaine" icon={<Skull />} iconTone="red" hint="Tout pic mérite une visite du bâtiment.">
        <BarChart data={weekly.map((w) => w.deaths)} labels={labels} color="#dc2626" />
      </ChartCard>
      {isLayer && pondage.data?.weekly.length ? (
        <ChartCard title="Taux de ponte (%)" icon={<Egg />} iconTone="accent" hint="Œufs collectés rapportés aux poules présentes.">
          <Line
            data={pondage.data.weekly.map((w) => w.layRatePercent)}
            labels={pondage.data.weekly.map((_, i) => `S${i + 1}`)}
            fmt={(v) => `${num(v)} %`}
            color="#059669"
          />
        </ChartCard>
      ) : null}
    </div>
  );
}

/** A curve needs two points: one lone value is stated instead of drawn. */
function Line({
  data,
  labels,
  fmt,
  color,
}: {
  data: Array<number | null>;
  labels: string[];
  fmt: (v: number) => string;
  color: string;
}) {
  const points = data.flatMap((v, i) => (v != null ? [{ v, label: labels[i] }] : []));
  if (points.length === 0) return <p className="py-6 text-center text-sm text-slate-500">Pas encore de mesure.</p>;
  if (points.length === 1) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">
        Une seule mesure pour l'instant : <strong className="text-slate-800">{fmt(points[0].v)}</strong> ({points[0].label}).
      </p>
    );
  }
  return <LineChart data={data} labels={labels} valueFmt={fmt} color={color} />;
}

function ChartCard({
  title,
  hint,
  icon,
  iconTone,
  children,
}: {
  title: string;
  hint: string;
  icon: React.ReactNode;
  iconTone?: IconTone;
  children: React.ReactNode;
}) {
  return (
    <SectionCard title={title} subtitle={hint} icon={icon} iconTone={iconTone}>
      {children}
    </SectionCard>
  );
}

function EntriesTab({ lot, onEdit }: { lot: Lot; onEdit: (date: string) => void }) {
  const { hasPermission } = useFarmProfile();
  const canEdit = hasPermission('saisie:creer');
  const entries = useEntries(lot.id);
  const rows = [...(entries.data ?? [])].sort((a, b) => b.entryDate.localeCompare(a.entryDate));
  if (entries.isLoading) return <Loading label="Chargement des saisies…" />;
  return (
    <SectionCard title="Saisies journalières" icon={<PenLine />} subtitle={canEdit ? 'Cliquez sur Modifier pour corriger une journée' : undefined} flush>
      <ErrorNote error={entries.error} />
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState message="Aucune saisie pour ce lot." icon={<PenLine />} />
        </div>
      ) : (
        <DataTable>
            <thead className="bg-slate-50">
              <tr>
                <Th>Date</Th>
                <Th>Morts</Th>
                <Th>Aliment</Th>
                <Th>Phase</Th>
                <Th>Eau</Th>
                <Th>Poids</Th>
                <Th>Œufs</Th>
                <Th>Vendables</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <Td>{dateFr(r.entryDate)}</Td>
                  <Td label="Morts">{num(r.deaths, 0)}</Td>
                  <Td label="Aliment">
                    {r.feedQuantity > 0 ? `${num(r.feedQuantity)} kg` : '—'}
                    {r.skipStockDeduction ? <span className="ml-1 text-xs text-slate-400">(hors stock)</span> : null}
                  </Td>
                  <Td label="Phase">{phaseLabel(r.feedPhase, r.customFeedPhaseName)}</Td>
                  <Td label="Eau">{r.waterL > 0 ? `${num(r.waterL)} L` : '—'}</Td>
                  <Td label="Poids">{r.avgWeightKg != null ? `${num(r.avgWeightKg, 2)} kg` : '—'}</Td>
                  <Td label="Œufs">{r.eggsCollected > 0 ? num(r.eggsCollected, 0) : '—'}</Td>
                  <Td label="Vendables">{r.eggsCollected > 0 ? num(r.eggsSellable, 0) : '—'}</Td>
                  <Td className="text-right">
                    {lot.status !== 'CLOTURE' && canEdit ? (
                      <button
                        type="button"
                        onClick={() => onEdit(r.entryDate.slice(0, 10))}
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                      >
                        <Pencil className="h-3 w-3" /> Modifier
                      </button>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
      )}
    </SectionCard>
  );
}

function useLotCare(lotId: string) {
  const { farmId } = useFarm();
  const sanitary = useCanRead()('SANITAIRE');
  const treatments = useQuery({
    queryKey: ['treatments', farmId, lotId],
    queryFn: () => api.get<TreatmentRecord[]>(`/farms/${farmId}/batches/${lotId}/treatments`),
    enabled: !!farmId && sanitary,
  });
  const events = useQuery({
    queryKey: ['health-events', farmId, lotId],
    queryFn: () => api.get<HealthEvent[]>(`/farms/${farmId}/batches/${lotId}/health-events`),
    enabled: !!farmId && sanitary,
  });
  return { treatments, events };
}

type HistoryFilter = 'all' | 'soins' | 'sante' | 'abattage';

const HISTORY_ICON: Record<HistoryFilter, React.ReactNode> = {
  all: <Clock />,
  soins: <Syringe />,
  sante: <Stethoscope />,
  abattage: <Scale />,
};

const TILE_TONE: Record<Tone, IconTone> = { emerald: 'green', amber: 'amber', red: 'red', brand: 'brand', slate: 'slate' };

function HistoryTab({ lot }: { lot: Lot }) {
  const { farmId } = useFarm();
  const { treatments, events } = useLotCare(lot.id);
  const slaughter = useSlaughterOrders();
  const canRead = useCanRead();
  const prophylaxis = useQuery({
    queryKey: ['prophylaxis', farmId, lot.id],
    queryFn: () => api.get<ProphylaxisEvent[]>(`/farms/${farmId}/batches/${lot.id}/prophylaxis`),
    enabled: !!farmId && canRead('SANITAIRE'),
  });
  const [filter, setFilter] = useState<HistoryFilter>('all');

  const items = useMemo(() => {
    const list: Array<{ key: string; date: string; kind: HistoryFilter; title: string; sub: string; tone: 'emerald' | 'amber' | 'red' | 'brand' | 'slate'; tag: string }> = [];
    for (const t of treatments.data ?? []) {
      list.push({
        key: `t-${t.id}`,
        date: t.administeredAt,
        kind: 'soins',
        title: t.productName,
        sub: [t.dosage, t.route, t.withdrawalEndDate ? `retrait jusqu'au ${dateFr(t.withdrawalEndDate)}` : null].filter(Boolean).join(' · '),
        tone: 'brand',
        tag: CARE_TYPE_LABEL[t.careType],
      });
    }
    for (const p of prophylaxis.data ?? []) {
      if (p.status !== 'FAIT' && p.status !== 'EN_RETARD') continue;
      list.push({
        key: `p-${p.id}`,
        date: p.completedAt ?? p.scheduledDate,
        kind: 'soins',
        title: p.name,
        sub: `${CARE_TYPE_LABEL[p.careType]}${p.dosage ? ` · ${p.dosage}` : ''}`,
        tone: p.status === 'FAIT' ? 'emerald' : 'red',
        tag: CARE_STATUS_LABEL[p.status],
      });
    }
    for (const e of events.data ?? []) {
      list.push({
        key: `e-${e.id}`,
        date: e.occurredAt,
        kind: 'sante',
        title: e.title,
        sub: [e.quantity > 0 ? `${num(e.quantity, 0)} oiseaux` : null, e.status === 'RESOLU' ? 'Résolu' : 'En cours', e.description].filter(Boolean).join(' · '),
        tone: levelTone(e.severity),
        tag: HEALTH_KIND_LABEL[e.kind],
      });
    }
    for (const o of slaughter.data ?? []) {
      if (o.batchId !== lot.id || o.status === 'CANCELLED') continue;
      list.push({
        key: `s-${o.id}`,
        date: o.processedAt ?? o.plannedDate,
        kind: 'abattage',
        title: `Ordre ${o.referenceNumber}`,
        sub: `${num(o.birdCount, 0)} oiseaux${o.rendementPercent != null ? ` · rendement ${num(o.rendementPercent)} %` : ''}`,
        tone: 'slate',
        tag: 'Abattage',
      });
    }
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [treatments.data, prophylaxis.data, events.data, slaughter.data, lot.id]);

  const shown = filter === 'all' ? items : items.filter((i) => i.kind === filter);
  return (
    <SectionCard
      title="Historique du lot"
      icon={<Clock />}
      actions={
        <Tabs<HistoryFilter>
          value={filter}
          onChange={setFilter}
          options={[
            { key: 'all', label: 'Tout' },
            { key: 'soins', label: 'Soins' },
            { key: 'sante', label: 'Santé' },
            { key: 'abattage', label: 'Abattage' },
          ]}
        />
      }
    >
      <ErrorNote error={treatments.error ?? events.error ?? slaughter.error ?? prophylaxis.error} />
      {shown.length === 0 ? (
        <EmptyState message="Aucun événement pour ce filtre." icon={<Clock />} />
      ) : (
        <ul className="divide-y divide-slate-100">
          {shown.map((i) => (
            <li key={i.key} className="flex items-start justify-between gap-3 py-2">
              <div className="flex min-w-0 items-start gap-2.5">
                <IconTile icon={HISTORY_ICON[i.kind]} tone={TILE_TONE[i.tone]} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">{i.title}</p>
                  {i.sub ? <p className="text-xs text-slate-500">{i.sub}</p> : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Pill tone={i.tone}>{i.tag}</Pill>
                <span className="text-xs text-slate-500">{dateFr(i.date)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function defaultProtocol(list: SanitaryProtocol[] | undefined, lot: Lot) {
  return (
    list?.find((p) => p.species === lot.species && p.type === lot.type && p.isDefault) ??
    list?.find((p) => p.species === lot.species && p.type === lot.type) ??
    list?.find((p) => p.type === lot.type) ??
    null
  );
}

/** Care due at the lot's age and not covered by a done or planned event. */
function careAlerts(lot: Lot, steps: ProtocolStep[], events: ProphylaxisEvent[], treatments: TreatmentRecord[]) {
  const age = lot.metrics.ageDays;
  const done = new Set(
    [...events.filter((e) => e.status !== 'ANNULE').map((e) => e.name), ...treatments.map((t) => t.productName)].map((n) =>
      n.trim().toLowerCase(),
    ),
  );
  const covered = new Set(events.filter((e) => e.status !== 'ANNULE').map((e) => e.protocolStepId));
  const missed = steps.filter((s) => s.active && s.dayTo < age && !covered.has(s.id) && !done.has(s.name.trim().toLowerCase()));
  const current = steps.filter((s) => s.active && s.dayFrom <= age && s.dayTo >= age && !covered.has(s.id) && !done.has(s.name.trim().toLowerCase()));
  const soon = steps.filter((s) => s.active && s.dayFrom > age && s.dayFrom <= age + 7 && !covered.has(s.id) && !done.has(s.name.trim().toLowerCase()));
  return { missed, current, soon };
}

function HealthTab({ lot, events }: { lot: Lot; events: ProphylaxisEvent[] }) {
  const { farmId } = useFarm();
  const invalidate = useInvalidateFarm();
  const { hasPermission } = useFarmProfile();
  const canComplete = hasPermission('sanitaire:gerer', 'sanitaire:signaler');
  const care = useAsyncAction();
  const health = useHealth(lot.id);
  const { treatments, events: healthEvents } = useLotCare(lot.id);
  const protocols = useQuery({
    queryKey: ['protocols', farmId, lot.species, lot.type],
    queryFn: () =>
      api.get<SanitaryProtocol[]>(
        `/sanitary/protocols?farmId=${encodeURIComponent(farmId ?? '')}&species=${lot.species}&type=${lot.type}`,
      ),
    enabled: !!farmId,
  });
  const protocol = defaultProtocol(protocols.data, lot);
  const program = useQuery({
    queryKey: ['protocol-detail', farmId, protocol?.id],
    queryFn: () =>
      api.get<SanitaryProtocolWithSteps>(`/sanitary/protocols/${protocol?.id}?farmId=${encodeURIComponent(farmId ?? '')}`),
    enabled: !!protocol,
  });
  const alerts = careAlerts(lot, program.data?.steps ?? [], events, treatments.data ?? []);
  const [view, setView] = useState<'prophylaxie' | 'evenements'>('prophylaxie');
  const today = utcYmd();

  const sorted = [...events].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  const trends = health.data?.trends;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4">
        <SectionCard title="Score de santé" icon={<HeartPulse />}>
          <ErrorNote error={health.error} />
          {health.data ? (
            <div className="grid grid-cols-2 gap-2">
              <Metric
                label="Score"
                icon={<HeartPulse />}
                value={`${num(health.data.healthScore, 0)} / 100`}
                tone={health.data.healthScore >= 80 ? 'good' : health.data.healthScore >= 60 ? 'warn' : 'bad'}
              />
              <Metric label="Viabilité" icon={<HeartPulse />} value={`${num(health.data.viabilityPercent)} %`} />
              <Metric label="Mortalité" icon={<HeartPulse />} value={`${num(health.data.mortalityPercent)} %`} />
              <Metric label="Eau / oiseau" icon={<Droplets />} value={health.data.waterLPerBird != null ? `${num(health.data.waterLPerBird, 2)} L` : '—'} />
            </div>
          ) : null}
        </SectionCard>
        <SectionCard title="Soins selon le programme" icon={<Stethoscope />} subtitle={program.data?.name}>
          {lot.status === 'CLOTURE' ? (
            <p className="text-sm text-slate-500">Lot clôturé.</p>
          ) : alerts.missed.length + alerts.current.length + alerts.soon.length === 0 ? (
            <p className="text-sm text-slate-500">Rien à signaler pour l'âge actuel du lot.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {alerts.missed.map((s) => (
                <li key={s.id} className="text-red-700">
                  Manqué : {s.name} (J{s.dayFrom} à J{s.dayTo})
                </li>
              ))}
              {alerts.current.map((s) => (
                <li key={s.id} className="text-amber-700">
                  À faire maintenant : {s.name} (J{s.dayFrom} à J{s.dayTo})
                </li>
              ))}
              {alerts.soon.map((s) => (
                <li key={s.id} className="text-slate-600">
                  Bientôt : {s.name} (J{s.dayFrom})
                </li>
              ))}
            </ul>
          )}
          {hasPermission('sanitaire:lecture') ? (
            <Link
              to={`/app/sanitary?lot=${lot.id}`}
              className="mt-3 inline-block text-xs font-medium text-brand-700 hover:underline"
            >
              Ouvrir le suivi sanitaire
            </Link>
          ) : null}
        </SectionCard>
        {trends && trends.mortality.some((v) => v > 0) ? (
          <SectionCard title="Mortalité sur 7 jours" icon={<Skull />} iconTone="red">
            <BarChart data={trends.mortality} labels={trends.dates.map((d) => d.slice(8, 10))} height={120} color="#dc2626" />
          </SectionCard>
        ) : null}
      </div>
      <div className="lg:col-span-2">
        <SectionCard
          title="Suivi"
          icon={<Activity />}
          actions={
            <Tabs
              value={view}
              onChange={setView}
              options={[
                { key: 'prophylaxie', label: 'Prophylaxie', icon: <Syringe /> },
                { key: 'evenements', label: 'Événements', icon: <Stethoscope /> },
              ]}
            />
          }
        >
          {view === 'prophylaxie' ? (
            sorted.length === 0 ? (
              <EmptyState message="Aucun soin planifié pour ce lot." icon={<Syringe />} />
            ) : (
              <>
              <ErrorNote error={care.error} />
              <ul className="divide-y divide-slate-100">
                {sorted.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">{e.name}</p>
                      <p className="text-xs text-slate-500">
                        {CARE_TYPE_LABEL[e.careType]} · {dateFr(e.scheduledDate)}
                        {e.status === 'PLANIFIE' && e.scheduledDate.slice(0, 10) === today ? " · aujourd'hui" : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Pill tone={e.status === 'FAIT' ? 'emerald' : e.status === 'EN_RETARD' ? 'red' : e.status === 'ANNULE' ? 'slate' : 'brand'}>
                        {CARE_STATUS_LABEL[e.status]}
                      </Pill>
                      {canComplete && (e.status === 'PLANIFIE' || e.status === 'EN_RETARD') ? (
                        <Button
                          tone="secondary"
                          busy={care.busy === e.id}
                          aria-label={`Marquer ${e.name} comme fait`}
                          onClick={() =>
                            void care.run(e.id, async () => {
                              await api.post(`/farms/${farmId}/batches/${lot.id}/prophylaxis/${e.id}/complete`, {
                                completedAt: utcYmd(),
                              });
                              await invalidate();
                            })
                          }
                        >
                          <Check className="h-4 w-4" /> Fait
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
              </>
            )
          ) : (healthEvents.data ?? []).length === 0 ? (
            <EmptyState message="Aucun événement de santé." icon={<Stethoscope />} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {(healthEvents.data ?? []).map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">{e.title}</p>
                    <p className="text-xs text-slate-500">
                      {dateFr(e.occurredAt)}
                      {e.quantity > 0 ? ` · ${num(e.quantity, 0)} oiseaux` : ''}
                    </p>
                  </div>
                  <Pill tone={e.status === 'RESOLU' ? 'emerald' : levelTone(e.severity)}>
                    {e.status === 'RESOLU' ? 'Résolu' : LEVEL_LABEL[e.severity]}
                  </Pill>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}


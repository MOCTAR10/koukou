import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bird, CalendarClock, ChevronRight, Coins, Layers3, PiggyBank, Plus, Sprout, Wheat } from 'lucide-react';
import { api } from '../../api/client';
import type { OverviewPnl } from '../../api/types-finance';
import type { CaisseSummary } from '../../api/types-sales';
import { useFarm } from '../../app/FarmContext';
import { useFarmProfile } from '../../app/useFarmProfile';
import { fcfa, num } from '../../lib/format';
import { Tabs } from '../flock/shared';
import { Button, ErrorNote } from '../form';
import { Card, EmptyState, IconTile, Loading, PageHeader, StatCard } from '../ui';
import { ParcelleStatusBadge } from './AgriBits';
import { ParcelleFormModal } from './ParcelleFormModal';
import {
  adviceForCulture,
  CROP_CATEGORY_LABELS,
  cultureStage,
  formatArea,
  harvestDateFr,
  hectaresToM2Label,
  localYmd,
  RECOLTE_UNIT_LABELS,
  useParcelles,
  useRecolteStock,
} from './agri';

export type FarmMode = 'elevage' | 'agriculture';

const MODE_KEY = 'koukou.farmMode';

/** Élevage or Agriculture home, remembered on this device as on mobile. */
export function useFarmMode(): [FarmMode, (mode: FarmMode) => void] {
  const [mode, setMode] = useState<FarmMode>(() =>
    localStorage.getItem(MODE_KEY) === 'agriculture' ? 'agriculture' : 'elevage',
  );
  return [
    mode,
    (next) => {
      localStorage.setItem(MODE_KEY, next);
      setMode(next);
    },
  ];
}

export function FarmModeSwitch({ value, onChange }: { value: FarmMode; onChange: (mode: FarmMode) => void }) {
  return (
    <Tabs
      value={value}
      onChange={onChange}
      options={[
        { key: 'elevage', label: 'Élevage', icon: <Bird /> },
        { key: 'agriculture', label: 'Agriculture', icon: <Sprout /> },
      ]}
    />
  );
}

/** Home of the crop side: land, the month's margin, sellable harvests, latest parcels. */
export function AgricultureHome() {
  const { farmId, farm } = useFarm();
  const { hasPermission } = useFarmProfile();
  const canManage = hasPermission('agri:gerer');
  const canCaisse = hasPermission('caisse:lire');
  const canReports = hasPermission('compta:rapports');
  const [creating, setCreating] = useState(false);

  const parcellesQuery = useParcelles(farmId);
  const stockQuery = useRecolteStock(farmId);
  const parcelles = useMemo(() => parcellesQuery.data ?? [], [parcellesQuery.data]);

  const today = localYmd();
  const monthStart = `${today.slice(0, 8)}01`;

  const caisse = useQuery({
    queryKey: ['caisse-current', farmId],
    queryFn: () => api.get<CaisseSummary | null>(`/farms/${farmId}/caisse/current`),
    enabled: !!farmId && canCaisse,
    staleTime: 15_000,
  });
  const collectedToday = (caisse.data?.movements ?? [])
    .filter((m) => m.type === 'IN' && m.movementDate.slice(0, 10) === today)
    .reduce((sum, m) => sum + m.amountFcfa, 0);

  const pnlQuery = useQuery({
    queryKey: ['rentabilite', farmId, monthStart, today],
    queryFn: () => api.get<OverviewPnl>(`/farms/${farmId}/rentabilite/overview?from=${monthStart}&to=${today}`),
    enabled: !!farmId && canReports,
    staleTime: 30_000,
  });

  const stats = useMemo(() => {
    const planted = parcelles.filter((p) => p.plantedAt && p.status === 'ACTIVE');
    const next = planted
      .map((p) => ({ parcelle: p, stage: cultureStage(p.plantedAt, p.culture.defaultCycleDays) }))
      .filter((x) => x.stage?.harvestDate)
      .sort((a, b) => (a.stage?.harvestDate?.getTime() ?? 0) - (b.stage?.harvestDate?.getTime() ?? 0))[0];
    return {
      totalHa: parcelles.reduce((sum, p) => sum + (p.areaHa ?? 0), 0),
      actives: parcelles.filter((p) => p.status !== 'CLOTURE').length,
      culturesEnCours: new Set(planted.map((p) => p.cultureId)).size,
      next: next ?? null,
      recent: [...parcelles].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4),
    };
  }, [parcelles]);

  const stock = stockQuery.data ?? [];
  const topStock = [...stock].sort((a, b) => b.available - a.available).slice(0, 2);
  const otherStock = stock.length - topStock.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agriculture"
        subtitle={farm?.name ?? 'Parcelles et cultures de la ferme'}
        icon={<Sprout />}
        iconTone="green"
        actions={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Nouvelle parcelle
            </Button>
          ) : null
        }
      />

      <ErrorNote error={parcellesQuery.error} />

      {parcellesQuery.isPending ? (
        <Loading label="Chargement des parcelles…" />
      ) : parcellesQuery.isError ? null : parcelles.length === 0 ? (
        <EmptyState
          message="Bienvenue dans Agriculture. Enregistrez vos parcelles et leurs cultures pour suivre votre exploitation."
          icon={<Sprout />}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Surface exploitée"
              value={`${num(stats.totalHa, 2)} ha`}
              hint={hectaresToM2Label(stats.totalHa)}
              icon={<Layers3 className="h-5 w-5" />}
            />
            <StatCard
              label="Encaissé aujourd’hui"
              value={canCaisse ? fcfa(collectedToday) : '—'}
              icon={<Coins className="h-5 w-5" />}
              tone="accent"
            />
            <StatCard label="Parcelles actives" value={stats.actives} icon={<Sprout className="h-5 w-5" />} />
            <StatCard label="Cultures" value={stats.culturesEnCours} hint="en cours" icon={<Wheat className="h-5 w-5" />} />
          </div>

          {canReports ? <MarginCard pnl={pnlQuery.data} loading={pnlQuery.isLoading} error={pnlQuery.error} /> : null}

          {topStock.length > 0 || stats.next ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {topStock.length > 0 ? (
                <HarvestLink
                  icon={<PiggyBank />}
                  label="Récoltes vendables (point de vente Ferme)"
                  title={[
                    ...topStock.map((s) => `${s.parcelleName} : ${num(s.available, 2)} ${RECOLTE_UNIT_LABELS[s.unit]}`),
                    ...(otherStock > 0 ? [`+ ${otherStock} autre${otherStock > 1 ? 's' : ''}`] : []),
                  ].join(' · ')}
                  detail={`${stock.length} ligne${stock.length > 1 ? 's' : ''} de stock : récolté moins vendu, vendu via l’article « Récolte ».`}
                />
              ) : null}
              {stats.next ? (
                <HarvestLink
                  icon={<CalendarClock />}
                  label="Prochaine récolte estimée"
                  title={`${stats.next.parcelle.name} : ${harvestDateFr(stats.next.stage?.harvestDate ?? null)}`}
                  detail={adviceForCulture(stats.next.parcelle.culture)}
                />
              ) : null}
            </div>
          ) : null}

          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-700">Dernières parcelles</h2>
              <Link to="/app/parcels" className="text-xs font-medium text-brand-700 hover:underline">
                Voir toutes les parcelles
              </Link>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {stats.recent.map((p) => (
                <Card key={p.id} className="flex items-center gap-3 p-3">
                  <IconTile icon={<Sprout />} tone="green" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{p.name}</p>
                    <p className="truncate text-sm text-slate-500">
                      {p.culture.name} · {CROP_CATEGORY_LABELS[p.culture.category]}
                    </p>
                    <p className="text-xs font-semibold text-emerald-700">{formatArea(p)}</p>
                  </div>
                  <ParcelleStatusBadge status={p.status} />
                </Card>
              ))}
            </div>
          </section>
        </>
      )}

      {creating ? <ParcelleFormModal parcelle={null} onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

/** The farm's P&L over the current month, reused as the crop side's margin, as on mobile. */
function MarginCard({ pnl, loading, error }: { pnl: OverviewPnl | undefined; loading: boolean; error: unknown }) {
  const top = [...(pnl?.breakdown.byProduct ?? [])].sort((a, b) => b.amountFcfa - a.amountFcfa).slice(0, 2);
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <PiggyBank className="h-4 w-4 text-emerald-700" /> Marge du mois en cours
        </p>
        <Link to="/app/reports" className="text-xs font-medium text-brand-700 hover:underline">
          Détails
        </Link>
      </div>
      <ErrorNote error={error} />
      {loading ? <Loading /> : null}
      {pnl ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-slate-500">Marge nette</p>
              <p className={`text-lg font-bold tabular-nums ${pnl.netFcfa >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {pnl.netFcfa >= 0 ? '+' : ''}
                {fcfa(pnl.netFcfa)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Ventes</p>
              <p className="text-lg font-bold tabular-nums text-slate-900">{fcfa(pnl.sales.totalFcfa)}</p>
              <p className="text-xs text-slate-500">
                {pnl.sales.count} vente{pnl.sales.count > 1 ? 's' : ''}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Charges</p>
              <p className="text-lg font-bold tabular-nums text-slate-900">{fcfa(pnl.expenses.totalFcfa)}</p>
              <p className="text-xs text-slate-500">
                {pnl.expenses.count} dépense{pnl.expenses.count > 1 ? 's' : ''}
              </p>
            </div>
          </div>
          {top.length > 0 ? (
            <p className="truncate text-xs text-slate-500">
              Meilleure{top.length > 1 ? 's' : ''} vente{top.length > 1 ? 's' : ''} :{' '}
              {top.map((p) => `${p.label} (${fcfa(p.amountFcfa)})`).join(' · ')}
            </p>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

function HarvestLink({ icon, label, title, detail }: { icon: ReactNode; label: string; title: string; detail: string }) {
  return (
    <Link to="/app/harvests" className="block">
      <Card className="h-full p-4 transition hover:border-brand-300">
        <div className="flex items-start gap-3">
          <IconTile icon={icon} tone="green" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="font-semibold text-slate-900">{title}</p>
            <p className="mt-1 text-sm text-slate-500">{detail}</p>
          </div>
          <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
        </div>
      </Card>
    </Link>
  );
}

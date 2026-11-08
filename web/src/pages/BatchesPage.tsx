import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Bird,
  Building2,
  Coins,
  Egg,
  Gauge,
  HeartPulse,
  Info,
  PenLine,
  Plus,
  Scale,
  Search,
  TrendingDown,
  TrendingUp,
  Warehouse,
  Wheat,
} from 'lucide-react';
import { api } from '../api/client';
import type { OverviewPnl } from '../api/types-flock';
import { useFarm } from '../app/FarmContext';
import { useFarmProfile } from '../app/useFarmProfile';
import { useCanRead } from '../app/useMenuAccess';
import { BuildingFormModal, BuildingsPanel } from '../components/flock/Buildings';
import { CreateLotModal } from '../components/flock/CreateLotModal';
import { DailyEntryModal } from '../components/flock/DailyEntryModal';
import { LotDetail } from '../components/flock/LotDetail';
import { LotsBreakdown } from '../components/flock/LotsBreakdown';
import {
  LEVEL_LABEL,
  Metric,
  Pill,
  SPECIES_LABEL,
  SectionCard,
  Tabs,
  addLocalDays,
  batchStage,
  batchStatusPill,
  kindLabel,
  levelTone,
  localYmd,
  lotName,
  useBuildings,
  useLots,
} from '../components/flock/shared';
import { Button, ErrorNote, inputCls, DateInput } from '../components/form';
// POUFA lot A indic: official headline per band, Fermia's figure second, band history.
import { BandHistoryCard, ConduiteValue, OfficialMetric, OfficialValue, useBandHistory } from '../components/bandes/OfficialHeadline';
import { FERMIA_FORMULAS, currentBand, findIndicator, openBandsHeadline, summariesById, type HeadlineKey } from '../components/bandes/headline';
import { Card, DataTable, EmptyState, Loading, PageHeader, PhotoThumb, Td, Th } from '../components/ui';
import { EGG_IMAGES, lotImage } from '../lib/animalImages';
import { dateFr, fcfa, num, plural } from '../lib/format';

type Filter = 'all' | 'active' | 'selling' | 'chair' | 'layer' | 'closed';
type SortKey = 'name' | 'age' | 'mortality' | 'fcr' | 'live' | 'health';
type HealthFilter = 'all' | 'ROUGE' | 'JAUNE' | 'VERT';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'Tous' },
  { key: 'active', label: 'Actifs' },
  { key: 'selling', label: 'En vente' },
  { key: 'chair', label: 'Chair' },
  { key: 'layer', label: 'Pondeuses' },
  { key: 'closed', label: 'Clôturés' },
];

const LEVEL_RANK: Record<string, number> = { ROUGE: 0, JAUNE: 1, VERT: 2 };

export function BatchesPage() {
  const { farmId } = useFarm();
  const { hasPermission } = useFarmProfile();
  const canReadReports = useCanRead()('ECONOMIQUE');
  const canReports = hasPermission('compta:rapports') && canReadReports;
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('lot');
  const [view, setView] = useState<'lots' | 'buildings'>('lots');
  const [filter, setFilter] = useState<Filter>('all');
  const [species, setSpecies] = useState('all');
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all');
  const [sort, setSort] = useState<SortKey>('name');
  const [search, setSearch] = useState('');
  const [asOf, setAsOf] = useState('');
  const [creating, setCreating] = useState(false);
  const [entering, setEntering] = useState(false);
  const [addingBuilding, setAddingBuilding] = useState(false);

  const lots = useLots(asOf || null);
  const buildings = useBuildings();
  const bandHistory = useBandHistory();
  const summaries = useMemo(() => summariesById(bandHistory.data), [bandHistory.data]);
  const headline = useMemo(() => openBandsHeadline(bandHistory.data), [bandHistory.data]);
  /** The farm-level official value, shaped like the indicator it averages (label, unit, formula). */
  const headlineIndicator = (key: HeadlineKey) => {
    const sample = findIndicator(currentBand(bandHistory.data)?.summary?.indicators, key);
    return sample ? { ...sample, value: headline[key] } : null;
  };
  const officialOf = (batchId: string, key: HeadlineKey) => findIndicator(summaries.get(batchId)?.indicators, key);

  const selectLot = (id: string | null) => {
    setParams(id ? { lot: id } : {});
  };

  const to = localYmd();
  const from = addLocalDays(to, -29);
  const prevTo = addLocalDays(from, -1);
  const prevFrom = addLocalDays(prevTo, -29);
  const overview = useQuery({
    queryKey: ['rentabilite-overview', farmId, from, to],
    queryFn: () => api.get<OverviewPnl>(`/farms/${farmId}/rentabilite/overview?from=${from}&to=${to}`),
    enabled: !!farmId && canReports,
  });
  const previous = useQuery({
    queryKey: ['rentabilite-overview', farmId, prevFrom, prevTo],
    queryFn: () => api.get<OverviewPnl>(`/farms/${farmId}/rentabilite/overview?from=${prevFrom}&to=${prevTo}`),
    enabled: !!farmId && canReports,
  });

  const all = useMemo(() => lots.data ?? [], [lots.data]);
  const buildingName = (id: string | null) => buildings.data?.find((b) => b.id === id)?.name ?? '—';

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = all.filter((b) => {
      if (filter === 'active' && b.status === 'CLOTURE') return false;
      if (filter === 'selling' && b.status !== 'EN_VENTE') return false;
      if (filter === 'chair' && b.type !== 'CHAIR') return false;
      if (filter === 'layer' && b.type !== 'PONDEUSE') return false;
      if (filter === 'closed' && b.status !== 'CLOTURE') return false;
      if (species !== 'all' && b.species !== species) return false;
      if (healthFilter !== 'all' && b.metrics.status !== healthFilter) return false;
      if (q && !lotName(b).toLowerCase().includes(q)) return false;
      return true;
    });
    const by: Record<SortKey, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
      name: (a, b) => lotName(a).localeCompare(lotName(b), 'fr'),
      age: (a, b) => b.metrics.ageDays - a.metrics.ageDays,
      // Official values first (programme formulas), Fermia's when a band has none.
      mortality: (a, b) =>
        (summaryValue(b.id, 'taux_mortalite') ?? b.metrics.mortalityPercent) - (summaryValue(a.id, 'taux_mortalite') ?? a.metrics.mortalityPercent),
      fcr: (a, b) => (summaryValue(b.id, 'ic') ?? b.metrics.fcr ?? -1) - (summaryValue(a.id, 'ic') ?? a.metrics.fcr ?? -1),
      live: (a, b) => b.metrics.liveCount - a.metrics.liveCount,
      health: (a, b) => (LEVEL_RANK[a.metrics.status] ?? 3) - (LEVEL_RANK[b.metrics.status] ?? 3),
    };
    return [...list].sort(by[sort]);
    function summaryValue(id: string, key: HeadlineKey): number | null {
      return findIndicator(summaries.get(id)?.indicators, key)?.value ?? null;
    }
  }, [all, filter, species, healthFilter, search, sort, summaries]);

  const summary = useMemo(() => {
    const running = all.filter((b) => b.status !== 'CLOTURE');
    const avg = (vals: number[]) => (vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null);
    return {
      active: running.length,
      selling: running.filter((b) => b.status === 'EN_VENTE').length,
      birds: running.reduce((s, b) => s + b.metrics.liveCount, 0),
      eggs: running.reduce((s, b) => s + b.metrics.eggsCollectedTotal, 0),
      feed: running.reduce((s, b) => s + b.metrics.totalFeedKg, 0),
      mortality: avg(running.map((b) => b.metrics.mortalityPercent)),
      fcr: avg(running.flatMap((b) => (b.metrics.fcr != null ? [b.metrics.fcr] : []))),
      gmq: avg(running.flatMap((b) => (b.metrics.gmqGramsPerDay != null ? [b.metrics.gmqGramsPerDay] : []))),
      lay: avg(running.flatMap((b) => (b.type === 'PONDEUSE' && b.metrics.layRatePercent != null ? [b.metrics.layRatePercent] : []))),
      ready: running.filter((b) => b.metrics.readyForSale).length,
      red: running.filter((b) => b.metrics.status === 'ROUGE').length,
      yellow: running.filter((b) => b.metrics.status === 'JAUNE').length,
    };
  }, [all]);

  const runningLots = useMemo(() => all.filter((b) => b.status !== 'CLOTURE'), [all]);

  const selected = all.find((b) => b.id === selectedId) ?? null;
  if (selectedId && selected) {
    return (
      <div className="space-y-5">
        <PageHeader title="Lots" icon={<Activity />} subtitle="Détail du lot" />
        <LotDetail lot={selected} onBack={() => selectLot(null)} />
      </div>
    );
  }

  const noBuilding = buildings.isSuccess && buildings.data.length === 0;
  const delta = (cur?: number, prev?: number) => {
    if (cur == null || prev == null) return undefined;
    const d = cur - prev;
    return `${d >= 0 ? '+' : ''}${fcfa(d)} sur 30 jours précédents`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Lots"
        icon={<Activity />}
        subtitle={`${summary.active} lot${summary.active > 1 ? 's' : ''} en cours${asOf ? ` au ${dateFr(asOf)}` : ''}`}
        actions={
          <div className="flex gap-2">
            {hasPermission('saisie:creer') ? (
              <Button tone="secondary" onClick={() => setEntering(true)} disabled={summary.active === 0}>
                <PenLine className="h-4 w-4" /> Saisie journalière
              </Button>
            ) : null}
            {hasPermission('production:gerer') ? (
              <Button onClick={() => (noBuilding ? setAddingBuilding(true) : setCreating(true))}>
                {noBuilding ? <Building2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {noBuilding ? 'Créer un bâtiment' : 'Nouveau lot'}
              </Button>
            ) : null}
          </div>
        }
      />

      <Tabs
        value={view}
        onChange={setView}
        options={[
          { key: 'lots', label: 'Lots', icon: <Bird /> },
          { key: 'buildings', label: 'Bâtiments', icon: <Warehouse /> },
        ]}
      />

      {view === 'buildings' ? (
        <BuildingsPanel />
      ) : (
        <>
          <ErrorNote error={lots.error} onRetry={() => void lots.refetch()} />
          <SectionCard
            title="Vue d'ensemble"
            icon={<Gauge />}
            actions={
              <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-500">
                Situation au
                <DateInput
                  
                  max={to}
                  value={asOf}
                  onChange={(e) => setAsOf(e.target.value)}
                  className={`${inputCls} w-auto py-1 text-xs`}
                />
              </label>
            }
          >
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
              <Metric label="Oiseaux vivants" icon={<Bird />} value={num(summary.birds)} sub={plural(summary.active, 'lot actif', 'lots actifs')} />
              <OfficialMetric
                label="Mortalité moy."
                icon={<HeartPulse />}
                indicator={headlineIndicator('taux_mortalite')}
                fermiaText={summary.mortality != null ? `${num(summary.mortality)} %` : null}
                fermiaFormula={FERMIA_FORMULAS.mortality}
              />
              <OfficialMetric
                label="IC moyen"
                icon={<Scale />}
                indicator={headlineIndicator('ic')}
                fermiaText={summary.fcr != null ? num(summary.fcr, 2) : null}
                fermiaFormula={FERMIA_FORMULAS.fcr}
              />
              <OfficialMetric
                label="GMQ moyen"
                icon={<TrendingUp />}
                indicator={headlineIndicator('gmq_g_j')}
                fermiaText={summary.gmq != null ? `${num(summary.gmq, 0)} g/j` : null}
                fermiaFormula={FERMIA_FORMULAS.gmq}
              />
              <Metric label="Ponte moyenne" icon={<Egg />} value={summary.lay != null ? `${num(summary.lay)} %` : '—'} />
              <Metric label="Aliment consommé" icon={<Wheat />} value={`${num(summary.feed, 0)} kg`} />
              <Metric label="Œufs collectés" image={EGG_IMAGES.oeuf} value={num(summary.eggs, 0)} />
              <Metric label="En vente" icon={<BadgeCheck />} value={summary.selling} sub={`${summary.ready} prêts à vendre`} />
              <Metric label="Lots critiques" icon={<AlertTriangle />} value={summary.red} tone={summary.red > 0 ? 'bad' : undefined} />
              <Metric label="À surveiller" icon={<Info />} value={summary.yellow} tone={summary.yellow > 0 ? 'warn' : undefined} />
              {canReports ? (
                <>
              <Metric
                label="Encaissé (30 j)"
                icon={<Coins />}
                value={overview.data ? fcfa(overview.data.collectedFcfa) : '—'}
                sub={delta(overview.data?.collectedFcfa, previous.data?.collectedFcfa)}
              />
              <Metric
                label="Résultat net (30 j)"
                icon={overview.data && overview.data.netFcfa < 0 ? <TrendingDown /> : <TrendingUp />}
                value={overview.data ? fcfa(overview.data.netFcfa) : '—'}
                tone={overview.data ? (overview.data.netFcfa >= 0 ? 'good' : 'bad') : undefined}
                sub={delta(overview.data?.netFcfa, previous.data?.netFcfa)}
              />
                </>
              ) : null}
            </div>
            <LotsBreakdown lots={runningLots} historical={!!asOf} />
          </SectionCard>

          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={filter} onChange={setFilter} options={FILTERS} />
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className={`${inputCls} !w-44 !pl-8`}
                placeholder="Rechercher un lot"
                aria-label="Rechercher un lot"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select className={`${inputCls} !w-44`} aria-label="Espèce" value={species} onChange={(e) => setSpecies(e.target.value)}>
              <option value="all">Toutes les espèces</option>
              {Object.entries(SPECIES_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              className={`${inputCls} !w-40`}
              aria-label="État de santé"
              value={healthFilter}
              onChange={(e) => setHealthFilter(e.target.value as HealthFilter)}
            >
              <option value="all">Tous les états</option>
              <option value="ROUGE">{LEVEL_LABEL.ROUGE}</option>
              <option value="JAUNE">{LEVEL_LABEL.JAUNE}</option>
              <option value="VERT">{LEVEL_LABEL.VERT}</option>
            </select>
            <select className={`${inputCls} !w-44`} aria-label="Trier" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="name">Trier par nom</option>
              <option value="age">Trier par âge</option>
              <option value="mortality">Trier par mortalité</option>
              <option value="fcr">Trier par IC</option>
              <option value="live">Trier par effectif</option>
              <option value="health">Trier par état</option>
            </select>
          </div>

          {lots.isLoading ? (
            <Loading label="Chargement des lots…" />
          ) : shown.length === 0 ? (
            <EmptyState
              icon={noBuilding ? <Warehouse /> : <Bird />}
              message={
                noBuilding
                  ? "Commencez par créer un bâtiment, puis installez-y votre premier lot."
                  : all.length === 0
                    ? 'Aucun lot. Créez votre premier lot pour démarrer le suivi.'
                    : 'Aucun lot ne correspond à ces filtres.'
              }
            />
          ) : (
            <Card className="overflow-hidden">
              <DataTable>
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Lot</Th>
                    <Th className="hidden lg:table-cell">Espèce et souche</Th>
                    <Th className="hidden xl:table-cell">Bâtiment</Th>
                    <Th>Âge</Th>
                    <Th>Vivants</Th>
                    <Th>Mortalité (officielle)</Th>
                    <Th>IC (officiel)</Th>
                    <Th className="hidden lg:table-cell">Ponte</Th>
                    <Th>Étape</Th>
                    <Th>État</Th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((b) => {
                    const stage = batchStage(b);
                    const pill = batchStatusPill(b);
                    return (
                      <tr
                        key={b.id}
                        tabIndex={0}
                        onClick={() => selectLot(b.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') selectLot(b.id);
                        }}
                        className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                      >
                        <Td className="font-medium text-brand-700">
                          <span className="flex items-center gap-2.5">
                            <PhotoThumb src={lotImage(b.breedName, b.species)} size="sm" />
                            {lotName(b)}
                          </span>
                        </Td>
                        <Td label="Espèce et souche" className="md:max-lg:hidden">
                          {kindLabel(b)}
                          <span className="block text-xs text-slate-500">{b.breedName ?? b.customBreed ?? '—'}</span>
                        </Td>
                        <Td label="Bâtiment" className="md:max-xl:hidden">{buildingName(b.buildingId)}</Td>
                        <Td label="Âge">J{b.metrics.ageDays}</Td>
                        <Td label="Vivants">{num(b.metrics.liveCount)}</Td>
                        <Td label="Mortalité">
                          <span className="block font-medium">
                            <OfficialValue indicator={officialOf(b.id, 'taux_mortalite')} />
                          </span>
                          <ConduiteValue text={`${num(b.metrics.mortalityPercent)} %`} formula={FERMIA_FORMULAS.mortality} />
                        </Td>
                        <Td label="IC">
                          <span className="block font-medium">
                            <OfficialValue indicator={officialOf(b.id, 'ic')} />
                          </span>
                          <ConduiteValue text={b.metrics.fcr != null ? num(b.metrics.fcr, 2) : '—'} formula={FERMIA_FORMULAS.fcr} />
                        </Td>
                        <Td label="Ponte" className="md:max-lg:hidden">{b.metrics.layRatePercent != null && b.type === 'PONDEUSE' ? `${num(b.metrics.layRatePercent)} %` : '—'}</Td>
                        <Td label="Étape">
                          <Pill tone={stage.tone}>{stage.label}</Pill>
                        </Td>
                        <Td label="État">
                          {pill ? (
                            <Pill tone={pill.tone}>{pill.label}</Pill>
                          ) : b.status === 'CLOTURE' ? (
                            <span className="text-xs text-slate-400">—</span>
                          ) : (
                            <Pill tone={levelTone(b.metrics.status)}>{LEVEL_LABEL[b.metrics.status]}</Pill>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </Card>
          )}
          <BandHistoryCard onOpen={selectLot} />
        </>
      )}

      {creating ? (
        <CreateLotModal
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            selectLot(id);
          }}
        />
      ) : null}
      {entering ? <DailyEntryModal onClose={() => setEntering(false)} /> : null}
      {addingBuilding ? <BuildingFormModal onClose={() => setAddingBuilding(false)} /> : null}
    </div>
  );
}

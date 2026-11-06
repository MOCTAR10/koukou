import {
  CalendarClock,
  CalendarDays,
  ChevronRight,
  Layers3,
  MapIcon,
  Pencil,
  PiggyBank,
  Plus,
  Sprout,
  Wheat,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Parcelle } from '../api/types-agri';
import { useFarm } from '../app/FarmContext';
import { useFarmProfile } from '../app/useFarmProfile';
import { Button, ErrorNote } from '../components/form';
import { Card, DataTable, EmptyState, IconTile, Loading, PageHeader, StatCard, Td, Th } from '../components/ui';
import { ParcelleStatusBadge, StageSummary } from '../components/agri/AgriBits';
import { ParcelleFormModal } from '../components/agri/ParcelleFormModal';
import { ParcelleMapPanel } from '../components/agri/ParcelleMap';
import { Tabs } from '../components/flock/shared';
import {
  adviceForCulture,
  CROP_CATEGORY_LABELS,
  cultureStage,
  formatArea,
  harvestDateFr,
  hectaresToM2Label,
  RECOLTE_UNIT_LABELS,
  useParcelles,
  useRecolteStock,
} from '../components/agri/agri';
import { dateFr, num } from '../lib/format';

type Editor = { parcelle: Parcelle | null };

export function ParcelsPage() {
  const { farmId } = useFarm();
  const { hasPermission } = useFarmProfile();
  const canManage = hasPermission('agri:gerer');
  const parcellesQuery = useParcelles(farmId);
  const stockQuery = useRecolteStock(farmId);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [view, setView] = useState<'liste' | 'carte'>('liste');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const parcelles = useMemo(() => parcellesQuery.data ?? [], [parcellesQuery.data]);
  const sorted = useMemo(
    () => [...parcelles].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [parcelles],
  );

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
    };
  }, [parcelles]);

  const topStock = useMemo(
    () => [...(stockQuery.data ?? [])].sort((a, b) => b.available - a.available).slice(0, 2),
    [stockQuery.data],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parcelles"
        subtitle="Terres et cultures de la ferme."
        icon={<Sprout />}
        iconTone="green"
        actions={
          canManage ? (
            <Button onClick={() => setEditor({ parcelle: null })}>
              <Plus className="h-4 w-4" /> Nouvelle parcelle
            </Button>
          ) : undefined
        }
      />

      <ErrorNote error={parcellesQuery.error} />

      {parcellesQuery.isPending ? (
        <Loading />
      ) : parcellesQuery.isError ? null : parcelles.length === 0 ? (
        <EmptyState
          message="Aucune parcelle. Ajoutez votre première parcelle et choisissez sa culture."
          icon={<Sprout />}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Surface exploitée"
              value={`${num(stats.totalHa, 2)} ha`}
              hint={hectaresToM2Label(stats.totalHa)}
              icon={<Layers3 className="h-5 w-5" />}
            />
            <StatCard
              label="Parcelles actives"
              value={stats.actives}
              hint={`sur ${parcelles.length} au total`}
              icon={<Sprout className="h-5 w-5" />}
            />
            <StatCard
              label="Cultures en cours"
              value={stats.culturesEnCours}
              hint="plantées sur une parcelle active"
              icon={<Wheat className="h-5 w-5" />}
            />
          </div>

          {stats.next || topStock.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {stats.next ? (
                <HighlightCard
                  icon={<CalendarClock />}
                  label="Prochaine récolte estimée"
                  title={`${stats.next.parcelle.name} : ${harvestDateFr(stats.next.stage?.harvestDate ?? null)}`}
                  detail={adviceForCulture(stats.next.parcelle.culture)}
                />
              ) : null}
              {topStock.length > 0 ? (
                <HighlightCard
                  icon={<PiggyBank />}
                  label="Récoltes vendables"
                  title={topStock
                    .map((s) => `${s.parcelleName} : ${num(s.available, 2)} ${RECOLTE_UNIT_LABELS[s.unit]}`)
                    .join(' · ')}
                  detail="Récolté moins vendu, au point de vente Ferme."
                />
              ) : null}
            </div>
          ) : null}

          <Tabs
            value={view}
            onChange={setView}
            options={[
              { key: 'liste', label: 'Liste', icon: <Layers3 /> },
              { key: 'carte', label: 'Carte', icon: <MapIcon /> },
            ]}
          />

          {view === 'carte' ? (
            <ParcelleMapPanel
              parcelles={sorted}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onEdit={(parcelle) => setEditor({ parcelle })}
            />
          ) : (
          <Card className="overflow-hidden">
            <DataTable>
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Parcelle</Th>
                    <Th>Culture</Th>
                    <Th className="hidden lg:table-cell">Surface</Th>
                    <Th className="hidden lg:table-cell">Plantation</Th>
                    <Th className="w-72">Suivi</Th>
                    <Th>Statut</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p) => {
                    const stage =
                      p.status === 'ACTIVE' ? cultureStage(p.plantedAt, p.culture.defaultCycleDays) : null;
                    return (
                      <tr key={p.id} className="border-t border-slate-100">
                        <Td className="font-medium text-slate-900">{p.name}</Td>
                        <Td label="Culture">
                          {p.culture.name}
                          <span className="block text-xs text-slate-500">
                            {CROP_CATEGORY_LABELS[p.culture.category]}
                          </span>
                        </Td>
                        <Td label="Surface" className="whitespace-nowrap tabular-nums md:max-lg:hidden">{formatArea(p)}</Td>
                        <Td label="Plantation" className="whitespace-nowrap md:max-lg:hidden">
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                            {p.plantedAt ? dateFr(p.plantedAt) : 'Non plantée'}
                          </span>
                        </Td>
                        <Td label="Suivi">{stage ? <StageSummary stage={stage} /> : <span className="text-slate-400">—</span>}</Td>
                        <Td label="Statut">
                          <ParcelleStatusBadge status={p.status} />
                        </Td>
                        <Td className="whitespace-nowrap text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedId(p.id);
                              setView('carte');
                            }}
                            className="mr-2 inline-flex rounded-lg p-2 align-middle text-brand-700 hover:bg-brand-50"
                            aria-label={`Voir ${p.name} sur la carte`}
                          >
                            <MapIcon className="h-4 w-4" />
                          </button>
                          {canManage ? (
                            <Button tone="secondary" onClick={() => setEditor({ parcelle: p })}>
                              <Pencil className="h-4 w-4" />
                              Modifier
                            </Button>
                          ) : null}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
          </Card>
          )}
        </>
      )}

      {editor ? <ParcelleFormModal parcelle={editor.parcelle} onClose={() => setEditor(null)} /> : null}
    </div>
  );
}

function HighlightCard({
  icon,
  label,
  title,
  detail,
}: {
  icon: ReactNode;
  label: string;
  title: string;
  detail: string;
}) {
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

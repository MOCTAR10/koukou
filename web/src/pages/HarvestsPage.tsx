import { ArrowRight, CalendarClock, Lightbulb, Package, PiggyBank, Plus, Sprout, Tractor, Wheat } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFarm } from '../app/FarmContext';
import { useFarmProfile } from '../app/useFarmProfile';
import { Button, ErrorNote } from '../components/form';
import { Card, EmptyState, IconTile, Loading, PageHeader, StatCard, Td, Th } from '../components/ui';
import { ParcelleStatusBadge, StageSummary } from '../components/agri/AgriBits';
import { RecolteFormModal } from '../components/agri/RecolteFormModal';
import {
  adviceForCulture,
  CROP_CATEGORY_LABELS,
  cultureStage,
  RECOLTE_UNIT_LABELS,
  useParcelles,
  useRecoltes,
  useRecolteStock,
} from '../components/agri/agri';
import { dateFr, num } from '../lib/format';

export function HarvestsPage() {
  const { farmId } = useFarm();
  const { hasPermission } = useFarmProfile();
  const canManage = hasPermission('agri:gerer');
  const parcellesQuery = useParcelles(farmId);
  const recoltesQuery = useRecoltes(farmId);
  const stockQuery = useRecolteStock(farmId);
  const [formOpen, setFormOpen] = useState(false);

  const parcelles = useMemo(() => parcellesQuery.data ?? [], [parcellesQuery.data]);
  const recoltes = recoltesQuery.data ?? [];
  const stock = stockQuery.data ?? [];
  const byId = useMemo(() => new Map(parcelles.map((p) => [p.id, p])), [parcelles]);

  const plan = useMemo(() => {
    const withStage = parcelles
      .filter((p) => p.status !== 'CLOTURE')
      .map((p) => ({ parcelle: p, stage: cultureStage(p.plantedAt, p.culture.defaultCycleDays) }))
      // Soonest deadline first, parcels with no deadline last.
      .sort(
        (a, b) =>
          (a.stage?.harvestDate?.getTime() ?? Infinity) - (b.stage?.harvestDate?.getTime() ?? Infinity),
      );
    return {
      withStage,
      // A crop with no known cycle has no deadline to count.
      dueSoon: withStage.filter(({ stage }) => stage?.harvestDate && stage.daysRemaining <= 30).length,
      planted: withStage.filter(({ parcelle }) => parcelle.plantedAt).length,
    };
  }, [parcelles]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Récoltes et suivi"
        subtitle="Échéances, journal des récoltes et stock vendable."
        icon={<Tractor />}
        iconTone="green"
        actions={
          parcelles.length > 0 && canManage ? (
            <Button onClick={() => setFormOpen(true)}>
              <Wheat className="h-4 w-4" /> Journaliser une récolte
            </Button>
          ) : null
        }
      />

      <ErrorNote error={parcellesQuery.error ?? recoltesQuery.error ?? stockQuery.error} />

      {parcellesQuery.isPending ? (
        <Loading />
      ) : parcellesQuery.isError ? null : parcelles.length === 0 ? (
        <div className="space-y-3">
          <EmptyState
            message="Aucune parcelle à suivre. Enregistrez vos parcelles et leurs cultures : vous verrez ici les stades de croissance, les échéances de récolte et des conseils adaptés."
            icon={<Tractor />}
          />
          {canManage ? (
            <div className="text-center">
              <Link
                to="/app/parcels"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"
              >
                <Plus className="h-4 w-4" />
                Ajouter une parcelle
              </Link>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Échéances à 30 jours"
              value={plan.dueSoon}
              hint="récoltes proches"
              tone={plan.dueSoon > 0 ? 'warn' : 'default'}
              icon={<CalendarClock className="h-5 w-5" />}
            />
            <StatCard
              label="Parcelles plantées"
              value={`${plan.planted}/${plan.withStage.length}`}
              hint="en cours"
              icon={<Sprout className="h-5 w-5" />}
            />
            <StatCard
              label="Lignes en stock"
              value={stock.length}
              hint="récolté moins vendu"
              icon={<Package className="h-5 w-5" />}
            />
          </div>

          <div className="grid items-start gap-6 xl:grid-cols-5">
            <section className="space-y-3 xl:col-span-3">
              <h2 className="flex items-center gap-2.5 text-base font-semibold text-slate-900">
                <IconTile icon={<Wheat />} tone="green" size="sm" />
                Journal des récoltes
              </h2>
              {recoltesQuery.isPending ? (
                <Loading />
              ) : recoltes.length === 0 ? (
                <EmptyState message="Aucune récolte journalisée pour le moment." icon={<Wheat />} />
              ) : (
                <Card className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <Th>Date</Th>
                          <Th>Parcelle</Th>
                          <Th className="text-right">Quantité</Th>
                          <Th>Notes</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {recoltes.map((r) => {
                          const parcelle = byId.get(r.parcelleId);
                          return (
                            <tr key={r.id} className="border-t border-slate-100">
                              <Td className="whitespace-nowrap">{dateFr(r.harvestDate)}</Td>
                              <Td className="font-medium text-slate-900">
                                {parcelle?.name ?? 'Parcelle'}
                                {parcelle ? (
                                  <span className="block text-xs font-normal text-slate-500">
                                    {parcelle.culture.name}
                                  </span>
                                ) : null}
                              </Td>
                              <Td className="whitespace-nowrap text-right tabular-nums">
                                {num(r.quantity, 2)} {RECOLTE_UNIT_LABELS[r.unit]}
                              </Td>
                              <Td className="text-slate-500">{r.notes ?? '—'}</Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </section>

            <section className="space-y-3 xl:col-span-2">
              <h2 className="flex items-center gap-2.5 text-base font-semibold text-slate-900">
                <IconTile icon={<PiggyBank />} tone="green" size="sm" />
                Stock vendable
              </h2>
              {stockQuery.isPending ? (
                <Loading />
              ) : stock.length === 0 ? (
                <EmptyState
                  message="Le stock vendable se calcule dès qu’une récolte est journalisée (récolté moins vendu)."
                  icon={<PiggyBank />}
                />
              ) : (
                <Card className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <Th>Parcelle</Th>
                          <Th className="text-right">Récolté</Th>
                          <Th className="text-right">Vendu</Th>
                          <Th className="text-right">Restant</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {stock.map((s) => (
                          <tr key={`${s.parcelleId}:${s.unit}`} className="border-t border-slate-100">
                            <Td className="font-medium text-slate-900">
                              {s.parcelleName}
                              {s.cultureName ? (
                                <span className="block text-xs font-normal text-slate-500">{s.cultureName}</span>
                              ) : null}
                            </Td>
                            <Td className="whitespace-nowrap text-right tabular-nums">{num(s.harvested, 2)}</Td>
                            <Td className="whitespace-nowrap text-right tabular-nums">{num(s.sold, 2)}</Td>
                            <Td className="whitespace-nowrap text-right font-semibold tabular-nums text-emerald-700">
                              {num(s.available, 2)} {RECOLTE_UNIT_LABELS[s.unit]}
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
              <p className="text-xs text-slate-400">Se vend au point de vente Ferme avec l’article « Récolte ».</p>
            </section>
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2.5 text-base font-semibold text-slate-900">
                <IconTile icon={<Sprout />} tone="green" size="sm" />
                Parcelles et cultures
              </h2>
              {canManage ? (
                <Link
                  to="/app/parcels"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"
                >
                  Gérer les parcelles
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
            {plan.withStage.length === 0 ? (
              <EmptyState message="Toutes les parcelles sont clôturées." icon={<Sprout />} />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {plan.withStage.map(({ parcelle, stage }) => (
                  <Card key={parcelle.id} className="flex flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-3">
                        <IconTile icon={<Sprout />} tone="green" />
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">{parcelle.name}</p>
                          <p className="text-sm text-slate-500">
                            {parcelle.culture.name} · {CROP_CATEGORY_LABELS[parcelle.culture.category]}
                          </p>
                        </div>
                      </div>
                      <ParcelleStatusBadge status={parcelle.status} />
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      {stage ? (
                        <StageSummary stage={stage} culture={parcelle.culture} />
                      ) : (
                        <>
                          <p className="text-xs font-semibold text-slate-800">Non plantée</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {parcelle.status === 'ACTIVE'
                              ? 'Date de plantation à renseigner'
                              : 'À préparer pour la plantation'}
                          </p>
                        </>
                      )}
                    </div>
                    <div className="flex items-start gap-2 text-sm text-slate-600">
                      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                      <span>{adviceForCulture(parcelle.culture)}</span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {formOpen ? <RecolteFormModal parcelles={parcelles} onClose={() => setFormOpen(false)} /> : null}
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Home, MapPin, Package, Pencil, Plus, RotateCcw, Star, Store, Trash2, TrendingUp, Trophy, Wheat } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '../api/client';
import type { PointOfSale, PosSale, StockTransfer, StockTransferProductType } from '../api/types-orders';
import { useFarm } from '../app/FarmContext';
import { Button, ErrorNote, todayIso } from '../components/form';
import { addDaysIso, invalidateTransferQueries } from '../components/orders/helpers';
import { PointOfSaleFormModal } from '../components/orders/PointOfSaleFormModal';
import { ConfirmDialog, Pill, ProvinceSelect, Segmented } from '../components/orders/shared';
import { TransferModal } from '../components/orders/TransferModal';
import { batchPhoto } from '../components/sales/pos';
import { Card, EmptyState, IconTile, Loading, PageHeader, PhotoThumb, StatCard, Td, Th } from '../components/ui';
import { fcfa, num } from '../lib/format';

type PeriodKey = 'today' | 'week' | 'month';

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Aujourd’hui' },
  { key: 'week', label: '7 jours' },
  { key: 'month', label: '30 jours' },
];

const PRODUCT_BUCKET: Record<string, string> = {
  POULET_PIECE: 'Vivant',
  POULET_KG: 'Vivant',
  ABATTU_PIECE: 'Abattu',
  ABATTU_KG: 'Abattu',
  OEUFS: 'Œufs',
  PROVENDE: 'Provende',
  AUTRE: 'Autre',
};

const TRANSFER_PRODUCT: Record<StockTransferProductType, { label: string; tone: string }> = {
  ABATTU: { label: 'Abattu', tone: 'bg-amber-50 text-amber-700 ring-amber-200' },
  OEUFS: { label: 'Œufs', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  PROVENDE: { label: 'Provende', tone: 'bg-brand-50 text-brand-700 ring-brand-200' },
};

interface RangeStats {
  revenue: number;
  count: number;
  products: Record<string, number>;
}

type PosStats = Record<PeriodKey, RangeStats>;

const emptyRange = (): RangeStats => ({ revenue: 0, count: 0, products: {} });
const emptyStats = (): PosStats => ({ today: emptyRange(), week: emptyRange(), month: emptyRange() });

function remainingOf(t: StockTransfer): number {
  return Math.max(t.quantity - t.quantitySold, 0);
}

function transferUnit(t: StockTransfer): string {
  if (t.productType === 'ABATTU') return 'carcasses';
  if (t.productType === 'OEUFS') return 'alvéoles';
  return t.unit === 'KG' ? 'kg' : t.unit === 'SAC' ? 'sacs' : 'unités';
}

function transferSource(t: StockTransfer): { name: string; detail: string } {
  if (t.productType === 'ABATTU') {
    return { name: t.slaughterOrder?.batch?.batchName ?? 'Carcasses', detail: t.slaughterOrder?.referenceNumber ?? '' };
  }
  if (t.productType === 'OEUFS') {
    return { name: t.batch?.batchName ?? 'Œufs', detail: 'Œufs réservés' };
  }
  return { name: t.inputLot?.productName ?? 'Provende', detail: t.inputLot?.supplierLotNumber ?? '' };
}

function PosTable({
  rows,
  stats,
  stock,
  period,
  onEdit,
  onDelete,
}: {
  rows: PointOfSale[];
  stats: Map<string, PosStats>;
  stock: Map<string, { carried: number; remaining: number }>;
  period: PeriodKey;
  onEdit: (p: PointOfSale) => void;
  onDelete: (p: PointOfSale) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <Th>Nom</Th>
              <Th>Lieu</Th>
              <Th>Statut</Th>
              <Th className="text-right">Ventes</Th>
              <Th className="text-right">Tickets</Th>
              <Th>Répartition</Th>
              <Th>Stock</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const range = (stats.get(p.id) ?? emptyStats())[period];
              const products = Object.entries(range.products).sort((a, b) => b[1] - a[1]);
              const reserve = stock.get(p.id);
              return (
                <tr key={p.id} className="border-t border-slate-100">
                  <Td className="font-medium">
                    <span className="flex items-center gap-2">
                      <IconTile icon={p.kind === 'BOUTIQUE' ? <Store /> : <Home />} tone={p.kind === 'BOUTIQUE' ? 'accent' : 'brand'} size="sm" />
                      {p.name}
                      {p.isDefault ? <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Ferme mère" /> : null}
                    </span>
                  </Td>
                  <Td>{[p.province, p.address].filter(Boolean).join(' · ') || '—'}</Td>
                  <Td>
                    <Pill tone={p.isActive ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}>
                      {p.isActive ? 'Actif' : 'En pause'}
                    </Pill>
                  </Td>
                  <Td className="whitespace-nowrap text-right font-medium tabular-nums">{fcfa(range.revenue)}</Td>
                  <Td className="text-right tabular-nums">{num(range.count, 0)}</Td>
                  <Td>
                    {products.length > 0 ? (
                      <span className="flex flex-wrap gap-1">
                        {products.slice(0, 4).map(([label, amount]) => (
                          <span key={label} className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                            <b className="font-semibold text-slate-700">{label}</b> {num(amount, 0)}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </Td>
                  <Td className="text-xs">
                    {p.kind === 'FERME' ? (
                      'Vivant, abattu, œufs et provende'
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-accent-700" />
                        {reserve ? `${num(reserve.remaining, 0)} unité(s), ${num(reserve.carried, 0)} transfert(s)` : 'Aucun transfert'}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <span className="flex justify-end gap-1">
                      <button
                        type="button"
                        aria-label={`Modifier ${p.name}`}
                        title="Modifier"
                        onClick={() => onEdit(p)}
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {p.isDefault ? null : (
                        <button
                          type="button"
                          aria-label={`Supprimer ${p.name}`}
                          title="Supprimer"
                          onClick={() => onDelete(p)}
                          className="rounded p-1.5 text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

type StatusFilter = 'ALL' | 'ACTIVE' | 'PAUSED';

export function PointsOfSalePage() {
  const { farmId } = useFarm();
  const queryClient = useQueryClient();
  const today = todayIso();
  const from7 = addDaysIso(today, -6);
  const from30 = addDaysIso(today, -29);

  const [period, setPeriod] = useState<PeriodKey>('week');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [provinceFilter, setProvinceFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PointOfSale | undefined>(undefined);
  const [toDelete, setToDelete] = useState<PointOfSale | null>(null);
  const [toCancel, setToCancel] = useState<StockTransfer | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  const pdvQuery = useQuery({
    queryKey: ['points-of-sale', farmId],
    queryFn: () => api.get<PointOfSale[]>(`/farms/${farmId}/points-of-sale`),
    enabled: !!farmId,
  });
  const salesQuery = useQuery({
    queryKey: ['sales', farmId, from30, today],
    queryFn: () => api.get<PosSale[]>(`/farms/${farmId}/sales?from=${from30}&to=${today}`),
    enabled: !!farmId,
  });
  const transfersQuery = useQuery({
    queryKey: ['stock-transfers', farmId],
    queryFn: () => api.get<StockTransfer[]>(`/farms/${farmId}/stock-transfers`),
    enabled: !!farmId,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/farms/${farmId}/points-of-sale/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['points-of-sale', farmId] });
      setToDelete(null);
    },
  });
  const cancelTransfer = useMutation({
    mutationFn: (id: string) => api.post(`/farms/${farmId}/stock-transfers/${id}/cancel`),
    onSuccess: () => {
      invalidateTransferQueries(queryClient, farmId);
      setToCancel(null);
    },
  });

  const pdvs = useMemo(() => pdvQuery.data ?? [], [pdvQuery.data]);
  const farms = pdvs.filter((p) => p.kind === 'FERME');
  const boutiques = pdvs.filter((p) => p.kind === 'BOUTIQUE');
  const activeBoutiques = boutiques.filter((p) => p.isActive);
  const filtered = boutiques.filter((p) => {
    if (statusFilter === 'ACTIVE' && !p.isActive) return false;
    if (statusFilter === 'PAUSED' && p.isActive) return false;
    return !provinceFilter || p.province === provinceFilter;
  });

  const stats = useMemo(() => {
    const map = new Map<string, PosStats>();
    for (const s of salesQuery.data ?? []) {
      if (s.status === 'CANCELLED' || !s.pointOfSaleId) continue;
      const entry = map.get(s.pointOfSaleId) ?? emptyStats();
      const day = s.saleDate.slice(0, 10);
      const ranges: RangeStats[] = [entry.month];
      if (day >= from7) ranges.push(entry.week);
      if (day === today) ranges.push(entry.today);
      for (const range of ranges) {
        range.revenue += s.totalAmountFcfa;
        range.count += 1;
        for (const it of s.items ?? []) {
          const bucket = PRODUCT_BUCKET[it.productType] ?? 'Autre';
          range.products[bucket] = (range.products[bucket] ?? 0) + it.amountFcfa;
        }
      }
      map.set(s.pointOfSaleId, entry);
    }
    return map;
  }, [salesQuery.data, from7, today]);

  const activeTransfers = (transfersQuery.data ?? []).filter((t) => t.status === 'TRANSFERRED' && remainingOf(t) > 0);

  const stock = useMemo(() => {
    const map = new Map<string, { carried: number; remaining: number }>();
    for (const t of transfersQuery.data ?? []) {
      const remaining = remainingOf(t);
      if (t.status !== 'TRANSFERRED' || remaining <= 0) continue;
      const cur = map.get(t.pointOfSaleId) ?? { carried: 0, remaining: 0 };
      cur.carried += 1;
      cur.remaining += remaining;
      map.set(t.pointOfSaleId, cur);
    }
    return map;
  }, [transfersQuery.data]);

  const weekTotal = pdvs.reduce((a, p) => a + (stats.get(p.id)?.week.revenue ?? 0), 0);
  const weekCount = pdvs.reduce((a, p) => a + (stats.get(p.id)?.week.count ?? 0), 0);
  const topToday = pdvs.reduce<{ name: string; revenue: number } | null>((best, p) => {
    const revenue = stats.get(p.id)?.today.revenue ?? 0;
    return revenue > 0 && (!best || revenue > best.revenue) ? { name: p.name, revenue } : best;
  }, null);

  const openNew = () => {
    setEditing(undefined);
    setFormOpen(true);
  };
  const openEdit = (p: PointOfSale) => {
    setEditing(p);
    setFormOpen(true);
  };

  const closeDelete = () => {
    setToDelete(null);
    remove.reset();
  };
  const closeCancel = () => {
    setToCancel(null);
    cancelTransfer.reset();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Points de vente"
        subtitle="La ferme mère et ses points de vente rattachés, partout au Gabon."
        icon={<MapPin />}
        actions={
          <>
            <Button tone="secondary" onClick={() => setTransferOpen(true)}>
              <ArrowRightLeft className="h-4 w-4" /> Transférer du stock
            </Button>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" /> Nouveau point de vente
            </Button>
          </>
        }
      />

      <ErrorNote error={pdvQuery.error ?? salesQuery.error ?? transfersQuery.error} />

      {pdvQuery.isLoading ? (
        <Loading label="Chargement des points de vente…" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Revenu sur 7 jours" value={fcfa(weekTotal)} hint={`${num(weekCount, 0)} vente(s)`} tone="accent" icon={<TrendingUp />} />
            <StatCard label="Points actifs" value={num(pdvs.filter((p) => p.isActive).length, 0)} hint="Ferme comprise" icon={<MapPin />} />
            <StatCard label="Points rattachés" value={num(boutiques.length, 0)} hint="Hors ferme mère" icon={<Store />} />
            <StatCard
              label="Meilleur canal du jour"
              icon={<Trophy />}
              value={topToday ? fcfa(topToday.revenue) : '—'}
              hint={topToday ? topToday.name : 'Aucune vente enregistrée aujourd’hui'}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium text-slate-500">Période des ventes</span>
            <Segmented<PeriodKey> ariaLabel="Période des ventes" value={period} onChange={setPeriod} options={PERIODS} />
          </div>

          <section className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Home className="h-4 w-4 text-brand-600" /> Ferme mère
            </h2>
            {farms.length > 0 ? (
              <PosTable rows={farms} stats={stats} stock={stock} period={period} onEdit={openEdit} onDelete={setToDelete} />
            ) : (
              <EmptyState icon={<Home />} message="Aucune ferme. Le point « ferme » vend directement sur l’exploitation." />
            )}
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Store className="h-4 w-4 text-brand-600" /> Points de vente ({num(filtered.length, 0)})
              </h2>
              <div className="flex flex-wrap items-center gap-3">
                <Segmented<StatusFilter>
                  ariaLabel="Filtrer par statut"
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[
                    { key: 'ALL', label: 'Tous' },
                    { key: 'ACTIVE', label: 'Actifs' },
                    { key: 'PAUSED', label: 'En pause' },
                  ]}
                />
                <div className="w-56">
                  <ProvinceSelect
                    ariaLabel="Filtrer par province"
                    value={provinceFilter}
                    onChange={setProvinceFilter}
                    emptyLabel="Toutes les provinces"
                  />
                </div>
              </div>
            </div>
            {filtered.length > 0 ? (
              <PosTable rows={filtered} stats={stats} stock={stock} period={period} onEdit={openEdit} onDelete={setToDelete} />
            ) : (
              <EmptyState
                icon={<Store />}
                message={
                  boutiques.length > 0
                    ? 'Aucun point de vente ne correspond aux filtres : ajustez le statut ou la province.'
                    : 'Ouvrez un point de vente près de vos clients. Mêmes produits qu’à la ferme : vivant, abattu, œufs et provende.'
                }
              />
            )}
          </section>

          <section className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Package className="h-4 w-4 text-brand-600" /> Réserves actives en boutique ({num(activeTransfers.length, 0)})
            </h2>
            {activeTransfers.length > 0 ? (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <Th>Produit</Th>
                        <Th>Source</Th>
                        <Th>Destination</Th>
                        <Th className="text-right">Restant / transféré</Th>
                        <Th className="text-right">Actions</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeTransfers.map((t) => {
                        const source = transferSource(t);
                        const product = TRANSFER_PRODUCT[t.productType];
                        return (
                          <tr key={t.id} className="border-t border-slate-100">
                            <Td>
                              <Pill tone={product.tone}>{product.label}</Pill>
                            </Td>
                            <Td className="font-medium">
                              <span className="flex items-center gap-2.5">
                                {t.productType === 'PROVENDE' ? (
                                  <IconTile icon={<Wheat />} tone="amber" size="sm" />
                                ) : (
                                  <PhotoThumb src={batchPhoto(t.slaughterOrder?.batch ?? t.batch)} size="sm" />
                                )}
                                <span className="min-w-0">
                                  {source.name}
                                  {source.detail ? <span className="block text-xs font-normal text-slate-500">{source.detail}</span> : null}
                                </span>
                              </span>
                            </Td>
                            <Td>{t.pointOfSale.name}</Td>
                            <Td className="whitespace-nowrap text-right tabular-nums">
                              {num(remainingOf(t), 0)} / {num(t.quantity, 0)} {transferUnit(t)}
                            </Td>
                            <Td>
                              <span className="flex justify-end">
                                <Button tone="secondary" onClick={() => setToCancel(t)} aria-label={`Annuler le transfert ${source.name}`}>
                                  <RotateCcw className="h-4 w-4" /> Annuler
                                </Button>
                              </span>
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : (
              <EmptyState icon={<Package />} message="Aucune réserve active. Transférez du stock depuis la ferme (carcasses, œufs ou provende) pour le vendre en boutique." />
            )}
          </section>
        </>
      )}

      {formOpen ? <PointOfSaleFormModal key={editing?.id ?? 'new'} initial={editing} onClose={() => setFormOpen(false)} /> : null}
      {transferOpen ? <TransferModal boutiques={activeBoutiques} onClose={() => setTransferOpen(false)} /> : null}
      {toDelete ? (
        <ConfirmDialog
          title="Supprimer ce point de vente ?"
          confirmLabel="Supprimer définitivement"
          confirmIcon={<Trash2 className="h-4 w-4" />}
          busy={remove.isPending}
          error={remove.error}
          onConfirm={() => remove.mutate(toDelete.id)}
          onClose={closeDelete}
          message={
            <p>
              <b>{toDelete.name}</b> : les ventes restent enregistrées, mais il disparaîtra de la caisse. Un point de vente qui a reçu des
              transferts ne peut pas être supprimé : mettez-le en pause.
            </p>
          }
        />
      ) : null}
      {toCancel ? (
        <ConfirmDialog
          title="Annuler ce transfert ?"
          confirmLabel="Annuler le transfert"
          confirmIcon={<RotateCcw className="h-4 w-4" />}
          busy={cancelTransfer.isPending}
          error={cancelTransfer.error}
          onConfirm={() => cancelTransfer.mutate(toCancel.id)}
          onClose={closeCancel}
          message={
            <p>
              {num(remainingOf(toCancel), 0)} {transferUnit(toCancel)} non vendu(s) de « {toCancel.pointOfSale.name} » retourneront au stock
              source.
            </p>
          }
        />
      ) : null}
    </div>
  );
}

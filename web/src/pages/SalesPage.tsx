import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRightLeft, Coins, Home, Layers, Package, Pencil, Plus, ReceiptText, ShoppingCart, Store, Trash2, TrendingUp, Warehouse } from 'lucide-react';
import { api } from '../api/client';
import type { CashSession, FeedStockSummary } from '../api/types';
import type {
  CaisseSummary,
  CarcassPool,
  ParcelleStock,
  PointOfSale,
  PosBatch,
  SaleFull,
  StockTransfer,
} from '../api/types-sales';
import { useFarm } from '../app/FarmContext';
import { Button, ErrorNote, todayIso } from '../components/form';
import { Card, EmptyState, IconTile, Loading, PageHeader, PhotoThumb, StatCard, Th, Td } from '../components/ui';
import { Checkout } from '../components/sales/Checkout';
import { LineForm, type LinePreset } from '../components/sales/LineForm';
import {
  batchPhoto,
  formatEggAlveoles,
  lastClosingOf,
  lineAmount,
  transferRemaining,
  transferTitle,
  transferUnitLabel,
  type PosLine,
} from '../components/sales/pos';
import { FilterChip, ProductThumb } from '../components/sales/shared';
import { SalesHistory } from '../components/sales/SalesHistory';
import { unitLabel } from '../components/sales/labels';
import { classNames, fcfa, num, statusLabel } from '../lib/format';

type LineModal = { initial?: PosLine; preset?: LinePreset };

export function SalesPage() {
  const { farmId, farm } = useFarm();
  const [params, setParams] = useSearchParams();
  const today = todayIso();

  const [posId, setPosId] = useState('');
  const [lines, setLines] = useState<PosLine[]>([]);
  const [lineModal, setLineModal] = useState<LineModal | null>(null);
  const [typeFilter, setTypeFilter] = useState<'TOUS' | 'CHAIR' | 'PONDEUSE'>('TOUS');
  const [stockFilter, setStockFilter] = useState<'A_VENDRE' | 'FERMES' | 'TOUS'>('A_VENDRE');
  const [reserveFilter, setReserveFilter] = useState<'TOUS' | 'ABATTU' | 'OEUFS' | 'PROVENDE'>('TOUS');

  // A basket built on one farm must never be sent to another one.
  const basketFarm = useRef(farmId);
  useEffect(() => {
    if (basketFarm.current === farmId) return;
    basketFarm.current = farmId;
    setLines([]);
    setPosId('');
  }, [farmId]);

  const enabled = !!farmId;
  const pointsOfSale = useQuery({
    queryKey: ['points-of-sale', farmId],
    queryFn: () => api.get<PointOfSale[]>(`/farms/${farmId}/points-of-sale`),
    enabled,
  });
  const batches = useQuery({
    queryKey: ['batches', farmId],
    queryFn: () => api.get<PosBatch[]>(`/farms/${farmId}/batches`),
    enabled,
  });
  const slaughter = useQuery({
    queryKey: ['slaughter', farmId],
    queryFn: () => api.get<CarcassPool[]>(`/farms/${farmId}/slaughter-orders`),
    enabled,
  });
  const transfers = useQuery({
    queryKey: ['stock-transfers', farmId],
    queryFn: () => api.get<StockTransfer[]>(`/farms/${farmId}/stock-transfers`),
    enabled,
  });
  const feedStock = useQuery({
    queryKey: ['feed-stock', farmId],
    queryFn: () => api.get<FeedStockSummary>(`/farms/${farmId}/feed-stock`),
    enabled,
  });
  const recolte = useQuery({
    queryKey: ['recoltes-stock', farmId],
    queryFn: () => api.get<ParcelleStock[]>(`/farms/${farmId}/recoltes/stock`),
    enabled,
  });
  const salesToday = useQuery({
    queryKey: ['sales', farmId, 'today', today],
    queryFn: () => api.get<SaleFull[]>(`/farms/${farmId}/sales?from=${today}&to=${today}`),
    enabled,
  });
  const caisse = useQuery({
    queryKey: ['caisse-current', farmId],
    queryFn: () => api.get<CaisseSummary | null>(`/farms/${farmId}/caisse/current`),
    enabled,
  });
  const caisseSessions = useQuery({
    queryKey: ['caisse-sessions', farmId],
    queryFn: () => api.get<CashSession[]>(`/farms/${farmId}/caisse/sessions`),
    enabled,
  });

  const allPos = useMemo(() => pointsOfSale.data ?? [], [pointsOfSale.data]);
  const activePos = useMemo(() => allPos.filter((p) => p.isActive), [allPos]);
  const pos = activePos.find((p) => p.id === posId) ?? null;
  const isBoutique = pos?.kind === 'BOUTIQUE';
  const onlyPosId = activePos.length === 1 ? activePos[0]!.id : '';

  useEffect(() => {
    if (!posId && onlyPosId) setPosId(onlyPosId);
  }, [posId, onlyPosId]);

  const allBatches = useMemo(() => batches.data ?? [], [batches.data]);
  const lots = useMemo(
    () => allBatches.filter((b) => b.quantityAlive > 0 && (b.status === 'EN_VENTE' || b.status === 'ACTIF')),
    [allBatches],
  );
  const pools = useMemo(
    () =>
      (slaughter.data ?? []).filter(
        (o) => o.status === 'PROCESSED' && o.slaughterType === 'ABATTU' && (o.carcassesAvailable ?? 0) > 0,
      ),
    [slaughter.data],
  );
  const carcassesByBatch = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of pools) map.set(p.batchId, (map.get(p.batchId) ?? 0) + (p.carcassesAvailable ?? 0));
    return map;
  }, [pools]);
  const reserves = useMemo(
    () =>
      (transfers.data ?? []).filter(
        (t) => t.status === 'TRANSFERRED' && t.pointOfSaleId === posId && transferRemaining(t) > 0,
      ),
    [transfers.data, posId],
  );
  const feedLots = useMemo(
    () => (feedStock.data?.lots ?? []).filter((l) => l.entryType !== 'MEDICAMENT' && l.availableKg > 0),
    [feedStock.data],
  );
  const sellableRecolte = useMemo(() => (recolte.data ?? []).filter((s) => s.available > 0), [recolte.data]);

  const hasEggs = (b: PosBatch) => (b.metrics.eggStockAvailableEggs ?? 0) > 0;
  const hasCarcasses = (b: PosBatch) => (carcassesByBatch.get(b.id) ?? 0) > 0;
  const inStock = (b: PosBatch) =>
    b.type === 'PONDEUSE' ? hasEggs(b) || hasCarcasses(b) : b.quantityAlive > 0 || hasCarcasses(b);
  const closedLots = allBatches.filter((b) => !lots.includes(b));
  const visibleLots = (
    stockFilter === 'A_VENDRE'
      ? lots.filter(inStock)
      : stockFilter === 'FERMES'
        ? [...lots.filter((b) => !inStock(b)), ...closedLots]
        : [...lots, ...closedLots]
  ).filter((b) => typeFilter === 'TOUS' || b.type === typeFilter);
  const visibleReserves = reserves.filter((t) => reserveFilter === 'TOUS' || t.productType === reserveFilter);

  // Deep link from an alert: /app/finance/ventes?batch=<id> opens the line form.
  const batchParam = params.get('batch');
  useEffect(() => {
    if (!batchParam || !pos || isBoutique) return;
    const target = lots.find((b) => b.id === batchParam);
    if (!target) return;
    setLineModal({ preset: { batchId: target.id } });
    setParams({}, { replace: true });
  }, [batchParam, pos, isBoutique, lots, setParams]);

  const statsFor = (id: string) => {
    const list = (salesToday.data ?? []).filter((s) => s.status !== 'CANCELLED' && s.pointOfSaleId === id);
    const revenue = list.reduce((a, s) => a + s.totalAmountFcfa, 0);
    return { revenue, count: list.length, basket: list.length ? Math.round(revenue / list.length) : 0 };
  };

  const soldToday = (batchId: string) =>
    (salesToday.data ?? [])
      .filter((s) => s.status !== 'CANCELLED')
      .flatMap((s) => s.items)
      .filter((it) => it.batchId === batchId).length;

  const selectPos = (id: string) => {
    if (id === posId) return;
    setPosId(id);
    // A basket holds stock of one point of sale only.
    setLines([]);
  };

  const saveLine = (line: PosLine) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.uid === line.uid);
      if (i < 0) return [...prev, line];
      const next = [...prev];
      next[i] = line;
      return next;
    });
  };

  const photoOfBatch = (id?: string | null) => batchPhoto(allBatches.find((b) => b.id === id));

  const stats = pos ? statsFor(pos.id) : null;
  const loadError = pointsOfSale.error ?? batches.error;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Point de vente"
        subtitle="Panier, encaissement en espèces ou à crédit, reçus et annulations."
        icon={<ShoppingCart />}
        actions={
          <Link
            to="/app/finance/caisse"
            className={classNames(
              'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold',
              caisse.data ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600',
            )}
          >
            <Coins className="h-4 w-4" />
            {caisse.data ? `Caisse ouverte · ${fcfa(caisse.data.expectedBalanceFcfa)}` : 'Caisse fermée'}
          </Link>
        }
      />

      <ErrorNote error={loadError} />

      {pointsOfSale.isLoading ? (
        <Loading label="Chargement des points de vente…" />
      ) : activePos.length === 0 ? (
        <div className="space-y-2">
          <EmptyState icon={<Store />} message="Aucun point de vente actif : activez ou créez-en un pour commencer à encaisser." />
          <Link to="/app/points-of-sale" className="block text-center text-sm font-semibold text-brand-700 hover:underline">
            Gérer les points de vente
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {activePos.map((p) => {
            const s = statsFor(p.id);
            const selected = p.id === posId;
            const Icon = p.kind === 'FERME' ? Home : Store;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={selected}
                onClick={() => selectPos(p.id)}
                className={classNames(
                  'flex items-start gap-3 rounded-2xl border bg-white p-4 text-left transition',
                  selected ? 'border-brand-600 ring-2 ring-brand-100' : 'border-slate-200 hover:border-slate-300',
                )}
              >
                <IconTile icon={<Icon />} tone={p.kind === 'FERME' ? 'brand' : 'accent'} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-slate-900">{p.name}</span>
                  <span className="block text-xs text-slate-500">
                    {p.kind === 'FERME' ? 'Ferme · volaille vivante, œufs, carcasses' : 'Boutique · stock transféré depuis la ferme'}
                  </span>
                  <span className="mt-1 block text-sm font-medium text-slate-700">
                    {fcfa(s.revenue)} · {num(s.count)} ticket(s) aujourd’hui
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {pos && stats ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="CA aujourd’hui" value={fcfa(stats.revenue)} tone="good" icon={<TrendingUp />} />
            <StatCard label="Tickets" value={num(stats.count)} icon={<ReceiptText />} />
            <StatCard label="Panier moyen" value={fcfa(stats.basket)} icon={<ShoppingCart />} />
            {isBoutique ? (
              <StatCard label="Réserves actives" value={num(reserves.length)} hint={pos.name} icon={<Package />} />
            ) : (
              <StatCard
                label="Stock ferme"
                icon={<Warehouse />}
                value={`${num(lots.reduce((a, b) => a + b.quantityAlive, 0))} vivants`}
                hint={`${num(pools.reduce((a, p) => a + (p.carcassesAvailable ?? 0), 0))} carcasses · ${num(lots.reduce((a, b) => a + (b.metrics.eggStockAvailableAlveoles ?? 0), 0))} alvéoles`}
              />
            )}
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-4">
              <Card className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    {isBoutique ? <Package className="h-4 w-4 text-brand-600" /> : <Layers className="h-4 w-4 text-brand-600" />}
                    {isBoutique ? 'Réserves en boutique à vendre' : 'Lots à vendre'}
                  </h2>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {isBoutique ? (
                      <>
                        <FilterChip label="Tous" active={reserveFilter === 'TOUS'} onClick={() => setReserveFilter('TOUS')} />
                        <FilterChip label="Abattu" active={reserveFilter === 'ABATTU'} onClick={() => setReserveFilter('ABATTU')} />
                        <FilterChip label="Œufs" active={reserveFilter === 'OEUFS'} onClick={() => setReserveFilter('OEUFS')} />
                        <FilterChip label="Provende" active={reserveFilter === 'PROVENDE'} onClick={() => setReserveFilter('PROVENDE')} />
                      </>
                    ) : (
                      <>
                        <FilterChip label="Tous types" active={typeFilter === 'TOUS'} onClick={() => setTypeFilter('TOUS')} />
                        <FilterChip label="Chair" active={typeFilter === 'CHAIR'} onClick={() => setTypeFilter('CHAIR')} />
                        <FilterChip label="Pondeuse" active={typeFilter === 'PONDEUSE'} onClick={() => setTypeFilter('PONDEUSE')} />
                        <span className="mx-1 h-4 w-px bg-slate-200" />
                        <FilterChip label="À vendre" active={stockFilter === 'A_VENDRE'} onClick={() => setStockFilter('A_VENDRE')} />
                        <FilterChip label="Fermés" active={stockFilter === 'FERMES'} onClick={() => setStockFilter('FERMES')} />
                        <FilterChip label="Tous lots" active={stockFilter === 'TOUS'} onClick={() => setStockFilter('TOUS')} />
                      </>
                    )}
                  </div>
                </div>
                <div className="max-h-[340px] overflow-auto">
                  {isBoutique ? (
                    visibleReserves.length === 0 ? (
                      <div className="p-4">
                        <EmptyState
                          icon={<Package />}
                          message={
                            reserves.length === 0
                              ? 'Aucun stock en boutique : réapprovisionnez-la depuis la ferme.'
                              : 'Aucune réserve dans ce filtre.'
                          }
                        />
                      </div>
                    ) : (
                      <table className="w-full">
                        <thead className="bg-slate-50">
                          <tr>
                            <Th>Réserve</Th>
                            <Th>Produit</Th>
                            <Th className="text-right">Restant</Th>
                            <Th></Th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleReserves.map((t) => (
                            <tr key={t.id} className="border-t border-slate-100">
                              <Td className="font-medium">
                                <span className="flex items-center gap-2.5">
                                  <ProductThumb
                                    product={t.productType === 'OEUFS' ? 'OEUF' : t.productType === 'PROVENDE' ? 'PROVENDE' : 'ABATTU_PIECE'}
                                    photo={photoOfBatch(t.batchId ?? t.slaughterOrder?.batchId)}
                                  />
                                  {transferTitle(t)}
                                </span>
                              </Td>
                              <Td>{t.productType === 'ABATTU' ? 'Abattu' : t.productType === 'OEUFS' ? 'Œufs' : 'Provende'}</Td>
                              <Td className="text-right tabular-nums">
                                {num(transferRemaining(t), 2)} {transferUnitLabel(t)}
                              </Td>
                              <Td className="text-right">
                                <Button tone="secondary" className="px-2.5 py-1 text-xs" onClick={() => setLineModal({ preset: { transferId: t.id } })}>
                                  <ShoppingCart className="h-3.5 w-3.5" /> Vendre
                                </Button>
                              </Td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  ) : batches.isLoading ? (
                    <div className="p-4">
                      <Loading />
                    </div>
                  ) : visibleLots.length === 0 ? (
                    <div className="p-4">
                      <EmptyState icon={<Layers />} message="Aucun lot dans ce filtre." />
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <Th>Lot</Th>
                          <Th className="text-right">Vivants</Th>
                          <Th className="text-right">Carcasses</Th>
                          <Th>Œufs</Th>
                          <Th>État</Th>
                          <Th></Th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleLots.map((b) => {
                          const open = lots.includes(b);
                          const ready = b.status === 'EN_VENTE' || b.metrics.readyForSale;
                          const sold = soldToday(b.id);
                          return (
                            <tr key={b.id} className={classNames('border-t border-slate-100', !open && 'opacity-60')}>
                              <Td className="font-medium">
                                <div className="flex items-center gap-3">
                                  <PhotoThumb src={batchPhoto(b)} />
                                  <div className="min-w-0">
                                    {b.batchName ?? 'Lot'}
                                    <span className="block text-xs font-normal text-slate-400">
                                      {statusLabel(b.type)} · J{b.metrics.ageDays}
                                      {sold > 0 ? ` · ${num(sold)} article(s) vendu(s) aujourd’hui` : ''}
                                    </span>
                                  </div>
                                </div>
                              </Td>
                              <Td className="text-right tabular-nums">{num(b.quantityAlive)}</Td>
                              <Td className="text-right tabular-nums">{num(carcassesByBatch.get(b.id) ?? 0)}</Td>
                              <Td>{hasEggs(b) ? formatEggAlveoles(b.metrics.eggStockAvailableEggs ?? 0) : '—'}</Td>
                              <Td>
                                <span className={classNames('text-xs font-medium', !open ? 'text-slate-400' : ready ? 'text-emerald-600' : 'text-slate-500')}>
                                  {!open ? 'Fermé' : ready ? 'Prêt' : 'En cours'}
                                </span>
                              </Td>
                              <Td className="text-right">
                                {open ? (
                                  <Button tone="secondary" className="px-2.5 py-1 text-xs" onClick={() => setLineModal({ preset: { batchId: b.id } })}>
                                    <ShoppingCart className="h-3.5 w-3.5" /> Vendre
                                  </Button>
                                ) : null}
                              </Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
                  <Link to="/app/points-of-sale" className="flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:underline">
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    {isBoutique ? 'Réapprovisionner cette boutique' : 'Envoyer du stock à une boutique'}
                  </Link>
                  <Button tone="secondary" onClick={() => setLineModal({})}>
                    <Plus className="h-4 w-4" /> Ajouter un article
                  </Button>
                </div>
              </Card>

              <Card className="overflow-hidden">
                <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
                  <ShoppingCart className="h-4 w-4 text-brand-600" />
                  <h2 className="text-sm font-semibold text-slate-700">Panier · {num(lines.length)} article(s)</h2>
                </div>
                {lines.length === 0 ? (
                  <div className="p-4">
                    <EmptyState icon={<ShoppingCart />} message="Choisissez un lot ou ajoutez un article pour commencer." />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <Th>Article</Th>
                          <Th>Source</Th>
                          <Th className="text-right">Quantité</Th>
                          <Th className="text-right">Prix unitaire</Th>
                          <Th className="text-right">Montant</Th>
                          <Th></Th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((l) => (
                          <tr key={l.uid} className="border-t border-slate-100">
                            <Td className="font-medium">
                              <span className="flex items-center gap-2.5">
                                <ProductThumb product={l.product} photo={photoOfBatch(l.batchId)} />
                                {l.label}
                              </span>
                            </Td>
                            <Td>{l.sourceLabel || '—'}</Td>
                            <Td className="whitespace-nowrap text-right tabular-nums">
                              {l.weightKg != null
                                ? `${num(l.qty)} oiseau(x) · ${num(l.weightKg, 2)} kg`
                                : `${num(l.qty, 2)} ${l.product === 'OEUF' ? 'alvéole(s)' : unitLabel(l.unit)}`}
                            </Td>
                            <Td className="whitespace-nowrap text-right tabular-nums">{fcfa(l.unitPriceFcfa)}</Td>
                            <Td className="whitespace-nowrap text-right font-semibold tabular-nums">{fcfa(lineAmount(l))}</Td>
                            <Td>
                              <div className="flex justify-end gap-1">
                                <button
                                  type="button"
                                  aria-label={`Modifier ${l.label}`}
                                  onClick={() => setLineModal({ initial: l })}
                                  className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Retirer ${l.label}`}
                                  onClick={() => setLines((prev) => prev.filter((x) => x.uid !== l.uid))}
                                  className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>

            <div className="lg:sticky lg:top-4">
              <Checkout
                farmId={farmId}
                lines={lines}
                pointOfSaleId={pos.id}
                posName={pos.name}
                caisseOpen={!!caisse.data}
                lastClosing={lastClosingOf(caisseSessions.data)}
                onSold={() => setLines([])}
              />
            </div>
          </div>
        </>
      ) : activePos.length > 1 ? (
        <p className="text-sm text-slate-500">Où vendez-vous aujourd’hui ? Choisissez un point de vente pour voir ses produits et ses chiffres du jour.</p>
      ) : null}

      <SalesHistory farmId={farmId} pointsOfSale={allPos} />

      {lineModal && pos ? (
        <LineForm
          key={lineModal.initial?.uid ?? lineModal.preset?.batchId ?? lineModal.preset?.transferId ?? 'new'}
          pos={pos}
          lots={lots}
          pools={pools}
          reserves={reserves}
          feedLots={feedLots}
          recolte={sellableRecolte}
          sacKg={farm?.defaultSacKg ?? 50}
          committed={lines}
          initial={lineModal.initial}
          preset={lineModal.preset}
          onSave={saveLine}
          onClose={() => setLineModal(null)}
        />
      ) : null}
    </div>
  );
}

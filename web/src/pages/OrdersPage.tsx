import { useQuery } from '@tanstack/react-query';
import { CircleCheck, ClipboardList, Clock, Plus, Search, Truck, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Order, OrderStatus } from '../api/types-orders';
import { useFarm } from '../app/FarmContext';
import { Button, ErrorNote, inputCls } from '../components/form';
import { CreateOrderModal } from '../components/orders/CreateOrderModal';
import { ORDER_CANAL_LABEL, ORDER_STATUS_LABEL } from '../components/orders/helpers';
import { OrderDetailModal } from '../components/orders/OrderDetailModal';
import { CanalIcon, OrderStatusBadge, Pill, Segmented } from '../components/orders/shared';
import { Card, EmptyState, Loading, PageHeader, StatCard, Td, Th } from '../components/ui';
import { dateFr, fcfa, num } from '../lib/format';

type Filter = OrderStatus | 'ALL';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'ALL', label: 'Toutes' },
  { key: 'PENDING', label: 'En attente' },
  { key: 'CONFIRMED', label: 'Confirmées' },
  { key: 'LIVRE', label: 'Livrées' },
  { key: 'CANCELLED', label: 'Annulées' },
];

function dueOf(o: Order): number {
  return Math.max(o.totalAmountFcfa - o.depositFcfa, 0);
}

export function OrdersPage() {
  const { farmId } = useFarm();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  // The open order lives in the URL: a reload reopens it.
  const openId = params.get('commande');
  const openOrder = (id: string | null) => setParams(id ? { commande: id } : {}, { replace: true });

  const ordersQuery = useQuery({
    queryKey: ['orders', farmId],
    queryFn: () => api.get<Order[]>(`/farms/${farmId}/orders`),
    enabled: !!farmId,
  });

  const orders = useMemo(() => ordersQuery.data ?? [], [ordersQuery.data]);

  const stats = useMemo(() => {
    const count = (s: OrderStatus) => orders.filter((o) => o.status === s).length;
    const open = orders.filter((o) => o.status === 'PENDING' || o.status === 'CONFIRMED');
    const deliveredAmount = orders.filter((o) => o.status === 'LIVRE').reduce((a, o) => a + o.totalAmountFcfa, 0);
    const totalAmount = orders.reduce((a, o) => a + o.totalAmountFcfa, 0);
    return {
      pending: count('PENDING'),
      confirmed: count('CONFIRMED'),
      delivered: count('LIVRE'),
      cancelled: count('CANCELLED'),
      due: open.reduce((a, o) => a + dueOf(o), 0),
      rate: totalAmount > 0 ? Math.min(1, deliveredAmount / totalAmount) : 0,
    };
  }, [orders]);

  const counts: Record<Filter, number> = {
    ALL: orders.length,
    PENDING: stats.pending,
    CONFIRMED: stats.confirmed,
    LIVRE: stats.delivered,
    CANCELLED: stats.cancelled,
  };

  const needle = search.trim().toLowerCase();
  const rows = orders.filter((o) => {
    if (filter !== 'ALL' && o.status !== filter) return false;
    if (!needle) return true;
    return (
      o.referenceNumber.toLowerCase().includes(needle) ||
      (o.customer?.fullName ?? '').toLowerCase().includes(needle) ||
      (o.customer?.phone ?? '').toLowerCase().includes(needle)
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Commandes"
        subtitle="Précommandes et bons de commande."
        icon={<ClipboardList />}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Nouvelle commande
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="À livrer" value={num(stats.confirmed, 0)} hint="Confirmées" icon={<Truck />} />
        <StatCard label="En attente" value={num(stats.pending, 0)} hint="Sans acompte" tone={stats.pending > 0 ? 'warn' : 'default'} icon={<Clock />} />
        <StatCard label="Reste à encaisser" value={fcfa(stats.due)} hint="Sur les commandes en cours" tone={stats.due > 0 ? 'accent' : 'good'} icon={<Wallet />} />
        <StatCard
          label="Livré"
          icon={<CircleCheck />}
          value={`${Math.round(stats.rate * 100)} %`}
          hint={`${num(stats.delivered, 0)} livrée(s), ${num(stats.cancelled, 0)} annulée(s) sur ${num(orders.length, 0)}`}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          ariaLabel="Filtrer par statut"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({ key: f.key, label: `${f.label} (${counts[f.key]})` }))}
        />
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher (référence, client, téléphone)…"
            aria-label="Rechercher une commande"
            className={`${inputCls} pl-9`}
          />
        </div>
      </div>

      <ErrorNote error={ordersQuery.error} />

      {ordersQuery.isLoading ? (
        <Loading label="Chargement des commandes…" />
      ) : rows.length === 0 && !ordersQuery.isError ? (
        <EmptyState
          icon={<ClipboardList />}
          message={
            needle
              ? 'Aucune commande ne correspond à cette recherche.'
              : filter === 'ALL'
                ? 'Aucune commande pour le moment.'
                : `Aucune commande « ${ORDER_STATUS_LABEL[filter]} » pour le moment.`
          }
        />
      ) : rows.length > 0 ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <Th>Référence</Th>
                  <Th>Client</Th>
                  <Th>Canal</Th>
                  <Th>Lot et articles</Th>
                  <Th>Prévu le</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Acompte</Th>
                  <Th className="text-right">Reste dû</Th>
                  <Th>Statut</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const birds = o.items.reduce((a, i) => a + (i.pieceCount ?? 0), 0);
                  const terminal = o.status === 'LIVRE' || o.status === 'CANCELLED';
                  return (
                    <tr
                      key={o.id}
                      onClick={() => openOrder(o.id)}
                      className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                    >
                      <Td>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openOrder(o.id);
                          }}
                          className="whitespace-nowrap font-mono text-xs font-semibold text-brand-700 hover:underline"
                        >
                          {o.referenceNumber}
                        </button>
                      </Td>
                      <Td className="font-medium">
                        {o.customer?.fullName ?? <span className="font-normal text-slate-400">Client non renseigné</span>}
                        {o.customer?.phone ? <span className="block text-xs font-normal text-slate-500">{o.customer.phone}</span> : null}
                      </Td>
                      <Td className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <CanalIcon canal={o.canal} className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          {ORDER_CANAL_LABEL[o.canal] ?? o.canal}
                        </span>
                        {o.source === 'MARKET' ? <span className="ml-2"><Pill tone="bg-sky-50 text-sky-700 ring-sky-200">Marché</Pill></span> : null}
                      </Td>
                      <Td>
                        {o.batch?.batchName ?? 'Œufs'}
                        <span className="block text-xs text-slate-500">
                          {o.items.length} article{o.items.length > 1 ? 's' : ''}
                          {birds > 0 ? ` · ${num(birds, 0)} volailles` : ''}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap">{o.expectedDate ? dateFr(o.expectedDate) : 'À convenir'}</Td>
                      <Td className="whitespace-nowrap text-right font-medium tabular-nums">{fcfa(o.totalAmountFcfa)}</Td>
                      <Td className="whitespace-nowrap text-right tabular-nums">{fcfa(o.depositFcfa)}</Td>
                      <Td className="whitespace-nowrap text-right tabular-nums">{terminal ? '—' : fcfa(dueOf(o))}</Td>
                      <Td>
                        <OrderStatusBadge status={o.status} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {createOpen ? (
        <CreateOrderModal
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            openOrder(id);
          }}
        />
      ) : null}
      {openId ? <OrderDetailModal orderId={openId} onClose={() => openOrder(null)} /> : null}
    </div>
  );
}

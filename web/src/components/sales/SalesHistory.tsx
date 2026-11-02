import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { PointOfSale, SaleFull } from '../../api/types-sales';
import { ErrorNote, inputCls, todayIso } from '../form';
import { Card, EmptyState, Loading, StatusBadge, Th, Td } from '../ui';
import { classNames, dateFr, fcfa, num } from '../../lib/format';
import { productTypeLabel } from './labels';
import { FilterChip, ReceiptButton } from './shared';
import { SaleDetail, salePaid } from './SaleDetail';

function daysAgo(n: number): string {
  const d = new Date(`${todayIso()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

type Period = 'TODAY' | '7' | '30' | 'ALL';

export function SalesHistory({ farmId, pointsOfSale }: { farmId: string | null; pointsOfSale: PointOfSale[] }) {
  const [period, setPeriod] = useState<Period>('30');
  const [status, setStatus] = useState('');
  const [posId, setPosId] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const from = period === 'TODAY' ? todayIso() : period === '7' ? daysAgo(7) : period === '30' ? daysAgo(30) : '';
  const sales = useQuery({
    queryKey: ['sales', farmId, from, status],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (status) qs.set('status', status);
      const s = qs.toString();
      return api.get<SaleFull[]>(`/farms/${farmId}/sales${s ? `?${s}` : ''}`);
    },
    enabled: !!farmId,
  });

  const posNames = useMemo(() => new Map(pointsOfSale.map((p) => [p.id, p.name])), [pointsOfSale]);
  const rows = (sales.data ?? []).filter((s) => !posId || s.pointOfSaleId === posId);
  const open = rows.find((s) => s.id === openId) ?? null;
  const total = rows.filter((s) => s.status !== 'CANCELLED').reduce((a, s) => a + s.totalAmountFcfa, 0);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Reçus et historique</h2>
          <p className="text-xs text-slate-500">
            {num(rows.length)} vente(s) · {fcfa(total)} hors annulations
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip label="Aujourd’hui" active={period === 'TODAY'} onClick={() => setPeriod('TODAY')} />
          <FilterChip label="7 jours" active={period === '7'} onClick={() => setPeriod('7')} />
          <FilterChip label="30 jours" active={period === '30'} onClick={() => setPeriod('30')} />
          <FilterChip label="Tout" active={period === 'ALL'} onClick={() => setPeriod('ALL')} />
          <div className="w-40">
            <select aria-label="Statut" className={classNames(inputCls, 'py-1 text-xs')} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Tous les statuts</option>
              <option value="SETTLED">Soldées</option>
              <option value="OUTSTANDING">À recouvrer</option>
              <option value="CANCELLED">Annulées</option>
            </select>
          </div>
          <div className="w-48">
            <select aria-label="Point de vente" className={classNames(inputCls, 'py-1 text-xs')} value={posId} onChange={(e) => setPosId(e.target.value)}>
              <option value="">Tous les points de vente</option>
              {pointsOfSale.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      {sales.isError ? (
        <div className="p-4">
          <ErrorNote error={sales.error} />
        </div>
      ) : sales.isLoading ? (
        <div className="p-4">
          <Loading label="Chargement des ventes…" />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-4">
          <EmptyState message="Aucune vente sur cette période." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <Th>Référence</Th>
                <Th>Date</Th>
                <Th>Client</Th>
                <Th>Point de vente</Th>
                <Th>Articles</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Payé</Th>
                <Th>Statut</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const paid = salePaid(s);
                return (
                  <tr key={s.id} className="border-t border-slate-100">
                    <Td className="whitespace-nowrap font-medium">
                      <button type="button" className="text-brand-700 hover:underline" onClick={() => setOpenId(s.id)}>
                        {s.referenceNumber}
                      </button>
                    </Td>
                    <Td className="whitespace-nowrap">{dateFr(s.saleDate)}</Td>
                    <Td>{s.customer?.fullName ?? <span className="text-slate-400">Comptoir</span>}</Td>
                    <Td>{s.pointOfSaleId ? (posNames.get(s.pointOfSaleId) ?? '—') : '—'}</Td>
                    <Td className="max-w-[260px]">
                      {s.items.map((it) => `${it.label || productTypeLabel(it.productType)} × ${num(it.quantity, 2)}`).join(', ') || '—'}
                    </Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">
                      {fcfa(s.totalAmountFcfa)}
                      {s.discountAmountFcfa > 0 ? (
                        <span className="block text-xs text-emerald-600">remise {fcfa(s.discountAmountFcfa)}</span>
                      ) : null}
                    </Td>
                    <Td
                      className={classNames(
                        'whitespace-nowrap text-right tabular-nums',
                        s.status === 'CANCELLED' ? 'text-slate-400' : paid >= s.totalAmountFcfa ? 'font-semibold text-emerald-600' : 'text-amber-600',
                      )}
                    >
                      {fcfa(paid)}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <StatusBadge status={s.status} />
                    </Td>
                    <Td>
                      <ReceiptButton farmId={farmId} saleId={s.id} reference={s.referenceNumber} compact />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {open ? (
        <SaleDetail
          farmId={farmId}
          sale={open}
          posName={open.pointOfSaleId ? posNames.get(open.pointOfSaleId) : undefined}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </Card>
  );
}

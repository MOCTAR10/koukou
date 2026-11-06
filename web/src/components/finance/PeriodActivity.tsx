import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Coins, ListOrdered, PackageCheck, Receipt } from 'lucide-react';
import { api } from '../../api/client';
import { useCanRead } from '../../app/useMenuAccess';
import type { Expense, OverviewPnl } from '../../api/types-finance';
import type { Order } from '../../api/types-orders';
import type { SaleFull } from '../../api/types-sales';
import { dateFr, fcfa } from '../../lib/format';
import { ErrorNote } from '../form';
import { ORDER_CANAL_LABEL, ORDER_STATUS_LABEL } from '../orders/helpers';
import { Card } from '../ui';
import { EXPENSE_CATEGORIES } from './ExpenseFormModal';
import { SectionTitle } from './shared';

const RECENT_ROWS = 5;

function Row({ left, caption, right }: { left: string; caption?: string; right: string }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2 text-sm">
      <span className="min-w-0">
        <span className="block truncate text-slate-800">{left}</span>
        {caption ? <span className="block truncate text-xs text-slate-500">{caption}</span> : null}
      </span>
      <span className="shrink-0 font-semibold tabular-nums text-slate-900">{right}</span>
    </li>
  );
}

function Block({
  title,
  icon,
  empty,
  error,
  children,
}: {
  title: string;
  icon: ReactNode;
  empty: string;
  error?: unknown;
  children: ReactNode[];
}) {
  return (
    <Card className="p-5">
      <SectionTitle title={title} icon={icon} />
      <ErrorNote error={error} />
      {children.length > 0 ? (
        <ul className="divide-y divide-slate-100">{children}</ul>
      ) : error ? null : (
        <p className="text-sm text-slate-500">{empty}</p>
      )}
    </Card>
  );
}

/** What happened in the period, line by line, under the P&L totals of the reports page. */
export function PeriodActivity({
  farmId,
  from,
  to,
  overview,
}: {
  farmId: string;
  from: string;
  to: string;
  overview: OverviewPnl;
}) {
  // Same key and request as the page's channel block: one shared call.
  const sales = useQuery({
    queryKey: ['sales', farmId, from, to],
    queryFn: () => api.get<SaleFull[]>(`/farms/${farmId}/sales?from=${from}&to=${to}`),
  });
  const expenses = useQuery({
    queryKey: ['expenses', farmId, from, to],
    queryFn: () => api.get<Expense[]>(`/farms/${farmId}/expenses?from=${from}&to=${to}`),
  });
  // Orders are Fermia-only (VENTES): the block stays out for an institution.
  const showOrders = useCanRead()('VENTES');
  const orders = useQuery({
    queryKey: ['orders', farmId],
    queryFn: () => api.get<Order[]>(`/farms/${farmId}/orders`),
    enabled: showOrders,
  });

  const recentSales = (sales.data ?? [])
    .filter((s) => s.status !== 'CANCELLED')
    .sort((a, b) => b.saleDate.localeCompare(a.saleDate))
    .slice(0, RECENT_ROWS);
  const recentExpenses = [...(expenses.data ?? [])]
    .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate))
    .slice(0, RECENT_ROWS);
  const openOrders = (orders.data ?? []).filter((o) => o.status === 'PENDING' || o.status === 'CONFIRMED');
  const categoryLabel = (key: string) => EXPENSE_CATEGORIES.find((c) => c.key === key)?.label ?? key;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Block title="Ventes récentes" icon={<PackageCheck />} empty="Aucune vente sur la période." error={sales.error}>
        {recentSales.map((s) => (
          <Row
            key={s.id}
            left={`${s.referenceNumber} · ${s.customer?.fullName ?? 'Comptoir'}`}
            caption={dateFr(s.saleDate)}
            right={fcfa(s.totalAmountFcfa)}
          />
        ))}
      </Block>
      <Block title="Dépenses récentes" icon={<Receipt />} empty="Aucune dépense sur la période." error={expenses.error}>
        {recentExpenses.map((e) => (
          <Row
            key={e.id}
            left={e.label ?? categoryLabel(e.category)}
            caption={`${categoryLabel(e.category)} · ${dateFr(e.expenseDate)}`}
            right={fcfa(e.amountFcfa)}
          />
        ))}
      </Block>
      <Block title="Encaissements par moyen" icon={<Coins />} empty="Aucun encaissement sur la période.">
        {(overview.breakdown.byPaymentMethod ?? []).map((m) => (
          <Row key={m.method} left={m.label} right={fcfa(m.amountFcfa)} />
        ))}
      </Block>
      {showOrders ? (
        <Block title="Commandes en cours" icon={<ListOrdered />} empty="Aucune commande ouverte." error={orders.error}>
          {openOrders.map((o) => (
            <Row
              key={o.id}
              left={`${o.referenceNumber} · ${ORDER_CANAL_LABEL[o.canal] ?? o.canal}`}
              caption={`${ORDER_STATUS_LABEL[o.status] ?? o.status}${o.depositFcfa > 0 ? ` · acompte ${fcfa(o.depositFcfa)}` : ''}`}
              right={fcfa(o.totalAmountFcfa)}
            />
          ))}
        </Block>
      ) : null}
    </div>
  );
}

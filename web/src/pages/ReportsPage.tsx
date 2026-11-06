import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowDownRight,
  ArrowUpRight,
  Coins,
  Download,
  FileBarChart,
  PieChart,
  Receipt,
  Store,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '../api/client';
import type { ProductionBatch } from '../api/types';
import type { BatchPnl, ChannelPointOfSale, ChannelSale, OverviewPnl } from '../api/types-finance';
import { useFarm } from '../app/FarmContext';
import { useCanRead } from '../app/useMenuAccess';
import { ReadOnlyNotice } from '../components/access/ReadOnlyNotice';
import { Donut } from '../components/Charts';
import { BatchPnlPanel } from '../components/finance/BatchPnlPanel';
import { PeriodActivity } from '../components/finance/PeriodActivity';
import { PeriodFilter } from '../components/finance/PeriodFilter';
import {
  collectionRate,
  deltaPct,
  marginPct,
  periodLabel,
  previousWindow,
  signedPct,
  spanWindow,
  sumFcfa,
  type PeriodWindow,
} from '../components/finance/pnl';
import { SectionTitle } from '../components/finance/shared';
import { ShareBars, type ShareRow } from '../components/finance/ShareBars';
import { Button, ErrorNote, Field, inputCls, todayIso } from '../components/form';
import { Card, EmptyState, Loading, PageHeader, StatCard } from '../components/ui';
import { fcfa, num, pct, statusLabel } from '../lib/format';

/** A hint with the sales/expense count and the change over the previous window. */
function countHint(count: number, noun: string, delta: number | null): string {
  const base = `${count} ${noun}(s)`;
  const change = signedPct(delta);
  return change ? `${base} · ${change}` : base;
}

export function ReportsPage() {
  const { farmId, farm } = useFarm();
  const canRead = useCanRead();
  const [period, setPeriod] = useState<PeriodWindow>(() => spanWindow(30, todayIso()));
  const [lotId, setLotId] = useState('');

  const overviewPath = (from: string, to: string) => `/farms/${farmId}/rentabilite/overview?from=${from}&to=${to}`;

  const overview = useQuery({
    queryKey: ['rentabilite', farmId, period.from, period.to],
    queryFn: () => api.get<OverviewPnl>(overviewPath(period.from, period.to)),
    enabled: !!farmId,
    placeholderData: keepPreviousData,
  });

  const prev = useMemo(() => previousWindow(period), [period]);
  const previous = useQuery({
    // `rentabilite` prefix on purpose: the previous window follows the same invalidations.
    queryKey: ['rentabilite', farmId, 'prev', prev?.from ?? '', prev?.to ?? ''],
    queryFn: () => api.get<OverviewPnl>(overviewPath(prev?.from ?? '', prev?.to ?? '')),
    enabled: !!farmId && prev != null,
  });
  const prevData = prev ? previous.data : undefined;

  const sales = useQuery({
    queryKey: ['sales', farmId, period.from, period.to],
    queryFn: () => api.get<ChannelSale[]>(`/farms/${farmId}/sales?from=${period.from}&to=${period.to}`),
    enabled: !!farmId,
  });
  const pointsOfSale = useQuery({
    queryKey: ['points-of-sale', farmId],
    queryFn: () => api.get<ChannelPointOfSale[]>(`/farms/${farmId}/points-of-sale`),
    // Points of sale are Fermia-only (VENTES): an institution sees the channels without their names.
    enabled: !!farmId && canRead('VENTES'),
  });

  const batches = useQuery({
    queryKey: ['batches', farmId],
    queryFn: () => api.get<ProductionBatch[]>(`/farms/${farmId}/batches`),
    enabled: !!farmId && canRead('TECHNIQUE'),
  });
  const lots = (batches.data ?? []).filter((b) => b.status !== 'CLOTURE');
  const lot = lots.find((b) => b.id === lotId) ?? lots[0];
  const batchId = lot?.id ?? '';

  const batchPnl = useQuery({
    queryKey: ['rentabilite-batch', farmId, batchId],
    queryFn: () => api.get<BatchPnl>(`/farms/${farmId}/rentabilite/batches/${batchId}`),
    enabled: !!farmId && batchId !== '',
  });

  const exportOverview = useMutation({
    mutationFn: () =>
      api.download(
        `/farms/${farmId}/rentabilite/overview/export?from=${period.from}&to=${period.to}`,
        `rapport-pnl-${period.span === 'all' ? 'historique' : `${period.from}-${period.to}`}.pdf`,
      ),
  });

  const ov = overview.data;
  const revenue = ov?.sales.totalFcfa ?? 0;
  const expenses = ov?.expenses.totalFcfa ?? 0;
  const net = ov?.netFcfa ?? 0;
  const margin = marginPct(net, revenue);
  const netChange = signedPct(deltaPct(ov?.netFcfa, prevData?.netFcfa));
  const rate = collectionRate(ov?.collectedFcfa ?? 0, revenue);
  const outstanding = ov?.outstandingFcfa ?? 0;

  const productRows: ShareRow[] = (ov?.breakdown.byProduct ?? []).map((p) => ({
    key: p.productType,
    label: p.label,
    meta: p.quantity ? `${num(p.quantity)} u.` : undefined,
    amountFcfa: p.amountFcfa,
  }));
  const expenseRows: ShareRow[] = (ov?.breakdown.byExpenseCategory ?? []).map((e) => ({
    key: e.category,
    label: e.label,
    amountFcfa: e.amountFcfa,
  }));

  const channelRows = useMemo<ShareRow[]>(() => {
    const totals = new Map<string, number>();
    for (const s of sales.data ?? []) {
      if (s.status === 'CANCELLED' || !s.pointOfSaleId) continue;
      totals.set(s.pointOfSaleId, (totals.get(s.pointOfSaleId) ?? 0) + s.totalAmountFcfa);
    }
    const rows: ShareRow[] = [];
    for (const [id, amountFcfa] of totals) {
      const pos = (pointsOfSale.data ?? []).find((p) => p.id === id);
      if (pos) rows.push({ key: id, label: pos.name, meta: pos.province ?? undefined, amountFcfa });
    }
    return rows;
  }, [sales.data, pointsOfSale.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rentabilité"
        subtitle={farm?.name ?? 'Ferme'}
        icon={<FileBarChart />}
        actions={
          <Button
            tone="secondary"
            busy={exportOverview.isPending}
            disabled={!ov}
            onClick={() => exportOverview.mutate()}
          >
            {exportOverview.isPending ? null : <Download className="h-4 w-4" />}
            Exporter le P&L de la période
          </Button>
        }
      />
      <ReadOnlyNotice what="rentabilité" />

      <PeriodFilter value={period} onChange={setPeriod} />
      <ErrorNote error={exportOverview.error} />
      <ErrorNote error={overview.error} />

      {overview.isLoading ? <Loading label="Calcul du P&L…" /> : null}

      {ov ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={net >= 0 ? 'Résultat net : bénéfice' : 'Résultat net : perte'}
              value={fcfa(net)}
              tone={net >= 0 ? 'good' : 'bad'}
              hint={`${periodLabel(period)}${netChange ? ` · ${netChange}` : ''}`}
              icon={net >= 0 ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
            />
            <StatCard
              label="Chiffre d’affaires"
              value={fcfa(revenue)}
              hint={countHint(ov.sales.count, 'vente', deltaPct(ov.sales.totalFcfa, prevData?.sales.totalFcfa))}
              icon={<TrendingUp className="h-5 w-5" />}
            />
            <StatCard
              label="Dépenses"
              value={fcfa(expenses)}
              hint={countHint(ov.expenses.count, 'dépense', deltaPct(ov.expenses.totalFcfa, prevData?.expenses.totalFcfa))}
              icon={<Receipt className="h-5 w-5" />}
            />
            <StatCard
              label="Taux de marge de la période"
              value={pct(margin)}
              tone={margin != null && margin < 0 ? 'bad' : 'default'}
              hint="(CA − dépenses) ÷ CA · indicateur de conduite (Fermia)"
              icon={<PieChart className="h-5 w-5" />}
            />
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-3">
            <Card className="p-5">
              <SectionTitle title="Encaissement des ventes" icon={<Coins />} />
              <div className="flex items-center gap-4">
                {rate != null ? <Donut value={rate} total={100} label="% encaissé" /> : null}
                <p className="text-sm text-slate-600">
                  {rate == null
                    ? 'Aucune vente sur la période.'
                    : outstanding <= 0
                      ? 'Tout est encaissé : aucune créance en cours.'
                      : `Reste à recouvrer : ${fcfa(outstanding)}.`}
                </p>
              </div>
            </Card>
            <Card className="p-5 lg:col-span-2">
              <SectionTitle
                title="Ventes par canal"
                icon={<Store />}
                subtitle={
                  channelRows.length > 0
                    ? `${channelRows.length} point(s) de vente · ${fcfa(sumFcfa(channelRows))}`
                    : undefined
                }
              />
              <ErrorNote error={sales.error ?? pointsOfSale.error} />
              <ShareBars rows={channelRows} empty="Aucune vente sur la période." rowIcon={<Store />} />
            </Card>
            <Card className="p-5 lg:col-span-3 xl:col-span-1">
              <SectionTitle title="D’où viennent les revenus" icon={<TrendingUp />} iconTone="green" />
              <ShareBars rows={productRows} empty="Aucune vente enregistrée sur la période." />
            </Card>
            <Card className="p-5 lg:col-span-3 xl:col-span-2">
              <SectionTitle title="Où part l’argent" icon={<Wallet />} iconTone="amber" />
              <ShareBars rows={expenseRows} empty="Aucune dépense enregistrée sur la période." />
            </Card>
          </div>
          {farmId ? <PeriodActivity farmId={farmId} from={period.from} to={period.to} overview={ov} /> : null}
        </>
      ) : null}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionTitle title="P&L par lot" subtitle="Marge officielle et coût par kg vendu de chaque lot" icon={<PieChart />} />
          {lots.length > 0 ? (
            <Field label="Lot" className="mb-3 w-72">
              <select value={batchId} onChange={(e) => setLotId(e.target.value)} className={inputCls}>
                {lots.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batchName ?? 'Lot sans nom'} ({statusLabel(b.status)})
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>
        <ErrorNote error={batches.error ?? batchPnl.error} />
        {batches.isLoading || batchPnl.isLoading ? <Loading label="P&L du lot…" /> : null}
        {!batches.isLoading && !batches.isError && lots.length === 0 ? (
          <EmptyState
            message="Aucun lot actif à analyser. Créez un lot pour suivre sa rentabilité."
            icon={<PieChart />}
          />
        ) : null}
        {batchPnl.data && farmId && lot ? <BatchPnlPanel farmId={farmId} pnl={batchPnl.data} /> : null}
      </section>
    </div>
  );
}

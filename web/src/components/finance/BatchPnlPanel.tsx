import { useMutation } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api } from '../../api/client';
import type { BatchPnl } from '../../api/types-finance';
import { classNames, fcfa, num, pct, statusLabel } from '../../lib/format';
import { Button, ErrorNote } from '../form';
import { Card } from '../ui';
import { marginPct } from './pnl';
import { KeyValue } from './shared';

export function BatchPnlPanel({ farmId, pnl }: { farmId: string; pnl: BatchPnl }) {
  const exportPdf = useMutation({
    mutationFn: () =>
      api.download(`/farms/${farmId}/rentabilite/batches/${pnl.batchId}/export`, `pnl-lot-${pnl.batchId.slice(0, 8)}.pdf`),
  });

  const negative = pnl.netFcfa < 0;
  const margin = pnl.marginPct ?? marginPct(pnl.netFcfa, pnl.revenueFcfa);
  const marginWidth = margin == null ? 0 : Math.min(100, Math.max(2, Math.abs(margin)));
  const sold = [
    pnl.kgSold > 0 ? `${num(pnl.kgSold)} kg vendus` : null,
    pnl.birdsSold > 0 ? `${num(pnl.birdsSold, 0)} poulets` : null,
    pnl.eggsSold > 0 ? `${num(pnl.eggsSold)} alvéoles d’œufs` : null,
  ].filter((s): s is string => s != null);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-lg font-bold text-slate-900">
            {pnl.batchName ?? 'Lot sans nom'}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
              {pnl.status === 'FINI' ? 'Terminé' : statusLabel(pnl.status)}
            </span>
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">
            {sold.length > 0 ? sold.join(' · ') : 'Aucune vente enregistrée pour ce lot'}
          </p>
        </div>
        <Button tone="secondary" busy={exportPdf.isPending} onClick={() => exportPdf.mutate()}>
          {exportPdf.isPending ? null : <Download className="h-4 w-4" />}
          Exporter le P&L du lot
        </Button>
      </div>

      <ErrorNote error={exportPdf.error} />

      <div className="mt-4 grid gap-x-10 gap-y-5 lg:grid-cols-3">
        <div>
          <KeyValue label="Revenus" value={fcfa(pnl.revenueFcfa)} />
          <KeyValue label="Dépenses (hors intrants)" value={`- ${fcfa(pnl.expensesFcfa)}`} tone="muted" />
          <div className="mt-1 border-t border-slate-200 pt-1">
            <KeyValue label="Résultat net" value={fcfa(pnl.netFcfa)} strong tone={negative ? 'bad' : 'good'} />
          </div>
        </div>
        <div>
          <KeyValue label="Marge nette" value={pct(margin)} strong tone={negative ? 'bad' : 'good'} />
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={classNames('h-full rounded-full', negative ? 'bg-red-500' : 'bg-emerald-500')}
              style={{ width: `${marginWidth}%` }}
            />
          </div>
          <div className="mt-2">
            <KeyValue
              label="Coût de revient / kg"
              value={pnl.costPerKgFcfa != null ? fcfa(pnl.costPerKgFcfa) : '—'}
            />
          </div>
        </div>
        {pnl.enrichment ? (
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Intrants déduits (HACCP)</p>
            <KeyValue label="Poussins" value={fcfa(pnl.enrichment.chickCostFcfa ?? 0)} />
            <KeyValue label="Aliments (lots liés)" value={fcfa(pnl.enrichment.feedLotsCostFcfa ?? 0)} />
            <p className="mt-1 text-xs text-slate-500">
              Coûts de poussins et d’aliments déduits automatiquement des intrants.
            </p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

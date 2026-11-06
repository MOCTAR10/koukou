import { useMutation, useQuery } from '@tanstack/react-query';
import { BookOpen, Download } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api/client';
import type { BalanceData, GrandLivreData } from '../../api/types-finance';
import { classNames, dateFr, fcfa } from '../../lib/format';
import { dayBefore, runningBalances } from '../../lib/ledger';
import { Button, DateInput, ErrorNote, inputCls } from '../form';
import { Card, DataTable, EmptyState, SkeletonRows, Td, Th } from '../ui';

/** Grand livre: movements of each account over a period, with opening, running and closing balance. */
export function GrandLivreTab({
  farmId,
  accounts,
}: {
  farmId: string;
  /** Chart of accounts for the picker. */
  accounts: { code: string; label: string }[];
}) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [account, setAccount] = useState('');
  const base = `/farms/${farmId}/accounting`;

  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const period = params.toString();
  const ledgerParams = new URLSearchParams(period);
  if (account) ledgerParams.set('accountCode', account);

  const ledger = useQuery({
    queryKey: ['accounting-grand-livre', farmId, from, to, account],
    queryFn: () => api.get<GrandLivreData>(`${base}/grand-livre?${ledgerParams.toString()}`),
  });
  // Opening balances: everything posted up to the eve of the period.
  const opening = useQuery({
    queryKey: ['accounting-grand-livre-opening', farmId, from],
    queryFn: () => api.get<BalanceData>(`${base}/balance?to=${dayBefore(from)}`),
    enabled: !!from,
  });
  const openingOf = new Map((opening.data?.accounts ?? []).map((a) => [a.code, a.soldeFcfa]));

  const exportFile = useMutation({
    mutationFn: (format: 'pdf' | 'csv') =>
      api.download(
        `${base}/export?report=grand-livre&format=${format}${period ? `&${period}` : ''}`,
        `fermia-grand-livre.${format}`,
      ),
  });

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <label className="space-y-1 text-sm font-medium text-slate-700">
          <span>Compte</span>
          <select className={classNames(inputCls, 'min-w-56')} value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">Tous les comptes</option>
            {accounts.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} · {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">
          <span>Du</span>
          <DateInput value={from} onChange={(e) => setFrom(e.target.value)} max={to || undefined} aria-label="Début de période" />
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">
          <span>Au</span>
          <DateInput value={to} onChange={(e) => setTo(e.target.value)} min={from || undefined} aria-label="Fin de période" />
        </label>
        <div className="ml-auto flex gap-2">
          <Button tone="secondary" busy={exportFile.isPending && exportFile.variables === 'pdf'} onClick={() => exportFile.mutate('pdf')}>
            <Download className="h-4 w-4" /> PDF
          </Button>
          <Button tone="secondary" busy={exportFile.isPending && exportFile.variables === 'csv'} onClick={() => exportFile.mutate('csv')}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      </Card>
      <ErrorNote error={exportFile.error} />
      <ErrorNote error={ledger.error} />

      {ledger.isLoading ? (
        <Card>
          <SkeletonRows rows={8} />
        </Card>
      ) : null}
      {ledger.data && ledger.data.length === 0 ? (
        <EmptyState message="Aucun mouvement pour ces filtres." icon={<BookOpen />} />
      ) : null}
      {ledger.data?.map((acc) => {
        const open = openingOf.get(acc.account) ?? 0;
        const running = runningBalances(open, acc.mouvements);
        const closing = open + acc.debitTotalFcfa - acc.creditTotalFcfa;
        return (
          <Card key={acc.account} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <span className="rounded bg-white px-1.5 py-0.5 font-mono text-xs text-slate-600 ring-1 ring-slate-200">{acc.account}</span>
              <span className="font-semibold text-slate-800">{acc.label ?? 'Compte'}</span>
              <span className="ml-auto text-slate-500">
                Solde d’ouverture : <span className="font-semibold tabular-nums text-slate-800">{fcfa(open)}</span>
              </span>
            </div>
            <DataTable>
              <thead className="bg-slate-50">
                <tr>
                  <Th>Date</Th>
                  <Th>Libellé</Th>
                  <Th className="text-right">Débit</Th>
                  <Th className="text-right">Crédit</Th>
                  <Th className="text-right">Solde</Th>
                </tr>
              </thead>
              <tbody>
                {acc.mouvements.map((m, i) => (
                  <tr key={`${m.reference}-${i}`} className="border-t border-slate-100">
                    <Td label="Date" className="whitespace-nowrap text-slate-500">{dateFr(m.date)}</Td>
                    <Td label="Libellé">
                      {m.label} <span className="font-mono text-xs text-slate-400">{m.reference}</span>
                    </Td>
                    <Td label="Débit" className="whitespace-nowrap text-right tabular-nums">{m.debitFcfa > 0 ? fcfa(m.debitFcfa) : ''}</Td>
                    <Td label="Crédit" className="whitespace-nowrap text-right tabular-nums">{m.creditFcfa > 0 ? fcfa(m.creditFcfa) : ''}</Td>
                    <Td label="Solde" className="whitespace-nowrap text-right tabular-nums">{fcfa(running[i])}</Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                  <Td className="font-semibold" />
                  <Td className="font-semibold">Total et solde de clôture</Td>
                  <Td label="Débit" className="whitespace-nowrap text-right font-semibold tabular-nums">{fcfa(acc.debitTotalFcfa)}</Td>
                  <Td label="Crédit" className="whitespace-nowrap text-right font-semibold tabular-nums">{fcfa(acc.creditTotalFcfa)}</Td>
                  <Td label="Solde" className="whitespace-nowrap text-right font-semibold tabular-nums">{fcfa(closing)}</Td>
                </tr>
              </tfoot>
            </DataTable>
          </Card>
        );
      })}
    </div>
  );
}

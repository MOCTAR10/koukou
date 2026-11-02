import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, LogIn, Unlock } from 'lucide-react';
import { api } from '../api/client';
import type { CashSession } from '../api/types';
import { useFarm } from '../app/FarmContext';
import { Card, EmptyState, Loading, PageHeader, StatusBadge, Th, Td } from '../components/ui';
import { classNames, dateFr, dateTimeFr, fcfa } from '../lib/format';

interface CashMovement {
  id: string;
  cashSessionId: string | null;
  type: 'IN' | 'OUT';
  amountFcfa: number;
  reason: string | null;
  movementDate: string;
}

type CaisseSummary = {
  session: CashSession;
  movements: CashMovement[];
  expectedBalanceFcfa: number;
  inFcfa: number;
  outFcfa: number;
};

const inputCls =
  'w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100';

export function CaissePage() {
  const { farmId } = useFarm();
  const queryClient = useQueryClient();

  const current = useQuery({
    queryKey: ['caisse-current', farmId],
    queryFn: () => api.get<CaisseSummary>(`/farms/${farmId}/caisse/current`),
    enabled: !!farmId,
    retry: false,
  });

  const sessions = useQuery({
    queryKey: ['caisse-sessions', farmId],
    queryFn: () => api.get<CashSession[]>(`/farms/${farmId}/caisse/sessions`),
    enabled: !!farmId,
  });

  // Opening defaults to the last declared closing: the server books only the
  // change from it, so opening at 0 would post the whole float as a withdrawal.
  const lastClosing =
    sessions.data?.find((s) => s.closingBalanceFcfa != null)?.closingBalanceFcfa ?? 0;
  const amountDefault = current.data ? current.data.expectedBalanceFcfa : lastClosing;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['caisse-current', farmId] });
    void queryClient.invalidateQueries({ queryKey: ['caisse-sessions', farmId] });
  };

  const openSession = useMutation({
    mutationFn: (openingBalanceFcfa: number) =>
      api.post<CashSession>(`/farms/${farmId}/caisse/open`, { openingBalanceFcfa }),
    onSuccess: invalidate,
  });

  const closeSession = useMutation({
    mutationFn: (declaredBalanceFcfa: number) =>
      api.post<CashSession>(`/farms/${farmId}/caisse/close`, { declaredBalanceFcfa }),
    onSuccess: invalidate,
  });

  const createMovement = useMutation({
    mutationFn: (body: { type: 'IN' | 'OUT'; amountFcfa: number; reason?: string }) =>
      api.post<CashMovement>(`/farms/${farmId}/caisse/movements`, body),
    onSuccess: invalidate,
  });

  const currentErr = current.isError ? (current.error as Error).message : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Caisse journalière" subtitle="Ouverture, mouvements, clôture et contrôle des écarts." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-2">
            {current.data ? <Unlock className="h-5 w-5 text-emerald-600" /> : <Lock className="h-5 w-5 text-slate-400" />}
            <h2 className="text-sm font-semibold text-slate-700">
              {current.data ? 'Caisse ouverte' : 'Aucune caisse ouverte'}
            </h2>
          </div>

          {current.data ? (
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-emerald-50 p-3">
                <p className="text-xs text-emerald-700">Ouverture</p>
                <p className="text-sm font-bold text-emerald-800">{fcfa(current.data.session.openingBalanceFcfa)}</p>
              </div>
              <div className="rounded-xl bg-sky-50 p-3">
                <p className="text-xs text-sky-700">Attendu</p>
                <p className="text-sm font-bold text-sky-800">{fcfa(current.data.expectedBalanceFcfa)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Depuis</p>
                <p className="text-sm font-bold text-slate-700">{dateTimeFr(current.data.session.openedAt)}</p>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              {currentErr && currentErr.length > 0 && !currentErr.includes('404')
                ? currentErr
                : 'Ouvrez la caisse pour pouvoir encaisser des ventes en espèces.'}
            </p>
          )}

          <form
            className="mt-5 space-y-3 border-t border-slate-100 pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const v = Number(f.get('amount'));
              if (current.data) {
                closeSession.mutate(v);
              } else {
                openSession.mutate(v);
              }
              e.currentTarget.reset();
            }}
          >
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-600">
{current.data ? 'Solde déclaré dans la caisse (FCFA)' : 'Fonds de caisse initial (FCFA)'}
                  </span>
                  <input key={`${current.data ? 'close' : 'open'}-${amountDefault}`} name="amount" type="number" min={0} required defaultValue={amountDefault} className={inputCls} />
            </label>
            <button
              type="submit"
              disabled={openSession.isPending || closeSession.isPending}
              className={classNames(
                'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white',
                current.data ? 'bg-slate-700 hover:bg-slate-800' : 'bg-emerald-600 hover:bg-emerald-700',
              )}
            >
              {current.data ? <Lock className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
              {current.data ? 'Clôturer la caisse' : 'Ouvrir la caisse'}
            </button>
            {openSession.isError || closeSession.isError ? (
              <p className="text-sm text-red-600">
                {((openSession.error ?? closeSession.error) as Error).message}
              </p>
            ) : null}
          </form>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">Mouvements</h2>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <Th>Date</Th>
                  <Th>Type</Th>
                  <Th>Montant</Th>
                  <Th>Motif</Th>
                </tr>
              </thead>
              <tbody>
                {(current.data?.movements ?? [])
                  .slice()
                  .sort((a, b) => b.movementDate.localeCompare(a.movementDate))
                  .slice(0, 15)
                  .map((m) => (
                    <tr key={m.id} className="border-t border-slate-100">
                      <Td>{dateFr(m.movementDate)}</Td>
                      <Td><StatusBadge status={m.type} /></Td>
                      <Td className={m.type === 'IN' ? 'font-medium text-emerald-600' : 'font-medium text-red-600'}>
                        {m.type === 'IN' ? '+' : '-'}
                        {fcfa(m.amountFcfa)}
                      </Td>
                      <Td className="max-w-[180px] truncate">{m.reason ?? '—'}</Td>
                    </tr>
                  ))}
                {!current.data?.movements?.length ? (
                  <tr>
                    <Td className="py-8 text-center text-slate-400">
                      {current.data ? 'Aucun mouvement.' : 'Ouvrez la caisse pour suivre les mouvements de la session.'}
                    </Td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {current.data ? (
            <form
              className="border-t border-slate-100 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const type = f.get('mvType') === 'IN' ? 'IN' : 'OUT';
                const amount = Number(f.get('mvAmount'));
                const reason = String(f.get('mvReason') ?? '').trim();
                createMovement.mutate({ type, amountFcfa: amount, ...(reason ? { reason } : {}) });
                e.currentTarget.reset();
              }}
            >
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs">
                  <span className="mb-1 block font-medium text-slate-600">Mouvement manuel</span>
                  <select name="mvType" className={inputCls} defaultValue="IN">
                    <option value="IN">Entrée (+)</option>
                    <option value="OUT">Sortie (−)</option>
                  </select>
                </label>
                <label className="text-xs">
                  <span className="mb-1 block font-medium text-slate-600">Montant (FCFA)</span>
                  <input name="mvAmount" type="number" min={1} required placeholder="500" className={classNames(inputCls, 'w-32')} />
                </label>
                <label className="text-xs">
                  <span className="mb-1 block font-medium text-slate-600">Motif</span>
                  <input name="mvReason" type="text" placeholder="Ex. petit matériel" className={classNames(inputCls, 'w-44')} />
                </label>
                <button
                  type="submit"
                  disabled={createMovement.isPending}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  Ajouter
                </button>
              </div>
              {createMovement.isError ? (
                <p className="mt-2 text-sm text-red-600">{(createMovement.error as Error).message}</p>
              ) : null}
            </form>
          ) : null}
        </Card>
      </div>

      {sessions.isLoading ? (
        <Loading label="Chargement des sessions…" />
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">Historique des sessions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <Th>Ouverte</Th>
                  <Th>Fermée</Th>
                  <Th>Fonds initial</Th>
                  <Th>Attendu</Th>
                  <Th>Déclaré</Th>
                  <Th>Écart</Th>
                  <Th>Statut</Th>
                </tr>
              </thead>
              <tbody>
                {(sessions.data ?? [])
                  .slice()
                  .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
                  .map((s) => {
                    const gap =
                      s.closingDifferenceFcfa != null
                        ? s.closingDifferenceFcfa
                        : null;
                    return (
                      <tr key={s.id} className="border-t border-slate-100">
                        <Td>{dateTimeFr(s.openedAt)}</Td>
                        <Td>{s.closedAt ? dateTimeFr(s.closedAt) : '—'}</Td>
                        <Td>{fcfa(s.openingBalanceFcfa)}</Td>
                        <Td>{s.closingExpectedFcfa != null ? fcfa(s.closingExpectedFcfa) : '—'}</Td>
                        <Td>{s.closingBalanceFcfa != null ? fcfa(s.closingBalanceFcfa) : '—'}</Td>
                        <Td>
                          {gap != null ? (
                            <span className={classNames('font-medium', gap === 0 ? 'text-emerald-600' : 'text-red-600')}>
                              {gap > 0 ? '+' : ''}
                              {fcfa(gap)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </Td>
                        <Td><StatusBadge status={s.status} /></Td>
                      </tr>
                    );
                  })}
                {!sessions.data?.length ? (
                  <tr>
                    <Td className="py-8 text-center text-slate-400">
                      <EmptyState message="Aucune session de caisse." />
                    </Td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api/client';
import type { Customer } from '../api/types';
import { useFarm } from '../app/FarmContext';
import { Card, EmptyState, PageHeader, Th, Td } from '../components/ui';
import { dateFr, fcfa } from '../lib/format';

const inputCls =
  'w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100';

const selectCls =
  'rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-sky-500';

export const CUSTOMER_TYPES = [
  'PARTICULIER',
  'RESTAURANT',
  'HOTEL',
  'EVENEMENT',
  'TRAITEUR',
  'COMMERCE',
  'REVENDEUR',
  'GROSSISTE',
  'BOULANGERIE',
  'COLLECTIVITE',
  'ENTREPRISE',
  'ELEVEUR',
  'ONG',
  'TRANSFORMATEUR',
] as const;

export function CustomersPage() {
  const { farmId } = useFarm();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');

  const customers = useQuery({
    queryKey: ['customers', farmId],
    queryFn: () => api.get<Customer[]>(`/farms/${farmId}/customers`),
    enabled: !!farmId,
  });

  const createC = useMutation({
    mutationFn: (body: { fullName: string; phone?: string; type?: string }) =>
      api.post<Customer>(`/farms/${farmId}/customers`, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['customers', farmId] }),
  });

  const patchType = useMutation({
    mutationFn: ({ id, type }: { id: string; type: string }) =>
      api.patch<Customer>(`/farms/${farmId}/customers/${id}`, { type }),
    onMutate: ({ id, type }) => {
      queryClient.setQueryData<Customer[]>(['customers', farmId], (prev) =>
        (prev ?? []).map((c) => (c.id === id ? { ...c, type } : c)),
      );
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['customers', farmId] }),
  });

  const needle = q.trim().toLowerCase();
  const rows = (customers.data ?? []).filter((c) => {
    if (!needle) return true;
    return (
      c.fullName.toLowerCase().includes(needle) ||
      (c.phone ?? '').toLowerCase().includes(needle) ||
      (c.code ?? '').toLowerCase().includes(needle)
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients & fidélité"
        subtitle="Fiches clients, codes, segments et solde dû."
        actions={
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              createC.mutate({
                fullName: String(f.get('fullName')),
                phone: (f.get('phone') as string) || undefined,
                type: (f.get('type') as string) || 'PARTICULIER',
              });
              e.currentTarget.reset();
            }}
          >
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-600">Nom *</span>
              <input name="fullName" required className={inputCls} placeholder="Nom complet" />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-600">Téléphone</span>
              <input name="phone" className={inputCls} placeholder="+241…" />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-600">Type</span>
              <select name="type" defaultValue="PARTICULIER" className={selectCls}>
                {CUSTOMER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={createC.isPending}
              className="flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
            >
              <Users className="h-4 w-4" /> Ajouter
            </button>
          </form>
        }
      />

      {createC.isError ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {(createC.error as Error).message}
        </p>
      ) : null}

      <div className="flex max-w-sm items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher par nom, téléphone ou code…"
          className={inputCls}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <Th>Client</Th>
                <Th>Code</Th>
                <Th>Téléphone</Th>
                <Th>Type</Th>
                <Th className="text-right">Dû</Th>
                <Th>Segment</Th>
                <Th>Inscrit le</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <Td className="font-medium">{c.fullName}</Td>
                  <Td>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                      {c.code ?? '—'}
                    </span>
                  </Td>
                  <Td>{c.phone ?? '—'}</Td>
                  <Td>
                    <select
                      value={c.type}
                      onChange={(e) => patchType.mutate({ id: c.id, type: e.target.value })}
                      className={selectCls}
                      disabled={patchType.isPending}
                      title="Catégorie commerciale (indicative)"
                    >
                      {CUSTOMER_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Td>
                  <Td className="text-right tabular-nums">
                    {c.balance && c.balance.outstandingFcfa > 0 ? (
                      <span className="font-medium text-rose-600">{fcfa(c.balance.outstandingFcfa)}</span>
                    ) : (
                      <span className="text-emerald-600">Soldé</span>
                    )}
                  </Td>
                  <Td>
                    <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700">
                      {c.segment}
                    </span>
                  </Td>
                  <Td>{dateFr(c.createdAt)}</Td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <Td className="py-8 text-center text-slate-400">
                    <EmptyState
                      message={
                        needle ? 'Aucun client ne correspond à la recherche.' : 'Aucun client enregistré.'
                      }
                    />
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
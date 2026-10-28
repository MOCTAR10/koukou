import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgePercent, X } from 'lucide-react';
import { api } from '../api/client';
import type { Promotion } from '../api/types';
import { useFarm } from '../app/FarmContext';
import { Card, EmptyState, PageHeader, StatusBadge, Th, Td } from '../components/ui';
import { dateFr, fcfa } from '../lib/format';

const inputCls =
  'w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100';

export function PromotionsPage() {
  const { farmId } = useFarm();
  const queryClient = useQueryClient();

  const promos = useQuery({
    queryKey: ['promotions', farmId],
    queryFn: () => api.get<Promotion[]>(`/farms/${farmId}/promotions`),
    enabled: !!farmId,
  });

  const createP = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Promotion>(`/farms/${farmId}/promotions`, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['promotions', farmId] }),
  });

  const toggleP = useMutation({
    mutationFn: (p: Promotion) =>
      api.patch<Promotion>(`/farms/${farmId}/promotions/${p.id}`, { active: !p.active }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['promotions', farmId] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Promotions & codes promo"
        subtitle="Coupons de réduction appliqués au POS (réutilisables)."
      />

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <BadgePercent className="h-4 w-4 text-sky-600" />
          <h2 className="text-sm font-semibold text-slate-700">Créer un code</h2>
        </div>
        <form
          className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            const code = String(f.get('code')).trim().toUpperCase();
            const label = String(f.get('label') ?? '').trim();
            createP.mutate(
              {
              code,
              // The backend requires a label: default to the code.
              label: label || code,
              type: f.get('type'),
              value: Number(f.get('value')),
              minSubtotalFcfa: f.get('minSubtotalFcfa') ? Number(f.get('minSubtotalFcfa')) : undefined,
              active: true,
              },
              { onSuccess: () => form.reset() },
            );
          }}
        >
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-600">Code *</span>
            <input name="code" required className={inputCls} placeholder="PROMO10" />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-600">Libellé</span>
            <input name="label" className={inputCls} placeholder="Remise fidélité" />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-600">Type</span>
            <select name="type" className={inputCls} defaultValue="PCT">
              <option value="PCT">Pourcentage</option>
              <option value="FCFA">Montant fixe</option>
            </select>
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-600">Valeur</span>
            <input name="value" type="number" min={1} required className={inputCls} />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-600">Minimum (FCFA)</span>
            <input name="minSubtotalFcfa" type="number" min={0} className={inputCls} />
          </label>
          <button
            type="submit"
            disabled={createP.isPending}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {createP.isPending ? 'Création…' : 'Créer'}
          </button>
          <p className="hidden text-xs text-slate-400 lg:block">
            Le code est automatiquement normalisé en majuscules.
          </p>
        </form>
        {createP.isError ? (
          <p className="mt-3 text-sm text-red-600">{(createP.error as Error).message}</p>
        ) : null}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-700">Codes existants</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <Th>Code</Th>
                <Th>Remise</Th>
                <Th>Mini (FCFA)</Th>
                <Th>Valable du</Th>
                <Th>au</Th>
                <Th>Statut</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {(promos.data ?? []).map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <Td className="font-mono font-semibold">{p.code}</Td>
                  <Td>
                    {p.type === 'PCT' ? `-${p.value} %` : `-${fcfa(p.value)}`}
                  </Td>
                  <Td>{p.minSubtotalFcfa != null ? fcfa(p.minSubtotalFcfa) : '—'}</Td>
                  <Td>{p.startDate ? dateFr(p.startDate) : '—'}</Td>
                  <Td>{p.endDate ? dateFr(p.endDate) : '—'}</Td>
                  <Td><StatusBadge status={p.active ? 'active' : 'inactive'} /></Td>
                  <Td>
                    <button
                      onClick={() => toggleP.mutate(p)}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      {p.active ? <X className="h-3.5 w-3.5" /> : null}
                      {p.active ? 'Désactiver' : 'Activer'}
                    </button>
                  </Td>
                </tr>
              ))}
              {!promos.data?.length ? (
                <tr>
                  <Td className="py-8 text-center text-slate-400">
                    <EmptyState message="Aucun code promo." />
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
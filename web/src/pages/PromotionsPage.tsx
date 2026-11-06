import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgePercent, Check, Plus, X } from 'lucide-react';
import { api } from '../api/client';
import type { PromotionFull } from '../api/types-sales';
import { useFarm } from '../app/FarmContext';
import { useFarmProfile } from '../app/useFarmProfile';
import { ReadOnlyNotice } from '../components/access/ReadOnlyNotice';
import { Button, ErrorNote, Field, inputCls } from '../components/form';
import { Card, DataTable, EmptyState, Loading, PageHeader, StatusBadge, Td, Th } from '../components/ui';
import { dateFr, fcfa } from '../lib/format';

export function PromotionsPage() {
  const { farmId } = useFarm();
  const queryClient = useQueryClient();
  const [invalid, setInvalid] = useState<string | null>(null);
  // POUFA lot A droits: an institution (VENTES:CONSULTER) reads the codes only.
  const canEdit = useFarmProfile().hasPermission('vente:promotion');

  const promos = useQuery({
    queryKey: ['promotions', farmId],
    queryFn: () => api.get<PromotionFull[]>(`/farms/${farmId}/promotions`),
    enabled: !!farmId,
  });

  const createP = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<PromotionFull>(`/farms/${farmId}/promotions`, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['promotions', farmId] }),
  });

  const toggleP = useMutation({
    mutationFn: (p: PromotionFull) => api.patch<PromotionFull>(`/farms/${farmId}/promotions/${p.id}`, { active: !p.active }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['promotions', farmId] }),
  });

  const rows = promos.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Promotions & codes promo" subtitle="Coupons de réduction appliqués au point de vente (réutilisables)." icon={<BadgePercent />} />

      <ReadOnlyNotice what="codes promotion" />
      <ErrorNote error={promos.error ?? toggleP.error} />

      {canEdit ? (
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <BadgePercent className="h-4 w-4 text-brand-600" />
          <h2 className="text-sm font-semibold text-slate-700">Créer un code</h2>
        </div>
        <form
          className="grid items-start gap-3 sm:grid-cols-3 lg:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            const code = String(f.get('code')).trim().toUpperCase();
            const label = String(f.get('label') ?? '').trim();
            const type = String(f.get('type'));
            const value = Number(f.get('value'));
            if (!Number.isInteger(value) || value <= 0) {
              setInvalid('La valeur doit être un nombre entier positif.');
              return;
            }
            if (type === 'PCT' && value > 100) {
              setInvalid('Un pourcentage ne peut pas dépasser 100 %.');
              return;
            }
            setInvalid(null);
            createP.mutate(
              {
                code,
                // The backend requires a label: default to the code.
                label: label || code,
                type,
                value,
                minSubtotalFcfa: f.get('minSubtotalFcfa') ? Number(f.get('minSubtotalFcfa')) : undefined,
                active: true,
              },
              { onSuccess: () => form.reset() },
            );
          }}
        >
          <Field label="Code" hint="Mis en majuscules automatiquement.">
            <input name="code" required className={`${inputCls} uppercase`} placeholder="PROMO10" />
          </Field>
          <Field label="Libellé">
            <input name="label" className={inputCls} placeholder="Remise fidélité" />
          </Field>
          <Field label="Type">
            <select name="type" className={inputCls} defaultValue="PCT">
              <option value="PCT">Pourcentage</option>
              <option value="FCFA">Montant fixe</option>
            </select>
          </Field>
          <Field label="Valeur">
            <input name="value" type="number" min={1} step={1} required className={inputCls} />
          </Field>
          <Field label="Minimum (FCFA)">
            <input name="minSubtotalFcfa" type="number" min={0} step={1} className={inputCls} />
          </Field>
          <div className="pt-5">
            <Button type="submit" className="w-full" busy={createP.isPending}>
              {createP.isPending ? null : <Plus className="h-4 w-4" />}
              Créer
            </Button>
          </div>
        </form>
        <div className="mt-3">
          <ErrorNote error={invalid ?? createP.error} />
        </div>
      </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <BadgePercent className="h-4 w-4 text-brand-600" /> Codes existants
          </h2>
        </div>
        {promos.isLoading ? (
          <div className="p-4">
            <Loading label="Chargement des codes…" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={<BadgePercent />} message="Aucun code promo." />
          </div>
        ) : (
          <DataTable>
              <thead className="bg-slate-50">
                <tr>
                  <Th>Code</Th>
                  <Th>Libellé</Th>
                  <Th>Remise</Th>
                  <Th className="hidden lg:table-cell">Minimum</Th>
                  <Th>Valable du</Th>
                  <Th>au</Th>
                  <Th>Statut</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <Td className="font-mono font-semibold">{p.code}</Td>
                    <Td label="Libellé">{p.label}</Td>
                    <Td label="Remise" className="whitespace-nowrap">{p.type === 'PCT' ? `− ${p.value} %` : `− ${fcfa(p.value)}`}</Td>
                    <Td label="Minimum" className="whitespace-nowrap md:max-lg:hidden">{p.minSubtotalFcfa != null ? fcfa(p.minSubtotalFcfa) : '—'}</Td>
                    <Td label="Valable du">{p.startDate ? dateFr(p.startDate) : '—'}</Td>
                    <Td label="au">{p.endDate ? dateFr(p.endDate) : '—'}</Td>
                    <Td label="Statut">
                      <StatusBadge status={p.active ? 'active' : 'inactive'} />
                    </Td>
                    <Td>
                      {canEdit ? (
                      <Button
                        tone="secondary"
                        className="px-2 py-1 text-xs"
                        disabled={toggleP.isPending}
                        onClick={() => toggleP.mutate(p)}
                      >
                        {p.active ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                        {p.active ? 'Désactiver' : 'Activer'}
                      </Button>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
        )}
      </Card>
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { SlidersHorizontal } from 'lucide-react';
import { api } from '../api/client';
import type { ReferenceConstant } from '../api/types';
import { Card, EmptyState, Loading, PageHeader, Th, Td } from '../components/ui';
import { num } from '../lib/format';

export function SettingsPage() {
  const constants = useQuery({
    queryKey: ['reference-constants'],
    queryFn: () => api.get<ReferenceConstant[]>('/reference-constants'),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Réglages"
        subtitle="Constantes de référence globales (lecture). La modification relève de l'administrateur plateforme."
      />

      {constants.isLoading ? (
        <Loading label="Chargement des constantes…" />
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <SlidersHorizontal className="h-4 w-4 text-slate-400" /> Constantes de référence
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <Th>Clé</Th>
                  <Th>Libellé</Th>
                  <Th>Valeur</Th>
                </tr>
              </thead>
              <tbody>
                {(constants.data ?? [])
                  .slice()
                  .sort((a, b) => a.key.localeCompare(b.key))
                  .map((c) => (
                    <tr key={c.key} className="border-t border-slate-100">
                      <Td className="font-mono text-xs">{c.key}</Td>
                      <Td>{c.description ?? '—'}</Td>
                      <Td className="font-semibold">{num(c.value)}</Td>
                    </tr>
                  ))}
                {!constants.data?.length ? (
                  <tr>
                    <Td className="py-8 text-center text-slate-400">
                      <EmptyState message="Aucune constante." />
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
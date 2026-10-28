import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check } from 'lucide-react';
import { api } from '../api/client';
import type { Alert } from '../api/types';
import { useFarm } from '../app/FarmContext';
import { Card, EmptyState, LevelBadge, Loading, PageHeader, StatusBadge, Th, Td } from '../components/ui';
import { dateFr } from '../lib/format';

export function AlertsPage() {
  const { farmId } = useFarm();
  const queryClient = useQueryClient();

  const active = useQuery({
    queryKey: ['alerts', farmId, 'active'],
    queryFn: () => api.get<Alert[]>(`/farms/${farmId}/alerts?status=ACTIVE`),
    enabled: !!farmId,
    refetchInterval: 60_000,
  });

  const history = useQuery({
    queryKey: ['alerts', farmId, 'history'],
    queryFn: () => api.get<Alert[]>(`/farms/${farmId}/alerts/history`),
    enabled: !!farmId,
  });

  const ack = useMutation({
    mutationFn: (id: string) =>
      api.post(`/farms/${farmId}/alerts/${id}/acknowledge`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alerts', farmId] });
    },
  });

  const rows = active.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alertes & recommandations"
        subtitle="Le moteur d'alerte surveille vos lots et propose des actions."
        actions={
          <span className="flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            <Bell className="h-4 w-4" />
            {rows.filter((a) => a.level === 'ROUGE').length} rouge(s) ·{' '}
            {rows.filter((a) => a.level === 'JAUNE').length} jaune(s) actives
          </span>
        }
      />

      {active.isLoading ? (
        <Loading label="Chargement des alertes…" />
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">Alertes actives</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <Th>Niveau</Th>
                  <Th>Message</Th>
                  <Th>Recommandation</Th>
                  <Th>Depuis</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100">
                    <Td><LevelBadge level={a.level} /></Td>
                    <Td className="max-w-[320px]">
                      <p className="font-medium text-slate-800">{a.message}</p>
                      <p className="text-xs text-slate-400">{a.kind}</p>
                    </Td>
                    <Td className="max-w-[260px] text-sm text-slate-500">
                      {a.recommendation ?? '—'}
                    </Td>
                    <Td>{dateFr(a.createdAt)}</Td>
                    <Td>
                      {a.status === 'ACTIVE' ? (
                        <button
                          onClick={() => ack.mutate(a.id)}
                          className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                          <Check className="h-3.5 w-3.5" /> Acquitter
                        </button>
                      ) : (
                        <StatusBadge status={a.status} />
                      )}
                    </Td>
                  </tr>
                ))}
                {!rows.length ? (
                  <tr>
                    <Td className="py-10 text-center text-slate-400">
                      <EmptyState message="Aucune alerte active. Bonne santé !" />
                    </Td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-700">Historique</h2>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <Th>Niveau</Th>
                <Th>Message</Th>
                <Th>Créée</Th>
                <Th>Résolue</Th>
              </tr>
            </thead>
            <tbody>
              {(history.data ?? [])
                .slice()
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .slice(0, 40)
                .map((a) => (
                  <tr key={a.id} className="border-t border-slate-100">
                    <Td><LevelBadge level={a.level} /></Td>
                    <Td className="max-w-[320px] text-slate-600">{a.message}</Td>
                    <Td>{dateFr(a.createdAt)}</Td>
                    <Td>{a.resolvedAt ? dateFr(a.resolvedAt) : '—'}</Td>
                  </tr>
                ))}
              {!history.data?.length ? (
                <tr>
                  <Td className="py-8 text-center text-slate-400">Aucun historique.</Td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
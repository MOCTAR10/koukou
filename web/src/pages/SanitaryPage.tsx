import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldPlus, Syringe } from 'lucide-react';
import { api } from '../api/client';
import type { BatchWithMetrics } from '../api/types';
import { useFarm } from '../app/FarmContext';
import { Card, EmptyState, Loading, PageHeader, StatusBadge, Th, Td } from '../components/ui';
import { classNames, dateFr, statusLabel } from '../lib/format';

interface ProphylaxisEvent {
  id: string;
  protocolStepId: string | null;
  name: string;
  scheduledDate: string;
  status: string;
}

interface Protocol {
  id: string;
  name: string;
  species: string;
  type: string;
  isEditable: boolean;
}

interface Treatment {
  id: string;
  careType: string;
  productName: string;
  dosage: string | null;
  route: string | null;
  treatedAt: string;
  withdrawalDays: number;
  withdrawalEndDate: string | null;
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100';

const STATUS_IDX: Record<string, number> = { PLANIFIE: 0, EN_RETARD: 1, FAIT: 2, ANNULE: 3 };

export function SanitaryPage() {
  const { farmId } = useFarm();
  const queryClient = useQueryClient();
  const [pickedBatchId, setBatchId] = useState('');
  const [protocolId, setProtocolId] = useState('');

  const batches = useQuery({
    queryKey: ['batches', farmId],
    queryFn: () => api.get<BatchWithMetrics[]>(`/farms/${farmId}/batches`),
    enabled: !!farmId,
  });
  const activeBatches = (batches.data ?? []).filter((b) => b.status !== 'CLOTURE');
  // A lot chosen on another farm is not valid here (farm switch).
  const batch = activeBatches.find((b) => b.id === pickedBatchId) ?? null;
  const batchId = batch?.id ?? '';

  // Only programs matching the lot's species and type: a POULET program must
  // never be generated on a PINTADE or laying lot.
  const protocols = useQuery({
    queryKey: ['protocols', farmId, batch?.species, batch?.type],
    queryFn: () =>
      api.get<Protocol[]>(
        `/sanitary/protocols?farmId=${encodeURIComponent(farmId!)}&species=${encodeURIComponent(batch!.species)}&type=${encodeURIComponent(batch!.type)}`,
      ),
    enabled: !!batch && !!farmId,
  });
  const protocol =
    protocols.data?.find((p) => p.id === protocolId) ?? protocols.data?.[0] ?? null;

  const events = useQuery({
    queryKey: ['prophylaxis', farmId, batchId],
    queryFn: () =>
      api.get<ProphylaxisEvent[]>(`/farms/${farmId}/batches/${batchId}/prophylaxis`),
    enabled: !!farmId && !!batchId,
  });

  const treatments = useQuery({
    queryKey: ['treatments', farmId, batchId],
    queryFn: () =>
      api.get<Treatment[]>(`/farms/${farmId}/batches/${batchId}/treatments`),
    enabled: !!farmId && !!batchId,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['prophylaxis', farmId, batchId] });
    void queryClient.invalidateQueries({ queryKey: ['treatments', farmId, batchId] });
    void queryClient.invalidateQueries({ queryKey: ['alerts', farmId] });
  };

  const genCalendar = useMutation({
    mutationFn: (protocolId?: string) =>
      api.post(`/farms/${farmId}/batches/${batchId}/prophylaxis/generate`, {
        protocolId,
      }),
    onSuccess: invalidate,
  });

  const completeEvent = useMutation({
    mutationFn: (eventId: string) =>
      api.post(`/farms/${farmId}/batches/${batchId}/prophylaxis/${eventId}/complete`),
    onSuccess: invalidate,
  });

  const cancelEvent = useMutation({
    mutationFn: (eventId: string) =>
      api.post(`/farms/${farmId}/batches/${batchId}/prophylaxis/${eventId}/cancel`, {
        reason: 'Annulé sur le web',
      }),
    onSuccess: invalidate,
  });

  const addTreatment = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Treatment>(`/farms/${farmId}/batches/${batchId}/treatments`, body),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sanitaire & prophylaxie"
        subtitle="Calendrier vaccinal, traitements HACCP et délais d'attente."
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-xs sm:min-w-[220px]">
            <span className="mb-1 block font-medium text-slate-600">Lot</span>
            <select className={inputCls} value={batchId} onChange={(e) => setBatchId(e.target.value)}>
              <option value="">— Sélectionner un lot —</option>
              {activeBatches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batchName ?? b.id.slice(0, 8)} ({statusLabel(b.type)})
                </option>
              ))}
            </select>
          </label>
          {batchId ? (
            <>
              <button
                onClick={() => genCalendar.mutate(undefined)}
                disabled={genCalendar.isPending}
                className="flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
              >
                <ShieldPlus className="h-4 w-4" /> Générer calendrier standard
              </button>
              {protocol && protocols.data ? (
                <>
                  <select
                    className={classNames(inputCls, 'sm:max-w-[240px]')}
                    value={protocol.id}
                    onChange={(e) => setProtocolId(e.target.value)}
                  >
                    {protocols.data.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => genCalendar.mutate(protocol.id)}
                    disabled={genCalendar.isPending}
                    className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Générer ce programme
                  </button>
                </>
              ) : null}
            </>
          ) : null}
        </div>
        {genCalendar.isError ? (
          <p className="mt-3 text-sm text-red-600">{(genCalendar.error as Error).message}</p>
        ) : null}
      </Card>

      {!batchId ? (
        <EmptyState message="Sélectionnez un lot pour voir son calendrier sanitaire." />
      ) : events.isLoading ? (
        <Loading label="Chargement du calendrier…" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Syringe className="h-4 w-4 text-sky-600" /> Calendrier prophylactique
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Soin</Th>
                    <Th>Prévu</Th>
                    <Th>Statut</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {(events.data ?? [])
                    .slice()
                    .sort(
                      (a, b) =>
                        (STATUS_IDX[a.status] ?? 9) - (STATUS_IDX[b.status] ?? 9) ||
                        a.scheduledDate.localeCompare(b.scheduledDate),
                    )
                    .map((e) => (
                      <tr key={e.id} className="border-t border-slate-100">
                        <Td className="font-medium">{e.name}</Td>
                        <Td>{dateFr(e.scheduledDate)}</Td>
                        <Td><StatusBadge status={e.status} /></Td>
                        <Td>
                          <div className="flex gap-1">
                            {e.status === 'PLANIFIE' || e.status === 'EN_RETARD' ? (
                              <>
                                <button
                                  onClick={() => completeEvent.mutate(e.id)}
                                  className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-700"
                                >
                                  Fait
                                </button>
                                <button
                                  onClick={() => cancelEvent.mutate(e.id)}
                                  className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-300"
                                >
                                  Annuler
                                </button>
                              </>
                            ) : null}
                          </div>
                        </Td>
                      </tr>
                    ))}
                  {!events.data?.length ? (
                    <tr>
                      <Td className="py-8 text-center text-slate-400">
                        Aucun soin planifié. Générez le calendrier.
                      </Td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="overflow-hidden">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-700">Traitements (registre HACCP)</h2>
              </div>
              <div className="max-h-[220px] overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>Produit</Th>
                      <Th>Type</Th>
                      <Th>Délai d'attente</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(treatments.data ?? []).map((t) => (
                      <tr key={t.id} className="border-t border-slate-100">
                        <Td className="font-medium">{t.productName}</Td>
                        <Td><StatusBadge status={t.careType} /></Td>
                        <Td>
                          {t.withdrawalDays > 0 ? (
                            <span className={classNames(t.withdrawalEndDate ? 'text-red-600' : '')}>
                              {t.withdrawalDays} j{t.withdrawalEndDate ? ` (jusqu'au ${dateFr(t.withdrawalEndDate)})` : ''}
                            </span>
                          ) : (
                            'aucun'
                          )}
                        </Td>
                      </tr>
                    ))}
                    {!treatments.data?.length ? (
                      <tr>
                        <Td className="py-6 text-center text-slate-400">Aucun traitement.</Td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">Enregistrer un traitement</h2>
              <form
                className="grid gap-3 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  addTreatment.mutate({
                    careType: f.get('careType'),
                    productName: String(f.get('productName')),
                    dosage: f.get('dosage') || undefined,
                    route: f.get('route') || undefined,
                    withdrawalDays: Number(f.get('withdrawalDays') ?? 0) || 0,
                  });
                  e.currentTarget.reset();
                }}
              >
                <select name="careType" required className={inputCls} defaultValue="ANTIBIOTIQUE">
                  <option value="ANTIBIOTIQUE">Antibiotique</option>
                  <option value="VACCIN">Vaccin</option>
                  <option value="MEDICAMENT">Médicament</option>
                  <option value="VITAMINE">Vitamine</option>
                  <option value="AUTRE">Autre</option>
                </select>
                <input name="productName" required placeholder="Produit *" className={inputCls} />
                <input name="dosage" placeholder="Dosage (ex. 1 g/L)" className={inputCls} />
                <input name="route" placeholder="Voie (eau, SC…)" className={inputCls} />
                <input type="number" name="withdrawalDays" min={0} defaultValue={0} placeholder="Délai d'attente (j)" className={inputCls} />
                <button
                  type="submit"
                  disabled={addTreatment.isPending}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                >
                  {addTreatment.isPending ? 'Enregistrement…' : 'Ajouter'}
                </button>
              </form>
              {addTreatment.isError ? (
                <p className="mt-3 text-sm text-red-600">{(addTreatment.error as Error).message}</p>
              ) : null}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
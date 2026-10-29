import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, TrendingUp, X } from 'lucide-react';
import { api } from '../api/client';
import type { BatchCurve, BatchWithMetrics } from '../api/types';
import { useFarm } from '../app/FarmContext';
import { Card, EmptyState, Loading, PageHeader, StatusBadge, Th, Td } from '../components/ui';
import { LineChart } from '../components/Charts';
import { classNames, dateFr, fcfa, num, pct, statusLabel } from '../lib/format';

interface DailyEntry {
  id: string;
  batchId: string;
  entryDate: string;
  deaths: number;
  feedBags: number;
  feedQuantity: number;
  feedUnit: string;
  waterL: number | null;
  avgWeightKg: number | null;
  eggsCollected: number;
  eggsCracked: number;
  eggsSmall: number;
}

/** Local calendar date (toISOString would give yesterday before 01:00 in Gabon, UTC+1). */
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function BatchesPage() {
  const { farmId } = useFarm();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // A batch of the previous farm must not stay selected after a farm switch.
  const [selectionFarmId, setSelectionFarmId] = useState(farmId);
  if (selectionFarmId !== farmId) {
    setSelectionFarmId(farmId);
    setSelectedId(null);
  }

  const batches = useQuery({
    queryKey: ['batches', farmId],
    queryFn: () => api.get<BatchWithMetrics[]>(`/farms/${farmId}/batches`),
    enabled: !!farmId,
  });

  const breeds = useQuery({
    // Shared breeds plus the farm's own custom ones.
    queryKey: ['breeds', farmId],
    queryFn: () =>
      api.get<Array<{ id: string; name: string; type: string }>>(
        `/breeds?farmId=${encodeURIComponent(farmId!)}`,
      ),
    enabled: !!farmId,
  });

  const selected = batches.data?.find((b) => b.id === selectedId) ?? null;

  const entries = useQuery({
    queryKey: ['daily-entries', farmId, selectedId],
    queryFn: () =>
      api.get<DailyEntry[]>(
        `/farms/${farmId}/batches/${selectedId}/daily-entries`,
      ),
    enabled: !!farmId && !!selectedId,
  });

  const curve = useQuery({
    queryKey: ['curve', farmId, selectedId],
    queryFn: () =>
      api.get<BatchCurve>(`/farms/${farmId}/batches/${selectedId}/curve`),
    enabled: !!farmId && !!selectedId,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['batches', farmId] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard', farmId] });
    if (selectedId) {
      void queryClient.invalidateQueries({ queryKey: ['daily-entries', farmId, selectedId] });
      void queryClient.invalidateQueries({ queryKey: ['curve', farmId, selectedId] });
    }
  };

  const createBatch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<BatchWithMetrics>(`/farms/${farmId}/batches`, body),
    onSuccess: (b) => {
      invalidate();
      setCreating(false);
      setSelectedId(b.id);
    },
  });

  const addEntry = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<DailyEntry>(`/farms/${farmId}/batches/${selectedId}/daily-entries`, body),
    onSuccess: invalidate,
  });

  if (batches.isLoading) return <Loading label="Chargement des lots…" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lots & suivi"
        subtitle="Lots en cours et historiques, saisies journalières, métriques zootechniques."
        actions={
          !creating ? (
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
            >
              <Plus className="h-4 w-4" /> Nouveau lot
            </button>
          ) : null
        }
      />

      {creating ? (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Créer un lot</h2>
            <button onClick={() => setCreating(false)} className="rounded p-1 text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <form
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              createBatch.mutate({
                batchName: String(f.get('batchName')),
                integrationDate: String(f.get('integrationDate')),
                quantityAtStart: Number(f.get('quantityAtStart')),
                breedId: f.get('breedId') || undefined,
                type: f.get('type'),
                species: String(f.get('species') || 'POULET'),
                chickUnitPriceFcfa: f.get('chickUnitPriceFcfa')
                  ? Number(f.get('chickUnitPriceFcfa'))
                  : undefined,
              });
            }}
          >
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-600">Nom du lot / bâtiment *</span>
              <input name="batchName" required className={inputCls} placeholder="Bâtiment A" />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-600">Date d'arrivée *</span>
              <input name="integrationDate" type="date" required defaultValue={todayIso()} className={inputCls} />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-600">Poussins au départ *</span>
              <input name="quantityAtStart" type="number" min={1} required className={inputCls} />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-600">Type *</span>
              <select name="type" required defaultValue="CHAIR" className={inputCls}>
                <option value="CHAIR">Chair</option>
                <option value="PONDEUSE">Pondeuse</option>
              </select>
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-600">Espèce *</span>
              <select name="species" required defaultValue="POULET" className={inputCls}>
                <option value="POULET">Poulet</option>
                <option value="PINTADE">Pintade</option>
                <option value="DINDE">Dinde</option>
                <option value="CAILLE">Caille</option>
                <option value="CANARD">Canard</option>
                <option value="OIE">Oie</option>
                <option value="FAISAN">Faisan</option>
                <option value="AUTRE">Autre (volailles)</option>
              </select>
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-600">Souche</span>
              <select name="breedId" className={inputCls}>
                <option value="">— Par défaut —</option>
                {breeds.data?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-600">Prix poussin (FCFA)</span>
              <input name="chickUnitPriceFcfa" type="number" min={0} className={inputCls} placeholder="ex. 750" />
            </label>
            <div className="sm:col-span-2 lg:col-span-3">
              <button
                type="submit"
                disabled={createBatch.isPending}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
              >
                {createBatch.isPending ? 'Création…' : 'Créer le lot'}
              </button>
              {createBatch.isError ? (
                <p className="mt-2 text-sm text-red-600">
                  {(createBatch.error as Error).message}
                </p>
              ) : null}
            </div>
          </form>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-1">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">Liste des lots</h2>
          </div>
          <div className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto">
            {batches.data?.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedId(b.id)}
                className={classNames(
                  'flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50',
                  selectedId === b.id ? 'bg-sky-50' : '',
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {b.batchName ?? b.id.slice(0, 8)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {statusLabel(b.type)} · {b.metrics.ageDays} j · {num(b.metrics.liveCount)} vivants
                  </p>
                </div>
                <StatusBadge status={b.status} />
              </button>
            ))}
            {!batches.data?.length ? (
              <div className="p-4">
                <EmptyState message="Aucun lot pour cette ferme." />
              </div>
            ) : null}
          </div>
        </Card>

        <div className="lg:col-span-2">
          {!selected ? (
            <EmptyState message="Sélectionnez un lot pour voir son suivi." />
          ) : (
            <div className="space-y-4">
              <Card className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      {selected.batchName ?? selected.id.slice(0, 8)}
                    </h2>
                    <p className="mt-0.5 text-sm text-slate-500">
                      Intégré le {dateFr(selected.integrationDate)} · {statusLabel(selected.type)} ·{' '}
                      {selected.couvoirSupplier ?? 'Origine non renseignée'}
                    </p>
                    {selected.chickUnitPriceFcfa != null ? (
                      <p className="mt-0.5 text-xs text-slate-400">
                        Poussins à {fcfa(selected.chickUnitPriceFcfa)}/unité
                        {selected.chickLotNumber
                          ? ` · N° lot couvoir ${selected.chickLotNumber}`
                          : ''}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge status={selected.status} />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Metric label="Vivants" value={num(selected.metrics.liveCount)} />
                  <Metric label="Mortalité" value={pct(selected.metrics.mortalityPercent)} />
                  <Metric label="Viabilité" value={pct(selected.metrics.viabilityPercent)} />
                  <Metric label="Âge" value={`${selected.metrics.ageDays} j`} />
                  <Metric label="IC cumulé" value={num(selected.metrics.fcr, 2)} />
                  <Metric label="GMQ" value={selected.metrics.gmqGramsPerDay != null ? `${num(selected.metrics.gmqGramsPerDay)} g/j` : '—'} />
                  <Metric label="IPE" value={num(selected.metrics.ipe)} />
                  <Metric label="Taux ponte" value={pct(selected.metrics.layRatePercent)} />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {selected.status === 'ACTIF' ? (
                    <ActionBtn
                      color="emerald"
                      onClick={() => {
                        void api
                          .post(`/farms/${farmId}/batches/${selected.id}/vente`)
                          .then(invalidate)
                          .catch((err: Error) => alert(err.message));
                      }}
                    >
                      <TrendingUp className="h-4 w-4" /> Passer en vente
                    </ActionBtn>
                  ) : null}
                  {selected.status !== 'CLOTURE' ? (
                    <ActionBtn
                      color="slate"
                      onClick={() => {
                        if (confirm('Clôturer ce lot ? Cette action est irréversible.')) {
                          void api
                            .post(`/farms/${farmId}/batches/${selected.id}/cloture`)
                            .then(invalidate)
                            .catch((err: Error) => alert(err.message));
                        }
                      }}
                    >
                      Clôturer le lot
                    </ActionBtn>
                  ) : null}
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-700">Nouvelle saisie journalière</h3>
                <form
                  className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const f = new FormData(form);
                    // Blank field = not sent: the backend upsert keeps the value
                    // already saved for that date (e.g. from mobile) instead of 0.
                    const n = (k: string) => {
                      const v = String(f.get(k) ?? '').trim();
                      return v === '' ? undefined : Number(v);
                    };
                    const feedQuantity = n('feedQuantity');
                    addEntry.mutate(
                      {
                        entryDate: String(f.get('entryDate')),
                        deaths: n('deaths'),
                        feedQuantity,
                        feedUnit: feedQuantity !== undefined ? 'KG' : undefined,
                        waterL: n('waterL'),
                        avgWeightKg: n('avgWeightKg'),
                        eggsCollected: n('eggsCollected'),
                        eggsCracked: n('eggsCracked'),
                        eggsSmall: n('eggsSmall'),
                      },
                      { onSuccess: () => form.reset() },
                    );
                  }}
                >
                  <label className="block text-xs">
                    <span className="mb-1 block font-medium text-slate-600">Date *</span>
                    <input name="entryDate" type="date" required defaultValue={todayIso()} className={inputCls} />
                  </label>
                  <Field name="deaths" type="number" label="Morts" />
                  <Field name="feedQuantity" type="number" label="Aliment (kg)" />
                  <Field name="waterL" type="number" step="0.1" label="Eau (L)" />
                  <Field name="avgWeightKg" type="number" step="0.01" label="Poids moyen (kg)" />
                  <Field name="eggsCollected" type="number" label="Œufs collectés" />
                  <Field name="eggsCracked" type="number" label="Œufs fêlés" />
                  <Field name="eggsSmall" type="number" label="Petits œufs" />
                  <button
                    type="submit"
                    disabled={addEntry.isPending}
                    className="sm:col-span-3 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60 lg:col-span-2"
                  >
                    {addEntry.isPending ? 'Enregistrement…' : 'Enregistrer la saisie'}
                  </button>
                  {addEntry.isError ? (
                    <p className="text-xs text-red-600 sm:col-span-3">
                      {(addEntry.error as Error).message}
                    </p>
                  ) : null}
                </form>
              </Card>

              {curve.data?.weekly.length ? (
                <Card className="p-4">
                  <h3 className="mb-3 text-sm font-semibold text-slate-700">
                    Courbe hebdomadaire (poids moyen / IC cumulé)
                  </h3>
                  <LineChart
                    data={curve.data.weekly.map((w) => w.fcrCumulative ?? null)}
                    labels={curve.data.weekly.map((w) => dateFr(w.weekStart))}
                    valueFmt={(v) => v.toFixed(2)}
                    color="#0d9488"
                  />
                </Card>
              ) : null}

              <Card className="overflow-hidden">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-slate-700">Historique des saisies</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <Th>Date</Th>
                        <Th>Morts</Th>
                        <Th>Aliment</Th>
                        <Th>Eau (L)</Th>
                        <Th>Poids (kg)</Th>
                        <Th>Œufs</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...(entries.data ?? [])]
                        .slice()
                        .sort((a, b) => b.entryDate.localeCompare(a.entryDate))
                        .slice(0, 12)
                        .map((e) => (
                          <tr key={e.id} className="border-t border-slate-100">
                            <Td>{dateFr(e.entryDate)}</Td>
                            <Td>{e.deaths}</Td>
                            <Td>
                              {num(e.feedQuantity)} kg
                            </Td>
                            <Td>{e.waterL != null ? num(e.waterL) : '—'}</Td>
                            <Td>{e.avgWeightKg != null ? e.avgWeightKg.toFixed(2) : '—'}</Td>
                            <Td>
                              {e.eggsCollected > 0
                                ? `${e.eggsCollected} (${e.eggsCracked} fêlés, ${e.eggsSmall} petits)`
                                : '—'}
                            </Td>
                          </tr>
                        ))}
                      {!entries.data?.length ? (
                        <tr>
                          <Td className="py-8 text-center text-slate-400">
                            Aucune saisie pour ce lot.
                          </Td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100';

function Field({ name, type, label, step }: { name: string; type: string; label: string; step?: string }) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block font-medium text-slate-600">{label}</span>
      <input name={name} type={type} min={0} step={step} className={inputCls} />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-base font-bold text-slate-800">{value}</p>
    </div>
  );
}

function ActionBtn({
  onClick,
  color,
  children,
}: {
  onClick: () => void;
  color: 'emerald' | 'slate';
  children: React.ReactNode;
}) {
  const cls =
    color === 'emerald'
      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
      : 'bg-slate-200 hover:bg-slate-300 text-slate-700';
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${cls}`}>
      {children}
    </button>
  );
}
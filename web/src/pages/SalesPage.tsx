import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, RotateCcw, ShoppingCart, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import type { BatchWithMetrics, Promotion, Sale } from '../api/types';
import { useFarm } from '../app/FarmContext';
import { Card, EmptyState, Loading, PageHeader, StatusBadge, Th, Td } from '../components/ui';
import { classNames, dateFr, fcfa, num } from '../lib/format';

const PRODUCT_TYPES = [
  { value: 'POULET_PIECE', label: 'Poulet (pièce)', unit: 'PIECE', needsBatch: true },
  { value: 'POULET_KG', label: 'Poulet (kg)', unit: 'KG', needsBatch: true },
  { value: 'PROVENDE', label: 'Provende / aliment', unit: 'KG', needsInputLot: true },
  { value: 'OEUFS', label: 'Œufs (alvéole)', unit: 'ALVEOLES', needsBatch: true },
  { value: 'AUTRE', label: 'Autre', unit: 'UNITE', needsBatch: false },
];

interface Line {
  productType: string;
  quantity: string;
  unitPriceFcfa: string;
  batchId: string;
  inputLotId: string;
  /** POULET_KG only: number of birds sold. */
  pieceCount?: string;
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100';

export function SalesPage() {
  const { farmId } = useFarm();
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<Line[]>([
    { productType: 'POULET_PIECE', quantity: '', unitPriceFcfa: '', batchId: '', inputLotId: '' },
  ]);
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [warnings, setWarnings] = useState<string[] | null>(null);

  const sales = useQuery({
    queryKey: ['sales', farmId],
    queryFn: () => api.get<Sale[]>(`/farms/${farmId}/sales`),
    enabled: !!farmId,
  });

  // Une vente (ou son annulation) change la liste des ventes, le cheptel, les
  // métriques du dashboard, le solde de caisse, le stock d'aliment (provende)
  // et la liste des clients (find-or-create par téléphone au POS).
  const refreshFarm = () => {
    const keys: unknown[][] = [
      ['sales', farmId],
      ['batches', farmId],
      ['dashboard', farmId],
      ['caisse-current', farmId],
      ['feed-stock', farmId],
      ['customers', farmId],
    ];
    keys.forEach((k) => void queryClient.invalidateQueries({ queryKey: k }));
  };

  const batches = useQuery({
    queryKey: ['batches', farmId],
    queryFn: () => api.get<BatchWithMetrics[]>(`/farms/${farmId}/batches`),
    enabled: !!farmId,
  });
  const activeBatches = useMemo(
    () => (batches.data ?? []).filter((b) => b.status !== 'CLOTURE'),
    [batches.data],
  );

  const inputs = useQuery({
    queryKey: ['inputs', farmId],
    queryFn: () =>
      api.get<Array<{ id: string; supplierLotNumber: string; supplier: string; productName: string; kind: string }>>(
        `/farms/${farmId}/inputs`,
      ),
    enabled: !!farmId,
  });
  const feedInputs = useMemo(
    () => (inputs.data ?? []).filter((i) => i.kind === 'ALIMENT'),
    [inputs.data],
  );

  const createSale = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post<{ sale: Sale; warnings: string[] }>(`/farms/${farmId}/sales`, payload),
    onSuccess: (res) => {
      refreshFarm();
      setWarnings(res.warnings);
      setLines([{ productType: 'POULET_PIECE', quantity: '', unitPriceFcfa: '', batchId: '', inputLotId: '' }]);
      setCustomerPhone('');
      setCustomerName('');
      setPromoCode('');
    },
  });

  const cancelSale = useMutation({
    mutationFn: (saleId: string) =>
      api.del(`/farms/${farmId}/sales/${saleId}`),
    onSuccess: () => refreshFarm(),
  });

  const promotions = useQuery({
    queryKey: ['promotions', farmId],
    queryFn: () => api.get<Promotion[]>(`/farms/${farmId}/promotions`),
    enabled: !!farmId,
  });

  // Same rounding as the backend (per line, integer FCFA).
  const subtotal = useMemo(
    () =>
      lines.reduce(
        (sum, l) => sum + Math.round((Number(l.quantity) || 0) * (Number(l.unitPriceFcfa) || 0)),
        0,
      ),
    [lines],
  );

  // Preview of the server-side discount, so the cash payment equals the net
  // total (paying the gross subtotal was rejected as "montant > dû").
  const discount = useMemo(() => {
    const code = promoCode.trim().toUpperCase();
    if (!code) return 0;
    const p = (promotions.data ?? []).find((x) => x.code === code && x.active);
    if (!p) return 0;
    if (p.minSubtotalFcfa != null && subtotal < p.minSubtotalFcfa) return 0;
    return p.type === 'PCT'
      ? Math.min(Math.round((subtotal * Math.min(p.value, 100)) / 100), subtotal)
      : Math.min(p.value, subtotal);
  }, [promoCode, promotions.data, subtotal]);
  const total = subtotal - discount;

  const submit = () => {
    const items = lines
      .filter((l) => Number(l.quantity) > 0 && Number(l.unitPriceFcfa) > 0)
      .map((l) => {
        const meta = PRODUCT_TYPES.find((p) => p.value === l.productType)!;
        return {
          productType: l.productType,
          quantity: Number(l.quantity),
          unit: meta.unit,
          unitPriceFcfa: Number(l.unitPriceFcfa),
          batchId: l.batchId || undefined,
          inputLotId: l.inputLotId || undefined,
          // La vente au kilo requiert le nombre de poulets (décrémente le cheptel).
          pieceCount:
            l.productType === 'POULET_KG' ? Number(l.pieceCount) || undefined : undefined,
        };
      });
    if (!items.length) return;
    if (items.some((it) => it.productType === 'POULET_KG' && !it.pieceCount)) {
      alert('Vente au kilo : indiquez le nombre de poulets vendus.');
      return;
    }
    if (items.some((it) => !Number.isInteger(it.unitPriceFcfa))) {
      alert('Le prix unitaire doit être un nombre entier de FCFA.');
      return;
    }
    createSale.mutate({
      customerPhone: customerPhone || undefined,
      customerName: customerName || undefined,
      promoCode: promoCode || undefined,
      items,
      payments: total > 0 ? [{ method: 'CASH', amountFcfa: total }] : [],
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ventes & encaissements"
        subtitle="Point de vente (espèces), historique et annulations."
      />

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-sky-600" />
          <h2 className="text-sm font-semibold text-slate-700">Nouvelle vente</h2>
        </div>
        <div className="space-y-2">
          {lines.map((l, i) => {
            const meta = PRODUCT_TYPES.find((p) => p.value === l.productType)!;
            return (
              <div key={i} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.3fr_0.7fr_0.8fr_1.2fr_auto]">
                <select
                  className={inputCls}
                  value={l.productType}
                  onChange={(e) =>
                    setLines((ls) =>
                      ls.map((x, j) => (j === i ? { ...x, productType: e.target.value } : x)),
                    )
                  }
                >
                  {PRODUCT_TYPES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <input
                  className={inputCls}
                  placeholder="Quantité"
                  type="number"
                  min={0}
                  value={l.quantity}
                  onChange={(e) =>
                    setLines((ls) => ls.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))
                  }
                />
                <input
                  className={inputCls}
                  placeholder="Prix unitaire (FCFA)"
                  type="number"
                  min={0}
                  value={l.unitPriceFcfa}
                  onChange={(e) =>
                    setLines((ls) => ls.map((x, j) => (j === i ? { ...x, unitPriceFcfa: e.target.value } : x)))
                  }
                />
                {meta.needsBatch && !meta.needsInputLot ? (
                  <select
                    className={inputCls}
                    value={l.batchId}
                    onChange={(e) =>
                      setLines((ls) => ls.map((x, j) => (j === i ? { ...x, batchId: e.target.value } : x)))
                    }
                  >
                    <option value="">— Lot —</option>
                    {activeBatches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.batchName ?? b.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                ) : meta.needsInputLot ? (
                  <select
                    className={inputCls}
                    value={l.inputLotId}
                    onChange={(e) =>
                      setLines((ls) => ls.map((x, j) => (j === i ? { ...x, inputLotId: e.target.value } : x)))
                    }
                  >
                    <option value="">— Lot d'aliment (HACCP) —</option>
                    {feedInputs.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.supplierLotNumber && x.productName
                          ? `${x.supplierLotNumber} — ${x.productName}`
                          : x.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="hidden lg:block" />
                )}
                {l.productType === 'POULET_KG' ? (
                  <input
                    className={inputCls}
                    placeholder="Nb de poulets"
                    type="number"
                    min={1}
                    step={1}
                    value={l.pieceCount ?? ''}
                    onChange={(e) =>
                      setLines((ls) => ls.map((x, j) => (j === i ? { ...x, pieceCount: e.target.value } : x)))
                    }
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                  className="justify-self-end rounded-lg border border-slate-200 p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() =>
              setLines((ls) => [...ls, { productType: 'POULET_PIECE', quantity: '', unitPriceFcfa: '', batchId: '', inputLotId: '' }])
            }
            className="flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-700"
          >
            <Plus className="h-3.5 w-3.5" /> Ajouter un article
          </button>
        </div>

        <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-600">Téléphone client</span>
            <input className={inputCls} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="+241 06000000" />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-600">Nom client (vente simple)</span>
            <input className={inputCls} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Anonyme" />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-600">Code promo</span>
            <input className={inputCls} value={promoCode} onChange={(e) => setPromoCode(e.target.value)} placeholder="ex. WELCOME10" />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="text-sm text-slate-500">
            Total à encaisser :{' '}
            <span className="text-lg font-bold text-slate-900">{fcfa(total)}</span>
            {discount > 0 ? (
              <span className="ml-2 text-xs text-emerald-700">
                (remise {fcfa(discount)} sur {fcfa(subtotal)})
              </span>
            ) : null}
          </div>
          <button
            onClick={submit}
            disabled={createSale.isPending || subtotal <= 0}
            className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {createSale.isPending ? 'Enregistrement…' : 'Encaisser (espèces)'}
          </button>
        </div>

        {createSale.isError ? (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {(createSale.error as Error).message}
          </p>
        ) : null}
        {warnings?.length ? (
          <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            {warnings.map((w) => (
              <p key={w}>• {w}</p>
            ))}
          </div>
        ) : null}
      </Card>

      {sales.isLoading ? (
        <Loading label="Chargement des ventes…" />
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">Historique des ventes</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <Th>Référence</Th>
                  <Th>Date</Th>
                  <Th>Articles</Th>
                  <Th>Total</Th>
                  <Th>Payé</Th>
                  <Th>Statut</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {(sales.data ?? [])
                  .slice()
                  .sort((a, b) => b.saleDate.localeCompare(a.saleDate))
                  .map((s) => {
                    const paid = s.payments
                      .filter((p) => p.status === 'CONFIRMED')
                      .reduce((x, p) => x + p.amountFcfa, 0);
                    return (
                      <tr key={s.id} className="border-t border-slate-100">
                        <Td className="font-medium">{s.referenceNumber}</Td>
                        <Td>{dateFr(s.saleDate)}</Td>
                        <Td>
                          {s.items
                            .map((it) => `${num(it.quantity)} ${it.unit.toLowerCase()}`)
                            .join(', ') || (
                            <span className="text-slate-400">—</span>
                          )}
                        </Td>
                        <Td>
                          {fcfa(s.totalAmountFcfa)}
                          {s.discountAmountFcfa > 0 ? (
                            <span className="ml-1 text-xs text-emerald-600">
                              -{fcfa(s.discountAmountFcfa)}
                            </span>
                          ) : null}
                        </Td>
                        <Td className={classNames(paid >= s.totalAmountFcfa ? 'font-semibold text-emerald-600' : 'text-amber-600')}>
                          {fcfa(paid)}
                        </Td>
                        <Td><StatusBadge status={s.status} /></Td>
                        <Td>
                          <div className="flex items-center gap-1">
                            <button
                              title="Reçu PDF"
                              onClick={() =>
                                void api.download(
                                  `/farms/${farmId}/sales/${s.id}/receipt`,
                                  `${s.referenceNumber}.pdf`,
                                )
                              }
                              className="rounded p-1.5 text-slate-400 hover:bg-sky-50 hover:text-sky-600"
                            >
                              <FileText className="h-4 w-4" />
                            </button>
                            {s.status === 'SETTLED' || s.status === 'OUTSTANDING' ? (
                              <button
                                title="Annuler"
                                onClick={() =>
                                  confirm(`Annuler la vente ${s.referenceNumber} ?`) &&
                                  cancelSale.mutate(s.id)
                                }
                                className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </button>
                            ) : null}
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                {!sales.data?.length ? (
                  <tr>
                    <Td className="py-8 text-center text-slate-400">
                      <EmptyState message="Aucune vente enregistrée." />
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
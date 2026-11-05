import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api/client';
import type { FarmMarketListing, MarketKind, MarketListingBody, MarketProduct } from '../../api/types-market';
import type { CarcassPool, SellableBatch } from '../../api/types-orders';
import { dateFr } from '../../lib/format';
import { Button, ErrorNote, errorMessage, Field, inputCls, Modal, todayIso } from '../form';
import { addDaysIso } from '../orders/helpers';
import { Segmented } from '../orders/shared';
import { PRODUCT_NAME } from './shared';
import { unitName } from './rules';

interface Suggestion {
  suggestion: { readyDate: string; source: 'BREED_CURVE' | 'MIN_AGE' } | null;
}

function whole(text: string): number {
  return Number.parseInt(text, 10) || 0;
}

/** Creates a draft, or edits a listing. Kind, product and lot are fixed once created. */
export function ListingFormModal({
  farmId,
  listing,
  onClose,
}: {
  farmId: string;
  listing?: FarmMarketListing;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const editing = !!listing;
  const [kind, setKind] = useState<MarketKind>(listing?.kind ?? 'NOW');
  const [product, setProduct] = useState<MarketProduct>(listing?.product ?? 'BIRDS');
  const [batchId, setBatchId] = useState(listing?.batchId ?? '');
  const [slaughterOrderId, setSlaughterOrderId] = useState(listing?.slaughterOrderId ?? '');
  const [price, setPrice] = useState(listing ? String(listing.unitPriceFcfa) : '');
  const [quantity, setQuantity] = useState(listing ? String(listing.quantityPublished) : '');
  const [minOrder, setMinOrder] = useState(listing ? String(listing.minOrderQty) : '1');
  const [readyDate, setReadyDate] = useState(listing?.readyDate ?? '');
  const [depositPct, setDepositPct] = useState(listing?.depositPct != null ? String(listing.depositPct) : '');
  const [pickup, setPickup] = useState(listing?.pickupAvailable ?? true);
  const [delivery, setDelivery] = useState(listing?.deliveryAvailable ?? false);
  const [fee, setFee] = useState(listing?.deliveryFeeFcfa ? String(listing.deliveryFeeFcfa) : '');
  const [description, setDescription] = useState(listing?.description ?? '');
  const [targetWeight, setTargetWeight] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const isPre = kind === 'PRE';
  const dateLocked = editing && listing.status !== 'DRAFT';

  const batchesQuery = useQuery({
    queryKey: ['batches', farmId],
    queryFn: () => api.get<SellableBatch[]>(`/farms/${farmId}/batches`),
    enabled: !editing && product !== 'CARCASS',
  });
  const poolsQuery = useQuery({
    queryKey: ['slaughter-orders', farmId],
    queryFn: () => api.get<CarcassPool[]>(`/farms/${farmId}/slaughter-orders`),
    enabled: !editing && product === 'CARCASS',
  });

  const batches = (batchesQuery.data ?? []).filter(
    (b) => (b.status === 'ACTIF' || b.status === 'EN_VENTE') && (product !== 'EGGS' || b.type === 'PONDEUSE'),
  );
  const pools = (poolsQuery.data ?? []).filter(
    (p) => p.status === 'PROCESSED' && p.slaughterType === 'ABATTU' && (p.carcassesAvailable ?? 0) > 0,
  );

  const suggest = useMutation({
    mutationFn: () => {
      const params = new URLSearchParams({ batchId });
      if (targetWeight.trim()) params.set('targetWeightKg', targetWeight.trim().replace(',', '.'));
      return api.getFresh<Suggestion>(`/farms/${farmId}/market/ready-date-suggestion?${params.toString()}`);
    },
    onSuccess: ({ suggestion }) => {
      if (!suggestion) {
        setHint('Pas de suggestion pour ce lot : choisissez la date vous-même.');
        return;
      }
      setReadyDate(suggestion.readyDate);
      setHint(
        `Suggestion : ${dateFr(suggestion.readyDate)}, ${
          suggestion.source === 'BREED_CURVE' ? 'd’après la courbe de poids de la race' : 'd’après l’âge minimum de vente'
        }. Vous pouvez la changer.`,
      );
    },
    onError: (err) => setHint(errorMessage(err)),
  });

  const save = useMutation({
    mutationFn: () => {
      const common: MarketListingBody = {
        description: description.trim() || undefined,
        unitPriceFcfa: whole(price),
        quantityPublished: whole(quantity),
        minOrderQty: whole(minOrder) || 1,
        pickupAvailable: pickup,
        deliveryAvailable: delivery,
        deliveryFeeFcfa: delivery ? whole(fee) : 0,
      };
      if (editing) {
        return api.patch(`/farms/${farmId}/market/listings/${listing.id}`, {
          ...common,
          ...(dateLocked || !isPre ? {} : { readyDate }),
          ...(isPre ? { depositPct: depositPct.trim() ? whole(depositPct) : null } : {}),
        });
      }
      return api.post(`/farms/${farmId}/market/listings`, {
        ...common,
        kind,
        product,
        ...(product === 'CARCASS' ? { slaughterOrderId } : { batchId }),
        ...(isPre ? { readyDate, depositPct: depositPct.trim() ? whole(depositPct) : undefined } : {}),
      });
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['market-farm-listings', farmId] });
      void client.invalidateQueries({ queryKey: ['market-listings'] });
      onClose();
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing && product === 'CARCASS' && !slaughterOrderId) return setFormError('Choisissez l’abattage dont viennent les carcasses.');
    if (!editing && product !== 'CARCASS' && !batchId) return setFormError('Choisissez un lot.');
    if (whole(price) < 1) return setFormError('Indiquez un prix unitaire.');
    if (whole(quantity) < 1) return setFormError('Indiquez une quantité à publier.');
    if (isPre && !readyDate) return setFormError('Indiquez la date de disponibilité.');
    if (!pickup && !delivery) return setFormError('Proposez au moins le retrait à la ferme ou la livraison.');
    setFormError(null);
    save.mutate();
  }

  function pickProduct(next: MarketProduct) {
    setProduct(next);
    setBatchId('');
    setSlaughterOrderId('');
    setHint(null);
    if (next !== 'BIRDS') setKind('NOW');
  }

  return (
    <Modal title={editing ? 'Modifier l’annonce' : 'Nouvelle annonce'} onClose={onClose} wide>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid items-start gap-5 md:grid-cols-2">
        <div className="min-w-0 space-y-4">
        {!editing ? (
          <>
            <div>
              <span className="mb-1 block text-xs font-medium text-slate-600">Produit</span>
              <Segmented
                ariaLabel="Produit"
                value={product}
                onChange={pickProduct}
                options={(Object.keys(PRODUCT_NAME) as MarketProduct[]).map((key) => ({ key, label: PRODUCT_NAME[key] }))}
              />
            </div>
            {product === 'BIRDS' ? (
              <div>
                <span className="mb-1 block text-xs font-medium text-slate-600">Vente</span>
                <Segmented
                  ariaLabel="Type de vente"
                  value={kind}
                  onChange={setKind}
                  options={[
                    { key: 'NOW', label: 'Disponible maintenant' },
                    { key: 'PRE', label: 'Précommande' },
                  ]}
                />
              </div>
            ) : null}
            {product === 'CARCASS' ? (
              <Field label="Abattage">
                <select className={inputCls} value={slaughterOrderId} onChange={(e) => setSlaughterOrderId(e.target.value)}>
                  <option value="">{poolsQuery.isLoading ? 'Chargement…' : 'Choisir un abattage traité'}</option>
                  {pools.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.batch?.batchName ?? p.referenceNumber} · {p.carcassesAvailable} carcasses
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="Lot">
                <select className={inputCls} value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                  <option value="">{batchesQuery.isLoading ? 'Chargement…' : 'Choisir un lot'}</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.batchName ?? 'Lot'} ·{' '}
                      {product === 'EGGS' ? `${b.metrics.eggStockAvailableAlveoles ?? 0} alvéoles` : `${b.metrics.liveCount} oiseaux`}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {PRODUCT_NAME[listing.product]}
            {listing.batchName ? ` · ${listing.batchName}` : ''}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-2">
          <Field label={`Prix par ${unitName(product)} (FCFA)`}>
            <input type="number" min={1} className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} required />
          </Field>
          <Field label="Quantité publiée">
            <input type="number" min={1} className={inputCls} value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
          </Field>
          <Field label="Commande minimale">
            <input type="number" min={1} className={inputCls} value={minOrder} onChange={(e) => setMinOrder(e.target.value)} />
          </Field>
        </div>

        </div>

        <div className="min-w-0 space-y-4">
        {isPre ? (
          <div className="space-y-3 rounded-lg bg-slate-50 p-3">
            {dateLocked ? (
              <p className="text-sm text-slate-600">
                Prêts le {dateFr(readyDate)}. Pour changer cette date, utilisez « Déplacer la date » : les acheteurs en seront informés.
              </p>
            ) : (
              <>
                <Field label="Date de disponibilité">
                  <input type="date" min={addDaysIso(todayIso(), 1)} className={inputCls} value={readyDate} onChange={(e) => setReadyDate(e.target.value)} required />
                </Field>
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Poids visé en kg (facultatif)" className="w-44">
                    <input inputMode="decimal" className={inputCls} value={targetWeight} onChange={(e) => setTargetWeight(e.target.value)} />
                  </Field>
                  <Button tone="secondary" onClick={() => suggest.mutate()} busy={suggest.isPending} disabled={!batchId}>
                    <Sparkles className="h-4 w-4" /> Suggérer une date
                  </Button>
                </div>
                {hint ? <p className="text-xs text-slate-600">{hint}</p> : null}
              </>
            )}
            <Field label="Acompte en % (facultatif)" hint="Le client aura 24 h après votre acceptation pour vous le remettre, sinon la commande est annulée.">
              <input type="number" min={1} max={100} className={inputCls} value={depositPct} onChange={(e) => setDepositPct(e.target.value)} />
            </Field>
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={pickup} onChange={(e) => setPickup(e.target.checked)} /> Retrait à la ferme
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={delivery} onChange={(e) => setDelivery(e.target.checked)} /> Livraison par la ferme
          </label>
          {delivery ? (
            <Field label="Frais de livraison (FCFA)">
              <input type="number" min={0} className={inputCls} value={fee} onChange={(e) => setFee(e.target.value)} />
            </Field>
          ) : null}
        </div>

        <Field label="Description (facultatif)">
          <textarea className={inputCls} rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        </div>
        </div>

        <ErrorNote error={formError ?? save.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={save.isPending}>
            Annuler
          </Button>
          <Button type="submit" busy={save.isPending}>
            {editing ? 'Enregistrer' : 'Enregistrer le brouillon'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

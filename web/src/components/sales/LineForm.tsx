import { useMemo, useState } from 'react';
import { Check, ShoppingCart } from 'lucide-react';
import type { FeedStockSummary } from '../../api/types';
import type { CarcassPool, PointOfSale, PosBatch, StockTransfer } from '../../api/types-sales';
import { Button, ErrorNote, Field, inputCls, Modal } from '../form';
import { fcfa, num } from '../../lib/format';
import {
  batchPhoto,
  formatEggAlveoles,
  isAbattu,
  isKgProduct,
  lineAmount,
  posCatalog,
  productMeta,
  transferRemaining,
  transferTitle,
  transferUnitLabel,
  type PosLine,
  type PosProduct,
} from './pos';
import { ProductThumb } from './shared';

export interface LinePreset {
  batchId?: string;
  transferId?: string;
}

export type FeedLot = FeedStockSummary['lots'][number];

let uidCounter = 0;

function roundKg(n: number): number {
  return Math.round(n * 100) / 100;
}

function readinessAdvice(b: PosBatch): string | null {
  if (b.status === 'EN_VENTE' || b.metrics.readyForSale) return null;
  switch (b.metrics.readyReason) {
    case 'TOO_YOUNG':
      return `Conseil : lot encore jeune (J${b.metrics.ageDays}). Poids et sanitaire à vérifier avant la vente.`;
    case 'SANITARY':
      return 'Conseil sanitaire : surveillez l’état du lot avant de vendre.';
    case 'FCR':
      return 'Indice de conversion élevé : vente possible, contrôlez le poids moyen.';
    default:
      return 'Lot non signalé prêt à la vente : vérifiez les indicateurs avant de vendre.';
  }
}

function initialProduct(
  isBoutique: boolean,
  initial: PosLine | undefined,
  presetBatch: PosBatch | undefined,
  presetTransfer: StockTransfer | undefined,
): PosProduct {
  if (initial) return initial.product;
  if (presetTransfer) {
    if (presetTransfer.productType === 'OEUFS') return 'OEUF';
    if (presetTransfer.productType === 'PROVENDE') return 'PROVENDE';
    return 'ABATTU_PIECE';
  }
  if (presetBatch) return presetBatch.type === 'PONDEUSE' ? 'OEUF' : 'PIECE';
  return isBoutique ? 'ABATTU_PIECE' : 'PIECE';
}

/** Add or edit a basket line. The source decides the stock ceiling, as on mobile. */
export function LineForm({
  pos,
  lots,
  pools,
  reserves,
  feedLots,
  sacKg,
  committed,
  initial,
  preset,
  onSave,
  onClose,
}: {
  pos: PointOfSale;
  lots: PosBatch[];
  pools: CarcassPool[];
  /** Active reserves of this boutique. */
  reserves: StockTransfer[];
  feedLots: FeedLot[];
  sacKg: number;
  committed: PosLine[];
  initial?: PosLine;
  preset?: LinePreset;
  onSave: (line: PosLine) => void;
  onClose: () => void;
}) {
  const isBoutique = pos.kind === 'BOUTIQUE';
  const presetBatch = lots.find((b) => b.id === preset?.batchId);
  const presetTransfer = reserves.find((t) => t.id === preset?.transferId);

  const [product, setProduct] = useState<PosProduct>(() =>
    initialProduct(isBoutique, initial, presetBatch, presetTransfer),
  );
  const [lotId, setLotId] = useState(initial?.batchId ?? presetBatch?.id ?? '');
  const [poolId, setPoolId] = useState(initial?.slaughterOrderId ?? '');
  const [transferId, setTransferId] = useState(initial?.transferId ?? presetTransfer?.id ?? '');
  const [feedLotId, setFeedLotId] = useState(initial?.inputLotId ?? '');
  const [feedUnit, setFeedUnit] = useState<'SAC' | 'KG'>(
    initial?.unit === 'KG' || presetTransfer?.unit === 'KG' ? 'KG' : 'SAC',
  );
  const [qty, setQty] = useState(initial ? String(initial.qty) : '');
  const [weight, setWeight] = useState(initial?.weightKg != null ? String(initial.weightKg) : '');
  const [price, setPrice] = useState(() => {
    if (initial) return String(initial.unitPriceFcfa);
    const p = initialProduct(isBoutique, initial, presetBatch, presetTransfer);
    const reservePrice = presetTransfer?.productType === 'PROVENDE' ? presetTransfer.inputLot?.unitPriceFcfa : null;
    const suggested = reservePrice ?? productMeta(pos.kind, p).unitPrice;
    return suggested > 0 ? String(suggested) : '';
  });
  const [otherLabel, setOtherLabel] = useState(initial?.product === 'AUTRE' ? initial.label : '');
  const [error, setError] = useState<string | null>(null);

  const others = useMemo(() => committed.filter((l) => l.uid !== initial?.uid), [committed, initial]);
  const sumQty = (match: (l: PosLine) => boolean) => others.filter(match).reduce((a, l) => a + l.qty, 0);

  const lot = lots.find((b) => b.id === lotId);
  const pool = pools.find((p) => p.id === poolId);
  const transfer = reserves.find((t) => t.id === transferId);
  const feedLot = feedLots.find((l) => l.id === feedLotId);
  const eggLots = lots.filter((b) => (b.metrics.eggStockAvailableAlveoles ?? 0) > 0);
  const kg = isKgProduct(product);

  const reservesForProduct = reserves.filter((t) =>
    isAbattu(product) ? t.productType === 'ABATTU' : product === 'OEUF' ? t.productType === 'OEUFS' : t.productType === 'PROVENDE',
  );
  // Only the carcasses of the chosen lot when the form was opened from a lot.
  const lotPools = lotId && pools.some((p) => p.batchId === lotId) ? pools.filter((p) => p.batchId === lotId) : pools;

  /** Stock ceiling after what the basket already holds; null when not limited. */
  const maxQty = ((): number | null => {
    if (isBoutique) {
      return transfer ? Math.max(transferRemaining(transfer) - sumQty((l) => l.transferId === transfer.id), 0) : 0;
    }
    switch (product) {
      case 'PIECE':
      case 'KG':
        return lot ? Math.max(lot.quantityAlive - sumQty((l) => (l.product === 'PIECE' || l.product === 'KG') && l.batchId === lot.id), 0) : 0;
      case 'ABATTU_PIECE':
      case 'ABATTU_KG':
        return pool ? Math.max((pool.carcassesAvailable ?? 0) - sumQty((l) => l.slaughterOrderId === pool.id), 0) : 0;
      case 'OEUF':
        return lot ? Math.max((lot.metrics.eggStockAvailableAlveoles ?? 0) - sumQty((l) => l.product === 'OEUF' && l.batchId === lot.id), 0) : 0;
      case 'PROVENDE': {
        if (!feedLot) return 0;
        const usedKg = others
          .filter((l) => l.inputLotId === feedLot.id)
          .reduce((a, l) => a + (l.unit === 'KG' ? l.qty : l.qty * sacKg), 0);
        const left = Math.max(feedLot.availableKg - usedKg, 0);
        return feedUnit === 'KG' ? left : Math.floor(left / sacKg);
      }
      default:
        return null;
    }
  })();

  const parsedQty = Number(qty.replace(',', '.')) || 0;
  const parsedWeight = roundKg(Number(weight.replace(',', '.')) || 0);
  const parsedPrice = Number(price) || 0;
  const amount = lineAmount({ product, qty: parsedQty, weightKg: parsedWeight, unitPriceFcfa: parsedPrice });
  const meta = productMeta(pos.kind, product);

  const qtyLabel = kg
    ? 'Nombre d’oiseaux'
    : product === 'OEUF'
      ? 'Alvéoles (30 œufs)'
      : product === 'PROVENDE'
        ? feedUnit === 'KG'
          ? 'Quantité (kg)'
          : 'Nombre de sacs'
        : isAbattu(product)
          ? 'Nombre de carcasses'
          : product === 'AUTRE'
            ? 'Quantité'
            : 'Nombre de pièces';
  const priceUnit = product === 'PROVENDE' ? (feedUnit === 'KG' ? 'kg' : 'sac') : meta.priceUnit;

  const selectProduct = (next: PosProduct) => {
    setProduct(next);
    setError(null);
    setWeight('');
    const suggested = productMeta(pos.kind, next).unitPrice;
    setPrice(suggested > 0 ? String(suggested) : '');
    if (isAbattu(next)) {
      const forLot = pools.filter((p) => p.batchId === lotId);
      setPoolId(forLot.length === 1 ? forLot[0]!.id : '');
    } else {
      setPoolId('');
    }
    if (next === 'OEUF' && lot && (lot.metrics.eggStockAvailableAlveoles ?? 0) <= 0) setLotId('');
    if (isBoutique && !(isAbattu(next) && transfer?.productType === 'ABATTU')) setTransferId('');
  };

  const selectTransfer = (id: string) => {
    setTransferId(id);
    setError(null);
    const t = reserves.find((x) => x.id === id);
    if (t?.productType === 'PROVENDE') {
      setFeedUnit(t.unit === 'KG' ? 'KG' : 'SAC');
      if (t.inputLot?.unitPriceFcfa) setPrice(String(t.inputLot.unitPriceFcfa));
    }
  };

  const sourceLabel = (): string => {
    if (isBoutique) return transfer ? transferTitle(transfer) : '';
    if (isAbattu(product)) return pool ? `${pool.batch?.batchName ?? 'Lot'} · ${pool.referenceNumber}` : '';
    if (product === 'PROVENDE') return feedLot?.productName ?? '';
    if (product === 'AUTRE') return '';
    return lot?.batchName ?? 'Lot';
  };

  const save = () => {
    if (parsedQty <= 0) return setError('Indiquez une quantité.');
    const mustBeWhole = product === 'PIECE' || isAbattu(product) || kg || product === 'OEUF';
    if (mustBeWhole && !Number.isInteger(parsedQty)) return setError('Cette quantité doit être un nombre entier.');
    if (kg && parsedWeight <= 0) return setError('Indiquez le poids réel en kg.');
    if (parsedPrice <= 0 || !Number.isInteger(parsedPrice)) return setError('Le prix unitaire doit être un nombre entier de FCFA.');
    if (isBoutique && !transfer) return setError('Sélectionnez une réserve (transfert ferme → boutique).');
    if (!isBoutique) {
      if ((product === 'PIECE' || product === 'KG' || product === 'OEUF') && !lot) return setError('Sélectionnez un lot.');
      if (isAbattu(product) && !pool) return setError('Sélectionnez un lot de carcasses (abattoir).');
      if (product === 'PROVENDE' && !feedLot) return setError('Sélectionnez le lot d’aliment (traçabilité HACCP).');
    }
    if (maxQty != null && parsedQty > maxQty) {
      return setError(`Stock insuffisant : maximum ${num(maxQty, 2)}.`);
    }
    uidCounter += 1;
    onSave({
      uid: initial?.uid ?? `line-${uidCounter}`,
      product,
      label: product === 'AUTRE' ? otherLabel.trim() || 'Autre' : meta.label,
      sourceLabel: sourceLabel(),
      batchId: isBoutique
        ? (transfer?.batchId ?? transfer?.slaughterOrder?.batchId ?? undefined)
        : isAbattu(product)
          ? pool?.batchId
          : product === 'PIECE' || product === 'KG' || product === 'OEUF'
            ? lot?.id
            : undefined,
      slaughterOrderId: !isBoutique && isAbattu(product) ? pool?.id : undefined,
      transferId: isBoutique ? transfer?.id : undefined,
      inputLotId: !isBoutique && product === 'PROVENDE' ? feedLot?.id : undefined,
      unit: product === 'PROVENDE' ? feedUnit : undefined,
      qty: parsedQty,
      weightKg: kg ? parsedWeight : undefined,
      unitPriceFcfa: parsedPrice,
    });
    onClose();
  };

  const advice = !isBoutique && lot && (product === 'PIECE' || product === 'KG') ? readinessAdvice(lot) : null;
  const showMax = maxQty != null && (isBoutique ? !!transfer : !!(lot || pool || feedLot));
  const sourceBatchId = isBoutique ? (transfer?.batchId ?? transfer?.slaughterOrder?.batchId) : isAbattu(product) ? pool?.batchId : lotId;

  return (
    <Modal title={initial ? 'Modifier l’article' : 'Ajouter un article'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="flex items-end gap-3">
          <ProductThumb product={product} photo={batchPhoto(lots.find((b) => b.id === sourceBatchId))} size="md" />
          <Field label="Article à vendre" className="min-w-0 flex-1">
            <select className={inputCls} value={product} onChange={(e) => selectProduct(e.target.value as PosProduct)}>
              {posCatalog(pos.kind).map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {isBoutique ? (
          <Field label="Réserve de la boutique">
            <select className={inputCls} value={transferId} onChange={(e) => selectTransfer(e.target.value)}>
              <option value="">— Choisir une réserve —</option>
              {reservesForProduct.map((t) => (
                <option key={t.id} value={t.id}>
                  {transferTitle(t)} · {num(transferRemaining(t), 2)} {transferUnitLabel(t)}
                </option>
              ))}
            </select>
          </Field>
        ) : product === 'PIECE' || product === 'KG' ? (
          <Field label="Lot">
            <select className={inputCls} value={lotId} onChange={(e) => setLotId(e.target.value)}>
              <option value="">— Choisir un lot —</option>
              {lots.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batchName ?? 'Lot'} · {num(b.quantityAlive)} vivant(s) · J{b.metrics.ageDays}
                </option>
              ))}
            </select>
          </Field>
        ) : product === 'OEUF' ? (
          <Field label="Lot producteur">
            <select className={inputCls} value={lotId} onChange={(e) => setLotId(e.target.value)}>
              <option value="">— Choisir un lot —</option>
              {eggLots.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batchName ?? 'Lot'} · {formatEggAlveoles(b.metrics.eggStockAvailableEggs ?? 0)}
                </option>
              ))}
            </select>
          </Field>
        ) : isAbattu(product) ? (
          <Field label="Carcasses (ordre d’abattage)">
            <select className={inputCls} value={poolId} onChange={(e) => setPoolId(e.target.value)}>
              <option value="">— Choisir un ordre —</option>
              {lotPools.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.batch?.batchName ?? 'Lot'} · {p.referenceNumber} · {num(p.carcassesAvailable)} carcasse(s)
                </option>
              ))}
            </select>
          </Field>
        ) : product === 'PROVENDE' ? (
          <Field label="Lot d’aliment (HACCP)">
            <select className={inputCls} value={feedLotId} onChange={(e) => setFeedLotId(e.target.value)}>
              <option value="">— Choisir un lot —</option>
              {feedLots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.supplierLotNumber} - {l.productName} · {num(l.availableKg)} kg
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Désignation (facultatif)">
            <input className={inputCls} value={otherLabel} maxLength={80} onChange={(e) => setOtherLabel(e.target.value)} placeholder="Autre" />
          </Field>
        )}

        {product === 'PROVENDE' && !isBoutique ? (
          <Field label="Vendu en">
            <select className={inputCls} value={feedUnit} onChange={(e) => setFeedUnit(e.target.value as 'SAC' | 'KG')}>
              <option value="SAC">Sacs ({num(sacKg)} kg)</option>
              <option value="KG">Kilos</option>
            </select>
          </Field>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={qtyLabel} hint={showMax ? `Maximum : ${num(maxQty, 2)}` : undefined}>
            <input className={inputCls} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
          </Field>
          {kg ? (
            <Field label="Poids réel total (kg)">
              <input className={inputCls} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </Field>
          ) : null}
          <Field label={`Prix unitaire (FCFA / ${priceUnit})`}>
            <input className={inputCls} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} />
          </Field>
        </div>

        {advice ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">{advice}</p> : null}
        <ErrorNote error={error} />

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-500">
            Montant : <span className="font-bold text-slate-900">{fcfa(amount)}</span>
          </p>
          <div className="flex gap-2">
            <Button tone="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit">
              {initial ? <Check className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
              {initial ? 'Mettre à jour' : 'Ajouter au panier'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

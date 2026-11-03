import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Contact, Home, MapPin, Package, Plus, Search, Store, Trash2, Truck, UserPlus, Wallet, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { api } from '../../api/client';
import type { Customer } from '../../api/types';
import type { CreateOrderBody, Order, OrderCanal, PointOfSale, SellableBatch } from '../../api/types-orders';
import { useFarm } from '../../app/FarmContext';
import { lotImage } from '../../lib/animalImages';
import { fcfa, num } from '../../lib/format';
import { normalizeGabonPhone } from '../../lib/phone';
import { Button, ErrorNote, Field, Modal, inputCls } from '../form';
import { PhotoThumb } from '../ui';
import { sendOrQueue, showQueuedNotice } from '../../offline';
import { geocodeGabonAddress } from './geo';
import {
  DEFAULT_AVG_WEIGHT_KG,
  PRODUCT_LABEL,
  UNIT_LABEL,
  addDaysIso,
  invalidateOrderQueries,
  localDateIso,
  newIdempotencyKey,
  parseWhole,
} from './helpers';
import { AddressField, ProvinceSelect, Segmented, type AddressValue } from './shared';

type ProductKey = 'PIECE' | 'KG' | 'OEUF';
type PlaceKey = 'FERME' | 'PDV' | 'LIVRAISON';

const PLACE_TO_CANAL: Record<PlaceKey, OrderCanal> = { FERME: 'FERME', PDV: 'PRECOMMANDE', LIVRAISON: 'LIVRAISON' };

const PLACE_HINT: Record<PlaceKey, string> = {
  FERME: 'Retrait à la ferme mère : précommandez et choisissez la date de retrait.',
  PDV: 'Retrait en boutique : précommandez et choisissez la date de retrait.',
  LIVRAISON: 'Livraison à une adresse : précommandez et choisissez la date de livraison.',
};

const SUGGESTED_PRICE: Record<ProductKey, number> = { PIECE: 2500, KG: 2200, OEUF: 2500 };

const PRODUCT_TYPE = { PIECE: 'POULET_PIECE', KG: 'POULET_KG', OEUF: 'OEUFS' } as const;
const PRODUCT_UNIT = { PIECE: 'PIECE', KG: 'KG', OEUF: 'ALVEOLES' } as const;
const PRICE_SUFFIX: Record<ProductKey, string> = { PIECE: 'pièce', KG: 'kg', OEUF: 'alvéole' };
const QTY_SUFFIX: Record<ProductKey, string> = { PIECE: 'pièces', KG: 'oiseaux', OEUF: 'alvéoles' };

type DraftItem = CreateOrderBody['items'][number] & { amountFcfa: number };

function eggsOf(b: SellableBatch): number {
  return Math.max(b.metrics.eggStockAvailableEggs ?? 0, 0);
}

function alveolesOf(b: SellableBatch): number {
  return Math.max(b.metrics.eggStockAvailableAlveoles ?? 0, 0);
}

/** Readiness never blocks a sale: it only warns the farmer. */
function readinessAdvice(lot: SellableBatch): string | null {
  if (lot.status === 'EN_VENTE' || lot.metrics.readyForSale) return null;
  switch (lot.metrics.readyReason) {
    case 'TOO_YOUNG':
      return `Conseil : lot encore jeune (J${lot.metrics.ageDays}). Poids et sanitaire à vérifier avant la vente.`;
    case 'SANITARY':
      return 'Conseil sanitaire : surveillez l’état du lot avant de vendre.';
    case 'FCR':
      return 'Indice de conversion élevé : vente possible, contrôlez le poids moyen.';
    default:
      return 'Lot non signalé prêt à la vente : vérifiez les indicateurs avant de vendre.';
  }
}

function CustomerPicker({ onPick, onClose }: { onPick: (c: Customer) => void; onClose: () => void }) {
  const { farmId } = useFarm();
  const [search, setSearch] = useState('');
  const customers = useQuery({
    queryKey: ['customers', farmId],
    queryFn: () => api.get<Customer[]>(`/farms/${farmId}/customers`),
    enabled: !!farmId,
  });
  const needle = search.trim().toLowerCase();
  const rows = (customers.data ?? []).filter(
    (c) =>
      !needle ||
      c.fullName.toLowerCase().includes(needle) ||
      (c.phone ?? '').toLowerCase().includes(needle) ||
      (c.code ?? '').toLowerCase().includes(needle),
  );
  return (
    <div className="rounded-lg border border-slate-200 p-2">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, code ou téléphone…"
            aria-label="Rechercher un client"
            className={`${inputCls} pl-9`}
          />
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer la recherche" className="rounded p-1 text-slate-400 hover:text-slate-700">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ErrorNote error={customers.error} />
      <ul className="mt-2 max-h-48 overflow-y-auto text-sm">
        {rows.map((c) => {
          const due = c.balance?.outstandingFcfa ?? 0;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick(c)}
                className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-slate-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">{c.fullName}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {[c.code, c.phone].filter(Boolean).join(' · ') || 'Aucun contact'}
                  </span>
                </span>
                <span className={due > 0 ? 'shrink-0 text-xs font-semibold text-red-600' : 'shrink-0 text-xs font-semibold text-emerald-600'}>
                  {due > 0 ? `Dû ${fcfa(due)}` : 'Soldé'}
                </span>
              </button>
            </li>
          );
        })}
        {!customers.isLoading && rows.length === 0 ? (
          <li className="px-2 py-3 text-center text-xs text-slate-500">
            {needle ? 'Aucun client ne correspond.' : 'Aucun client enregistré. Saisissez un nouveau client ci-dessous.'}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function SectionTitle({ n, icon, children }: { n?: number; icon?: ReactNode; children: string }) {
  return (
    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-brand-600">
      {icon}
      {n ? (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{n}</span>
      ) : null}
      {children}
    </h3>
  );
}

export function CreateOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: (orderId: string) => void }) {
  const { farmId } = useFarm();
  const queryClient = useQueryClient();

  const batchesQuery = useQuery({
    queryKey: ['batches', farmId],
    queryFn: () => api.get<SellableBatch[]>(`/farms/${farmId}/batches`),
    enabled: !!farmId,
  });
  const pdvQuery = useQuery({
    queryKey: ['points-of-sale', farmId],
    queryFn: () => api.get<PointOfSale[]>(`/farms/${farmId}/points-of-sale`),
    enabled: !!farmId,
  });

  const [client, setClient] = useState<Customer | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  const [place, setPlace] = useState<PlaceKey>('FERME');
  const [pdvId, setPdvId] = useState('');
  const [province, setProvince] = useState('');
  const [where, setWhere] = useState<AddressValue>({ address: '', latitude: null, longitude: null });
  const today = localDateIso(new Date());
  const [expectedDate, setExpectedDate] = useState(() => addDaysIso(today, 7));

  const [lotId, setLotId] = useState('');
  const [product, setProduct] = useState<ProductKey>('PIECE');
  const [qty, setQty] = useState(0);
  const [weightText, setWeightText] = useState('');
  const [price, setPrice] = useState(SUGGESTED_PRICE.PIECE);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [deposit, setDeposit] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  // Kept across retries: a repeated submit returns the order already created.
  const [idempotencyKey] = useState(() => newIdempotencyKey('order'));

  const batches = useMemo(() => batchesQuery.data ?? [], [batchesQuery.data]);
  const sellable = batches.filter((b) => b.quantityAlive > 0 && (b.status === 'EN_VENTE' || b.status === 'ACTIF'));
  const boutiques = (pdvQuery.data ?? []).filter((p) => p.isActive && p.kind === 'BOUTIQUE');
  const lot = sellable.find((b) => b.id === lotId) ?? null;
  const advice = lot ? readinessAdvice(lot) : null;

  const lotEggs = lot ? eggsOf(lot) : batches.reduce((s, b) => s + eggsOf(b), 0);
  const lotAlveoles = lot ? alveolesOf(lot) : batches.reduce((s, b) => s + alveolesOf(b), 0);
  const maxQty = product === 'OEUF' ? lotAlveoles : (lot?.quantityAlive ?? 1000);
  const isKg = product === 'KG';
  const weightKg = parseFloat(weightText.replace(',', '.')) || 0;
  const estimatedKg = Math.round(qty * DEFAULT_AVG_WEIGHT_KG * 100) / 100;

  const total = items.reduce((a, i) => a + i.amountFcfa, 0);
  // Only birds count for the "one batch per order" rule, not egg lines.
  const birdLotId = items.find((i) => i.productType !== 'OEUFS')?.batchId;

  const selectLot = (id: string) => {
    setLotId(id);
    setLocalError(null);
    const next = sellable.find((b) => b.id === id);
    if (next && product === 'OEUF' && eggsOf(next) <= 0) {
      setProduct('PIECE');
      setPrice(SUGGESTED_PRICE.PIECE);
    }
  };

  const selectProduct = (key: ProductKey) => {
    if (key === 'OEUF') {
      const withEggs = lot && eggsOf(lot) > 0 ? lot : sellable.find((b) => eggsOf(b) > 0);
      if (!withEggs) {
        setLocalError('Aucun lot pondeur avec des œufs disponibles.');
        return;
      }
      setLotId(withEggs.id);
    } else if (!lotId && sellable[0]) {
      setLotId(sellable[0].id);
    }
    setProduct(key);
    setPrice(SUGGESTED_PRICE[key]);
    setWeightText('');
    setLocalError(null);
  };

  const addItem = () => {
    if (qty <= 0) return setLocalError('Indiquez une quantité.');
    if (price <= 0) return setLocalError('Indiquez un prix unitaire.');
    if (!lotId) return setLocalError('Sélectionnez un lot.');
    if (product !== 'OEUF' && birdLotId && birdLotId !== lotId) {
      return setLocalError('Une commande ne peut porter que sur un seul lot.');
    }
    const kg = weightKg > 0 ? weightKg : estimatedKg;
    const productType = PRODUCT_TYPE[product];
    setItems((prev) => [
      ...prev,
      {
        productType,
        label: PRODUCT_LABEL[productType],
        quantity: isKg ? kg : qty,
        unitPriceFcfa: price,
        batchId: lotId,
        ...(isKg ? { pieceCount: qty } : {}),
        unit: PRODUCT_UNIT[product],
        amountFcfa: isKg ? Math.round(kg * price) : qty * price,
      },
    ]);
    setQty(0);
    setWeightText('');
    setLocalError(null);
  };

  const create = useMutation({
    mutationFn: async () => {
      const address = where.address.trim();
      // A hand-typed address is located at save time, when the map service answers.
      const geo =
        place === 'LIVRAISON' && where.latitude == null ? await geocodeGabonAddress({ province, address }) : null;
      const latitude = where.latitude ?? geo?.latitude;
      const longitude = where.longitude ?? geo?.longitude;
      const phone = normalizeGabonPhone(customerPhone);
      const body: CreateOrderBody = {
        canal: PLACE_TO_CANAL[place],
        idempotencyKey,
        expectedDate,
        ...(client
          ? { customerId: client.id }
          : {
              ...(customerName.trim() ? { customerName: customerName.trim() } : {}),
              ...(phone ? { customerPhone: phone } : {}),
            }),
        ...(place === 'PDV' ? { pointOfSaleId: pdvId } : {}),
        ...(place === 'LIVRAISON'
          ? {
              address,
              ...(province ? { province } : {}),
              ...(latitude != null && longitude != null ? { latitude, longitude } : {}),
            }
          : {}),
        items: items.map(({ amountFcfa: _amount, ...item }) => item),
        ...(deposit > 0 ? { deposit: { amountFcfa: deposit } } : {}),
      };
      return sendOrQueue<Order>({
        kind: 'order-create',
        farmId: farmId!,
        path: `/farms/${farmId}/orders`,
        body,
        label: `Commande · ${fcfa(total)}`,
        cashFcfa: deposit,
      });
    },
    onSuccess: (res) => {
      if (res.status === 'queued') {
        // No order to open yet: the server gives it its id and reference.
        showQueuedNotice();
        onClose();
        return;
      }
      invalidateOrderQueries(queryClient, farmId);
      onCreated(res.data.id);
    },
  });

  const submit = () => {
    if (items.length === 0) return setLocalError('Ajoutez au moins un article.');
    if (place === 'PDV' && !pdvId) return setLocalError('Sélectionnez le point de vente de retrait.');
    if (place === 'LIVRAISON' && !where.address.trim()) return setLocalError('Indiquez l’adresse de livraison.');
    if (deposit > total) return setLocalError('L’acompte ne peut pas dépasser le total.');
    setLocalError(null);
    create.mutate();
  };

  const depositShare =
    deposit === 0 ? 'Aucun acompte' : deposit === total ? 'Total réglé' : total > 0 ? `${Math.round((deposit / total) * 100)} % du total` : '';

  return (
    <Modal title="Nouvelle commande" onClose={onClose} wide>
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <section>
          <SectionTitle icon={client ? <Contact /> : <UserPlus />}>Client de la commande</SectionTitle>
          {client ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-brand-50 px-3 py-2 ring-1 ring-brand-100">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{client.fullName}</p>
                <p className="truncate text-xs text-slate-500">{[client.code, client.phone].filter(Boolean).join(' · ') || 'Aucun contact'}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">
                  Solde :{' '}
                  <b className={(client.balance?.outstandingFcfa ?? 0) > 0 ? 'text-red-600' : 'text-emerald-600'}>
                    {fcfa(client.balance?.outstandingFcfa ?? 0)}
                  </b>
                </span>
                <Button tone="secondary" onClick={() => setClient(null)}>
                  <X className="h-4 w-4" /> Retirer
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {pickerOpen ? (
                <CustomerPicker
                  onPick={(c) => {
                    setClient(c);
                    setPickerOpen(false);
                  }}
                  onClose={() => setPickerOpen(false)}
                />
              ) : (
                <Button tone="secondary" onClick={() => setPickerOpen(true)}>
                  <Contact className="h-4 w-4" /> Choisir un client existant
                </Button>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Ou nouveau client : nom (facultatif)">
                  <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Téléphone (facultatif)">
                  <input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    inputMode="tel"
                    placeholder="077 12 34 56"
                    className={inputCls}
                  />
                </Field>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <SectionTitle icon={<MapPin />}>Retrait ou livraison</SectionTitle>
          <Segmented<PlaceKey>
            ariaLabel="Lieu de retrait ou de livraison"
            value={place}
            onChange={(p) => {
              setPlace(p);
              setLocalError(null);
            }}
            options={[
              { key: 'FERME', label: 'À la ferme', icon: <Home /> },
              { key: 'PDV', label: 'Point de vente', icon: <Store /> },
              { key: 'LIVRAISON', label: 'Livraison', icon: <Truck /> },
            ]}
          />
          <p className="text-xs text-slate-500">{PLACE_HINT[place]}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {place === 'PDV' ? (
              <Field label="Point de vente de retrait">
                <select value={pdvId} onChange={(e) => setPdvId(e.target.value)} className={inputCls}>
                  <option value="">{boutiques.length ? 'Choisir un point de vente' : 'Aucun point de vente actif'}</option>
                  {boutiques.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            {place === 'LIVRAISON' ? (
              <Field label="Province">
                <ProvinceSelect value={province} onChange={setProvince} />
              </Field>
            ) : null}
            <Field label={place === 'LIVRAISON' ? 'Livraison prévue le' : 'Retrait prévu le'}>
              <input
                type="date"
                required
                min={today}
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
          {place === 'LIVRAISON' ? (
            <AddressField label="Adresse de livraison" value={where} province={province} onChange={setWhere} />
          ) : null}
        </section>

        <section className="space-y-2">
          <SectionTitle n={1}>Lot et stock disponible</SectionTitle>
          <ErrorNote error={batchesQuery.error} />
          <select aria-label="Choisir le lot" value={lotId} onChange={(e) => selectLot(e.target.value)} className={inputCls}>
            <option value="">
              {batchesQuery.isLoading ? 'Chargement des lots…' : sellable.length ? 'Sélectionner un lot' : 'Aucun lot disponible à la vente'}
            </option>
            {sellable.map((b) => (
              <option key={b.id} value={b.id}>
                {b.batchName ?? 'Lot sans nom'} · {num(b.quantityAlive, 0)} vivants
                {alveolesOf(b) > 0 ? ` · ${num(alveolesOf(b), 0)} alvéoles` : ''}
              </option>
            ))}
          </select>
          {lot ? (
            <div className="flex items-center gap-3">
              <PhotoThumb src={lotImage(lot.breedName, lot.species)} />
              <p className="text-xs text-slate-500">
                {[lot.breedCode, lot.breedName, lot.type === 'CHAIR' ? 'Chair' : 'Pondeuse'].filter(Boolean).join(' · ')} · J{lot.metrics.ageDays} ·{' '}
                {num(lot.quantityAlive, 0)} vivants
                {lotEggs > 0 ? ` · ${num(lotEggs, 0)} œufs, soit ${num(lotAlveoles, 0)} alvéoles` : ''}
              </p>
            </div>
          ) : null}
          {advice ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">{advice}</p> : null}
        </section>

        <section className="space-y-3">
          <SectionTitle n={2}>Article à ajouter</SectionTitle>
          <Segmented<ProductKey>
            ariaLabel="Type d’article"
            value={product}
            onChange={selectProduct}
            options={[
              { key: 'PIECE', label: 'Sur pied, à la pièce' },
              { key: 'KG', label: 'Sur pied, au kg' },
              ...(lotEggs > 0 ? [{ key: 'OEUF' as const, label: `Œufs · ${num(lotAlveoles, 0)} alv.` }] : []),
            ]}
          />
          {product === 'OEUF' ? (
            <p className="text-xs text-slate-500">
              {num(lotEggs, 0)} œufs disponibles sur ce lot. Vente par alvéole (30 œufs) : le prix unitaire est celui d’une alvéole.
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={`Quantité (${QTY_SUFFIX[product]})`} hint={maxQty > 0 && lot ? `Disponible : ${num(maxQty, 0)}` : undefined}>
              <input
                inputMode="numeric"
                value={qty > 0 ? String(qty) : ''}
                onChange={(e) => {
                  setQty(Math.min(parseWhole(e.target.value), Math.max(maxQty, 1)));
                  setLocalError(null);
                }}
                placeholder="0"
                className={inputCls}
              />
            </Field>
            {isKg ? (
              <Field
                label="Poids réel pesé (kg)"
                hint={weightKg > 0 ? `${num(weightKg, 2)} kg facturés` : `≈ ${num(estimatedKg, 2)} kg estimés`}
              >
                <input
                  inputMode="decimal"
                  value={weightText}
                  onChange={(e) => setWeightText(e.target.value)}
                  placeholder="0"
                  className={inputCls}
                />
              </Field>
            ) : null}
            <Field label={`Prix par ${PRICE_SUFFIX[product]} (FCFA)`} hint={`Conseillé : ${fcfa(SUGGESTED_PRICE[product])}`}>
              <input
                inputMode="numeric"
                value={price > 0 ? String(price) : ''}
                onChange={(e) => {
                  setPrice(parseWhole(e.target.value));
                  setLocalError(null);
                }}
                placeholder="0"
                className={inputCls}
              />
            </Field>
          </div>
          <Button tone="secondary" disabled={qty <= 0 || price <= 0} onClick={addItem}>
            <Plus className="h-4 w-4" /> Ajouter l’article
          </Button>
        </section>

        {items.length > 0 ? (
          <section>
            <SectionTitle icon={<Package />}>{`Articles de la commande (${items.length})`}</SectionTitle>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
              {items.map((i, idx) => (
                <li key={`${i.productType}-${idx}`} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block font-medium text-slate-800">{i.label}</span>
                    <span className="block text-xs text-slate-500">
                      {num(i.quantity, 2)} {UNIT_LABEL[i.unit]} × {fcfa(i.unitPriceFcfa)}
                      {i.pieceCount ? ` · ${num(i.pieceCount, 0)} oiseaux` : ''}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <b className="whitespace-nowrap text-slate-900">{fcfa(i.amountFcfa)}</b>
                    <button
                      type="button"
                      aria-label={`Retirer ${i.label}`}
                      onClick={() => setItems((prev) => prev.filter((_, n) => n !== idx))}
                      className="rounded p-1 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between bg-slate-50 px-3 py-2">
                <span className="text-slate-500">Total de la commande</span>
                <b className="text-slate-900">{fcfa(total)}</b>
              </li>
            </ul>
          </section>
        ) : null}

        <section>
          <SectionTitle icon={<Wallet />}>Acompte encaissé</SectionTitle>
          <div className="grid items-start gap-3 sm:grid-cols-2">
            <Field label={`Montant reçu (FCFA) · ${depositShare}`}>
              <input
                inputMode="numeric"
                value={deposit > 0 ? String(deposit) : ''}
                onChange={(e) => setDeposit(parseWhole(e.target.value))}
                placeholder="Vide si aucun acompte"
                className={inputCls}
              />
            </Field>
            <p className="text-xs text-slate-500 sm:pt-6">
              {deposit > 0
                ? `Commande confirmée dès l’encaissement (la caisse s’ouvre si besoin). Reste ${fcfa(Math.max(total - deposit, 0))} à la réception.`
                : 'Rien saisi : aucun argent reçu, la commande se règle à la réception.'}
            </p>
          </div>
        </section>

        <ErrorNote error={localError ?? create.error} />

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button tone="secondary" onClick={onClose} disabled={create.isPending}>
            Fermer
          </Button>
          <Button type="submit" busy={create.isPending} disabled={items.length === 0}>
            {create.isPending ? null : deposit > 0 ? <Wallet className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}
            {deposit > 0 ? `Créer et encaisser ${fcfa(deposit)}` : 'Créer la commande'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CalendarClock, MapPin, Store } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { BuyerMarketOrder, MarketFulfilment, MarketListing } from '../api/types-market';
import { useAuth } from '../auth/AuthContext';
import { Button, ErrorNote, Field, inputCls, todayIso } from '../components/form';
import { depositFor, orderTotal, unitName } from '../components/market/rules';
import { invalidateBuyerQueries, listingPhoto, listingTitle } from '../components/market/shared';
import { Segmented } from '../components/orders/shared';
import { Card, EmptyState, Loading } from '../components/ui';
import { dateFr, fcfa } from '../lib/format';
import { useIdempotencyKey } from '../lib/idempotency';
import { isGabonPhoneValid, normalizeGabonPhone } from '../lib/phone';

function OrderForm({ listing }: { listing: MarketListing }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const idempotency = useIdempotencyKey('market-order');
  const [quantity, setQuantity] = useState(String(listing.minOrderQty));
  const [fulfilment, setFulfilment] = useState<MarketFulfilment>(listing.pickupAvailable ? 'PICKUP' : 'DELIVERY');
  const [address, setAddress] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [desiredDate, setDesiredDate] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const qty = Number.parseInt(quantity, 10) || 0;
  const unit = (n: number) => unitName(listing.product, n);
  const deposit = depositFor(qty, listing.unitPriceFcfa, listing.depositPct);

  const submit = useMutation({
    mutationFn: () => {
      const phone = contactPhone.trim() ? normalizeGabonPhone(contactPhone) : undefined;
      const content = {
        listingId: listing.id,
        quantity: qty,
        fulfilment,
        address: fulfilment === 'DELIVERY' ? address.trim() : undefined,
        contactPhone: phone,
        note: note.trim() || undefined,
        desiredDate: listing.kind === 'NOW' && desiredDate ? desiredDate : undefined,
      };
      return api.post<BuyerMarketOrder>('/market/orders', { ...content, idempotencyKey: idempotency.keyFor(content) });
    },
    onSuccess: (order) => {
      idempotency.settle();
      invalidateBuyerQueries(client);
      navigate(`/marche/commandes/${order.id}`);
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (qty < listing.minOrderQty) return setFormError(`Commandez au moins ${listing.minOrderQty} ${unit(listing.minOrderQty)}.`);
    if (qty > listing.availableQuantity) return setFormError(`Il reste ${listing.availableQuantity} ${unit(listing.availableQuantity)}.`);
    if (fulfilment === 'DELIVERY' && !address.trim()) return setFormError('Indiquez l’adresse de livraison.');
    if (contactPhone.trim() && !isGabonPhoneValid(normalizeGabonPhone(contactPhone))) {
      return setFormError('Numéro invalide : 9 chiffres commençant par 0, par exemple 074 12 34 56.');
    }
    setFormError(null);
    submit.mutate();
  }

  const options = [
    ...(listing.pickupAvailable ? [{ key: 'PICKUP' as const, label: 'Retrait à la ferme' }] : []),
    ...(listing.deliveryAvailable
      ? [{ key: 'DELIVERY' as const, label: `Livraison${listing.deliveryFeeFcfa ? ` (${fcfa(listing.deliveryFeeFcfa)})` : ''}` }]
      : []),
  ];

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label={`Quantité (${unit(2)})`} hint={`Minimum ${listing.minOrderQty}, ${listing.availableQuantity} disponibles.`}>
        <input
          type="number"
          min={listing.minOrderQty}
          max={listing.availableQuantity}
          className={inputCls}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          required
        />
      </Field>
      <div>
        <span className="mb-1 block text-xs font-medium text-slate-600">Mode de remise</span>
        <Segmented ariaLabel="Mode de remise" value={fulfilment} options={options} onChange={setFulfilment} />
      </div>
      {fulfilment === 'DELIVERY' ? (
        <Field label="Adresse de livraison">
          <input className={inputCls} value={address} maxLength={200} onChange={(e) => setAddress(e.target.value)} required />
        </Field>
      ) : null}
      {listing.kind === 'NOW' ? (
        <Field label="Date souhaitée (facultatif)">
          <input type="date" min={todayIso()} className={inputCls} value={desiredDate} onChange={(e) => setDesiredDate(e.target.value)} />
        </Field>
      ) : null}
      <Field label="Téléphone de contact (facultatif)" hint="Si différent de celui de votre compte.">
        <input className={inputCls} inputMode="tel" placeholder="074 12 34 56" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
      </Field>
      <Field label="Message à la ferme (facultatif)">
        <textarea className={inputCls} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <dl className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">Total</dt>
          <dd className="font-bold tabular-nums text-slate-900">{fcfa(orderTotal(qty, listing.unitPriceFcfa, fulfilment, listing.deliveryFeeFcfa))}</dd>
        </div>
        {deposit > 0 ? (
          <div className="flex justify-between">
            <dt className="text-slate-500">Acompte ({listing.depositPct} %)</dt>
            <dd className="font-semibold tabular-nums text-slate-900">{fcfa(deposit)}</dd>
          </div>
        ) : null}
      </dl>

      {deposit > 0 ? (
        <p className="flex items-start gap-2 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800 ring-1 ring-orange-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Une fois votre demande acceptée, vous aurez <b>24 heures</b> pour remettre l’acompte de {fcfa(deposit)} à la ferme. Sans cela, la
            précommande sera annulée automatiquement et les oiseaux seront remis en vente.
          </span>
        </p>
      ) : null}

      <ErrorNote error={formError ?? submit.error} />
      <Button type="submit" className="w-full" busy={submit.isPending}>
        Envoyer ma demande
      </Button>
      <p className="text-center text-xs text-slate-500">
        La ferme doit accepter votre demande. Vous la payez directement : Fermia n’encaisse rien.
      </p>
    </form>
  );
}

export function MarketListingPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const query = useQuery({
    queryKey: ['market-listing', id],
    queryFn: () => api.get<MarketListing>(`/market/listings/${id}`),
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  const back = (
    <Link to="/marche" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800">
      <ArrowLeft className="h-4 w-4" /> Toutes les annonces
    </Link>
  );
  if (query.isLoading) return <Loading />;
  const listing = query.data;
  if (!listing) {
    const gone = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div>
        {back}
        {gone ? <EmptyState message="Cette annonce n’est plus disponible." icon={<Store className="h-5 w-5" />} /> : <ErrorNote error={query.error} />}
      </div>
    );
  }

  const photo = listingPhoto(listing);
  return (
    <div>
      {back}
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Card className="p-5">
            <div className="flex h-56 items-center justify-center">
              {photo ? <img src={photo} alt="" className="h-full w-full object-contain" /> : <Store className="h-14 w-14 text-slate-300" />}
            </div>
            <h1 className="mt-4 text-xl font-bold tracking-tight text-slate-900">{listingTitle(listing)}</h1>
            <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {listing.farm.name}
              {listing.farm.city ? ` · ${listing.farm.city}` : ''}
            </p>
            <p className="mt-3 text-2xl font-bold tabular-nums text-brand-700">
              {fcfa(listing.unitPriceFcfa)} <span className="text-sm font-normal text-slate-500">/ {unitName(listing.product)}</span>
            </p>
            {listing.description ? <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{listing.description}</p> : null}
          </Card>
          {listing.kind === 'PRE' && listing.readyDate ? (
            <Card className="p-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <CalendarClock className="h-4 w-4 text-sky-600" /> Prêts le {dateFr(listing.readyDate)}
              </p>
              {listing.previousReadyDate ? (
                <p className="mt-1 text-sm text-slate-500">Date modifiée par la ferme (auparavant le {dateFr(listing.previousReadyDate)}).</p>
              ) : null}
            </Card>
          ) : null}
          {listing.product === 'CARCASS' && listing.slaughteredAt ? (
            <Card className="p-5">
              <p className="text-sm font-semibold text-slate-900">Abattus le {dateFr(listing.slaughteredAt)}</p>
              <p className="mt-1 text-sm text-slate-500">Demandez à la ferme comment les carcasses sont conservées.</p>
            </Card>
          ) : null}
        </div>
        <div className="lg:col-span-2">
          <Card className="p-5">
            <h2 className="mb-4 font-semibold text-slate-900">{listing.kind === 'PRE' ? 'Précommander' : 'Commander'}</h2>
            {user ? (
              <OrderForm listing={listing} />
            ) : (
              <div className="space-y-3 text-sm text-slate-600">
                <p>Créez un compte gratuit ou connectez-vous pour envoyer votre demande à la ferme.</p>
                <Link
                  to="/marche/inscription"
                  state={{ from: pathname }}
                  className="block rounded-lg bg-brand-600 py-2.5 text-center font-semibold text-white hover:bg-brand-700"
                >
                  Créer un compte
                </Link>
                <Link
                  to="/login"
                  state={{ from: pathname }}
                  className="block rounded-lg border border-slate-300 py-2.5 text-center font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Me connecter
                </Link>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

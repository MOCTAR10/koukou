import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  CalendarCheck,
  CalendarClock,
  ChevronRight,
  Home,
  MapPin,
  Minus,
  Package,
  Plus,
  QrCode,
  ShieldCheck,
  Store,
  Truck,
  Wallet,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { BuyerMarketOrder, MarketFulfilment, MarketListing } from '../api/types-market';
import { useAuth } from '../auth/AuthContext';
import { canUseBuyerArea } from '../app/roles';
import { Button, ErrorNote, Field, inputCls, todayIso, DateInput } from '../components/form';
import { depositFor, orderTotal, unitName } from '../components/market/rules';
import { AvailabilityBadge, FactTile, FarmAvatar, invalidateBuyerQueries, ListingStage, listingTitle, MARKET_PANEL, PRODUCT_NAME } from '../components/market/shared';
import { Segmented } from '../components/orders/shared';
import { EmptyState, Skeleton } from '../components/ui';
import { dateFr, fcfa } from '../lib/format';
import { safeHref } from '../lib/safeUrl';
import { useIdempotencyKey } from '../lib/idempotency';
import { isGabonPhoneValid, normalizeGabonPhone } from '../lib/phone';

const STEP_BTN = 'flex w-12 shrink-0 items-center justify-center text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-35';

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
  const step = (delta: number) =>
    setQuantity(String(Math.min(listing.availableQuantity, Math.max(listing.minOrderQty, qty + delta))));

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
      {/* Not a <label>: it would label the first stepper button instead of the input. */}
      <div>
        <span className="mb-1 block text-xs font-medium text-slate-600">Quantité ({unit(2)})</span>
        <div className="flex items-stretch overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
          <button type="button" aria-label="Diminuer la quantité" disabled={qty <= listing.minOrderQty} onClick={() => step(-1)} className={STEP_BTN}>
            <Minus className="h-4 w-4" />
          </button>
          <input
            type="number"
            aria-label={`Quantité (${unit(2)})`}
            min={listing.minOrderQty}
            max={listing.availableQuantity}
            className="w-full min-w-0 border-x border-slate-200 bg-transparent px-2 py-2.5 text-center text-base font-semibold tabular-nums text-slate-900 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
          <button type="button" aria-label="Augmenter la quantité" disabled={qty >= listing.availableQuantity} onClick={() => step(1)} className={STEP_BTN}>
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <span className="mt-1 block text-xs text-slate-500">
          Minimum {listing.minOrderQty}, {listing.availableQuantity.toLocaleString('fr-FR')} disponibles.
        </span>
      </div>
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
          <DateInput min={todayIso()} className={inputCls} value={desiredDate} onChange={(e) => setDesiredDate(e.target.value)} />
        </Field>
      ) : null}
      <Field label="Téléphone de contact (facultatif)" hint="Si différent de celui de votre compte.">
        <input className={inputCls} inputMode="tel" placeholder="074 12 34 56" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
      </Field>
      <Field label="Message à la ferme (facultatif)">
        <textarea className={inputCls} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <dl className="space-y-2 rounded-2xl bg-slate-50 p-4 text-sm ring-1 ring-inset ring-slate-200/70">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">
            {qty.toLocaleString('fr-FR')} {unit(qty)} × {fcfa(listing.unitPriceFcfa)}
          </dt>
          <dd className="tabular-nums text-slate-700">{fcfa(qty * listing.unitPriceFcfa)}</dd>
        </div>
        {fulfilment === 'DELIVERY' && listing.deliveryFeeFcfa ? (
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Livraison</dt>
            <dd className="tabular-nums text-slate-700">{fcfa(listing.deliveryFeeFcfa)}</dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between gap-3 border-t border-slate-200 pt-2">
          <dt className="font-semibold text-slate-900">Total</dt>
          <dd className="text-xl font-bold tracking-tight tabular-nums text-slate-900">
            {fcfa(orderTotal(qty, listing.unitPriceFcfa, fulfilment, listing.deliveryFeeFcfa))}
          </dd>
        </div>
        {deposit > 0 ? (
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">dont acompte ({listing.depositPct} %)</dt>
            <dd className="font-semibold tabular-nums text-slate-900">{fcfa(deposit)}</dd>
          </div>
        ) : null}
      </dl>

      {deposit > 0 ? (
        <p className="flex items-start gap-2 rounded-xl bg-orange-50 px-3 py-2.5 text-sm text-orange-800 ring-1 ring-orange-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Une fois votre demande acceptée, vous aurez <b>24 heures</b> pour remettre l’acompte de {fcfa(deposit)} à la ferme. Sans cela, la
            précommande sera annulée automatiquement et les oiseaux seront remis en vente.
          </span>
        </p>
      ) : null}

      <ErrorNote error={formError ?? submit.error} />
      <Button type="submit" tone="accent" className="w-full rounded-xl py-3 text-base" busy={submit.isPending}>
        Envoyer ma demande
      </Button>
      <p className="text-center text-xs text-slate-500">
        La ferme doit accepter votre demande. Vous la payez directement : Fermia n’encaisse rien.
      </p>
    </form>
  );
}

function ListingSkeleton() {
  return (
    <div role="status" className="grid gap-6 lg:grid-cols-12">
      <span className="sr-only">Chargement de l’annonce…</span>
      <div className="space-y-5 lg:col-span-7">
        <Skeleton className="aspect-square max-w-80 rounded-3xl" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-6 w-1/3" />
      </div>
      <Skeleton className="h-96 rounded-3xl lg:col-span-5" />
    </div>
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
  const listing = query.data;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  // On a phone the order panel sits below the fold: a bottom bar leads to it until it shows.
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelSeen, setPanelSeen] = useState(true);
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setPanelSeen(entry.isIntersecting), { threshold: 0.1 });
    observer.observe(panel);
    return () => observer.disconnect();
  }, [listing?.id]);

  const crumbs = (
    <nav aria-label="Fil d’Ariane" className="mb-5 flex flex-wrap items-center gap-1 text-sm text-slate-500">
      <Link to="/marche" className="font-medium text-brand-700 hover:text-brand-800 hover:underline">
        Marché
      </Link>
      {listing ? (
        <>
          <ChevronRight className="h-4 w-4 text-slate-300" />
          <span>{PRODUCT_NAME[listing.product]}</span>
          <ChevronRight className="h-4 w-4 text-slate-300" />
          <span className="truncate font-medium text-slate-700">{listingTitle(listing)}</span>
        </>
      ) : null}
    </nav>
  );

  if (query.isLoading) {
    return (
      <div>
        {crumbs}
        <ListingSkeleton />
      </div>
    );
  }
  if (!listing) {
    const gone = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div>
        {crumbs}
        {gone ? (
          <EmptyState
            title="Annonce indisponible"
            message="Cette annonce n’est plus disponible."
            icon={<Store className="h-5 w-5" />}
            action={{ label: 'Voir toutes les annonces', to: '/marche' }}
          />
        ) : (
          <ErrorNote error={query.error} onRetry={() => void query.refetch()} />
        )}
      </div>
    );
  }

  const unit = (n: number) => unitName(listing.product, n);
  const orderLabel = listing.kind === 'PRE' ? 'Précommander' : 'Commander';
  const price = (
    <>
      {fcfa(listing.unitPriceFcfa)} <span className="text-sm font-medium tracking-normal text-slate-500">/ {unitName(listing.product)}</span>
    </>
  );
  const tracePath = listing.traceLot ? safeHref(listing.traceLot.path) : null;

  return (
    <div className="pb-20 lg:pb-0">
      {crumbs}
      <div className="grid gap-6 lg:grid-cols-12 lg:items-start xl:gap-8">
        <div className="space-y-5 lg:col-span-7">
          {/* The photos are square: a square stage shows them edge to edge. */}
          <div className="grid gap-5 sm:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] sm:items-center">
            <div className="relative overflow-hidden rounded-3xl border border-slate-200 shadow-card">
              <ListingStage listing={listing} eager className="aspect-square" />
              <div className="absolute inset-x-3 top-3">
                <AvailabilityBadge kind={listing.kind} />
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{PRODUCT_NAME[listing.product]}</p>
              <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{listingTitle(listing)}</h1>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-500">
                <MapPin className="h-4 w-4 shrink-0" />
                {listing.farm.name}
                {listing.farm.city ? ` · ${listing.farm.city}` : ''}
              </p>
              <p className="mt-4 text-3xl font-bold tracking-tight tabular-nums text-brand-800">{price}</p>
              <p className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                  <ShieldCheck className="h-3.5 w-3.5" /> Ferme vérifiée
                </span>
                {listing.traceLot ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200">
                    <QrCode className="h-3.5 w-3.5" /> Lot tracé
                  </span>
                ) : null}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            <FactTile icon={Package} label="Disponible" value={`${listing.availableQuantity.toLocaleString('fr-FR')} ${unit(listing.availableQuantity)}`} />
            <FactTile icon={Boxes} label="Commande minimum" value={`${listing.minOrderQty} ${unit(listing.minOrderQty)}`} />
            <FactTile icon={Wallet} label="Acompte" value={listing.depositPct ? `${listing.depositPct} %` : 'Aucun'} />
            <FactTile icon={Home} label="Retrait" value={listing.pickupAvailable ? 'À la ferme' : 'Non proposé'} muted={!listing.pickupAvailable} />
            <Fact
              icon={Truck}
              label="Livraison"
              value={listing.deliveryAvailable ? (listing.deliveryFeeFcfa ? fcfa(listing.deliveryFeeFcfa) : 'Proposée') : 'Non proposée'}
              muted={!listing.deliveryAvailable}
            />
            {listing.kind === 'PRE' && listing.readyDate ? <FactTile icon={CalendarClock} label="Prêts le" value={dateFr(listing.readyDate)} /> : null}
            {listing.product === 'CARCASS' && listing.slaughteredAt ? <FactTile icon={CalendarCheck} label="Abattus le" value={dateFr(listing.slaughteredAt)} /> : null}
          </div>

          {listing.kind === 'PRE' && listing.readyDate && listing.previousReadyDate ? (
            <p className="flex items-start gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-sm text-brand-800 ring-1 ring-brand-100">
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
              Date modifiée par la ferme (auparavant le {dateFr(listing.previousReadyDate)}).
            </p>
          ) : null}
          {listing.product === 'CARCASS' && listing.slaughteredAt ? (
            <p className="rounded-xl bg-slate-100 px-3 py-2.5 text-sm text-slate-600">Demandez à la ferme comment les carcasses sont conservées.</p>
          ) : null}

          {listing.description ? (
            <section className={`${MARKET_PANEL} p-5`}>
              <h2 className="text-sm font-semibold text-slate-900">Le mot de la ferme</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{listing.description}</p>
            </section>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <section className={`${MARKET_PANEL} flex items-center gap-3 p-4`}>
              <FarmAvatar farm={listing.farm} className="h-12 w-12 text-lg" />
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{listing.farm.name}</p>
                {listing.farm.city ? (
                  <p className="flex items-center gap-1 text-sm text-slate-500">
                    <MapPin className="h-3.5 w-3.5 shrink-0" /> {listing.farm.city}
                  </p>
                ) : null}
                <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                  <ShieldCheck className="h-3.5 w-3.5" /> Ferme vérifiée
                </p>
              </div>
            </section>
            {listing.traceLot ? (
              // POUFA lot A indic: the band's public traceability page.
              <a
                href={tracePath ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className={`${MARKET_PANEL} group flex items-center gap-3 p-4 transition hover:border-brand-200 hover:shadow-raised`}
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-950 text-emerald-300">
                  <QrCode className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-slate-900">Lot tracé {listing.traceLot.code}</span>
                  <span className="block text-sm text-slate-500">Voir la fiche de traçabilité</span>
                </span>
                <ArrowUpRight className="h-5 w-5 shrink-0 text-slate-400 transition-colors group-hover:text-brand-600" />
              </a>
            ) : null}
          </div>
        </div>

        <div ref={panelRef} id="commander" className="scroll-mt-24 lg:sticky lg:top-24 lg:col-span-5">
          <section className={`${MARKET_PANEL} overflow-hidden shadow-raised`}>
            <header className="border-b border-slate-100 bg-slate-50 px-5 py-4 sm:px-6">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{orderLabel}</h2>
              <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-slate-900">{price}</p>
            </header>
            <div className="p-5 sm:p-6">
              {user && canUseBuyerArea(user.role) ? (
                <OrderForm listing={listing} />
              ) : user ? (
                <p className="text-sm text-slate-600">Un compte institutionnel ne passe pas de commande sur le Marché.</p>
              ) : (
                <div className="space-y-3 text-sm text-slate-600">
                  <p>Créez un compte gratuit ou connectez-vous pour envoyer votre demande à la ferme.</p>
                  <Link
                    to="/marche/inscription"
                    state={{ from: pathname }}
                    className="block rounded-xl bg-accent-500 py-3 text-center text-base font-semibold text-slate-950 shadow-sm transition-colors hover:bg-accent-400"
                  >
                    Créer un compte client
                  </Link>
                  <Link
                    to="/login"
                    state={{ from: pathname }}
                    className="block rounded-xl border border-slate-300 py-3 text-center font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Me connecter
                  </Link>
                  <p className="pt-1 text-center text-xs text-slate-500">Vous payez directement la ferme : Fermia n’encaisse rien.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {panelSeen ? null : (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_-12px_rgb(12_35_49/0.25)] backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-4">
            <p className="min-w-0 truncate text-lg font-bold tracking-tight tabular-nums text-slate-900">{price}</p>
            <button
              type="button"
              onClick={() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="shrink-0 rounded-xl bg-accent-500 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-sm hover:bg-accent-400"
            >
              {orderLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


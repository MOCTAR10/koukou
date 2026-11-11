import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  Clock,
  Home,
  Package,
  Phone,
  Store,
  Truck,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { BuyerMarketOrder } from '../api/types-market';
import { Button, ErrorNote } from '../components/form';
import { timeLeft, unitName } from '../components/market/rules';
import {
  FactTile,
  FarmAvatar,
  invalidateBuyerQueries,
  ListingStage,
  listingTitle,
  MARKET_PANEL,
  MarketStatusBadge,
  MarketTitle,
  TIMELINE_LABEL,
  useNow,
} from '../components/market/shared';
import { ConfirmDialog } from '../components/orders/shared';
import { Skeleton } from '../components/ui';
import { classNames, dateFr, dateTimeFr, fcfa } from '../lib/format';
import { telHref } from '../lib/safeUrl';

function OrderRow({ order, now }: { order: BuyerMarketOrder; now: number }) {
  const left = order.status === 'AWAITING_DEPOSIT' && order.depositDueAt ? timeLeft(order.depositDueAt, now) : null;
  return (
    <Link
      to={`/marche/commandes/${order.id}`}
      className={`group ${MARKET_PANEL} flex items-center gap-4 p-3 transition duration-300 hover:border-brand-200 hover:shadow-raised sm:p-4`}
    >
      <ListingStage listing={order} className="h-20 w-20 shrink-0 rounded-2xl sm:h-24 sm:w-24" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="font-semibold text-slate-900 sm:truncate">{listingTitle(order)}</h2>
          <MarketStatusBadge status={order.status} />
        </div>
        <p className="mt-1 text-sm text-slate-500 sm:truncate">
          {order.farm.name}
          {order.farm.city ? ` · ${order.farm.city}` : ''}
        </p>
        <p className="mt-1 text-base font-bold tracking-tight tabular-nums text-brand-800 sm:hidden">{fcfa(order.totalFcfa)}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
          <span>
            {order.quantity.toLocaleString('fr-FR')} {unitName(order.product, order.quantity)}
          </span>
          {order.readyDate ? (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" /> Prêts le {dateFr(order.readyDate)}
            </span>
          ) : null}
          {left ? (
            <span className="inline-flex items-center gap-1 font-semibold text-orange-700">
              <Clock className="h-3.5 w-3.5" /> Reste {left} pour l’acompte
            </span>
          ) : null}
        </p>
      </div>
      <div className="hidden shrink-0 text-right sm:block">
        <p className="text-lg font-bold tracking-tight tabular-nums text-slate-900">{fcfa(order.totalFcfa)}</p>
        <p className="hidden text-xs text-slate-500 sm:block">Demande du {dateFr(order.createdAt)}</p>
      </div>
      <ChevronRight className="hidden h-5 w-5 shrink-0 text-slate-300 transition-colors group-hover:text-brand-600 sm:block" />
    </Link>
  );
}

export function BuyerOrdersPage() {
  const query = useQuery({
    queryKey: ['market-orders'],
    queryFn: () => api.get<BuyerMarketOrder[]>('/market/orders'),
  });
  const now = useNow();
  const orders = query.data ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <MarketTitle eyebrow="Marché Fermia" title="Mes commandes" subtitle="Vos demandes et précommandes auprès des fermes." />
      {query.isLoading ? (
        <div role="status" className="space-y-3">
          <span className="sr-only">Chargement de vos commandes…</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className={`${MARKET_PANEL} flex items-center gap-4 p-4`}>
              <Skeleton className="h-24 w-24 rounded-2xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {query.error ? <ErrorNote error={query.error} onRetry={() => void query.refetch()} /> : null}
      {!query.isLoading && !query.error && orders.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <Store className="h-7 w-7" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">Aucune commande pour le moment</h2>
          <p className="mt-1 max-w-md text-sm text-slate-500">Parcourez les annonces des fermes : vos demandes apparaîtront ici.</p>
          <Link to="/marche" className="mt-5 rounded-xl bg-accent-500 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-sm transition-colors hover:bg-accent-400">
            Voir les annonces
          </Link>
        </div>
      ) : null}
      {orders.length > 0 ? (
        <div className="space-y-3">
          {orders.map((o) => (
            <OrderRow key={o.id} order={o} now={now} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DepositBox({ order }: { order: BuyerMarketOrder }) {
  const now = useNow();
  const left = order.depositDueAt ? timeLeft(order.depositDueAt, now) : null;
  return (
    <div className="rounded-2xl bg-orange-50 p-4 text-sm text-orange-900 ring-1 ring-orange-200">
      <p className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4 shrink-0" /> Acompte à remettre : {fcfa(order.depositRequiredFcfa)}
      </p>
      {order.depositDueAt ? (
        <p className="mt-1">
          {left ? (
            <>
              Il vous reste <b>{left}</b>, jusqu’au {dateTimeFr(order.depositDueAt)}.
            </>
          ) : (
            <>Le délai est dépassé : la commande va être annulée automatiquement. Contactez vite la ferme si vous avez déjà payé.</>
          )}
        </p>
      ) : null}
      <p className="mt-1">Sans acompte enregistré par la ferme à temps, la commande est annulée et les oiseaux sont remis en vente.</p>
    </div>
  );
}

const NOTE = 'rounded-2xl p-4 text-sm ring-1';

export function BuyerOrderPage() {
  const { id = '' } = useParams();
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const query = useQuery({
    queryKey: ['market-order', id],
    queryFn: () => api.get<BuyerMarketOrder>(`/market/orders/${id}`),
  });
  const order = query.data;
  const pending = order?.status === 'PENDING';
  const action = useMutation({
    mutationFn: () => api.post<BuyerMarketOrder>(`/market/orders/${id}/${pending ? 'withdraw' : 'cancel'}`),
    onSuccess: () => {
      setConfirming(false);
      invalidateBuyerQueries(client);
    },
  });

  const crumbs = (
    <nav aria-label="Fil d’Ariane" className="mb-5 flex flex-wrap items-center gap-1 text-sm text-slate-500">
      <Link to="/marche/commandes" className="font-medium text-brand-700 hover:text-brand-800 hover:underline">
        Mes commandes
      </Link>
      {order ? (
        <>
          <ChevronRight className="h-4 w-4 text-slate-300" />
          <span className="truncate font-medium text-slate-700">{order.orderReference ?? listingTitle(order)}</span>
        </>
      ) : null}
    </nav>
  );
  if (query.isLoading) {
    return (
      <div role="status">
        {crumbs}
        <span className="sr-only">Chargement de la commande…</span>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Skeleton className="h-72 rounded-3xl" />
          <Skeleton className="h-56 rounded-3xl" />
        </div>
      </div>
    );
  }
  if (!order) {
    return (
      <div>
        {crumbs}
        <ErrorNote error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const canCancel = order.status === 'AWAITING_DEPOSIT' || order.status === 'CONFIRMED';
  const unit = unitName(order.product, order.quantity);
  const lastEvent = order.timeline.length - 1;
  return (
    <div>
      {crumbs}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <section className={`${MARKET_PANEL} flex flex-wrap items-center gap-5 p-4 sm:p-5`}>
            <ListingStage listing={order} eager className="h-28 w-28 shrink-0 rounded-2xl sm:h-36 sm:w-36" />
            <div className="min-w-0 flex-1">
              <MarketStatusBadge status={order.status} />
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{listingTitle(order)}</h1>
              <p className="mt-1.5 flex items-center gap-2 text-sm text-slate-500">
                <FarmAvatar farm={order.farm} />
                <span className="min-w-0 sm:truncate">
                  <span className="font-medium text-slate-700">{order.farm.name}</span>
                  {order.farm.city ? ` · ${order.farm.city}` : ''}
                </span>
              </p>
              <p className="mt-3 text-2xl font-bold tracking-tight tabular-nums text-brand-800">{fcfa(order.totalFcfa)}</p>
            </div>
            {order.farm.phone ? (
              <a
                href={telHref(order.farm.phone) ?? undefined}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 sm:w-auto"
              >
                <Phone className="h-4 w-4 text-brand-600" /> Appeler la ferme : {order.farm.phone}
              </a>
            ) : null}
          </section>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            <FactTile icon={Package} label="Quantité" value={`${order.quantity.toLocaleString('fr-FR')} ${unit}`} />
            <FactTile icon={Banknote} label="Prix unitaire" value={fcfa(order.unitPriceFcfa)} />
            {order.depositRequiredFcfa > 0 ? (
              <FactTile icon={Wallet} label="Acompte reçu par la ferme" value={`${fcfa(order.depositPaidFcfa)} sur ${fcfa(order.depositRequiredFcfa)}`} />
            ) : null}
            <FactTile
              icon={order.fulfilment === 'DELIVERY' ? Truck : Home}
              label="Remise"
              value={order.fulfilment === 'DELIVERY' ? 'Livraison' : 'Retrait à la ferme'}
            />
            {order.readyDate ? <FactTile icon={CalendarClock} label="Prêts le" value={dateFr(order.readyDate)} /> : null}
            {order.desiredDate ? <FactTile icon={CalendarDays} label="Date souhaitée" value={dateFr(order.desiredDate)} /> : null}
          </div>
          {order.fulfilment === 'DELIVERY' && order.address ? (
            <p className="flex items-start gap-2 text-sm text-slate-600">
              <Truck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <span>
                <span className="font-medium text-slate-900">Adresse de livraison :</span> {order.address}
              </span>
            </p>
          ) : null}

          {order.status === 'AWAITING_DEPOSIT' ? <DepositBox order={order} /> : null}
          {order.status === 'PENDING' && order.requestExpiresAt ? (
            <p className={`${NOTE} bg-amber-50 text-amber-900 ring-amber-200`}>
              La ferme a jusqu’au {dateTimeFr(order.requestExpiresAt)} pour répondre. Rien n’est réservé tant qu’elle n’a pas accepté.
            </p>
          ) : null}
          {order.status === 'CANCEL_REQUESTED' ? (
            <p className={`${NOTE} bg-orange-50 text-orange-900 ring-orange-200`}>
              Vous avez demandé l’annulation. Un acompte a été versé : le remboursement est à convenir avec la ferme, qui finalisera l’annulation.
            </p>
          ) : null}
          {order.status === 'REJECTED' && order.rejectReason ? (
            <p className={`${NOTE} bg-red-50 text-red-800 ring-red-200`}>Motif de la ferme : {order.rejectReason}</p>
          ) : null}
          {order.previousReadyDate && canCancel ? (
            <p className={`${NOTE} flex items-start gap-2 bg-sky-50 text-sky-900 ring-sky-200`}>
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                La ferme a déplacé la date du {dateFr(order.previousReadyDate)} au {dateFr(order.readyDate)}. Sans réponse de votre part, la commande
                est maintenue. Vous pouvez aussi l’annuler.
              </span>
            </p>
          ) : null}
        </div>

        <div className="space-y-4 lg:sticky lg:top-24">
          <section className={`${MARKET_PANEL} p-5`}>
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Historique</h2>
            <ol className="mt-4">
              {order.timeline.map((e, i) => (
                <li key={`${e.type}-${e.at}`} className="relative flex gap-3 pb-5 last:pb-0">
                  {i < lastEvent ? <span aria-hidden className="absolute bottom-0 left-[5px] top-4 w-px bg-slate-200" /> : null}
                  <span
                    aria-hidden
                    className={classNames(
                      'relative mt-1 h-[11px] w-[11px] shrink-0 rounded-full ring-4',
                      i === lastEvent ? 'bg-brand-600 ring-brand-100' : 'bg-slate-300 ring-white',
                    )}
                  />
                  <span className="min-w-0">
                    <span className={classNames('block text-sm', i === lastEvent ? 'font-semibold text-slate-900' : 'text-slate-700')}>
                      {TIMELINE_LABEL[e.type] ?? e.type}
                    </span>
                    <span className="block text-xs text-slate-500">{dateTimeFr(e.at)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {pending || canCancel ? (
            <Button tone="secondary" className="w-full rounded-xl py-2.5" onClick={() => setConfirming(true)}>
              {pending ? 'Retirer ma demande' : order.depositPaidFcfa > 0 ? 'Demander l’annulation' : 'Annuler la commande'}
            </Button>
          ) : null}
          <p className="text-center text-xs text-slate-500">Vous payez directement la ferme : Fermia n’encaisse rien.</p>
        </div>
      </div>

      {action.error && !confirming ? <ErrorNote error={action.error} /> : null}
      {confirming ? (
        <ConfirmDialog
          title={pending ? 'Retirer la demande ?' : order.depositPaidFcfa > 0 ? 'Demander l’annulation ?' : 'Annuler la commande ?'}
          message={
            pending ? (
              <p>La ferme ne recevra plus cette demande.</p>
            ) : order.depositPaidFcfa > 0 ? (
              <p>
                La ferme a reçu {fcfa(order.depositPaidFcfa)} d’acompte. La commande reste en place tant que la ferme ne l’a pas annulée, et le
                remboursement est à convenir directement avec elle.
              </p>
            ) : (
              <p>Les {unit} seront remis en vente.</p>
            )
          }
          confirmLabel="Confirmer"
          busy={action.isPending}
          error={action.error}
          onConfirm={() => action.mutate()}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CalendarClock, ChevronRight, ClipboardList, Phone, Store } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { BuyerMarketOrder } from '../api/types-market';
import { Button, ErrorNote } from '../components/form';
import { timeLeft, unitName } from '../components/market/rules';
import { invalidateBuyerQueries, listingPhoto, listingTitle, MarketStatusBadge, TIMELINE_LABEL, useNow } from '../components/market/shared';
import { ConfirmDialog } from '../components/orders/shared';
import { Card, EmptyState, Loading, PageHeader, PhotoThumb } from '../components/ui';
import { dateFr, dateTimeFr, fcfa } from '../lib/format';

export function BuyerOrdersPage() {
  const query = useQuery({
    queryKey: ['market-orders'],
    queryFn: () => api.get<BuyerMarketOrder[]>('/market/orders'),
  });
  const now = useNow();
  const orders = query.data ?? [];

  return (
    <div>
      <PageHeader title="Mes commandes" subtitle="Vos demandes et précommandes auprès des fermes." icon={<ClipboardList className="h-5 w-5" />} />
      {query.isLoading ? <Loading /> : null}
      {query.error ? <ErrorNote error={query.error} /> : null}
      {!query.isLoading && !query.error && orders.length === 0 ? (
        <div className="space-y-3 text-center">
          <EmptyState message="Vous n’avez encore rien commandé." icon={<Store className="h-5 w-5" />} />
          <Link to="/marche" className="inline-block text-sm font-semibold text-brand-700 hover:text-brand-800">
            Voir les annonces
          </Link>
        </div>
      ) : null}
      <div className="space-y-3">
        {orders.map((o) => {
          const left = o.status === 'AWAITING_DEPOSIT' && o.depositDueAt ? timeLeft(o.depositDueAt, now) : null;
          return (
            <Link key={o.id} to={`/marche/commandes/${o.id}`} className="block rounded-xl transition hover:shadow-md">
              <Card className="p-4 flex items-center gap-3">
                <PhotoThumb src={listingPhoto(o)} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{listingTitle(o)}</p>
                  <p className="truncate text-sm text-slate-500">
                    {o.farm.name} · {o.quantity} {unitName(o.product, o.quantity)} · {fcfa(o.totalFcfa)}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <MarketStatusBadge status={o.status} />
                    {left ? <span className="text-xs font-semibold text-orange-700">Reste {left} pour l’acompte</span> : null}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function DepositBox({ order }: { order: BuyerMarketOrder }) {
  const now = useNow();
  const left = order.depositDueAt ? timeLeft(order.depositDueAt, now) : null;
  return (
    <div className="rounded-xl bg-orange-50 p-4 text-sm text-orange-900 ring-1 ring-orange-200">
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

  const back = (
    <Link to="/marche/commandes" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800">
      <ArrowLeft className="h-4 w-4" /> Mes commandes
    </Link>
  );
  if (query.isLoading) return <Loading />;
  if (!order) {
    return (
      <div>
        {back}
        <ErrorNote error={query.error} />
      </div>
    );
  }

  const canCancel = order.status === 'AWAITING_DEPOSIT' || order.status === 'CONFIRMED';
  const unit = unitName(order.product, order.quantity);
  return (
    <div className="mx-auto max-w-2xl">
      {back}
      <div className="space-y-4">
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <PhotoThumb src={listingPhoto(order)} size="lg" />
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold text-slate-900">{listingTitle(order)}</h1>
              <p className="text-sm text-slate-500">
                {order.farm.name}
                {order.farm.city ? ` · ${order.farm.city}` : ''}
              </p>
              <div className="mt-2">
                <MarketStatusBadge status={order.status} />
              </div>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Quantité</dt>
              <dd className="font-medium text-slate-900">{order.quantity} {unit}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Total</dt>
              <dd className="font-bold tabular-nums text-slate-900">{fcfa(order.totalFcfa)}</dd>
            </div>
            {order.depositRequiredFcfa > 0 ? (
              <div>
                <dt className="text-xs text-slate-500">Acompte reçu par la ferme</dt>
                <dd className="font-medium tabular-nums text-slate-900">
                  {fcfa(order.depositPaidFcfa)} sur {fcfa(order.depositRequiredFcfa)}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs text-slate-500">Remise</dt>
              <dd className="font-medium text-slate-900">
                {order.fulfilment === 'DELIVERY' ? `Livraison : ${order.address ?? ''}` : 'Retrait à la ferme'}
              </dd>
            </div>
            {order.readyDate ? (
              <div>
                <dt className="text-xs text-slate-500">Prêts le</dt>
                <dd className="font-medium text-slate-900">{dateFr(order.readyDate)}</dd>
              </div>
            ) : null}
            {order.desiredDate ? (
              <div>
                <dt className="text-xs text-slate-500">Date souhaitée</dt>
                <dd className="font-medium text-slate-900">{dateFr(order.desiredDate)}</dd>
              </div>
            ) : null}
          </dl>
          {order.farm.phone ? (
            <a href={`tel:${order.farm.phone}`} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:text-brand-800">
              <Phone className="h-4 w-4" /> Appeler la ferme : {order.farm.phone}
            </a>
          ) : null}
        </Card>

        {order.status === 'AWAITING_DEPOSIT' ? <DepositBox order={order} /> : null}
        {order.status === 'PENDING' && order.requestExpiresAt ? (
          <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
            La ferme a jusqu’au {dateTimeFr(order.requestExpiresAt)} pour répondre. Rien n’est réservé tant qu’elle n’a pas accepté.
          </p>
        ) : null}
        {order.status === 'CANCEL_REQUESTED' ? (
          <p className="rounded-xl bg-orange-50 p-4 text-sm text-orange-900 ring-1 ring-orange-200">
            Vous avez demandé l’annulation. Un acompte a été versé : le remboursement est à convenir avec la ferme, qui finalisera l’annulation.
          </p>
        ) : null}
        {order.status === 'REJECTED' && order.rejectReason ? (
          <p className="rounded-xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">Motif de la ferme : {order.rejectReason}</p>
        ) : null}
        {order.previousReadyDate && canCancel ? (
          <p className="flex items-start gap-2 rounded-xl bg-sky-50 p-4 text-sm text-sky-900 ring-1 ring-sky-200">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              La ferme a déplacé la date du {dateFr(order.previousReadyDate)} au {dateFr(order.readyDate)}. Sans réponse de votre part, la commande
              est maintenue. Vous pouvez aussi l’annuler.
            </span>
          </p>
        ) : null}

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Historique</h2>
          <ol className="space-y-2">
            {order.timeline.map((e) => (
              <li key={`${e.type}-${e.at}`} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-slate-700">{TIMELINE_LABEL[e.type] ?? e.type}</span>
                <span className="shrink-0 text-xs text-slate-400">{dateTimeFr(e.at)}</span>
              </li>
            ))}
          </ol>
        </Card>

        {pending || canCancel ? (
          <div className="flex justify-end">
            <Button tone="secondary" onClick={() => setConfirming(true)}>
              {pending ? 'Retirer ma demande' : order.depositPaidFcfa > 0 ? 'Demander l’annulation' : 'Annuler la commande'}
            </Button>
          </div>
        ) : null}
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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, Check, ExternalLink, Pause, Pencil, Plus, Send, Store, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { FarmMarketListing, FarmMarketOrder, MarketOrderState } from '../api/types-market';
import { useFarm } from '../app/FarmContext';
import { useFarmProfile } from '../app/useFarmProfile';
import { Button, ErrorNote, Field, inputCls, Modal, todayIso } from '../components/form';
import { ListingFormModal } from '../components/market/ListingFormModal';
import { timeLeft, unitName } from '../components/market/rules';
import { buyerTypeLabel, HIDDEN_REASON, listingPhoto, listingTitle, MarketStatusBadge, useNow } from '../components/market/shared';
import { addDaysIso, invalidateOrderQueries } from '../components/orders/helpers';
import { ConfirmDialog, Pill, Segmented } from '../components/orders/shared';
import { Card, EmptyState, Loading, PageHeader, PhotoThumb } from '../components/ui';
import { dateFr, dateTimeFr, fcfa } from '../lib/format';

const STATUS_PILL: Record<FarmMarketListing['status'], { label: string; tone: string }> = {
  DRAFT: { label: 'Brouillon', tone: 'bg-slate-100 text-slate-600 ring-slate-200' },
  PUBLISHED: { label: 'Publiée', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  PAUSED: { label: 'Suspendue', tone: 'bg-amber-50 text-amber-700 ring-amber-200' },
  CLOSED: { label: 'Clôturée', tone: 'bg-slate-100 text-slate-500 ring-slate-200' },
};

function MoveDateModal({ farmId, listing, onClose }: { farmId: string; listing: FarmMarketListing; onClose: () => void }) {
  const client = useQueryClient();
  const [readyDate, setReadyDate] = useState(listing.readyDate ?? '');
  const move = useMutation({
    mutationFn: () => api.post(`/farms/${farmId}/market/listings/${listing.id}/move-date`, { readyDate }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['market-farm-listings', farmId] });
      void client.invalidateQueries({ queryKey: ['market-farm-orders', farmId] });
      invalidateOrderQueries(client, farmId);
      onClose();
    },
  });
  return (
    <Modal title="Déplacer la date" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          move.mutate();
        }}
      >
        <p className="text-sm text-slate-600">
          Les commandes en cours passent à la nouvelle date. Chaque acheteur le voit et peut annuler s’il ne peut plus attendre.
        </p>
        <Field label="Nouvelle date de disponibilité">
          <input type="date" min={addDaysIso(todayIso(), 1)} className={inputCls} value={readyDate} onChange={(e) => setReadyDate(e.target.value)} required />
        </Field>
        <ErrorNote error={move.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={move.isPending}>
            Retour
          </Button>
          <Button type="submit" busy={move.isPending}>
            Déplacer
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ListingsPanel({ farmId }: { farmId: string }) {
  const client = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<FarmMarketListing | null>(null);
  const [moving, setMoving] = useState<FarmMarketListing | null>(null);
  const [closing, setClosing] = useState<FarmMarketListing | null>(null);
  const query = useQuery({
    queryKey: ['market-farm-listings', farmId],
    queryFn: () => api.get<FarmMarketListing[]>(`/farms/${farmId}/market/listings`),
  });
  const action = useMutation({
    mutationFn: ({ id, verb }: { id: string; verb: 'publish' | 'pause' | 'close' }) =>
      api.post(`/farms/${farmId}/market/listings/${id}/${verb}`),
    onSuccess: () => {
      setClosing(null);
      void client.invalidateQueries({ queryKey: ['market-farm-listings', farmId] });
      void client.invalidateQueries({ queryKey: ['market-listings'] });
    },
  });
  const listings = query.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Nouvelle annonce
        </Button>
      </div>
      {query.isLoading ? <Loading /> : null}
      <ErrorNote error={query.error ?? (closing ? null : action.error)} />
      {!query.isLoading && !query.error && listings.length === 0 ? (
        <EmptyState message="Aucune annonce. Publiez votre stock, ou des oiseaux bientôt prêts en précommande." icon={<Store className="h-5 w-5" />} />
      ) : null}
      {listings.map((l) => {
        const status = STATUS_PILL[l.status];
        const open = l.status !== 'CLOSED';
        // A published listing that buyers can't see: the farm must know why.
        const hidden = l.status === 'PUBLISHED' && l.hiddenReason ? HIDDEN_REASON[l.hiddenReason] : null;
        return (
          <Card key={l.id} className="p-4 flex flex-wrap items-center gap-3">
            <PhotoThumb src={listingPhoto(l)} size="lg" />
            <div className="min-w-48 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-slate-900">{listingTitle(l)}</p>
                <Pill tone={status.tone}>{status.label}</Pill>
                {l.kind === 'PRE' ? <Pill tone="bg-sky-50 text-sky-700 ring-sky-200">Précommande</Pill> : null}
              </div>
              <p className="mt-0.5 text-sm text-slate-500">
                {l.batchName ? `${l.batchName} · ` : ''}
                {fcfa(l.unitPriceFcfa)} / {unitName(l.product)} · {l.availableQuantity} disponibles sur {l.quantityPublished}
                {l.readyDate ? ` · prêts le ${dateFr(l.readyDate)}` : ''}
                {l.depositPct ? ` · acompte ${l.depositPct} %` : ''}
              </p>
              {hidden ? (
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-orange-700">
                  <AlertTriangle className="h-3.5 w-3.5" /> {hidden}
                </p>
              ) : null}
            </div>
            {open ? (
              <div className="flex flex-wrap gap-1.5">
                {l.status === 'PUBLISHED' ? (
                  <Button tone="secondary" onClick={() => action.mutate({ id: l.id, verb: 'pause' })}>
                    <Pause className="h-4 w-4" /> Suspendre
                  </Button>
                ) : (
                  <Button onClick={() => action.mutate({ id: l.id, verb: 'publish' })}>
                    <Send className="h-4 w-4" /> Publier
                  </Button>
                )}
                <Button tone="secondary" onClick={() => setEditing(l)}>
                  <Pencil className="h-4 w-4" /> Modifier
                </Button>
                {l.kind === 'PRE' && l.status !== 'DRAFT' ? (
                  <Button tone="secondary" onClick={() => setMoving(l)}>
                    <CalendarClock className="h-4 w-4" /> Déplacer la date
                  </Button>
                ) : null}
                <Button tone="secondary" onClick={() => setClosing(l)}>
                  <X className="h-4 w-4" /> Clôturer
                </Button>
              </div>
            ) : null}
          </Card>
        );
      })}

      {creating ? <ListingFormModal farmId={farmId} onClose={() => setCreating(false)} /> : null}
      {editing ? <ListingFormModal farmId={farmId} listing={editing} onClose={() => setEditing(null)} /> : null}
      {moving ? <MoveDateModal farmId={farmId} listing={moving} onClose={() => setMoving(null)} /> : null}
      {closing ? (
        <ConfirmDialog
          title="Clôturer l’annonce ?"
          message={<p>Elle quitte le marché et ne pourra plus être republiée. Les commandes déjà acceptées restent en place.</p>}
          confirmLabel="Clôturer"
          busy={action.isPending}
          error={action.error}
          onConfirm={() => action.mutate({ id: closing.id, verb: 'close' })}
          onClose={() => setClosing(null)}
        />
      ) : null}
    </div>
  );
}

function RejectModal({ onSubmit, busy, error, onClose }: { onSubmit: (reason: string) => void; busy: boolean; error: unknown; onClose: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <Modal title="Refuser la demande" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Motif (facultatif)" hint="L’acheteur le verra.">
          <textarea className={inputCls} rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={busy}>
            Retour
          </Button>
          <Button tone="danger" busy={busy} onClick={() => onSubmit(reason.trim())}>
            Refuser
          </Button>
        </div>
      </div>
    </Modal>
  );
}

type RequestFilter = 'REQUESTED' | 'ACCEPTED' | 'OTHER';

function matchesFilter(state: MarketOrderState, filter: RequestFilter): boolean {
  if (filter === 'OTHER') return state !== 'REQUESTED' && state !== 'ACCEPTED';
  return state === filter;
}

function RequestsPanel({ farmId, orders, isLoading, error }: { farmId: string; orders: FarmMarketOrder[]; isLoading: boolean; error: unknown }) {
  const client = useQueryClient();
  const now = useNow();
  const [filter, setFilter] = useState<RequestFilter>('REQUESTED');
  const [accepting, setAccepting] = useState<FarmMarketOrder | null>(null);
  const [rejecting, setRejecting] = useState<FarmMarketOrder | null>(null);
  const [extending, setExtending] = useState<FarmMarketOrder | null>(null);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['market-farm-orders', farmId] });
    void client.invalidateQueries({ queryKey: ['market-farm-listings', farmId] });
    void client.invalidateQueries({ queryKey: ['market-listings'] });
    invalidateOrderQueries(client, farmId);
  };
  const base = `/farms/${farmId}/market/orders`;
  const accept = useMutation({
    mutationFn: (id: string) => api.post(`${base}/${id}/accept`),
    onSuccess: () => {
      setAccepting(null);
      refresh();
    },
    onError: refresh,
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post(`${base}/${id}/reject`, reason ? { reason } : {}),
    onSuccess: () => {
      setRejecting(null);
      refresh();
    },
    onError: refresh,
  });
  const extend = useMutation({
    mutationFn: (id: string) => api.post(`${base}/${id}/extend-deposit`),
    onSuccess: () => {
      setExtending(null);
      refresh();
    },
    onError: refresh,
  });

  const count = (f: RequestFilter) => orders.filter((o) => matchesFilter(o.state, f)).length;
  const rows = orders.filter((o) => matchesFilter(o.state, filter));

  return (
    <div className="space-y-3">
      <Segmented<RequestFilter>
        ariaLabel="Filtrer les demandes"
        value={filter}
        onChange={setFilter}
        options={[
          { key: 'REQUESTED', label: `À traiter (${count('REQUESTED')})` },
          { key: 'ACCEPTED', label: `Acceptées (${count('ACCEPTED')})` },
          { key: 'OTHER', label: `Autres (${count('OTHER')})` },
        ]}
      />
      {isLoading ? <Loading /> : null}
      <ErrorNote error={error} />
      {!isLoading && !error && rows.length === 0 ? <EmptyState message="Aucune demande ici." icon={<Store className="h-5 w-5" />} /> : null}
      {rows.map((o) => {
        const requestLeft = o.requestExpiresAt ? timeLeft(o.requestExpiresAt, now) : null;
        const depositLeft = o.depositDueAt ? timeLeft(o.depositDueAt, now) : null;
        return (
          <Card key={o.id} className="p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">
                  {o.buyer.organizationName ?? o.buyer.fullName}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    {buyerTypeLabel(o.buyer.type)}
                    {o.buyer.city ? ` · ${o.buyer.city}` : ''}
                  </span>
                </p>
                <p className="text-sm text-slate-600">
                  {o.quantity} {unitName(o.product, o.quantity)}
                  {o.batchName ? ` · ${o.batchName}` : ''} · {fcfa(o.totalFcfa)}
                  {o.fulfilment === 'DELIVERY' ? ` · livraison : ${o.address ?? ''}` : ' · retrait à la ferme'}
                </p>
                <p className="text-xs text-slate-500">
                  Demandé le {dateTimeFr(o.createdAt)}
                  {o.readyDate ? ` · prêts le ${dateFr(o.readyDate)}` : ''}
                  {o.desiredDate ? ` · souhaité le ${dateFr(o.desiredDate)}` : ''}
                  {o.contactPhone ? ` · ${o.contactPhone}` : ''}
                </p>
                {o.note ? <p className="mt-1 text-sm italic text-slate-600">« {o.note} »</p> : null}
              </div>
              <MarketStatusBadge status={o.status} />
            </div>

            {o.oversold ? (
              <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Stock insuffisant : il y a moins d’oiseaux que ce qui a été accepté. Prévenez
                l’acheteur, vous pourrez livrer moins.
              </p>
            ) : null}
            {o.cancelRequestedAt ? (
              <p className="flex items-start gap-2 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800 ring-1 ring-orange-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> L’acheteur demande l’annulation. Convenez du remboursement avec lui, puis annulez
                depuis la commande.
              </p>
            ) : null}
            {o.status === 'AWAITING_DEPOSIT' ? (
              <p className="text-sm text-orange-800">
                Acompte attendu : <b>{fcfa(o.depositRequiredFcfa)}</b>
                {depositLeft ? `, reste ${depositLeft}.` : ', délai dépassé : annulation automatique imminente.'} Enregistrez-le depuis la commande dès
                réception.
              </p>
            ) : null}
            {o.depositShortFcfa > 0 ? (
              <p className="text-sm text-orange-800">Acompte partiel : il manque {fcfa(o.depositShortFcfa)}. La commande ne sera pas annulée automatiquement.</p>
            ) : null}
            {o.state === 'REQUESTED' && requestLeft ? <p className="text-xs text-slate-500">Sans réponse d’ici {requestLeft}, la demande expire.</p> : null}

            <div className="flex flex-wrap gap-1.5">
              {o.state === 'REQUESTED' ? (
                <>
                  <Button onClick={() => setAccepting(o)}>
                    <Check className="h-4 w-4" /> Accepter
                  </Button>
                  <Button tone="secondary" onClick={() => setRejecting(o)}>
                    <X className="h-4 w-4" /> Refuser
                  </Button>
                </>
              ) : null}
              {o.status === 'AWAITING_DEPOSIT' && !o.depositExtendedAt ? (
                <Button tone="secondary" onClick={() => setExtending(o)}>
                  <CalendarClock className="h-4 w-4" /> Prolonger de 24 h
                </Button>
              ) : null}
              {o.orderId ? (
                <Link
                  to={`/app/orders?commande=${o.orderId}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <ExternalLink className="h-4 w-4" /> Ouvrir la commande {o.orderReference ?? ''}
                </Link>
              ) : null}
            </div>
          </Card>
        );
      })}

      {accepting ? (
        <ConfirmDialog
          title="Accepter la demande ?"
          tone="primary"
          message={
            <>
              <p>
                Une commande de {accepting.quantity} {unitName(accepting.product, accepting.quantity)} ({fcfa(accepting.totalFcfa)}) est créée et le
                stock est réservé.
              </p>
              {accepting.depositRequiredFcfa > 0 ? (
                <p>L’acheteur aura 24 h pour vous remettre {fcfa(accepting.depositRequiredFcfa)} d’acompte, puis la commande sera annulée automatiquement.</p>
              ) : null}
            </>
          }
          confirmLabel="Accepter"
          busy={accept.isPending}
          error={accept.error}
          onConfirm={() => accept.mutate(accepting.id)}
          onClose={() => {
            accept.reset();
            setAccepting(null);
          }}
        />
      ) : null}
      {rejecting ? (
        <RejectModal
          busy={reject.isPending}
          error={reject.error}
          onSubmit={(reason) => reject.mutate({ id: rejecting.id, reason })}
          onClose={() => {
            reject.reset();
            setRejecting(null);
          }}
        />
      ) : null}
      {extending ? (
        <ConfirmDialog
          title="Prolonger le délai de 24 h ?"
          tone="primary"
          message={<p>Possible une seule fois par commande, si l’acheteur a besoin de plus de temps ou a déjà payé.</p>}
          confirmLabel="Prolonger"
          busy={extend.isPending}
          error={extend.error}
          onConfirm={() => extend.mutate(extending.id)}
          onClose={() => {
            extend.reset();
            setExtending(null);
          }}
        />
      ) : null}
    </div>
  );
}

type Tab = 'listings' | 'requests';

/** The farm's side of the Market: what it publishes and what buyers ask for. */
export function MarketFarmPage() {
  const { farmId, farm } = useFarm();
  const { hasPermission } = useFarmProfile();
  const canPublish = hasPermission('market:publier');
  const canAnswer = hasPermission('vente:commande');
  const [picked, setPicked] = useState<Tab | null>(null);
  const tab: Tab = picked ?? (canPublish ? 'listings' : 'requests');

  const ordersQuery = useQuery({
    queryKey: ['market-farm-orders', farmId],
    queryFn: () => api.get<FarmMarketOrder[]>(`/farms/${farmId}/market/orders`),
    enabled: !!farmId && canAnswer,
  });
  const orders = ordersQuery.data ?? [];
  const toAnswer = orders.filter((o) => o.state === 'REQUESTED').length;

  return (
    <div>
      <PageHeader
        title="Marché"
        subtitle="Publiez votre stock et vos précommandes, répondez aux acheteurs."
        icon={<Store className="h-5 w-5" />}
        actions={
          <Link to="/marche" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800">
            <ExternalLink className="h-4 w-4" /> Voir le marché
          </Link>
        }
      />
      {farm && !farm.isVerified ? (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Votre ferme n’est pas encore vérifiée. Vous pouvez préparer vos annonces, mais seules les fermes vérifiées peuvent publier. Contactez Fermia.
        </p>
      ) : null}
      {canPublish && canAnswer ? (
        <div className="mb-4">
          <Segmented<Tab>
            ariaLabel="Section du marché"
            value={tab}
            onChange={setPicked}
            options={[
              { key: 'listings', label: 'Mes annonces' },
              { key: 'requests', label: toAnswer > 0 ? `Demandes (${toAnswer})` : 'Demandes' },
            ]}
          />
        </div>
      ) : null}
      {!farmId ? null : tab === 'listings' && canPublish ? (
        <ListingsPanel farmId={farmId} />
      ) : canAnswer ? (
        <RequestsPanel farmId={farmId} orders={orders} isLoading={ordersQuery.isLoading} error={ordersQuery.error} />
      ) : null}
    </div>
  );
}

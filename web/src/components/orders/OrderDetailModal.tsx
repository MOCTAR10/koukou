import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Layers, MapPin, Package, Printer, Ticket, Truck, UserRound, Wallet, X, XCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { api } from '../../api/client';
import type { Order, PointOfSale } from '../../api/types-orders';
import { useFarm } from '../../app/FarmContext';
import { useFarmProfile } from '../../app/useFarmProfile';
import { dateFr, fcfa, num } from '../../lib/format';
import { Button, ErrorNote, Field, Modal, inputCls } from '../form';
import { IconTile, Loading, Td, Th } from '../ui';
import { ORDER_CANAL_LABEL, PRODUCT_LABEL, UNIT_LABEL, invalidateOrderQueries, newIdempotencyKey, parseWhole } from './helpers';
import { QUEUED_MESSAGE, sendOrQueue } from '../../offline';
import { PassportCard } from './PassportCard';
import { ConfirmDialog, OrderStatusBadge } from './shared';

function Info({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs font-medium text-slate-500 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0 [&>svg]:text-slate-400">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-800">{children}</dd>
    </div>
  );
}

function DepositModal({ order, onClose, onQueued }: { order: Order; onClose: () => void; onQueued: () => void }) {
  const { farmId } = useFarm();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  // Kept across retries: a repeated submit can't take the money twice.
  const [idempotencyKey] = useState(() => newIdempotencyKey('deposit'));
  const remaining = Math.max(order.totalAmountFcfa - order.depositFcfa, 0);
  const pending = order.status === 'PENDING';

  const pay = useMutation({
    mutationFn: () =>
      sendOrQueue({
        kind: 'order-payment',
        farmId: farmId!,
        path: `/farms/${farmId}/orders/${order.id}/deposit`,
        body: { amountFcfa: amount, idempotencyKey },
        label: `Paiement · ${order.referenceNumber}`,
        cashFcfa: amount,
      }),
    onSuccess: (res) => {
      if (res.status === 'queued') onQueued();
      else invalidateOrderQueries(queryClient, farmId);
      onClose();
    },
  });

  const quick = [Math.round(remaining / 2 / 100) * 100, remaining].filter((v, i, all) => v > 0 && all.indexOf(v) === i);

  return (
    <Modal title={pending ? 'Encaisser un acompte' : 'Encaisser un paiement'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (amount <= 0 || amount > remaining) {
            setLocalError(`Le montant doit être compris entre 1 et ${fcfa(remaining)}.`);
            return;
          }
          setLocalError(null);
          pay.mutate();
        }}
      >
        <p className="text-sm text-slate-600">
          Reste dû : <b className="text-slate-900">{fcfa(remaining)}</b>
        </p>
        <Field label="Montant reçu (FCFA)">
          <input
            autoFocus
            inputMode="numeric"
            value={amount > 0 ? String(amount) : ''}
            onChange={(e) => setAmount(parseWhole(e.target.value))}
            placeholder="0"
            className={inputCls}
          />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {quick.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setAmount(v)}
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              {fcfa(v)}
            </button>
          ))}
        </div>
        <p className="flex justify-between text-sm text-slate-600">
          <span>Reste dû après paiement</span>
          <b className="text-slate-900">{fcfa(Math.max(remaining - amount, 0))}</b>
        </p>
        <ErrorNote error={localError ?? pay.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={pay.isPending}>
            Fermer
          </Button>
          <Button type="submit" busy={pay.isPending} disabled={amount <= 0}>
            {pay.isPending ? null : <Wallet className="h-4 w-4" />}
            Encaisser {fcfa(amount)}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

type Dialog = 'deposit' | 'deliver' | 'cancel' | null;

export function OrderDetailModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { farmId } = useFarm();
  const { hasPermission } = useFarmProfile();
  const canCollect = hasPermission('vente:commande', 'vente:creer');
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const orderQuery = useQuery({
    queryKey: ['order', farmId, orderId],
    queryFn: () => api.get<Order>(`/farms/${farmId}/orders/${orderId}`),
    enabled: !!farmId,
  });
  const order = orderQuery.data;

  const pdvQuery = useQuery({
    queryKey: ['points-of-sale', farmId],
    queryFn: () => api.get<PointOfSale[]>(`/farms/${farmId}/points-of-sale`),
    enabled: !!farmId && !!order?.pointOfSaleId,
  });

  const deliver = useMutation({
    mutationFn: () =>
      sendOrQueue({
        kind: 'order-deliver',
        farmId: farmId!,
        path: `/farms/${farmId}/orders/${orderId}/livrer`,
        body: {},
        label: `Livraison · ${order?.referenceNumber ?? 'commande'}`,
      }),
    onSuccess: (res) => {
      setDialog(null);
      if (res.status === 'queued') {
        setNotice(QUEUED_MESSAGE);
        return;
      }
      invalidateOrderQueries(queryClient, farmId);
      setNotice('Commande livrée : cheptel mis à jour et bon de commande généré.');
    },
  });
  const cancel = useMutation({
    mutationFn: () =>
      sendOrQueue({
        kind: 'order-cancel',
        farmId: farmId!,
        method: 'DELETE',
        path: `/farms/${farmId}/orders/${orderId}?reason=${encodeURIComponent('Annulée sur demande de la ferme')}`,
        label: `Annulation · ${order?.referenceNumber ?? 'commande'}`,
      }),
    onSuccess: (res) => {
      setDialog(null);
      if (res.status === 'queued') setNotice(QUEUED_MESSAGE);
      else invalidateOrderQueries(queryClient, farmId);
    },
  });
  const pdf = useMutation({
    mutationFn: () => api.download(`/farms/${farmId}/orders/${orderId}/bon-de-commande`, `${order?.referenceNumber ?? orderId}.pdf`),
  });

  const closeDialog = () => {
    setDialog(null);
    deliver.reset();
    cancel.reset();
  };

  // Escape must close the top dialog only, not this window underneath it.
  const closeSelf = () => {
    if (!dialog) onClose();
  };

  if (!order) {
    return (
      <Modal title="Commande" onClose={onClose} wide side>
        {orderQuery.isError ? <ErrorNote error={orderQuery.error} /> : <Loading label="Chargement de la commande…" />}
      </Modal>
    );
  }

  const remaining = Math.max(order.totalAmountFcfa - order.depositFcfa, 0);
  const payRate = order.totalAmountFcfa > 0 ? Math.min(1, order.depositFcfa / order.totalAmountFcfa) : 0;
  const payPercent = Math.round(payRate * 100);
  const isOpen = order.status === 'PENDING' || order.status === 'CONFIRMED';
  const pdv = (pdvQuery.data ?? []).find((p) => p.id === order.pointOfSaleId);
  const place = pdv ? `${pdv.name} (point de vente)` : (order.address ?? 'À la ferme');

  return (
    <Modal title={`Commande ${order.referenceNumber}`} onClose={closeSelf} wide side>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <IconTile icon={<UserRound />} />
            <div className="min-w-0">
              <p className="text-lg font-semibold text-slate-900">{order.customer?.fullName ?? 'Client non renseigné'}</p>
              <p className="text-sm text-slate-500">{order.customer?.phone ?? 'Sans téléphone'}</p>
            </div>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        <dl className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 md:grid-cols-3">
          <Info label="Canal" icon={<Ticket />}>{ORDER_CANAL_LABEL[order.canal] ?? order.canal}</Info>
          <Info label={order.canal === 'LIVRAISON' || (order.source === 'MARKET' && order.address) ? 'Livraison' : 'Retrait'} icon={<Truck />}>{place}</Info>
          <Info label="Lot" icon={<Layers />}>{order.batch?.batchName ?? 'Œufs (stock)'}</Info>
          <Info label="Prévu le" icon={<CalendarDays />}>{order.expectedDate ? dateFr(order.expectedDate) : 'À convenir'}</Info>
          <Info label="Créée le" icon={<CalendarDays />}>{dateFr(order.createdAt)}</Info>
          {order.deliveryProvince ? <Info label="Province" icon={<MapPin />}>{order.deliveryProvince}</Info> : null}
          {order.cancelledReason ? <Info label="Motif d’annulation" icon={<X />}>{order.cancelledReason}</Info> : null}
        </dl>

        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Package className="h-4 w-4 text-brand-600" /> Articles
          </h3>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <Th>Article</Th>
                  <Th className="text-right">Quantité</Th>
                  <Th className="text-right">Prix unitaire</Th>
                  <Th className="text-right">Montant</Th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((i) => (
                  <tr key={i.saleItemId || `${i.productType}-${i.label}-${i.quantity}`} className="border-t border-slate-100">
                    <Td className="font-medium">{i.label || PRODUCT_LABEL[i.productType] || 'Article'}</Td>
                    <Td className="text-right tabular-nums">
                      {num(i.quantity, 2)} {UNIT_LABEL[i.unit] ?? i.unit}
                      {i.unit === 'KG' && i.pieceCount ? ` (${num(i.pieceCount, 0)} oiseaux)` : ''}
                    </Td>
                    <Td className="text-right tabular-nums">{fcfa(i.unitPriceFcfa)}</Td>
                    <Td className="text-right font-medium tabular-nums">{fcfa(i.amountFcfa)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ml-auto mt-3 max-w-xs space-y-1 text-sm">
            <p className="flex justify-between">
              <span className="text-slate-500">Total</span>
              <b className="text-slate-900">{fcfa(order.totalAmountFcfa)}</b>
            </p>
            <p className="flex justify-between">
              <span className="text-slate-500">Acomptes versés</span>
              <span className="font-medium text-slate-800">{fcfa(order.depositFcfa)}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-slate-500">Reste dû</span>
              <b className={remaining > 0 ? 'text-brand-700' : 'text-emerald-600'}>{fcfa(remaining)}</b>
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={remaining === 0 ? 'h-full bg-emerald-500' : 'h-full bg-amber-400'}
                style={{ width: `${payPercent}%` }}
              />
            </div>
            <p className="text-xs text-slate-500">
              {payPercent} % versé{order.depositFcfa > 0 ? '' : ' · aucun acompte'}
            </p>
          </div>
        </section>

        {order.passport ? <PassportCard passport={order.passport} /> : null}

        {notice ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-200">{notice}</p> : null}
        <ErrorNote error={pdf.error} />

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          {isOpen && hasPermission('vente:commande') ? (
            <Button tone="danger" onClick={() => setDialog('cancel')}>
              <XCircle className="h-4 w-4" /> Annuler la commande
            </Button>
          ) : null}
          {order.status === 'LIVRE' ? (
            <Button tone="secondary" busy={pdf.isPending} onClick={() => pdf.mutate()}>
              <Printer className="h-4 w-4" /> Télécharger le bon de commande
            </Button>
          ) : null}
          {isOpen && remaining > 0 && canCollect ? (
            <Button tone="secondary" onClick={() => setDialog('deposit')}>
              <Wallet className="h-4 w-4" /> {order.status === 'PENDING' ? 'Encaisser un acompte' : 'Encaisser un paiement'}
            </Button>
          ) : null}
          {isOpen && canCollect ? (
            <Button onClick={() => setDialog('deliver')}>
              <Truck className="h-4 w-4" /> Livrer · reste {fcfa(remaining)}
            </Button>
          ) : null}
        </div>
      </div>

      {dialog === 'deposit' ? <DepositModal order={order} onClose={closeDialog} onQueued={() => setNotice(QUEUED_MESSAGE)} /> : null}
      {dialog === 'deliver' ? (
        <ConfirmDialog
          title="Livrer la commande"
          tone="primary"
          confirmLabel="Livrer"
          confirmIcon={<Truck className="h-4 w-4" />}
          busy={deliver.isPending}
          error={deliver.error}
          onConfirm={() => deliver.mutate()}
          onClose={closeDialog}
          message={
            <>
              <p>Le cheptel sera décrémenté et le bon de commande PDF généré.</p>
              {remaining > 0 ? (
                <p>
                  Reste dû : <b>{fcfa(remaining)}</b>. Si le client paie maintenant, encaissez d’abord ; sinon le solde
                  restera à régler sur sa fiche client.
                </p>
              ) : null}
            </>
          }
        />
      ) : null}
      {dialog === 'cancel' ? (
        <ConfirmDialog
          title="Annuler la commande"
          confirmLabel="Annuler la commande"
          confirmIcon={<XCircle className="h-4 w-4" />}
          busy={cancel.isPending}
          error={cancel.error}
          onConfirm={() => cancel.mutate()}
          onClose={closeDialog}
          message={
            <>
              <p>{order.referenceNumber} sera passée « Annulée ». Les oiseaux réservés redeviennent disponibles.</p>
              {order.depositFcfa > 0 ? (
                <p>
                  L’acompte de <b>{fcfa(order.depositFcfa)}</b> sera remboursé depuis la caisse.
                </p>
              ) : null}
            </>
          }
        />
      ) : null}
    </Modal>
  );
}

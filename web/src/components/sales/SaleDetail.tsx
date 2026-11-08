import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { api } from '../../api/client';
import { useFarmProfile } from '../../app/useFarmProfile';
import type { SaleFull } from '../../api/types-sales';
import { Button, ErrorNote, Field, inputCls, Modal } from '../form';
import { StatusBadge } from '../ui';
import { dateFr, fcfa, num, statusLabel } from '../../lib/format';
import { customerTypeLabel, productTypeLabel, unitLabel } from './labels';
import { invalidateCash } from './pos';
import { ReceiptButton } from './shared';

export function salePaid(sale: Pick<SaleFull, 'payments'>): number {
  return sale.payments.filter((p) => p.status === 'CONFIRMED').reduce((x, p) => x + p.amountFcfa, 0);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{value}</span>
    </div>
  );
}

/** Receipt preview with the PDF, and the cancellation (reason + confirmation). */
export function SaleDetail({
  farmId,
  sale,
  posName,
  onClose,
}: {
  farmId: string | null;
  sale: SaleFull;
  posName?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { hasPermission } = useFarmProfile();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const paid = salePaid(sale);
  const cancellable = sale.status === 'SETTLED' || sale.status === 'OUTSTANDING';

  const cancel = useMutation({
    mutationFn: () => {
      const qs = reason.trim() ? `?reason=${encodeURIComponent(reason.trim())}` : '';
      return api.del(`/farms/${farmId}/sales/${sale.id}${qs}`);
    },
    onSuccess: () => {
      invalidateCash(queryClient, farmId);
      onClose();
    },
  });

  return (
    <Modal title={`Reçu ${sale.referenceNumber}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Row label="Date" value={dateFr(sale.saleDate)} />
          <Row label="Client" value={sale.customer?.fullName ?? 'Client comptoir'} />
          {sale.customer ? (
            <Row label="Fiche" value={[sale.customer.code, customerTypeLabel(sale.customer.type)].filter(Boolean).join(' · ')} />
          ) : null}
          {posName ? <Row label="Point de vente" value={posName} /> : null}
          <div className="flex justify-between gap-4 text-sm">
            <span className="text-slate-500">Statut</span>
            <StatusBadge status={sale.status} />
          </div>
        </div>

        <ul className="divide-y divide-slate-100 border-y border-slate-100">
          {sale.items.map((it) => (
            <li key={it.id} className="flex items-start justify-between gap-4 py-2 text-sm">
              <div>
                <p className="font-medium text-slate-800">{it.label || productTypeLabel(it.productType)}</p>
                <p className="text-xs text-slate-500">
                  {num(it.quantity, 2)} {unitLabel(it.unit)} × {fcfa(it.unitPriceFcfa)}
                  {it.pieceCount && it.unit === 'KG' ? ` · ${num(it.pieceCount)} oiseau(x)` : ''}
                </p>
              </div>
              <span className="font-medium tabular-nums text-slate-800">{fcfa(it.amountFcfa)}</span>
            </li>
          ))}
        </ul>

        <div className="space-y-1.5">
          {sale.discountAmountFcfa > 0 ? <Row label="Remise" value={`− ${fcfa(sale.discountAmountFcfa)}`} /> : null}
          <Row label="Total" value={fcfa(sale.totalAmountFcfa)} />
          <Row label="Payé" value={fcfa(paid)} />
          {sale.status === 'OUTSTANDING' ? <Row label="Reste dû" value={fcfa(Math.max(sale.totalAmountFcfa - paid, 0))} /> : null}
          {sale.payments.map((p) => (
            <p key={p.id} className="text-xs text-slate-500">
              {statusLabel(p.method)} · {fcfa(p.amountFcfa)} · {dateFr(p.paymentDate)} · {statusLabel(p.status)}
            </p>
          ))}
          {sale.cancelledReason ? <Row label="Motif d’annulation" value={sale.cancelledReason} /> : null}
        </div>

        {confirming ? (
          <div className="space-y-3 rounded-xl bg-red-50 p-3 ring-1 ring-red-200">
            <p className="text-sm text-red-800">
              Annuler cette vente réintègre le stock
              {paid > 0 ? ` et rembourse ${fcfa(paid)} depuis la caisse (elle doit être ouverte et suffisamment approvisionnée).` : '. Aucun remboursement en caisse.'}
            </p>
            <Field label="Motif (facultatif)">
              <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. erreur de saisie" />
            </Field>
            <ErrorNote error={cancel.error} />
            <div className="flex justify-end gap-2">
              <Button tone="secondary" disabled={cancel.isPending} onClick={() => setConfirming(false)}>
                Garder la vente
              </Button>
              <Button tone="danger" busy={cancel.isPending} onClick={() => cancel.mutate()}>
                {cancel.isPending ? null : <RotateCcw className="h-4 w-4" />}
                Confirmer l’annulation
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-end gap-2">
            {cancellable && hasPermission('vente:annuler') ? (
              <Button tone="secondary" onClick={() => setConfirming(true)}>
                <RotateCcw className="h-4 w-4" /> Annuler la vente
              </Button>
            ) : null}
            <ReceiptButton farmId={farmId} saleId={sale.id} reference={sale.referenceNumber} />
          </div>
        )}
      </div>
    </Modal>
  );
}

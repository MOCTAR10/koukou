import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PackageCheck } from 'lucide-react';
import type { ConfirmResult, DeliveryView, OpenBandHint } from '../../api/types-supply';
import { sendOrQueue, showQueuedNotice } from '../../offline';
import { Note } from '../flock/shared';
import { Button, ErrorNote, Field, inlineInputCls, inputCls, Modal, todayIso, DateInput } from '../form';
import { DataTable, Td, Th } from '../ui';
import { buildConfirmPayload, draftDiffers, initialConfirmDrafts, type ConfirmLineDraft } from './confirmRules';
import { lineQuantityLabel } from './deliveryRules';
import { invalidateFarmSupply } from './queries';

/**
 * The farmer confirms what he really received (`POST
 * /farms/:farmId/input-deliveries/:id/confirm`). Works offline: the write is
 * queued with the op id as idempotency key (a replay answers `replay: true`).
 */
export function ConfirmDeliveryModal({
  farmId,
  delivery,
  onClose,
  onConfirmed,
}: {
  farmId: string;
  delivery: DeliveryView;
  onClose: () => void;
  /** Called with the server's band hint after a live confirmation of chicks without a band. */
  onConfirmed: (hint: OpenBandHint | null) => void;
}) {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<ConfirmLineDraft[]>(() => initialConfirmDrafts(delivery));
  const [receivedDate, setReceivedDate] = useState(todayIso());
  const [errors, setErrors] = useState<string[]>([]);

  const setDraft = (lineId: string, patch: Partial<ConfirmLineDraft>) =>
    setDrafts((ds) => ds.map((d) => (d.lineId === lineId ? { ...d, ...patch } : d)));

  const confirm = useMutation({
    mutationFn: (body: object) =>
      sendOrQueue<ConfirmResult>({
        kind: 'delivery-confirm',
        farmId,
        path: `/farms/${farmId}/input-deliveries/${delivery.id}/confirm`,
        body,
        label: `Réception · ${delivery.code}`,
      }),
    onSuccess: (res) => {
      if (res.status === 'queued') {
        showQueuedNotice();
        onClose();
        return;
      }
      invalidateFarmSupply(qc, farmId);
      onConfirmed(res.data.openBandHint ?? null);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const res = buildConfirmPayload(delivery, drafts, receivedDate, todayIso());
    setErrors(res.errors);
    if (res.payload) confirm.mutate(res.payload);
  };

  return (
    <Modal title={`Réception de la livraison ${delivery.code}`} onClose={onClose} large>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">
          Indiquez ce qui est réellement arrivé. Une ligne différente de l’expédié demande un motif (sacs déchirés, poussins morts au
          transport…). Chaque ligne reçue entre dans votre stock ; seul le coût après subvention devient une dépense.
        </p>
        <Field label="Date de réception *" className="max-w-xs">
          <DateInput className={inputCls} value={receivedDate} min={delivery.shippedAt.slice(0, 10)} max={todayIso()} onChange={(e) => setReceivedDate(e.target.value)} />
        </Field>
        <DataTable>
          <thead>
            <tr>
              <Th>Intrant</Th>
              <Th>Expédié</Th>
              <Th>Reçu *</Th>
              <Th>Motif de l’écart</Th>
              <Th>N° de lot lu</Th>
              <Th>Péremption</Th>
            </tr>
          </thead>
          <tbody>
            {delivery.lines.map((l) => {
              const d = drafts.find((x) => x.lineId === l.id)!;
              const differs = draftDiffers(l, d);
              return (
                <tr key={l.id}>
                  <Td className="font-medium">{l.intrantLabel ?? l.intrantCode}</Td>
                  <Td label="Expédié" className="whitespace-nowrap tabular-nums">
                    {lineQuantityLabel(l.quantity, l)}
                  </Td>
                  <Td label="Reçu *">
                    <input
                      aria-label={`Reçu : ${l.intrantLabel ?? l.intrantCode}`}
                      className={`${inlineInputCls} w-full md:w-28`}
                      inputMode="decimal"
                      value={d.received}
                      onChange={(e) => setDraft(l.id, { received: e.target.value })}
                    />
                  </Td>
                  <Td label="Motif de l’écart">
                    {differs ? (
                      <input
                        aria-label={`Motif de l’écart : ${l.intrantLabel ?? l.intrantCode}`}
                        className={inputCls}
                        value={d.reason}
                        placeholder="Obligatoire"
                        onChange={(e) => setDraft(l.id, { reason: e.target.value })}
                      />
                    ) : (
                      <span className="text-xs text-slate-400">Conforme</span>
                    )}
                  </Td>
                  <Td label="N° de lot lu">
                    <input
                      aria-label={`Numéro de lot : ${l.intrantLabel ?? l.intrantCode}`}
                      className={inputCls}
                      value={d.supplierLotNumber}
                      onChange={(e) => setDraft(l.id, { supplierLotNumber: e.target.value })}
                    />
                  </Td>
                  <Td label="Péremption">
                    <DateInput
                      aria-label={`Péremption : ${l.intrantLabel ?? l.intrantCode}`}
                      className={inputCls}
                      
                      value={d.expirationDate}
                      onChange={(e) => setDraft(l.id, { expirationDate: e.target.value })}
                    />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
        {delivery.lines.some((l) => l.intrantFamily === 'POUSSIN') && !delivery.band ? (
          <Note tone="brand">Après la confirmation des poussins, Fermia vous propose d’ouvrir leur bande (sans prix du poussin : il est déjà en dépense).</Note>
        ) : null}
        {errors.length > 0 ? <ErrorNote error={errors.join(' ')} /> : null}
        <ErrorNote error={confirm.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" busy={confirm.isPending}>
            <PackageCheck className="h-4 w-4" /> Confirmer la réception
          </Button>
        </div>
      </form>
    </Modal>
  );
}

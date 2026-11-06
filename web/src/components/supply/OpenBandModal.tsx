import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bird, Link2 } from 'lucide-react';
import { api } from '../../api/client';
import type { DeliveryView, OpenBandHint } from '../../api/types-supply';
import { CreateLotModal } from '../flock/CreateLotModal';
import { Note, lotName, useLots } from '../flock/shared';
import { Button, ErrorNote, Field, inputCls, Modal } from '../form';
import { invalidateFarmSupply } from './queries';

/**
 * After a chick delivery without band (`openBandHint`): open the band
 * pre-filled (no chick price: the cost is already an expense), then link it
 * (`PUT …/input-deliveries/:id/band`), or link a band already open. No band is
 * ever opened automatically.
 */
export function OpenBandModal({
  farmId,
  hint,
  canOpen,
  onClose,
}: {
  farmId: string;
  hint: OpenBandHint;
  /** `production:gerer`: may open a band; otherwise only the link to an open band is offered. */
  canOpen: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const lots = useLots();
  const open = (lots.data ?? []).filter((l) => l.status !== 'CLOTURE');
  const [creating, setCreating] = useState(false);
  const [bandId, setBandId] = useState('');

  const attach = useMutation({
    mutationFn: (id: string) => api.put<DeliveryView>(`/farms/${farmId}/input-deliveries/${hint.deliveryId}/band`, { bandId: id }),
    onSuccess: () => {
      invalidateFarmSupply(qc, farmId);
      onClose();
    },
  });

  if (creating) {
    return (
      <CreateLotModal
        prefill={{
          quantityAtStart: hint.quantityAtStart,
          integrationDate: hint.integrationDate,
          couvoirSupplier: hint.couvoirSupplier,
          chickLotNumber: hint.chickLotNumber,
          note: `Bande des ${hint.quantityAtStart} poussins reçus : elle sera rattachée à la livraison à l’enregistrement.`,
        }}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          attach.mutate(id);
        }}
      />
    );
  }

  return (
    <Modal title="Ouvrir la bande des poussins reçus" onClose={onClose}>
      <div className="space-y-4">
        <Note tone="brand">{hint.message}</Note>
        {canOpen ? (
          <Button onClick={() => setCreating(true)} className="w-full">
            <Bird className="h-4 w-4" /> Ouvrir une nouvelle bande
          </Button>
        ) : (
          <p className="text-sm text-slate-500">L’ouverture d’une bande demande le droit « production:gerer » : demandez-la au propriétaire.</p>
        )}
        {open.length > 0 ? (
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <Field label="Ou rattacher à une bande en cours">
              <select className={inputCls} value={bandId} onChange={(e) => setBandId(e.target.value)}>
                <option value="">Choisir une bande…</option>
                {open.map((l) => (
                  <option key={l.id} value={l.id}>
                    {lotName(l)} · {l.quantityAlive} sujets
                  </option>
                ))}
              </select>
            </Field>
            <Button tone="secondary" disabled={!bandId} busy={attach.isPending} onClick={() => attach.mutate(bandId)}>
              <Link2 className="h-4 w-4" /> Rattacher
            </Button>
          </div>
        ) : null}
        <ErrorNote error={attach.error} />
        <div className="flex justify-end">
          <Button tone="secondary" onClick={onClose}>
            Plus tard
          </Button>
        </div>
      </div>
    </Modal>
  );
}

import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Bird, Calendar, Check } from 'lucide-react';
import type { ProphylaxisEvent } from '../../api/types-flock';
import { useFarm } from '../../app/FarmContext';
import { useIdempotencyKey } from '../../lib/idempotency';
import { dateFr } from '../../lib/format';
import { sendOrQueue, showQueuedNotice } from '../../offline';
import type { SanitaryLotRef } from '../surveillance/sanitaryLot';
import { Button, ErrorNote, Field, Modal, inputCls } from '../form';
import { CARE_TYPE_LABEL, IconField, localYmd, useInvalidateFarm } from './shared';
import { completionBody } from './sanitaryRecords';

const QUEUED_COMPLETION_MESSAGE = 'Soin réalisé enregistré hors ligne : il sera envoyé au retour de la connexion.';

/**
 * Marks a planned care done (CDC n° 22: date, vaccine, route, number of
 * animals). Goes through the offline queue: the same key on a retry or a
 * replay returns the care the server already completed.
 */
export function CompleteCareModal({ lot, event, onClose }: { lot: SanitaryLotRef; event: ProphylaxisEvent; onClose: () => void }) {
  const { farmId } = useFarm();
  const invalidate = useInvalidateFarm();
  const idempotency = useIdempotencyKey('care');
  const [completedAt, setCompletedAt] = useState(localYmd());
  const [animalCount, setAnimalCount] = useState(lot.liveCount > 0 ? String(lot.liveCount) : '');
  const [route, setRoute] = useState(event.route ?? '');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const today = localYmd();

  const save = useMutation({
    mutationFn: async () => {
      const built = completionBody({ completedAt, animalCount, route, notes }, event.route);
      if (!built.ok) throw new Error(built.error);
      const body = { ...built.body, idempotencyKey: idempotency.keyFor({ ...built.body, event: event.id }) };
      return sendOrQueue({
        kind: 'prophylaxis-complete',
        farmId: farmId!,
        path: `/farms/${farmId}/batches/${lot.id}/prophylaxis/${event.id}/complete`,
        body,
        label: `Soin réalisé : ${event.name} · ${lot.batchName ?? lot.code ?? 'Lot'}`,
      });
    },
    onSuccess: async (res) => {
      idempotency.settle();
      if (res.status === 'queued') showQueuedNotice(QUEUED_COMPLETION_MESSAGE);
      else await invalidate();
      onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const built = completionBody({ completedAt, animalCount, route, notes }, event.route);
    setFormError(built.ok ? null : built.error);
    if (built.ok) save.mutate();
  };

  return (
    <Modal title="Soin réalisé" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-600">
          <span className="font-medium text-slate-800">{event.name}</span> · {CARE_TYPE_LABEL[event.careType]} · prévu le {dateFr(event.scheduledDate)}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <IconField label="Date de réalisation *" icon={<Calendar />}>
            <input className={inputCls} type="date" max={today} value={completedAt} onChange={(e) => setCompletedAt(e.target.value)} required />
          </IconField>
          <IconField label="Nombre d'animaux *" icon={<Bird />}>
            <input
              className={inputCls}
              inputMode="numeric"
              value={animalCount}
              onChange={(e) => setAnimalCount(e.target.value.replace(/\D/g, ''))}
              required
            />
          </IconField>
        </div>
        <Field label="Voie d'administration" hint={event.route ? `Prévue : ${event.route}` : undefined}>
          <input className={inputCls} value={route} onChange={(e) => setRoute(e.target.value)} />
        </Field>
        <Field label="Remarques (lot du vaccin, réaction…)">
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <ErrorNote error={formError ?? save.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Fermer
          </Button>
          <Button type="submit" busy={save.isPending}>
            <Check className="h-4 w-4" /> Enregistrer
          </Button>
        </div>
      </form>
    </Modal>
  );
}

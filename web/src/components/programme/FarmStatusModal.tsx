import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/client';
import type { Farm } from '../../api/types';
import type { RefItem } from '../../api/types-programme';
import { dateFr } from '../../lib/format';
import { Button, ErrorNote, Field, inputCls, Modal, todayIso } from '../form';
import { buildStatusPayload, needsReason, statusChoices } from './farmStatus';

/** Farm statuses of the programme (STATUT_FERME), shared by every status screen. */
export function useFarmStatusItems() {
  return useQuery({
    queryKey: ['programme-list', 'STATUT_FERME'],
    queryFn: () => api.get<RefItem[]>('/programme/lists/STATUT_FERME'),
    staleTime: 5 * 60_000,
  });
}

export function statusLabelOf(items: RefItem[] | undefined, code: string | null | undefined): string {
  if (!code) return 'Sans statut';
  return items?.find((i) => i.code === code)?.label ?? code;
}

/**
 * Changes a programme farm's status (`POST /programme/farms/:id/status`,
 * history kept by the server). A suspension needs a reason and blocks the
 * farm's sales (possible from any status, as on the server).
 * Reusable by the registry sheet (W2).
 */
export function FarmStatusModal({
  farm,
  onClose,
  onDone,
}: {
  farm: Pick<Farm, 'id' | 'name' | 'code' | 'statusCode' | 'statusSince'>;
  onClose: () => void;
  onDone?: () => void;
}) {
  const queryClient = useQueryClient();
  const items = useFarmStatusItems();
  const choices = statusChoices(items.data ?? [], farm.statusCode);
  const [statusCode, setStatusCode] = useState('');
  const [from, setFrom] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const chosen = choices.find((c) => c.code === statusCode);
  const today = todayIso();

  const save = useMutation({
    mutationFn: (body: object) => api.post(`/programme/farms/${farm.id}/status`, body),
    onSuccess: () => {
      // `farms` feeds the farm switcher and the header (status, « suspendue »).
      for (const key of ['farms', 'admin-farms', 'admin-metrics', 'programme-farms']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      onDone?.();
      onClose();
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = buildStatusPayload(
      { statusCode, from, reason },
      { items: items.data ?? [], statusCode: farm.statusCode, statusSince: farm.statusSince, today },
    );
    if ('error' in result) return setFormError(result.error);
    setFormError(null);
    save.mutate(result.body);
  };

  return (
    <Modal title={`Statut de la ferme${farm.code ? ` ${farm.code}` : ''}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{farm.name}</span> — statut actuel :{' '}
          <span className="font-semibold">{statusLabelOf(items.data, farm.statusCode)}</span>
          {farm.statusSince ? ` depuis le ${dateFr(farm.statusSince)}` : ''}.
        </p>
        <ErrorNote error={items.error} />
        <Field label="Nouveau statut">
          <select
            className={inputCls}
            value={statusCode}
            onChange={(e) => {
              setStatusCode(e.target.value);
              setFormError(null);
            }}
            required
          >
            <option value="">— Choisir —</option>
            {choices.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date d’effet" hint="Vide : maintenant. Jamais dans le futur.">
          <input type="date" className={inputCls} value={from} max={today} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field
          label={needsReason(chosen) ? 'Motif (obligatoire)' : 'Motif'}
          hint={needsReason(chosen) ? 'Une ferme suspendue ne peut plus vendre.' : undefined}
        >
          <textarea
            className={inputCls}
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required={needsReason(chosen)}
          />
        </Field>
        <ErrorNote error={formError ?? save.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={save.isPending}>
            Annuler
          </Button>
          <Button type="submit" tone={needsReason(chosen) ? 'danger' : 'primary'} busy={save.isPending} disabled={items.isLoading}>
            Enregistrer le statut
          </Button>
        </div>
      </form>
    </Modal>
  );
}

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, ShieldOff } from 'lucide-react';
import { api } from '../../api/client';
import type { RegistrySheet, SetVerificationBody } from '../../api/types-programme';
import { Button, ErrorNote, Field, inputCls, Modal } from '../form';
import { invalidateRegistry } from './queries';

/**
 * POUFA lot A droits (F8): « Vérifiée pour le Market », the condition for a
 * farm to publish. Entering the OPERATIONNELLE status verifies it; a profile
 * granted REGISTRE:VALIDER (the DGE by default) or the platform admin can
 * also verify or withdraw it by hand (`PUT /programme/farms/:farmId/verification`).
 */
export function VerificationSection({ sheet, canVerify }: { sheet: RegistrySheet; canVerify: boolean }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
      <p className="flex items-center gap-2 text-sm text-slate-700">
        {sheet.isVerified ? <BadgeCheck className="h-4 w-4 text-emerald-600" /> : <ShieldOff className="h-4 w-4 text-slate-400" />}
        Vérifiée pour le Market : <span className="font-semibold">{sheet.isVerified ? 'Oui' : 'Non'}</span>
      </p>
      {canVerify ? (
        <Button tone="secondary" onClick={() => setEditing(true)}>
          {sheet.isVerified ? 'Retirer la vérification' : 'Vérifier la ferme'}
        </Button>
      ) : null}
      {editing ? <VerificationModal sheet={sheet} onClose={() => setEditing(false)} /> : null}
    </div>
  );
}

function VerificationModal({ sheet, onClose }: { sheet: RegistrySheet; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const next = !sheet.isVerified;
  const save = useMutation({
    mutationFn: (body: SetVerificationBody) => api.put<RegistrySheet>(`/programme/farms/${sheet.id}/verification`, body),
    onSuccess: (updated) => {
      queryClient.setQueryData<RegistrySheet>(['programme-farm', sheet.id], updated);
      invalidateRegistry(queryClient, sheet.id);
      onClose();
    },
  });
  return (
    <Modal title={next ? 'Vérifier la ferme pour le Market' : 'Retirer la vérification'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ verified: next, ...(reason.trim() ? { reason: reason.trim() } : {}) });
        }}
      >
        <p className="text-sm text-slate-600">
          {next
            ? `${sheet.name} pourra publier ses annonces sur le Market.`
            : `Les annonces de ${sheet.name} ne seront plus visibles des acheteurs tant que la ferme n’est pas vérifiée à nouveau.`}
        </p>
        <Field label="Motif" hint="Inscrit au journal d’audit.">
          <textarea className={inputCls} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <ErrorNote error={save.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={save.isPending}>
            Annuler
          </Button>
          <Button type="submit" busy={save.isPending} tone={next ? 'primary' : 'danger'}>
            {next ? 'Vérifier' : 'Retirer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileUp } from 'lucide-react';
import { api } from '../../api/client';
import type { ImportJob, ImportJobType, ImportTemplate } from '../../api/types-admin';
import { Button, ErrorNote, Field, inputCls, Modal } from '../form';
import { storeJob } from './queries';
import { checkRecoveryFile, depositFormData, fileSizeLabel, IMPORT_TYPES, TYPE_LABELS } from './recovery';

/** `POST /programme/imports`: the file goes to staging and through the controls; nothing is written to the registry yet. */
export function DepositModal({ templates, onClose, onDeposited }: { templates: readonly ImportTemplate[]; onClose: () => void; onDeposited: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<ImportJobType>('AMI');
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const deposit = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('Choisissez un fichier.');
      return api.upload<ImportJob>('/programme/imports', depositFormData(file, file.name, { type, note, confirmDuplicate }));
    },
    onSuccess: (job) => {
      storeJob(queryClient, job);
      onDeposited(job.id);
    },
  });
  const template = templates.find((t) => t.type === type);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = checkRecoveryFile(file);
    setFileError(err);
    if (err) return;
    if (note.trim().length > 500) return setFileError('Note : 500 caractères au maximum.');
    deposit.mutate();
  };

  return (
    <Modal title="Déposer un fichier de reprise" onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Type de reprise">
          <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as ImportJobType)}>
            {IMPORT_TYPES.map((t) => (
              <option key={t} value={t}>
                {templates.find((x) => x.type === t)?.label ?? TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        {template ? <p className="text-xs text-slate-500">{template.description}</p> : null}
        <Field label="Fichier" hint="CSV (séparateur , ou ;, UTF-8 ou Latin-1) ou Excel .xlsx (première feuille), 5 Mo au plus.">
          <input
            type="file"
            accept=".csv,.txt,.xlsx,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className={inputCls}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              setFileError(f ? checkRecoveryFile(f) : null);
              deposit.reset();
            }}
          />
        </Field>
        {file && !fileError ? <p className="text-xs text-slate-500">{file.name} · {fileSizeLabel(file.size)}</p> : null}
        <Field label="Note" hint="Origine du fichier, campagne… (facultatif)">
          <input className={inputCls} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {type === 'AMI' ? (
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5" checked={confirmDuplicate} onChange={(e) => setConfirmDuplicate(e.target.checked)} />
            <span>Reprendre aussi les lignes signalées comme doublons probables d’une ferme existante (modifiable ensuite).</span>
          </label>
        ) : null}
        <p className="text-xs text-slate-500">
          Le fichier est analysé en zone de transit : rien n’est écrit au registre avant l’intégration, qui suit l’essai à blanc et sa
          validation.
        </p>
        <ErrorNote error={fileError ?? deposit.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={deposit.isPending}>
            Annuler
          </Button>
          <Button type="submit" busy={deposit.isPending}>
            <FileUp className="h-4 w-4" /> Déposer et contrôler
          </Button>
        </div>
      </form>
    </Modal>
  );
}

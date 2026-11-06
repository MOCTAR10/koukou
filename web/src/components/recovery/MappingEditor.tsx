import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Save } from 'lucide-react';
import { api } from '../../api/client';
import type { ImportJob } from '../../api/types-admin';
import { Button, ErrorNote, inputCls } from '../form';
import { DataTable, Td, Th } from '../ui';
import { reloadOnConflict, storeJob } from './queries';
import { duplicateTargets, mappingChanges, missingRequired } from './recovery';
import { StepError } from './StepError';

/**
 * Column mapping of a job (file header → field), `PUT …/:id/settings`: the
 * server analyses the file again and re-runs the controls (a job past its dry
 * run goes back to CONTROLE). AMI jobs also carry the duplicates option.
 */
export function MappingEditor({ job, canEdit }: { job: ImportJob; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const initial = Object.fromEntries(job.headers.map((h) => [h, job.columnMapping[h] ?? null])) as Record<string, string | null>;
  const [mapping, setMapping] = useState<Record<string, string | null>>(initial);
  const [confirmDuplicate, setConfirmDuplicate] = useState(job.options.confirmDuplicate);
  const [formError, setFormError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: { mapping?: Record<string, string | null>; confirmDuplicate?: boolean }) => api.put<ImportJob>(`/programme/imports/${job.id}/settings`, body),
    onSuccess: (next) => storeJob(queryClient, next),
    onError: (err) => reloadOnConflict(queryClient, job.id, err),
  });
  const missing = missingRequired(job.fields, mapping);
  const doubles = duplicateTargets(mapping);
  const label = (key: string) => job.fields.find((f) => f.key === key)?.label ?? key;

  const submit = () => {
    const changes = mappingChanges(initial, mapping);
    const dup = confirmDuplicate !== job.options.confirmDuplicate;
    if (!changes && !dup && job.status !== 'DEPOSE' && job.status !== 'ANALYSE') return setFormError('Aucune modification à enregistrer.');
    setFormError(null);
    save.mutate({ ...(changes ? { mapping: changes } : {}), ...(dup ? { confirmDuplicate } : {}) });
  };

  return (
    <div className="space-y-3">
      {job.mappingError ? (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {job.mappingError}
        </p>
      ) : null}
      {job.unknownColumns.length ? (
        <p className="text-xs text-slate-500">
          Colonnes non reconnues automatiquement : <span className="font-mono">{job.unknownColumns.join(', ')}</span>.
        </p>
      ) : null}
      <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
        <DataTable>
          <thead className="bg-slate-50">
            <tr>
              <Th>Colonne du fichier</Th>
              <Th>Champ de Fermia</Th>
            </tr>
          </thead>
          <tbody>
            {job.headers.map((h) => (
              <tr key={h} className="border-t border-slate-100">
                <Td>
                  <span className="font-mono text-xs">{h}</span>
                </Td>
                <Td label="Champ">
                  <select
                    className={inputCls}
                    disabled={!canEdit || save.isPending}
                    value={mapping[h] ?? ''}
                    aria-label={`Champ de la colonne ${h}`}
                    onChange={(e) => {
                      setMapping((m) => ({ ...m, [h]: e.target.value || null }));
                      setFormError(null);
                    }}
                  >
                    <option value="">— Ignorer cette colonne —</option>
                    {job.fields.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                        {f.required ? ' *' : ''} ({f.header})
                      </option>
                    ))}
                  </select>
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
      {missing.length ? (
        <p className="text-xs text-red-700">Champs obligatoires sans colonne : {missing.map((f) => f.label).join(', ')}.</p>
      ) : null}
      {doubles.length ? <p className="text-xs text-amber-800">Plusieurs colonnes vers le même champ : {doubles.map(label).join(', ')}.</p> : null}
      {job.type === 'AMI' ? (
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5" disabled={!canEdit} checked={confirmDuplicate} onChange={(e) => setConfirmDuplicate(e.target.checked)} />
          <span>Reprendre aussi les lignes signalées comme doublons probables d’une ferme existante.</span>
        </label>
      ) : null}
      {canEdit ? (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">Enregistrer relance l’analyse et les contrôles de toutes les lignes ; un essai à blanc déjà fait est à refaire.</p>
          <ErrorNote error={formError} />
          <StepError error={save.error} />
          <Button busy={save.isPending} onClick={submit}>
            <Save className="h-4 w-4" /> Enregistrer et contrôler
          </Button>
        </div>
      ) : null}
    </div>
  );
}

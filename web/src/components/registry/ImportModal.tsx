import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileUp, Upload } from 'lucide-react';
import { api } from '../../api/client';
import type { ImportOutcome, ImportReport } from '../../api/types-programme';
import { Pill } from '../flock/shared';
import { Button, ErrorNote, Field, inputCls, Modal } from '../form';
import { FilterChip } from '../sales/shared';
import { DataTable, Td, Th } from '../ui';
import { candidateTitle, scoreLabel } from './duplicates';
import {
  checkImportFile,
  FORMAT_LABEL,
  importFormData,
  linesOf,
  OUTCOME_LABEL,
  OUTCOME_TONE,
  outcomeCounts,
  summarizeImport,
} from './importReport';
import { invalidateRegistry } from './queries';

const OUTCOMES: ImportOutcome[] = ['A_CREER', 'CREEE', 'DEJA_PRESENTE', 'REJETEE'];

/**
 * CSV import of the farm list: a dry run first (nothing written), its report
 * line by line, then the real import of the same file, which writes every
 * creatable line in one transaction and answers the final report.
 */
export function ImportModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [filter, setFilter] = useState<ImportOutcome | ''>('');
  const [fileError, setFileError] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: (options: { dryRun: boolean; confirmDuplicate: boolean }) => {
      if (!file) throw new Error('Choisissez un fichier CSV.');
      return api.upload<ImportReport>('/programme/farms/import', importFormData(file, file.name, options));
    },
    onSuccess: (result) => {
      setReport(result);
      setFilter(result.dryRun ? '' : result.created > 0 ? 'CREEE' : '');
      if (!result.dryRun) invalidateRegistry(queryClient);
    },
  });

  const preview = (confirm: boolean) => {
    const error = checkImportFile(file);
    if (error) return setFileError(error);
    setFileError(null);
    setConfirmDuplicate(confirm);
    run.mutate({ dryRun: true, confirmDuplicate: confirm });
  };

  const summary = report ? summarizeImport(report) : null;
  const counts = report ? outcomeCounts(report) : null;
  const done = report && !report.dryRun;

  return (
    <Modal large title="Importer des fermes (CSV)" onClose={onClose}>
      <div className="space-y-5">
        {!done ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Deux formats sont reconnus : la <b>liste POUFA</b> (<span className="font-mono">numero,nom,province</span>, le numéro
              est ignoré) ou le <b>format complet</b> (<span className="font-mono">nom, province, localite, exploitant, telephone,
              amiRef, cohorte, capacite, latitude, longitude, statut</span>). Séparateur virgule ou point-virgule, UTF-8 ou Latin-1.
              Une ferme déjà au registre (même référence AMI, ou même nom dans la même province) n’est jamais créée deux fois.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Fichier" className="min-w-64 flex-1">
                <input
                  type="file"
                  accept=".csv,text/csv,.txt"
                  className={inputCls}
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setReport(null);
                    setFileError(null);
                    setConfirmDuplicate(false);
                    run.reset();
                  }}
                />
              </Field>
              <Button tone={report ? 'secondary' : 'primary'} busy={run.isPending && !!run.variables?.dryRun} onClick={() => preview(confirmDuplicate)}>
                <FileUp className="h-4 w-4" /> {report ? 'Relancer l’essai' : 'Essai à blanc'}
              </Button>
            </div>
            <ErrorNote error={fileError ?? run.error} />
          </div>
        ) : null}

        {report && summary && counts ? (
          <div className="space-y-3">
            <div
              className={
                done
                  ? 'flex items-start gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-200'
                  : 'rounded-xl bg-slate-50 p-4 text-sm text-slate-700 ring-1 ring-slate-200'
              }
            >
              {done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : null}
              <div className="space-y-1">
                <p className="font-semibold">{done ? 'Import terminé' : 'Essai à blanc : rien n’a été enregistré'}</p>
                <p>{summary.sentence}</p>
                <p className="text-xs text-slate-500">Format détecté : {FORMAT_LABEL[report.format]}.</p>
                {report.unknownColumns.length ? (
                  <p className="text-xs text-amber-800">
                    Colonnes non reconnues, ignorées : <span className="font-mono">{report.unknownColumns.join(', ')}</span>.
                  </p>
                ) : null}
              </div>
            </div>

            {!done && (summary.duplicateRejections > 0 || confirmDuplicate) ? (
              <label className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={confirmDuplicate}
                  disabled={run.isPending}
                  onChange={(e) => preview(e.target.checked)}
                />
                <span>
                  {confirmDuplicate
                    ? 'Les lignes qui ressemblent à une ferme existante (doublons probables) seront créées ; la confirmation est conservée sur chaque fiche.'
                    : `Créer aussi les ${summary.duplicateRejections} ligne(s) qui ressemblent à une ferme existante (doublons probables) ; la confirmation est conservée sur chaque fiche.`}{' '}
                  L’essai est relancé pour montrer le résultat.
                </span>
              </label>
            ) : null}

            <div className="flex flex-wrap gap-1.5">
              <FilterChip label="Toutes" count={report.lines.length} active={filter === ''} onClick={() => setFilter('')} />
              {OUTCOMES.filter((o) => counts[o] > 0).map((o) => (
                <FilterChip key={o} label={OUTCOME_LABEL[o]} count={counts[o]} active={filter === o} onClick={() => setFilter(filter === o ? '' : o)} />
              ))}
            </div>

            <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
              <DataTable>
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Ferme</Th>
                    <Th>Résultat</Th>
                    <Th>Détail</Th>
                  </tr>
                </thead>
                <tbody>
                  {linesOf(report, filter).map((l) => (
                    <tr key={l.line} className="border-t border-slate-100 align-top">
                      <Td>
                        <p className="font-medium text-slate-900">{l.name ?? <span className="text-slate-400">Sans nom</span>}</p>
                        <p className="font-mono text-xs text-slate-500">Ligne {l.line}</p>
                      </Td>
                      <Td label="Résultat">
                        <Pill tone={OUTCOME_TONE[l.outcome]}>{OUTCOME_LABEL[l.outcome]}</Pill>
                        {l.code ? <span className="ml-1.5 font-mono text-xs text-slate-500">{l.code}</span> : null}
                      </Td>
                      <Td label="Détail" className="text-xs text-slate-600">
                        {l.duplicates?.length ? (
                          <ul className="space-y-0.5">
                            {l.duplicates.map((d, i) => (
                              <li key={i}>
                                Ressemble à {candidateTitle(d)} ({scoreLabel(d.score)} : {d.reasons.join(', ')})
                              </li>
                            ))}
                          </ul>
                        ) : (
                          (l.reason ?? '')
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={run.isPending && run.variables?.dryRun === false}>
            {done ? 'Fermer' : 'Annuler'}
          </Button>
          {summary?.canImport ? (
            <Button
              busy={run.isPending && run.variables?.dryRun === false}
              disabled={run.isPending}
              onClick={() => run.mutate({ dryRun: false, confirmDuplicate })}
            >
              <Upload className="h-4 w-4" /> Importer {summary.created} ferme{summary.created > 1 ? 's' : ''}
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

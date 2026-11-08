import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { api } from '../../api/client';
import type { CorrectRowResult, ImportJob, ImportRow, ImportRowOutcome, ImportRowStatus } from '../../api/types-admin';
import { dateTimeFr, num } from '../../lib/format';
import { Pill } from '../flock/shared';
import { Button, ErrorNote, Field, inputCls, Modal } from '../form';
import { Card, DataTable, EmptyState, Loading, Td, Th } from '../ui';
import { jobVersion, reloadOnConflict, storeJob, useImportRows } from './queries';
import {
  correctionBody,
  correctionLines,
  OUTCOME_LABELS,
  OUTCOME_PHASE_LABELS,
  OUTCOME_TONES,
  REASON_MIN,
  ROW_STATUS_LABELS,
  ROW_STATUS_TONES,
  ROWS_PAGE_SIZE,
  rowOutcome,
  rowsQueryString,
} from './recovery';
import { StepError } from './StepError';

const STATUSES: ImportRowStatus[] = ['VALIDE', 'AVERTISSEMENT', 'ERREUR', 'EXCLUE'];
const OUTCOMES: ImportRowOutcome[] = ['INTEGREE', 'ENRICHIE', 'DEJA_PRESENTE', 'REJETEE', 'EXCLUE'];

/** The staging lines of a job, filtered by the server (status, outcome), with the correction of a line. */
export function RowsSection({ job, canCorrect }: { job: ImportJob; canCorrect: boolean }) {
  const [filters, setFilters] = useState<{ status: ImportRowStatus | ''; outcome: ImportRowOutcome | '' }>({ status: '', outcome: '' });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  const rows = useImportRows(job.id, rowsQueryString(filters, page), jobVersion(job));
  const data = rows.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const openRow = open !== null ? (data?.items.find((r) => r.line === open) ?? null) : null;
  const preview = job.fields.slice(0, 3);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="mr-auto text-sm font-semibold text-slate-800">Lignes du fichier</h2>
        <Field label="Contrôle">
          <select
            className={inputCls}
            value={filters.status}
            onChange={(e) => {
              setFilters((f) => ({ ...f, status: e.target.value as ImportRowStatus | '' }));
              setPage(1);
            }}
          >
            <option value="">Tous</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {ROW_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Résultat">
          <select
            className={inputCls}
            value={filters.outcome}
            onChange={(e) => {
              setFilters((f) => ({ ...f, outcome: e.target.value as ImportRowOutcome | '' }));
              setPage(1);
            }}
          >
            <option value="">Tous</option>
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABELS[o]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <ErrorNote error={rows.error} />
      {rows.isLoading ? (
        <div className="p-4">
          <Loading />
        </div>
      ) : !data?.items.length ? (
        <div className="p-4">
          <EmptyState message="Aucune ligne pour ces filtres." />
        </div>
      ) : (
        <DataTable>
          <thead className="bg-slate-50">
            <tr>
              <Th>Ligne</Th>
              {preview.map((f) => (
                <Th key={f.key} className="hidden lg:table-cell">
                  {f.label}
                </Th>
              ))}
              <Th>Contrôle</Th>
              <Th>Résultat</Th>
              <Th>Détail</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((r) => {
              const o = rowOutcome(r);
              return (
                <tr key={r.id} className="cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50" onClick={() => setOpen(r.line)}>
                  <Td>
                    <button
                      type="button"
                      className="text-left"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpen(r.line);
                      }}
                    >
                      <span className="font-mono text-xs font-semibold text-slate-700 hover:underline">L{r.line}</span>
                      {r.corrections.length ? <span className="block text-[11px] text-brand-700">corrigée ({r.corrections.length})</span> : null}
                    </button>
                  </Td>
                  {preview.map((f) => (
                    <Td key={f.key} label={f.label} className="md:max-lg:hidden">
                      <span className="text-xs">{r.values[f.key] ?? ''}</span>
                    </Td>
                  ))}
                  <Td label="Contrôle">
                    <Pill tone={ROW_STATUS_TONES[r.status]}>{ROW_STATUS_LABELS[r.status]}</Pill>
                  </Td>
                  <Td label="Résultat">
                    {o.outcome ? (
                      <>
                        <Pill tone={OUTCOME_TONES[o.outcome]}>{OUTCOME_LABELS[o.outcome]}</Pill>
                        <span className="block text-[11px] text-slate-500">{o.phase ? OUTCOME_PHASE_LABELS[o.phase] : ''}</span>
                      </>
                    ) : (
                      ''
                    )}
                  </Td>
                  <Td label="Détail" className="text-xs text-slate-600">
                    {[...r.errors, ...r.warnings].slice(0, 2).join(' ') || r.outcomeMessage || r.dryRunMessage || ''}
                  </Td>
                  <Td className="row-chevron w-8">
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
      {data && data.total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
          <span>
            {num(data.total, 0)} ligne{data.total > 1 ? 's' : ''} · {ROWS_PAGE_SIZE} par page
          </span>
          {pages > 1 ? (
            <div className="flex items-center gap-2">
              <Button tone="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Page précédente">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="tabular-nums">
                Page {num(page, 0)} / {num(pages, 0)}
              </span>
              <Button tone="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Page suivante">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {openRow ? <RowPanel job={job} row={openRow} canCorrect={canCorrect} onClose={() => setOpen(null)} /> : null}
    </Card>
  );
}

function RowPanel({
  job,
  row,
  canCorrect,
  onClose,
}: {
  job: ImportJob;
  row: ImportRow;
  canCorrect: boolean;
  onClose: () => void;
}) {
  const [correcting, setCorrecting] = useState(false);
  const o = rowOutcome(row);
  return (
    <Modal side wide title={`Ligne ${row.line}`} onClose={onClose}>
      <div className="space-y-5 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={ROW_STATUS_TONES[row.status]}>{ROW_STATUS_LABELS[row.status]}</Pill>
          {o.outcome ? <Pill tone={OUTCOME_TONES[o.outcome]}>{`${OUTCOME_LABELS[o.outcome]} (${o.phase ? OUTCOME_PHASE_LABELS[o.phase] : ''})`}</Pill> : null}
          {row.targetCode || row.dryRunCode ? <span className="font-mono text-xs text-slate-600">{row.targetCode ?? `${row.dryRunCode} (simulé)`}</span> : null}
        </div>
        {row.errors.length ? (
          <ul className="space-y-1 rounded-lg bg-red-50 px-3 py-2 text-red-800 ring-1 ring-red-200">
            {row.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        ) : null}
        {row.warnings.length ? (
          <ul className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200">
            {row.warnings.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        ) : null}
        {row.outcomeMessage || row.dryRunMessage ? <p className="text-slate-700">{row.outcomeMessage ?? row.dryRunMessage}</p> : null}

        {canCorrect && !correcting ? (
          <Button tone="secondary" onClick={() => setCorrecting(true)}>
            <Pencil className="h-4 w-4" /> Corriger ou exclure la ligne
          </Button>
        ) : null}
        {correcting ? <CorrectionForm job={job} row={row} onDone={() => setCorrecting(false)} /> : null}

        <section>
          <h3 className="mb-1.5 text-sm font-semibold text-slate-800">Valeurs retenues</h3>
          <dl className="grid grid-cols-[11rem_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg bg-slate-50 p-3 text-xs ring-1 ring-slate-200">
            {job.fields.map((f) => (
              <div key={f.key} className="contents">
                <dt className="text-slate-500">
                  {f.label}
                  {f.required ? ' *' : ''}
                </dt>
                <dd className="break-words text-slate-800">{row.values[f.key] ?? <span className="text-slate-400">—</span>}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h3 className="mb-1.5 text-sm font-semibold text-slate-800">Ligne brute du fichier</h3>
          <dl className="grid grid-cols-[11rem_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg p-3 text-xs ring-1 ring-slate-200">
            {Object.entries(row.raw).map(([h, v]) => (
              <div key={h} className="contents">
                <dt className="font-mono text-slate-500">{h}</dt>
                <dd className="break-words font-mono text-slate-700">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h3 className="mb-1.5 text-sm font-semibold text-slate-800">Corrections</h3>
          {row.corrections.length ? (
            <ol className="space-y-2 border-l-2 border-slate-200 pl-3">
              {row.corrections.map((c, i) => (
                <li key={i} className="text-xs">
                  <p className="text-slate-500">{dateTimeFr(c.at)} · auteur {c.byId.slice(0, 8)}…</p>
                  <p className="text-slate-700">Motif : {c.reason}</p>
                  <ul className="list-disc pl-4 text-slate-600">
                    {correctionLines(c, job.fields).map((l, j) => (
                      <li key={j}>{l}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-slate-500">Aucune correction : la ligne est telle que lue dans le fichier.</p>
          )}
        </section>
        {row.details && Object.keys(row.details).length ? (
          <details className="text-xs text-slate-600">
            <summary className="cursor-pointer font-semibold">Détails des contrôles</summary>
            <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2">{JSON.stringify(row.details, null, 2)}</pre>
          </details>
        ) : null}
        {row.sourceKey ? <p className="text-[11px] text-slate-500">Clé source : {row.sourceKey}</p> : null}
      </div>
    </Modal>
  );
}

function CorrectionForm({ job, row, onDone }: { job: ImportJob; row: ImportRow; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(job.fields.map((f) => [f.key, row.values[f.key] ?? ''])));
  const [exclude, setExclude] = useState(row.excluded);
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: object) => api.patch<CorrectRowResult>(`/programme/imports/${job.id}/rows/${row.line}`, body),
    onSuccess: (result) => {
      storeJob(queryClient, result.job);
      onDone();
    },
    onError: (err) => reloadOnConflict(queryClient, job.id, err),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const built = correctionBody(row, values, exclude, reason);
    if ('error' in built) return setFormError(built.error);
    setFormError(null);
    save.mutate(built.body);
  };

  return (
    <form className="space-y-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200" onSubmit={submit}>
      <p className="text-xs text-slate-500">
        Corrigez les valeurs retenues (vide = effacer) ou excluez la ligne. La ligne brute reste telle que lue ; la correction et son motif
        figurent au rapport. Les contrôles sont relancés{job.status === 'ESSAI' ? ' et l’essai à blanc est à refaire' : ''}.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {job.fields.map((f) => (
          <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`}>
            <input
              className={inputCls}
              disabled={exclude}
              value={values[f.key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          </Field>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={exclude} onChange={(e) => setExclude(e.target.checked)} />
        {row.excluded ? 'Ligne exclue (décochez pour la rétablir)' : 'Exclure cette ligne de la reprise'}
      </label>
      <Field label="Motif" hint={`${REASON_MIN} caractères au moins ; il figure au rapport de reprise.`}>
        <textarea className={inputCls} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <ErrorNote error={formError} />
      <StepError error={save.error} />
      <div className="flex justify-end gap-2">
        <Button tone="secondary" onClick={onDone} disabled={save.isPending}>
          Annuler
        </Button>
        <Button type="submit" busy={save.isPending}>
          Enregistrer la correction
        </Button>
      </div>
    </form>
  );
}

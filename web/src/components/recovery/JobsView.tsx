import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ChevronRight, Download, FileUp, Inbox } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { ImportJobStatus, ImportJobType, ImportTemplate } from '../../api/types-admin';
import { dateTimeFr, num } from '../../lib/format';
import { Pill } from '../flock/shared';
import { Button, ErrorNote, Field, inputCls } from '../form';
import { Card, DataTable, EmptyState, Loading, Td, Th } from '../ui';
import type { AdminRights } from '../admin/adminRights';
import { DepositModal } from './DepositModal';
import { useImportJobs, useImportTemplates } from './queries';
import { IMPORT_TYPES, STATUS_LABELS, STATUS_TONES, TYPE_LABELS } from './recovery';

/** Templates to download, the deposit, and every recovery job (newest first, 200 at most). */
export function JobsView({ rights }: { rights: AdminRights['recovery'] }) {
  const navigate = useNavigate();
  const templates = useImportTemplates();
  const [filters, setFilters] = useState<{ type: ImportJobType | ''; status: ImportJobStatus | '' }>({ type: '', status: '' });
  const jobs = useImportJobs(filters);
  const [depositing, setDepositing] = useState(false);
  const download = useMutation({ mutationFn: (t: ImportTemplate) => api.download(`/programme/imports/templates/${t.type}`, t.fileName) });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {(templates.data ?? []).map((t) => (
          <Card key={t.type} className="flex flex-col p-4">
            <p className="font-semibold text-slate-900">{t.label}</p>
            <p className="mt-1 flex-1 text-sm text-slate-600">{t.description}</p>
            <details className="mt-2 text-xs text-slate-600">
              <summary className="cursor-pointer font-semibold text-slate-700">
                {t.fields.length} colonnes ({t.fields.filter((f) => f.required).length} obligatoires)
              </summary>
              <ul className="mt-1 space-y-0.5">
                {t.fields.map((f) => (
                  <li key={f.key}>
                    <span className="font-mono">{f.header}</span> · {f.label}
                    {f.required ? <span className="text-red-600"> *</span> : null}
                  </li>
                ))}
              </ul>
            </details>
            <Button tone="secondary" className="mt-3 self-start" busy={download.isPending && download.variables?.type === t.type} onClick={() => download.mutate(t)}>
              <Download className="h-4 w-4" /> Modèle CSV
            </Button>
          </Card>
        ))}
      </div>
      {templates.isLoading ? <Loading /> : null}
      <ErrorNote error={templates.error ?? download.error} />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex flex-wrap gap-3">
            <Field label="Type">
              <select className={inputCls} value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as ImportJobType | '' }))}>
                <option value="">Tous</option>
                {IMPORT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Statut">
              <select className={inputCls} value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as ImportJobStatus | '' }))}>
                <option value="">Tous</option>
                {(Object.keys(STATUS_LABELS) as ImportJobStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {rights.deposit ? (
            <Button onClick={() => setDepositing(true)}>
              <FileUp className="h-4 w-4" /> Déposer un fichier
            </Button>
          ) : null}
        </div>
        <ErrorNote error={jobs.error} />
        {jobs.isLoading ? (
          <div className="p-4">
            <Loading />
          </div>
        ) : !jobs.data?.length ? (
          <div className="p-4">
            <EmptyState icon={<Inbox />} message="Aucun import de reprise pour l’instant." />
          </div>
        ) : (
          <DataTable>
            <thead className="bg-slate-50">
              <tr>
                <Th>Fichier</Th>
                <Th>Type</Th>
                <Th>Statut</Th>
                <Th>Lignes</Th>
                <Th className="hidden lg:table-cell">Déposé</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {jobs.data.map((j) => (
                <tr key={j.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => navigate(`/app/reprise/${j.id}`)}>
                  <Td>
                    <button
                      type="button"
                      className="text-left"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/app/reprise/${j.id}`);
                      }}
                    >
                      <span className="block break-all font-medium text-slate-900 hover:underline">{j.fileName}</span>
                      {j.note ? <span className="block text-xs text-slate-500">{j.note}</span> : null}
                    </button>
                  </Td>
                  <Td label="Type">
                    <span className="text-xs">{j.typeLabel || TYPE_LABELS[j.type]}</span>
                  </Td>
                  <Td label="Statut">
                    <Pill tone={STATUS_TONES[j.status]}>{STATUS_LABELS[j.status]}</Pill>
                  </Td>
                  <Td label="Lignes">
                    <span className="text-xs tabular-nums">
                      {num(j.counts.read, 0)} lues
                      {j.counts.errors ? <span className="text-red-700"> · {num(j.counts.errors, 0)} en erreur</span> : null}
                      {j.counts.integrated ? <span className="text-emerald-700"> · {num(j.counts.integrated, 0)} intégrées</span> : null}
                    </span>
                  </Td>
                  <Td label="Déposé" className="md:max-lg:hidden">
                    <span className="block text-xs">{dateTimeFr(j.createdAt)}</span>
                    {j.createdBy?.fullName ? <span className="block text-xs text-slate-500">{j.createdBy.fullName}</span> : null}
                  </Td>
                  <Td className="row-chevron w-8">
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>

      {depositing ? (
        <DepositModal
          templates={templates.data ?? []}
          onClose={() => setDepositing(false)}
          onDeposited={(id) => {
            setDepositing(false);
            navigate(`/app/reprise/${id}`);
          }}
        />
      ) : null}
    </div>
  );
}

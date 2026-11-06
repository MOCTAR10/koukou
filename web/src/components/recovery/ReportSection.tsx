import { useMutation } from '@tanstack/react-query';
import { Download, FileText, Fingerprint } from 'lucide-react';
import { api } from '../../api/client';
import type { ImportJob } from '../../api/types-admin';
import { dateTimeFr, num } from '../../lib/format';
import { Pill } from '../flock/shared';
import { Button, ErrorNote } from '../form';
import { Card, DataTable, Loading, Td, Th } from '../ui';
import { jobVersion, useImportReport } from './queries';
import { OUTCOME_LABELS, OUTCOME_TONES, ROW_STATUS_LABELS, ROW_STATUS_TONES } from './recovery';

const PHASE_LABELS = { CONTROLE: 'Rapport de contrôle', ESSAI: 'Rapport d’essai à blanc', REPRISE: 'Rapport de reprise' } as const;

/**
 * Recovery report (`GET …/:id/report`), with the PDF and CSV exports. The
 * fingerprint comes from the JSON report: the `X-Report-Fingerprint` header of
 * the downloads is not readable through `api.download`, and both carry the
 * same value for the same state of the job.
 */
export function ReportSection({ job }: { job: ImportJob }) {
  const enabled = job.status !== 'DEPOSE' && job.status !== 'ANALYSE';
  const report = useImportReport(job.id, jobVersion(job), enabled);
  const short = job.id.slice(0, 8);
  const download = useMutation({
    mutationFn: (kind: 'pdf' | 'csv') => api.download(`/programme/imports/${job.id}/report/${kind}`, `rapport-reprise-${short}.${kind}`),
  });
  if (!enabled) return null;
  const r = report.data;

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">{r ? PHASE_LABELS[r.phase] : 'Rapport'}</h2>
          {r ? <p className="text-xs text-slate-500">{r.title} · généré le {dateTimeFr(r.generatedAt)}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button tone="secondary" busy={download.isPending && download.variables === 'pdf'} onClick={() => download.mutate('pdf')}>
            <FileText className="h-4 w-4" /> PDF
          </Button>
          <Button tone="secondary" busy={download.isPending && download.variables === 'csv'} onClick={() => download.mutate('csv')}>
            <Download className="h-4 w-4" /> CSV ligne à ligne
          </Button>
        </div>
      </div>
      <ErrorNote error={report.error ?? download.error} />
      {report.isLoading ? <Loading /> : null}
      {r ? (
        <>
          <p className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
            <Fingerprint className="h-4 w-4 shrink-0 text-slate-500" />
            <span>Empreinte du rapport (SHA-256), identique sur le PDF et le CSV :</span>
            <span className="break-all font-mono text-slate-800">{r.fingerprint}</span>
          </p>
          <p className="text-xs text-slate-500">
            Fichier {r.job.fileName} · empreinte du fichier <span className="font-mono">{r.job.fileSha256.slice(0, 16)}…</span>
          </p>

          <section>
            <h3 className="mb-1.5 text-sm font-semibold text-slate-800">Lignes refusées ({num(r.rejected.length, 0)})</h3>
            {r.rejected.length ? (
              <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
                <DataTable>
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>Ligne</Th>
                      <Th>Libellé</Th>
                      <Th>Contrôle</Th>
                      <Th>Motif</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.rejected.slice(0, 200).map((l) => (
                      <tr key={l.line} className="border-t border-slate-100 align-top">
                        <Td>
                          <span className="font-mono text-xs">L{l.line}</span>
                        </Td>
                        <Td label="Libellé">{l.label}</Td>
                        <Td label="Contrôle">
                          <Pill tone={ROW_STATUS_TONES[l.status]}>{ROW_STATUS_LABELS[l.status]}</Pill>
                        </Td>
                        <Td label="Motif" className="text-xs text-slate-600">
                          {l.message ?? ''}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Aucune ligne refusée.</p>
            )}
            {r.rejected.length > 200 ? <p className="mt-1 text-xs text-slate-500">200 premières lignes : la liste complète est dans le CSV.</p> : null}
          </section>

          {r.corrections.length ? (
            <section>
              <h3 className="mb-1.5 text-sm font-semibold text-slate-800">Corrections ({num(r.corrections.length, 0)})</h3>
              <ul className="space-y-1.5 text-xs text-slate-700">
                {r.corrections.map((c, i) => (
                  <li key={i}>
                    <span className="font-mono">L{c.line}</span> · {dateTimeFr(c.at)} · {c.by} — {c.reason}
                    {c.changes.length ? <span className="text-slate-500"> ({c.changes.join(' ; ')})</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {r.targets.length ? (
            <section>
              <h3 className="mb-1.5 text-sm font-semibold text-slate-800">
                {r.phase === 'REPRISE' ? 'Fiches écrites au registre' : 'Fiches que l’intégration écrirait'} ({num(r.targets.length, 0)})
              </h3>
              <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
                <DataTable>
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>Code</Th>
                      <Th>Libellé</Th>
                      <Th>Résultat</Th>
                      <Th>Lignes</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.targets.slice(0, 200).map((t) => (
                      <tr key={`${t.code}-${t.outcome}`} className="border-t border-slate-100">
                        <Td>
                          <span className="font-mono text-xs">{t.code}</span>
                        </Td>
                        <Td label="Libellé">{t.label}</Td>
                        <Td label="Résultat">
                          <Pill tone={OUTCOME_TONES[t.outcome]}>{OUTCOME_LABELS[t.outcome]}</Pill>
                        </Td>
                        <Td label="Lignes" className="tabular-nums">
                          {num(t.lines, 0)}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </div>
              {r.targets.length > 200 ? <p className="mt-1 text-xs text-slate-500">200 premières fiches : la liste complète est dans le CSV.</p> : null}
            </section>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

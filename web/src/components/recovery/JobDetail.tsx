import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Circle, CircleSlash, Database, FlaskConical, XCircle } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { ImportJob, ImportJobCounts } from '../../api/types-admin';
import { classNames, dateTimeFr, num } from '../../lib/format';
import { Pill } from '../flock/shared';
import { Button, ErrorNote, Field, inputCls, Modal } from '../form';
import { Card, EmptyState, Loading } from '../ui';
import type { AdminRights } from '../admin/adminRights';
import { MappingEditor } from './MappingEditor';
import { reloadOnConflict, storeJob, useImportJob } from './queries';
import { canStep, fileSizeLabel, nextHint, REASON_MAX, reasonError, STATUS_LABELS, STATUS_TONES, stepperOf } from './recovery';
import { ReportSection } from './ReportSection';
import { RowsSection } from './RowsSection';
import { StepError } from './StepError';

type Dialog = 'validate' | 'integrate' | 'reject' | null;

const COUNT_LABELS: ReadonlyArray<[keyof ImportJobCounts, string]> = [
  ['read', 'Lignes lues'],
  ['valid', 'Valides'],
  ['warnings', 'Avertissements'],
  ['errors', 'En erreur'],
  ['excluded', 'Exclues'],
  ['corrected', 'Corrigées'],
  ['integrated', 'Intégrées'],
  ['enriched', 'Enrichies'],
  ['alreadyPresent', 'Déjà présentes'],
  ['rejected', 'Rejetées'],
];

/** A recovery job: stepper, counts, mapping, steps (buttons follow the server's `allowedSteps`), lines and report. */
export function JobDetail({ rights }: { rights: AdminRights['recovery'] }) {
  const { jobId = '' } = useParams();
  const job = useImportJob(jobId);
  if (job.isLoading) return <Loading />;
  if (job.error || !job.data) {
    const gone = job.error instanceof ApiError && (job.error.status === 404 || job.error.status === 403);
    return (
      <div className="space-y-3">
        <BackLink />
        {gone ? <EmptyState message={job.error instanceof ApiError ? job.error.message : 'Import introuvable.'} /> : <ErrorNote error={job.error} />}
      </div>
    );
  }
  return <JobBody job={job.data} rights={rights} />;
}

function BackLink() {
  return (
    <Link to="/app/reprise" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
      <ArrowLeft className="h-4 w-4" /> Tous les imports
    </Link>
  );
}

function JobBody({ job, rights }: { job: ImportJob; rights: AdminRights['recovery'] }) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [showMapping, setShowMapping] = useState(false);
  const dryRun = useMutation({
    mutationFn: () => api.post<ImportJob>(`/programme/imports/${job.id}/dry-run`, {}),
    onSuccess: (next) => storeJob(queryClient, next),
    onError: (err) => reloadOnConflict(queryClient, job.id, err),
  });
  const mappingStage = job.status === 'DEPOSE' || job.status === 'ANALYSE';
  const settingsAllowed = canStep(job, 'SETTINGS');
  const canDryRun = rights.deposit && canStep(job, 'DRY_RUN');
  const canValidate = rights.validate && canStep(job, 'VALIDATE');
  const canIntegrate = rights.integrate && canStep(job, 'INTEGRATE');
  const canReject = rights.reject && canStep(job, 'REJECT');
  const canCorrect = rights.edit && canStep(job, 'CORRECT');

  return (
    <div className="space-y-5">
      <BackLink />
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{job.typeLabel}</p>
            <h2 className="break-all text-lg font-semibold text-slate-900">{job.fileName}</h2>
            <p className="text-xs text-slate-500">
              {fileSizeLabel(job.fileSize)} · {job.encoding} · séparateur « {job.delimiter} » · déposé le {dateTimeFr(job.createdAt)}
              {job.createdBy?.fullName ? ` par ${job.createdBy.fullName}` : ''}
            </p>
            {job.note ? <p className="mt-1 text-sm text-slate-700">{job.note}</p> : null}
          </div>
          <Pill tone={STATUS_TONES[job.status]}>{STATUS_LABELS[job.status]}</Pill>
        </div>

        {job.warnings.map((w, i) => (
          <p key={i} className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {w}
          </p>
        ))}

        <Stepper job={job} />
        <p className="text-sm text-slate-700">{nextHint(job)}</p>

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {COUNT_LABELS.filter(([k]) => k === 'read' || job.counts[k] > 0).map(([k, label]) => (
            <div key={k} className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
              <dt className="text-[11px] text-slate-500">{label}</dt>
              <dd className={classNames('text-lg font-semibold tabular-nums', k === 'errors' || k === 'rejected' ? 'text-red-700' : 'text-slate-900')}>
                {num(job.counts[k], 0)}
              </dd>
            </div>
          ))}
        </dl>

        <StepInfo job={job} />

        {canDryRun || canValidate || canIntegrate || canReject ? (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {canDryRun ? (
              <Button busy={dryRun.isPending} onClick={() => dryRun.mutate()}>
                <FlaskConical className="h-4 w-4" /> {job.dryRunAt ? 'Refaire l’essai à blanc' : 'Lancer l’essai à blanc'}
              </Button>
            ) : null}
            {canValidate ? (
              <Button onClick={() => setDialog('validate')}>
                <CheckCircle2 className="h-4 w-4" /> Valider l’essai
              </Button>
            ) : null}
            {canIntegrate ? (
              <Button onClick={() => setDialog('integrate')}>
                <Database className="h-4 w-4" /> Intégrer au registre
              </Button>
            ) : null}
            {canReject ? (
              <Button tone="secondary" className="sm:ml-auto" onClick={() => setDialog('reject')}>
                <XCircle className="h-4 w-4" /> Rejeter l’import
              </Button>
            ) : null}
          </div>
        ) : null}
        {job.status === 'ESSAI' && !rights.validate ? (
          <p className="text-xs text-slate-500">La validation de l’essai est réservée à un profil habilité (Registre : valider).</p>
        ) : null}
        <StepError error={dryRun.error} />
      </Card>

      {settingsAllowed || mappingStage ? (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">Correspondance des colonnes</h2>
            {!mappingStage ? (
              <Button tone="secondary" onClick={() => setShowMapping((v) => !v)}>
                {showMapping ? 'Masquer' : 'Afficher'}
              </Button>
            ) : null}
          </div>
          {mappingStage || showMapping ? <MappingEditor key={job.id + String(job.analysedAt)} job={job} canEdit={rights.edit && settingsAllowed} /> : null}
        </Card>
      ) : null}

      {!mappingStage ? <RowsSection job={job} canCorrect={canCorrect} /> : null}
      <ReportSection job={job} />

      {dialog === 'validate' ? <ValidateDialog job={job} onClose={() => setDialog(null)} /> : null}
      {dialog === 'integrate' ? <IntegrateDialog job={job} onClose={() => setDialog(null)} /> : null}
      {dialog === 'reject' ? <RejectDialog job={job} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

function Stepper({ job }: { job: ImportJob }) {
  const steps = stepperOf(job);
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs">
      {steps.map((s, i) => (
        <li key={s.status} className="flex items-center gap-2">
          <span
            className={classNames(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ring-1',
              s.state === 'done' && 'bg-emerald-50 text-emerald-800 ring-emerald-200',
              s.state === 'current' && (s.status === 'REJETE' ? 'bg-red-50 text-red-800 ring-red-300' : 'bg-brand-50 text-brand-800 ring-brand-300'),
              s.state === 'todo' && 'bg-white text-slate-500 ring-slate-200',
              s.state === 'skipped' && 'bg-slate-50 text-slate-400 ring-slate-200 line-through',
            )}
            aria-current={s.state === 'current' ? 'step' : undefined}
          >
            {s.state === 'done' ? (
              <Check className="h-3.5 w-3.5" />
            ) : s.state === 'skipped' ? (
              <CircleSlash className="h-3.5 w-3.5" />
            ) : (
              <Circle className={classNames('h-3.5 w-3.5', s.state === 'current' && 'fill-current')} />
            )}
            {s.label}
          </span>
          {i < steps.length - 1 ? <span className="text-slate-300">→</span> : null}
        </li>
      ))}
    </ol>
  );
}

function StepInfo({ job }: { job: ImportJob }) {
  const lines: string[] = [];
  const who = (p: ImportJob['dryRunBy']) => (p?.fullName ? ` par ${p.fullName}` : '');
  if (job.dryRunAt) lines.push(`Essai à blanc le ${dateTimeFr(job.dryRunAt)}${who(job.dryRunBy)}.`);
  if (job.validatedAt) lines.push(`Validé le ${dateTimeFr(job.validatedAt)}${who(job.validatedBy)}${job.validationComment ? ` : « ${job.validationComment} »` : '.'}`);
  if (job.integratedAt) lines.push(`Intégré le ${dateTimeFr(job.integratedAt)}${who(job.integratedBy)}.`);
  if (job.rejectedAt) lines.push(`Rejeté le ${dateTimeFr(job.rejectedAt)}${who(job.rejectedBy)} : « ${job.rejectionReason ?? ''} »`);
  if (!lines.length) return null;
  return (
    <ul className="space-y-0.5 text-xs text-slate-600">
      {lines.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  );
}

/** A step dialog: posts, stores the answer, reloads the job on a 409. */
function useStep(job: ImportJob, path: string, onDone: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: object) => api.post<ImportJob>(`/programme/imports/${job.id}/${path}`, body),
    onSuccess: (next) => {
      storeJob(queryClient, next);
      onDone();
    },
    onError: (err) => reloadOnConflict(queryClient, job.id, err),
  });
}

function ValidateDialog({ job, onClose }: { job: ImportJob; onClose: () => void }) {
  const [comment, setComment] = useState('');
  const step = useStep(job, 'validate', onClose);
  return (
    <Modal title="Valider l’essai à blanc" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          step.mutate(comment.trim() ? { comment: comment.trim() } : {});
        }}
      >
        <p className="text-sm text-slate-700">
          Vous validez ce que l’essai à blanc a montré : {num(job.counts.read, 0)} lignes lues, {num(job.counts.errors, 0)} en erreur,{' '}
          {num(job.counts.excluded, 0)} exclues. L’intégration pourra ensuite être lancée.
        </p>
        <Field label="Commentaire" hint="Facultatif ; il figure au rapport de reprise.">
          <textarea className={inputCls} rows={3} maxLength={REASON_MAX} value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
        <StepError error={step.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={step.isPending}>
            Annuler
          </Button>
          <Button type="submit" busy={step.isPending}>
            Valider
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function IntegrateDialog({ job, onClose }: { job: ImportJob; onClose: () => void }) {
  const step = useStep(job, 'integrate', onClose);
  return (
    <Modal title="Intégrer au registre" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-700">
          L’intégration écrit au registre, en une seule transaction, les lignes que l’essai à blanc a validées. Les lignes refusées sont
          signalées avec leur motif dans le rapport. Cette opération ne se défait pas depuis l’écran.
        </p>
        {job.warnings.length ? (
          <ul className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
            {job.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        ) : null}
        <StepError error={step.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={step.isPending}>
            Annuler
          </Button>
          <Button busy={step.isPending} onClick={() => step.mutate({})}>
            <Database className="h-4 w-4" /> Intégrer
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RejectDialog({ job, onClose }: { job: ImportJob; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const step = useStep(job, 'reject', onClose);
  return (
    <Modal title="Rejeter l’import" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const err = reasonError(reason, 'Le motif du rejet');
          setFormError(err);
          if (!err) step.mutate({ reason: reason.trim() });
        }}
      >
        <p className="text-sm text-slate-700">Rien n’est écrit au registre ; l’import et son rapport restent consultables. Pour recommencer, déposez le fichier corrigé.</p>
        <Field label="Motif du rejet">
          <textarea className={inputCls} rows={3} maxLength={REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <ErrorNote error={formError} />
        <StepError error={step.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={step.isPending}>
            Annuler
          </Button>
          <Button type="submit" tone="danger" busy={step.isPending}>
            Rejeter
          </Button>
        </div>
      </form>
    </Modal>
  );
}

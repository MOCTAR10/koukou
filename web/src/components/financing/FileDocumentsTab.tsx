import { useRef, useState } from 'react';
import { Check, Download, ExternalLink, FileSpreadsheet, FileUp, TriangleAlert, X } from 'lucide-react';
import { api } from '../../api/client';
import type { ChecklistLine, FinancingFile } from '../../api/types-financing';
import { useMenuAccess } from '../../app/useMenuAccess';
import { dateFr, plural } from '../../lib/format';
import { Button, DateInput, ErrorNote, Field, Modal, inputCls, todayIso } from '../form';
import { StatusBadge } from '../ui';
import { PeriodPicker, usePeriodState } from './FinancialsBlock';
import { isFinancialStatementsRequirement, lowCoverageLine, periodFor } from './financialsLogic';
import {
  PROVIDER_LABELS,
  SATISFIED_BY_CONSENT,
  SOURCE_LABELS,
  acceptAttr,
  addMonthsIso,
  captureHint,
  expiryText,
  formatsText,
  providerOf,
  satisfiedWithoutDocument,
  validityText,
  type DocumentX,
  type RequirementX,
} from './documentsLogic';
import { ReasonModal } from './Dialogs';
import {
  DOC_STATE_LABELS,
  DOC_STATE_TONES,
  DOC_STATUS_LABELS,
  formatBytes,
  groupChecklist,
} from './financingLogic';
import { documentUrl, openFile, useFarmFinancials, useFileAction } from './queries';
import { FilePick, SectionTitle } from './shared';

const DOC_TONES = { DEPOSE: 'info', VALIDE: 'ok', REJETE: 'danger' } as const;

function DocumentRow({ file, doc: raw }: { file: FinancingFile; doc: FinancingFile['otherDocuments'][number] }) {
  const doc = raw as DocumentX;
  const action = useFileAction<{ status: 'VALIDE' | 'REJETE'; reason?: string }>(file.id);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const path = documentUrl(file.id, doc.id);
  const review = (status: 'VALIDE' | 'REJETE', reason?: string, done?: () => void) =>
    action.mutate({ path: `documents/${doc.id}/review`, body: { status, reason } }, { onSuccess: done });

  return (
    <li className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200/70">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1 break-all text-sm font-medium text-slate-800">
          {doc.fileName}
        </span>
        {doc.expired ? <StatusBadge tone="danger" label="Expirée" /> : null}
        <StatusBadge tone={DOC_TONES[doc.status]} label={DOC_STATUS_LABELS[doc.status]} />
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        {doc.source ? <span className="font-medium text-slate-700">{SOURCE_LABELS[doc.source]} · </span> : null}
        {formatBytes(doc.sizeBytes)} · déposé le {dateFr(doc.uploadedAt)}
        {doc.uploadedByName ? ` par ${doc.uploadedByName}` : ''}
        {doc.reviewedAt ? ` · examiné le ${dateFr(doc.reviewedAt)}${doc.reviewedByName ? ` par ${doc.reviewedByName}` : ''}` : ''}
      </p>
      {expiryText({ expiresOn: doc.expiresOn ?? null, expired: !!doc.expired }) ? (
        <p className={doc.expired ? 'mt-1 text-sm font-medium text-red-700' : 'mt-0.5 text-xs text-slate-500'}>
          {doc.issuedOn ? `Délivrée le ${dateFr(doc.issuedOn)} · ` : ''}
          {expiryText({ expiresOn: doc.expiresOn ?? null, expired: !!doc.expired })}
        </p>
      ) : null}
      {doc.status === 'REJETE' && doc.rejectReason ? <p className="mt-1 text-sm text-red-700">Motif du rejet : {doc.rejectReason}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-white"
          onClick={() => openFile(path).catch(setError)}
        >
          <ExternalLink className="h-3.5 w-3.5" /> Ouvrir
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-white"
          onClick={() => api.download(path, doc.fileName).catch(setError)}
        >
          <Download className="h-3.5 w-3.5" /> Télécharger
        </button>
        {file.rights.validate && doc.status !== 'VALIDE' ? (
          <button
            type="button"
            disabled={action.isPending}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-white disabled:opacity-60"
            onClick={() => review('VALIDE')}
          >
            <Check className="h-3.5 w-3.5" /> Valider
          </button>
        ) : null}
        {file.rights.validate && doc.status !== 'REJETE' ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-700 hover:bg-white"
            onClick={() => setRejecting(true)}
          >
            <X className="h-3.5 w-3.5" /> Rejeter
          </button>
        ) : null}
      </div>
      <ErrorNote error={error ?? action.error} />
      {rejecting ? (
        <ReasonModal
          title="Rejeter le document"
          intro={doc.fileName}
          label="Motif du rejet"
          confirm="Rejeter le document"
          tone="danger"
          busy={action.isPending}
          error={action.error}
          onSubmit={(reason) => review('REJETE', reason, () => setRejecting(false))}
          onClose={() => setRejecting(false)}
        />
      ) : null}
    </li>
  );
}

/** Choose the file, give its issue date (the expiry follows from the validity of the requirement), then file it. */
function IssueDateModal({ fileId, requirement, onClose }: { fileId: string; requirement: RequirementX; onClose: () => void }) {
  const action = useFileAction(fileId);
  const [picked, setPicked] = useState<File | null>(null);
  const [issuedOn, setIssuedOn] = useState(todayIso());
  const months = requirement.validityMonths ?? 0;
  return (
    <Modal title="Déposer une pièce avec une date" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!picked || !issuedOn) return;
          const form = new FormData();
          form.append('file', picked);
          form.append('requirementId', requirement.id);
          form.append('issuedOn', issuedOn);
          action.mutate({ path: 'documents', body: form }, { onSuccess: onClose });
        }}
      >
        <p className="text-sm text-slate-700">
          {requirement.label} : valable {validityText(requirement.validityMonths)} à partir de sa date de délivrance. Formats : {formatsText(requirement.formats)}.
        </p>
        <Field label="Fichier">
          <FilePick file={picked} onPick={setPicked} accept={acceptAttr(requirement.formats)} />
        </Field>
        <Field label="Date de délivrance">
          <DateInput value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} max={todayIso()} required />
        </Field>
        {issuedOn ? <p className="text-sm text-slate-600">Valable jusqu’au {dateFr(addMonthsIso(issuedOn, months))}.</p> : null}
        <ErrorNote error={action.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" busy={action.isPending} disabled={!picked || !issuedOn}>
            Déposer
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Upload straight from the line: the file is sent as soon as it is chosen, unless the piece expires (issue date first). */
function UploadButton({ fileId, requirement, label }: { fileId: string; requirement: RequirementX; label: string }) {
  const action = useFileAction(fileId);
  const input = useRef<HTMLInputElement>(null);
  const [dated, setDated] = useState(false);
  const withDate = requirement.validityMonths != null;
  return (
    <span className="inline-flex flex-col gap-1">
      <input
        ref={input}
        type="file"
        accept={acceptAttr(requirement.formats)}
        capture={captureHint(requirement.formats)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const form = new FormData();
          form.append('file', f);
          form.append('requirementId', requirement.id);
          action.mutate({ path: 'documents', body: form });
          e.target.value = '';
        }}
      />
      <Button tone="secondary" className="whitespace-nowrap" busy={action.isPending} onClick={() => (withDate ? setDated(true) : input.current?.click())}>
        <FileUp className="h-4 w-4" /> {label}
      </Button>
      <ErrorNote error={action.error} />
      {dated ? <IssueDateModal fileId={fileId} requirement={requirement} onClose={() => setDated(false)} /> : null}
    </span>
  );
}

/** Fermia files its own financial statements (PDF of the farm's SYSCOHADA bookkeeping) under the requirement. */
function AttachStatementsModal({ file, label, onClose }: { file: FinancingFile; label: string; onClose: () => void }) {
  const action = useFileAction<{ from: string; to: string }>(file.id);
  const state = usePeriodState();
  const p = state.period;
  const figures = useFarmFinancials(file.farmId, p?.from ?? '', p?.to ?? '', !!p).data;
  const warning = figures ? lowCoverageLine(figures.reliability) : null;
  // A thin period is filed only after an explicit second confirmation showing the figure.
  const [confirming, setConfirming] = useState(false);
  const file_ = () => {
    if (p) action.mutate({ path: 'financial-statements', body: p }, { onSuccess: onClose });
  };
  return (
    <Modal title="Joindre les états financiers Fermia" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (warning && !confirming) setConfirming(true);
          else file_();
        }}
      >
        <p className="text-sm text-slate-700">
          Fermia produit le PDF des états financiers de {file.farmName} sur la période choisie et le dépose sous « {label} ». Ces états sont issus de la saisie de l’exploitation, non audités.
        </p>
        <PeriodPicker
          state={{
            ...state,
            setPreset: (v) => {
              setConfirming(false);
              state.setPreset(v);
            },
            setCustom: (v) => {
              setConfirming(false);
              state.setCustom(v);
            },
          }}
          idPrefix="attach"
        />
        {confirming && warning ? (
          <div role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            <p className="flex items-start gap-2 font-semibold">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {warning}
            </p>
            <p className="mt-1">
              L’exploitation n’a saisi que {figures!.reliability.coveragePct.toLocaleString('fr-FR')} % des jours de la période (minimum du programme : {figures!.reliability.coverageMinPct.toLocaleString('fr-FR')} %). Le PDF portera cet
              avertissement en première page. Voulez-vous le joindre quand même ?
            </p>
          </div>
        ) : null}
        <ErrorNote error={action.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={confirming ? () => setConfirming(false) : onClose}>
            {confirming ? 'Retour' : 'Annuler'}
          </Button>
          <Button type="submit" busy={action.isPending} disabled={!p}>
            {confirming ? 'Joindre malgré une saisie incomplète' : 'Joindre'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** The action only exists when the farm opened its accounting; otherwise one line says why. */
function AttachStatementsButton({ farmId, onClick }: { farmId: string; onClick: () => void }) {
  const period = periodFor('MONTHS_12');
  const opened = useFarmFinancials(farmId, period.from, period.to).data?.initialized;
  if (opened === false) return <p className="text-sm text-slate-600">Cette exploitation n’a pas ouvert sa comptabilité dans Fermia.</p>;
  return (
    <Button tone="secondary" className="whitespace-nowrap" onClick={onClick}>
      <FileSpreadsheet className="h-4 w-4" /> Joindre les états financiers Fermia
    </Button>
  );
}

function Line({ file, line }: { file: FinancingFile; line: ChecklistLine }) {
  const r = line.requirement as RequirementX;
  const { financing } = useMenuAccess();
  const [attaching, setAttaching] = useState(false);
  const satisfied = satisfiedWithoutDocument(line);
  const canAttach = file.rights.create && financing.financials && r.active && isFinancialStatementsRequirement(r);
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">
            {r.label}
            {!r.active ? <span className="ml-2 text-xs font-normal text-slate-500">(retirée de la liste)</span> : null}
          </p>
          <p className="text-xs text-slate-500">
            {r.required ? 'Obligatoire' : 'Facultative'}
            {r.legalBasis ? ` · ${r.legalBasis}` : ''}
            {` · Fournie par ${PROVIDER_LABELS[providerOf(r)]}`}
            {r.validityMonths != null ? ` · valable ${validityText(r.validityMonths)}` : ''}
          </p>
          {r.help ? <p className="mt-0.5 text-xs text-slate-500">{r.help}</p> : null}
        </div>
        <StatusBadge tone={DOC_STATE_TONES[line.state]} label={DOC_STATE_LABELS[line.state]} />
      </div>
      <div className="flex flex-wrap items-start gap-2 empty:hidden">
        {satisfied ? <p className="text-sm text-emerald-800">{SATISFIED_BY_CONSENT}</p> : null}
        {file.rights.create && r.active && !satisfied ? (
          <UploadButton fileId={file.id} requirement={r} label={line.documents.length ? 'Ajouter une version' : 'Déposer'} />
        ) : null}
        {canAttach ? <AttachStatementsButton farmId={file.farmId} onClick={() => setAttaching(true)} /> : null}
      </div>
      {line.documents.length > 0 ? (
        <ul className="space-y-2">
          {line.documents.map((d) => (
            <DocumentRow key={d.id} file={file} doc={d} />
          ))}
        </ul>
      ) : null}
      {attaching ? <AttachStatementsModal file={file} label={r.label} onClose={() => setAttaching(false)} /> : null}
    </li>
  );
}

function OtherDocumentModal({ file, onClose }: { file: FinancingFile; onClose: () => void }) {
  const action = useFileAction(file.id);
  const [label, setLabel] = useState('');
  const [picked, setPicked] = useState<File | null>(null);
  return (
    <Modal title="Ajouter un autre document" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!picked) return;
          const form = new FormData();
          form.append('file', picked);
          form.append('label', label.trim());
          action.mutate({ path: 'documents', body: form }, { onSuccess: onClose });
        }}
      >
        <Field label="Intitulé du document">
          <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={160} autoFocus />
        </Field>
        <Field label="Fichier">
          <FilePick file={picked} onPick={setPicked} />
        </Field>
        <ErrorNote error={action.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" busy={action.isPending} disabled={!picked || label.trim().length < 2}>
            Déposer
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** The bank's checklist applied to this file, grouped by step, and the documents outside it. */
export function FileDocumentsTab({ file }: { file: FinancingFile }) {
  const groups = groupChecklist(file.checklist);
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-6">
      {groups.length === 0 ? <p className="text-sm text-slate-500">La liste des pièces de la BCEG est vide : ajoutez-les dans « Pièces et cadre ».</p> : null}
      {groups.map((g) => (
        <section key={g.step} aria-label={g.label}>
          <SectionTitle
            action={
              <span className="text-xs text-slate-500">
                {g.required > 0 ? `${g.provided} sur ${plural(g.required, 'pièce obligatoire', 'pièces obligatoires')}` : 'Aucune pièce obligatoire'}
              </span>
            }
          >
            {g.label}
          </SectionTitle>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-3">
            {g.lines.map((l) => (
              <Line key={l.requirement.id} file={file} line={l} />
            ))}
          </ul>
        </section>
      ))}

      <section aria-label="Autres documents">
        <SectionTitle
          action={
            file.rights.create ? (
              <Button tone="secondary" onClick={() => setAdding(true)}>
                <FileUp className="h-4 w-4" /> Ajouter
              </Button>
            ) : null
          }
        >
          Autres documents
        </SectionTitle>
        {file.otherDocuments.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun document hors liste.</p>
        ) : (
          <div className="space-y-2">
            {file.otherDocuments.map((d) => (
              <div key={d.id}>
                <p className="mb-0.5 text-xs font-medium text-slate-600">{d.label}</p>
                <ul>
                  <DocumentRow file={file} doc={d} />
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
      {adding ? <OtherDocumentModal file={file} onClose={() => setAdding(false)} /> : null}
    </div>
  );
}
